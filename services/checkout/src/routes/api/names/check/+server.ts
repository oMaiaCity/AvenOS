import type { RequestEvent } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { rateLimit } from '$lib/server/rate-limit.js'
import { runtime } from '$lib/server/runtime.js'

export const GET = async (event: RequestEvent) => {
	if (!rateLimit(`names-check:${event.getClientAddress()}`, 30, 60_000)) {
		return json(
			{ code: 'RATE_LIMITED', message: 'Too many availability checks. Retry shortly.' },
			{ status: 429 }
		)
	}
	const { names } = await runtime()
	return json(await names.availability(event.url.searchParams.get('name') ?? ''), {
		headers: { 'Cache-Control': 'no-store' }
	})
}
