import type pg from 'pg'
import { describe, expect, test, vi } from 'vitest'
import {
	CheckoutCapabilities,
	mailProviderCapability,
	queueCapability
} from '../src/lib/server/capabilities.js'
import type { ServerConfig } from '../src/lib/server/config.js'

const provider = vi.hoisted(() => ({ enabled: true, calls: 0 }))
vi.mock('@polar-sh/sdk', () => ({
	Polar: class {
		webhooks = {
			listWebhookEndpoints: async () => {
				provider.calls++
				return (async function* () {
					yield {
						result: {
							items: [
								{
									url: 'https://portal.example.test/api/webhooks/polar',
									enabled: provider.enabled,
									format: 'raw',
									events: [
										'order.paid',
										'subscription.updated',
										'customer.state_changed',
										'refund.created'
									]
								}
							]
						}
					}
				})()
			}
		}
	}
}))

const metadata = () => ({
	smtpVerifiedAt: Date.now(),
	providerHealth: { healthy: true, code: 'OK', checkedAt: Date.now() }
})
const monitor = () => {
	const query = vi.fn(async (sql: string) => ({
		rows: sql.includes('email_queue')
			? [{ dead: 0, oldest: null, sent: true }]
			: sql.includes('worker_heartbeats')
				? [{ fresh: true, metadata: metadata() }]
				: [{ dead: 0, oldest: null }]
	}))
	return {
		query,
		capability: new CheckoutCapabilities(
			{ query } as unknown as pg.Pool,
			{
				ALLOW_FAKE_PAYMENTS: false,
				PUBLIC_BASE_URL: 'https://portal.example.test',
				POLAR_SERVER: 'sandbox'
			} as ServerConfig
		)
	}
}

describe('checkout capability health', () => {
	test('startup and old observations fail closed', async () => {
		provider.enabled = true
		const { capability } = monitor()
		expect(capability.snapshot().status).toBe('degraded')
		await capability.refresh()
		expect(capability.snapshot().status).toBe('healthy')
		expect(capability.snapshot(Date.now() + 180_001).status).toBe('degraded')
	})
	test('disabled webhook is degraded while repeated reads make no provider calls', async () => {
		provider.enabled = false
		const { capability, query } = monitor()
		await capability.refresh()
		const calls = provider.calls
		for (let i = 0; i < 100; i++) expect(capability.snapshot().status).toBe('degraded')
		expect(provider.calls).toBe(calls)
		expect(query).toHaveBeenCalledTimes(3)
		expect(capability.snapshot().checks.polar_webhook?.code).toBe('POLAR_WEBHOOK_UNAVAILABLE')
	})
	test('database observation failure invalidates the previous healthy cache', async () => {
		provider.enabled = true
		const { capability, query } = monitor()
		await capability.refresh()
		query.mockRejectedValueOnce(new Error('private database detail that must never be exposed'))
		await capability.refresh()
		const result = capability.snapshot()
		expect(result.status).toBe('degraded')
		expect(JSON.stringify(result)).not.toContain('private database detail')
	})
	test('dead letters and five-minute queue lag are visible without payloads', () => {
		expect(queueCapability({ dead: 1, oldestSeconds: 1 }, 100).code).toBe('DEAD_LETTER_PRESENT')
		expect(queueCapability({ dead: 0, oldestSeconds: 301 }, 100).code).toBe('QUEUE_STALE')
		expect(queueCapability({ dead: 0, oldestSeconds: null }, 100).status).toBe('healthy')
	})

	test('an idle installation can receive traffic without claiming delivered mail', async () => {
		provider.enabled = true
		const { capability, query } = monitor()
		query.mockImplementation(async (sql: string) => ({
			rows: sql.includes('email_queue')
				? [{ dead: 0, oldest: null, sent: false }]
				: sql.includes('worker_heartbeats')
					? [{ fresh: true, metadata: metadata() }]
					: [{ dead: 0, oldest: null }]
		}))
		await capability.refresh()
		const result = capability.snapshot()
		expect(result.status).toBe('healthy')
		expect(result.observations.smtp_acceptance.code).toBe('RECENT_SMTP_ACCEPTANCE_UNPROVEN')
		expect(result.observations.inbox_delivery.status).toBe('unverified')
	})
	test('worker observations are required, fresh and safe to publish without SMTP credentials', () => {
		const now = 200_000
		for (const value of [
			undefined,
			{},
			{ healthy: true, code: 'OK', checkedAt: 20_000 },
			{ healthy: true, code: 'OK', checkedAt: now + 1 },
			{ checkedAt: Number.NaN }
		])
			expect(mailProviderCapability(value, true, now).status).toBe('degraded')
		const healthy = { healthy: true, code: 'OK', checkedAt: now }
		expect(mailProviderCapability(healthy, false, now).status).toBe('degraded')
		expect(mailProviderCapability(healthy, true, now).status).toBe('healthy')
		expect(
			mailProviderCapability(
				{ healthy: false, code: 'private provider detail', checkedAt: now },
				true,
				now
			).code
		).toBe('SMTP_PROVIDER_OBSERVATION_FAILED')
		expect(
			mailProviderCapability(
				{ healthy: false, code: 'SMTP_SENDING_CAPACITY_UNAVAILABLE', checkedAt: now },
				true,
				now
			).code
		).toBe('SMTP_SENDING_CAPACITY_UNAVAILABLE')
	})
})
