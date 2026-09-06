import { Actor } from '@avenos/actors'
import type { OpenItem, ValidationStatus } from '../../reconciliation'
import { artifact, failure, manifest, object, success, wholeArtifact } from '../../shared'

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function money(value: unknown): number | null {
	return Number.isSafeInteger(value) ? Number(value) : null
}

function compact(value: string): string {
	return value
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '')
}

function validationStatus(value: unknown): ValidationStatus {
	return value === 'consistent' ||
		value === 'inconsistent' ||
		value === 'incomplete' ||
		value === 'insufficient-coverage'
		? value
		: 'incomplete'
}

export function normalizeInvoiceOpenItem(
	candidate: Record<string, unknown>,
	details: Record<string, unknown>,
	validation: Record<string, unknown>
): OpenItem {
	const supplier = details.supplier === null ? {} : object(details.supplier, 'invoice supplier')
	const payment = details.payment == null ? null : object(details.payment, 'invoice payment')
	const supplierName = text(supplier.name) ?? text(candidate.supplier)
	const invoiceNumber = text(candidate.invoiceNumber)
	const currency = text(candidate.currency)
	if (!supplierName || !invoiceNumber || !currency || !/^[A-Z]{3}$/.test(currency))
		throw new Error('Invoice identity and currency must be known before reconciliation.')
	const grossMinor = money(candidate.grossMinor)
	if (grossMinor === null) throw new Error('invoice gross amount is invalid')
	const outstandingMinor = money(payment?.totalOutstandingMinor)
	const amountPaidMinor = money(payment?.amountPaidMinor)
	const amountDueMinor =
		outstandingMinor !== null && outstandingMinor !== 0 ? outstandingMinor : grossMinor
	const bankingAccounts = Array.isArray(supplier.bankingAccounts) ? supplier.bankingAccounts : []
	const supplierIbans = [
		text(payment?.iban),
		...bankingAccounts.map((entry) => text(object(entry, 'supplier banking account').iban))
	].filter(
		(value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
	)
	const referenceEntries = Array.isArray(details.referenceEntries) ? details.referenceEntries : []
	const payments = Array.isArray(details.payments) ? details.payments : []
	const references = [
		invoiceNumber,
		text(details.orderNumber),
		...referenceEntries.map((entry) => text(object(entry, 'invoice reference').value)),
		...payments.map((entry) => text(object(entry, 'invoice payment entry').reference))
	].filter(
		(value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
	)
	const businessIdentity = `${compact(supplierName)}:${compact(invoiceNumber)}`
	if (!compact(supplierName) || !compact(invoiceNumber))
		throw new Error('Invoice supplier and number must contain identifying letters or digits.')

	return {
		businessKey: `invoice:${businessIdentity}`,
		businessKeyBasis: 'supplier-invoice-number',
		documentKind: text(details.documentKind) ?? 'invoice',
		direction: 'unknown',
		supplierName,
		supplierIbans,
		invoiceNumber,
		orderNumber: text(details.orderNumber),
		issueDate: text(details.issueDate),
		dueDate: text(candidate.dueDate),
		currency,
		grossMinor,
		amountDueMinor,
		amountPaidMinor,
		references,
		validationStatus: validationStatus(validation.status),
		summary: String(candidate.summary)
	}
}

export function createOpenItemNormalizerActor(): Actor {
	return new Actor(
		manifest(
			'open-item-normalizer',
			'Invoice open-item normalizer',
			'Normalizes validated invoice extraction into a reconciliation-ready open item.',
			'document_normalize_open_item',
			[
				'ceo.aven.bookkeeping.invoice_candidate(F, I)',
				'ceo.aven.bookkeeping.invoice_details(F, D)',
				'ceo.aven.bookkeeping.invoice_validation(I, V)'
			],
			['ceo.aven.bookkeeping.open_item(I, O)']
		),
		{
			document_normalize_open_item: (payload) => {
				try {
					const openItem = normalizeInvoiceOpenItem(
						object(payload.candidate, 'invoice candidate'),
						object(payload.details, 'invoice details'),
						object(payload.validation, 'invoice validation')
					)
					return success(
						{
							ok: true,
							procedureKey: 'client.normalize-invoice-open-item',
							artifacts: [
								artifact('open-item', 'bookkeeping.open-item', { ...openItem }, 'open-item')
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'open-item',
									outputLocator: wholeArtifact(),
									inputRole: 'candidate',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								},
								{
									ordinal: 1,
									outputLocalKey: 'open-item',
									outputLocator: wholeArtifact(),
									inputRole: 'details',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								},
								{
									ordinal: 2,
									outputLocalKey: 'open-item',
									outputLocator: { kind: 'json-pointer', pointer: '/validationStatus' },
									inputRole: 'validation',
									inputOrdinal: 0,
									inputLocator: { kind: 'json-pointer', pointer: '/status' }
								}
							]
						},
						'Normalized the invoice into an open item.'
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
