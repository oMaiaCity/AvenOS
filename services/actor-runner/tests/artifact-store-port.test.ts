import { type Predicate, type RuntimeStepPublication, resourceId } from '@avenos/actors'
import { ArtifactStoreClient } from '@avenos/artifact-store'
import { describe, expect, test } from 'vitest'
import { ArtifactStoreRuntimePort, stablePublicationUuid } from '../src/artifact-store-port.js'

const scopeId = '99999999-9999-4999-8999-999999999999'
const sourceArtifactId = '11111111-1111-4111-8111-111111111111'
const resultArtifactId = '22222222-2222-4222-8222-222222222222'
const storeEpoch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const sourceSchema = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'store-source',
	version: '1'
})
const resultSchema = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'store-result',
	version: '1'
})
const alternateSourceSchema = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'alternate-source-view',
	version: '1'
})
const capabilityId = resourceId({
	authority: 'os.aven',
	kind: 'capability',
	namespace: 'testing.runtime.store-transformer',
	name: 'transform',
	version: '1'
})

describe('Artifact Store runtime port', () => {
	test('projects trusted facts and publishes one stable production run', async () => {
		const publications: Request[] = []
		const client = new ArtifactStoreClient({
			baseUrl: 'https://artifact-store.example',
			bearerToken: () => 'runner-service-token',
			fetch: async (input, init) => {
				const request = new Request(input, init)
				const path = new URL(request.url).pathname
				if (path === '/v1/context') return json({ storeEpoch })
				if (path === `/v1/scopes/${scopeId}/artifacts/${sourceArtifactId}`) {
					return json({
						artifactId: sourceArtifactId,
						typeKey: 'testing.source',
						typeVersion: 1,
						payload: { text: 'source' }
					})
				}
				if (request.method === 'PUT' && path.includes('/publications/')) {
					publications.push(request)
					return json({
						publicationId: path.split('/').at(-1),
						artifacts: [{ localKey: 'result', artifactId: resultArtifactId }]
					})
				}
				return new Response(null, { status: 404 })
			}
		})
		const port = new ArtifactStoreRuntimePort({
			client,
			scopeId,
			initiator: { kind: 'user', id: 'user:runtime-test' },
			schemas: [
				{
					schema: alternateSourceSchema,
					typeKey: 'testing.source',
					typeVersion: 1,
					project: () => ['os.aven.testing.alternate_source(fixture_1)' as Predicate]
				},
				{
					schema: sourceSchema,
					typeKey: 'testing.source',
					typeVersion: 1,
					project: (_payload, artifactId) => [
						`os.aven.testing.store_source(${artifactId})` as Predicate
					]
				},
				{
					schema: resultSchema,
					typeKey: 'testing.result',
					typeVersion: 1,
					project: () => []
				}
			],
			procedures: [
				{
					capabilityId,
					procedureKey: 'testing.transform',
					procedureVersion: '1',
					executor: { kind: 'agent', id: 'os.aven:actor:testing:store-transformer@1' },
					implementation: { adapter: 'actor-runner', version: 1 }
				}
			]
		})

		const expectedSource = `os.aven.testing.store_source(${sourceArtifactId})` as Predicate
		const source = await port.resolve(sourceArtifactId, expectedSource)
		expect(source).toMatchObject({
			artifactId: sourceArtifactId,
			predicate: expectedSource,
			schema: sourceSchema,
			typeKey: 'testing.source',
			schemaVersion: 1,
			value: { text: 'source' }
		})
		expect(
			await port.resolve(
				sourceArtifactId,
				'os.aven.testing.untrusted_claim(fixture_1)' as Predicate
			)
		).toBeNull()
		if (!source) throw new Error('trusted source projection was not resolved')

		const publication: RuntimeStepPublication = {
			publicationId: 'run-17:step-1',
			runId: 'run-17',
			stepId: 'step-1',
			capabilityId,
			inputs: [{ slot: 'source', role: 'source', artifact: source }],
			outputs: [
				{
					slot: 'result',
					role: 'result',
					predicate: 'os.aven.testing.store_result(fixture_1)' as Predicate,
					schema: resultSchema,
					value: { text: 'RESULT' }
				}
			]
		}
		const outputs = await port.publish(publication)
		expect(outputs).toEqual([
			expect.objectContaining({
				artifactId: resultArtifactId,
				typeKey: 'testing.result',
				schema: resultSchema,
				value: { text: 'RESULT' }
			})
		])
		expect(publications).toHaveLength(1)
		const request = publications[0]
		expect(request?.headers.get('authorization')).toBe('Bearer runner-service-token')
		expect(request?.headers.get('if-artifact-store-epoch')).toBe(storeEpoch)
		expect(
			new URL(request?.url ?? '').pathname.endsWith(
				`/publications/${stablePublicationUuid(publication.publicationId)}`
			)
		).toBe(true)
		expect(await request?.json()).toMatchObject({
			intent: {
				publicationId: stablePublicationUuid(publication.publicationId),
				scopeId,
				kind: 'run',
				run: {
					procedureKey: 'testing.transform',
					inputs: [{ role: 'source', ordinal: 0, artifactId: sourceArtifactId }],
					receipt: { outcome: 'succeeded' }
				},
				artifacts: [
					{
						localKey: 'result',
						typeKey: 'testing.result',
						typeVersion: 1,
						payload: { text: 'RESULT' },
						output: { role: 'result', ordinal: 0 }
					}
				]
			}
		})
		expect(stablePublicationUuid(publication.publicationId)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		)
	})
})

function json(value: unknown): Response {
	return Response.json(value, { headers: { 'content-type': 'application/json' } })
}
