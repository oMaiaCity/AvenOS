import { api, requireUser } from '$lib/server/api.js'

// The session's latest checkout status — no id is accepted; the row is ours.
export const GET = api(async (event, rt) => {
	const user = await requireUser(event)
	return { body: { checkout: await rt.subscriptions.checkoutStatus(user.id) } }
})
