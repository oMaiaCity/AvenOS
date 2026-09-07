import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { ServerDocumentDecoder } from '../src/server'

const decoder = new ServerDocumentDecoder()
const jpeg = new Uint8Array(
	await readFile(
		new URL('../../../fixtures/artifacts/0001_DE_agri_coop_de-2025-00001-k.jpg', import.meta.url)
	)
)
const pdf = new Uint8Array(
	await readFile(
		new URL(
			'../../../fixtures/artifacts/0009_MX_community_garden_mx-2026-00009-z.pdf',
			import.meta.url
		)
	)
)

describe('server document decoder', () => {
	test('admits bounded JPEG vision input and removes trailing bytes', async () => {
		const withTrailingData = new Uint8Array([...jpeg, 1, 2, 3])
		const decoded = await decoder.decode(source('invoice.jpg', 'image/jpeg', withTrailingData), {
			modelPageLimit: 1
		})
		expect(decoded).toMatchObject({
			outcome: 'ok',
			detectedMediaType: 'image/jpeg',
			pages: [{ page: 1, runs: [], image: { mediaType: 'image/jpeg' } }]
		})
		expect(Buffer.from(decoded.pages[0]?.image?.base64 ?? '', 'base64').length).toBe(jpeg.length)
	})

	test('does not materialize image bytes without an available model', async () => {
		const decoded = await decoder.decode(source('invoice.jpg', 'image/jpeg', jpeg), {
			modelPageLimit: 0
		})
		expect(decoded.outcome).toBe('ok')
		expect(decoded.pages[0]?.image).toBeUndefined()
	})

	test('renders native PDF pages for the model only inside the page limit', async () => {
		const withoutVision = await decoder.decode(source('invoice.pdf', 'application/pdf', pdf), {
			modelPageLimit: 0
		})
		const withVision = await decoder.decode(source('invoice.pdf', 'application/pdf', pdf), {
			modelPageLimit: 15
		})
		expect(withoutVision.outcome).toBe('ok')
		expect(withoutVision.pages.every((page) => !page.image)).toBe(true)
		expect(withVision.pages.length).toBeGreaterThan(0)
		expect(withVision.pages.every((page) => page.image?.mediaType === 'image/png')).toBe(true)
	})

	test('rejects malformed and oversized image declarations safely', async () => {
		const malformedJpeg = jpeg.slice(0, 80)
		expect((await decoder.decode(source('bad.jpg', 'image/jpeg', malformedJpeg))).outcome).toBe(
			'unsupported'
		)

		const oversizedPng = new Uint8Array(24)
		oversizedPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		const view = new DataView(oversizedPng.buffer)
		view.setUint32(16, 50_000)
		view.setUint32(20, 50_000)
		expect((await decoder.decode(source('huge.png', 'image/png', oversizedPng))).outcome).toBe(
			'unsupported'
		)
	})
})

function source(name: string, mediaType: string, bytes: Uint8Array) {
	return {
		artifactId: '11111111-1111-4111-8111-111111111111',
		originalName: name,
		declaredMediaType: mediaType,
		base64: Buffer.from(bytes).toString('base64')
	}
}
