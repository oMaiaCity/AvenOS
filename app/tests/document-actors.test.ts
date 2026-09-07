import { describe, expect, test } from 'bun:test'
import type { CommittedClientRun } from '@avenos/artifact-store'
import {
	createDocumentActors,
	type DecodedDocument,
	type DocumentDecoder,
	parseDocumentActorResult
} from '@avenos/document-ingest/actors'
import {
	type DocumentExecutionHost,
	DocumentExecutionRouter,
	documentRunStartRequest,
	InProcessDocumentExecutionHost
} from '@avenos/document-ingest/execution'
import type { DocumentModelGateway, DocumentModelRequest } from '@avenos/document-ingest/model'
import {
	type ClientArtifactGateway,
	type ClientRunPublication,
	DocumentProcessingRuntime
} from '@avenos/document-ingest/runtime'

const DOCUMENT: DecodedDocument = {
	outcome: 'ok',
	detectedMediaType: 'application/pdf',
	encrypted: false,
	pages: [
		{
			page: 1,
			rotation: 0,
			width: 600,
			height: 800,
			runs: [
				{ text: 'Invoice', x: 100_000, y: 100_000, width: 120_000, height: 20_000 },
				{ text: '42', x: 230_000, y: 100_000, width: 30_000, height: 20_000 }
			]
		},
		{
			page: 2,
			rotation: 0,
			width: 800,
			height: 600,
			runs: [{ text: 'Total €12', x: 100_000, y: 200_000, width: 160_000, height: 20_000 }]
		}
	]
}

class FixedDecoder implements DocumentDecoder {
	constructor(private readonly document: DecodedDocument = DOCUMENT) {}
	async decode(): Promise<DecodedDocument> {
		return structuredClone(this.document)
	}
}

class RecordingGateway implements ClientArtifactGateway {
	runs: ClientRunPublication[] = []
	async publish(run: ClientRunPublication) {
		this.runs.push(structuredClone(run))
		return {
			publicationId: run.publicationId,
			runId: `run-${this.runs.length}`,
			replayed: false,
			artifacts: run.artifacts.map((artifact) => ({
				localKey: artifact.localKey,
				artifactId: `${run.publicationId}:${artifact.localKey}`
			}))
		}
	}
}

class RecoverableGateway extends RecordingGateway {
	interruptProcedure?: string
	async lookup(publicationId: string): Promise<CommittedClientRun | null> {
		const run = this.runs.find((run) => run.publicationId === publicationId)
		if (!run) return null
		return structuredClone({
			receipt: {
				publicationId,
				runId: `run-${this.runs.indexOf(run) + 1}`,
				replayed: true,
				artifacts: run.artifacts.map((artifact) => ({
					localKey: artifact.localKey,
					artifactId: `${publicationId}:${artifact.localKey}`
				}))
			},
			artifacts: run.artifacts,
			procedureKey: run.procedureKey,
			procedureVersion: run.procedureVersion,
			parameters: run.parameters
		})
	}
	async publish(run: ClientRunPublication) {
		const receipt = await super.publish(run)
		if (run.procedureKey === this.interruptProcedure) {
			this.interruptProcedure = undefined
			throw new Error('lost acknowledgement after committed publication')
		}
		return receipt
	}
}

class InvoiceModelGateway implements DocumentModelGateway {
	requests: DocumentModelRequest[] = []
	async status() {
		return { available: true, maxPages: 15 }
	}
	async complete(request: DocumentModelRequest) {
		this.requests.push(structuredClone(request))
		const receipt = {
			model: 'vision-test',
			profile: 'openai-json-schema',
			requestKey: `request-${this.requests.length}`,
			promptDigest: 'prompt-digest',
			implementationDigest: 'implementation-digest'
		}
		if (request.procedure === 'analyze-page') {
			const page = request.images[0]?.page ?? 1
			const text = page === 1 ? 'Invoice 42' : 'Total EUR 12.00'
			return {
				receipt,
				structured: {
					text,
					language: 'en',
					complete: true,
					blocks: [{ text, x: 10, y: 20, width: 300, height: 40 }],
					primaryKind: 'document',
					facets: ['raster-text'],
					confidenceBps: 9800,
					reason: 'Visible document text.',
					summary: `Invoice page ${page}.`,
					topics: ['invoice']
				}
			}
		}
		if (request.procedure === 'classify-document') {
			return {
				receipt,
				structured: {
					rawKind: 'invoice',
					resolvedKind: 'invoice',
					family: 'invoice-family',
					confidenceBps: 9900,
					reason: 'The pages visibly form an invoice.',
					resolutionMode: 'model',
					alternatives: []
				}
			}
		}
		return {
			receipt,
			structured: {
				candidate: {
					supplier: 'ACME GmbH',
					invoiceNumber: '42',
					currency: 'EUR',
					netMinor: 1000,
					taxMinor: 200,
					grossMinor: 1200,
					dueDate: null,
					summary: 'Invoice 42 for EUR 12.00.'
				},
				details: {
					documentKind: 'invoice',
					supplier: { name: 'ACME GmbH' }
				},
				evidence: []
			}
		}
	}
}

class StatementModelGateway extends InvoiceModelGateway {
	override async complete(request: DocumentModelRequest) {
		if (request.procedure === 'classify-document') {
			this.requests.push(structuredClone(request))
			return {
				receipt: {
					model: 'vision-test',
					profile: 'openai-json-schema',
					requestKey: `request-${this.requests.length}`,
					promptDigest: 'prompt-digest',
					implementationDigest: 'implementation-digest'
				},
				structured: {
					rawKind: 'bank-statement',
					resolvedKind: 'bank-statement',
					family: 'statement-family',
					confidenceBps: 9900,
					reason: 'The pages visibly form an account statement.',
					resolutionMode: 'model',
					alternatives: []
				}
			}
		}
		if (request.procedure === 'extract-statement') {
			this.requests.push(structuredClone(request))
			const transactions = Array.from({ length: 65 }, (_, index) => ({
				transactionId: `bank-tx-${index + 1}`,
				bookingDate: '2026-08-18',
				valueDate: '2026-08-18',
				title: 'SEPA transfer',
				amountMinor: -100,
				counterpartyName: index === 41 ? 'ACME GmbH' : `Supplier ${index + 1}`,
				counterpartyIban: null,
				description: index === 41 ? 'Invoice RE-42' : `Payment ${index + 1}`,
				originalAmountMinor: null,
				originalCurrency: null,
				exchangeRate: null,
				fxSurchargeMinor: null,
				foreignExchangeFeeBps: null,
				balanceAfterMinor: 10_000 - (index + 1) * 100,
				sourceRow: index + 1
			}))
			return {
				receipt: {
					model: 'vision-test',
					profile: 'openai-json-schema',
					requestKey: `request-${this.requests.length}`,
					promptDigest: 'prompt-digest',
					implementationDigest: 'implementation-digest'
				},
				structured: {
					candidate: {
						statementKind: 'monthly-statement',
						currency: 'EUR',
						accountHolder: 'Aven GmbH',
						institution: { name: 'Example Bank', city: 'Berlin' },
						accountIban: 'DE89370400440532013000',
						accountNumber: null,
						productName: 'Business account',
						openingBalanceMinor: 10_000,
						closingBalanceMinor: 3500,
						periodStart: '2026-08-01',
						periodEnd: '2026-08-31',
						transactions,
						summary: 'August account statement.'
					},
					evidence: []
				}
			}
		}
		return super.complete(request)
	}
}

class FlakyInvoiceModelGateway extends InvoiceModelGateway {
	#failedClassification = false

	override async complete(request: DocumentModelRequest) {
		if (request.procedure === 'classify-document' && !this.#failedClassification) {
			this.#failedClassification = true
			this.requests.push(structuredClone(request))
			throw new Error('transient model failure')
		}
		return super.complete(request)
	}
}

class InvalidPageAnalysisModelGateway extends InvoiceModelGateway {
	override async complete(request: DocumentModelRequest) {
		if (request.procedure === 'analyze-page') {
			this.requests.push(structuredClone(request))
			return {
				receipt: {
					model: 'vision-test',
					profile: 'generic-json',
					requestKey: `invalid-page-${this.requests.length}`,
					promptDigest: 'prompt-digest',
					implementationDigest: 'implementation-digest'
				},
				structured: { text: null }
			}
		}
		return super.complete(request)
	}
}

class OnceFailingPublicationGateway extends RecordingGateway {
	#failed = false

	override async publish(run: ClientRunPublication) {
		if (!this.#failed) {
			this.#failed = true
			throw new Error('transient publication failure')
		}
		return super.publish(run)
	}
}

class FailingClassificationPublicationGateway extends RecordingGateway {
	override async publish(run: ClientRunPublication) {
		if (run.procedureKey === 'client.classify-document-model') {
			throw new Error('transient publication failure')
		}
		return super.publish(run)
	}
}

const SOURCE = {
	artifactId: '11111111-1111-4111-8111-111111111111',
	originalName: 'invoice.pdf',
	declaredMediaType: 'application/pdf',
	base64: 'eA=='
}

describe('client document actors', () => {
	test('advertise invocable method-level contracts', () => {
		const actors = createDocumentActors(new FixedDecoder())
		expect(actors.inspect.manifest.methods[0]).toMatchObject({
			name: 'document_inspect',
			requires: ['ceo.aven.docs.file(F)'],
			produces: ['ceo.aven.docs.file_inspection(F, I)'],
			inputSlots: [
				expect.objectContaining({
					schema: 'ceo.aven:schema:docs:file@1',
					role: 'source',
					cardinality: 'one'
				})
			],
			outputSlots: [
				expect.objectContaining({
					schema: 'ceo.aven:schema:docs:file-inspection@2',
					role: 'inspection',
					cardinality: 'one'
				})
			]
		})
		expect(actors.aggregate.manifest.methods[0]).toMatchObject({
			name: 'document_aggregate_content',
			produces: ['ceo.aven.docs.content_classification(F, C)'],
			inputSlots: [
				expect.objectContaining({ role: 'page-classification', cardinality: 'many' }),
				expect.objectContaining({ role: 'text', cardinality: 'one' })
			],
			outputSlots: [expect.objectContaining({ role: 'classification', cardinality: 'one' })]
		})
		expect(actors.rankReconciliation.manifest.methods[0]).toMatchObject({
			name: 'reconciliation_rank_invoice_transactions',
			inputSlots: [
				expect.objectContaining({ role: 'open-item', cardinality: 'one' }),
				expect.objectContaining({ role: 'transaction', cardinality: 'many' })
			],
			outputSlots: [expect.objectContaining({ role: 'match-candidate', cardinality: 'many' })]
		})
	})

	test('native text actor emits UTF-8 byte ranges and a blob', async () => {
		const actors = createDocumentActors(new FixedDecoder())
		const response = await actors.extractText.deliver('document_extract_native_text', {
			page: DOCUMENT.pages[1]
		})
		const result = parseDocumentActorResult(response.record)
		const text = result.artifacts.find((artifact) => artifact.localKey === 'text')
		const layout = result.artifacts.find((artifact) => artifact.localKey === 'layout')

		expect(text?.payload).toMatchObject({ method: 'native', pageCount: 1, characterCount: 9 })
		expect(text?.blob?.mediaType).toBe('text/plain; charset=utf-8')
		expect(layout?.payload.spans).toEqual([
			expect.objectContaining({ start: 0, endExclusive: 11, page: 2 })
		])
	})

	test('fails closed when any decoder exceeds the shared page bound', async () => {
		const pages = Array.from({ length: 64 }, (_, index) => ({
			page: index + 1,
			rotation: 0 as const,
			width: 100,
			height: 200,
			runs: []
		}))
		const actors = createDocumentActors(
			new FixedDecoder({
				outcome: 'ok',
				detectedMediaType: 'application/pdf',
				encrypted: false,
				pages
			})
		)
		const response = await actors.inspect.deliver('document_inspect', { source: SOURCE })

		expect(() => parseDocumentActorResult(response.record)).toThrow('maximum is 63')
	})

	test('runs the complete deterministic DAG and binds every hop to persisted artifacts', async () => {
		const gateway = new RecordingGateway()
		const runtime = new DocumentProcessingRuntime(createDocumentActors(new FixedDecoder()), gateway)
		const presentation = await runtime.start(SOURCE)

		expect(presentation.state, presentation.summary ?? 'document state').toBe('succeeded')
		expect(presentation.preferredType).toBe('document')
		expectStageGraph(presentation, [
			'inspect',
			'decompose-pages',
			'extract-native-page-001',
			'classify-page-001',
			'extract-native-page-002',
			'classify-page-002',
			'assemble-document',
			'aggregate-content'
		])
		expect(presentation.stages.every((stage) => stage.state === 'succeeded')).toBe(true)
		expect(gateway.runs).toHaveLength(8)
		expect(gateway.runs[1]?.inputs.map((value) => value.role)).toEqual(['source', 'inspection'])
		expect(
			gateway.runs
				.find((run) => run.procedureKey === 'client.classify-page-signals')
				?.inputs.map((value) => value.role)
		).toEqual(['source', 'page', 'text'])
		expect(gateway.runs.at(-1)?.procedureKey).toBe('client.aggregate-content-classification')
		expect(presentation.derivedArtifacts).toHaveLength(12)
	})

	test('derives stable publication identities so a fresh runtime replays after a crash', async () => {
		const first = new RecordingGateway()
		const second = new RecordingGateway()
		await new DocumentProcessingRuntime(createDocumentActors(new FixedDecoder()), first).start(
			SOURCE
		)
		await new DocumentProcessingRuntime(createDocumentActors(new FixedDecoder()), second).start(
			SOURCE
		)

		expect(first.runs.map((run) => run.publicationId)).toEqual(
			second.runs.map((run) => run.publicationId)
		)
	})

	test('reloads the committed prefix after a lost acknowledgement without repeating decoding or model calls', async () => {
		const gateway = new RecoverableGateway()
		gateway.interruptProcedure = 'client.classify-document-model'
		const model = new InvoiceModelGateway()
		const document: DecodedDocument = {
			...structuredClone(DOCUMENT),
			pages: DOCUMENT.pages.map((page) => ({
				...structuredClone(page),
				image: { mediaType: 'image/png', base64: 'eA==' }
			}))
		}
		const first = await new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder(document), model),
			gateway,
			() => model.status()
		).start(SOURCE)
		expect(first.state).toBe('failed')
		const decoder: DocumentDecoder = {
			decode: async () => {
				throw new Error('committed inspection must be reloaded')
			}
		}
		const second = await new DocumentProcessingRuntime(
			createDocumentActors(decoder, model),
			gateway,
			() => model.status()
		).start(SOURCE)
		expect(second.state, second.summary ?? 'recovery').toBe('succeeded')
		expect(
			model.requests.filter((request) => request.procedure === 'classify-document')
		).toHaveLength(1)
		expect(model.requests.filter((request) => request.procedure === 'analyze-page')).toHaveLength(2)
		expect(
			model.requests.filter((request) => request.procedure === 'extract-invoice')
		).toHaveLength(1)
		expect(new Set(gateway.runs.map((run) => run.publicationId)).size).toBe(gateway.runs.length)
		const third = await new DocumentProcessingRuntime(
			createDocumentActors(decoder, model),
			gateway,
			() => model.status()
		).start(SOURCE)
		expect(third.state, third.summary ?? 'complete replay').toBe('succeeded')
		expect(third.stages.every((stage) => stage.attemptCount === 0)).toBe(true)
		expect(model.requests).toHaveLength(4)
	})

	test('preserves a scanned PDF but stops at needs-review while OCR is absent', async () => {
		const gateway = new RecordingGateway()
		const image: DecodedDocument = {
			outcome: 'ok',
			detectedMediaType: 'application/pdf',
			encrypted: false,
			pages: [{ page: 1, rotation: 0, width: 100, height: 200, runs: [] }]
		}
		const presentation = await new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder(image)),
			gateway
		).start(SOURCE)

		expect(presentation.state, presentation.summary ?? 'document state').toBe('needs_review')
		expect(presentation.preferredType).toBe('unknown')
	})

	test('preserves a blank supplier without extraction retries or inventing an open item', async () => {
		const base = new InvoiceModelGateway()
		const model: DocumentModelGateway = {
			status: () => base.status(),
			async complete(request) {
				const result = await base.complete(request)
				if (request.procedure !== 'extract-invoice') return result
				return {
					...result,
					structured: {
						candidate: {
							supplier: null,
							invoiceNumber: null,
							currency: null,
							netMinor: null,
							taxMinor: null,
							grossMinor: null,
							dueDate: null,
							summary: 'Blank specimen.'
						},
						details: { documentKind: 'invoice', supplier: null },
						evidence: []
					}
				}
			}
		}
		const document = structuredClone(DOCUMENT)
		for (const page of document.pages) page.image = { mediaType: 'image/png', base64: 'eA==' }
		const actors = createDocumentActors(new FixedDecoder(document), model)
		const gateway = new RecordingGateway()
		try {
			const result = await new DocumentProcessingRuntime(actors, gateway, () =>
				model.status()
			).start(SOURCE)
			expect(result.state).toBe('needs_review')
			expect(base.requests.filter((r) => r.procedure === 'extract-invoice')).toHaveLength(1)
			const drafts = gateway.runs.flatMap((r) => r.artifacts)
			expect(
				drafts.find((a) => a.typeKey === 'bookkeeping.invoice-details')?.payload.supplier
			).toBeNull()
			expect(
				drafts.find((a) => a.typeKey === 'bookkeeping.invoice-candidate')?.payload.grossMinor
			).toBeNull()
			expect(drafts.some((a) => a.typeKey === 'bookkeeping.open-item')).toBe(false)
		} finally {
			for (const actor of actors.all) actor.dispose()
		}
	})

	test('runs the vision, finance extraction, and validation lane client-side', async () => {
		const publications = new RecordingGateway()
		const model = new InvoiceModelGateway()
		const visualDocument: DecodedDocument = {
			...structuredClone(DOCUMENT),
			pages: DOCUMENT.pages.map((page) => ({
				...structuredClone(page),
				image: { mediaType: 'image/png' as const, base64: 'eA==' }
			}))
		}
		const actors = createDocumentActors(new FixedDecoder(visualDocument), model)
		const presentation = await new DocumentProcessingRuntime(actors, publications, () =>
			model.status()
		).start(SOURCE)

		expect(presentation.state, presentation.summary ?? 'document state').toBe('succeeded')
		expect(presentation.preferredType).toBe('invoice')
		expect(presentation.metadata).toMatchObject({
			vision: 'model',
			documentKind: 'invoice',
			validationStatus: 'consistent'
		})
		expect(model.requests.map((request) => request.procedure).sort()).toEqual(
			['classify-document', 'analyze-page', 'analyze-page', 'extract-invoice'].sort()
		)
		expect(JSON.stringify(model.requests.at(-1)?.schema)).not.toContain('$ref')
		expectStageGraph(presentation, [
			'inspect',
			'decompose-pages',
			'extract-native-page-001',
			'extract-native-page-002',
			'classify-document',
			'analyze-page-001',
			'analyze-page-002',
			'assemble-document',
			'aggregate-content',
			'extract-invoice',
			'validate-invoice',
			'normalize-invoice-open-item'
		])
		expect(
			publications.runs.find((run) => run.procedureKey === 'client.analyze-page-model')?.parameters
				.modelReceipt
		).toMatchObject({ model: 'vision-test' })
		expect(
			presentation.derivedArtifacts.some(
				(artifact) => artifact.typeKey === 'bookkeeping.invoice-validation'
			)
		).toBe(true)
		expect(
			presentation.derivedArtifacts.some((artifact) => artifact.typeKey === 'bookkeeping.open-item')
		).toBe(true)
	})

	test('runs statement extraction through canonicalization and bounded transaction fan-out', async () => {
		const publications = new RecordingGateway()
		const model = new StatementModelGateway()
		const visualDocument: DecodedDocument = {
			...structuredClone(DOCUMENT),
			pages: DOCUMENT.pages.map((page) => ({
				...structuredClone(page),
				image: { mediaType: 'image/png' as const, base64: 'eA==' }
			}))
		}
		const presentation = await new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder(visualDocument), model),
			publications,
			() => model.status()
		).start({ ...SOURCE, originalName: 'statement.pdf' })

		expect(presentation.state, presentation.summary ?? 'document state').toBe('succeeded')
		expect(presentation.preferredType).toBe('bank-statement')
		expect(presentation.metadata.validationStatus).toBe('consistent')
		expectStageGraph(presentation, [
			'inspect',
			'decompose-pages',
			'extract-native-page-001',
			'extract-native-page-002',
			'classify-document',
			'analyze-page-001',
			'analyze-page-002',
			'assemble-document',
			'aggregate-content',
			'extract-statement',
			'validate-statement',
			'normalize-statement',
			'fanout-statement-transactions-001',
			'fanout-statement-transactions-002'
		])
		expect(
			presentation.derivedArtifacts.filter((artifact) => artifact.typeKey === 'banking.transaction')
		).toHaveLength(65)
		expect(
			presentation.derivedArtifacts.filter((artifact) => artifact.typeKey === 'banking.statement')
		).toHaveLength(1)
		const fanout = publications.runs.filter(
			(run) => run.procedureKey === 'client.fanout-statement-transactions'
		)
		expect(fanout.map((run) => run.artifacts.length)).toEqual([64, 1])
		expect(fanout.map((run) => run.parameters.offset)).toEqual([0, 64])
		expect(fanout[1]?.inputs.map((value) => value.role)).toEqual([
			'candidate',
			'validation',
			'statement'
		])
		expect(fanout[1]?.evidence[0]?.inputLocator).toEqual({
			kind: 'json-pointer',
			pointer: '/transactions/64'
		})

		const replayPublications = new RecordingGateway()
		const replayModel = new StatementModelGateway()
		await new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder(visualDocument), replayModel),
			replayPublications,
			() => replayModel.status()
		).start({ ...SOURCE, originalName: 'statement.pdf' })
		expect(replayPublications.runs.map((run) => run.publicationId)).toEqual(
			publications.runs.map((run) => run.publicationId)
		)
	})

	test('retries model-backed stages with visible attempt accounting', async () => {
		const model = new FlakyInvoiceModelGateway()
		const visualDocument: DecodedDocument = {
			...structuredClone(DOCUMENT),
			pages: DOCUMENT.pages.map((page) => ({
				...structuredClone(page),
				image: { mediaType: 'image/png' as const, base64: 'eA==' }
			}))
		}
		const presentation = await new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder(visualDocument), model),
			new RecordingGateway(),
			() => model.status()
		).start(SOURCE)

		expect(presentation.state, presentation.summary ?? 'document state').toBe('succeeded')
		expect(
			presentation.stages.find((stage) => stage.key === 'classify-document')?.attemptCount
		).toBe(2)
		expect(
			model.requests.filter((request) => request.procedure === 'classify-document')
		).toHaveLength(2)
	})

	test('does not turn a failed decoder into an assertion that OCR or content is missing', async () => {
		const decoder: DocumentDecoder = {
			decode: async () => {
				throw new Error('decoder unavailable')
			}
		}
		const presentation = await new DocumentProcessingRuntime(
			createDocumentActors(decoder),
			new RecordingGateway()
		).start(SOURCE)
		expect(presentation.state).toBe('failed')
		expect(presentation.summary).toContain('no conclusion about its contents')
		expect(presentation.warnings.map((warning) => warning.code)).toEqual(['inspect-failed'])
		expect(presentation.derivedArtifacts).toHaveLength(0)
	})

	test('tracks a failed page actor while independent actors continue', async () => {
		const model = new InvalidPageAnalysisModelGateway()
		const visualDocument: DecodedDocument = {
			...structuredClone(DOCUMENT),
			pages: DOCUMENT.pages.map((page) => ({
				...structuredClone(page),
				image: { mediaType: 'image/png' as const, base64: 'eA==' }
			}))
		}
		const publications = new RecordingGateway()
		const presentation = await new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder(visualDocument), model),
			publications,
			() => model.status()
		).start(SOURCE)

		expect(presentation.state, presentation.summary ?? 'document state').toBe('needs_review')
		expect(presentation.metadata).toMatchObject({ documentKind: 'invoice' })
		expect(
			presentation.warnings.filter(
				(warning) => warning.code.startsWith('analyze-page-') && warning.code.endsWith('-failed')
			)
		).toHaveLength(2)
		expect(
			presentation.stages.filter((stage) => stage.state === 'failed').map((stage) => stage.key)
		).toEqual(['analyze-page-001', 'analyze-page-002'])
		expect(
			presentation.stages
				.filter((stage) => stage.key.startsWith('classify-page-independent-'))
				.every((stage) => stage.state === 'succeeded')
		).toBe(true)
		expect(
			publications.runs.some((run) => run.procedureKey === 'client.extract-invoice-model')
		).toBe(true)
	})

	test('stops on an uncertain classification publication without treating it as a negative observation', async () => {
		const model = new InvoiceModelGateway()
		const visualDocument: DecodedDocument = {
			...structuredClone(DOCUMENT),
			pages: DOCUMENT.pages.map((page) => ({
				...structuredClone(page),
				image: { mediaType: 'image/png' as const, base64: 'eA==' }
			}))
		}
		const presentation = await new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder(visualDocument), model),
			new FailingClassificationPublicationGateway(),
			() => model.status()
		).start(SOURCE)

		expect(presentation.state, presentation.summary ?? 'document state').toBe('failed')
		expect(
			presentation.stages.find((stage) => stage.key === 'classify-document')?.attemptCount
		).toBe(1)
		expect(presentation.stages.find((stage) => stage.key === 'classify-document')).toMatchObject({
			state: 'publishing'
		})
		expect(
			model.requests.filter((request) => request.procedure === 'classify-document')
		).toHaveLength(1)
		expect(
			presentation.stages
				.filter((stage) => stage.key.startsWith('analyze-page-'))
				.every((stage) => stage.state === 'succeeded')
		).toBe(true)
		expect(presentation.stages.some((stage) => stage.key === 'extract-invoice')).toBe(false)
		expect(presentation.stages.some((stage) => stage.key === 'validate-invoice')).toBe(false)
		expect(
			presentation.warnings.some((warning) => warning.code === 'client-processing-failed')
		).toBe(true)
	})

	test('allows a failed presentation to be started again', async () => {
		const gateway = new OnceFailingPublicationGateway()
		const runtime = new DocumentProcessingRuntime(createDocumentActors(new FixedDecoder()), gateway)

		expect((await runtime.start(SOURCE)).state).toBe('failed')
		expect((await runtime.start(SOURCE)).state).toBe('succeeded')
	})

	test('ports the server payment-receipt validation rules exactly', async () => {
		const actors = createDocumentActors(new FixedDecoder())
		const response = await actors.validateStatement.deliver('document_validate_statement', {
			candidate: {
				statementKind: 'payment-receipt',
				openingBalanceMinor: 5000,
				closingBalanceMinor: 3800,
				periodStart: '2026-08-01',
				periodEnd: '2026-08-01',
				transactions: [{ amountMinor: -1200 }]
			}
		})
		const result = parseDocumentActorResult(response.record)

		expect(result.artifacts[0]?.payload).toMatchObject({
			rulesetVersion: 'statement-core-v1',
			status: 'consistent',
			coverageBps: 10_000,
			checks: [
				expect.objectContaining({ outcome: 'PASS' }),
				expect.objectContaining({ outcome: 'PASS' }),
				expect.objectContaining({ outcome: 'PASS' })
			]
		})
	})

	test('routes a whole document run to its chosen host and freezes that placement', async () => {
		const sources = {
			async resolve(source: {
				artifactId: string
				originalName: string
				declaredMediaType?: string
			}) {
				return {
					...source,
					declaredMediaType: source.declaredMediaType ?? 'application/pdf',
					base64: 'eA=='
				}
			}
		}
		const local = new DocumentProcessingRuntime(
			createDocumentActors(new FixedDecoder()),
			new RecordingGateway(),
			undefined,
			{ executionEnvironment: 'local', runtimeHost: 'desktop' }
		)
		let serverPresentation: Awaited<ReturnType<DocumentExecutionHost['start']>> | undefined
		const server: DocumentExecutionHost = {
			executionEnvironment: 'server',
			async start(request) {
				serverPresentation = {
					caseId: request.requestId,
					state: 'succeeded',
					projectionVersion: 'actor-document-v1',
					preferredType: 'document',
					label: request.source.originalName,
					summary: 'Remote fixture processed.',
					metadata: { executionEnvironment: 'server', runtimeHost: 'actor-runner' },
					warnings: [],
					stages: [],
					derivedArtifacts: []
				}
				return serverPresentation
			},
			status: () => serverPresentation
		}
		const router = new DocumentExecutionRouter({
			local: new InProcessDocumentExecutionHost('local', local, sources),
			server
		})
		const descriptor = {
			artifactId: '99999999-9999-4999-8999-999999999999',
			originalName: 'server-invoice.pdf',
			declaredMediaType: 'application/pdf'
		}

		expect(router.status(descriptor.artifactId)).toBeUndefined()
		const presentation = await router.start(documentRunStartRequest(descriptor, 'server'))

		expect(presentation.state, presentation.summary ?? 'document state').toBe('succeeded')
		expect(router.status(descriptor.artifactId)?.state).toBe('succeeded')
		expect(presentation.metadata).toMatchObject({
			executionEnvironment: 'server',
			runtimeHost: 'actor-runner'
		})
		expect(router.executionEnvironment(descriptor.artifactId)).toBe('server')
		expect(() => router.start(documentRunStartRequest(descriptor, 'local'))).toThrow(
			'placement is frozen as server'
		)
	})
})

/** Independent actors may reorder; exact membership and dependency order may not. */
function expectStageGraph(
	presentation: { stages: Array<{ key: string; dependsOn?: string[] }> },
	expected: string[]
): void {
	expect(presentation.stages.map((stage) => stage.key).sort()).toEqual([...expected].sort())
	const positions = new Map(presentation.stages.map((stage, index) => [stage.key, index]))
	for (const stage of presentation.stages)
		for (const dependency of stage.dependsOn ?? []) {
			expect(positions.has(dependency)).toBe(true)
			expect(positions.get(dependency)!).toBeLessThan(positions.get(stage.key)!)
		}
}
