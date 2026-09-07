import { expect, test } from 'bun:test'
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('registry authentication is owner-only during install and restored on success, failure and termination', async () => {
	const action = Bun.YAML.parse(
		await Bun.file(new URL('../../.github/actions/bun-install/action.yml', import.meta.url)).text()
	)
	const script = action.runs.steps.find((step: { name?: string }) =>
		step.name?.startsWith('Install with temporary')
	).run
	for (const result of [0, 23, 143]) {
		const directory = await mkdtemp(join(tmpdir(), 'aven-registry-test-'))
		try {
			const original = '@myavenceo:registry=https://npm.pkg.github.com\n'
			await writeFile(join(directory, '.npmrc'), original)
			await chmod(join(directory, '.npmrc'), 0o644)
			await writeFile(
				join(directory, 'bun'),
				`#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == 'install --frozen-lockfile' ]]
[[ "$(stat -c '%a' .npmrc)" == 600 ]]
grep -Fq "$PACKAGE_READ_TOKEN" .npmrc
${result === 143 ? 'kill -TERM "$PPID"\nexit 0' : `exit ${result}`}
`,
				{ mode: 0o700 }
			)
			const child = Bun.spawn(['bash', '-euo', 'pipefail', '-c', script], {
				cwd: directory,
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					TMPDIR: directory,
					PACKAGE_READ_TOKEN: 'synthetic-install-test-value'
				},
				stdout: 'pipe',
				stderr: 'pipe'
			})
			const [code, stdout, stderr] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text()
			])
			expect(code).toBe(result)
			expect(stdout + stderr).not.toContain('synthetic-install-test-value')
			expect(await readFile(join(directory, '.npmrc'), 'utf8')).toBe(original)
			expect((await stat(join(directory, '.npmrc'))).mode & 0o777).toBe(0o644)
			expect((await readdir(directory)).sort()).toEqual(['.npmrc', 'bun'])
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}
})
