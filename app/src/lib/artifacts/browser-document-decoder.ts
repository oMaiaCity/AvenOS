import {
	type DecodedDocument,
	type DecodedPage,
	type DecodedTextRun,
	type DocumentDecoder,
	type DocumentSource,
	MAX_DOCUMENT_PAGES,
	pdfDecodeFailureKind
} from '@avenos/document-ingest/actors'
import { readPdfTextContent } from '@avenos/document-ingest/pdf-text'
import { base64ToBytes, loadOwnedPdf } from './pdf'
import { decodePlainText } from './plain-text-document'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_RENDER_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
const MILLION = 1_000_000

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
	return prefix.every((byte, index) => bytes[index] === byte)
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
	}
	return btoa(binary)
}

function pngDimensions(bytes: Uint8Array): [number, number] | null {
	if (!hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || bytes.length < 24) {
		return null
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const width = view.getUint32(16)
	const height = view.getUint32(20)
	return width > 0 && height > 0 ? [width, height] : null
}

/** JPEG marker walk ported from the server adapter, without decoding pixels. */
function jpegDimensions(bytes: Uint8Array): [number, number] | null {
	if (!hasPrefix(bytes, [0xff, 0xd8])) return null
	let offset = 2
	while (offset + 3 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset++
			continue
		}
		while (bytes[offset] === 0xff) offset++
		const marker = bytes[offset++]
		if (marker === undefined || marker === 0xd9 || marker === 0xda) break
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
		if (offset + 1 >= bytes.length) return null
		const length = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0)
		if (length < 2 || offset + length > bytes.length) return null
		const startOfFrame =
			(marker >= 0xc0 && marker <= 0xc3) ||
			(marker >= 0xc5 && marker <= 0xc7) ||
			(marker >= 0xc9 && marker <= 0xcb) ||
			(marker >= 0xcd && marker <= 0xcf)
		if (startOfFrame && length >= 7) {
			const height = (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0)
			const width = (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0)
			return width > 0 && height > 0 ? [width, height] : null
		}
		offset += length
	}
	return null
}

function boundedImage(width: number, height: number): boolean {
	return width * height <= MAX_IMAGE_PIXELS
}

function jpegVisualBytes(bytes: Uint8Array): Uint8Array | null {
	for (let offset = 2; offset < bytes.length; offset++) {
		if (bytes[offset - 1] === 0xff && bytes[offset] === 0xd9) return bytes.slice(0, offset + 1)
	}
	return null
}

function boundedBase64(base64: string): string {
	const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
	const length = Math.floor((base64.length * 3) / 4) - padding
	if (length > MAX_RENDER_BYTES) throw new Error('rendered model page exceeds 12 MiB')
	return base64
}

function normalized(value: number, extent: number): number {
	if (!Number.isFinite(value) || !Number.isFinite(extent) || extent <= 0) return 0
	return Math.max(0, Math.min(MILLION, Math.round((value / extent) * MILLION)))
}

function normalizedRun(
	item: { str?: unknown; transform?: unknown; width?: unknown; height?: unknown },
	pageWidth: number,
	pageHeight: number
): DecodedTextRun | null {
	if (typeof item.str !== 'string' || !Array.isArray(item.transform)) return null
	const x = Number(item.transform[4] ?? 0)
	const baseline = Number(item.transform[5] ?? 0)
	const width = Number(item.width ?? 0)
	const height = Math.abs(Number(item.height ?? item.transform[3] ?? 0))
	return {
		text: item.str,
		x: normalized(x, pageWidth),
		y: normalized(Math.max(0, pageHeight - baseline - height), pageHeight),
		width: normalized(Math.max(0, width), pageWidth),
		height: normalized(Math.max(0, height), pageHeight)
	}
}

function rotation(value: number): DecodedPage['rotation'] {
	const normalized = ((Math.round(value) % 360) + 360) % 360
	return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0
}

async function decodePdfOnce(bytes: Uint8Array, modelPageLimit: number): Promise<DecodedDocument> {
	const owned = await loadOwnedPdf(bytes)
	const pdf = owned.document
	try {
		// Enforce the bound before getPage/getTextContent allocate work for every
		// page. The actor repeats this check for non-browser decoder implementations.
		if (pdf.numPages > MAX_DOCUMENT_PAGES) {
			return {
				outcome: 'unsupported',
				detectedMediaType: 'application/pdf',
				encrypted: false,
				pages: []
			}
		}
		const pages: DecodedPage[] = []
		const renderForModel = modelPageLimit > 0 && pdf.numPages <= modelPageLimit
		for (let number = 1; number <= pdf.numPages; number++) {
			const page = await pdf.getPage(number)
			const viewport = page.getViewport({ scale: 1 })
			const content = await readPdfTextContent(page)
			const runs = content.items.flatMap((item) => {
				const run = normalizedRun(
					item as Parameters<typeof normalizedRun>[0],
					viewport.width,
					viewport.height
				)
				return run ? [run] : []
			})
			let image: DecodedPage['image']
			if (renderForModel) {
				const renderViewport = page.getViewport({ scale: 2 })
				if (!boundedImage(Math.ceil(renderViewport.width), Math.ceil(renderViewport.height))) {
					throw new Error('rendered model page exceeds 40 million pixels')
				}
				const canvas = document.createElement('canvas')
				canvas.width = Math.ceil(renderViewport.width)
				canvas.height = Math.ceil(renderViewport.height)
				const context = canvas.getContext('2d', { alpha: false })
				if (!context) throw new Error('could not create the PDF page render context')
				await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise
				const rendered = canvas.toDataURL('image/png')
				canvas.width = 0
				canvas.height = 0
				image = {
					mediaType: 'image/png',
					base64: boundedBase64(rendered.slice(rendered.indexOf(',') + 1))
				}
			}
			pages.push({
				page: number,
				rotation: rotation(page.rotate),
				width: viewport.width,
				height: viewport.height,
				runs,
				...(image && { image })
			})
		}
		return {
			outcome: pages.length > 0 ? 'ok' : 'malformed',
			detectedMediaType: 'application/pdf',
			encrypted: false,
			pages
		}
	} finally {
		// pdf.js owns a worker and retained page resources. A long-lived actor must
		// release both after it has materialized the bounded representation.
		await owned.destroy().catch(() => undefined)
	}
}

async function decodePdf(bytes: Uint8Array, modelPageLimit: number): Promise<DecodedDocument> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			return await decodePdfOnce(bytes, modelPageLimit)
		} catch (error) {
			const kind = pdfDecodeFailureKind(error)
			if (kind === 'encrypted') {
				return {
					outcome: 'encrypted',
					detectedMediaType: 'application/pdf',
					encrypted: true,
					pages: []
				}
			}
			if (kind === 'malformed') {
				return {
					outcome: 'malformed',
					detectedMediaType: 'application/pdf',
					encrypted: false,
					pages: []
				}
			}
			// A webview refresh can terminate a pdf.js worker between loading and
			// getTextContent. One fresh, bounded task is safe and fixes that race.
			if (kind === 'worker-lifecycle' && attempt === 0) continue
			console.warn(`PDF decoding failed because of a ${kind} decoder failure.`, error)
			throw new Error('PDF processing failed before its content could be inspected.', {
				cause: error
			})
		}
	}
	throw new Error('PDF processing exhausted its worker retry.')
}

/** Browser/webview implementation; all semantic processing stays client-side. */
export class BrowserDocumentDecoder implements DocumentDecoder {
	async decode(
		source: DocumentSource,
		options: { modelPageLimit: number } = { modelPageLimit: 0 }
	): Promise<DecodedDocument> {
		const bytes = base64ToBytes(source.base64)
		if (bytes.length > MAX_FILE_BYTES) throw new Error('file exceeds the 25 MiB processing limit')
		const plainText = decodePlainText(source, bytes)
		if (plainText) return plainText
		if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
			return decodePdf(bytes, options.modelPageLimit)
		}

		const png = pngDimensions(bytes)
		if (png && boundedImage(...png)) {
			return {
				outcome: 'ok',
				detectedMediaType: 'image/png',
				encrypted: false,
				pages: [
					{
						page: 1,
						rotation: 0,
						width: png[0],
						height: png[1],
						runs: [],
						...(options.modelPageLimit > 0 && {
							image: { mediaType: 'image/png' as const, base64: boundedBase64(source.base64) }
						})
					}
				]
			}
		}
		const jpeg = jpegDimensions(bytes)
		const jpegVisual = jpeg ? jpegVisualBytes(bytes) : null
		if (jpeg && jpegVisual && boundedImage(...jpeg)) {
			return {
				outcome: 'ok',
				detectedMediaType: 'image/jpeg',
				encrypted: false,
				pages: [
					{
						page: 1,
						rotation: 0,
						width: jpeg[0],
						height: jpeg[1],
						runs: [],
						...(options.modelPageLimit > 0 && {
							image: {
								mediaType: 'image/jpeg' as const,
								base64: boundedBase64(bytesToBase64(jpegVisual))
							}
						})
					}
				]
			}
		}
		return {
			outcome: 'unsupported',
			detectedMediaType: 'application/octet-stream',
			encrypted: false,
			pages: []
		}
	}
}
