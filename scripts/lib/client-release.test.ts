import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { clientAssetNames, clientReleasePlan, verifyClientAssets } from './client-release.js'

const sha = 'a'.repeat(40)
const version = '26.9.7-production.17'
function fixtures() {
	const result = Object.fromEntries(
		clientAssetNames(version).map((name) => [name, Buffer.alloc(2048)])
	)
	for (const [name, bytes] of Object.entries(result)) {
		if (name.endsWith('.deb')) bytes.write('!<arch>\n')
		if (name.endsWith('.AppImage')) {
			bytes.set([127, 69, 76, 70])
			bytes.set([65, 73, 2], 8)
		}
		if (name.endsWith('.dmg')) bytes.write('koly', bytes.length - 512)
		if (name.endsWith('.apk')) bytes.set([80, 75, 3, 4])
	}
	return result
}

describe('client release contract', () => {
	test('protected branches select one platform but always the shared identity', () => {
		const prod = clientReleasePlan('refs/heads/prod', sha, '17', '2026-09-07')
		expect(prod).toMatchObject({
			version,
			source: sha,
			prerelease: true,
			apiOrigin: 'https://api.aven.ceo',
			identityOrigin: 'https://aven.id',
			androidVersionCode: 30_000_017
		})
		expect(clientReleasePlan('refs/heads/next', sha, '18', '2026-09-07').apiOrigin).toBe(
			'https://api.next.aven.ceo'
		)
		for (const ref of ['refs/heads/main', 'refs/heads/feature', 'refs/tags/v1', 'prod'])
			expect(() => clientReleasePlan(ref, sha, '17', '2026-09-07')).toThrow('protected')
		for (const run of ['0', '../escape', '1\nanything', '3000000000'])
			expect(() => clientReleasePlan('refs/heads/prod', sha, run, '2026-09-07')).toThrow()
		expect(() => clientReleasePlan('refs/heads/prod', 'main', '17', '2026-09-07')).toThrow()
	})
	test('all four native installers are mandatory; source-only, stale, and extra files fail', () => {
		const files = fixtures()
		expect(verifyClientAssets(version, files)).toHaveLength(4)
		for (const asset of Object.keys(files)) {
			const missing = { ...files }
			delete missing[asset]
			expect(() => verifyClientAssets(version, missing)).toThrow('Exactly')
			expect(() => verifyClientAssets(version, { ...files, [asset]: Buffer.alloc(2048) })).toThrow(
				'installer'
			)
		}
		expect(() =>
			verifyClientAssets(version, { ...files, '.npmrc': Buffer.from('never publish') })
		).toThrow('Exactly')
		expect(() => verifyClientAssets('26.9.7-production.18', files)).toThrow('Exactly')
		expect(() => clientAssetNames('../../escape')).toThrow()
		expect(verifyClientAssets(version, files)[0].sha256).toHaveLength(64)
	})
	test('publication waits for every native build and builds cannot write releases', () => {
		const workflow = Bun.YAML.parse(
			readFileSync(new URL('../../.github/workflows/client-release.yml', import.meta.url), 'utf8')
		) as {
			jobs: {
				publish: { needs: string[]; permissions: { contents: string } }
				desktop: { strategy: { 'fail-fast': boolean } }
			}
			permissions: { contents: string }
			concurrency: { 'cancel-in-progress': boolean }
		}
		expect(workflow.jobs.publish.needs).toEqual(['plan', 'desktop', 'android'])
		expect(workflow.permissions.contents).toBe('read')
		expect(workflow.jobs.publish.permissions.contents).toBe('write')
		expect(workflow.jobs.desktop.strategy['fail-fast']).toBe(false)
		expect(workflow.concurrency['cancel-in-progress']).toBe(false)
		const source = JSON.stringify(workflow)
		for (const forbidden of [
			'HCLOUD_TOKEN',
			'DEPLOY_SSH',
			'POLAR_ACCESS_TOKEN',
			'RECOVERY_PASSWORD'
		])
			expect(source).not.toContain(forbidden)
		expect(source).toContain('client-release-manifest.ts')
		expect(source).toContain('--draft=false --prerelease')
		expect(source).toContain('--print-certs')
		const builder = readFileSync(new URL('../build-client-release.ts', import.meta.url), 'utf8')
		expect(builder).toContain("'--locked'")
		expect(builder).toContain("AVENOS_CLIENT_RELEASE_BUILD: 'true'")
	})
})
