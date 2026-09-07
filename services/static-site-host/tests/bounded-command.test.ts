import { describe, expect, test } from 'bun:test'
import { boundedCommand, validateArtifactTree } from '../src/bounded-command.js'

const row = (size: number, path = 'dist/index.html', mode = '100644') =>
	`${mode} blob ${'a'.repeat(40)} ${size}\t${path}\0`

describe('repository resource budgets', () => {
	test('accepts the exact file and byte limit before checkout', () => {
		expect(() => validateArtifactTree(row(12), 1, 12)).not.toThrow()
		expect(() => validateArtifactTree(row(13), 1, 12)).toThrow(/limit/)
		expect(() => validateArtifactTree(row(1) + row(1, 'dist/other'), 1, 12)).toThrow(/limit/)
	})
	test('rejects links, submodules and excessive path depth', () => {
		expect(() => validateArtifactTree(row(1, 'dist/link', '120000'), 1, 12)).toThrow(/regular/)
		expect(() => validateArtifactTree(row(1, 'dist/submodule', '160000'), 1, 12)).toThrow(/regular/)
		expect(() => validateArtifactTree(row(1, 'dist/' + 'a/'.repeat(21) + 'file'), 1, 12)).toThrow(/path/)
	})
	test('terminates a stalled child on its deadline', async () => {
		const start = Date.now()
		await expect(boundedCommand([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 }))
			.rejects.toThrow(/timed out/)
		expect(Date.now() - start).toBeLessThan(2000)
	})
	test('bounds captured output without reporting it as an error', async () => {
		await expect(boundedCommand([process.execPath, '-e', "process.stdout.write('fixture'.repeat(1000))"],
			{ maxOutputBytes: 100 })).rejects.toThrow(/output budget/)
	})
})
