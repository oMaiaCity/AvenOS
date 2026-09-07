import type { Transporter } from 'nodemailer'
import type pg from 'pg'
import pino from 'pino'
import { describe, expect, test, vi } from 'vitest'
import { mailProviderCapability } from '../src/lib/server/capabilities.js'
import type { EmailWorkerConfig } from '../src/lib/server/config.js'
import { observeMailProvider } from '../src/lib/server/email/provider-health.js'
import { EmailWorker } from '../src/lib/server/email/worker.js'

describe('mail-provider observation across the worker/database boundary', () => {
	test('persists the actual provider observation, never its credential, and replaces health on failure', async () => {
		const query = vi.fn(async () => ({ rows: [], rowCount: 1 }))
		let capacity = 10
		const fetcher = vi.fn(async (url: string) =>
			Response.json(
				url.endsWith('/warming')
					? { phase: 'phase_1', remaining_today: capacity, remaining_this_hour: capacity }
					: {
							id: '00000000-0000-4000-8000-000000000001',
							domain: 'example.test',
							active: true,
							verified: true,
							spf_verified: true,
							dkim_verified: true
						}
			)
		)
		const worker = new EmailWorker(
			{ query } as unknown as pg.Pool,
			{
				SMTP_URL: 'smtps://postscale:private-fixture@smtp.postscale.io:465',
				SMTP_FROM: 'test@example.test',
				APPLICATION_VERSION: 'fixture',
				EMAIL_WORKER_BATCH_SIZE: 2
			} as EmailWorkerConfig,
			Buffer.alloc(32),
			{} as Transporter,
			pino({ enabled: false }),
			(url, sender) => observeMailProvider(url, sender, fetcher as unknown as typeof fetch)
		)
		const saved = () =>
			JSON.parse((query.mock.calls.at(-1) as unknown as [string, unknown[]])[1][4] as string)
		await worker.refreshProviderHealth()
		expect(mailProviderCapability(saved().providerHealth, true, Date.now()).status).toBe('healthy')
		expect(JSON.stringify(query.mock.calls)).not.toContain('private-fixture')
		capacity = 0
		await worker.refreshProviderHealth()
		expect(mailProviderCapability(saved().providerHealth, true, Date.now()).code).toBe(
			'SMTP_SENDING_CAPACITY_UNAVAILABLE'
		)
		fetcher.mockRejectedValueOnce(new Error('private provider response'))
		await worker.refreshProviderHealth()
		expect(saved().providerHealth.code).toBe('SMTP_PROVIDER_OBSERVATION_FAILED')
		expect(JSON.stringify(query.mock.calls)).not.toContain('private provider response')
	})
	test('overlapping refresh requests make one provider call', async () => {
		let resolve!: (value: { healthy: boolean; code: string }) => void
		const observe = vi.fn(
			() =>
				new Promise<{ healthy: boolean; code: string }>((done) => {
					resolve = done
				})
		)
		const query = vi.fn(async () => ({ rows: [], rowCount: 1 }))
		const worker = new EmailWorker(
			{ query } as unknown as pg.Pool,
			{} as EmailWorkerConfig,
			Buffer.alloc(32),
			{} as Transporter,
			pino({ enabled: false }),
			observe
		)
		const first = worker.refreshProviderHealth()
		await worker.refreshProviderHealth()
		expect(observe).toHaveBeenCalledTimes(1)
		resolve({ healthy: true, code: 'OK' })
		await first
		expect(query).toHaveBeenCalledTimes(1)
	})
})
