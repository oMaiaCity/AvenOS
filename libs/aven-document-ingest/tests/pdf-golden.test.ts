import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import manifest from '../../../fixtures/golden/document-pdf/manifest.json'
import { ServerDocumentDecoder } from '../src/server'
import { pdfDecodeFailureKind } from '../src/shared'

const decoder = new ServerDocumentDecoder()
const goldenRoot = new URL('../../../fixtures/golden/document-pdf/', import.meta.url)

describe('PDF golden corpus', () => {
	for (const sample of manifest.samples) {
		test(`extracts and renders ${sample.file}`, async () => {
			const bytes = new Uint8Array(await readFile(new URL(sample.file, goldenRoot)))
			expect(bytes).toHaveLength(sample.bytes)
			expect(createHash('sha256').update(bytes).digest('hex')).toBe(sample.sha256)

			const native = await decoder.decode(source(sample.file, bytes), { modelPageLimit: 0 })
			const rendered = await decoder.decode(source(sample.file, bytes), { modelPageLimit: 15 })
			expect(native.outcome).toBe('ok')
			expect(rendered.outcome).toBe('ok')
			expect(native.pages).toHaveLength(sample.pages)
			expect(rendered.pages).toHaveLength(sample.pages)
			expect(native.pages.map(({ image: _image, ...page }) => page)).toEqual(
				rendered.pages.map(({ image: _image, ...page }) => page)
			)

			const runs = native.pages.flatMap((page) => page.runs)
			const text = runs.map((run) => run.text).join(' ')
			expect(runs.length).toBeGreaterThanOrEqual(sample.minimumRuns)
			for (const fragment of sample.textIncludes) expect(text).toContain(fragment)
			for (const run of runs) {
				for (const coordinate of [run.x, run.y, run.width, run.height]) {
					expect(coordinate).toBeGreaterThanOrEqual(0)
					expect(coordinate).toBeLessThanOrEqual(1_000_000)
				}
			}
			for (const page of rendered.pages) {
				expect(page.width).toBeGreaterThan(0)
				expect(page.height).toBeGreaterThan(0)
				expect(page.image?.mediaType).toBe('image/png')
				const png = Buffer.from(page.image?.base64 ?? '', 'base64')
				expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
				expect(png.length).toBeGreaterThan(1_000)
			}
		})
	}

	test('classifies input defects without confusing them with runtime defects', async () => {
		const malformed = new TextEncoder().encode('%PDF-1.7\nthis is not a PDF')
		expect((await decoder.decode(source('malformed.pdf', malformed))).outcome).toBe('malformed')
		expect(
			pdfDecodeFailureKind(Object.assign(new Error('bad xref'), { name: 'FormatError' }))
		).toBe('malformed')
		expect(
			pdfDecodeFailureKind(
				Object.assign(new Error('password required'), { name: 'PasswordException' })
			)
		).toBe('encrypted')
		expect(pdfDecodeFailureKind(new Error('Worker task was terminated'))).toBe('worker-lifecycle')
		expect(pdfDecodeFailureKind(new Error("Cannot find module './pdf.worker.mjs'"))).toBe('runtime')
	})
})

function source(name: string, bytes: Uint8Array) {
	return {
		artifactId: '11111111-1111-4111-8111-111111111111',
		originalName: name,
		declaredMediaType: 'application/pdf',
		base64: Buffer.from(bytes).toString('base64')
	}
}
