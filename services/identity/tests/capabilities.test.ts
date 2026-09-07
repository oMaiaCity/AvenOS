import type pg from 'pg'
import { expect, test, vi } from 'vitest'
import { IdentityCapabilities } from '../src/lib/server/capabilities.js'

const summary = vi.hoisted(() => ({
	status: 'healthy',
	checkedAt: Math.floor(Date.now() / 1000),
	snapshotCount: 1
}))
vi.mock('node:fs/promises', () => ({
	stat: async () => ({ size: 128 }),
	readFile: async () => JSON.stringify(summary)
}))

test('identity capability cache distinguishes stale cleanup and backup failures without provider work on reads', async () => {
	let clean = true
	let calls = 0
	const pool = {
		query: async () => {
			calls++
			return { rows: [{ healthy: clean, mail_healthy: clean }] }
		}
	} as unknown as pg.Pool
	const monitor = new IdentityCapabilities(pool, '/fixture/health.json')
	expect(monitor.snapshot().status).toBe('degraded')
	await monitor.refresh()
	expect(monitor.snapshot().status).toBe('healthy')
	for (let i = 0; i < 100; i++) monitor.snapshot()
	expect(calls).toBe(1)
	clean = false
	summary.status = 'degraded'
	await monitor.refresh()
	expect(monitor.snapshot().checks.proof_cleanup?.code).toBe('PROOF_CLEANUP_STALE')
	expect(monitor.snapshot().checks.backup?.code).toBe('BACKUP_STALE_OR_FAILED')
	expect(monitor.snapshot(Date.now() + 180001).checks.database?.code).toBe('OBSERVATION_STALE')
})
