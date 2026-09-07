import { Actor } from '@avenos/actors'
import type { DocumentDecoder, DocumentSource } from '../../shared'
import {
	artifact,
	bytesToBase64,
	failure,
	MAX_DOCUMENT_PAGES,
	manifest,
	success,
	wholeArtifact
} from '../../shared'

export function createDocumentInspectorActor(decoder: DocumentDecoder): Actor {
	return new Actor(
		manifest(
			'document-inspector',
			'Document inspector',
			'Inspects exact file bytes and identifies a readable paged document.',
			'document_inspect',
			['ceo.aven.docs.file(F)'],
			['ceo.aven.docs.file_inspection(F, I)']
		),
		{
			document_inspect: async (payload) => {
				try {
					const source = payload.source as unknown as DocumentSource
					const modelPageLimit = Number(payload.modelPageLimit ?? 0)
					const document = await decoder.decode(source, {
						modelPageLimit:
							Number.isInteger(modelPageLimit) && modelPageLimit >= 0
								? Math.min(modelPageLimit, MAX_DOCUMENT_PAGES)
								: 0
					})
					if (document.pages.length > MAX_DOCUMENT_PAGES) {
						throw new Error(
							`document has ${document.pages.length} pages; maximum is ${MAX_DOCUMENT_PAGES}`
						)
					}
					return success(
						{
							ok: true,
							procedureKey: 'client.inspect-file',
							document,
							artifacts: [
								artifact(
									'inspection',
									'core.file-inspection',
									{
										outcome: document.outcome,
										detectedMediaType: document.detectedMediaType,
										readable: document.outcome === 'ok',
										pageCount: document.pages.length,
										encrypted: document.encrypted
									},
									'inspection',
									0,
									{
										mediaType: 'application/json',
										base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(document)))
									}
								)
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'inspection',
									outputLocator: wholeArtifact(),
									inputRole: 'source',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								}
							]
						},
						`Inspected ${document.pages.length} page(s).`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
