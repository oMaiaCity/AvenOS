import { Actor } from '@avenos/actors'
import type { DecodedPage, ExtractedPage } from '../../shared'
import { artifact, failure, manifest, success, wholeArtifact, wholePage } from '../../shared'

export function createPageSignalClassifierActor(): Actor {
	return new Actor(
		manifest(
			'page-signal-classifier',
			'Page signal classifier',
			'Classifies a page from deterministic media and native-text signals.',
			'document_classify_page',
			[
				'ceo.aven.docs.file(F)',
				'ceo.aven.docs.page(F, P)',
				'ceo.aven.docs.extracted_text(F, P, T)'
			],
			['ceo.aven.docs.content_classification(P, C)']
		),
		{
			document_classify_page: (payload) => {
				try {
					const page = payload.page as unknown as DecodedPage
					const extracted = payload.extracted as unknown as ExtractedPage
					const mediaType = String(payload.mediaType ?? 'application/octet-stream')
					const hasText = /\S/u.test(extracted.text)
					const image = mediaType === 'image/png' || mediaType === 'image/jpeg'
					const primaryKind = hasText ? 'document' : image ? 'image' : 'unknown'
					const facets = hasText ? ['native-text'] : []
					// Recognizing the container as an image is not semantic understanding of
					// its pixels. Without native text or vision, enrichment remains partial.
					const complete = hasText
					return success(
						{
							ok: true,
							procedureKey: 'client.classify-page-signals',
							artifacts: [
								artifact(
									'classification',
									'core.content-classification',
									{
										subjectLevel: 'page',
										primaryKind,
										facets,
										confidenceBps: complete ? 10_000 : 0,
										reason: hasText
											? 'The client native-text actor returned non-whitespace text.'
											: image
												? 'The source is a supported image; no semantic visual claim was made.'
												: 'No trustworthy native text was present; OCR is required.',
										resolutionMode: 'rule',
										complete
									},
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
									inputLocator: wholePage(page.page)
								}
							]
						},
						`Classified page ${page.page} as ${primaryKind}.`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
