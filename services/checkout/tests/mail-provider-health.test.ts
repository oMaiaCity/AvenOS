import { describe, expect, test, vi } from 'vitest'
import { observeMailProvider } from '../src/lib/server/email/provider-health.js'

const smtp = 'smtps://postscale:public-test-fixture@smtp.postscale.io:465'
const domain = {
	id: '00000000-0000-4000-8000-000000000001',
	domain: 'example.test',
	active: true,
	verified: true,
	spf_verified: true,
	dkim_verified: true
}
const fetcher = (warming: unknown, details = domain) =>
	vi.fn(async (url: string | URL | Request) =>
		Response.json(String(url).endsWith('/warming') ? warming : details)
	) as unknown as typeof fetch

describe('SMTP provider capacity, separate from SMTP authentication', () => {
	test('verified DNS and successful authentication do not hide zero sending capacity', async () => {
		const result = await observeMailProvider(
			smtp,
			'Aven <no-reply@example.test>',
			fetcher({ phase: 'not_started', remaining_today: 0, remaining_this_hour: 0 })
		)
		expect(result.code).toBe('SMTP_SENDING_CAPACITY_UNAVAILABLE')
	})
	test('requires an exact sender and positive remaining capacity', async () => {
		const warming = { phase: 'phase_1', remaining_today: 50, remaining_this_hour: 10 }
		expect(
			(await observeMailProvider(smtp, 'no-reply@example.test', fetcher(warming))).healthy
		).toBe(true)
		expect(
			(
				await observeMailProvider(
					smtp,
					'no-reply@example.test',
					fetcher(warming, { ...domain, dkim_verified: false })
				)
			).healthy
		).toBe(false)
	})
	test('unknown providers, provider errors and test keys are not silently healthy', async () => {
		expect((await observeMailProvider('smtp://mailpit', 'no-reply@example.test')).code).toBe(
			'SMTP_PROVIDER_NOT_OBSERVABLE'
		)
		expect(
			(
				await observeMailProvider(
					smtp.replace('public-test-fixture', 'ps_test_fixture'),
					'no-reply@example.test'
				)
			).code
		).toBe('SMTP_LIVE_CREDENTIAL_REQUIRED')
		const failed = vi.fn(async () => {
			throw new Error('private provider payload')
		}) as unknown as typeof fetch
		expect(await observeMailProvider(smtp, 'no-reply@example.test', failed)).toEqual({
			healthy: false,
			code: 'SMTP_PROVIDER_OBSERVATION_FAILED'
		})
	})
})
