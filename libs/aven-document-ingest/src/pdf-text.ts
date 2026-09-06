import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * PDF.js 6 uses ReadableStream async iteration in getTextContent. Some supported
 * webviews have readers but no stream iterator, even with PDF.js's legacy bundle.
 * Use the stable reader API on both hosts without modifying global prototypes.
 */
export async function readPdfTextContent(
	page: Pick<PDFPageProxy, 'isPureXfa' | 'getTextContent' | 'streamTextContent'>
): ReturnType<PDFPageProxy['getTextContent']> {
	if (page.isPureXfa) return page.getTextContent()
	const reader = page.streamTextContent().getReader()
	const content: Awaited<ReturnType<PDFPageProxy['getTextContent']>> = {
		items: [],
		styles: Object.create(null),
		lang: null
	}
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) return content
			content.lang ??= value.lang
			Object.assign(content.styles, value.styles)
			content.items.push(...value.items)
		}
	} finally {
		reader.releaseLock()
	}
}
