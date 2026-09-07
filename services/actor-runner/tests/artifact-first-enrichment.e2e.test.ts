import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
	ACTOR_RUN_PROTOCOL,
	Actor,
	type ActorAuthorizer,
	type ActorFactory,
	type ActorFactoryOffer,
	ActorRegistry,
	type ActorSpawnRequest,
	type ActorStepPayload,
	type AffordanceDefinition,
	createActorPlanExecutor,
	definitionFromManifest,
	type Ingredient,
	type Manifest,
	type PlanRunRecord,
	type PlanRunStartRequest,
	type PlanRunUnderstandingOutput,
	type RuntimeArtifact,
	type RuntimeStepPublication,
	resourceId,
	type SchemaId,
	type SpawnedActor,
	unifiable
} from '@avenos/actors'
import { describe, expect, test } from 'vitest'
import { MemoryPlanRunner } from '../src/memory-runner.js'

const schema = (name: string): SchemaId =>
	resourceId({
		authority: 'ceo.aven',
		kind: 'schema',
		namespace: 'testing.enrichment',
		name,
		version: '1'
	})

const IMAGE_SCHEMA = schema('image')
const STATEMENT_SOURCE_SCHEMA = schema('statement-source')
const CLASSIFICATION_SCHEMA = schema('classification')
const INVOICE_SCHEMA = schema('invoice-details')
const VALIDATION_SCHEMA = schema('invoice-validation')
const TRANSACTIONS_SCHEMA = schema('statement-transactions')
const RECONCILIATION_SCHEMA = schema('reconciliation-candidates')
const EFFECT_SCHEMA = schema('payment-scheduled')

const invoiceSource = 'ceo.aven.docs.image(invoice_1)'
const statementSource = 'ceo.aven.docs.statement_source(statement_7)'
const invoiceClass = 'ceo.aven.docs.document_classification(invoice_1, invoice)'
const invoiceDetails = 'ceo.aven.bookkeeping.invoice_details(invoice_1)'
const invoiceValidation = 'ceo.aven.bookkeeping.invoice_validation(invoice_1)'
const statementTransactions = 'ceo.aven.banking.statement_transactions(statement_7)'
const reconciliationCandidates = 'ceo.aven.bookkeeping.reconciliation_candidates(invoice_1)'
const paymentScheduled = 'ceo.aven.payments.scheduled(invoice_1)'
const RECONCILIATION_SKILL = resourceId({
	authority: 'ceo.aven',
	kind: 'skill',
	namespace: 'bookkeeping',
	name: 'reconcile-invoice',
	version: '1'
})

const INVOICE_SOURCE_ID = '11111111-1111-4111-8111-111111111111'
const STATEMENT_SOURCE_ID = '22222222-2222-4222-8222-222222222222'

const slots = (items: Array<{ name: string; predicate: string; schema: SchemaId }>) =>
	items.map((item) => ({
		...item,
		role: item.name,
		cardinality: 'one' as const
	}))

const manifest = (
	id: string,
	method: string,
	requires: string[],
	produces: string[],
	inputSlots: ReturnType<typeof slots>,
	outputSlots: ReturnType<typeof slots>,
	mode: 'observe' | 'transform' | 'effect' = 'transform'
): Manifest => ({
	id,
	authority: 'ceo.aven',
	namespace: 'testing.enrichment',
	version: '1',
	name: id,
	description: `Deterministic ${id} golden Actor.`,
	tags: ['testing', 'artifact-first'],
	methods: [
		{
			name: method,
			description: method,
			parameters: { type: 'object', additionalProperties: false },
			mode,
			idempotency: mode === 'effect' ? 'idempotent' : 'pure',
			requires,
			produces,
			inputSlots,
			outputSlots
		}
	]
})

const manifests = [
	manifest(
		'invoice-image-classifier',
		'classify_invoice_image',
		['ceo.aven.docs.image(D)'],
		['ceo.aven.docs.document_classification(D, invoice)'],
		slots([{ name: 'source', predicate: 'ceo.aven.docs.image(D)', schema: IMAGE_SCHEMA }]),
		slots([
			{
				name: 'classification',
				predicate: 'ceo.aven.docs.document_classification(D, invoice)',
				schema: CLASSIFICATION_SCHEMA
			}
		]),
		'observe'
	),
	manifest(
		'statement-classifier',
		'classify_statement',
		['ceo.aven.docs.statement_source(S)'],
		['ceo.aven.docs.document_classification(S, account_statement)'],
		slots([
			{
				name: 'source',
				predicate: 'ceo.aven.docs.statement_source(S)',
				schema: STATEMENT_SOURCE_SCHEMA
			}
		]),
		slots([
			{
				name: 'classification',
				predicate: 'ceo.aven.docs.document_classification(S, account_statement)',
				schema: CLASSIFICATION_SCHEMA
			}
		]),
		'observe'
	),
	manifest(
		'invoice-extractor',
		'extract_invoice',
		['ceo.aven.docs.image(D)', 'ceo.aven.docs.document_classification(D, invoice)'],
		['ceo.aven.bookkeeping.invoice_details(D)'],
		slots([
			{ name: 'source', predicate: 'ceo.aven.docs.image(D)', schema: IMAGE_SCHEMA },
			{
				name: 'classification',
				predicate: 'ceo.aven.docs.document_classification(D, invoice)',
				schema: CLASSIFICATION_SCHEMA
			}
		]),
		slots([
			{
				name: 'invoice',
				predicate: 'ceo.aven.bookkeeping.invoice_details(D)',
				schema: INVOICE_SCHEMA
			}
		])
	),
	manifest(
		'statement-extractor',
		'extract_statement',
		[
			'ceo.aven.docs.statement_source(S)',
			'ceo.aven.docs.document_classification(S, account_statement)'
		],
		['ceo.aven.banking.statement_transactions(S)'],
		slots([
			{
				name: 'source',
				predicate: 'ceo.aven.docs.statement_source(S)',
				schema: STATEMENT_SOURCE_SCHEMA
			},
			{
				name: 'classification',
				predicate: 'ceo.aven.docs.document_classification(S, account_statement)',
				schema: CLASSIFICATION_SCHEMA
			}
		]),
		slots([
			{
				name: 'transactions',
				predicate: 'ceo.aven.banking.statement_transactions(S)',
				schema: TRANSACTIONS_SCHEMA
			}
		])
	),
	manifest(
		'invoice-validator',
		'validate_invoice',
		['ceo.aven.bookkeeping.invoice_details(D)'],
		['ceo.aven.bookkeeping.invoice_validation(D)'],
		slots([
			{
				name: 'invoice',
				predicate: 'ceo.aven.bookkeeping.invoice_details(D)',
				schema: INVOICE_SCHEMA
			}
		]),
		slots([
			{
				name: 'validation',
				predicate: 'ceo.aven.bookkeeping.invoice_validation(D)',
				schema: VALIDATION_SCHEMA
			}
		])
	),
	manifest(
		'invoice-reconciler',
		'reconcile_invoice',
		['ceo.aven.bookkeeping.invoice_details(I)', 'ceo.aven.banking.statement_transactions(S)'],
		['ceo.aven.bookkeeping.reconciliation_candidates(I)'],
		slots([
			{
				name: 'invoice',
				predicate: 'ceo.aven.bookkeeping.invoice_details(I)',
				schema: INVOICE_SCHEMA
			},
			{
				name: 'transactions',
				predicate: 'ceo.aven.banking.statement_transactions(S)',
				schema: TRANSACTIONS_SCHEMA
			}
		]),
		slots([
			{
				name: 'candidates',
				predicate: 'ceo.aven.bookkeeping.reconciliation_candidates(I)',
				schema: RECONCILIATION_SCHEMA
			}
		])
	),
	manifest(
		'payment-scheduler',
		'schedule_payment',
		['ceo.aven.bookkeeping.invoice_validation(D)'],
		['ceo.aven.payments.scheduled(D)'],
		slots([
			{
				name: 'validation',
				predicate: 'ceo.aven.bookkeeping.invoice_validation(D)',
				schema: VALIDATION_SCHEMA
			}
		]),
		slots([
			{
				name: 'scheduled',
				predicate: 'ceo.aven.payments.scheduled(D)',
				schema: EFFECT_SCHEMA
			}
		]),
		'effect'
	)
]

const reconciliationAffordance: AffordanceDefinition = {
	id: RECONCILIATION_SKILL,
	label: 'Reconcile invoice',
	description: 'Try to match this invoice with transactions from imported bank statements.',
	requires: [
		'ceo.aven.bookkeeping.invoice_details(I)',
		'ceo.aven.banking.statement_transactions(S)'
	],
	goals: ['ceo.aven.bookkeeping.reconciliation_candidates(I)'],
	effect: 'none'
}

type Handler = (payload: ActorStepPayload) => Record<string, unknown>

class MemoryArtifacts {
	readonly publications: RuntimeStepPublication[] = []
	readonly values = new Map<string, RuntimeArtifact>()

	constructor(initial: RuntimeArtifact[]) {
		for (const artifact of initial) this.values.set(artifact.artifactId, artifact)
	}

	async resolve(artifactId: string, expectedPredicate: string): Promise<RuntimeArtifact | null> {
		const artifact = this.values.get(artifactId)
		return artifact && unifiable(artifact.predicate, expectedPredicate) ? artifact : null
	}

	async publish(publication: RuntimeStepPublication): Promise<RuntimeArtifact[]> {
		this.publications.push(structuredClone(publication))
		return publication.outputs.map((output) => {
			const artifact: RuntimeArtifact = {
				artifactId: `${publication.publicationId}:${output.slot}`,
				predicate: output.predicate,
				schema: output.schema,
				typeKey: `testing.${output.slot}`,
				schemaVersion: 1,
				contentDigest: digest(output.value),
				value: structuredClone(output.value)
			}
			this.values.set(artifact.artifactId, artifact)
			return artifact
		})
	}

	find(predicate: string): RuntimeArtifact | undefined {
		return [...this.values.values()].find((artifact) => artifact.predicate === predicate)
	}
}

class GoldenFactory implements ActorFactory {
	spawned = 0
	released = 0

	constructor(
		readonly offer: ActorFactoryOffer,
		private readonly actorManifest: Manifest,
		private readonly handler: Handler
	) {}

	async assess(request: ActorSpawnRequest) {
		return {
			admitted: true as const,
			admissionId: `admit:${request.requestId}`,
			expiresAt: '2026-08-30T23:59:59.000Z',
			grantedCapabilities: request.requestedCapabilities,
			normalizedConfiguration: request.configuration
		}
	}

	async spawn(request: ActorSpawnRequest): Promise<SpawnedActor> {
		this.spawned += 1
		const method = this.actorManifest.methods[0]?.name
		if (!method) throw new Error('golden Actor has no method')
		const actor = new Actor(this.actorManifest, {
			[method]: (payload) => ({
				record: JSON.stringify({
					ok: true,
					outputs: this.handler(payload as unknown as ActorStepPayload)
				}),
				wire: 'ok'
			})
		})
		let released = false
		return {
			actor,
			advertisement: {
				instanceId: actor.uuid,
				definitionRef: this.offer.definitionRef,
				label: this.offer.label,
				address: { kind: 'opaque', value: 'golden-server' },
				capabilityIds: request.requestedCapabilities,
				status: 'available',
				executionEnvironment: 'server'
			},
			release: () => {
				if (released) return
				released = true
				this.released += 1
				actor.dispose()
			}
		}
	}
}

interface GoldenHarness {
	runner: MemoryPlanRunner
	artifacts: MemoryArtifacts
	factories: Map<string, GoldenFactory>
	related: Ingredient[]
}

async function goldenHarness(
	options: { invalidInvoice?: boolean; reconciliationRoute?: boolean } = {}
): Promise<GoldenHarness> {
	const invoiceBytes = await readFile(
		new URL('../../../fixtures/artifacts/0001_DE_agri_coop_de-2025-00001-k.jpg', import.meta.url)
	)
	const artifacts = new MemoryArtifacts([
		{
			artifactId: INVOICE_SOURCE_ID,
			predicate: invoiceSource,
			schema: IMAGE_SCHEMA,
			typeKey: 'core.file',
			schemaVersion: 1,
			contentDigest: createHash('sha256').update(invoiceBytes).digest('hex'),
			value: { fixture: '0001_DE_agri_coop_de-2025-00001-k.jpg' }
		},
		{
			artifactId: STATEMENT_SOURCE_ID,
			predicate: statementSource,
			schema: STATEMENT_SOURCE_SCHEMA,
			typeKey: 'core.file',
			schemaVersion: 1,
			contentDigest: digest({ fixture: 'statement-7.csv' }),
			value: { fixture: 'statement-7.csv' }
		}
	])
	const handlers: Record<string, Handler> = {
		classify_invoice_image: () => ({
			classification: { kind: 'invoice', confidenceBps: 10_000 }
		}),
		classify_statement: () => ({
			classification: { kind: 'account_statement', confidenceBps: 10_000 }
		}),
		extract_invoice: () =>
			options.invalidInvoice
				? {}
				: {
						invoice: {
							invoiceNumber: 'DE-2025-00001-K',
							supplier: 'Agrarverbund Nord eG',
							currency: 'EUR',
							totalMinor: 11_900,
							invoiceDate: '2025-01-15',
							evidence: [{ sourceArtifactId: INVOICE_SOURCE_ID, page: 1 }]
						}
					},
		extract_statement: () => ({
			transactions: {
				account: 'DE02120300000000202051',
				rows: [
					{ id: 'tx-82', bookedOn: '2025-01-19', amountMinor: -11_900, currency: 'USD' },
					{
						id: 'tx-83',
						bookedOn: '2025-01-20',
						amountMinor: -11_900,
						currency: 'EUR',
						counterparty: 'Agrarverbund Nord eG',
						reference: 'DE-2025-00001-K'
					},
					{ id: 'tx-84', bookedOn: '2025-02-10', amountMinor: -2_500, currency: 'EUR' }
				]
			}
		}),
		validate_invoice: (payload) => {
			const invoice = payload.inputs.invoice?.value as { totalMinor: number }
			return { validation: { valid: invoice.totalMinor === 11_900, findings: [] } }
		},
		reconcile_invoice: (payload) => {
			const invoice = payload.inputs.invoice?.value as {
				invoiceNumber: string
				totalMinor: number
				currency: string
			}
			const statement = payload.inputs.transactions?.value as {
				rows: Array<Record<string, unknown>>
			}
			const ranked = statement.rows
				.map((row) => ({
					transactionId: row.id,
					score:
						(row.amountMinor === -invoice.totalMinor ? 40 : 0) +
						(row.currency === invoice.currency ? 30 : 0) +
						(row.reference === invoice.invoiceNumber ? 30 : 0),
					reasons: [
						...(row.amountMinor === -invoice.totalMinor ? ['amount'] : []),
						...(row.currency === invoice.currency ? ['currency'] : []),
						...(row.reference === invoice.invoiceNumber ? ['reference'] : [])
					]
				}))
				.sort((left, right) => right.score - left.score)
			return { candidates: { invoiceNumber: invoice.invoiceNumber, ranked } }
		},
		schedule_payment: () => ({ scheduled: { committed: true } })
	}
	const registry = new ActorRegistry(() => new Date('2026-08-30T12:00:00.000Z'))
	const factories = new Map<string, GoldenFactory>()
	for (const actorManifest of manifests) {
		if (actorManifest.id === 'invoice-reconciler' && options.reconciliationRoute === false) continue
		const definition = definitionFromManifest(actorManifest)
		registry.registerDefinition(definition)
		const offer: ActorFactoryOffer = {
			offerId: resourceId({
				authority: 'ceo.aven',
				kind: 'offer',
				namespace: 'testing.enrichment',
				name: actorManifest.id,
				version: '1'
			}),
			factoryId: resourceId({
				authority: 'ceo.aven',
				kind: 'factory',
				namespace: 'testing.enrichment',
				name: actorManifest.id,
				version: '1'
			}),
			definitionRef: definition.ref,
			label: actorManifest.name,
			capabilityIds: definition.capabilities.map((item) => item.id),
			executionEnvironment: 'server',
			lifetime: 'step'
		}
		registry.publishOffer(offer)
		const factory = new GoldenFactory(
			offer,
			actorManifest,
			handlers[actorManifest.methods[0]?.name ?? ''] ?? (() => ({}))
		)
		factories.set(actorManifest.id, factory)
	}
	const related: Ingredient[] = []
	const authorizer: ActorAuthorizer = {
		decide: (request) => ({
			allow: true,
			decisionId: `allow:${request.action}:${request.capabilityId ?? request.definitionRef}`
		})
	}
	const executor = createActorPlanExecutor({
		executionEnvironment: 'server',
		registry: () => registry.snapshot(),
		authorizer: () => authorizer,
		factories: () => ({
			resolve: (factoryId) =>
				[...factories.values()].find((factory) => factory.offer.factoryId === factoryId)
		}),
		artifacts: () => artifacts,
		affordances: () => [reconciliationAffordance],
		relatedIngredients: () => [...related]
	})
	return { runner: new MemoryPlanRunner(executor), artifacts, factories, related }
}

const request = (
	ingredients: Ingredient[],
	goals: string[],
	overrides: Partial<PlanRunStartRequest> = {}
): PlanRunStartRequest => {
	const now = '2026-08-30T12:00:00.000Z'
	return {
		protocol: ACTOR_RUN_PROTOCOL,
		requestId: randomUUID(),
		idempotencyKey: randomUUID(),
		requestedAt: now,
		skillRef: resourceId({
			authority: 'ceo.aven',
			kind: 'skill',
			namespace: 'testing.enrichment',
			name: 'artifact-first',
			version: '1'
		}),
		executionEnvironment: 'server',
		ingredients,
		goals,
		parameters: {},
		security: {
			principal: { subjectId: 'golden-user', kind: 'user', assurance: ['passkey'] },
			access: { tenantId: 'golden-tenant', entitlements: ['artifact-enrichment'] },
			establishedBy: 'test',
			authorizedAt: now
		},
		...overrides
	}
}

const explore = (subject: Ingredient) =>
	request([subject], [], {
		goalSpec: { mode: 'explore', subject, factFamilies: ['ceo.aven'] }
	})

async function terminal(runner: MemoryPlanRunner, runId: string): Promise<PlanRunRecord> {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
		const record = await runner.status(runId)
		if (record && ['succeeded', 'failed', 'cancelled'].includes(record.state)) return record
	}
	throw new Error('golden run did not reach a terminal state')
}

describe('artifact-first deterministic E2E', () => {
	test('enriches prior statements and an invoice, offers reconciliation, then runs it separately', async () => {
		const harness = await goldenHarness()
		const statementHandle = await harness.runner.start(
			explore({ predicate: statementSource, artifactId: STATEMENT_SOURCE_ID })
		)
		const statementRun = await terminal(harness.runner, statementHandle.runId)
		expect(statementRun.state).toBe('succeeded')
		const transactions = harness.artifacts.find(statementTransactions)
		expect(transactions).toBeDefined()
		if (!transactions) return
		harness.related.push({
			predicate: transactions.predicate,
			artifactId: transactions.artifactId
		})

		const invoiceHandle = await harness.runner.start(
			explore({ predicate: invoiceSource, artifactId: INVOICE_SOURCE_ID })
		)
		const invoiceRun = await terminal(harness.runner, invoiceHandle.runId)
		expect(invoiceRun.state).toBe('succeeded')
		const understanding = invoiceRun.checkpoints.at(-1)?.output as
			| PlanRunUnderstandingOutput
			| undefined
		expect(understanding).toMatchObject({
			kind: 'artifact-understanding',
			status: 'complete',
			stoppingReason: 'saturated',
			subjectArtifactId: INVOICE_SOURCE_ID
		})
		expect(understanding?.facts.map((fact) => fact.predicate)).toEqual([
			invoiceSource,
			invoiceClass,
			invoiceDetails,
			invoiceValidation
		])
		expect(understanding?.affordances).toHaveLength(1)
		const action = understanding?.affordances[0]
		expect(action).toMatchObject({
			id: reconciliationAffordance.id,
			goals: [reconciliationCandidates],
			effect: 'none'
		})
		if (!action) return
		expect(harness.factories.get('payment-scheduler')?.spawned).toBe(0)
		expect(harness.artifacts.find(paymentScheduled)).toBeUndefined()

		const reconcileHandle = await harness.runner.start(
			request(action.ingredients, action.goals, {
				skillRef: RECONCILIATION_SKILL
			})
		)
		const reconcileRun = await terminal(harness.runner, reconcileHandle.runId)
		expect(reconcileRun.state).toBe('succeeded')
		const candidate = harness.artifacts.find(reconciliationCandidates)
		expect(candidate).toBeDefined()
		if (!candidate) return
		expect(candidate.value).toMatchObject({ invoiceNumber: 'DE-2025-00001-K' })
		const ranked = (candidate.value as { ranked: Array<Record<string, unknown>> }).ranked
		expect(ranked.map((item) => item.transactionId)).toEqual(['tx-83', 'tx-82', 'tx-84'])
		expect(ranked[0]).toEqual({
			transactionId: 'tx-83',
			score: 100,
			reasons: ['amount', 'currency', 'reference']
		})
		expect(harness.factories.get('invoice-reconciler')?.spawned).toBe(1)
	})

	test('does not offer reconciliation without prior facts or an executable route', async () => {
		for (const reconciliationRoute of [true, false]) {
			const harness = await goldenHarness({ reconciliationRoute })
			if (!reconciliationRoute) {
				harness.related.push({
					predicate: statementTransactions,
					artifactId: 'missing-route-statement'
				})
			}
			const handle = await harness.runner.start(
				explore({ predicate: invoiceSource, artifactId: INVOICE_SOURCE_ID })
			)
			const run = await terminal(harness.runner, handle.runId)
			const output = run.checkpoints.at(-1)?.output as PlanRunUnderstandingOutput
			expect(output.affordances).toEqual([])
			expect(harness.factories.get('payment-scheduler')?.spawned).toBe(0)
		}
	})

	test('fails closed when an extractor omits its declared output', async () => {
		const harness = await goldenHarness({ invalidInvoice: true })
		const handle = await harness.runner.start(
			explore({ predicate: invoiceSource, artifactId: INVOICE_SOURCE_ID })
		)
		const run = await terminal(harness.runner, handle.runId)
		expect(run.state).toBe('failed')
		expect(run.failure?.message).toContain('omitted invoice')
		expect(harness.artifacts.find(invoiceDetails)).toBeUndefined()
		expect(harness.artifacts.find(invoiceValidation)).toBeUndefined()
		expect(harness.artifacts.find(paymentScheduled)).toBeUndefined()
	})
})

function digest(value: unknown): string {
	return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
		.join(',')}}`
}
