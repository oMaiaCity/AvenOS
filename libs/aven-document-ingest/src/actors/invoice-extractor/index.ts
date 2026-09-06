import { Actor } from '@avenos/actors'
import { type DocumentModelGateway, modelRequest } from '../../model'
import type { DecodedDocument, ExtractedPage } from '../../shared'
import {
	artifact,
	extractionEvidence,
	failure,
	joinedText,
	manifest,
	object,
	pageImage,
	stringValue,
	success,
	textGroundedExtractionEvidence
} from '../../shared'

export function createInvoiceExtractorActor(model: DocumentModelGateway): Actor {
	return new Actor(
		manifest(
			'invoice-extractor',
			'Invoice extractor',
			'Extracts a grounded compact invoice candidate and complete finance details.',
			'document_extract_invoice',
			['ceo.aven.docs.file(F)', 'ceo.aven.docs.document_classification(F, C)'],
			['ceo.aven.bookkeeping.invoice_candidate(F, I)', 'ceo.aven.bookkeeping.invoice_details(F, D)']
		),
		{
			document_extract_invoice: async (payload) => {
				try {
					const document = payload.document as unknown as DecodedDocument
					const pages = payload.pages as unknown as ExtractedPage[]
					const expectedKind = stringValue(payload.expectedKind, 'expected invoice kind')
					const documentText = joinedText(pages)
					const completed = await model.complete(
						modelRequest(
							'extract-invoice',
							document.pages.map(pageImage),
							documentText,
							expectedKind
						)
					)
					const candidate = object(completed.structured.candidate, 'invoice candidate')
					const details = object(completed.structured.details, 'invoice details')
					normalizeInvoiceDates(details, documentText)
					if (details.documentKind !== expectedKind) {
						throw new Error(
							`invoice extraction kind ${String(details.documentKind)} conflicts with ${expectedKind}`
						)
					}
					const supplier =
						details.supplier === null ? null : object(details.supplier, 'invoice supplier').name
					if (typeof supplier === 'string' && supplier.trim()) candidate.supplier = supplier
					const evidenceTargets = {
						candidate: { outputLocalKey: 'invoice', value: candidate },
						details: { outputLocalKey: 'details', value: details }
					}
					const modelEvidence = extractionEvidence(completed.structured, evidenceTargets)
					return success(
						{
							ok: true,
							procedureKey: 'client.extract-invoice-model',
							artifacts: [
								artifact('invoice', 'bookkeeping.invoice-candidate', candidate, 'candidate'),
								artifact('details', 'bookkeeping.invoice-details', details, 'details')
							],
							evidence: textGroundedExtractionEvidence(pages, evidenceTargets, modelEvidence),
							modelReceipt: completed.receipt
						},
						'Extracted the invoice candidate and details.'
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}

/**
 * Resolve a narrow class of model drift without inventing a date. The source
 * must contain the exact ambiguous slash date, the model's ISO value must be
 * one of its two valid interpretations, and strong Mexican markers must make
 * DD/MM/YYYY authoritative. Otherwise the model value is left untouched.
 */
export function normalizeInvoiceDates(
	details: Record<string, unknown>,
	documentText: string
): void {
	const issueDate = details.issueDate
	if (typeof issueDate !== 'string') return
	if (!/(?:\bMX\$|\bMXN\b|\bRFC\b|\bCDMX\b)/i.test(documentText)) return
	for (const match of documentText.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
		const day = Number(match[1])
		const month = Number(match[2])
		const year = Number(match[3])
		if (!validDate(year, month, day) || !validDate(year, day, month) || day === month) continue
		const dayFirst = isoDate(year, month, day)
		const monthFirst = isoDate(year, day, month)
		if (issueDate === monthFirst) details.issueDate = dayFirst
		if (issueDate === dayFirst || issueDate === monthFirst) return
	}
}

function validDate(year: number, month: number, day: number): boolean {
	if (month < 1 || month > 12 || day < 1 || day > 31) return false
	const date = new Date(Date.UTC(year, month - 1, day))
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	)
}

function isoDate(year: number, month: number, day: number): string {
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
