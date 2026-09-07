import { api, readJson, requireUser } from '$lib/server/api.js'

// Kündigungsbutton semantics: default is end-of-period, as easy as booking.
// Tier-scoped — each product is canceled on its own.
export const POST = api(async (event, rt) => {
	const user = await requireUser(event)
	const body = (await readJson(event)) as { tier?: string; immediate?: boolean }
	await rt.subscriptions.cancel(user.id, String(body.tier ?? ''), body.immediate === true)
	return { body: { pending: true } }
})
