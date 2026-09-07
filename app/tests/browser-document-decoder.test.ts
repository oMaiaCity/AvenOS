import { describe, expect, test } from 'bun:test'
import { decodePlainText } from '../src/lib/artifacts/plain-text-document'

describe('BrowserDocumentDecoder', () => {
	test('decodes a UTF-8 text document as one exact native-text page', async () => {
		const text = 'Invoice E2E-2026-0001\nTotal: EUR 42.00\n'
		const decoded = decodePlainText(
			{
				artifactId: '00000000-0000-4000-8000-000000000001',
				originalName: 'invoice.txt',
				declaredMediaType: 'application/octet-stream',
				base64: Buffer.from(text).toString('base64')
			},
			Buffer.from(text)
		)

		expect(decoded).toMatchObject({
			outcome: 'ok',
			detectedMediaType: 'text/plain',
			encrypted: false
		})
		expect(decoded.pages).toHaveLength(1)
		expect(decoded.pages[0]?.runs).toEqual([
			{ text, x: 0, y: 0, width: 1_000_000, height: 1_000_000 }
		])
	})

	test('rejects malformed UTF-8 even when the filename is text-like', async () => {
		const decoded = decodePlainText(
			{
				artifactId: '00000000-0000-4000-8000-000000000002',
				originalName: 'broken.txt',
				declaredMediaType: 'text/plain',
				base64: Buffer.from([0xc3, 0x28]).toString('base64')
			},
			Buffer.from([0xc3, 0x28])
		)

		expect(decoded?.outcome).toBe('malformed')
		expect(decoded?.pages).toEqual([])
	})
})
