import type pg from 'pg'
import { expect, test } from 'vitest'
import { PlatformCapabilities } from '../src/capabilities.js'
import type { FacadeConfig } from '../src/config.js'

const config = {
	IDENTITY_ISSUER: 'http://identity.test',
	CHECKOUT_CAPABILITIES_URL: 'http://checkout.test/api/health/capabilities',
	ARTIFACT_STORE_BASE_URL: 'http://artifacts.test',
	CUSTOMER_DOWNSTREAMS_JSON: [
		{ segment: 'actor-runs', baseUrl: 'http://runner.test' },
		{ segment: 'intents', baseUrl: 'http://intents.test' }
	]
} as FacadeConfig

test('dependency and backup capability checks are cached and fail closed', async () => {
	let requests = 0
	let databaseHealthy = true
	let remoteHealthy = true
	let backupHealthy = true
	const pool = {
		query: async () => ({ rows: [{ healthy: databaseHealthy }] })
	} as unknown as pg.Pool
	const fetcher = (async () => {
		requests++
		return new Response(null, { status: remoteHealthy ? 200 : 503 })
	}) as unknown as typeof fetch
	const observer = new PlatformCapabilities(config, pool, fetcher, async () => ({
		status: backupHealthy ? 'healthy' : 'degraded',
		checkedAt: Math.floor(Date.now() / 1000),
		snapshotCount: 1
	}))
	expect(observer.snapshot().status).toBe('degraded')
	await observer.refresh()
	expect(observer.snapshot().status).toBe('healthy')
	for (let i = 0; i < 100; i++) observer.snapshot()
	expect(requests).toBe(5)
	databaseHealthy = false
	await observer.refresh()
	expect(observer.snapshot().checks.provisioning?.code).toBe('PROVISIONING_STALE_OR_FAILED')
	remoteHealthy = false
	backupHealthy = false
	await observer.refresh()
	expect(observer.snapshot().checks.checkout?.code).toBe('DEPENDENCY_DEGRADED')
	expect(observer.snapshot().checks.backup?.code).toBe('BACKUP_STALE_OR_FAILED')
	expect(observer.snapshot(Date.now() + 180001).checks.database?.code).toBe('OBSERVATION_STALE')
})
