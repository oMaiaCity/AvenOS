import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { schema } from './schema.js'

pg.types.setTypeParser(20, Number)
export type Queryable = pg.Pool | pg.PoolClient
export interface DatabaseContext {
	pool: pg.Pool
	db: NodePgDatabase<typeof schema>
}

export function openDatabase(connectionString: string, max = 5): DatabaseContext {
	const pool = new pg.Pool({ connectionString, max })
	pool.on('error', () => {})
	return { pool, db: drizzle(pool, { schema }) }
}

export async function withTransaction<T>(
	pool: pg.Pool,
	operation: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const result = await operation(client)
		await client.query('COMMIT')
		return result
	} catch (error) {
		await client.query('ROLLBACK').catch(() => {})
		throw error
	} finally {
		client.release()
	}
}

export async function migrate(
	database: DatabaseContext,
	folder = resolve(process.cwd(), 'migrations')
): Promise<void> {
	await database.pool.query(
		'CREATE TABLE IF NOT EXISTS identity_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
	)
	for (const name of (await readdir(folder)).filter((file) => /^\d+.*\.sql$/.test(file)).sort()) {
		const applied = await database.pool.query('SELECT 1 FROM identity_migrations WHERE name=$1', [
			name
		])
		if (applied.rows[0]) continue
		await withTransaction(database.pool, async (client) => {
			const sql = await readFile(resolve(folder, name), 'utf8')
			for (const statement of sql
				.split('--> statement-breakpoint')
				.map((part) => part.trim())
				.filter(Boolean))
				await client.query(statement)
			await client.query('INSERT INTO identity_migrations(name) VALUES($1)', [name])
		})
	}
}
