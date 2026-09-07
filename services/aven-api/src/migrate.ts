import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { loadFacadeConfig } from './config.js'
import { HostingStore } from './hosting/store.js'

const config = loadFacadeConfig()
const pool = new pg.Pool({
	connectionString: config.MIGRATOR_DATABASE_URL ?? config.DATABASE_URL,
	max: 1
})

try {
	await pool.query(
		'CREATE TABLE IF NOT EXISTS api_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
	)
	const folder = resolve(process.cwd(), 'migrations')
	for (const name of (await readdir(folder)).filter((file) => /^\d+.*\.sql$/.test(file)).sort()) {
		if ((await pool.query('SELECT 1 FROM api_migrations WHERE name=$1', [name])).rows[0]) continue
		const client = await pool.connect()
		try {
			await client.query('BEGIN')
			await client.query(await readFile(resolve(folder, name), 'utf8'))
			await client.query('INSERT INTO api_migrations(name) VALUES($1)', [name])
			await client.query('COMMIT')
		} catch (error) {
			await client.query('ROLLBACK').catch(() => {})
			throw error
		} finally {
			client.release()
		}
	}
	await new HostingStore(pool, {
		ipv4: config.SITE_HOST_PUBLIC_IPV4 || null,
		ipv6: config.SITE_HOST_PUBLIC_IPV6.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	}).seedSystemSites(config.SYSTEM_SITES_JSON)
	console.info('API schema is ready.')
} finally {
	await pool.end()
}
