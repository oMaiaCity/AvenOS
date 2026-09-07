import { api, readJson, requireUser } from '$lib/server/api.js'

// Fortsetzen — reverts a scheduled cancellation.
export const POST = api(async (event, rt) => {
	const user = await requireUser(event)
	const body = (await readJson(event)) as { tier?: string }
	await rt.subscriptions.resume(user.id, String(body.tier ?? ''))
	return { body: { pending: true } }
})
