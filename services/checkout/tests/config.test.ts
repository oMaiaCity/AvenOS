import { describe, expect, test } from 'vitest'
import {
	loadApiConfig,
	loadEmailWorkerConfig,
	loadPlatformEventWorkerConfig
} from '../src/lib/server/config.js'

const encryptionKey = Buffer.alloc(32, 7).toString('base64')

const production = (overrides: Record<string, string> = {}) => ({
	NODE_ENV: 'production',
	PUBLIC_BASE_URL: 'https://portal.aven.ceo',
	DATABASE_URL: 'postgres://role:password@database/aven_checkout',
	EMAIL_QUEUE_ENCRYPTION_KEY: encryptionKey,
	...overrides
})

describe('production process configuration boundaries', () => {
	test('checkout API requires a separate webhook database role', () => {
		expect(() => loadApiConfig(production())).toThrow(/WEBHOOK_DATABASE_URL/)
		expect(() =>
			loadApiConfig(
				production({
					WEBHOOK_DATABASE_URL: 'postgres://role:password@database/aven_checkout'
				})
			)
		).toThrow(/distinct from checkout HTTP/)
	})

	test('email worker starts with only its email database role', () => {
		const config = loadEmailWorkerConfig(
			production({
				DATABASE_URL: 'postgres://aven_checkout_email:password@database/aven_checkout',
				EMAIL_WORKER_DATABASE_URL: 'postgres://aven_checkout_email:password@database/aven_checkout',
				SMTP_URL: 'smtp://smtp.example.test:587',
				SMTP_FROM: 'avenOS <mail@aven.ceo>'
			})
		)
		expect(config.WEBHOOK_DATABASE_URL).toBeUndefined()
		expect(new URL(config.DATABASE_URL).username).toBe('aven_checkout_email')
	})

	test('platform event worker starts with only its outbox database role', () => {
		const config = loadPlatformEventWorkerConfig(
			production({
				DATABASE_URL: 'postgres://aven_checkout_platform_events:password@database/aven_checkout',
				PLATFORM_EVENT_WORKER_DATABASE_URL:
					'postgres://aven_checkout_platform_events:password@database/aven_checkout',
				PLATFORM_EVENT_TOKEN: 'platform-event-token-production-test'
			})
		)
		expect(config.WEBHOOK_DATABASE_URL).toBeUndefined()
		expect(new URL(config.DATABASE_URL).username).toBe('aven_checkout_platform_events')
	})
})
