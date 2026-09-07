import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SiteHostConfig } from '../src/config.js'
import { StaticSiteHost } from '../src/host.js'
import type { DirectoryBinding } from '../src/repository.js'

let dataRoot: string | undefined

afterEach(async () => {
	if (dataRoot) await rm(dataRoot, { recursive: true, force: true })
	dataRoot = undefined
})

test('loads and serves a last-known-good site without the identity API', async () => {
	dataRoot = await mkdtemp(join(tmpdir(), 'aven-site-state-'))
	const binding: DirectoryBinding = {
		id: '00000000-0000-4000-8000-000000000001',
		hostname: 'customer.example',
		repository_full_name: 'myavenceo/avenceo',
		clone_url: 'https://github.com/myavenceo/avenceo.git',
		source_ref: 'refs/heads/next',
		artifact_ref: 'refs/heads/deploy/next',
		artifact_path: 'dist',
		verification_mode: 'txt',
		verification_token_hash: 'a'.repeat(64),
		verified_at: new Date().toISOString(),
		owner_is_admin: false
	}
	const root = join(dataRoot, 'bindings', binding.id, 'releases', 'b'.repeat(40))
	await mkdir(join(root, '_app'), { recursive: true })
	await writeFile(join(root, 'index.html'), '<h1>site works</h1>')
	await writeFile(
		join(dataRoot, 'active-sites.json'),
		JSON.stringify({ sites: [{ binding, root }] })
	)
	const config: SiteHostConfig = {
		hostname: '127.0.0.1',
		port: 8093,
		dataRoot,
		maxFiles: 10_000,
		maxBytes: 268_435_456,
		maxConcurrentSyncs: 4,
		directoryUrl: 'http://127.0.0.1:1/internal/v1/static-sites/bindings',
		statusUrl: 'http://127.0.0.1:1/internal/v1/static-sites/status',
		bearerToken: 'a'.repeat(32),
		allowedIpv4: new Set(['192.0.2.10']),
		allowedIpv6: new Set(),
		dnsServers: [],
		pollMilliseconds: 60_000,
		dnsGraceMilliseconds: 86_400_000
	}
	const host = new StaticSiteHost(config)
	await host.loadPersistedState()

	expect((await host.handle(new Request('http://local/health/ready'))).status).toBe(200)
	expect(
		(await host.handle(new Request('http://local/internal/caddy/ask?domain=customer.example')))
			.status
	).toBe(200)
	expect(
		(
			await host.handle(
				new Request('http://local/client-side-route', { headers: { host: binding.hostname } })
			)
		).status
	).toBe(200)
	expect(
		(
			await host.handle(
				new Request('http://local/missing.js', { headers: { host: binding.hostname } })
			)
		).status
	).toBe(404)
	expect(
		(await host.handle(new Request('http://local/', { headers: { host: 'unknown.example' } })))
			.status
	).toBe(404)
})
