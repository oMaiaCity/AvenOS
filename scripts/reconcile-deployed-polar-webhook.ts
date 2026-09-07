import { timingSafeEqual } from 'node:crypto'
import { readBoundedBytes } from '../libs/aven-http-boundary/src/index.js'

interface Endpoint {
	id: string
	url: string
	secret: string
	enabled: boolean
	format: string
	events: string[]
}

/** Reactivate only the already-bootstrapped integration after checkout is reachable. */
export async function reconcileDeployedPolarWebhook(input: {
	target: string
	server: string
	accessToken: string
	webhookSecret: string
	fetcher?: typeof fetch
}) {
	if (
		!['next', 'production'].includes(input.target) ||
		input.server !== (input.target === 'next' ? 'sandbox' : 'production') ||
		!input.accessToken ||
		!input.webhookSecret
	)
		throw new Error('Polar deployment target and credentials must be configured consistently.')
	const fetcher = input.fetcher ?? fetch
	const origin = `https://portal.${input.target === 'next' ? 'next.' : ''}aven.ceo`
	const expected = `${origin}/api/webhooks/polar`
	const base =
		input.server === 'sandbox' ? 'https://sandbox-api.polar.sh/v1' : 'https://api.polar.sh/v1'
	const request = async (path: string, body?: unknown) => {
		const response = await fetcher(`${base}${path}`, {
			method: body === undefined ? 'GET' : 'PATCH',
			headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
			redirect: 'error',
			signal: AbortSignal.timeout(15_000)
		})
		if (!response.ok)
			throw new Error(`Polar webhook reconciliation returned HTTP ${response.status}.`)
		return JSON.parse(
			new TextDecoder().decode(
				await readBoundedBytes({ headers: new Headers(), body: response.body }, 1024 * 1024, 15_000)
			)
		)
	}
	const matches: Endpoint[] = []
	for (let page = 1; page <= 3; page++) {
		const result = await request(`/webhooks/endpoints?limit=100&page=${page}`)
		if (!Array.isArray(result.items) || !Number.isSafeInteger(result.pagination?.max_page))
			throw new Error('Polar webhook listing has an unexpected shape.')
		matches.push(...result.items.filter((endpoint: Endpoint) => endpoint.url === expected))
		if (result.pagination.max_page <= page) break
		if (page === 3) throw new Error('Polar webhook listing exceeds the bounded deployment lookup.')
	}
	if (matches.length !== 1)
		throw new Error(
			'Expected exactly one bootstrapped Polar webhook; reconcile bootstrap before deploying.'
		)
	const endpoint = matches[0]!
	const secretMatches = (value: unknown) => {
		if (typeof value !== 'string') return false
		const actual = Buffer.from(value),
			expectedSecret = Buffer.from(input.webhookSecret)
		return actual.length === expectedSecret.length && timingSafeEqual(actual, expectedSecret)
	}
	if (
		!/^[0-9a-f-]{36}$/i.test(endpoint.id) ||
		endpoint.format !== 'raw' ||
		!Array.isArray(endpoint.events) ||
		!['order.paid', 'subscription.updated', 'customer.state_changed', 'refund.created'].every(
			(event) => endpoint.events.includes(event)
		) ||
		!secretMatches(endpoint.secret)
	)
		throw new Error(
			'The deployed Polar webhook does not match its saved signing secret or required contract.'
		)
	const ready = await fetcher(`${origin}/api/health/ready`, {
		redirect: 'error',
		signal: AbortSignal.timeout(15_000)
	})
	await ready.body?.cancel()
	if (ready.status !== 200)
		throw new Error('Checkout is not ready; the Polar webhook was not changed.')
	if (endpoint.enabled === true) return 'already enabled'
	if (endpoint.enabled !== false) throw new Error('Polar webhook enabled state is invalid.')
	const updated = await request(`/webhooks/endpoints/${endpoint.id}`, { enabled: true })
	if (
		updated.id !== endpoint.id ||
		updated.url !== expected ||
		updated.enabled !== true ||
		updated.format !== 'raw' ||
		!secretMatches(updated.secret)
	)
		throw new Error('Polar webhook reactivation could not be verified.')
	return 're-enabled after checkout readiness'
}

if (import.meta.main) {
	try {
		const result = await reconcileDeployedPolarWebhook({
			target: process.env.DEPLOYMENT_TARGET ?? '',
			server: process.env.POLAR_SERVER ?? '',
			accessToken: process.env.POLAR_API_KEY ?? '',
			webhookSecret: process.env.POLAR_WEBHOOK_SECRET ?? ''
		})
		console.log(`Polar webhook ${result}; endpoint and signing secret unchanged.`)
	} catch (error) {
		// Do not print provider response bodies, request headers, or SDK errors.
		console.error(
			error instanceof Error && !['TypeError', 'SyntaxError'].includes(error.name)
				? error.message
				: 'Polar webhook reconciliation failed; check provider availability and saved configuration.'
		)
		process.exitCode = 1
	}
}
