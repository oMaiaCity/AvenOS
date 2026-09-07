import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
	acquireHttpResource,
	FetchHttpResourceTransport,
	finalizedHttpResponseArtifact,
	type HttpResponseCandidate
} from '../src/acquisition'
import { parseHttpRequestArtifact } from '../src/contracts'
import { createMemoryCustomerVault } from '../src/vault'

const TENANT = '10000000-0000-4000-8000-000000000001'
const SUBJECT = '20000000-0000-4000-8000-000000000002'
const CREDENTIAL = '40000000-0000-4000-8000-000000000004'
const BINDING = '50000000-0000-4000-8000-000000000005'
const RESPONSE_ARTIFACT = '80000000-0000-4000-8000-000000000008'
const BODY = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x61, 0x76, 0x65, 0x6e])
const ETAG = '"fixture-v1"'

describe('authenticated HTTP resource end to end', () => {
	let origin = ''
	let port = 0
	let bodyTransfers = 0
	const observations: Array<{
		path: string
		method: string
		authorization: string | undefined
		ifNoneMatch: string | undefined
	}> = []
	const server = createServer((request, response) => {
		observations.push({
			path: request.url ?? '',
			method: request.method ?? '',
			authorization: request.headers.authorization,
			ifNoneMatch: request.headers['if-none-match']
		})
		if (request.headers.authorization !== 'Bearer customer-secret') {
			response.writeHead(401)
			response.end()
			return
		}
		if (request.url === '/reports/start') {
			response.writeHead(302, { location: '/reports/final' })
			response.end()
			return
		}
		if (request.url !== '/reports/final') {
			response.writeHead(404)
			response.end()
			return
		}
		if (request.headers['if-none-match'] === ETAG) {
			response.writeHead(304, { etag: ETAG, 'cache-control': 'private, max-age=60' })
			response.end()
			return
		}
		bodyTransfers += 1
		response.writeHead(200, {
			'content-type': 'application/pdf',
			'content-length': String(BODY.byteLength),
			etag: ETAG,
			'set-cookie': 'remote-session=must-not-survive; Secure; HttpOnly'
		})
		response.end(BODY)
	})

	beforeAll(async () => {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject)
			server.listen(0, '127.0.0.1', () => resolve())
		})
		const address = server.address()
		if (!address || typeof address === 'string') throw new Error('fixture server has no TCP port')
		port = address.port
		origin = `http://127.0.0.1:${port}`
	})

	afterAll(async () => {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		)
	})

	test('downloads once, commits exact bytes, then revalidates and reuses the body', async () => {
		const vault = createMemoryCustomerVault({
			tenantId: TENANT,
			now: () => new Date('2026-08-30T12:00:00.000Z')
		})
		await vault.administration.setCredential({
			ownerSubjectId: SUBJECT,
			credentialRef: CREDENTIAL,
			label: 'Fixture reports token',
			secret: 'customer-secret'
		})
		await vault.administration.putBinding({
			bindingRef: BINDING,
			label: 'Fixture reports',
			ownerSubjectId: SUBJECT,
			credentialRef: CREDENTIAL,
			placements: ['server'],
			schemes: ['http'],
			host: { kind: 'exact', value: '127.0.0.1' },
			ports: [port],
			pathPrefix: '/reports/',
			methods: ['GET'],
			purpose: 'report-read',
			attachment: { kind: 'header', name: 'authorization', prefix: 'Bearer ' },
			enabled: true
		})
		const request = parseHttpRequestArtifact(
			{
				method: 'GET',
				url: `${origin}/reports/start`,
				authentication: { mode: 'mapped-required', purpose: 'report-read' },
				freshness: 'revalidate'
			},
			{ allowHttpOrigins: [origin] }
		)
		let indexed: HttpResponseCandidate | null = null
		const dependencies = {
			vault: vault.sessions,
			responses: { find: async () => indexed },
			egress: {
				authorize: async (candidate: typeof request) => {
					if (new URL(candidate.url).origin !== origin) throw new Error('fixture egress escaped')
				}
			},
			transport: new FetchHttpResourceTransport(),
			requestPolicy: { allowHttpOrigins: [origin] },
			now: () => new Date('2026-08-30T12:00:00.000Z')
		}
		const context = {
			tenantId: TENANT,
			subjectId: SUBJECT,
			sessionId: 'session-e2e',
			executionEnvironment: 'server' as const,
			runId: 'run-e2e',
			stepId: 'fetch-e2e'
		}

		const downloaded = await acquireHttpResource(request, context, dependencies)
		expect(downloaded.kind).toBe('capture')
		if (downloaded.kind !== 'capture' || downloaded.body.kind !== 'stream') return
		const stored = new Uint8Array(await new Response(downloaded.body.stream).arrayBuffer())
		expect(stored).toEqual(BODY)
		const payload = finalizedHttpResponseArtifact(downloaded, stored.byteLength)
		expect(payload).toMatchObject({
			requestedUrl: `${origin}/reports/start`,
			finalUrl: `${origin}/reports/final`,
			statusCode: 200,
			cacheDisposition: 'new',
			declaredMediaType: 'application/pdf',
			etag: ETAG,
			redirectCount: 1,
			storedBodyLength: BODY.byteLength
		})
		expect(payload.headers.some((header) => header.name === 'set-cookie')).toBe(false)
		expect(JSON.stringify({ downloaded, payload })).not.toContain('customer-secret')
		indexed = {
			artifactId: RESPONSE_ARTIFACT,
			payload,
			body: { sha256: 'a'.repeat(64), length: stored.byteLength },
			fresh: false
		}

		const revalidated = await acquireHttpResource(request, context, dependencies)
		expect(revalidated).toMatchObject({
			kind: 'capture',
			metadata: {
				statusCode: 200,
				networkStatusCode: 304,
				cacheDisposition: 'revalidated',
				representationSourceArtifactId: RESPONSE_ARTIFACT
			},
			body: {
				kind: 'existing',
				artifactId: RESPONSE_ARTIFACT,
				length: BODY.byteLength
			}
		})
		expect(bodyTransfers).toBe(1)
		expect(observations).toEqual([
			{
				path: '/reports/start',
				method: 'GET',
				authorization: 'Bearer customer-secret',
				ifNoneMatch: undefined
			},
			{
				path: '/reports/final',
				method: 'GET',
				authorization: 'Bearer customer-secret',
				ifNoneMatch: undefined
			},
			{
				path: '/reports/start',
				method: 'GET',
				authorization: 'Bearer customer-secret',
				ifNoneMatch: undefined
			},
			{
				path: '/reports/final',
				method: 'GET',
				authorization: 'Bearer customer-secret',
				ifNoneMatch: ETAG
			}
		])
	})
})
