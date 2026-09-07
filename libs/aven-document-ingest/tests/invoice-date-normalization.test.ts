import { describe, expect, test } from 'vitest'
import { normalizeInvoiceDates } from '../src/actors/invoice-extractor'

describe('invoice date normalization', () => {
	test('stabilizes a Mexican DD/MM/YYYY source when a model defaults to month/day', () => {
		const details: Record<string, unknown> = { issueDate: '2026-11-08' }
		normalizeInvoiceDates(
			details,
			'La Estrella Transit · CDMX · RFC PZA841064A1 · 11/08/2026 · TOTAL MX$633,60'
		)
		expect(details.issueDate).toBe('2026-08-11')
	})

	test('leaves an already day-first Mexican result unchanged', () => {
		const details: Record<string, unknown> = { issueDate: '2026-08-11' }
		normalizeInvoiceDates(details, 'RFC PZA841064A1 11/08/2026 MX$633,60')
		expect(details.issueDate).toBe('2026-08-11')
	})

	test('does not guess without both source agreement and strong locale evidence', () => {
		for (const [date, text] of [
			['2026-11-08', 'TOLL RECEIPT 11/08/2026 USD 633.60'],
			['2026-11-08', 'RFC PZA841064A1 09/13/2026 MX$633,60'],
			['2026-07-01', 'RFC PZA841064A1 11/08/2026 MX$633,60']
		] as const) {
			const details: Record<string, unknown> = { issueDate: date }
			normalizeInvoiceDates(details, text)
			expect(details.issueDate).toBe(date)
		}
	})
})
