import { json } from '@sveltejs/kit'
import { runtime } from '$lib/server/runtime.js'
export const GET = async () => {
	try {
		await (await runtime()).database.pool.query('SELECT 1')
		return json({ status: 'ready', service: 'identity' })
	} catch {
		return json({ status: 'unavailable', service: 'identity' }, { status: 503 })
	}
}
