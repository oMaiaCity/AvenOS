import { describe, expect, test } from 'bun:test'
import { reconcileDeployedPolarWebhook } from './reconcile-deployed-polar-webhook.js'

const endpoint = () => ({
	id: '00000000-0000-4000-8000-000000000001',
	url: 'https://portal.next.aven.ceo/api/webhooks/polar',
	secret: 'fixture-signing-secret',
	enabled: false,
	format: 'raw',
	events: ['order.paid', 'subscription.updated', 'customer.state_changed', 'refund.created']
})
function fixture(
	options: { endpoints?: unknown[]; ready?: number; maxPage?: number; patchStatus?: number } = {}
) {
	const calls: Array<{ url: string; method: string; body?: unknown }> = []
	const fetcher = (async (value: string | URL | Request, init?: RequestInit) => {
		const url = String(value),
			method = init?.method ?? 'GET'
		calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
		expect(init?.redirect).toBe('error')
		expect(init?.signal).toBeDefined()
		if (url.startsWith('https://portal.')) {
			expect(init?.headers).toBeUndefined()
			return new Response('ready', { status: options.ready ?? 200 })
		}
		if (method === 'PATCH')
			return Response.json({ ...endpoint(), enabled: true }, { status: options.patchStatus ?? 200 })
		return Response.json({
			items: options.endpoints ?? [endpoint()],
			pagination: { max_page: options.maxPage ?? 1 }
		})
	}) as typeof fetch
	return {
		calls,
		run: () =>
			reconcileDeployedPolarWebhook({
				target: 'next',
				server: 'sandbox',
				accessToken: 'fixture-api-key',
				webhookSecret: 'fixture-signing-secret',
				fetcher
			})
	}
}

describe('deployment reactivates only its ready, saved Polar integration', () => {
	test('offline bootstrap endpoint recovers after readiness without recreating or rotating it', async () => {
		const { calls, run } = fixture()
		expect(await run()).toBe('re-enabled after checkout readiness')
		expect(calls.map((call) => call.method)).toEqual(['GET', 'GET', 'PATCH'])
		expect(calls[1]?.url).toBe('https://portal.next.aven.ceo/api/health/ready')
		expect(calls[2]?.body).toEqual({ enabled: true })
		expect(calls[2]?.url).toEndWith(endpoint().id)
	})
	test('an enabled endpoint is idempotent and still checks reachability', async () => {
		const { calls, run } = fixture({ endpoints: [{ ...endpoint(), enabled: true }] })
		expect(await run()).toBe('already enabled')
		expect(calls.map((call) => call.method)).toEqual(['GET', 'GET'])
	})
	test('absent, ambiguous, drifted, wrong-secret and unrelated endpoints cause no writes', async () => {
		for (const endpoints of [
			[],
			[endpoint(), endpoint()],
			[{ ...endpoint(), secret: 'other-secret' }],
			[{ ...endpoint(), format: 'discord' }],
			[{ ...endpoint(), events: [] }],
			[{ ...endpoint(), url: 'https://my.next.aven.ceo/api/webhooks/polar' }]
		]) {
			const { calls, run } = fixture({ endpoints })
			await expect(run()).rejects.toThrow()
			expect(calls.every((call) => call.method === 'GET')).toBe(true)
		}
	})
	test('unready checkout, bounded pagination and provider errors stop safely', async () => {
		for (const options of [{ ready: 503 }, { maxPage: 4 }]) {
			const { calls, run } = fixture(options)
			await expect(run()).rejects.toThrow()
			expect(calls.every((call) => call.method === 'GET')).toBe(true)
			expect(calls.length).toBeLessThanOrEqual(3)
		}
		await expect(fixture({ patchStatus: 503 }).run()).rejects.toThrow('HTTP 503')
	})
	test('environment mismatch is rejected before sending credentials', async () => {
		await expect(
			reconcileDeployedPolarWebhook({
				target: 'production',
				server: 'sandbox',
				accessToken: 'fixture',
				webhookSecret: 'fixture',
				fetcher: (() => {
					throw new Error('must not fetch')
				}) as typeof fetch
			})
		).rejects.toThrow('consistently')
	})
})
