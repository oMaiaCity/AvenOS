import type pg from 'pg'
import { describe, expect, test, vi } from 'vitest'
import { CheckoutCapabilities, queueCapability } from '../src/lib/server/capabilities.js'
import type { ServerConfig } from '../src/lib/server/config.js'

const provider = vi.hoisted(() => ({ enabled: true, calls: 0 }))
vi.mock('../src/lib/server/email/provider-health.js', () => ({
	observeMailProvider: async () => ({ healthy: true, code: 'OK' })
}))
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

const monitor = () => {
	const query = vi.fn(async (sql: string) => ({
		rows: sql.includes('email_queue')
			? [{ dead: 0, oldest: null, sent: true }]
			: sql.includes('worker_heartbeats')
				? [{ fresh: true, metadata: { smtpVerifiedAt: Date.now() } }]
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
					? [{ fresh: true, metadata: { smtpVerifiedAt: Date.now() } }]
					: [{ dead: 0, oldest: null }]
		}))
		await capability.refresh()
		const result = capability.snapshot()
		expect(result.status).toBe('healthy')
		expect(result.observations.smtp_acceptance.code).toBe('RECENT_SMTP_ACCEPTANCE_UNPROVEN')
		expect(result.observations.inbox_delivery.status).toBe('unverified')
	})
})
