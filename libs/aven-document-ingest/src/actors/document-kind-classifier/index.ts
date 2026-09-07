import { Actor } from '@avenos/actors'
import { type DocumentModelGateway, modelRequest } from '../../model'
import type { DecodedDocument, ExtractedPage } from '../../shared'
import {
	artifact,
	failure,
	integer,
	joinedText,
	manifest,
	pageImage,
	stringValue,
	success,
	wholeArtifact
} from '../../shared'

export function createDocumentKindClassifierActor(model: DocumentModelGateway): Actor {
	return new Actor(
		manifest(
			'document-kind-classifier',
			'Document kind classifier',
			'Classifies the complete rendered document into the supported finance taxonomy.',
			'document_classify_kind',
			['ceo.aven.docs.file(F)', 'ceo.aven.docs.extracted_text(F, T)'],
			['ceo.aven.docs.document_classification(F, C)']
		),
		{
			document_classify_kind: async (payload) => {
				try {
					const document = payload.document as unknown as DecodedDocument
					const pages = payload.pages as unknown as ExtractedPage[]
					const completed = await model.complete(
						modelRequest('classify-document', document.pages.map(pageImage), joinedText(pages))
					)
					const structured = completed.structured
					const confidence = integer(structured.confidenceBps, 'document confidence', 0, 10_000)
					const rawKind = stringValue(
						structured.resolvedKind ?? structured.rawKind,
						'document kind'
					)
					const family = [
						'invoice',
						'credit-note',
						'receipt',
						'self-issued-receipt',
						'mandate',
						'order-confirmation',
						'offer',
						'reminder'
					].includes(rawKind)
						? 'invoice-family'
						: ['bank-statement', 'payment-receipt'].includes(rawKind)
							? 'statement-family'
							: 'unknown'
					const accepted = confidence >= 6500 && family !== 'unknown'
					const reason = stringValue(structured.reason, 'document classification reason')
					const classificationPayload = {
						rawKind,
						resolvedKind: accepted ? rawKind : 'unknown',
						family: accepted ? family : 'unknown',
						confidenceBps: confidence,
						reason: accepted
							? reason
							: `Not accepted as a supported kind at the 6500 basis-point threshold: ${reason}`,
						resolutionMode: 'model',
						alternatives: Array.isArray(structured.alternatives) ? structured.alternatives : []
					}
					return success(
						{
							ok: true,
							procedureKey: 'client.classify-document-model',
							artifacts: [
								artifact(
									'classification',
									'core.document-classification',
									classificationPayload,
									'classification'
								)
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'classification',
									outputLocator: wholeArtifact(),
									inputRole: 'source',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								}
							],
							modelReceipt: completed.receipt
						},
						`Classified the document as ${classificationPayload.resolvedKind}.`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
