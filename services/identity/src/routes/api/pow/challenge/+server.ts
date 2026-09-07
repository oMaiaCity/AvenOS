import { json } from '@sveltejs/kit'
import { runtime } from '$lib/server/runtime.js'
export const GET = async () =>
	json(await (await runtime()).proofOfWork.issue(), { headers: { 'cache-control': 'no-store' } })
