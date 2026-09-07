import type { ArtifactStoreFetch } from '@avenos/artifact-store'
import { describe, expect, test } from 'vitest'
import { ArtifactFileService } from '../src/lib/server/artifacts/service'

const scopeId = '11111111-1111-4111-8111-111111111111'
const publicationId = '22222222-2222-4222-8222-222222222222'
const fanoutPublicationId = '22222222-2222-4222-8222-222222222223'
const rankPublicationId = '22222222-2222-4222-8222-222222222224'
const artifactId = '33333333-3333-4333-8333-333333333333'
const intentId = '44444444-4444-4444-8444-444444444444'
const intentArtifactId = '55555555-5555-4555-8555-555555555555'
const layoutArtifactId = '66666666-6666-4666-8666-666666666666'
const pageArtifactId = '77777777-7777-4777-8777-777777777777'
const observedAt = '2026-08-24T12:00:00.000Z'
const sha256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

describe('artifact file coordinator', () => {
	test('streams bytes and publishes an authenticated core.file root', async () => {
		let uploaded = ''
		let published: Record<string, unknown> | undefined
		const fetch: ArtifactStoreFetch = async (input, init) => {
			const request = new Request(input, init)
			expect(request.headers.get('authorization')).toBe('Bearer service-token')
			expect(request.headers.get('x-aven-artifact-database')).toBe('cust_acme')

			if (request.url.endsWith('/v1/context')) {
				return new Response('{"storeEpoch":"epoch-1"}')
			}
			if (request.url.includes('/uploads/')) {
				expect(request.headers.get('content-length')).toBe('5')
				expect(request.headers.get('content-type')).toBe('text/plain')
				expect(request.headers.get('x-expected-sha256')).toBe(sha256)
				uploaded = await request.text()
				return new Response(`{"length":5,"sha256":"${sha256}"}`)
			}
			if (request.url.endsWith(`/publications/${publicationId}`)) {
				expect(request.headers.get('if-artifact-store-epoch')).toBe('epoch-1')
				published = JSON.parse(await request.text()) as Record<string, unknown>
				return new Response(
					`{"artifacts":[{"artifactId":"${artifactId}","localKey":"file"},{"artifactId":"${intentArtifactId}","localKey":"intent"}],` +
						`"publicationId":"${publicationId}","replayed":false,"scopeSequence":7}`
				)
			}
			throw new Error(`Unexpected Artifact Store request: ${request.url}`)
		}
		const service = ArtifactFileService.fromConfig(
			{
				ARTIFACT_STORE_BASE_URL: 'http://artifact-store.test',
				ARTIFACT_STORE_BEARER_TOKEN: 'service-token'
			},
			fetch
		)
		expect(service).not.toBeNull()

		const receipt = await service?.publishFile({
			userId: 'user-7',
			databaseName: 'cust_acme',
			scopeId,
			publicationId,
			intentId,
			observedAt,
			originalName: 'contract.pdf',
			mediaType: 'text/plain',
			sha256,
			length: 5,
			sourceKind: 'client-actor-ingest',
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('hello'))
					controller.close()
				}
			})
		})

		expect(uploaded).toBe('hello')
		expect(receipt).toEqual({
			publicationId,
			intentId,
			intentDeclarationArtifactId: intentArtifactId,
			artifactId,
			originalName: 'contract.pdf',
			mediaType: 'text/plain',
			sha256,
			length: 5,
			scopeSequence: 7,
			replayed: false
		})
		const intent = published?.intent as Record<string, unknown>
		expect(intent.scopeId).toBe(scopeId)
		expect(intent.rootActor).toEqual({ kind: 'user', id: 'user:user-7' })
		expect(intent.artifacts).toEqual([
			{
				localKey: 'file',
				typeKey: 'core.file',
				typeVersion: 1,
				payload: {
					originalName: 'contract.pdf',
					declaredMediaType: 'text/plain',
					sourceKind: 'client-actor-ingest'
				},
				blob: { sha256, length: 5 },
				references: [],
				output: null
			},
			{
				localKey: 'intent',
				typeKey: 'intent.declaration',
				typeVersion: 1,
				payload: { intentId, title: 'contract.pdf', triggerKind: 'file-upload', observedAt },
				blob: null,
				references: [],
				output: null
			}
		])
	})

	test('publishes client actor outputs with server-owned scope, attribution and blob claims', async () => {
		let published: Record<string, unknown> | undefined
		let uploaded = ''
		const fetch: ArtifactStoreFetch = async (input, init) => {
			const request = new Request(input, init)
			if (request.url.endsWith('/v1/context')) return new Response('{"storeEpoch":"epoch-1"}')
			if (request.url.includes('/uploads/')) {
				uploaded = await request.text()
				return new Response(`{"length":5,"sha256":"${sha256}"}`)
			}
			if (request.url.endsWith(`/publications/${publicationId}`)) {
				published = JSON.parse(await request.text()) as Record<string, unknown>
				return new Response(
					JSON.stringify({
						publicationId,
						runId: intentId,
						replayed: false,
						scopeSequence: 8,
						artifacts: [
							{ localKey: 'text', artifactId },
							{ localKey: 'layout', artifactId: layoutArtifactId }
						]
					})
				)
			}
			throw new Error(`Unexpected Artifact Store request: ${request.url}`)
		}
		const service = ArtifactFileService.fromConfig(
			{
				ARTIFACT_STORE_BASE_URL: 'http://artifact-store.test',
				ARTIFACT_STORE_BEARER_TOKEN: 'service-token'
			},
			fetch
		)
		const receipt = await service?.publishClientRun({
			userId: 'user-7',
			databaseName: 'cust_acme',
			scopeId,
			publicationId,
			procedureKey: 'client.extract-native-text',
			procedureVersion: 'client-v1',
			inputs: [
				{ role: 'source', ordinal: 0, artifactId: intentArtifactId },
				{ role: 'page', ordinal: 0, artifactId: pageArtifactId }
			],
			parameters: { page: 1 },
			artifacts: [
				{
					localKey: 'text',
					typeKey: 'docs.extracted-text',
					typeVersion: 1,
					payload: {
						method: 'native',
						language: 'und',
						pageCount: 1,
						characterCount: 5,
						complete: true
					},
					output: { role: 'text', ordinal: 0 },
					blob: { mediaType: 'text/plain; charset=utf-8', base64: 'aGVsbG8=' }
				},
				{
					localKey: 'layout',
					typeKey: 'docs.text-layout',
					typeVersion: 1,
					payload: {
						coordinateSpace: 'normalized-millionths',
						spans: [],
						complete: true
					},
					output: { role: 'layout', ordinal: 0 }
				}
			],
			evidence: []
		})

		expect(uploaded).toBe('hello')
		expect(receipt?.artifacts).toEqual([
			{ localKey: 'text', artifactId },
			{ localKey: 'layout', artifactId: layoutArtifactId }
		])
		const intent = published?.intent as Record<string, unknown>
		expect(intent.scopeId).toBe(scopeId)
		expect(intent.run).toMatchObject({
			procedureKey: 'client.extract-native-text',
			initiator: { kind: 'user', id: 'user:user-7' },
			executor: { kind: 'agent', id: 'native-text-extractor' },
			implementation: {
				adapter: 'avenos-client-actor',
				deterministic: true
			}
		})
	})

	test('rejects forged client procedure shapes before contacting the Artifact Store', async () => {
		let requests = 0
		const service = ArtifactFileService.fromConfig(
			{
				ARTIFACT_STORE_BASE_URL: 'http://artifact-store.test',
				ARTIFACT_STORE_BEARER_TOKEN: 'service-token'
			},
			async () => {
				requests += 1
				throw new Error('must not contact the Artifact Store')
			}
		)

		await expect(
			service?.publishClientRun({
				userId: 'user-7',
				databaseName: 'cust_acme',
				scopeId,
				publicationId,
				procedureKey: 'client.inspect-file',
				procedureVersion: 'client-v1',
				inputs: [{ role: 'source', ordinal: 0, artifactId: intentArtifactId }],
				parameters: {},
				artifacts: [
					{
						localKey: 'classification',
						typeKey: 'core.content-classification',
						typeVersion: 1,
						payload: { subjectLevel: 'file' },
						output: { role: 'classification', ordinal: 0 }
					}
				],
				evidence: []
			})
		).rejects.toMatchObject({ status: 400, code: 'CLIENT_PROCEDURE_CONTRACT_INVALID' })
		expect(requests).toBe(0)
	})

	test('records model-backed client runs as non-deterministic with their model receipt', async () => {
		let published: Record<string, unknown> | undefined
		const fetch: ArtifactStoreFetch = async (input, init) => {
			const request = new Request(input, init)
			if (request.url.endsWith('/v1/context')) return new Response('{"storeEpoch":"epoch-1"}')
			if (request.url.endsWith(`/publications/${publicationId}`)) {
				published = JSON.parse(await request.text()) as Record<string, unknown>
				return new Response(
					JSON.stringify({
						publicationId,
						runId: intentId,
						replayed: false,
						scopeSequence: 9,
						artifacts: [{ localKey: 'classification', artifactId }]
					})
				)
			}
			throw new Error(`Unexpected Artifact Store request: ${request.url}`)
		}
		const service = ArtifactFileService.fromConfig(
			{
				ARTIFACT_STORE_BASE_URL: 'http://artifact-store.test',
				ARTIFACT_STORE_BEARER_TOKEN: 'service-token'
			},
			fetch
		)
		const modelReceipt = {
			model: 'gpt-4.1',
			profile: 'openai-json-schema',
			requestKey: 'request-key',
			promptDigest: 'prompt-digest',
			implementationDigest: 'implementation-digest'
		}
		await service?.publishClientRun({
			userId: 'user-7',
			databaseName: 'cust_acme',
			scopeId,
			publicationId,
			procedureKey: 'client.classify-document-model',
			procedureVersion: 'client-v1',
			inputs: [
				{ role: 'source', ordinal: 0, artifactId: intentArtifactId },
				{ role: 'text', ordinal: 0, artifactId },
				{ role: 'layout', ordinal: 0, artifactId: layoutArtifactId }
			],
			parameters: { modelReceipt },
			artifacts: [
				{
					localKey: 'classification',
					typeKey: 'core.document-classification',
					typeVersion: 1,
					payload: {
						rawKind: 'invoice',
						resolvedKind: 'invoice',
						family: 'invoice-family',
						confidenceBps: 9900,
						reason: 'Visible invoice.',
						resolutionMode: 'model',
						alternatives: []
					},
					output: { role: 'classification', ordinal: 0 }
				}
			],
			evidence: []
		})

		const intent = published?.intent as Record<string, unknown>
		expect(intent.run).toMatchObject({
			executor: { kind: 'agent', id: 'document-kind-classifier' },
			implementation: { adapter: 'avenos-client-actor', deterministic: false },
			receipt: { outcome: 'succeeded', model: modelReceipt }
		})
	})

	test('accepts canonical statement, bounded fan-out, and ranking runs with deterministic attribution', async () => {
		const published: Record<string, unknown>[] = []
		const fetch: ArtifactStoreFetch = async (input, init) => {
			const request = new Request(input, init)
			if (request.url.endsWith('/v1/context')) return new Response('{"storeEpoch":"epoch-1"}')
			if (request.url.includes('/publications/')) {
				const body = JSON.parse(await request.text()) as Record<string, unknown>
				published.push(body)
				const intent = body.intent as {
					publicationId: string
					artifacts: Array<{ localKey: string }>
				}
				return new Response(
					JSON.stringify({
						publicationId: intent.publicationId,
						runId: intentId,
						replayed: false,
						scopeSequence: published.length,
						artifacts: intent.artifacts.map((artifact, index) => ({
							localKey: artifact.localKey,
							artifactId: index === 0 ? artifactId : layoutArtifactId
						}))
					})
				)
			}
			throw new Error(`Unexpected Artifact Store request: ${request.url}`)
		}
		const service = ArtifactFileService.fromConfig(
			{
				ARTIFACT_STORE_BASE_URL: 'http://artifact-store.test',
				ARTIFACT_STORE_BEARER_TOKEN: 'service-token'
			},
			fetch
		)

		await service?.publishClientRun({
			userId: 'user-7',
			databaseName: 'cust_acme',
			scopeId,
			publicationId,
			procedureKey: 'client.normalize-statement',
			procedureVersion: 'client-v1',
			inputs: [
				{ role: 'candidate', ordinal: 0, artifactId: pageArtifactId },
				{ role: 'validation', ordinal: 0, artifactId: layoutArtifactId }
			],
			parameters: {},
			artifacts: [
				{
					localKey: 'normalized-statement',
					typeKey: 'banking.statement',
					typeVersion: 1,
					payload: { accountRef: 'iban:DE89' },
					output: { role: 'statement', ordinal: 0 }
				}
			],
			evidence: []
		})
		await service?.publishClientRun({
			userId: 'user-7',
			databaseName: 'cust_acme',
			scopeId,
			publicationId: fanoutPublicationId,
			procedureKey: 'client.fanout-statement-transactions',
			procedureVersion: 'client-v1',
			inputs: [
				{ role: 'candidate', ordinal: 0, artifactId: pageArtifactId },
				{ role: 'validation', ordinal: 0, artifactId: layoutArtifactId },
				{ role: 'statement', ordinal: 0, artifactId }
			],
			parameters: { offset: 64 },
			artifacts: [
				{
					localKey: 'transaction-065',
					typeKey: 'banking.transaction',
					typeVersion: 1,
					payload: { dedupKey: 'provider:tx-65', sourceOrdinal: 64 },
					output: { role: 'transaction', ordinal: 0 }
				}
			],
			evidence: [
				{
					ordinal: 0,
					outputLocalKey: 'transaction-065',
					outputLocator: { kind: 'artifact-root' },
					inputRole: 'candidate',
					inputOrdinal: 0,
					inputLocator: { kind: 'json-pointer', pointer: '/transactions/64' }
				}
			]
		})
		await service?.publishClientRun({
			userId: 'user-7',
			databaseName: 'cust_acme',
			scopeId,
			publicationId: rankPublicationId,
			procedureKey: 'client.rank-invoice-transactions',
			procedureVersion: 'client-v1',
			inputs: [
				{ role: 'open-item', ordinal: 0, artifactId: pageArtifactId },
				{ role: 'transaction', ordinal: 0, artifactId }
			],
			parameters: {},
			artifacts: [
				{
					localKey: 'match-001',
					typeKey: 'reconciliation.match-candidate',
					typeVersion: 2,
					payload: {
						matcherVersion: 'invoice-transaction-v2',
						transactionInputOrdinal: 0,
						rank: 1,
						pairEligible: false
					},
					output: { role: 'match-candidate', ordinal: 0 }
				}
			],
			evidence: [
				{
					ordinal: 0,
					outputLocalKey: 'match-001',
					outputLocator: { kind: 'artifact-root' },
					inputRole: 'open-item',
					inputOrdinal: 0,
					inputLocator: { kind: 'artifact-root' }
				},
				{
					ordinal: 1,
					outputLocalKey: 'match-001',
					outputLocator: { kind: 'json-pointer', pointer: '/transactionDedupKey' },
					inputRole: 'transaction',
					inputOrdinal: 0,
					inputLocator: { kind: 'json-pointer', pointer: '/dedupKey' }
				}
			]
		})

		expect(
			published.map((body) => {
				const intent = body.intent as Record<string, unknown>
				const run = intent.run as Record<string, unknown>
				return run.executor
			})
		).toEqual([
			{ kind: 'agent', id: 'statement-normalizer' },
			{ kind: 'agent', id: 'statement-transaction-fanout' },
			{ kind: 'agent', id: 'reconciliation-ranker' }
		])
		expect(
			published.map((body) => {
				const intent = body.intent as Record<string, unknown>
				const run = intent.run as Record<string, unknown>
				return run.implementation
			})
		).toEqual([
			expect.objectContaining({ deterministic: true }),
			expect.objectContaining({ deterministic: true }),
			expect.objectContaining({ deterministic: true })
		])
	})

	test('browses the committed artifact feed newest first', async () => {
		const fetch: ArtifactStoreFetch = async (input, init) => {
			const request = new Request(input, init)
			expect(request.headers.get('authorization')).toBe('Bearer service-token')
			if (request.url.endsWith('/v1/context')) {
				return new Response(`{"storeEpoch":"${publicationId}"}`)
			}
			if (request.url.includes('/publications?')) {
				if (new URL(request.url).searchParams.get('afterSequence') !== '0') {
					return new Response(
						JSON.stringify({
							storeEpoch: publicationId,
							nextAfterSequence: null,
							items: []
						})
					)
				}
				return new Response(
					JSON.stringify({
						storeEpoch: publicationId,
						nextAfterSequence: 2,
						items: [
							{
								publicationId,
								scopeSequence: 2,
								kind: 'run',
								runId: intentId,
								committedAt: observedAt,
								artifacts: [
									{
										artifactId,
										localKey: 'result',
										publicationOrdinal: 0,
										typeKey: 'docs.extracted-text',
										typeVersion: 1,
										artifactSha256: sha256,
										producerRunId: intentId,
										output: { role: 'result', ordinal: 0 }
									}
								]
							}
						]
					})
				)
			}
			if (request.url.endsWith(`/artifacts/${artifactId}/producer-inputs`)) {
				return new Response(
					JSON.stringify({
						artifactId,
						producerRunId: intentId,
						inputs: [{ role: 'source', ordinal: 0, artifactId: intentArtifactId }]
					})
				)
			}
			throw new Error(`Unexpected Artifact Store request: ${request.url}`)
		}
		const service = ArtifactFileService.fromConfig(
			{
				ARTIFACT_STORE_BASE_URL: 'http://artifact-store.test',
				ARTIFACT_STORE_BEARER_TOKEN: 'service-token'
			},
			fetch
		)

		const result = await service?.browse('cust_acme', scopeId)
		expect(result).toEqual({
			storeEpoch: publicationId,
			truncated: false,
			artifacts: [
				{
					artifactId,
					localKey: 'result',
					publicationOrdinal: 0,
					typeKey: 'docs.extracted-text',
					typeVersion: 1,
					artifactSha256: sha256,
					producerRunId: intentId,
					output: { role: 'result', ordinal: 0 },
					inputs: [{ role: 'source', ordinal: 0, artifactId: intentArtifactId }],
					publicationId,
					scopeSequence: 2,
					publicationKind: 'run',
					runId: intentId,
					committedAt: observedAt
				}
			]
		})
	})

	test('loads direct supporting evidence separately from the feed', async () => {
		const fetch: ArtifactStoreFetch = async (input) => {
			const request = new Request(input)
			expect(request.url).toContain(`/artifacts/${artifactId}/supporting-evidence`)
			return new Response(
				JSON.stringify({
					artifactId,
					evidence: [
						{
							ordinal: 0,
							outputArtifactId: artifactId,
							outputLocator: { kind: 'json-pointer', pointer: '/supplier' },
							inputRole: 'source',
							inputOrdinal: 0,
							inputArtifactId: intentArtifactId,
							inputLocator: {
								kind: 'page-region',
								page: 1,
								x: 100,
								y: 200,
								width: 300,
								height: 400
							}
						}
					]
				})
			)
		}
		const service = ArtifactFileService.fromConfig(
			{
				ARTIFACT_STORE_BASE_URL: 'http://artifact-store.test',
				ARTIFACT_STORE_BEARER_TOKEN: 'service-token'
			},
			fetch
		)
		expect(await service?.evidence('cust_acme', scopeId, artifactId)).toEqual([
			{
				ordinal: 0,
				outputArtifactId: artifactId,
				outputLocator: { kind: 'json-pointer', pointer: '/supplier' },
				inputRole: 'source',
				inputOrdinal: 0,
				inputArtifactId: intentArtifactId,
				inputLocator: {
					kind: 'page-region',
					page: 1,
					x: 100,
					y: 200,
					width: 300,
					height: 400
				}
			}
		])
	})
})
