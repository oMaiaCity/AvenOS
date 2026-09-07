import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { ArtifactStoreClient } from '../src/client'

test('publication lookup treats only a scoped missing resource as absence', async () => {
	for (const [status, code] of [
		[404, 'RESOURCE_UNAVAILABLE'],
		[404, 'UNKNOWN'],
		[403, 'SCOPE_DENIED'],
		[503, 'UNAVAILABLE']
	] as const) {
		const client = new ArtifactStoreClient({
			baseUrl: 'https://store.example',
			bearerToken: () => 'test',
			fetch: async () => Response.json({ code, detail: code }, { status })
		})
		if (code === 'RESOURCE_UNAVAILABLE')
			expect(await client.committedClientRun('scope', 'publication')).toBeNull()
		else await expect(client.committedClientRun('scope', 'publication')).rejects.toThrow(code)
	}
})

test('query preserves zero watermark, exact type and occurrence cursor', async () => {
	let captured = ''
	const client = new ArtifactStoreClient({
		baseUrl: 'https://store.example',
		bearerToken: () => 'test',
		fetch: async (input) => {
			captured = String(input)
			return Response.json({ snapshotSequence: 0, items: [], nextAfter: null })
		}
	})
	await client.queryArtifacts('scope', {
		typeKey: 'banking.transaction',
		snapshotSequence: 0,
		after: 'last',
		limit: 1
	})
	expect(captured).toBe(
		'https://store.example/v1/scopes/scope/artifacts?typeKey=banking.transaction&snapshotSequence=0&after=last&limit=1'
	)
})

test('reconstructs a committed output from its receipt and exact blob bytes', async () => {
	const requests: string[] = []
	const client = new ArtifactStoreClient({
		baseUrl: 'https://store.example',
		bearerToken: () => 'test',
		fetch: async (input) => {
			const path = new URL(String(input)).pathname
			requests.push(path)
			if (path.endsWith('/publications/publication'))
				return Response.json({
					publication: {
						publicationId: 'publication',
						scopeId: 'scope',
						runId: 'run',
						artifacts: [
							{ artifactId: 'artifact', localKey: 'output', output: { role: 'text', ordinal: 0 } }
						]
					},
					run: { procedureKey: 'extract', procedureVersion: '1', parameters: {} }
				})
			if (path.endsWith('/content')) return new Response(new TextEncoder().encode('résumé'))
			return Response.json({
				artifactId: 'artifact',
				scopeId: 'scope',
				publicationId: 'publication',
				producerRunId: 'run',
				typeKey: 'text',
				typeVersion: 1,
				payload: { length: 8 },
				output: { role: 'text', ordinal: 0 },
				blob: { length: 8, sha256: createHash('sha256').update('résumé').digest('hex') }
			})
		}
	})
	const committed = await client.committedClientRun('scope', 'publication')
	expect(committed?.artifacts[0]?.blob?.base64).toBe(Buffer.from('résumé').toString('base64'))
	expect(committed?.receipt.artifacts).toEqual([{ artifactId: 'artifact', localKey: 'output' }])
	expect(requests).toHaveLength(3)
})

test('replay rejects mismatched occurrence identity and corrupted blob bytes', async () => {
	for (const mismatch of [
		'scopeId',
		'artifactId',
		'publicationId',
		'producerRunId',
		'output',
		'blob'
	]) {
		const envelope = {
			artifactId: 'artifact',
			scopeId: 'scope',
			publicationId: 'publication',
			producerRunId: 'run',
			typeKey: 'text',
			typeVersion: 1,
			payload: {},
			output: { role: 'text', ordinal: 0 },
			blob: { length: 2, sha256: createHash('sha256').update('ok').digest('hex') }
		}
		const client = new ArtifactStoreClient({
			baseUrl: 'https://store.example',
			bearerToken: () => 'test',
			fetch: async (input) => {
				const path = new URL(String(input)).pathname
				if (path.includes('/publications/'))
					return Response.json({
						publication: {
							scopeId: 'scope',
							publicationId: 'publication',
							runId: 'run',
							artifacts: [
								{ artifactId: 'artifact', localKey: 'text', output: { role: 'text', ordinal: 0 } }
							]
						},
						run: { procedureKey: 'extract', procedureVersion: '1', parameters: {} }
					})
				if (path.endsWith('/content')) return new Response(mismatch === 'blob' ? 'no' : 'ok')
				return Response.json(
					mismatch === 'blob'
						? envelope
						: {
								...envelope,
								[mismatch]: mismatch === 'output' ? { role: 'other', ordinal: 0 } : 'wrong'
							}
				)
			}
		})
		await expect(client.committedClientRun('scope', 'publication')).rejects.toThrow()
	}
})

test('client sends canonical publication bytes and the epoch precondition', async () => {
	let captured: Request | undefined
	const client = new ArtifactStoreClient({
		baseUrl: 'https://store.example/',
		bearerToken: () => 'secret',
		requestHeaders: () => ({ 'x-aven-artifact-database': 'cust_acme' }),
		fetch: async (input, init) => {
			captured = new Request(input, init)
			return new Response('{"replayed":false}', {
				headers: { 'content-type': 'application/json' }
			})
		}
	})
	await client.publish('scope', 'publication', 'epoch', {
		intent: { z: 1, a: 2 },
		blobAuthorities: {}
	})
	expect(captured?.method).toBe('PUT')
	expect(captured?.headers.get('authorization')).toBe('Bearer secret')
	expect(captured?.headers.get('x-aven-artifact-database')).toBe('cust_acme')
	expect(captured?.headers.get('if-artifact-store-epoch')).toBe('epoch')
	expect(await captured?.text()).toBe('{"blobAuthorities":{},"intent":{"a":2,"z":1}}')
})

test('client forwards a streaming upload with its exact declaration', async () => {
	let captured: Request | undefined
	const client = new ArtifactStoreClient({
		baseUrl: 'https://store.example',
		bearerToken: () => 'secret',
		fetch: async (input, init) => {
			captured = new Request(input, init)
			return new Response('{"length":5,"sha256":"abc"}', {
				headers: { 'content-type': 'application/json' }
			})
		}
	})
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('hello'))
			controller.close()
		}
	})

	await client.uploadBody(
		'scope',
		'claim',
		{ sha256: 'abc', length: 5, declaredMediaType: 'text/plain' },
		body
	)

	expect(captured?.method).toBe('PUT')
	expect(captured?.headers.get('authorization')).toBe('Bearer secret')
	expect(captured?.headers.get('content-length')).toBe('5')
	expect(captured?.headers.get('content-type')).toBe('text/plain')
	expect(captured?.headers.get('x-expected-sha256')).toBe('abc')
	expect(await captured?.text()).toBe('hello')
})
