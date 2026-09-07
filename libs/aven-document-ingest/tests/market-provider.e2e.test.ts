import { readFile } from 'node:fs/promises'
import { HttpLlmGatewayClient } from '@avenos/llm-client/http'
import { expect, test } from 'vitest'
import corpus from '../../../fixtures/golden/reconciliation-market/cases.json'
import { createDocumentActors } from '../src/actors/registry'
import { LlmDocumentModelGateway } from '../src/llm-gateway'
import { DocumentProcessingRuntime } from '../src/runtime'
import { ServerDocumentDecoder } from '../src/server'
import { CsvMemoryGateway } from './support/csv-corpus'

const enabled = process.env.TEST_DOCUMENT_CORPUS === 'market'
const selected = process.env.TEST_DOCUMENT_CASE
if (
	enabled &&
	(!process.env.TEST_DOCUMENT_LLM_BASE_URL || !process.env.TEST_DOCUMENT_LLM_BEARER_TOKEN)
)
	throw new Error('Market provider proof requires the authenticated test gateway.')
if (selected && enabled && !corpus.documents.some((s) => s.id === selected))
	throw new Error(`Unknown market case: ${selected}`)

for (const spec of corpus.documents.filter((s) => !selected || s.id === selected)) {
	;(enabled ? test : test.skip)(
		`live market document: ${spec.id}`,
		async () => {
			console.info(`[market-provider] starting ${spec.id}`)
			const model = new LlmDocumentModelGateway(
				new HttpLlmGatewayClient({
					baseUrl: process.env.TEST_DOCUMENT_LLM_BASE_URL!,
					bearerToken: process.env.TEST_DOCUMENT_LLM_BEARER_TOKEN!
				}),
				process.env.TEST_DOCUMENT_MODEL_ID
			)
			const actors = createDocumentActors(new ServerDocumentDecoder(), model)
			const gateway = new CsvMemoryGateway()
			try {
				const bytes = await readFile(
					new URL(`../../../fixtures/golden/reconciliation-market/${spec.id}.pdf`, import.meta.url)
				)
				const presentation = await new DocumentProcessingRuntime(actors, gateway, () =>
					model.status()
				).start({
					artifactId: crypto.randomUUID(),
					originalName: `${spec.id}.pdf`,
					declaredMediaType: 'application/pdf',
					base64: bytes.toString('base64')
				})
				expect(presentation.state, JSON.stringify(presentation)).not.toBe('failed')
				const drafts = gateway.runs.flatMap((r) => r.artifacts)
				if (spec.expected.documentKind)
					expect(presentation.metadata.documentKind).toBe(spec.expected.documentKind)
				const invoice = drafts.find((a) => a.typeKey === 'bookkeeping.invoice-candidate')
				if (spec.expected.candidate) expect(invoice?.payload).toMatchObject(spec.expected.candidate)
				if (spec.expected.payment)
					expect(
						drafts.find((a) => a.typeKey === 'bookkeeping.invoice-details')?.payload.payment
					).toMatchObject(spec.expected.payment)
				if (spec.expected.statement) {
					const statement = drafts.find(
						(a) => a.typeKey === 'banking.account-statement-candidate'
					)?.payload
					expect(statement).toMatchObject(spec.expected.statement)
					expect(
						(statement!.transactions as { amountMinor: number }[]).map((r) => r.amountMinor)
					).toEqual(spec.expected.transactionAmounts)
				}
				for (const text of spec.expected.textIncludes ?? [])
					expect(JSON.stringify(drafts)).toContain(text)
				expect(drafts.some((a) => a.typeKey === 'reconciliation.decision')).toBe(false)
				for (const run of gateway.runs.filter(
					(r) => r.procedureKey.startsWith('client.extract-') && r.parameters.modelReceipt
				)) {
					expect(run.evidence.length).toBeGreaterThan(0)
					expect(run.parameters.modelReceipt).toMatchObject({
						model: expect.any(String),
						requestKey: expect.any(String)
					})
				}
			} finally {
				for (const actor of actors.all) actor.dispose()
			}
		},
		120_000
	)
}
