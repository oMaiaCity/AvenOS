import { randomBytes } from 'node:crypto'
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs'
import { join } from 'node:path'

export const TARGETS = ['identity', 'next', 'production'] as const
export type Target = (typeof TARGETS)[number]
export const PULUMI_ORGANIZATION = 'organization'

export interface S3Credential {
	accessKeyId: string
	secretAccessKey: string
}

export interface BootstrapInput {
	deploymentTargets: Target[]
	repository: string
	githubPackagesReadToken: string
	reviewer?: string
	objectStorage: {
		region: 'fsn1' | 'nbg1' | 'hel1'
		targets: Record<
			Target,
			{
				projectId: string
				bootstrapCredential: S3Credential
				deploymentCredential: S3Credential
				observerCredential: S3Credential
			}
		>
	}
	defaults: {
		hetznerLocation: string
		hetznerServerType: string
		hetznerOsImage: string
		identityVolumeSizeGb?: number
		platformVolumeSizeGb?: number
		sshAllowedCidrs: string
		acmeEmail: string
		downloadUrl?: string
	}
	providers: {
		dnsProjectId?: string
		identity: { computeToken: string; dnsApiKey: string }
		next: {
			computeToken: string
			dnsToken: string
			polarApiKey: string
			polarOrganizationId: string
			smtpUrl: string
			smtpFrom: string
			smtpReplyTo?: string
		}
		production: {
			computeToken: string
			dnsToken: string
			polarApiKey: string
			polarOrganizationId: string
			smtpUrl: string
			smtpFrom: string
			smtpReplyTo?: string
			androidAppCertSha256Fingerprints?: string
		}
		redpillApiKey?: string
	}
}

export interface GeneratedSecrets {
	deploymentPrefix: string
	completedTargets?: Target[]
	initialRollout?: {
		ref: string
		targets: Target[]
		infrastructurePreviewRunId?: number
		infrastructureApplyRunId?: number
		identityDns?: { ipv4: string; ipv6: string; verified: boolean }
		deployRunId?: number
		releaseRunId?: number
		verifiedAt?: string
	}
	targets: Record<
		Target,
		{ bootstrapPulumiPassphrase: string; pulumiPassphrase: string; resticPassword: string }
	>
	polarWebhooks?: Partial<Record<'next' | 'production', PolarWebhookRecord>>
}

export function selectedDeploymentTargets(value: unknown): Target[] {
	if (!Array.isArray(value) || value.length === 0)
		throw new Error('deploymentTargets must select at least one of identity, next, or production.')
	const selected = new Set<Target>()
	for (const target of value) {
		if (!TARGETS.includes(target as Target))
			throw new Error('deploymentTargets may contain only identity, next, and production.')
		if (selected.has(target as Target))
			throw new Error(`deploymentTargets contains duplicate target ${String(target)}.`)
		selected.add(target as Target)
	}
	return TARGETS.filter((target) => selected.has(target))
}

export function deploymentConfigurationTargets(
	input: Pick<BootstrapInput, 'deploymentTargets'>,
	generated: Pick<GeneratedSecrets, 'completedTargets'>
): Target[] {
	const requested = selectedDeploymentTargets(input.deploymentTargets)
	const completed = generated.completedTargets ?? []
	if (completed.length > 0) selectedDeploymentTargets(completed)
	return TARGETS.filter((target) => requested.includes(target) || completed.includes(target))
}

export interface PolarWebhookRecord {
	id: string
	url: string
	secret: string
}

export const BOOTSTRAP_PROGRESS_PREFIX = '::avenos-bootstrap-progress::'
export const BOOTSTRAP_BUCKET_KINDS = ['state', 'backup'] as const
export type BootstrapBucketKind = (typeof BOOTSTRAP_BUCKET_KINDS)[number]
export const BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS = [
	2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000, 60_000, 60_000, 60_000
] as const

export async function ensureBootstrapBucketExists(options: {
	exists: () => Promise<boolean>
	create: () => Promise<void>
	onVisibilityWait?: (options: { retry: number; maxRetries: number; delayMs: number }) => void
	sleep?: (delayMs: number) => Promise<void>
}): Promise<'existing' | 'created'> {
	if (await options.exists()) return 'existing'
	await options.create()
	if (await options.exists()) return 'created'

	for (const [index, delayMs] of BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.entries()) {
		options.onVisibilityWait?.({
			retry: index + 1,
			maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length,
			delayMs
		})
		await (options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay))))(
			delayMs
		)
		if (await options.exists()) return 'created'
	}
	throw new Error(
		'Hetzner accepted the exact bucket create request, but the bucket did not become visible before the bounded retry window ended.'
	)
}

export function isRetryableBootstrapStateBackendError(error: unknown): boolean {
	const candidate = error as { commandOutput?: unknown; message?: unknown }
	const output = [candidate.message, candidate.commandOutput]
		.filter((value): value is string => typeof value === 'string')
		.join('\n')
	return (
		/NoSuchBucket/i.test(output) &&
		/(?:ListObjectsV2|PutObject|HeadBucket|could not (?:create stack|list bucket|list stacks))/i.test(
			output
		)
	)
}

export async function retryBootstrapStateBackendMigration<T>(options: {
	migrate: () => Promise<T>
	onVisibilityWait?: (options: { retry: number; maxRetries: number; delayMs: number }) => void
	sleep?: (delayMs: number) => Promise<void>
}): Promise<T> {
	for (let attempt = 0; ; attempt += 1) {
		try {
			return await options.migrate()
		} catch (error) {
			if (
				!isRetryableBootstrapStateBackendError(error) ||
				attempt >= BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length
			)
				throw error
			const delayMs = BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS[attempt] as number
			options.onVisibilityWait?.({
				retry: attempt + 1,
				maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length,
				delayMs
			})
			await (options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay))))(
				delayMs
			)
		}
	}
}

export function pulumiStackIsListed(names: readonly string[], expected: string): boolean {
	const shortName = expected.split('/').at(-1)
	return names.some((name) => name === expected || name === shortName)
}

export function pulumiStackConfigFileName(stack: string): string {
	const shortName = stack.split('/').at(-1)
	if (!shortName || !/^[A-Za-z0-9_.-]+$/.test(shortName))
		throw new Error(`Invalid Pulumi stack name ${stack}.`)
	return `Pulumi.${shortName}.yaml`
}

export function removeSaltOnlyPulumiStackConfig(cwd: string, stack: string): boolean {
	const path = join(cwd, pulumiStackConfigFileName(stack))
	if (!existsSync(path)) return false
	const meaningfulLines = readFileSync(path, 'utf8')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('#'))
	if (
		meaningfulLines.length > 1 ||
		(meaningfulLines.length === 1 && !/^encryptionsalt:\s+\S+$/.test(meaningfulLines[0] as string))
	)
		throw new Error(
			`${path} contains Pulumi settings; refusing to remove it automatically before changing backends.`
		)
	unlinkSync(path)
	return true
}

export interface BootstrapProgressEvent {
	status: 'active' | 'complete'
	current: number
	total: number
	label: string
	detail?: string
}

export function collidingBootstrapBucketKinds(
	output: string,
	expected: Record<BootstrapBucketKind, string>
): BootstrapBucketKind[] {
	const collisions = new Set<string>()
	for (const match of output.matchAll(/bucket already exists! \(([^)]+)\)/g))
		collisions.add(match[1] as string)
	return BOOTSTRAP_BUCKET_KINDS.filter((kind) => collisions.has(expected[kind]))
}

export function providerCreatedBootstrapBucketKinds(
	output: string,
	target: Target
): BootstrapBucketKind[] {
	const logicalNames = new Set<string>()
	for (const match of output.matchAll(
		/expected non-nil error with nil state during Create of\s+(urn:pulumi:[^\s]+)/gi
	)) {
		const urn = match[1] as string
		if (urn.includes('::aven-bootstrap::minio:index/s3Bucket:S3Bucket::'))
			logicalNames.add(urn.split('::').at(-1) as string)
	}
	return BOOTSTRAP_BUCKET_KINDS.filter((kind) => logicalNames.has(`${target}-${kind}`))
}

export function providerMissingImportedBootstrapBucketKinds(
	output: string,
	expected: Record<BootstrapBucketKind, string>
): BootstrapBucketKind[] {
	const missing = new Set<string>()
	for (const match of output.matchAll(
		/\bimport(?:ing)?[^\r\n]*?\berror:\s+(?:Preview failed:\s+)?resource '([^']+)' does not exist/gi
	))
		missing.add(match[1] as string)
	return BOOTSTRAP_BUCKET_KINDS.filter((kind) => missing.has(expected[kind]))
}

export function trackedBootstrapBucketKinds(
	stack: {
		deployment?: { resources?: Array<{ type?: unknown; urn?: unknown }> }
	},
	target: Target
): BootstrapBucketKind[] {
	const trackedNames = new Set(
		(stack.deployment?.resources ?? []).flatMap((resource) => {
			if (resource.type !== 'minio:index/s3Bucket:S3Bucket' || typeof resource.urn !== 'string')
				return []
			return [resource.urn.split('::').at(-1)]
		})
	)
	return BOOTSTRAP_BUCKET_KINDS.filter((kind) => trackedNames.has(`${target}-${kind}`))
}

export interface BootstrapBucketSnapshot {
	existing: readonly BootstrapBucketKind[]
	tracked: readonly BootstrapBucketKind[]
}

export function bootstrapStackReadyForMigration(
	stack: {
		deployment?: {
			pending_operations?: unknown[]
			resources?: Array<{ type?: unknown; urn?: unknown; initErrors?: unknown[] }>
		}
	},
	target: Target
): boolean {
	if ((stack.deployment?.pending_operations ?? []).length > 0) return false
	const resources = stack.deployment?.resources ?? []
	if (resources.some((resource) => (resource.initErrors ?? []).length > 0)) return false
	const identities = new Set(
		resources.flatMap((resource) => {
			if (typeof resource.type !== 'string' || typeof resource.urn !== 'string') return []
			return [`${resource.type}::${resource.urn.split('::').at(-1)}`]
		})
	)
	return [
		['pulumi:providers:minio', 'hetzner-object-storage'],
		['minio:index/s3Bucket:S3Bucket', `${target}-state`],
		['minio:index/s3Bucket:S3Bucket', `${target}-backup`],
		['minio:index/s3BucketVersioning:S3BucketVersioning', `${target}-state-versioning`],
		['minio:index/s3BucketVersioning:S3BucketVersioning', `${target}-backup-versioning`],
		['minio:index/s3BucketPolicy:S3BucketPolicy', `${target}-state-policy`],
		['minio:index/s3BucketPolicy:S3BucketPolicy', `${target}-backup-policy`]
	].every(([type, name]) => identities.has(`${type}::${name}`))
}

export async function reconcileBootstrapBucketUpdate(options: {
	target: Target
	expected: Record<BootstrapBucketKind, string>
	confirmedExisting?: readonly BootstrapBucketKind[]
	inspect: () => Promise<BootstrapBucketSnapshot>
	apply: (adopt: readonly BootstrapBucketKind[]) => Promise<void>
	onAdopt?: (kinds: readonly BootstrapBucketKind[]) => void
	onProviderVisibilityWait?: (options: {
		kinds: readonly BootstrapBucketKind[]
		retry: number
		maxRetries: number
		delayMs: number
	}) => void
	sleep?: (delayMs: number) => Promise<void>
}): Promise<void> {
	const confirmedExisting = new Set(options.confirmedExisting ?? [])
	const attempted = new Set<BootstrapBucketKind>()
	let providerReported: BootstrapBucketKind[] = []
	let precedingError: unknown
	let applyAttempts = 0
	let allowRepeatedCandidates = false
	let visibilityRetryKey = ''
	let visibilityRetries = 0

	for (;;) {
		const snapshot = await options.inspect()
		const tracked = new Set(snapshot.tracked)
		const candidates = BOOTSTRAP_BUCKET_KINDS.filter(
			(kind) =>
				!tracked.has(kind) &&
				(confirmedExisting.has(kind) ||
					snapshot.existing.includes(kind) ||
					providerReported.includes(kind))
		)
		if (
			candidates.length > 0 &&
			candidates.every((kind) => attempted.has(kind)) &&
			!allowRepeatedCandidates
		)
			throw precedingError
		const visibilityRetry = allowRepeatedCandidates
		allowRepeatedCandidates = false
		for (const kind of candidates) attempted.add(kind)
		if (candidates.length > 0) options.onAdopt?.(candidates)
		if (!visibilityRetry) {
			if (applyAttempts >= BOOTSTRAP_BUCKET_KINDS.length + 1) throw precedingError
			applyAttempts += 1
		}

		try {
			await options.apply(candidates)
			return
		} catch (error) {
			precedingError = error
			const output = (error as { commandOutput?: unknown }).commandOutput
			providerReported =
				typeof output === 'string'
					? [
							...new Set([
								...collidingBootstrapBucketKinds(output, options.expected),
								...providerCreatedBootstrapBucketKinds(output, options.target)
							])
						]
					: []
			const providerInvisible =
				typeof output === 'string'
					? providerMissingImportedBootstrapBucketKinds(output, options.expected)
					: []
			const afterFailure =
				providerReported.length === 0 || providerInvisible.length > 0
					? await options.inspect()
					: undefined
			const afterTracked = new Set(afterFailure?.tracked ?? [])
			const recoverable = (afterFailure?.existing ?? []).filter((kind) => !afterTracked.has(kind))
			const exactImportsStillVisible =
				providerInvisible.length > 0 &&
				providerInvisible.every(
					(kind) =>
						candidates.includes(kind) && (confirmedExisting.has(kind) || recoverable.includes(kind))
				)
			if (exactImportsStillVisible) {
				const key = candidates.join(',')
				if (key !== visibilityRetryKey) {
					visibilityRetryKey = key
					visibilityRetries = 0
				}
				if (visibilityRetries >= BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length) throw error
				const delayMs = BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS[visibilityRetries] as number
				visibilityRetries += 1
				options.onProviderVisibilityWait?.({
					kinds: candidates,
					retry: visibilityRetries,
					maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length,
					delayMs
				})
				await (options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay))))(
					delayMs
				)
				allowRepeatedCandidates = true
				continue
			}
			if (providerReported.length === 0) {
				if (recoverable.length === 0 || recoverable.every((kind) => attempted.has(kind)))
					throw error
			}
		}
	}
}

export function bootstrapPulumiUpArgs(stack: string, cwd: string): string[] {
	return ['up', '--yes', '--parallel', '1', '--stack', stack, '--cwd', cwd]
}

export function encodeBootstrapProgress(event: BootstrapProgressEvent): string {
	return `${BOOTSTRAP_PROGRESS_PREFIX}${JSON.stringify(event)}\n`
}

export function parseBootstrapProgress(line: string): BootstrapProgressEvent | undefined {
	if (!line.startsWith(BOOTSTRAP_PROGRESS_PREFIX)) return undefined
	const event = JSON.parse(line.slice(BOOTSTRAP_PROGRESS_PREFIX.length)) as BootstrapProgressEvent
	if (
		!['active', 'complete'].includes(event.status) ||
		!Number.isSafeInteger(event.current) ||
		!Number.isSafeInteger(event.total) ||
		event.current < 1 ||
		event.current > event.total ||
		typeof event.label !== 'string' ||
		!event.label.trim() ||
		(event.detail !== undefined && typeof event.detail !== 'string')
	)
		throw new Error('The bootstrap emitted an invalid progress event.')
	return event
}

const password = () => randomBytes(48).toString('base64url')
const generatedPrefix = /^avenos-[0-9a-f]{10}$/

function objectAt(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${path} must be an object.`)
	return value as Record<string, unknown>
}

function stringAt(value: unknown, path: string): string {
	if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} is required.`)
	if (value.startsWith('PASTE_')) throw new Error(`${path} still contains a template placeholder.`)
	return value
}

export function validateBootstrapInput(
	value: unknown,
	requiredTargets?: readonly Target[]
): asserts value is BootstrapInput {
	const input = objectAt(value, 'input')
	selectedDeploymentTargets(input.deploymentTargets)
	const selectedTargets = requiredTargets
		? selectedDeploymentTargets(requiredTargets)
		: selectedDeploymentTargets(input.deploymentTargets)
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(stringAt(input.repository, 'repository')))
		throw new Error('repository must be owner/name.')
	stringAt(input.githubPackagesReadToken, 'githubPackagesReadToken')
	if (input.reviewer !== undefined && !/^[A-Za-z0-9-]+$/.test(stringAt(input.reviewer, 'reviewer')))
		throw new Error('reviewer must be a GitHub user login when provided.')
	const storage = objectAt(input.objectStorage, 'objectStorage')
	if (!['fsn1', 'nbg1', 'hel1'].includes(stringAt(storage.region, 'objectStorage.region')))
		throw new Error('objectStorage.region must be fsn1, nbg1, or hel1.')
	const credential = (candidate: unknown, path: string) => {
		const item = objectAt(candidate, path)
		stringAt(item.accessKeyId, `${path}.accessKeyId`)
		stringAt(item.secretAccessKey, `${path}.secretAccessKey`)
	}
	const storageTargets = objectAt(storage.targets, 'objectStorage.targets')
	const projectIds = new Set<string>()
	for (const target of selectedTargets) {
		const targetStorage = objectAt(storageTargets[target], `objectStorage.targets.${target}`)
		const projectId = stringAt(targetStorage.projectId, `objectStorage.targets.${target}.projectId`)
		if (!/^\d+$/.test(projectId))
			throw new Error(`objectStorage.targets.${target}.projectId must be numeric.`)
		if (projectIds.has(projectId))
			throw new Error('Every Object Storage target must use a different Hetzner project.')
		projectIds.add(projectId)
		credential(
			targetStorage.bootstrapCredential,
			`objectStorage.targets.${target}.bootstrapCredential`
		)
		credential(
			targetStorage.deploymentCredential,
			`objectStorage.targets.${target}.deploymentCredential`
		)
		credential(
			targetStorage.observerCredential,
			`objectStorage.targets.${target}.observerCredential`
		)
	}
	const defaults = objectAt(input.defaults, 'defaults')
	for (const name of [
		'hetznerLocation',
		'hetznerServerType',
		'hetznerOsImage',
		'sshAllowedCidrs',
		'acmeEmail'
	])
		stringAt(defaults[name], `defaults.${name}`)
	const sizeNames = [
		...(selectedTargets.includes('identity') ? ['identityVolumeSizeGb'] : []),
		...(selectedTargets.some((target) => target !== 'identity') ? ['platformVolumeSizeGb'] : [])
	]
	for (const name of sizeNames) {
		const size = defaults[name]
		if (!Number.isSafeInteger(size) || (size as number) < 20)
			throw new Error(`defaults.${name} must be an integer of at least 20.`)
	}
	if (selectedTargets.some((target) => target !== 'identity')) {
		if (new URL(stringAt(defaults.downloadUrl, 'defaults.downloadUrl')).protocol !== 'https:')
			throw new Error('defaults.downloadUrl must use HTTPS.')
	}
	const providers = objectAt(input.providers, 'providers')
	if (selectedTargets.includes('identity')) {
		const identity = objectAt(providers.identity, 'providers.identity')
		stringAt(identity.computeToken, 'providers.identity.computeToken')
		stringAt(identity.dnsApiKey, 'providers.identity.dnsApiKey')
	}
	const platformTargets = selectedTargets.filter(
		(target): target is 'next' | 'production' => target !== 'identity'
	)
	if (platformTargets.length > 0) {
		const dnsProjectId = stringAt(providers.dnsProjectId, 'providers.dnsProjectId')
		if (!/^\d+$/.test(dnsProjectId)) throw new Error('providers.dnsProjectId must be numeric.')
		stringAt(providers.redpillApiKey, 'providers.redpillApiKey')
	}
	for (const target of platformTargets) {
		const provider = objectAt(providers[target], `providers.${target}`)
		for (const name of [
			'computeToken',
			'dnsToken',
			'polarApiKey',
			'polarOrganizationId',
			'smtpUrl',
			'smtpFrom'
		])
			stringAt(provider[name], `providers.${target}.${name}`)
		const smtp = new URL(stringAt(provider.smtpUrl, `providers.${target}.smtpUrl`))
		if (!['smtp:', 'smtps:'].includes(smtp.protocol))
			throw new Error(`providers.${target}.smtpUrl must use smtp or smtps.`)
	}
}

export function generateBootstrapSecrets(): GeneratedSecrets {
	return {
		deploymentPrefix: `avenos-${randomBytes(5).toString('hex')}`,
		targets: Object.fromEntries(
			TARGETS.map((target) => [
				target,
				{
					bootstrapPulumiPassphrase: password(),
					pulumiPassphrase: password(),
					resticPassword: password()
				}
			])
		) as GeneratedSecrets['targets']
	}
}

export function assertPrivateFile(path: string): void {
	const mode = statSync(path).mode & 0o777
	if ((mode & 0o077) !== 0) throw new Error(`${path} must be owner-only (chmod 600).`)
}

export function ensurePrivateDirectory(path: string): void {
	if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 })
	const details = statSync(path)
	if (!details.isDirectory()) throw new Error(`${path} must be a directory.`)
	const mode = details.mode & 0o777
	if ((mode & 0o077) !== 0) throw new Error(`${path} must be owner-only (chmod 700).`)
}

export function loadOrCreateGeneratedSecrets(path: string): GeneratedSecrets {
	if (existsSync(path)) {
		assertPrivateFile(path)
		const generated = JSON.parse(readFileSync(path, 'utf8')) as GeneratedSecrets
		if (!generatedPrefix.test(generated.deploymentPrefix))
			throw new Error(`${path} contains an invalid deployment namespace.`)
		for (const target of TARGETS) {
			if (
				!generated.targets?.[target]?.bootstrapPulumiPassphrase ||
				!generated.targets?.[target]?.pulumiPassphrase ||
				!generated.targets[target].resticPassword
			)
				throw new Error(`${path} is missing generated ${target} secrets.`)
		}
		if (generated.completedTargets !== undefined) {
			if (!Array.isArray(generated.completedTargets))
				throw new Error(`${path} contains invalid completed targets.`)
			generated.completedTargets =
				generated.completedTargets.length > 0
					? selectedDeploymentTargets(generated.completedTargets)
					: []
		}
		if (generated.initialRollout !== undefined) {
			if (!generated.initialRollout || typeof generated.initialRollout !== 'object')
				throw new Error(`${path} contains invalid initial rollout state.`)
			selectedDeploymentTargets(generated.initialRollout.targets)
			if (typeof generated.initialRollout.ref !== 'string' || !generated.initialRollout.ref)
				throw new Error(`${path} contains an invalid initial rollout ref.`)
			for (const name of [
				'infrastructurePreviewRunId',
				'infrastructureApplyRunId',
				'releaseRunId',
				'deployRunId'
			] as const) {
				const runId = generated.initialRollout[name]
				if (runId !== undefined && (!Number.isSafeInteger(runId) || runId <= 0))
					throw new Error(`${path} contains an invalid ${name}.`)
			}
			const identityDns = generated.initialRollout.identityDns
			if (
				identityDns !== undefined &&
				(!identityDns ||
					typeof identityDns !== 'object' ||
					typeof identityDns.ipv4 !== 'string' ||
					!identityDns.ipv4 ||
					typeof identityDns.ipv6 !== 'string' ||
					!identityDns.ipv6 ||
					typeof identityDns.verified !== 'boolean')
			)
				throw new Error(`${path} contains invalid initial rollout identity DNS records.`)
			if (
				generated.initialRollout.verifiedAt !== undefined &&
				(typeof generated.initialRollout.verifiedAt !== 'string' ||
					!generated.initialRollout.verifiedAt)
			)
				throw new Error(`${path} contains an invalid initial rollout verification time.`)
		}
		return generated
	}
	const generated = generateBootstrapSecrets()
	writeFileSync(path, `${JSON.stringify(generated, null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600,
		flag: 'wx'
	})
	chmodSync(path, 0o600)
	return generated
}

export function saveGeneratedSecrets(path: string, generated: GeneratedSecrets): void {
	const temporary = `${path}.${randomBytes(6).toString('hex')}.next`
	writeFileSync(temporary, `${JSON.stringify(generated, null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600,
		flag: 'wx'
	})
	chmodSync(temporary, 0o600)
	renameSync(temporary, path)
}

function csv(value: string): string {
	return `"${value.replaceAll('"', '""')}"`
}

export function recoveryCsv(input: BootstrapInput, generated: GeneratedSecrets): string {
	const rows: string[][] = []
	const add = (
		group: string,
		name: string,
		username: string,
		secret: string,
		notes: string,
		url = ''
	) =>
		rows.push([`avenOS/${generated.deploymentPrefix}/${group}`, name, username, secret, url, notes])
	add(
		'bootstrap',
		'avenOS deployment namespace',
		generated.deploymentPrefix,
		'',
		`Identifies this infrastructure generation. GitHub Environments: ${deploymentConfigurationTargets(
			input,
			generated
		)
			.flatMap((target) => [
				`${generated.deploymentPrefix}-${target}`,
				`${generated.deploymentPrefix}-${target}-operations`
			])
			.join(', ')}.`,
		`https://github.com/${input.repository}/settings/environments`
	)
	add(
		'shared',
		'avenOS GitHub Packages reader',
		'',
		input.githubPackagesReadToken,
		'Classic GitHub token with read:packages only; CI uses it to install the cross-repository @myavenceo packages.',
		'https://github.com/settings/tokens'
	)
	const recoveryTargets = deploymentConfigurationTargets(input, generated)
	for (const target of recoveryTargets) {
		const storage = input.objectStorage.targets[target]
		const stateBucket = objectStorageBucketName(input, generated, target, 'state')
		const backupBucket = objectStorageBucketName(input, generated, target, 'backup')
		add(
			target,
			`avenOS ${target} bootstrap Pulumi passphrase`,
			'',
			generated.targets[target].bootstrapPulumiPassphrase,
			`Encrypts the isolated ${target} storage-bootstrap state.`
		)
		add(
			target,
			`avenOS ${target} bootstrap administrator`,
			storage.bootstrapCredential.accessKeyId,
			storage.bootstrapCredential.secretAccessKey,
			`Offline administrator for ${target} project ${storage.projectId}; never add to GitHub.`,
			`https://console.hetzner.com/projects/${storage.projectId}/security/s3-credentials`
		)
		add(
			target,
			`avenOS ${target} Pulumi passphrase`,
			'',
			generated.targets[target].pulumiPassphrase,
			'Encrypts generated infrastructure secrets.'
		)
		add(
			target,
			`avenOS ${target} Restic password`,
			'',
			generated.targets[target].resticPassword,
			'Encrypts database backups; loss makes backups unrecoverable.'
		)
		add(
			target,
			`avenOS ${target} deployment storage`,
			storage.deploymentCredential.accessKeyId,
			storage.deploymentCredential.secretAccessKey,
			`Writes only state bucket ${stateBucket} and backup bucket ${backupBucket}.`,
			`https://console.hetzner.com/projects/${storage.projectId}/security/s3-credentials`
		)
		add(
			target,
			`avenOS ${target} observer storage`,
			storage.observerCredential.accessKeyId,
			storage.observerCredential.secretAccessKey,
			`Reads only state bucket ${stateBucket}.`,
			`https://console.hetzner.com/projects/${storage.projectId}/security/s3-credentials`
		)
		add(
			target,
			`avenOS ${target} recovery storage`,
			stateBucket,
			'',
			`Pulumi state bucket. Restic backup bucket: ${backupBucket}. Region: ${input.objectStorage.region}. Project: ${storage.projectId}.`,
			`https://console.hetzner.com/projects/${storage.projectId}/buckets`
		)
		add(
			target,
			`avenOS ${target} deployment (Hetzner Cloud token)`,
			'',
			input.providers[target].computeToken,
			'Target-scoped compute API token.',
			`https://console.hetzner.com/projects/${storage.projectId}/security/tokens`
		)
	}
	if (recoveryTargets.includes('identity'))
		add(
			'identity',
			'avenOS identity DNS deployment (United Domains API key)',
			'',
			input.providers.identity.dnsApiKey,
			'Writes only the externally hosted aven.id DNS zone during installation and removes only the saved identity A/AAAA values during a full uninstall.',
			'https://www.united-domains.de/portfolio/a/dns-api'
		)
	for (const target of recoveryTargets.filter(
		(target): target is 'next' | 'production' => target !== 'identity'
	)) {
		const provider = input.providers[target]
		const webhook = generated.polarWebhooks?.[target]
		if (!webhook) throw new Error(`Polar ${target} webhook has not been provisioned.`)
		add(
			target,
			`avenOS ${target} DNS deployment (Hetzner DNS token)`,
			'',
			provider.dnsToken,
			`Writes the shared aven.ceo DNS zone in Hetzner project ${input.providers.dnsProjectId}.`,
			`https://console.hetzner.com/projects/${input.providers.dnsProjectId}/security/tokens`
		)
		add(
			target,
			`avenOS ${target} billing (Polar API key)`,
			provider.polarOrganizationId,
			provider.polarApiKey,
			`Reconciles products, benefits, meters, and webhooks and serves checkout, subscription, customer, and order operations in the Polar ${target} organization.`,
			target === 'next' ? 'https://sandbox.polar.sh' : 'https://polar.sh'
		)
		add(
			target,
			`avenOS ${target} Polar webhook secret`,
			webhook.id,
			webhook.secret,
			`Verifies every raw Polar webhook delivery sent to ${webhook.url}.`,
			webhook.url
		)
		add(target, `avenOS ${target} SMTP`, '', provider.smtpUrl, 'Send-only checkout mail transport.')
	}
	if (recoveryTargets.some((target) => target !== 'identity'))
		add(
			'shared',
			'avenOS RedPill API key',
			'',
			input.providers.redpillApiKey as string,
			'Shared inference credential for next and production.',
			'https://redpill.ai'
		)
	const rollout = generated.initialRollout
	if (rollout) {
		const rolloutStatus = rollout.verifiedAt
			? `Public installation verified at ${rollout.verifiedAt}.`
			: 'Initial installation has not completed public verification yet.'
		add(
			'bootstrap',
			'avenOS initial deployment revision',
			rollout.ref,
			'',
			`Targets: ${rollout.targets.join(', ')}. ${rolloutStatus}`,
			`https://github.com/${input.repository}/commit/${rollout.ref}`
		)
		for (const [title, runId] of [
			['Infrastructure preview', rollout.infrastructurePreviewRunId],
			['Infrastructure apply', rollout.infrastructureApplyRunId],
			['Verified immutable release', rollout.releaseRunId],
			['Software deployment', rollout.deployRunId]
		] as const) {
			if (!runId) continue
			add(
				'bootstrap',
				`avenOS initial ${title.toLowerCase()} run`,
				String(runId),
				'',
				`${title} workflow for revision ${rollout.ref}.`,
				`https://github.com/${input.repository}/actions/runs/${runId}`
			)
		}
		if (rollout.identityDns) {
			const dnsStatus = rollout.identityDns.verified
				? 'The installer published this value through United Domains and verified public DNS.'
				: 'The installer has saved this value and will publish and verify it through United Domains before deployment.'
			add(
				'identity',
				'aven.id apex A record',
				'@',
				rollout.identityDns.ipv4,
				`Type A, apex name @, TTL 300. ${dnsStatus}`,
				'https://aven.id/'
			)
			add(
				'identity',
				'aven.id apex AAAA record',
				'@',
				rollout.identityDns.ipv6,
				`Type AAAA, apex name @, TTL 300. ${dnsStatus}`,
				'https://aven.id/'
			)
		}
		for (const [group, title, url, notes] of [
			['identity', 'avenOS identity service', 'https://aven.id/', 'Shared passkey identity.'],
			[
				'next',
				'avenOS next installation',
				'https://next.aven.ceo/',
				'Public site. API: https://api.next.aven.ceo. Checkout: https://portal.next.aven.ceo.'
			],
			[
				'production',
				'avenOS production installation',
				'https://aven.ceo/',
				'Public site. API: https://api.aven.ceo. Checkout: https://portal.aven.ceo.'
			]
		] as const) {
			if (!rollout.targets.includes(group as Target)) continue
			add(group, title, '', '', `${notes} ${rolloutStatus}`, url)
		}
	}
	const header = ['Group', 'Title', 'Username', 'Password', 'URL', 'Notes']
	return `${[header, ...rows].map((row) => row.map(csv).join(',')).join('\n')}\n`
}

export function writeRecoveryCsv(path: string, contents: string): void {
	if (existsSync(path))
		throw new Error(`${path} already exists; refusing to overwrite recovery material.`)
	writeFileSync(path, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
	chmodSync(path, 0o600)
}

const backend = (bucket: string, region: string) =>
	`s3://${bucket}/avenos/platform?endpoint=${region}.your-objectstorage.com&region=${region}&s3ForcePathStyle=true&awssdk=v2`

export function objectStorageBucketName(
	input: BootstrapInput,
	generated: GeneratedSecrets,
	target: Target,
	kind: 'state' | 'backup'
): string {
	return `${generated.deploymentPrefix}-${input.objectStorage.targets[target].projectId}-${target}-${kind}`
}

export function githubConfiguration(input: BootstrapInput, generated: GeneratedSecrets) {
	const region = input.objectStorage.region
	const selectedTargets = deploymentConfigurationTargets(input, generated)
	const commonVariables = {
		PULUMI_STATE_S3_REGION: region,
		HETZNER_LOCATION: input.defaults.hetznerLocation,
		HETZNER_SERVER_TYPE: input.defaults.hetznerServerType,
		IDENTITY_SERVER_TYPE: input.defaults.hetznerServerType,
		PLATFORM_SERVER_TYPE: input.defaults.hetznerServerType,
		HETZNER_OS_IMAGE: input.defaults.hetznerOsImage,
		SSH_ALLOWED_CIDRS: input.defaults.sshAllowedCidrs,
		ACME_EMAIL: input.defaults.acmeEmail,
		BACKUP_S3_REGION: region
	}
	const result: Record<
		string,
		{ secrets: Record<string, string>; variables: Record<string, string> }
	> = {}
	for (const target of selectedTargets) {
		const storage = input.objectStorage.targets[target]
		const stateBucket = objectStorageBucketName(input, generated, target, 'state')
		const backupBucket = objectStorageBucketName(input, generated, target, 'backup')
		result[`${generated.deploymentPrefix}-${target}`] = {
			secrets: {
				HETZNER_COMPUTE_TOKEN: input.providers[target].computeToken,
				PULUMI_STATE_S3_ACCESS_KEY_ID: storage.deploymentCredential.accessKeyId,
				PULUMI_STATE_S3_SECRET_ACCESS_KEY: storage.deploymentCredential.secretAccessKey,
				PULUMI_CONFIG_PASSPHRASE: generated.targets[target].pulumiPassphrase,
				BACKUP_S3_ACCESS_KEY_ID: storage.deploymentCredential.accessKeyId,
				BACKUP_S3_SECRET_ACCESS_KEY: storage.deploymentCredential.secretAccessKey,
				BACKUP_RESTIC_PASSWORD: generated.targets[target].resticPassword
			},
			variables: {
				...commonVariables,
				...(target === 'identity'
					? { IDENTITY_VOLUME_SIZE_GB: String(input.defaults.identityVolumeSizeGb) }
					: { PLATFORM_VOLUME_SIZE_GB: String(input.defaults.platformVolumeSizeGb) }),
				PULUMI_STATE_S3_BUCKET: stateBucket,
				PULUMI_STACK: `${PULUMI_ORGANIZATION}/aven-platform/${target}`,
				BACKUP_REPOSITORY_BASE: `s3:https://${region}.your-objectstorage.com/${backupBucket}`
			}
		}
		result[`${generated.deploymentPrefix}-${target}-operations`] = {
			secrets: {
				PULUMI_STATE_S3_ACCESS_KEY_ID: storage.observerCredential.accessKeyId,
				PULUMI_STATE_S3_SECRET_ACCESS_KEY: storage.observerCredential.secretAccessKey,
				PULUMI_CONFIG_PASSPHRASE: generated.targets[target].pulumiPassphrase
			},
			variables: {
				PULUMI_STATE_S3_BUCKET: stateBucket,
				PULUMI_STATE_S3_REGION: region,
				PULUMI_STACK: `${PULUMI_ORGANIZATION}/aven-platform/${target}`
			}
		}
	}
	const identity = result[`${generated.deploymentPrefix}-identity`]
	if (identity) {
		for (const target of selectedTargets.filter(
			(target): target is 'next' | 'production' => target !== 'identity'
		)) {
			const upper = target.toUpperCase()
			const storage = input.objectStorage.targets[target]
			Object.assign(identity.secrets, {
				[`${upper}_STATE_S3_ACCESS_KEY_ID`]: storage.observerCredential.accessKeyId,
				[`${upper}_STATE_S3_SECRET_ACCESS_KEY`]: storage.observerCredential.secretAccessKey,
				[`${upper}_PULUMI_CONFIG_PASSPHRASE`]: generated.targets[target].pulumiPassphrase
			})
			Object.assign(identity.variables, {
				[`${upper}_PULUMI_STACK`]: `${PULUMI_ORGANIZATION}/aven-platform/${target}`,
				[`${upper}_PULUMI_BACKEND`]: backend(
					objectStorageBucketName(input, generated, target, 'state'),
					region
				)
			})
		}
	}
	for (const target of selectedTargets.filter(
		(target): target is 'next' | 'production' => target !== 'identity'
	)) {
		const provider = input.providers[target]
		const environment = result[`${generated.deploymentPrefix}-${target}`]
		const webhookSecret = generated.polarWebhooks?.[target]?.secret
		if (!webhookSecret) throw new Error(`Polar ${target} webhook has not been provisioned.`)
		Object.assign(environment.secrets, {
			HETZNER_DNS_TOKEN: provider.dnsToken,
			POLAR_API_KEY: provider.polarApiKey,
			POLAR_WEBHOOK_SECRET: webhookSecret,
			SMTP_URL: provider.smtpUrl,
			LLM_GATEWAY_CREDENTIALS_JSON: JSON.stringify({ redpill: input.providers.redpillApiKey })
		})
		Object.assign(environment.variables, {
			POLAR_SERVER: target === 'next' ? 'sandbox' : 'production',
			POLAR_ORGANIZATION_ID: provider.polarOrganizationId,
			SMTP_FROM: provider.smtpFrom,
			SMTP_REPLY_TO: provider.smtpReplyTo ?? '',
			DOWNLOAD_URL: input.defaults.downloadUrl as string,
			ANDROID_APP_CERT_SHA256_FINGERPRINTS:
				target === 'production'
					? (input.providers.production.androidAppCertSha256Fingerprints ?? '')
					: '',
			LLM_GATEWAY_TIMEOUT_SECONDS: '180'
		})
	}
	return result
}

export function githubEnvironmentProtection(protectedDeployment: boolean, reviewerId?: number) {
	const requiresReview = protectedDeployment && reviewerId !== undefined
	return {
		wait_timer: 0,
		prevent_self_review: requiresReview,
		reviewers: requiresReview ? [{ type: 'User', id: reviewerId }] : [],
		deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
	}
}

export function githubDeploymentBranches(target: Target): string[] {
	return target === 'next' ? ['next', 'prod'] : ['prod']
}

export function githubEnvironmentVariableChanges(
	desired: Record<string, string>,
	existingNames: Iterable<string>
) {
	const existing = new Set(existingNames)
	return {
		set: Object.entries(desired).filter(([, value]) => value !== ''),
		remove: Object.entries(desired)
			.filter(([name, value]) => value === '' && existing.has(name))
			.map(([name]) => name)
	}
}

export function isRetryableGitHubError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false
	const output = (error as { commandOutput?: unknown }).commandOutput
	if (typeof output !== 'string') return false
	return /(?:i\/o timeout|timed out|TLS handshake timeout|connection (?:reset|refused)|temporary failure|HTTP (?:429|5\d\d)\b)/i.test(
		output
	)
}
