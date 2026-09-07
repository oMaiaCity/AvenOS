import { json } from '@sveltejs/kit'
import { runtime } from '$lib/server/runtime.js'

export const GET = async () => {
	const result = (await runtime()).capabilities.snapshot()
	return json(result, { status: result.status === 'healthy' ? 200 : 503,
		headers: { 'cache-control': 'no-store' } })
}
