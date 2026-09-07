import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import manifest from '../../../fixtures/golden/document-pdf/manifest.json'

let outputDirectory = ''
let executable = ''
const execute = promisify(execFile)

describe('production-bundled PDF decoder', () => {
	beforeAll(async () => {
		outputDirectory = await mkdtemp(join(tmpdir(), 'avenos-pdf-bundle-'))
		const entry = new URL('./support/bundled-server-decoder-entry.ts', import.meta.url).pathname
		await execute('bun', ['build', entry, '--target=bun', `--outdir=${outputDirectory}`])
		executable = join(outputDirectory, 'bundled-server-decoder-entry.js')
		expect(await readFile(executable)).not.toHaveLength(0)
	})

	afterAll(async () => {
		if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true })
	})

	for (const file of [
		'syn_0006_JP_retail_pos_gift_receipt.pdf',
		'syn_0015_MX_transport_mobility_toll_receipt.pdf',
		'syn_0066_SA_digital_messaging_qr_only_receipt.pdf'
	]) {
		test(`embeds the worker and coherent canvas runtime for ${file}`, async () => {
			const path = new URL(`../../../fixtures/golden/document-pdf/${file}`, import.meta.url)
				.pathname
			const { stdout, stderr } = await execute('bun', [executable, path])
			// PDF.js probes an optional unbundled canvas package even though the
			// service has already installed the bundled instance's DOM primitives.
			// Permit only that probe warning; missing primitives or render failures
			// remain failures, as do the decoded text/image assertions below.
			expect(
				stderr.replace(
					/^Warning: Cannot load "@napi-rs\/canvas" package: "ResolveMessage: Cannot find module '@napi-rs\/canvas' from '[^'\n]+'"\.\n/gm,
					''
				)
			).toBe('')
			const decoded = JSON.parse(stdout) as {
				outcome: string
				pages: number
				runs: number
				images: number[]
			}
			const sample = manifest.samples.find((candidate) => candidate.file === file)
			expect(decoded).toMatchObject({ outcome: 'ok', pages: 1 })
			expect(decoded.runs).toBeGreaterThanOrEqual(sample?.minimumRuns ?? 1)
			expect(decoded.images.every((length) => length > 1_000)).toBe(true)
		})
	}

	test('the production artifact contains the pdf.js worker implementation', async () => {
		const bytes = await readFile(executable)
		expect(bytes.includes(Buffer.from('WorkerMessageHandler'))).toBe(true)
	})
})
