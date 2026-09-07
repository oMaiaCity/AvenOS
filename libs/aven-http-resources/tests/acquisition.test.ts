import { describe, expect, test } from 'vitest'
import {
	acquireHttpResource,
	FetchHttpResourceTransport,
	finalizedHttpResponseArtifact,
	type HttpAcquisitionDependencies,
	type HttpResponseCandidate
} from '../src/acquisition'
import { type HttpResponseArtifact, parseHttpRequestArtifact } from '../src/contracts'
import { type CredentialBinding, createMemoryCustomerVault } from '../src/vault'

const TENANT = '10000000-0000-4000-8000-000000000001'
const SUBJECT = '20000000-0000-4000-8000-000000000002'
const CREDENTIAL = '40000000-0000-4000-8000-000000000004'
const BINDING = '50000000-0000-4000-8000-000000000005'
const PRIOR = '80000000-0000-4000-8000-000000000008'
const context = {
	tenantId: TENANT,
	subjectId: SUBJECT,
	sessionId: 'session-1',
	executionEnvironment: 'server' as const,
	runId: 'run-1',
	stepId: 'step-1'
}

const responsePayload: HttpResponseArtifact = {
	requestedUrl: 'https://api.example.com/reports/august',
	finalUrl: 'https://api.example.com/reports/august',
	statusCode: 200,
	cacheDisposition: 'new',
	declaredMediaType: 'application/pdf',
	declaredCharset: null,
	etag: '"report-v1"',
	lastModified: 'Sat, 30 Aug 2026 10:00:00 GMT',
	headers: [{ name: 'etag', values: ['"report-v1"'] }],
	redirectCount: 0,
	storedBodyLength: 12,
	capturedAt: '2026-08-30T10:00:00.000Z'
}

const candidate = (fresh: boolean): HttpResponseCandidate => ({
	artifactId: PRIOR,
	payload: responsePayload,
	body: { sha256: 'a'.repeat(64), length: 12 },
	fresh
})

function mappedRequest() {
	return parseHttpRequestArtifact({
		method: 'GET',
		url: 'https://api.example.com/reports/august',
		headers: [{ name: 'accept', value: 'application/pdf' }],
		authentication: { mode: 'mapped-required', purpose: 'report-read' }
	})
}

function binding(): CredentialBinding {
	return {
		bindingRef: BINDING,
		label: 'Reports API',
		ownerSubjectId: SUBJECT,
		credentialRef: CREDENTIAL,
		placements: ['server'],
		schemes: ['https'],
		host: { kind: 'exact', value: 'api.example.com' },
		ports: [443],
		pathPrefix: '/reports/',
		methods: ['GET'],
		purpose: 'report-read',
		attachment: { kind: 'header', name: 'authorization', prefix: 'Bearer ' },
		enabled: true
	}
}

async function configuredVault() {
	const vault = createMemoryCustomerVault({ tenantId: TENANT })
	await vault.administration.setCredential({
		ownerSubjectId: SUBJECT,
		credentialRef: CREDENTIAL,
		label: 'Reports token',
		secret: 'secret-token'
	})
	await vault.administration.putBinding(binding())
	return vault
}

describe('HTTP acquisition', () => {
	test('returns a fresh existing artifact without resolving or sending a credential', async () => {
		const vault = await configuredVault()
		let exchanges = 0
		const dependencies: HttpAcquisitionDependencies = {
			vault: vault.sessions,
			responses: { find: async () => candidate(true) },
			egress: { authorize: async () => {} },
			transport: {
				exchange: async () => {
					exchanges += 1
					throw new Error('network must not run')
				}
			}
		}

		expect(await acquireHttpResource(mappedRequest(), context, dependencies)).toEqual({
			kind: 'existing-response',
			responseArtifactId: PRIOR,
			cacheDisposition: 'fresh-cache'
		})
		expect(exchanges).toBe(0)
	})

	test('sends the exact ETag, injects the mapped header, and reuses the prior body on 304', async () => {
		const vault = await configuredVault()
		let sentAuthorization: string | null = null
		let sentEtag: string | null = null
		const transport = new FetchHttpResourceTransport(async (_url, init) => {
			const headers = new Headers(init?.headers)
			sentAuthorization = headers.get('authorization')
			sentEtag = headers.get('if-none-match')
			return new Response(null, {
				status: 304,
				headers: { etag: '"report-v1"', 'cache-control': 'private, max-age=60' }
			})
		})
		const acquired = await acquireHttpResource(mappedRequest(), context, {
			vault: vault.sessions,
			responses: { find: async () => candidate(false) },
			egress: { authorize: async () => {} },
			transport,
			now: () => new Date('2026-08-30T12:30:00.000Z')
		})

		expect(sentAuthorization).toBe('Bearer secret-token')
		expect(sentEtag).toBe('"report-v1"')
		expect(acquired).toMatchObject({
			kind: 'capture',
			metadata: {
				statusCode: 200,
				networkStatusCode: 304,
				cacheDisposition: 'revalidated',
				representationSourceArtifactId: PRIOR,
				capturedAt: '2026-08-30T12:30:00.000Z'
			},
			body: { kind: 'existing', artifactId: PRIOR, sha256: 'a'.repeat(64), length: 12 },
			credential: {
				credentialRef: CREDENTIAL,
				bindingRef: BINDING,
				secretVersion: 1,
				attachmentKind: 'header'
			}
		})
		if (acquired.kind !== 'capture') return
		expect(JSON.stringify(acquired)).not.toContain('secret-token')
		expect(finalizedHttpResponseArtifact(acquired, 12).storedBodyLength).toBe(12)
	})

	test('captures non-success HTTP status and body as observed data', async () => {
		const vault = createMemoryCustomerVault({ tenantId: TENANT })
		const request = parseHttpRequestArtifact({
			method: 'HEAD',
			url: 'https://public.example.test/missing'
		})
		const acquired = await acquireHttpResource(request, context, {
			vault: vault.sessions,
			responses: { find: async () => null },
			egress: { authorize: async () => {} },
			transport: new FetchHttpResourceTransport(
				async () =>
					new Response(null, {
						status: 404,
						headers: { 'content-type': 'text/plain; charset=utf-8' }
					})
			)
		})

		expect(acquired).toMatchObject({
			kind: 'capture',
			metadata: {
				statusCode: 404,
				declaredMediaType: 'text/plain',
				declaredCharset: 'utf-8'
			},
			credential: null
		})
	})

	test('does not forward an initial credential across an unmatched redirect', async () => {
		const vault = await configuredVault()
		const seen: Array<{ url: string; authorization: string | null }> = []
		const request = parseHttpRequestArtifact({
			...mappedRequest(),
			authentication: { mode: 'mapped-if-present', purpose: 'report-read' }
		})
		const acquired = await acquireHttpResource(request, context, {
			vault: vault.sessions,
			responses: { find: async () => null },
			egress: { authorize: async () => {} },
			transport: new FetchHttpResourceTransport(async (url, init) => {
				seen.push({
					url: String(url),
					authorization: new Headers(init?.headers).get('authorization')
				})
				if (seen.length === 1) {
					return new Response(null, {
						status: 302,
						headers: { location: 'https://cdn.example.net/report.pdf' }
					})
				}
				return new Response('pdf bytes', {
					status: 200,
					headers: { 'content-type': 'application/pdf' }
				})
			})
		})

		expect(seen).toEqual([
			{
				url: 'https://api.example.com/reports/august',
				authorization: 'Bearer secret-token'
			},
			{ url: 'https://cdn.example.net/report.pdf', authorization: null }
		])
		expect(acquired).toMatchObject({
			kind: 'capture',
			metadata: { finalUrl: 'https://cdn.example.net/report.pdf', redirectCount: 1 },
			credential: null
		})
	})
})
