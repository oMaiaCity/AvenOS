import { Actor } from '@avenos/actors'
import { type DocumentModelGateway, modelRequest } from '../../model'
import type { DecodedPage, ExtractedPage } from '../../shared'
import {
	artifact,
	booleanValue,
	bytesToBase64,
	failure,
	integer,
	MAX_LAYOUT_SPANS,
	manifest,
	object,
	pageImage,
	stringArray,
	stringValue,
	success,
	utf8Length,
	wholeArtifact,
	wholePage
} from '../../shared'

export function createVisualPageAnalyzerActor(model: DocumentModelGateway): Actor {
	return new Actor(
		manifest(
			'visual-page-analyzer',
			'Visual page analyzer',
			'Transcribes, describes, and classifies one rendered page with the configured vision model.',
			'document_analyze_page',
			[
				'ceo.aven.docs.file(F)',
				'ceo.aven.docs.page(F, P)',
				'ceo.aven.docs.extracted_text(F, P, T)'
			],
			[
				'ceo.aven.docs.extracted_text(F, P, T)',
				'ceo.aven.docs.text_layout(F, P, L)',
				'ceo.aven.docs.content_classification(P, C)',
				'ceo.aven.docs.content_description(P, D)'
			]
		),
		{
			document_analyze_page: async (payload) => {
				try {
					const page = payload.page as unknown as DecodedPage
					const native = payload.extracted as unknown as ExtractedPage
					const completed = await model.complete(
						modelRequest('analyze-page', [pageImage(page)], native.text)
					)
					const structured = completed.structured
					const suppliedText = stringValue(structured.text, 'OCR text')
					if (utf8Length(suppliedText) > 200_000) throw new Error('OCR text is too large')
					if (!Array.isArray(structured.blocks)) throw new Error('OCR blocks are absent')
					const blocks = structured.blocks.slice(0, MAX_LAYOUT_SPANS).map((raw) => {
						const block = object(raw, 'OCR block')
						return {
							text: stringValue(block.text, 'OCR block text'),
							x: integer(block.x, 'OCR block x', 0, 1_000_000),
							y: integer(block.y, 'OCR block y', 0, 1_000_000),
							width: integer(block.width, 'OCR block width', 0, 1_000_000),
							height: integer(block.height, 'OCR block height', 0, 1_000_000)
						}
					})
					let text = suppliedText
					let searchFrom = 0
					let ordered = true
					let spans: ExtractedPage['spans'] = []
					for (const block of blocks) {
						const relative = text.slice(searchFrom).indexOf(block.text)
						if (relative < 0) {
							ordered = false
							break
						}
						const characterStart = searchFrom + relative
						const characterEnd = characterStart + block.text.length
						spans.push({
							start: utf8Length(text.slice(0, characterStart)),
							endExclusive: utf8Length(text.slice(0, characterEnd)),
							page: page.page,
							x: block.x,
							y: block.y,
							width: block.width,
							height: block.height
						})
						searchFrom = characterEnd
					}
					if (!ordered) {
						text = blocks.map((block) => block.text).join('\n')
						spans = []
						let offset = 0
						for (const block of blocks) {
							const length = utf8Length(block.text)
							spans.push({
								start: offset,
								endExclusive: offset + length,
								page: page.page,
								x: block.x,
								y: block.y,
								width: block.width,
								height: block.height
							})
							offset += length + 1
						}
					}
					const complete = booleanValue(structured.complete, 'page completeness') && ordered
					const bytes = new TextEncoder().encode(text)
					const artifacts = [
						artifact(
							'text',
							'docs.extracted-text',
							{
								method: 'ocr',
								language: stringValue(structured.language, 'OCR language'),
								pageCount: 1,
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
						),
						artifact(
							'classification',
							'core.content-classification',
							{
								subjectLevel: 'page',
								primaryKind: stringValue(structured.primaryKind, 'page kind'),
								facets: stringArray(structured.facets, 'page facets'),
								confidenceBps: integer(structured.confidenceBps, 'page confidence', 0, 10_000),
								reason: stringValue(structured.reason, 'page reason'),
								resolutionMode: 'model',
								complete: booleanValue(structured.complete, 'page completeness')
							},
							'classification'
						),
						artifact(
							'description',
							'core.content-description',
							{
								summary: stringValue(structured.summary, 'page summary'),
								topics: stringArray(structured.topics, 'page topics')
							},
							'description'
						)
					]
					return success(
						{
							ok: true,
							procedureKey: 'client.analyze-page-model',
							artifacts,
							evidence: artifacts.map((output, ordinal) => ({
								ordinal,
								outputLocalKey: output.localKey,
								outputLocator: wholeArtifact(),
								inputRole: 'source',
								inputOrdinal: 0,
								inputLocator: wholePage(page.page)
							})),
							modelReceipt: completed.receipt
						},
						`Visually analyzed page ${page.page}.`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
