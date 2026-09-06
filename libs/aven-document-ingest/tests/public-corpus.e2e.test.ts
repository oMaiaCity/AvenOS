import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HttpLlmGatewayClient } from '@avenos/llm-client/http'
import { expect, test } from 'vitest'
import corpus from '../../../fixtures/golden/public-documents/cases.json'
import { createDocumentActors } from '../src/actors/registry'
import { LlmDocumentModelGateway } from '../src/llm-gateway'
import { DocumentProcessingRuntime } from '../src/runtime'
import { ServerDocumentDecoder } from '../src/server'
import { CsvMemoryGateway } from './support/csv-corpus'

const directory = process.env.AVEN_PUBLIC_DOCUMENT_DIR
const live = process.env.TEST_DOCUMENT_CORPUS === 'public'
if (live && !directory) throw new Error('Public provider tests require AVEN_PUBLIC_DOCUMENT_DIR.')
for (const spec of corpus.documents) {
	;(directory ? test : test.skip)(
		`reviewed public specimen bytes and pages: ${spec.id}`,
		async () => {
			const bytes = await readFile(join(directory!, `${spec.id}.pdf`))
			expect(createHash('sha256').update(bytes).digest('hex')).toBe(spec.sha256)
			const decoded = await new ServerDocumentDecoder().decode(
				{
					artifactId: crypto.randomUUID(),
					originalName: `${spec.id}.pdf`,
					declaredMediaType: 'application/pdf',
					base64: bytes.toString('base64')
				},
				{ modelPageLimit: 0 }
			)
			expect(decoded.outcome).toBe('ok')
			expect(decoded.pages).toHaveLength(spec.pages)
		},
		10_000
	)
	if (!spec.liveNegative) continue
	;(live ? test : test.skip)(
		`blank public form cannot invent a liability: ${spec.id}`,
		async () => {
			const bytes = await readFile(join(directory!, `${spec.id}.pdf`))
			expect(createHash('sha256').update(bytes).digest('hex')).toBe(spec.sha256)
			const model = new LlmDocumentModelGateway(
				new HttpLlmGatewayClient({
					baseUrl: process.env.TEST_DOCUMENT_LLM_BASE_URL!,
					bearerToken: process.env.TEST_DOCUMENT_LLM_BEARER_TOKEN!
				}),
				process.env.TEST_DOCUMENT_MODEL_ID
			)
			const actors = createDocumentActors(new ServerDocumentDecoder(), model),
				store = new CsvMemoryGateway()
			try {
				const p = await new DocumentProcessingRuntime(actors, store, () => model.status()).start({
					artifactId: crypto.randomUUID(),
					originalName: `${spec.id}.pdf`,
					declaredMediaType: 'application/pdf',
					base64: bytes.toString('base64')
				})
				expect(p.state, JSON.stringify(p)).not.toBe('failed')
				const drafts = store.runs.flatMap((r) => r.artifacts)
				expect(
					p.stages.filter((s) => s.state === 'failed' && s.key !== 'normalize-invoice-open-item'),
					JSON.stringify({ stages: p.stages, warnings: p.warnings })
				).toEqual([])
				if (['invoice', 'receipt', 'credit-note'].includes(String(p.metadata.documentKind)))
					expect(drafts.some((a) => a.typeKey === 'bookkeeping.invoice-candidate')).toBe(true)
				expect(
					drafts.some((a) =>
						['bookkeeping.open-item', 'banking.transaction', 'reconciliation.decision'].includes(
							a.typeKey
						)
					)
				).toBe(false)
				for (const candidate of drafts.filter((a) => a.typeKey === 'bookkeeping.invoice-candidate'))
					expect(candidate.payload.grossMinor).toBeNull()
			} finally {
				for (const actor of actors.all) actor.dispose()
			}
		},
		120_000
	)
}
