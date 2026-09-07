import { createHash } from 'node:crypto'
import { z } from 'zod'

const HTTP_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const FORBIDDEN_REQUEST_HEADERS = new Set([
	'authorization',
	'connection',
	'content-length',
	'cookie',
	'forwarded',
	'host',
	'if-modified-since',
	'if-none-match',
	'keep-alive',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
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

const requestHeaderSchema = z
	.object({
		name: z.string().min(1).max(128),
		value: z.string().max(8_192)
	})
	.strict()

const authenticationSchema = z
	.object({
		mode: z.enum(['anonymous', 'mapped-required', 'mapped-if-present']).default('anonymous'),
		purpose: z.string().trim().min(1).max(128).optional()
	})
	.strict()
	.superRefine((value, context) => {
		if (value.mode !== 'anonymous' && !value.purpose) {
			context.addIssue({
				code: 'custom',
				path: ['purpose'],
				message: 'mapped authentication needs a purpose'
			})
		}
		if (value.mode === 'anonymous' && value.purpose) {
			context.addIssue({
				code: 'custom',
				path: ['purpose'],
				message: 'anonymous requests have no credential purpose'
			})
		}
	})

const requestSchema = z
	.object({
		method: z.enum(['GET', 'HEAD']),
		url: z.string().min(1).max(8_192),
		headers: z.array(requestHeaderSchema).max(64).default([]),
		authentication: authenticationSchema.default({ mode: 'anonymous' }),
		redirects: z
			.object({
				mode: z.enum(['follow', 'manual']).default('follow'),
				maximumHops: z.number().int().min(0).max(10).default(5)
			})
			.strict()
			.default({ mode: 'follow', maximumHops: 5 }),
		freshness: z.enum(['revalidate', 'offline-only', 'new-capture']).default('revalidate')
	})
	.strict()

export type HttpMethod = 'GET' | 'HEAD'
export type HttpAuthenticationMode = 'anonymous' | 'mapped-required' | 'mapped-if-present'
export type HttpFreshness = 'revalidate' | 'offline-only' | 'new-capture'

export interface HttpRequestHeader {
	name: string
	value: string
}

export interface HttpRequestArtifact {
	method: HttpMethod
	url: string
	headers: HttpRequestHeader[]
	authentication: {
		mode: HttpAuthenticationMode
		purpose?: string
	}
	redirects: {
		mode: 'follow' | 'manual'
		maximumHops: number
	}
	freshness: HttpFreshness
}

export interface HttpRequestPolicy {
	/** HTTPS is the default. Exact HTTP origins are a local-development exception. */
	allowHttpOrigins?: readonly string[]
}

/** Parse, normalize, and reject credential-bearing or transport-controlled request fields. */
export function parseHttpRequestArtifact(
	input: unknown,
	policy: HttpRequestPolicy = {}
): HttpRequestArtifact {
	const parsed = requestSchema.parse(input)
	let url: URL
	try {
		url = new URL(parsed.url)
	} catch {
		throw new HttpRequestContractError('HTTP_REQUEST_URL_INVALID')
	}
	if (url.username || url.password)
		throw new HttpRequestContractError('HTTP_REQUEST_USERINFO_FORBIDDEN')
	if (url.hash) throw new HttpRequestContractError('HTTP_REQUEST_FRAGMENT_FORBIDDEN')
	if (!['https:', 'http:'].includes(url.protocol)) {
		throw new HttpRequestContractError('HTTP_REQUEST_SCHEME_FORBIDDEN')
	}
	if (url.protocol === 'http:' && !allowedHttpOrigin(url, policy.allowHttpOrigins ?? [])) {
		throw new HttpRequestContractError('HTTP_REQUEST_INSECURE_ORIGIN_FORBIDDEN')
	}
	url.hostname = url.hostname.toLowerCase()

	const names = new Set<string>()
	const headers = parsed.headers.map((header) => {
		const name = header.name.toLowerCase()
		if (!HTTP_TOKEN.test(name) || FORBIDDEN_REQUEST_HEADERS.has(name)) {
			throw new HttpRequestContractError('HTTP_REQUEST_HEADER_FORBIDDEN')
		}
		if (containsControlCharacter(header.value)) {
			throw new HttpRequestContractError('HTTP_REQUEST_HEADER_INVALID')
		}
		if (names.has(name)) throw new HttpRequestContractError('HTTP_REQUEST_HEADER_DUPLICATE')
		names.add(name)
		return { name, value: header.value.trim() }
	})
	headers.sort((left, right) => left.name.localeCompare(right.name))

	return {
		method: parsed.method,
		url: url.toString(),
		headers,
		authentication: {
			mode: parsed.authentication.mode,
			...(parsed.authentication.purpose && { purpose: parsed.authentication.purpose })
		},
		redirects: parsed.redirects,
		freshness: parsed.freshness
	}
}

function allowedHttpOrigin(url: URL, origins: readonly string[]): boolean {
	return origins.some((origin) => {
		try {
			return new URL(origin).origin === url.origin
		} catch {
			return false
		}
	})
}

export class HttpRequestContractError extends Error {
	constructor(readonly code: string) {
		super(code)
	}
}

export function httpRequestDigest(request: HttpRequestArtifact): string {
	return createHash('sha256').update(canonicalJson(request)).digest('hex')
}

export interface RetainedHttpResponseHeader {
	name: string
	values: string[]
}

export type HttpCacheDisposition = 'new' | 'fresh-cache' | 'revalidated'

export interface HttpResponseArtifact {
	requestedUrl: string
	finalUrl: string
	statusCode: number
	networkStatusCode?: number
	cacheDisposition: HttpCacheDisposition
	representationSourceArtifactId?: string
	protocol?: string
	declaredMediaType: string | null
	declaredCharset: string | null
	etag: string | null
	lastModified: string | null
	headers: RetainedHttpResponseHeader[]
	redirectCount: number
	storedBodyLength: number
	capturedAt: string
}

const RETAINED_RESPONSE_HEADERS = new Set([
	'cache-control',
	'content-disposition',
	'content-type',
	'date',
	'etag',
	'expires',
	'last-modified',
	'vary'
])

/** Copy only bounded representation metadata; cookies and credential challenges never survive. */
export function retainedResponseHeaders(headers: Headers): RetainedHttpResponseHeader[] {
	const retained: RetainedHttpResponseHeader[] = []
	for (const name of [...RETAINED_RESPONSE_HEADERS].sort()) {
		const value = headers.get(name)
		if (value === null) continue
		if (containsControlCharacter(value) || value.length > 16_384) continue
		retained.push({ name, values: [value] })
	}
	return retained
}

export function declaredContentType(headers: Headers): {
	mediaType: string | null
	charset: string | null
} {
	const value = headers.get('content-type')
	if (!value) return { mediaType: null, charset: null }
	const [rawMediaType, ...parameters] = value.split(';')
	const mediaType = rawMediaType?.trim().toLowerCase() || null
	let charset: string | null = null
	for (const parameter of parameters) {
		const [name, rawValue] = parameter.split('=', 2)
		if (name?.trim().toLowerCase() === 'charset') {
			charset = rawValue?.trim().replace(/^"|"$/g, '').toLowerCase() || null
		}
	}
	return { mediaType, charset }
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
	return `{${Object.entries(value as Record<string, unknown>)
		.filter(([, item]) => item !== undefined)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
		.join(',')}}`
}
