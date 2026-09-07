import { api, requireUser } from '$lib/server/api.js'

// The caller's own standing, per tier — the session is the only selector.
export const GET = api(async (event, rt) => {
	const user = await requireUser(event)
	return { body: { subscriptions: await rt.subscriptions.me(user.id) } }
})
