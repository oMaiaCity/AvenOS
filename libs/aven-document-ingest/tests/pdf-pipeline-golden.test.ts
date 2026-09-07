import { readFile } from 'node:fs/promises'
import type { ClientRunPublication } from '@avenos/artifact-store'
import { describe, expect, test } from 'vitest'
import { createDocumentActors } from '../src/actors/registry'
import { DocumentProcessingRuntime } from '../src/runtime'
import { ServerDocumentDecoder } from '../src/server'

describe('deterministic PDF pipeline golden', () => {
	for (const file of [
		'syn_0006_JP_retail_pos_gift_receipt.pdf',
		'syn_0015_MX_transport_mobility_toll_receipt.pdf',
		'syn_0075_DE_composite_ugly_three_receipts_expense_page.pdf'
	]) {
		test(`publishes the complete typed DAG for ${file}`, async () => {
			const bytes = new Uint8Array(
				await readFile(new URL(`../../../fixtures/golden/document-pdf/${file}`, import.meta.url))
			)
			const gateway = new RecordingGateway()
			const presentation = await new DocumentProcessingRuntime(
				createDocumentActors(new ServerDocumentDecoder()),
				gateway,
				undefined,
				{
					executionEnvironment: 'server',
					runtimeHost: 'actor-runner',
					procedureVersion: 'server-v1'
				}
			).start({
				artifactId: '33333333-3333-4333-8333-333333333333',
				originalName: file,
				declaredMediaType: 'application/pdf',
				base64: Buffer.from(bytes).toString('base64')
			})

			expect(presentation.state).toBe('succeeded')
			expect(presentation.metadata).toMatchObject({
				executionEnvironment: 'server',
				runtimeHost: 'actor-runner',
				pageCount: 1,
				vision: 'deterministic-fallback'
			})
			expect(presentation.stages.every((stage) => stage.state === 'succeeded')).toBe(true)
			expect(gateway.runs.map((run) => run.procedureKey)).toEqual([
				'client.inspect-file',
				'client.decompose-pages',
				'client.extract-native-text',
				'client.classify-page-signals',
				'client.assemble-document-representation',
				'client.aggregate-content-classification'
			])
			expect(new Set(presentation.derivedArtifacts.map((artifact) => artifact.typeKey))).toEqual(
				new Set([
					'core.file-inspection',
					'docs.page',
					'docs.extracted-text',
					'docs.text-layout',
					'core.content-classification'
				])
			)
		})
	}
})

class RecordingGateway {
	readonly runs: ClientRunPublication[] = []
	#ordinal = 0

	async publish(run: ClientRunPublication) {
		this.runs.push(structuredClone(run))
		return {
			publicationId: run.publicationId,
			runId: `pdf-pipeline-${++this.#ordinal}`,
			replayed: false,
			artifacts: run.artifacts.map((artifact) => ({
				localKey: artifact.localKey,
				artifactId: `pdf-pipeline-artifact-${++this.#ordinal}`
			}))
		}
	}
}
