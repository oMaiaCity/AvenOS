import { describe, expect, test } from 'vitest'
import { normalizeInvoiceOpenItem } from '../src/actors/open-item-normalizer'
import { createReconciliationRankerActor } from '../src/actors/reconciliation-ranker'
import { normalizeStatement } from '../src/actors/statement-normalizer'
import { createStatementTransactionFanoutActor } from '../src/actors/statement-transaction-fanout'
import {
	type OpenItem,
	rankInvoiceTransactions,
	type StatementTransaction
} from '../src/reconciliation'
import { parseDocumentActorResult } from '../src/results'

const VALIDATION = {
	rulesetVersion: 'statement-core-v1',
	status: 'consistent',
	coverageBps: 10_000,
	checks: [
		{
			ruleId: 'statement.opening-plus-transactions-equals-closing',
			outcome: 'PASS',
			severity: 'hard',
			paths: ['/transactions'],
			message: 'Balances agree.'
		}
	]
}

function statementCandidate(transactions: Record<string, unknown>[]) {
	return {
		statementKind: 'monthly-statement',
		currency: 'EUR',
		accountHolder: 'Aven GmbH',
		institution: { name: 'Example Bank', city: 'Berlin' },
		accountIban: 'DE89 3704 0044 0532 0130 00',
		accountNumber: null,
		productName: 'Business account',
		openingBalanceMinor: 10_000,
		closingBalanceMinor: 8_800,
		periodStart: '2026-08-01',
		periodEnd: '2026-08-31',
		transactions,
		summary: 'August account statement.'
	}
}

function transaction(overrides: Record<string, unknown> = {}) {
	return {
		transactionId: 'bank-tx-42',
		bookingDate: '2026-08-18',
		valueDate: '2026-08-18',
		title: 'SEPA transfer',
		amountMinor: -1200,
		counterpartyName: 'ACME GmbH',
		counterpartyIban: 'DE12500105170648489890',
		description: 'Invoice RE-42',
		originalAmountMinor: null,
		originalCurrency: null,
		exchangeRate: null,
		fxSurchargeMinor: null,
		foreignExchangeFeeBps: null,
		balanceAfterMinor: 8800,
		sourceRow: 17,
		...overrides
	}
}

const OPEN_ITEM: OpenItem = {
	businessKey: 'invoice:acmegmbh:re42',
	businessKeyBasis: 'supplier-invoice-number',
	documentKind: 'invoice',
	direction: 'payable',
	supplierName: 'ACME GmbH',
	supplierIbans: ['DE12500105170648489890'],
	invoiceNumber: 'RE-42',
	orderNumber: 'PO-7',
	issueDate: '2026-08-15',
	dueDate: '2026-08-30',
	currency: 'EUR',
	grossMinor: 1200,
	amountDueMinor: 1200,
	amountPaidMinor: null,
	references: ['RE-42', 'PO-7'],
	validationStatus: 'consistent',
	summary: 'Invoice RE-42.'
}

function normalizedTransaction(
	overrides: Partial<StatementTransaction> = {}
): StatementTransaction {
	return {
		dedupKey: 'provider:account:bank-tx-42',
		dedupBasis: 'provider-id',
		accountRef: 'iban:DE89370400440532013000',
		providerTransactionId: 'bank-tx-42',
		bookingDate: '2026-08-18',
		valueDate: '2026-08-18',
		title: 'SEPA transfer',
		amountMinor: -1200,
		currency: 'EUR',
		counterpartyName: 'ACME GmbH',
		counterpartyIban: 'DE12500105170648489890',
		description: 'Payment for invoice RE-42',
		originalAmountMinor: null,
		originalCurrency: null,
		exchangeRate: null,
		fxSurchargeMinor: null,
		foreignExchangeFeeBps: null,
		balanceAfterMinor: 8800,
		sourceRow: 17,
		sourceOrdinal: 0,
		statementValidationStatus: 'consistent',
		statementCoverage: 'verified',
		...overrides
	}
}

describe('reconciliation normalization', () => {
	test('does not derive an invoice identity from blank or punctuation-only identifiers', () => {
		for (const [supplier, invoiceNumber] of [
			[null, 'RE-42'],
			['ACME', null],
			['---', 'RE-42'],
			['ACME', ' / ']
		]) {
			expect(() =>
				normalizeInvoiceOpenItem(
					{
						supplier,
						invoiceNumber,
						currency: 'EUR',
						grossMinor: 1200,
						summary: 'Not an identity'
					},
					{ documentKind: 'invoice', supplier: null },
					{ status: 'consistent' }
				)
			).toThrow()
		}
	})
	test('namespaces domestic account numbers by institution', async () => {
		const first = statementCandidate([transaction()])
		const second = { ...first, accountIban: null, accountNumber: '12345' }
		const a = await normalizeStatement(second, VALIDATION)
		const b = await normalizeStatement(
			{ ...second, institution: { name: 'Another Bank', city: 'Berlin' } },
			VALIDATION
		)
		expect(a.statement.accountRef).not.toBe(b.statement.accountRef)
		expect(a.transactions[0]!.dedupKey).not.toBe(b.transactions[0]!.dedupKey)
	})

	test('matches historical gross value even after a partial payment and retains Unicode supplier identity', () => {
		const paid = {
			...OPEN_ITEM,
			amountDueMinor: 300,
			amountPaidMinor: 900,
			supplierName: '株式会社山田'
		}
		const match = rankInvoiceTransactions(paid, [
			normalizedTransaction({ counterpartyName: '株式会社山田' })
		])[0]!
		expect(match.amountDistanceMinor).toBe(0)
		expect(match.counterpartyMatch).toBe('exact')
	})

	test('does not treat a reused mandate as invoice-specific proof or normalize invalid dates', () => {
		const item = { ...OPEN_ITEM, issueDate: '2026-02-31', references: ['CUSTOMER-100000'] }
		const match = rankInvoiceTransactions(item, [
			normalizedTransaction({ description: 'CUSTOMER-100000' })
		])[0]!
		expect(match.referenceMatch).toBe('exact') // Useful ranking evidence, not invoice identity.
		expect(match.issueDateDistanceDays).toBeNull()
		expect(match.blockers).toContain('invoice-specific-evidence-missing')
	})

	test('amount distance sorts ahead of stronger text evidence', () => {
		const matches = rankInvoiceTransactions(OPEN_ITEM, [
			normalizedTransaction({ dedupKey: 'far', amountMinor: -2000 }),
			normalizedTransaction({
				dedupKey: 'near',
				description: 'Unidentified purchase',
				counterpartyName: 'Unknown'
			})
		])
		expect(matches[0]!.transactionDedupKey).toBe('near')
	})
	test('turns extracted invoice details into a stable open item and retains matching evidence', () => {
		const openItem = normalizeInvoiceOpenItem(
			{
				supplier: 'ACME GmbH',
				invoiceNumber: 'RE-42',
				currency: 'EUR',
				grossMinor: 1200,
				dueDate: '2026-08-30',
				summary: 'Invoice RE-42.'
			},
			{
				documentKind: 'invoice',
				issueDate: '2026-08-15',
				orderNumber: 'PO-7',
				supplier: {
					name: 'ACME GmbH',
					bankingAccounts: [{ iban: 'DE12 5001 0517 0648 4898 90' }]
				},
				payment: {
					iban: 'DE12 5001 0517 0648 4898 90',
					amountPaidMinor: 1200,
					totalOutstandingMinor: 0
				},
				payments: [{ reference: 'BANK-REF-9' }],
				referenceEntries: [{ value: 'MANDATE-3' }]
			},
			{ status: 'consistent' }
		)

		expect(openItem).toMatchObject({
			businessKey: 'invoice:acmegmbh:re42',
			amountDueMinor: 1200,
			amountPaidMinor: 1200,
			validationStatus: 'consistent'
		})
		expect(openItem.supplierIbans).toEqual(['DE12 5001 0517 0648 4898 90'])
		expect(openItem.references).toEqual(['RE-42', 'PO-7', 'MANDATE-3', 'BANK-REF-9'])
	})

	test('fans out provider identities and deterministic fallback fingerprints without losing FX values', async () => {
		const candidate = statementCandidate([
			transaction(),
			transaction({
				transactionId: null,
				amountMinor: -1110,
				originalAmountMinor: -1200,
				originalCurrency: 'USD',
				description: 'Invoice USD-9',
				sourceRow: 18
			})
		])
		const first = await normalizeStatement(candidate, VALIDATION)
		const second = await normalizeStatement(candidate, VALIDATION)

		expect(first.statement).toMatchObject({
			accountRef: 'iban:DE89370400440532013000',
			accountIdentityBasis: 'iban',
			coverage: 'unverified',
			transactionCount: 2
		})
		expect(first.transactions[0]).toMatchObject({
			dedupBasis: 'provider-id',
			originalAmountMinor: null
		})
		expect(first.transactions[1]).toMatchObject({
			dedupBasis: 'fingerprint',
			originalAmountMinor: -1200,
			originalCurrency: 'USD'
		})
		expect(first.transactions[1]?.dedupKey).toBe(second.transactions[1]?.dedupKey)
	})

	test('marks an extraction at the model row ceiling as incomplete coverage', async () => {
		const transactions = Array.from({ length: 128 }, (_, index) =>
			transaction({ transactionId: `tx-${index}`, sourceRow: index + 1 })
		)
		const normalized = await normalizeStatement(statementCandidate(transactions), VALIDATION)
		expect(normalized.statement.coverage).toBe('row-limit-reached')
		expect(
			normalized.transactions.every((item) => item.statementCoverage === 'row-limit-reached')
		).toBe(true)
	})

	test('publishes the second bounded transaction batch with dense output ordinals', async () => {
		const transactions = Array.from({ length: 65 }, (_, index) =>
			transaction({ transactionId: `tx-${index + 1}`, sourceRow: index + 1 })
		)
		const actor = createStatementTransactionFanoutActor()
		const response = await actor.deliver('document_fanout_statement_transactions', {
			candidate: statementCandidate(transactions),
			validation: VALIDATION,
			offset: 64
		})
		const result = parseDocumentActorResult(response.record)

		expect(result.artifacts).toHaveLength(1)
		expect(result.artifacts[0]).toMatchObject({
			localKey: 'transaction-065',
			output: { role: 'transaction', ordinal: 0 }
		})
		expect(result.evidence[0]?.inputLocator).toEqual({
			kind: 'json-pointer',
			pointer: '/transactions/64'
		})
	})
})

describe('invoice-to-transaction ranking', () => {
	test('connects PR #188-shaped invoice and statement outputs through the ranking actor', async () => {
		const openItem = normalizeInvoiceOpenItem(
			{
				supplier: 'ACME GmbH',
				invoiceNumber: 'RE-42',
				currency: 'EUR',
				grossMinor: 1200,
				dueDate: '2026-08-30',
				summary: 'Invoice RE-42.'
			},
			{
				documentKind: 'invoice',
				issueDate: '2026-08-15',
				orderNumber: null,
				supplier: { name: 'ACME GmbH', bankingAccounts: [] },
				payment: null,
				payments: [],
				referenceEntries: []
			},
			{ status: 'consistent' }
		)
		const statement = await normalizeStatement(statementCandidate([transaction()]), VALIDATION)
		const actor = createReconciliationRankerActor()
		const response = await actor.deliver('reconciliation_rank_invoice_transactions', {
			openItem,
			transactions: statement.transactions
		})
		const result = parseDocumentActorResult(response.record)

		expect(result.artifacts[0]?.payload).toMatchObject({
			amountMatchBasis: 'account',
			amountDistanceMinor: 0,
			referenceMatch: 'exact',
			recommendation: 'review',
			pairEligible: false,
			blockers: expect.arrayContaining([
				'open-item-direction-unknown',
				'statement-coverage-unverified'
			])
		})
	})

	test('publishes ranked match candidates with lineage to both canonical inputs', async () => {
		const actor = createReconciliationRankerActor()
		const response = await actor.deliver('reconciliation_rank_invoice_transactions', {
			openItem: OPEN_ITEM,
			transactions: [normalizedTransaction()]
		})
		const result = parseDocumentActorResult(response.record)

		expect(result.procedureKey).toBe('client.rank-invoice-transactions')
		expect(result.artifacts[0]).toMatchObject({
			localKey: 'match-001',
			typeKey: 'reconciliation.match-candidate',
			output: { role: 'match-candidate', ordinal: 0 },
			payload: { rank: 1, pairEligible: true }
		})
		expect(result.evidence.map((item) => [item.inputRole, item.inputOrdinal])).toEqual([
			['open-item', 0],
			['transaction', 0]
		])
	})

	test('ranks exact account-amount, reference, IBAN, counterparty, date, and sign evidence first', () => {
		const ranked = rankInvoiceTransactions(OPEN_ITEM, [
			normalizedTransaction({
				dedupKey: 'provider:near',
				amountMinor: -1225,
				description: 'Monthly services',
				bookingDate: '2026-08-19'
			}),
			normalizedTransaction()
		])

		expect(ranked[0]).toMatchObject({
			transactionDedupKey: 'provider:account:bank-tx-42',
			rank: 1,
			amountMatchBasis: 'account',
			amountDistanceMinor: 0,
			referenceMatch: 'exact',
			ibanMatch: true,
			signMatch: 'match',
			pairEligible: true,
			recommendation: 'eligible-for-assignment'
		})
	})

	test('retains the prior-art original-currency amount comparison for FX bookings', () => {
		const usdInvoice = { ...OPEN_ITEM, currency: 'USD' }
		const ranked = rankInvoiceTransactions(usdInvoice, [
			normalizedTransaction({
				amountMinor: -1110,
				currency: 'EUR',
				originalAmountMinor: -1200,
				originalCurrency: 'USD'
			})
		])

		expect(ranked[0]).toMatchObject({
			amountMatchBasis: 'original',
			amountDistanceMinor: 0,
			matchedTransactionAmountMinor: -1200,
			matchedTransactionCurrency: 'USD'
		})
	})

	test('groups duplicate transaction observations and does not substring-match short references', () => {
		const duplicate = normalizedTransaction({
			description: 'Payment 3129',
			sourceOrdinal: 1
		})
		const ranked = rankInvoiceTransactions({ ...OPEN_ITEM, references: ['12'] }, [
			normalizedTransaction({ description: 'Payment 3129' }),
			duplicate
		])

		expect(ranked).toHaveLength(1)
		expect(ranked[0]).toMatchObject({ duplicateCount: 2, referenceMatch: 'none' })
	})

	test('uses a short exact reference for ranking but not as automatic-match authority', () => {
		const ranked = rankInvoiceTransactions(
			{ ...OPEN_ITEM, references: ['42'], supplierIbans: [] },
			[normalizedTransaction({ description: 'Payment 42', counterpartyIban: null })]
		)

		expect(ranked[0]).toMatchObject({ referenceMatch: 'exact', pairEligible: false })
		expect(ranked[0]?.blockers).toContain('invoice-specific-evidence-missing')
	})

	test('treats an exact supplier IBAN as strong ranking support, not invoice identity', () => {
		const ranked = rankInvoiceTransactions({ ...OPEN_ITEM, references: [] }, [
			normalizedTransaction({ description: 'Monthly services' })
		])

		expect(ranked[0]).toMatchObject({ ibanMatch: true, pairEligible: false })
		expect(ranked[0]?.blockers).toContain('invoice-specific-evidence-missing')
	})

	test('keeps good-looking candidates review-only when direction or statement coverage is unknown', () => {
		const ranked = rankInvoiceTransactions({ ...OPEN_ITEM, direction: 'unknown' }, [
			normalizedTransaction({ statementCoverage: 'unverified' })
		])

		expect(ranked[0]?.pairEligible).toBe(false)
		expect(ranked[0]?.blockers).toEqual(
			expect.arrayContaining(['open-item-direction-unknown', 'statement-coverage-unverified'])
		)
	})
})
