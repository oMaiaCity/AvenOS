import {
	declaredContentType,
	type HttpRequestArtifact,
	type HttpRequestPolicy,
	type HttpResponseArtifact,
	httpRequestDigest,
	parseHttpRequestArtifact,
	retainedResponseHeaders
} from './contracts'
import type {
	RequestScopedCredentialAttachment,
	SessionVaultClient,
	VaultMatch,
	VaultSessionContext
} from './vault'

export interface HttpResponseCandidate {
	artifactId: string
	payload: HttpResponseArtifact
	body: {
		sha256: string
		length: number
	}
	/** The index computes HTTP freshness inside the exact private partition. */
	fresh: boolean
}

export interface HttpResponseLookup {
	tenantId: string
	subjectId: string
	credentialRef: string | null
	method: HttpRequestArtifact['method']
	url: string
	headers: HttpRequestArtifact['headers']
}

export interface HttpResponseIndex {
	find(lookup: HttpResponseLookup): Promise<HttpResponseCandidate | null>
}

export interface HttpEgressPolicy {
	authorize(request: HttpRequestArtifact, context: VaultSessionContext): Promise<void>
}

export interface HttpConditionalValidators {
	ifNoneMatch?: string
	ifModifiedSince?: string
}

export interface HttpTransportExchange {
	status: number
	statusText: string
	headers: Headers
	body: ReadableStream<Uint8Array> | null
	protocol?: string
}

/** Trusted transport port. Credential values never enter portable Actor payloads. */
export interface HttpResourceTransport {
	exchange(input: {
		request: HttpRequestArtifact
		credential?: RequestScopedCredentialAttachment
		conditional?: HttpConditionalValidators
		signal?: AbortSignal
	}): Promise<HttpTransportExchange>
}

export interface HttpAcquisitionContext extends VaultSessionContext {
	runId: string
	stepId: string
}

export type AcquiredHttpResource =
	| {
			kind: 'existing-response'
			responseArtifactId: string
			cacheDisposition: 'fresh-cache'
	  }
	| {
			kind: 'capture'
			metadata: Omit<HttpResponseArtifact, 'storedBodyLength'>
			body:
				| { kind: 'stream'; stream: ReadableStream<Uint8Array>; declaredLength: number | null }
				| { kind: 'existing'; artifactId: string; sha256: string; length: number }
			credential: {
				credentialRef: string
				bindingRef: string
				secretVersion: number
				attachmentKind: 'header' | 'cookie' | 'query'
			} | null
	  }

export interface HttpAcquisitionDependencies {
	vault: SessionVaultClient
	responses: HttpResponseIndex
	egress: HttpEgressPolicy
	transport: HttpResourceTransport
	requestPolicy?: HttpRequestPolicy
	now?: () => Date
}

/**
 * Execute one read-only HTTP observation with customer/session credential routing.
 * The returned stream or prior-body reference must be committed by the host Artifact Store adapter.
 */
export async function acquireHttpResource(
	input: unknown,
	context: HttpAcquisitionContext,
	dependencies: HttpAcquisitionDependencies,
	signal?: AbortSignal
): Promise<AcquiredHttpResource> {
	assertContext(context)
	const request = parseHttpRequestArtifact(input, dependencies.requestPolicy)
	const initialMatch = await credentialMatch(request, context, dependencies.vault)
	const credentialRef = initialMatch.outcome === 'matched' ? initialMatch.credentialRef : null
	const lookup: HttpResponseLookup = {
		tenantId: context.tenantId,
		subjectId: context.subjectId,
		credentialRef,
		method: request.method,
		url: request.url,
		headers: structuredClone(request.headers)
	}
	const candidate =
		request.freshness === 'new-capture' ? null : await dependencies.responses.find(lookup)
	if (request.freshness === 'offline-only') {
		if (!candidate) throw new HttpAcquisitionError('HTTP_OFFLINE_ARTIFACT_NOT_FOUND')
		return {
			kind: 'existing-response',
			responseArtifactId: candidate.artifactId,
			cacheDisposition: 'fresh-cache'
		}
	}
	if (candidate?.fresh) {
		return {
			kind: 'existing-response',
			responseArtifactId: candidate.artifactId,
			cacheDisposition: 'fresh-cache'
		}
	}

	const validators = candidate ? conditionalValidators(candidate.payload) : undefined
	let current = request
	let match = initialMatch
	let redirectCount = 0
	let lastCredential: Extract<AcquiredHttpResource, { kind: 'capture' }>['credential'] = null

	while (true) {
		await dependencies.egress.authorize(current, context)
		const credential = await credentialForUse(current, match, context, dependencies.vault)
		lastCredential = credential
			? {
					credentialRef: credential.credentialRef,
					bindingRef: credential.bindingRef,
					secretVersion: credential.secretVersion,
					attachmentKind: credential.rule.kind
				}
			: null
		const exchange = await dependencies.transport.exchange({
			request: current,
			...(credential && { credential }),
			...(validators && candidate?.payload.finalUrl === current.url
				? { conditional: validators }
				: {}),
			...(signal && { signal })
		})
		if (isRedirect(exchange.status) && request.redirects.mode === 'follow') {
			if (redirectCount >= request.redirects.maximumHops) {
				throw new HttpAcquisitionError('HTTP_REDIRECT_LIMIT_EXCEEDED')
			}
			const location = exchange.headers.get('location')
			if (!location)
				return capture(exchange, request, current, redirectCount, lastCredential, dependencies)
			const nextUrl = new URL(location, current.url)
			current = parseHttpRequestArtifact(
				{ ...current, url: nextUrl.toString() },
				dependencies.requestPolicy
			)
			redirectCount += 1
			match = await credentialMatch(current, context, dependencies.vault)
			continue
		}
		if (exchange.status === 304) {
			if (!candidate) throw new HttpAcquisitionError('HTTP_304_WITHOUT_CANDIDATE')
			const metadata = responseMetadata({
				requested: request,
				finalRequest: current,
				exchange,
				redirectCount,
				capturedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
				statusCode: candidate.payload.statusCode,
				networkStatusCode: 304,
				cacheDisposition: 'revalidated',
				representationSourceArtifactId: candidate.artifactId,
				fallback: candidate.payload
			})
			return {
				kind: 'capture',
				metadata,
				body: {
					kind: 'existing',
					artifactId: candidate.artifactId,
					sha256: candidate.body.sha256,
					length: candidate.body.length
				},
				credential: lastCredential
			}
		}
		return capture(exchange, request, current, redirectCount, lastCredential, dependencies)
	}
}

function capture(
	exchange: HttpTransportExchange,
	requested: HttpRequestArtifact,
	finalRequest: HttpRequestArtifact,
	redirectCount: number,
	credential: Extract<AcquiredHttpResource, { kind: 'capture' }>['credential'],
	dependencies: HttpAcquisitionDependencies
): Extract<AcquiredHttpResource, { kind: 'capture' }> {
	const declaredLength = contentLength(exchange.headers)
	return {
		kind: 'capture',
		metadata: responseMetadata({
			requested,
			finalRequest,
			exchange,
			redirectCount,
			capturedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
			statusCode: exchange.status,
			cacheDisposition: 'new'
		}),
		body: {
			kind: 'stream',
			stream: exchange.body ?? emptyBody(),
			declaredLength
		},
		credential
	}
}

function responseMetadata(input: {
	requested: HttpRequestArtifact
	finalRequest: HttpRequestArtifact
	exchange: HttpTransportExchange
	redirectCount: number
	capturedAt: string
	statusCode: number
	networkStatusCode?: number
	cacheDisposition: HttpResponseArtifact['cacheDisposition']
	representationSourceArtifactId?: string
	fallback?: HttpResponseArtifact
}): Omit<HttpResponseArtifact, 'storedBodyLength'> {
	const declared = declaredContentType(input.exchange.headers)
	const retained = retainedResponseHeaders(input.exchange.headers)
	return {
		requestedUrl: input.requested.url,
		finalUrl: input.finalRequest.url,
		statusCode: input.statusCode,
		...(input.networkStatusCode !== undefined && { networkStatusCode: input.networkStatusCode }),
		cacheDisposition: input.cacheDisposition,
		...(input.representationSourceArtifactId && {
			representationSourceArtifactId: input.representationSourceArtifactId
		}),
		...(input.exchange.protocol && { protocol: input.exchange.protocol }),
		declaredMediaType: declared.mediaType ?? input.fallback?.declaredMediaType ?? null,
		declaredCharset: declared.charset ?? input.fallback?.declaredCharset ?? null,
		etag: input.exchange.headers.get('etag') ?? input.fallback?.etag ?? null,
		lastModified:
			input.exchange.headers.get('last-modified') ?? input.fallback?.lastModified ?? null,
		headers: mergeRetainedHeaders(input.fallback?.headers ?? [], retained),
		redirectCount: input.redirectCount,
		capturedAt: input.capturedAt
	}
}

function mergeRetainedHeaders(
	prior: HttpResponseArtifact['headers'],
	observed: HttpResponseArtifact['headers']
): HttpResponseArtifact['headers'] {
	const merged = new Map(prior.map((header) => [header.name, structuredClone(header)]))
	for (const header of observed) merged.set(header.name, structuredClone(header))
	return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function finalizedHttpResponseArtifact(
	acquisition: Extract<AcquiredHttpResource, { kind: 'capture' }>,
	storedBodyLength: number
): HttpResponseArtifact {
	if (!Number.isSafeInteger(storedBodyLength) || storedBodyLength < 0) {
		throw new HttpAcquisitionError('HTTP_STORED_LENGTH_INVALID')
	}
	if (acquisition.body.kind === 'existing' && acquisition.body.length !== storedBodyLength) {
		throw new HttpAcquisitionError('HTTP_REUSED_LENGTH_MISMATCH')
	}
	return { ...acquisition.metadata, storedBodyLength }
}

async function credentialMatch(
	request: HttpRequestArtifact,
	context: VaultSessionContext,
	vault: SessionVaultClient
): Promise<VaultMatch> {
	if (request.authentication.mode === 'anonymous') return { outcome: 'none' }
	const match = await vault.match(request, context)
	if (match.outcome === 'ambiguous') throw new HttpAcquisitionError('HTTP_CREDENTIAL_AMBIGUOUS')
	if (match.outcome === 'none' && request.authentication.mode === 'mapped-required') {
		throw new HttpAcquisitionError('HTTP_CREDENTIAL_REQUIRED')
	}
	return match
}

async function credentialForUse(
	request: HttpRequestArtifact,
	match: VaultMatch,
	context: HttpAcquisitionContext,
	vault: SessionVaultClient
): Promise<RequestScopedCredentialAttachment | undefined> {
	if (match.outcome !== 'matched') return undefined
	return vault.resolveForUse({
		bindingRef: match.binding.bindingRef,
		request,
		requestDigest: httpRequestDigest(request),
		runId: context.runId,
		stepId: context.stepId,
		context
	})
}

function conditionalValidators(
	payload: HttpResponseArtifact
): HttpConditionalValidators | undefined {
	if (payload.etag) return { ifNoneMatch: payload.etag }
	if (payload.lastModified) return { ifModifiedSince: payload.lastModified }
	return undefined
}

function isRedirect(status: number): boolean {
	return [301, 302, 303, 307, 308].includes(status)
}

function contentLength(headers: Headers): number | null {
	const raw = headers.get('content-length')
	if (raw === null || !/^\d+$/.test(raw)) return null
	const value = Number(raw)
	return Number.isSafeInteger(value) ? value : null
}

function emptyBody(): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.close()
		}
	})
}

function assertContext(context: HttpAcquisitionContext): void {
	if (!context.runId || !context.stepId || !context.sessionId) {
		throw new HttpAcquisitionError('HTTP_SESSION_CONTEXT_REQUIRED')
	}
}

/** Fetch adapter which applies a resolved secret only while constructing the network request. */
export class FetchHttpResourceTransport implements HttpResourceTransport {
	constructor(private readonly fetcher: typeof fetch = fetch) {}

	async exchange(input: {
		request: HttpRequestArtifact
		credential?: RequestScopedCredentialAttachment
		conditional?: HttpConditionalValidators
		signal?: AbortSignal
	}): Promise<HttpTransportExchange> {
		const url = new URL(input.request.url)
		const headers = new Headers(input.request.headers.map(({ name, value }) => [name, value]))
		if (input.conditional?.ifNoneMatch) headers.set('if-none-match', input.conditional.ifNoneMatch)
		if (input.conditional?.ifModifiedSince) {
			headers.set('if-modified-since', input.conditional.ifModifiedSince)
		}
		if (input.credential) {
			if (input.credential.requestDigest !== httpRequestDigest(input.request)) {
				throw new HttpAcquisitionError('HTTP_CREDENTIAL_REQUEST_MISMATCH')
			}
			applyCredential(url, headers, input.credential)
		}
		const response = await this.fetcher(url, {
			method: input.request.method,
			headers,
			redirect: 'manual',
			...(input.signal && { signal: input.signal })
		})
		return {
			status: response.status,
			statusText: response.statusText,
			headers: new Headers(response.headers),
			body: response.body
		}
	}
}

function applyCredential(
	url: URL,
	headers: Headers,
	credential: RequestScopedCredentialAttachment
): void {
	const { rule, secret } = credential
	if (rule.kind === 'header') headers.set(rule.name, `${rule.prefix}${secret}`)
	if (rule.kind === 'cookie') headers.set('cookie', `${rule.name}=${secret}`)
	if (rule.kind === 'query') url.searchParams.set(rule.name, secret)
}

export class HttpAcquisitionError extends Error {
	constructor(readonly code: string) {
		super(code)
	}
}
