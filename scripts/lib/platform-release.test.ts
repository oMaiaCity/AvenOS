import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	assertDeploymentAuthority,
	assertInitialDeployment,
	assertNextReleaseCommit,
	assertRunProvenance,
	releaseImages,
	sameRelease,
	validateReleaseManifest
} from './platform-release.js'

const manifest = () => ({
	version: 1 as const,
	sha: 'a'.repeat(40),
	runId: 123,
	images: Object.fromEntries(
		Object.entries(releaseImages).map(([key, image]) => [
			key,
			`ghcr.io/myavenceo/${image}@sha256:${'b'.repeat(64)}`
		])
	)
})
describe('release trust boundary', () => {
	test('the release journey receives only the exact verified image set', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'aven-release-environment-'))
		try {
			const file = join(directory, 'environment')
			const release = manifest()
			for (const [input, sha, accepted] of [
				[JSON.stringify(release), release.sha, true],
				[JSON.stringify(release), 'c'.repeat(40), false],
				['{}', release.sha, false],
				['', release.sha, true]
			] as const) {
				await writeFile(file, 'existing=value\n')
				const child = Bun.spawn([process.execPath, 'scripts/configure-e2e-release.ts'], {
					env: { RELEASE_TEST_MANIFEST: input, GITHUB_SHA: sha, GITHUB_ENV: file },
					stdout: 'pipe',
					stderr: 'pipe'
				})
				expect((await child.exited) === 0).toBe(accepted)
				const output = await readFile(file, 'utf8')
				if (!accepted || !input) expect(output).toBe('existing=value\n')
				else {
					expect(output.split('\n').filter(Boolean)).toEqual([
						'existing=value',
						...Object.entries(release.images).map(([name, image]) => `E2E_${name}=${image}`),
						'E2E_SKIP_IMAGE_BUILD=true'
					])
				}
			}
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
	test('deployment staging rejects changed images and revisions before reading deployment state', async () => {
		const release = manifest()
		const environment = {
			...release.images,
			RELEASE_MANIFEST: JSON.stringify(release),
			DEPLOYED_REF_SHA: release.sha
		}
		for (const [change, accepted] of [
			[{}, true],
			[{ DEPLOYED_REF_SHA: 'c'.repeat(40) }, false],
			[{ DATABASE_IMAGE: 'unverified:latest' }, false],
			[{ RELEASE_MANIFEST: '{}' }, false]
		] as const) {
			const child = Bun.spawn([process.execPath, 'scripts/validate-deploy-manifest.ts'], {
				env: { ...environment, ...change },
				stdout: 'pipe',
				stderr: 'pipe'
			})
			expect((await child.exited) === 0).toBe(accepted)
			const output = await new Response(child.stdout).text()
			if (accepted) expect(JSON.parse(output)).toEqual(release)
			else expect(output).toBe('')
		}
	})
	test('normal updates cannot redeploy every target including shared identity', () => {
		expect(() => assertInitialDeployment('all', false, false)).toThrow()
		expect(() => assertInitialDeployment('all', true, true)).toThrow()
		expect(() => assertInitialDeployment('all', true, false)).not.toThrow()
		for (const target of ['next', 'production', 'identity']) {
			expect(() => assertInitialDeployment(target, false, false)).not.toThrow()
			expect(() => assertInitialDeployment(target, true, false)).toThrow()
		}
	})
	test('next requires its current commit while prod can restore an earlier verified release into next', () => {
		expect(() =>
			assertNextReleaseCommit('refs/heads/next', 'next', 'a'.repeat(40), 'b'.repeat(40))
		).toThrow()
		expect(() =>
			assertNextReleaseCommit('refs/heads/next', 'next', 'a'.repeat(40), 'a'.repeat(40))
		).not.toThrow()
		expect(() =>
			assertNextReleaseCommit('refs/heads/prod', 'next', 'a'.repeat(40), 'b'.repeat(40))
		).not.toThrow()
	})
	test('main, tags and candidate refs have no environment authority', () => {
		for (const ref of ['refs/heads/main', 'refs/heads/feature', 'refs/tags/prod', 'a'.repeat(40)])
			for (const target of ['next', 'production', 'identity', 'all'])
				expect(() => assertDeploymentAuthority(ref, target)).toThrow()
		expect(() => assertDeploymentAuthority('refs/heads/next', 'next')).not.toThrow()
		for (const target of ['production', 'identity', 'all'])
			expect(() => assertDeploymentAuthority('refs/heads/next', target)).toThrow()
		for (const target of ['next', 'production', 'identity', 'all'])
			expect(() => assertDeploymentAuthority('refs/heads/prod', target)).not.toThrow()
	})
	test('requires each exact package digest and rejects substitutions or extra fields', () => {
		const valid = validateReleaseManifest(manifest())
		expect(sameRelease(valid, validateReleaseManifest(manifest()))).toBe(true)
		expect(() =>
			validateReleaseManifest({
				...manifest(),
				images: { ...manifest().images, API_IMAGE: 'ghcr.io/myavenceo/aven-api:latest' }
			})
		).toThrow()
		expect(() => validateReleaseManifest({ ...manifest(), shell: 'unused' })).toThrow()
		expect(sameRelease(valid, { ...valid, runId: 124 })).toBe(false)
	})
	test('requires a successful same-repository protected release run', () => {
		const run = {
			conclusion: 'success',
			event: 'workflow_dispatch',
			head_branch: 'next',
			head_sha: 'a'.repeat(40),
			path: '.github/workflows/platform-release.yml',
			head_repository: { full_name: 'MyAvenCEO/avenOS' }
		}
		const verify = (value: typeof run) =>
			assertRunProvenance(value, 'MyAvenCEO/avenOS', 'platform-release.yml', ['next'])
		expect(() => verify(run)).not.toThrow()
		for (const change of [
			{ conclusion: 'failure' },
			{ event: 'pull_request' },
			{ head_branch: 'main' },
			{ path: '.github/workflows/other.yml' },
			{ head_repository: { full_name: 'other/fork' } }
		])
			expect(() => verify({ ...run, ...change })).toThrow()
	})
})
