import { Polar } from '@polar-sh/sdk'
import type pg from 'pg'
import type { ServerConfig } from './config.js'

export type Capability = { status: 'healthy' | 'degraded'; code: string; checkedAt: number }
// Only the email worker holds the SMTP credential. Its heartbeat carries bounded
// observations, never a credential or a provider response, across this boundary.
export function mailProviderCapability(
	value: unknown,
	workerFresh: boolean,
	now: number
): Capability {
	const observation = value as
		| { healthy?: unknown; code?: unknown; checkedAt?: unknown }
		| undefined
	if (
		!workerFresh ||
		typeof observation?.checkedAt !== 'number' ||
		!Number.isFinite(observation.checkedAt) ||
		observation.checkedAt > now ||
		now - observation.checkedAt >= 180_000
	)
		return { status: 'degraded', code: 'SMTP_PROVIDER_OBSERVATION_STALE', checkedAt: now }
	if (observation.healthy === true && observation.code === 'OK')
		return { status: 'healthy', code: 'OK', checkedAt: observation.checkedAt }
	const known = [
		'SMTP_PROVIDER_NOT_OBSERVABLE',
		'SMTP_SENDER_INVALID',
		'SMTP_LIVE_CREDENTIAL_REQUIRED',
		'SMTP_SENDER_UNVERIFIED',
		'SMTP_SENDING_CAPACITY_UNAVAILABLE',
		'SMTP_PROVIDER_OBSERVATION_FAILED'
	]
	return {
		status: 'degraded',
		code: known.includes(String(observation.code))
			? String(observation.code)
			: 'SMTP_PROVIDER_OBSERVATION_FAILED',
		checkedAt: observation.checkedAt
	}
}
export function queueCapability(
	input: { dead: number; oldestSeconds: number | null },
	now: number
): Capability {
	return {
		status: input.dead > 0 || (input.oldestSeconds ?? 0) > 300 ? 'degraded' : 'healthy',
		code:
			input.dead > 0
				? 'DEAD_LETTER_PRESENT'
				: (input.oldestSeconds ?? 0) > 300
					? 'QUEUE_STALE'
					: 'OK',
		checkedAt: now
	}
}

// Public health requests read this cache; they never create provider calls or send mail.
export class CheckoutCapabilities {
	private values: Record<string, Capability> = {}
	private running = false
	private timer?: ReturnType<typeof setInterval>
	constructor(
		private pool: pg.Pool,
		private config: ServerConfig
	) {}
	start() {
		void this.refresh()
		this.timer = setInterval(() => void this.refresh(), 60_000)
		this.timer.unref()
	}
	stop() {
		clearInterval(this.timer)
	}
	snapshot(now = Date.now()) {
		const checks = Object.fromEntries(
			[
				'database',
				'email_queue',
				'smtp_connection',
				'smtp_provider',
				'platform_events',
				'polar_webhook'
			].map((name) => {
				const value = this.values[name]
				return [
					name,
					value && now - value.checkedAt < 180_000
						? value
						: {
								status: 'degraded',
								code: 'OBSERVATION_STALE',
								checkedAt: value?.checkedAt ?? 0
							}
				]
			})
		)
		return {
			status: Object.values(checks).every((check) => check.status === 'healthy')
				? 'healthy'
				: 'degraded',
			checks,
			// An idle or newly installed service has no recent mail traffic. That is
			// missing delivery evidence, not a broken connection or queue. Keep it
			// visible without manufacturing traffic or claiming inbox verification.
			observations: {
				smtp_acceptance: this.values.smtp_acceptance ?? {
					status: 'unverified',
					code: 'RECENT_SMTP_ACCEPTANCE_UNPROVEN',
					checkedAt: 0
				},
				inbox_delivery: { status: 'unverified', code: 'INBOX_DELIVERY_UNPROVEN' }
			}
		}
	}
	async refresh() {
		if (this.running) return
		this.running = true
		const now = Date.now()
		const record = (name: string, healthy: boolean, code: string) => {
			this.values[name] = {
				status: healthy ? 'healthy' : 'degraded',
				code: healthy ? 'OK' : code,
				checkedAt: now
			}
		}
		try {
			try {
				const email = (
					await this.pool.query<{ dead: number; oldest: number | null; sent: boolean }>(
						`SELECT count(*) FILTER (WHERE status='dead')::int AS dead,
					 extract(epoch FROM now()-min(created_at) FILTER (WHERE status IN ('queued','retry_wait','sending')))::float AS oldest,
					 coalesce(max(sent_at) > now()-interval '1 day', false) AS sent FROM email_queue`
					)
				).rows[0]
				const worker = (
					await this.pool.query<{
						fresh: boolean
						metadata: { smtpVerifiedAt?: number; providerHealth?: unknown }
					}>(
						`SELECT last_heartbeat_at > now()-interval '45 seconds' AS fresh, metadata
					 FROM worker_heartbeats WHERE worker_name='email-worker'`
					)
				).rows[0]
				const platform = (
					await this.pool.query<{ dead: number; oldest: number | null }>(
						`SELECT count(*) FILTER (WHERE status='dead')::int AS dead,
					 extract(epoch FROM now()-min(created_at) FILTER (WHERE status IN ('pending','sending')))::float AS oldest
					 FROM platform_event_outbox`
					)
				).rows[0]
				if (!email || !platform) throw new Error('Capability query returned no aggregate')
				record('database', true, 'DATABASE_UNAVAILABLE')
				this.values.email_queue = queueCapability(
					{ dead: email.dead, oldestSeconds: email.oldest },
					now
				)
				this.values.platform_events = queueCapability(
					{ dead: platform.dead, oldestSeconds: platform.oldest },
					now
				)
				record(
					'smtp_connection',
					Boolean(worker?.fresh && now - (worker.metadata.smtpVerifiedAt ?? 0) < 600_000),
					'SMTP_UNVERIFIED'
				)
				// SMTP acceptance is weaker than inbox delivery; the controlled-inbox E2E probe is separate.
				record('smtp_acceptance', email.sent, 'RECENT_SMTP_ACCEPTANCE_UNPROVEN')
				this.values.smtp_provider = this.config.ALLOW_FAKE_PAYMENTS
					? { status: 'healthy', code: 'LOCAL_MAIL_PROVIDER', checkedAt: now }
					: mailProviderCapability(
							worker?.metadata.providerHealth,
							Boolean(worker?.fresh),
							Date.now()
						)
			} catch {
				for (const name of [
					'database',
					'email_queue',
					'smtp_connection',
					'smtp_provider',
					'smtp_acceptance',
					'platform_events'
				])
					record(name, false, 'DATABASE_OBSERVATION_FAILED')
			}
			try {
				if (this.config.ALLOW_FAKE_PAYMENTS) record('polar_webhook', true, 'LOCAL_PAYMENT_PROVIDER')
				else {
					const polar = new Polar({
						accessToken: this.config.POLAR_API_KEY,
						server: this.config.POLAR_SERVER
					})
					const pages = await polar.webhooks.listWebhookEndpoints(
						{ organizationId: this.config.POLAR_ORGANIZATION_ID, limit: 100 },
						{ timeoutMs: 10_000 }
					)
					const expected = new URL('/api/webhooks/polar', this.config.PUBLIC_BASE_URL).href
					let valid = false
					let pageCount = 0
					for await (const page of pages) {
						if (++pageCount > 3) break
						const endpoint = page.result.items.find((item) => item.url === expected)
						if (endpoint) {
							valid =
								endpoint.enabled &&
								endpoint.format === 'raw' &&
								[
									'order.paid',
									'subscription.updated',
									'customer.state_changed',
									'refund.created'
								].every((event) => endpoint.events.includes(event as never))
							break
						}
					}
					record('polar_webhook', valid, 'POLAR_WEBHOOK_UNAVAILABLE')
				}
			} catch {
				record('polar_webhook', false, 'POLAR_OBSERVATION_FAILED')
			}
		} finally {
			this.running = false
		}
	}
}
