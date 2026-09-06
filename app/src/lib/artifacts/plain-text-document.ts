import type { DecodedDocument, DocumentSource } from '@avenos/document-ingest/actors'
import { decodeCsvText, isCsvSource } from '@avenos/document-ingest/csv'

export function decodePlainText(source: DocumentSource, bytes: Uint8Array): DecodedDocument | null {
	const textLike =
		source.declaredMediaType.toLowerCase().split(';', 1)[0]?.startsWith('text/') ||
		/\.(?:txt|md|csv)$/i.test(source.originalName)
	if (!textLike && !isCsvSource(source)) return null
	let text: string
	try {
		text = isCsvSource(source)
			? decodeCsvText(bytes)
			: new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	} catch {
		return {
			outcome: 'malformed',
			detectedMediaType: 'text/plain',
			encrypted: false,
			pages: []
		}
	}
	if (text.includes('\0')) {
		return {
			outcome: 'malformed',
			detectedMediaType: 'text/plain',
			encrypted: false,
			pages: []
		}
	}
	return {
		outcome: 'ok',
		detectedMediaType: 'text/plain',
		encrypted: false,
		pages: [
			{
				page: 1,
				rotation: 0,
				width: 1,
				height: 1,
				runs: [{ text, x: 0, y: 0, width: 1_000_000, height: 1_000_000 }]
			}
		]
	}
}
