import { randomUUID } from 'node:crypto'
import { type Predicate, type RuntimeStepPublication, resourceId } from '@avenos/actors'
import { type ArtifactJson, ArtifactStoreClient } from '@avenos/artifact-store'
import { describe, expect, test } from 'vitest'
import { ArtifactStoreRuntimePort } from '../src/artifact-store-port.js'

const baseUrl = process.env.TEST_ARTIFACT_STORE_BASE_URL
const bearerToken = process.env.TEST_ARTIFACT_STORE_BEARER_TOKEN
const scopeId = process.env.TEST_ARTIFACT_STORE_SCOPE_ID
const storeConfig = baseUrl && bearerToken && scopeId ? { baseUrl, bearerToken, scopeId } : null
const describeWithStore = storeConfig ? describe : describe.skip

describeWithStore('Artifact Store runtime port persistence', () => {
	test('commits, reads, and idempotently replays a production-run output', async () => {
		if (!storeConfig) throw new Error('Artifact Store E2E configuration is missing')
		const { baseUrl, bearerToken, scopeId } = storeConfig
		const client = new ArtifactStoreClient({
			baseUrl,
			bearerToken: () => bearerToken
		})
		const context = record(await client.context())
		const storeEpoch = stringField(context, 'storeEpoch')
		const sourcePublicationId = randomUUID()
		const sourcePublication = record(
			await client.publish(scopeId, sourcePublicationId, storeEpoch, {
				intent: {
					commandVersion: 1,
					publicationId: sourcePublicationId,
					scopeId,
					kind: 'roots',
					rootActor: { kind: 'service', id: 'service:runtime-conformance' },
					artifacts: [
						{
							localKey: 'source',
							typeKey: 'core.file-inspection',
							typeVersion: 1,
							payload: {
								outcome: 'ok',
								detectedMediaType: 'application/x-aven-runtime-fixture',
								readable: true,
								pageCount: 0,
								encrypted: false
							},
							blob: null,
							references: [],
							output: null
						}
					],
					evidence: []
				},
				blobAuthorities: {}
			})
		)
		const sourceArtifactId = stringField(
			record(arrayField(sourcePublication, 'artifacts')[0]),
			'artifactId'
		)
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
		const capabilityId = resourceId({
			authority: 'os.aven',
			kind: 'capability',
			namespace: 'testing.runtime.store-transformer',
			name: 'transform',
			version: '1'
		})
		const sourcePredicate = `os.aven.testing.store_source(${sourceArtifactId})` as Predicate
		const resultPredicate = 'os.aven.testing.store_result(fixture_1)' as Predicate
		const port = new ArtifactStoreRuntimePort({
			client,
			scopeId,
			initiator: { kind: 'service', id: 'service:actor-runner' },
			schemas: [
				{
					schema: sourceSchema,
					typeKey: 'core.file-inspection',
					typeVersion: 1,
					project: (_payload, artifactId) => [
						`os.aven.testing.store_source(${artifactId})` as Predicate
					]
				},
				{
					schema: resultSchema,
					typeKey: 'core.content-description',
					typeVersion: 1,
					project: () => [resultPredicate]
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
		const source = await port.resolve(sourceArtifactId, sourcePredicate)
		if (!source) throw new Error('source fact was not projected')
		const publication: RuntimeStepPublication = {
			publicationId: `persistent-run:${randomUUID()}:step-1`,
			runId: randomUUID(),
			stepId: 'step-1',
			capabilityId,
			inputs: [{ slot: 'source', role: 'source', artifact: source }],
			outputs: [
				{
					slot: 'result',
					role: 'result',
					predicate: resultPredicate,
					schema: resultSchema,
					value: { summary: 'Persistent runtime proof', topics: ['runtime-conformance'] }
				}
			]
		}

		const first = await port.publish(publication)
		const replay = await port.publish(publication)
		expect(replay.map((artifact) => artifact.artifactId)).toEqual(
			first.map((artifact) => artifact.artifactId)
		)
		const output = first[0]
		if (!output) throw new Error('production run returned no output')
		expect(await client.artifact(scopeId, output.artifactId)).toMatchObject({
			artifactId: output.artifactId,
			typeKey: 'core.content-description',
			payload: { summary: 'Persistent runtime proof', topics: ['runtime-conformance'] }
		})
		expect(await client.producerInputs(scopeId, output.artifactId)).toMatchObject({
			artifactId: output.artifactId,
			inputs: [{ role: 'source', ordinal: 0, artifactId: sourceArtifactId }]
		})
	})
})

function record(value: unknown): Record<string, ArtifactJson> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('expected object')
	return value as Record<string, ArtifactJson>
}

function stringField(value: Record<string, ArtifactJson>, field: string): string {
	const candidate = value[field]
	if (typeof candidate !== 'string') throw new Error(`${field} must be a string`)
	return candidate
}

function arrayField(value: Record<string, ArtifactJson>, field: string): ArtifactJson[] {
	const candidate = value[field]
	if (!Array.isArray(candidate)) throw new Error(`${field} must be an array`)
	return candidate
}
