import { createHash } from 'node:crypto'
import type { ArtifactJson, ArtifactStoreFetch, ClientRunPublication } from '@avenos/artifact-store'
import { createDocumentActors } from '@avenos/document-ingest/actors'
import type { CsvDetection } from '@avenos/document-ingest/csv'
import { confirmCsvStatement } from '@avenos/document-ingest/csv-confirmation'
import { DocumentProcessingRuntime } from '@avenos/document-ingest/runtime'
import { ServerDocumentDecoder } from '@avenos/document-ingest/server'
import { expect, test } from 'vitest'
import {
	CsvMemoryGateway,
	csvSource
} from '../../../libs/aven-document-ingest/tests/support/csv-corpus'
import { ArtifactFileService } from '../src/lib/server/artifacts/service'

test('facade rejects invented detection, swapped confirmation, and admission without durable human approval', async () => {
	const source = await csvSource(),
		memory = new CsvMemoryGateway()
	const actors = createDocumentActors(new ServerDocumentDecoder())
	const runtime = new DocumentProcessingRuntime(actors, memory)
	const p = await runtime.start(source)
	const detection = p.metadata.csvDetection as unknown as CsvDetection
	const detectionId = String(p.metadata.csvDetectionArtifactId)
	await confirmCsvStatement(memory, detectionId, detection, 'accepted')
	await runtime.start(source)
	for (const actor of actors.all) actor.dispose()
	const sourceBytes = Buffer.from(source.base64, 'base64')
	let writes = 0
	const fetch: ArtifactStoreFetch = async (input, init) => {
		const r = new Request(input, init)
		if (r.method === 'POST' || r.method === 'PUT') {
			writes++
			throw new Error('Must reject before persistence')
		}
		if (r.url.endsWith(`/${source.artifactId}/content`)) return new Response(sourceBytes)
		if (r.url.endsWith(`/${source.artifactId}`))
			return Response.json({
				artifactId: source.artifactId,
				typeKey: 'core.file',
				typeVersion: 1,
				payload: { originalName: source.originalName, declaredMediaType: source.declaredMediaType },
				blob: {
					length: sourceBytes.length,
					sha256: createHash('sha256').update(sourceBytes).digest('hex')
				}
			})
		if (r.url.endsWith(`/${detectionId}`))
			return Response.json({
				artifactId: detectionId,
				typeKey: 'banking.csv-statement-detection',
				typeVersion: 1,
				payload: detection
			})
		// An absent receipt is not authority to admit the caller's claimed approval.
		if (r.url.includes('/publications/'))
			return Response.json({ code: 'RESOURCE_UNAVAILABLE', message: 'absent' }, { status: 404 })
		throw new Error(`Unexpected read ${r.url}`)
	}
	const service = ArtifactFileService.fromConfig(
		{ ARTIFACT_STORE_BASE_URL: 'http://store.test', ARTIFACT_STORE_BEARER_TOKEN: 'test' },
		fetch
	)!
	const submit = (run: ClientRunPublication) =>
		service.publishClientRun({
			...run,
			parameters: run.parameters as ArtifactJson,
			artifacts: run.artifacts.map((a) => ({ ...a, payload: a.payload as ArtifactJson })),
			procedureVersion: 'client-v1',
			userId: 'user',
			databaseName: 'cust_csv',
			scopeId: '11111111-1111-4111-8111-111111111111'
		})
	const detected = structuredClone(
		memory.runs.find((r) => r.procedureKey === 'client.detect-csv-statement')!
	)
	detected.artifacts[0]!.payload.eligible = false
	await expect(submit(detected)).rejects.toThrow('CSV detection differs')
	const confirmed = structuredClone(
		memory.runs.find((r) => r.procedureKey === 'client.confirm-csv-statement')!
	)
	confirmed.artifacts[0]!.payload.sourceSha256 = '0'.repeat(64)
	await expect(submit(confirmed)).rejects.toThrow('CSV confirmation differs')
	const admitted = structuredClone(
		memory.runs.find((r) => r.procedureKey === 'client.admit-csv-statement')!
	)
	await expect(submit(admitted)).rejects.toThrow('CSV statement requires')
	expect(writes).toBe(0)
})
