import { describe, expect, test } from 'bun:test'
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
