import { Actor } from '@avenos/actors'
import type { ExtractedPage } from '../../shared'
import {
	artifact,
	bytesToBase64,
	failure,
	MAX_LAYOUT_SPANS,
	MAX_TEXT_BYTES,
	manifest,
	success,
	utf8Length,
	wholeArtifact
} from '../../shared'

export function createDocumentAssemblerActor(): Actor {
	return new Actor(
		manifest(
			'document-assembler',
			'Document assembler',
			'Assembles page representations into one bounded document representation.',
			'document_assemble',
			['ceo.aven.docs.extracted_text(F, P, T)'],
			['ceo.aven.docs.document_text(F, T)', 'ceo.aven.docs.document_layout(F, L)']
		),
		{
			document_assemble: (payload) => {
				try {
					const pages = payload.pages as unknown as ExtractedPage[]
					const method = pages.some((page) => page.method === 'ocr') ? 'ocr' : 'native'
					let text = ''
					let complete = pages.every((page) => page.complete)
					const spans: ExtractedPage['spans'] = []
					for (const page of pages) {
						const separator = text === '' ? '' : '\n\n'
						const byteOffset = utf8Length(text + separator)
						if (byteOffset + utf8Length(page.text) > MAX_TEXT_BYTES) {
							complete = false
							break
						}
						text += separator + page.text
						for (const span of page.spans) {
							if (spans.length >= MAX_LAYOUT_SPANS) {
								complete = false
								break
							}
							spans.push({
								...span,
								start: byteOffset + span.start,
								endExclusive: byteOffset + span.endExclusive
							})
						}
					}
					const bytes = new TextEncoder().encode(text)
					return success(
						{
							ok: true,
							procedureKey: 'client.assemble-document-representation',
							artifacts: [
								artifact(
									'text',
									'docs.extracted-text',
									{
										method,
										language: 'und',
										pageCount: pages.length,
										characterCount: [...text].length,
										complete
									},
									'text',
									0,
									{ mediaType: 'text/plain; charset=utf-8', base64: bytesToBase64(bytes) }
								),
								artifact(
									'layout',
									'docs.text-layout',
									{ coordinateSpace: 'normalized-millionths', spans, complete },
									'layout'
								)
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'layout',
									outputLocator: wholeArtifact(),
									inputRole: 'source',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								}
							]
						},
						`Assembled ${pages.length} page representation(s).`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
