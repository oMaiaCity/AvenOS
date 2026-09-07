import type pg from 'pg'

export async function workerFreshness(pool: pg.Pool): Promise<Map<string, Date>> {
	const rows = (await pool.query('SELECT worker_name,last_heartbeat_at FROM worker_heartbeats'))
		.rows as Array<{ worker_name: string; last_heartbeat_at: Date }>
	return new Map(rows.map((row) => [row.worker_name, row.last_heartbeat_at]))
}
