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

export function createStatementExtractorActor(model: DocumentModelGateway): Actor {
	return new Actor(
		manifest(
			'statement-extractor',
			'Statement extractor',
			'Extracts a grounded account statement or payment receipt candidate.',
			'document_extract_statement',
			['ceo.aven.docs.file(F)', 'ceo.aven.docs.document_classification(F, C)'],
			['ceo.aven.bookkeeping.statement_candidate(F, S)']
		),
		{
			document_extract_statement: async (payload) => {
				try {
					const document = payload.document as unknown as DecodedDocument
					const pages = payload.pages as unknown as ExtractedPage[]
					const expectedKind = stringValue(payload.expectedKind, 'expected statement kind')
					const completed = await model.complete(
						modelRequest(
							'extract-statement',
							document.pages.map(pageImage),
							joinedText(pages),
							expectedKind
						)
					)
					const candidate = object(completed.structured.candidate, 'statement candidate')
					const extractedKind = String(candidate.statementKind)
					if (
						(expectedKind === 'payment-receipt' && extractedKind !== 'payment-receipt') ||
						(expectedKind === 'bank-statement' && extractedKind === 'payment-receipt')
					) {
						throw new Error(
							`statement extraction kind ${extractedKind} conflicts with ${expectedKind}`
						)
					}
					const evidenceTargets = {
						candidate: { outputLocalKey: 'statement', value: candidate }
					}
					return success(
						{
							ok: true,
							procedureKey: 'client.extract-statement-model',
							artifacts: [
								artifact('statement', 'banking.account-statement-candidate', candidate, 'candidate')
							],
							evidence: textGroundedExtractionEvidence(
								pages,
								evidenceTargets,
								extractionEvidence(completed.structured, evidenceTargets)
							),
							modelReceipt: completed.receipt
						},
						'Extracted the statement candidate.'
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
