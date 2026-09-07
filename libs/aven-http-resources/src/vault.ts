import { z } from 'zod'
import {
	type HttpMethod,
	type HttpRequestArtifact,
	httpRequestDigest,
	parseHttpRequestArtifact
} from './contracts'

const HTTP_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const FORBIDDEN_ATTACHMENT_HEADERS = new Set([
	'connection',
	'content-length',
	'forwarded',
	'host',
	'if-modified-since',
	'if-none-match',
	'proxy-authorization',
	'transfer-encoding',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto'
])

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0
		if (codePoint <= 0x1f || codePoint === 0x7f) return true
	}
	return false
}

const attachmentSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('header'),
			name: z.string().min(1).max(128),
			prefix: z.string().max(256).default('')
		})
		.strict(),
	z.object({ kind: z.literal('cookie'), name: z.string().min(1).max(128) }).strict(),
	z.object({ kind: z.literal('query'), name: z.string().min(1).max(128) }).strict()
])

const hostMatcherSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('exact'), value: z.string().min(1).max(253) }).strict(),
	z.object({ kind: z.literal('suffix'), value: z.string().min(1).max(253) }).strict()
])

const bindingSchema = z
	.object({
		bindingRef: z.uuid(),
		label: z.string().trim().min(1).max(256),
		ownerSubjectId: z.uuid(),
		credentialRef: z.uuid(),
		placements: z
			.array(z.enum(['local', 'server']))
			.min(1)
			.max(2),
		schemes: z
			.array(z.enum(['https', 'http']))
			.min(1)
			.max(2),
		host: hostMatcherSchema,
		ports: z.array(z.number().int().min(1).max(65_535)).min(1).max(32),
		pathPrefix: z.string().min(1).max(2_048),
		methods: z
			.array(z.enum(['GET', 'HEAD']))
			.min(1)
			.max(2),
		purpose: z.string().trim().min(1).max(128),
		attachment: attachmentSchema,
		enabled: z.boolean().default(true)
	})
	.strict()

export type CredentialAttachmentRule = z.infer<typeof attachmentSchema>
export type CredentialBinding = z.infer<typeof bindingSchema>

export interface RedactedCredentialBinding {
	bindingRef: string
	label: string
	credentialRef: string
	placements: Array<'local' | 'server'>
	schemes: Array<'https' | 'http'>
	host: { kind: 'exact' | 'suffix'; value: string }
	ports: number[]
	pathPrefix: string
	methods: HttpMethod[]
	purpose: string
	attachment: CredentialAttachmentRule
	enabled: boolean
}

export interface VaultCredentialMetadata {
	credentialRef: string
	label: string
	version: number
	enabled: boolean
	createdAt: string
	updatedAt: string
}

export interface VaultMetadata {
	credentials: VaultCredentialMetadata[]
	bindings: RedactedCredentialBinding[]
}

export interface VaultSessionContext {
	tenantId: string
	subjectId: string
	sessionId: string
	executionEnvironment: 'local' | 'server'
}

export type VaultMatch =
	| { outcome: 'none' }
	| { outcome: 'ambiguous'; bindingRefs: string[] }
	| {
			outcome: 'matched'
			binding: RedactedCredentialBinding
			credentialRef: string
			secretVersion: number
	  }

/** Host-only value. Callers must pass it directly to a trusted transport and discard it. */
export interface RequestScopedCredentialAttachment {
	bindingRef: string
	credentialRef: string
	secretVersion: number
	requestDigest: string
	rule: CredentialAttachmentRule
	secret: string
}

export interface SessionVaultClient {
	match(request: HttpRequestArtifact, context: VaultSessionContext): Promise<VaultMatch>
	resolveForUse(input: {
		bindingRef: string
		request: HttpRequestArtifact
		requestDigest: string
		runId: string
		stepId: string
		context: VaultSessionContext
	}): Promise<RequestScopedCredentialAttachment>
}

export interface VaultAdministration {
	setCredential(input: {
		ownerSubjectId: string
		label: string
		secret: string
		credentialRef?: string
	}): Promise<VaultCredentialMetadata>
	rotateCredential(input: {
		ownerSubjectId: string
		credentialRef: string
		secret: string
	}): Promise<VaultCredentialMetadata>
	revokeCredential(ownerSubjectId: string, credentialRef: string): Promise<VaultCredentialMetadata>
	putBinding(input: CredentialBinding): Promise<RedactedCredentialBinding>
	revokeBinding(ownerSubjectId: string, bindingRef: string): Promise<RedactedCredentialBinding>
	metadata(ownerSubjectId: string): Promise<VaultMetadata>
}

export interface MemoryCustomerVaultOptions {
	tenantId: string
	now?: () => Date
}

interface StoredCredential extends VaultCredentialMetadata {
	ownerSubjectId: string
	secret: string
}

interface VaultState {
	credentials: Map<string, StoredCredential>
	bindings: Map<string, CredentialBinding>
}

/**
 * Test/local adapter with the same split surface as the customer Vault service.
 * Administration can set but never read a secret; only the session client can resolve one use.
 */
export function createMemoryCustomerVault(options: MemoryCustomerVaultOptions): {
	administration: VaultAdministration
	sessions: SessionVaultClient
} {
	const tenantId = z.uuid().parse(options.tenantId)
	const state: VaultState = { credentials: new Map(), bindings: new Map() }
	return {
		administration: new MemoryVaultAdministration(state, options.now ?? (() => new Date())),
		sessions: new MemorySessionVault(state, tenantId)
	}
}

class MemoryVaultAdministration implements VaultAdministration {
	constructor(
		private readonly state: VaultState,
		private readonly now: () => Date
	) {}

	async setCredential(input: {
		ownerSubjectId: string
		label: string
		secret: string
		credentialRef?: string
	}): Promise<VaultCredentialMetadata> {
		const ownerSubjectId = z.uuid().parse(input.ownerSubjectId)
		const credentialRef = z.uuid().parse(input.credentialRef ?? crypto.randomUUID())
		if (this.state.credentials.has(credentialRef)) throw new VaultError('VAULT_CREDENTIAL_EXISTS')
		const label = z.string().trim().min(1).max(256).parse(input.label)
		const secret = secretValue(input.secret)
		const timestamp = this.now().toISOString()
		const credential: StoredCredential = {
			credentialRef,
			ownerSubjectId,
			label,
			secret,
			version: 1,
			enabled: true,
			createdAt: timestamp,
			updatedAt: timestamp
		}
		this.state.credentials.set(credentialRef, credential)
		return credentialMetadata(credential)
	}

	async rotateCredential(input: {
		ownerSubjectId: string
		credentialRef: string
		secret: string
	}): Promise<VaultCredentialMetadata> {
		const credential = ownedCredential(this.state, input.ownerSubjectId, input.credentialRef)
		credential.secret = secretValue(input.secret)
		credential.version += 1
		credential.enabled = true
		credential.updatedAt = this.now().toISOString()
		return credentialMetadata(credential)
	}

	async revokeCredential(
		ownerSubjectId: string,
		credentialRef: string
	): Promise<VaultCredentialMetadata> {
		const credential = ownedCredential(this.state, ownerSubjectId, credentialRef)
		credential.enabled = false
		credential.updatedAt = this.now().toISOString()
		return credentialMetadata(credential)
	}

	async putBinding(input: CredentialBinding): Promise<RedactedCredentialBinding> {
		const binding = normalizeBinding(input)
		ownedCredential(this.state, binding.ownerSubjectId, binding.credentialRef)
		const existing = this.state.bindings.get(binding.bindingRef)
		if (existing && existing.ownerSubjectId !== binding.ownerSubjectId) {
			throw new VaultError('VAULT_BINDING_NOT_FOUND')
		}
		this.state.bindings.set(binding.bindingRef, binding)
		return redactedBinding(binding)
	}

	async revokeBinding(
		ownerSubjectId: string,
		bindingRef: string
	): Promise<RedactedCredentialBinding> {
		const binding = ownedBinding(this.state, ownerSubjectId, bindingRef)
		binding.enabled = false
		return redactedBinding(binding)
	}

	async metadata(ownerSubjectId: string): Promise<VaultMetadata> {
		const subject = z.uuid().parse(ownerSubjectId)
		return {
			credentials: [...this.state.credentials.values()]
				.filter((credential) => credential.ownerSubjectId === subject)
				.map(credentialMetadata)
				.sort((left, right) => left.credentialRef.localeCompare(right.credentialRef)),
			bindings: [...this.state.bindings.values()]
				.filter((binding) => binding.ownerSubjectId === subject)
				.map(redactedBinding)
				.sort((left, right) => left.bindingRef.localeCompare(right.bindingRef))
		}
	}
}

class MemorySessionVault implements SessionVaultClient {
	constructor(
		private readonly state: VaultState,
		private readonly tenantId: string
	) {}

	async match(request: HttpRequestArtifact, context: VaultSessionContext): Promise<VaultMatch> {
		assertSessionContext(context, this.tenantId)
		const normalized = parseHttpRequestArtifact(request, {
			allowHttpOrigins: request.url.startsWith('http:') ? [new URL(request.url).origin] : []
		})
		const candidates = matchingBindings(this.state, normalized, context)
		if (candidates.length === 0) return { outcome: 'none' }
		const bestScore = candidates[0]?.score
		const best = candidates.filter((candidate) => candidate.score === bestScore)
		if (best.length > 1) {
			return {
				outcome: 'ambiguous',
				bindingRefs: best.map(({ binding }) => binding.bindingRef).sort()
			}
		}
		const selected = best[0]
		if (!selected) return { outcome: 'none' }
		const credential = ownedCredential(
			this.state,
			context.subjectId,
			selected.binding.credentialRef
		)
		return {
			outcome: 'matched',
			binding: redactedBinding(selected.binding),
			credentialRef: credential.credentialRef,
			secretVersion: credential.version
		}
	}

	async resolveForUse(input: {
		bindingRef: string
		request: HttpRequestArtifact
		requestDigest: string
		runId: string
		stepId: string
		context: VaultSessionContext
	}): Promise<RequestScopedCredentialAttachment> {
		assertSessionContext(input.context, this.tenantId)
		if (!input.runId || !input.stepId) throw new VaultError('VAULT_INVOCATION_UNBOUND')
		const request = parseHttpRequestArtifact(input.request, {
			allowHttpOrigins: input.request.url.startsWith('http:')
				? [new URL(input.request.url).origin]
				: []
		})
		const digest = httpRequestDigest(request)
		if (digest !== input.requestDigest) throw new VaultError('VAULT_REQUEST_DIGEST_MISMATCH')
		const match = await this.match(request, input.context)
		if (match.outcome !== 'matched' || match.binding.bindingRef !== input.bindingRef) {
			throw new VaultError('VAULT_BINDING_NOT_USABLE')
		}
		const credential = ownedCredential(this.state, input.context.subjectId, match.credentialRef)
		if (!credential.enabled) throw new VaultError('VAULT_CREDENTIAL_REVOKED')
		return {
			bindingRef: match.binding.bindingRef,
			credentialRef: credential.credentialRef,
			secretVersion: credential.version,
			requestDigest: digest,
			rule: structuredClone(match.binding.attachment),
			secret: credential.secret
		}
	}
}

function matchingBindings(
	state: VaultState,
	request: HttpRequestArtifact,
	context: VaultSessionContext
): Array<{ binding: CredentialBinding; score: number }> {
	if (request.authentication.mode === 'anonymous') return []
	const url = new URL(request.url)
	const purpose = request.authentication.purpose
	const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
	return [...state.bindings.values()]
		.filter((binding) => {
			const credential = state.credentials.get(binding.credentialRef)
			return (
				binding.enabled &&
				credential?.enabled === true &&
				binding.ownerSubjectId === context.subjectId &&
				credential.ownerSubjectId === context.subjectId &&
				binding.placements.includes(context.executionEnvironment) &&
				binding.schemes.includes(url.protocol.slice(0, -1) as 'https' | 'http') &&
				binding.ports.includes(port) &&
				binding.methods.includes(request.method) &&
				binding.purpose === purpose &&
				hostMatches(binding.host, url.hostname) &&
				pathMatches(binding.pathPrefix, url.pathname)
			)
		})
		.map((binding) => ({ binding, score: specificity(binding) }))
		.sort(
			(left, right) =>
				right.score - left.score || left.binding.bindingRef.localeCompare(right.binding.bindingRef)
		)
}

function specificity(binding: CredentialBinding): number {
	const hostScore = binding.host.kind === 'exact' ? 1_000_000 : binding.host.value.length * 1_000
	return hostScore + binding.pathPrefix.length
}

function hostMatches(matcher: CredentialBinding['host'], hostname: string): boolean {
	const candidate = hostname.toLowerCase()
	if (matcher.kind === 'exact') return candidate === matcher.value
	return candidate !== matcher.value && candidate.endsWith(`.${matcher.value}`)
}

function pathMatches(prefix: string, pathname: string): boolean {
	if (prefix === '/') return true
	if (prefix.endsWith('/')) return pathname.startsWith(prefix)
	return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function normalizeBinding(input: CredentialBinding): CredentialBinding {
	const parsed = bindingSchema.parse(input)
	const host = parsed.host.value.toLowerCase().replace(/^\*\./, '')
	if (host.includes(':') || host.endsWith('.')) throw new VaultError('VAULT_BINDING_HOST_INVALID')
	const path = new URL(parsed.pathPrefix, 'https://binding.invalid').pathname
	if (path !== parsed.pathPrefix || !path.startsWith('/')) {
		throw new VaultError('VAULT_BINDING_PATH_INVALID')
	}
	const attachment = normalizeAttachment(parsed.attachment)
	return {
		...parsed,
		placements: [...new Set(parsed.placements)].sort() as Array<'local' | 'server'>,
		schemes: [...new Set(parsed.schemes)].sort() as Array<'https' | 'http'>,
		host: { ...parsed.host, value: host },
		ports: [...new Set(parsed.ports)].sort((left, right) => left - right),
		methods: [...new Set(parsed.methods)].sort() as HttpMethod[],
		pathPrefix: path,
		attachment
	}
}

function normalizeAttachment(attachment: CredentialAttachmentRule): CredentialAttachmentRule {
	const name = attachment.name.toLowerCase()
	if (!HTTP_TOKEN.test(name)) throw new VaultError('VAULT_ATTACHMENT_NAME_INVALID')
	if (attachment.kind === 'header') {
		if (FORBIDDEN_ATTACHMENT_HEADERS.has(name)) {
			throw new VaultError('VAULT_ATTACHMENT_HEADER_FORBIDDEN')
		}
		if (containsControlCharacter(attachment.prefix)) {
			throw new VaultError('VAULT_ATTACHMENT_PREFIX_INVALID')
		}
		return { ...attachment, name }
	}
	return { ...attachment, name }
}

function redactedBinding(binding: CredentialBinding): RedactedCredentialBinding {
	return {
		bindingRef: binding.bindingRef,
		label: binding.label,
		credentialRef: binding.credentialRef,
		placements: [...binding.placements],
		schemes: [...binding.schemes],
		host: { ...binding.host },
		ports: [...binding.ports],
		pathPrefix: binding.pathPrefix,
		methods: [...binding.methods],
		purpose: binding.purpose,
		attachment: structuredClone(binding.attachment),
		enabled: binding.enabled
	}
}

function credentialMetadata(credential: StoredCredential): VaultCredentialMetadata {
	return {
		credentialRef: credential.credentialRef,
		label: credential.label,
		version: credential.version,
		enabled: credential.enabled,
		createdAt: credential.createdAt,
		updatedAt: credential.updatedAt
	}
}

function ownedCredential(
	state: VaultState,
	ownerSubjectId: string,
	credentialRef: string
): StoredCredential {
	const subject = z.uuid().parse(ownerSubjectId)
	const reference = z.uuid().parse(credentialRef)
	const credential = state.credentials.get(reference)
	if (!credential || credential.ownerSubjectId !== subject) {
		throw new VaultError('VAULT_CREDENTIAL_NOT_FOUND')
	}
	return credential
}

function ownedBinding(
	state: VaultState,
	ownerSubjectId: string,
	bindingRef: string
): CredentialBinding {
	const subject = z.uuid().parse(ownerSubjectId)
	const reference = z.uuid().parse(bindingRef)
	const binding = state.bindings.get(reference)
	if (!binding || binding.ownerSubjectId !== subject)
		throw new VaultError('VAULT_BINDING_NOT_FOUND')
	return binding
}

function assertSessionContext(context: VaultSessionContext, tenantId: string): void {
	const requestedTenantId = z.uuid().parse(context.tenantId)
	if (requestedTenantId !== tenantId) throw new VaultError('VAULT_TENANT_MISMATCH')
	z.uuid().parse(context.subjectId)
	z.string().min(1).max(256).parse(context.sessionId)
}

function secretValue(value: string): string {
	if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value) > 32 * 1024) {
		throw new VaultError('VAULT_SECRET_INVALID')
	}
	if (containsControlCharacter(value)) throw new VaultError('VAULT_SECRET_INVALID')
	return value
}

export class VaultError extends Error {
	constructor(readonly code: string) {
		super(code)
	}
}
