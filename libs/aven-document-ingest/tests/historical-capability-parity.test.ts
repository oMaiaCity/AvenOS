import { describe, expect, test } from 'vitest'
import { documentLlmRequest, documentOutputTokenBudget } from '../src/llm-gateway'
import { documentModelSchema, modelRequest } from '../src/model'

/** Locks the former server extractor's useful information surface, not its API. */
describe('historical server extraction capability floor', () => {
	test('sizes provider output budgets to the procedure and visible document', () => {
		const short = 'TOLL RECEIPT\nTOTAL MX$633,60'
		const classification = modelRequest('classify-document', [], short)
		const page = modelRequest('analyze-page', [], short)
		const invoice = modelRequest('extract-invoice', [], short, 'receipt')
		expect(documentOutputTokenBudget(classification)).toBe(4_096)
		expect(documentOutputTokenBudget(page)).toBe(8_192)
		expect(documentOutputTokenBudget(invoice)).toBe(16_384)
		expect(documentLlmRequest('model', invoice).maxOutputTokens).toBe(16_384)

		const large = modelRequest('extract-invoice', [], 'x'.repeat(200_000), 'invoice')
		expect(documentOutputTokenBudget(large)).toBe(65_536)
	})

	test('retains complete invoice bodies and focused party fields', () => {
		const schema = object(documentModelSchema('extract-invoice'))
		const candidate = property(schema, 'candidate')
		expect(required(candidate)).toEqual(
			expect.arrayContaining([
				'supplier',
				'invoiceNumber',
				'currency',
				'netMinor',
				'taxMinor',
				'grossMinor',
				'dueDate'
			])
		)
		const details = property(schema, 'details')
		const fields = object(details.properties)
		expect(required(details)).toEqual(
			expect.arrayContaining([
				'documentKind',
				'issueDate',
				'customerNumber',
				'orderNumber',
				'taxBreakdown',
				'payments',
				'referenceEntries'
			])
		)
		const supplier = object(fields.supplier)
		expect(required(supplier)).toEqual(
			expect.arrayContaining([
				'name',
				'vatId',
				'taxNumber',
				'street',
				'postalCode',
				'city',
				'country',
				'email',
				'phone',
				'contactName',
				'bankingAccounts'
			])
		)
		expect(required(object(object(fields.lineItems).items))).toEqual(
			expect.arrayContaining([
				'position',
				'title',
				'description',
				'quantity',
				'unitPriceMinor',
				'taxRateBps',
				'grossMinor',
				'servicePeriod'
			])
		)
		expect(required(fields.payment)).toEqual(
			expect.arrayContaining(['iban', 'bic', 'amountPaidMinor', 'totalOutstandingMinor'])
		)
		expect(object(fields.payments).type).toBe('array')
	})

	test('retains account, institution, balances, transaction and FX detail', () => {
		const schema = object(documentModelSchema('extract-statement'))
		const candidate = property(schema, 'candidate')
		const fields = object(candidate.properties)
		expect(required(candidate)).toEqual(
			expect.arrayContaining([
				'accountHolderDetails',
				'institution',
				'accountIban',
				'accountBic',
				'accountNumber',
				'productName',
				'openingBalanceMinor',
				'closingBalanceMinor',
				'periodStart',
				'periodEnd',
				'notes'
			])
		)
		expect(required(object(object(fields.transactions).items))).toEqual(
			expect.arrayContaining([
				'bookingDate',
				'valueDate',
				'title',
				'amountMinor',
				'counterpartyName',
				'counterpartyIban',
				'originalAmountMinor',
				'originalCurrency',
				'exchangeRate',
				'fxSurchargeMinor',
				'foreignExchangeFeeBps',
				'balanceAfterMinor'
			])
		)
	})
})

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {}
}

function property(value: unknown, name: string): Record<string, unknown> {
	return object(object(object(value).properties)[name])
}

function required(value: unknown): unknown[] {
	const result = object(value).required
	return Array.isArray(result) ? result : []
}
