import { Actor } from '@avenos/actors'
import type { ClientEvidence, DecodedPage } from '../../shared'
import {
	artifact,
	bytesToBase64,
	failure,
	manifest,
	materializePage,
	success,
	wholeArtifact,
	wholePage
} from '../../shared'

export function createNativeTextExtractorActor(): Actor {
	return new Actor(
		manifest(
			'native-text-extractor',
			'Native text extractor',
			'Extracts embedded page text and a bounded normalized layout map.',
			'document_extract_native_text',
			['ceo.aven.docs.file(F)', 'ceo.aven.docs.page(F, P)'],
			['ceo.aven.docs.extracted_text(F, P, T)', 'ceo.aven.docs.text_layout(F, P, L)']
		),
		{
			document_extract_native_text: (payload) => {
				try {
					const page = payload.page as unknown as DecodedPage
					const extracted = materializePage(page)
					const bytes = new TextEncoder().encode(extracted.text)
					const evidence: ClientEvidence[] = [
						{
							ordinal: 0,
							outputLocalKey: 'layout',
							outputLocator: wholeArtifact(),
							inputRole: 'source',
							inputOrdinal: 0,
							inputLocator: wholePage(page.page)
						}
					]
					if (bytes.length > 0) {
						evidence.push({
							ordinal: 1,
							outputLocalKey: 'text',
							outputLocator: { kind: 'byte-range', start: 0, endExclusive: bytes.length },
							inputRole: 'source',
							inputOrdinal: 0,
							inputLocator: wholePage(page.page)
						})
					}
					return success(
						{
							ok: true,
							procedureKey: 'client.extract-native-text',
							artifacts: [
								artifact(
									'text',
									'docs.extracted-text',
									{
										method: 'native',
										language: 'und',
										pageCount: 1,
										characterCount: [...extracted.text].length,
										complete: extracted.complete
									},
									'text',
									0,
									{ mediaType: 'text/plain; charset=utf-8', base64: bytesToBase64(bytes) }
								),
								artifact(
									'layout',
									'docs.text-layout',
									{
										coordinateSpace: 'normalized-millionths',
										spans: extracted.spans,
										complete: extracted.complete
									},
									'layout'
								)
							],
							evidence
						},
						`Extracted ${extracted.text.length} character(s) from page ${page.page}.`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
