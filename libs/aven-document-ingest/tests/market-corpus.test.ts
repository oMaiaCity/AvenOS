import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import corpus from '../../../fixtures/golden/reconciliation-market/cases.json'
import { normalizeInvoiceOpenItem } from '../src/actors/open-item-normalizer'
import { normalizeStatement } from '../src/actors/statement-normalizer'
import { rankInvoiceTransactions } from '../src/reconciliation'
import { ServerDocumentDecoder } from '../src/server'

const compact = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '')
for (const spec of corpus.documents) {
	test(`synthetic market PDF preserves every authored line: ${spec.id}`, async () => {
		const bytes = await readFile(
			new URL(`../../../fixtures/golden/reconciliation-market/${spec.id}.pdf`, import.meta.url)
		)
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
		expect(decoded.pages).toHaveLength(1)
		const text = compact(decoded.pages.flatMap((p) => p.runs.map((r) => r.text)).join('\n'))
		for (const line of [spec.title, ...spec.lines, 'SYNTHETIC TEST FIXTURE - NOT PAYABLE'])
			expect(text, spec.id).toContain(compact(line))
		if (
			spec.expected.candidate?.grossMinor !== undefined &&
			spec.expected.candidate.netMinor !== undefined &&
			spec.expected.candidate.taxMinor != null
		)
			expect(spec.expected.candidate.netMinor + spec.expected.candidate.taxMinor).toBe(
				spec.expected.candidate.grossMinor
			)
	}, 10_000)
}

test('synthetic statement totals reconcile independently of extracted/model output', () => {
	const statement = corpus.documents.find((s) => s.id === 'de-bank-statement')!.expected
	expect(
		statement.statement!.openingBalanceMinor +
			statement.transactionAmounts!.reduce((a, b) => a + b, 0)
	).toBe(statement.statement!.closingBalanceMinor)
})

// Read the independently authored source rows, not an LLM's answer. This separates
// matching policy regression from the opt-in provider's extraction accuracy.
for (const scenario of corpus.matching) {
	test(`market relationship policy: ${scenario.relationship}`, async () => {
		const invoice = corpus.documents.find((s) => s.id === scenario.invoice)!
		const statement = corpus.documents.find((s) => s.id === 'de-bank-statement')!
		const rawRows = statement.lines.filter((line) => /^\d{2}\.\d{2}\.\d{4} \| TX-/.test(line))
		const normalized = await normalizeStatement(
			{
				...statement.expected.statement,
				institution: { name: 'Musterbank', city: null },
				accountNumber: 'TEST-KONTO-DE-001',
				transactions: rawRows.map((line, index) => {
					const [date, transactionId, counterpartyName, description] = line.split(' | ')
					const bookingDate = date!.split('.').reverse().join('-')
					return {
						transactionId,
						bookingDate,
						valueDate: bookingDate,
						counterpartyName,
						description,
						title: description,
						amountMinor: statement.expected.transactionAmounts![index],
						sourceRow: index + 1,
						originalAmountMinor: transactionId === 'TX-DE-04' ? -100000 : null,
						originalCurrency: transactionId === 'TX-DE-04' ? 'CNY' : null,
						fxSurchargeMinor: transactionId === 'TX-DE-04' ? 210 : null
					}
				})
			},
			{ status: 'consistent', checks: [] }
		)
		const item = normalizeInvoiceOpenItem(
			{ ...invoice.expected.candidate, summary: invoice.title },
			{
				documentKind: invoice.expected.documentKind,
				supplier: { name: invoice.subtitle },
				payment: invoice.expected.payment ?? null
			},
			{ status: 'consistent' }
		)
		const matches = rankInvoiceTransactions(item, normalized.transactions)
		expect(matches.every((m) => m.recommendation === 'review' && !m.pairEligible)).toBe(true)
		const byId = (id: string) =>
			matches.find(
				(m) => normalized.transactions[m.transactionInputOrdinal]!.providerTransactionId === id
			)!
		switch (scenario.relationship) {
			case 'exact-gross-reference':
			case 'refund-reference': {
				const match = byId(scenario.transaction!)
				expect(match.amountDistanceMinor).toBe(0)
				expect(match.referenceMatch).toBe('exact')
				expect(matches[0]).toEqual(match)
				break
			}
			case 'remaining-balance-only-not-exact-gross':
				expect(item.amountDueMinor).toBe(10000)
				expect(byId(scenario.transaction!).amountDistanceMinor).toBe(109000)
				break
			case 'two-part-payments-no-single-exact-booking':
				for (const id of scenario.transactions!) {
					expect(byId(id).referenceMatch).toBe('exact')
					expect(byId(id).amountDistanceMinor).toBeGreaterThan(0)
				}
				break
			case 'foreign-currency-with-fee-review':
				expect(byId(scenario.transaction!)).toMatchObject({
					amountMatchBasis: 'original',
					amountDistanceMinor: 0,
					matchedTransactionCurrency: 'CNY',
					recommendation: 'review'
				})
				break
			case 'cash-receipt-no-bank-match':
				expect(
					matches.every((m) => m.amountDistanceMinor !== 0 && m.referenceMatch !== 'exact')
				).toBe(true)
				break
			case 'card-total-includes-tip-no-exact-gross-match': {
				const card = {
					...normalized.transactions[0]!,
					amountMinor: -6450,
					counterpartyName: invoice.subtitle,
					description: item.invoiceNumber!
				}
				expect(rankInvoiceTransactions(item, [card])[0]).toMatchObject({
					amountDistanceMinor: 500,
					recommendation: 'review'
				})
				break
			}
			default:
				throw new Error(`Unimplemented market oracle: ${scenario.relationship}`)
		}
	})
}
