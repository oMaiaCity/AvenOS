import { readFile } from 'node:fs/promises'
import type { ClientRunPublication } from '@avenos/artifact-store'
import { HttpLlmGatewayClient } from '@avenos/llm-client/http'
import { describe, expect, test } from 'vitest'
import { createDocumentActors } from '../src/actors/registry'
import { LlmDocumentModelGateway } from '../src/llm-gateway'
import { DocumentProcessingRuntime } from '../src/runtime'
import { ServerDocumentDecoder } from '../src/server'

const baseUrl = process.env.TEST_DOCUMENT_LLM_BASE_URL
const bearerToken = process.env.TEST_DOCUMENT_LLM_BEARER_TOKEN
const modelId = process.env.TEST_DOCUMENT_MODEL_ID
const required = process.env.REQUIRE_DOCUMENT_PROVIDER_GOLDEN === 'true'
const configured = Boolean(baseUrl && bearerToken)

if (required && !configured) {
	throw new Error(
		'TEST_DOCUMENT_LLM_BASE_URL and TEST_DOCUMENT_LLM_BEARER_TOKEN are required for provider goldens'
	)
}

describe('provider-backed document golden', () => {
	const providerTest = configured ? test : test.skip
	providerTest(
		'extracts the reviewed PDF receipt facts through rendering and the real model contract',
		async () => {
			const file = 'syn_0015_MX_transport_mobility_toll_receipt.pdf'
			const bytes = new Uint8Array(
				await readFile(new URL(`../../../fixtures/golden/document-pdf/${file}`, import.meta.url))
			)
			const gateway = new RecordingGateway()
			const model = new LlmDocumentModelGateway(
				new HttpLlmGatewayClient({ baseUrl: baseUrl ?? '', bearerToken: bearerToken ?? '' }),
				modelId
			)
			const presentation = await runtime(model, gateway).start({
				artifactId: '22222222-2222-4222-8222-222222222222',
				originalName: file,
				declaredMediaType: 'application/pdf',
				base64: Buffer.from(bytes).toString('base64')
			})

			expect(
				['succeeded', 'needs_review'],
				JSON.stringify(
					{
						state: presentation.state,
						summary: presentation.summary,
						warnings: presentation.warnings,
						stages: presentation.stages
					},
					undefined,
					2
				)
			).toContain(presentation.state)
			expect(presentation.metadata).toMatchObject({
				documentKind: 'receipt',
				vision: 'model',
				pageCount: 1
			})
			const extraction = gateway.runs.find(
				(run) => run.procedureKey === 'client.extract-invoice-model'
			)
			expect(extraction).toBeDefined()
			const candidate = extraction?.artifacts.find(
				(artifact) => artifact.typeKey === 'bookkeeping.invoice-candidate'
			)?.payload
			expect(candidate).toMatchObject({
				supplier: 'La Estrella Transit',
				invoiceNumber: 'T-2026-00015-V',
				currency: 'MXN',
				grossMinor: 63_360
			})
			const details = extraction?.artifacts.find(
				(artifact) => artifact.typeKey === 'bookkeeping.invoice-details'
			)?.payload
			expect(details).toMatchObject({
				documentKind: 'receipt',
				issueDate: '2026-08-11',
				supplier: expect.objectContaining({
					name: 'La Estrella Transit',
					taxNumber: 'PZA841064A1',
					vatId: null
				}),
				lineItems: expect.arrayContaining([
					expect.objectContaining({ title: 'Rail ticket', grossMinor: 55_440 }),
					expect.objectContaining({ title: 'Seat reservation', grossMinor: 7_920 })
				])
			})
			expect(extraction?.evidence.length).toBeGreaterThan(0)
			expect(extraction?.parameters.modelReceipt).toMatchObject({
				model: expect.any(String),
				requestKey: expect.any(String),
				implementationDigest: expect.any(String)
			})
		},
		120_000
	)

	providerTest(
		'extracts the reviewed semantic invoice facts through the real model contract',
		async () => {
			const bytes = new Uint8Array(
				await readFile(
					new URL(
						'../../../fixtures/artifacts/0001_DE_agri_coop_de-2025-00001-k.jpg',
						import.meta.url
					)
				)
			)
			const gateway = new RecordingGateway()
			const model = new LlmDocumentModelGateway(
				new HttpLlmGatewayClient({ baseUrl: baseUrl ?? '', bearerToken: bearerToken ?? '' }),
				modelId
			)
			const presentation = await runtime(model, gateway).start({
				artifactId: '11111111-1111-4111-8111-111111111111',
				originalName: '0001_DE_agri_coop_de-2025-00001-k.jpg',
				declaredMediaType: 'image/jpeg',
				base64: Buffer.from(bytes).toString('base64')
			})

			expect(['succeeded', 'needs_review']).toContain(presentation.state)
			expect(presentation.metadata).toMatchObject({
				documentKind: 'invoice',
				vision: 'model'
			})
			const extraction = gateway.runs.find(
				(run) => run.procedureKey === 'client.extract-invoice-model'
			)
			expect(extraction).toBeDefined()
			const candidate = extraction?.artifacts.find(
				(artifact) => artifact.typeKey === 'bookkeeping.invoice-candidate'
			)?.payload
			expect(candidate).toMatchObject({
				supplier: 'Jopich Hering KGaA AG',
				invoiceNumber: 'DE-2025-00001-K',
				currency: 'EUR',
				netMinor: 22_055_946,
				taxMinor: 1_996_491,
				grossMinor: 23_170_199,
				dueDate: '2025-12-02'
			})
			const details = extraction?.artifacts.find(
				(artifact) => artifact.typeKey === 'bookkeeping.invoice-details'
			)?.payload
			expect(details).toMatchObject({
				documentKind: 'invoice',
				issueDate: '2025-10-18',
				supplier: expect.objectContaining({
					name: 'Jopich Hering KGaA AG',
					// These are separately labelled in the source image.
					taxNumber: 'DE667194179',
					vatId: 'DE771485309',
					city: 'Goslar'
				}),
				buyer: expect.objectContaining({ name: 'Hendriks UG', city: 'Sondershausen' }),
				lineItems: expect.arrayContaining([
					expect.objectContaining({ description: expect.stringContaining('Zutrittspass') })
				])
			})
			expect(extraction?.evidence.length).toBeGreaterThan(0)
			expect(extraction?.parameters.modelReceipt).toMatchObject({
				model: expect.any(String),
				requestKey: expect.any(String),
				implementationDigest: expect.any(String)
			})
		},
		120_000
	)
})

function runtime(model: LlmDocumentModelGateway, gateway: RecordingGateway) {
	const result = new DocumentProcessingRuntime(
		createDocumentActors(new ServerDocumentDecoder(), model),
		gateway,
		() => model.status(),
		{
			executionEnvironment: 'server',
			runtimeHost: 'actor-runner',
			procedureVersion: 'server-v1'
		}
	)
	if (process.env.TRACE_DOCUMENT_PROVIDER_GOLDEN === 'true') {
		let previous = ''
		result.onChange = (_artifactId, presentation) => {
			const current = presentation.stages
				.map((stage) => `${stage.key}:${stage.state}:${stage.attemptCount}`)
				.join(',')
			if (current !== previous) {
				previous = current
				console.info(`[provider-golden] ${current}`)
			}
		}
	}
	return result
}

class RecordingGateway {
	readonly runs: ClientRunPublication[] = []
	#ordinal = 0

	async publish(run: ClientRunPublication) {
		this.runs.push(structuredClone(run))
		return {
			publicationId: run.publicationId,
			runId: `provider-run-${++this.#ordinal}`,
			replayed: false,
			artifacts: run.artifacts.map((artifact) => ({
				localKey: artifact.localKey,
				artifactId: `provider-artifact-${++this.#ordinal}`
			}))
		}
	}
}
