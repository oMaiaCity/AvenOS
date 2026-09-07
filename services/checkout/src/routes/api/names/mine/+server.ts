import { api, requireUser } from '$lib/server/api.js'

export const GET = api(async (event, rt) => {
	const user = await requireUser(event)
	return { body: { names: await rt.names.listForUser(user.id) } }
})
