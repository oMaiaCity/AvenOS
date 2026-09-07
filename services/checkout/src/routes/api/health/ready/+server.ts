import { json } from '@sveltejs/kit'
import { runtime } from '$lib/server/runtime.js'

export const GET = async () => {
	const checks: Record<string, boolean> = { database: false, migration: false }
	try {
		const { database } = await runtime()
		await database.pool.query('SELECT 1')
		checks.database = true
		await database.pool.query('SELECT 1 FROM checkout_customers LIMIT 1')
		checks.migration = true
	} catch {
		/* response carries safe booleans */
	}
	const ready = Object.values(checks).every(Boolean)
	return json({ status: ready ? 'ready' : 'not_ready', checks }, { status: ready ? 200 : 503 })
}
