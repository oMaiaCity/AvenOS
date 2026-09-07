import { api, readJson, requireUser } from '$lib/server/api.js'

// Pausieren — schedules a pause at period end (Polar guards the
// preconditions: active, no scheduled cancel, no end date). Tier-scoped.
export const POST = api(async (event, rt) => {
	const user = await requireUser(event)
	const body = (await readJson(event)) as { tier?: string }
	await rt.subscriptions.pause(user.id, String(body.tier ?? ''))
	return { body: { pending: true } }
})
