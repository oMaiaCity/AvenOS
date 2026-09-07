import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const files = process.argv.slice(2)
if (files.length === 0) throw new Error('at least one PDF path is required')
const origin = process.env.PDF_BROWSER_PROOF_ORIGIN ?? 'http://127.0.0.1:1420'
const browser = await chromium.launch({ headless: true })
try {
	const page = await browser.newPage()
	await page.goto(origin, { waitUntil: 'domcontentloaded' })
	for (const path of files) {
		const encoded = Buffer.from(await readFile(path)).toString('base64')
		const result = await page.evaluate(
			async ({ encoded, name }) => {
				const { BrowserDocumentDecoder } = await import(
					'/src/lib/artifacts/browser-document-decoder.ts'
				)
				const source = {
					artifactId: '11111111-1111-4111-8111-111111111111',
					originalName: name,
					declaredMediaType: 'application/pdf',
					base64: encoded
				}
				const native = await new BrowserDocumentDecoder().decode(source, { modelPageLimit: 0 })
				const rendered = await new BrowserDocumentDecoder().decode(source, { modelPageLimit: 15 })
				return {
					name,
					nativeOutcome: native.outcome,
					renderedOutcome: rendered.outcome,
					pages: native.pages.length,
					runs: native.pages.reduce((sum, item) => sum + item.runs.length, 0),
					imageBytes: rendered.pages.map((item) =>
						Math.floor(((item.image?.base64.length ?? 0) * 3) / 4)
					)
				}
			},
			{ encoded, name: path.split('/').at(-1) }
		)
		if (
			result.nativeOutcome !== 'ok' ||
			result.renderedOutcome !== 'ok' ||
			result.pages < 1 ||
			result.imageBytes.some((length) => length < 1_000)
		) {
			throw new Error(`browser PDF proof failed: ${JSON.stringify(result)}`)
		}
		console.log(JSON.stringify(result))
	}
} finally {
	await browser.close()
}
