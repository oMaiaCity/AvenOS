import { describe, expect, test } from 'bun:test'
import { discoverAffordances } from '../src/affordances'
import { type Capability, planEnrichment, planGoalThenEnrichment } from '../src/planner'

const capability = (
	id: string,
	method: string,
	requires: string[],
	produces: string[],
	mode: Capability['mode'] = 'transform'
): Capability => ({
	id,
	actor: `actor:${id}`,
	method,
	requires,
	produces,
	mode
})

describe('artifact-first enrichment planning', () => {
	test('runs every applicable extractor, preserves independent evidence paths, and excludes effects', () => {
		const planned = planEnrichment(
			[
				capability(
					'a-inspect',
					'inspect',
					['ceo.aven.docs.file(D)'],
					['ceo.aven.docs.profile(D)'],
					'observe'
				),
				capability(
					'b-native',
					'extract_native',
					['ceo.aven.docs.profile(D)'],
					['ceo.aven.bookkeeping.invoice_details(D)']
				),
				capability(
					'c-vision',
					'extract_vision',
					['ceo.aven.docs.profile(D)'],
					['ceo.aven.bookkeeping.invoice_details(D)']
				),
				capability(
					'd-validate',
					'validate',
					['ceo.aven.bookkeeping.invoice_details(D)'],
					['ceo.aven.bookkeeping.invoice_validation(D)']
				),
				capability(
					'e-pay',
					'schedule_payment',
					['ceo.aven.bookkeeping.invoice_validation(D)'],
					['ceo.aven.payments.scheduled(D)'],
					'effect'
				),
				capability(
					'f-unrelated',
					'index_unrelated',
					['ceo.aven.docs.file(D)'],
					['os.aven.testing.unrelated(D)']
				)
			],
			[{ predicate: 'ceo.aven.docs.file(invoice_1)', artifactId: 'source-1' }],
			{ factFamilies: ['ceo.aven'] }
		)

		expect(planned.ok).toBe(true)
		if (!planned.ok) return
		expect(planned.program.steps.map((step) => step.method)).toEqual([
			'inspect',
			'extract_native',
			'extract_vision',
			'validate',
			'validate'
		])
		expect(planned.program.steps.some((step) => step.method === 'schedule_payment')).toBe(false)
		expect(planned.program.steps.some((step) => step.method === 'index_unrelated')).toBe(false)
	})

	test('reaches a fixpoint when a capability can consume its own output', () => {
		const planned = planEnrichment(
			[capability('normalize', 'normalize', ['ceo.aven.docs.text(D)'], ['ceo.aven.docs.text(D)'])],
			[{ predicate: 'ceo.aven.docs.text(document_1)', artifactId: 'text-1' }],
			{ factFamilies: ['ceo.aven.docs'] }
		)

		expect(planned.ok).toBe(true)
		if (!planned.ok) return
		expect(planned.program.steps).toHaveLength(1)
	})

	test('proves directed goals first and then runs the remaining exhaustive frontier', () => {
		const broad = {
			...capability(
				'a-broad-extractor',
				'extract_broad',
				['ceo.aven.docs.file(D)'],
				['ceo.aven.bookkeeping.invoice_details(D)']
			),
			cost: 10
		}
		const fast = {
			...capability(
				'z-directed-extractor',
				'extract_for_goal',
				['ceo.aven.docs.file(D)'],
				['ceo.aven.bookkeeping.invoice_details(D)']
			),
			cost: 1
		}
		const planned = planGoalThenEnrichment(
			[broad, fast],
			[{ predicate: 'ceo.aven.docs.file(invoice_1)', artifactId: 'source-1' }],
			['ceo.aven.bookkeeping.invoice_details(invoice_1)'],
			{ factFamilies: ['ceo.aven'] }
		)

		expect(planned.ok).toBe(true)
		if (!planned.ok) return
		expect(planned.program.steps.map((step) => step.method)).toEqual([
			'extract_for_goal',
			'extract_broad'
		])
		expect(planned.program.goals).toEqual(['ceo.aven.bookkeeping.invoice_details(invoice_1)'])
	})
})

describe('affordance discovery', () => {
	const reconciliation = capability(
		'reconcile',
		'reconcile_invoice',
		['ceo.aven.bookkeeping.invoice_details(I)', 'ceo.aven.banking.statement_transactions(S)'],
		['ceo.aven.bookkeeping.reconciliation_candidates(I)']
	)
	const definition = {
		id: 'ceo.aven:skill:bookkeeping:reconcile-invoice@1',
		label: 'Reconcile invoice',
		description: 'Try to match this invoice with imported bank transactions.',
		requires: [
			'ceo.aven.bookkeeping.invoice_details(I)',
			'ceo.aven.banking.statement_transactions(S)'
		],
		goals: ['ceo.aven.bookkeeping.reconciliation_candidates(I)'],
		effect: 'none' as const
	}

	test('offers an action only when its facts and executable route both exist', () => {
		const invoice = {
			predicate: 'ceo.aven.bookkeeping.invoice_details(invoice_1)',
			artifactId: 'invoice-details-1'
		}
		const statement = {
			predicate: 'ceo.aven.banking.statement_transactions(statement_7)',
			artifactId: 'statement-transactions-7'
		}

		expect(discoverAffordances([definition], [invoice], [reconciliation])).toEqual([])
		expect(
			discoverAffordances(
				[definition],
				[invoice, statement],
				[{ ...reconciliation, available: false }]
			)
		).toEqual([])
		expect(discoverAffordances([definition], [invoice, statement], [reconciliation])).toEqual([
			{
				id: definition.id,
				label: definition.label,
				description: definition.description,
				goals: ['ceo.aven.bookkeeping.reconciliation_candidates(invoice_1)'],
				effect: 'none',
				ingredients: [invoice, statement]
			}
		])
	})
})
