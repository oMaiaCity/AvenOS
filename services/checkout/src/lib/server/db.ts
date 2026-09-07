import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate as runDrizzleMigrations } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { schema } from './schema/index.js'

// BIGINT (int8) values in this schema are counts and epoch-millisecond
// timestamps — all safely below 2^53, so map them to numbers.
pg.types.setTypeParser(20, Number)

export type Queryable = pg.Pool | pg.PoolClient
export interface DatabaseContext {
	pool: pg.Pool
	db: NodePgDatabase<typeof schema>
}

export function openDatabase(
	connectionString: string,
	options: {
		max?: number
		onError?: (error: Error) => void
		connectionTimeoutMillis?: number
		queryTimeoutMillis?: number
		statementTimeoutMillis?: number
	} = {}
): DatabaseContext {
	const pool = new pg.Pool({
		connectionString,
		max: options.max ?? 5,
		connectionTimeoutMillis: options.connectionTimeoutMillis,
		query_timeout: options.queryTimeoutMillis,
		statement_timeout: options.statementTimeoutMillis
	})
	// Idle clients emit 'error' when the server terminates them (restart,
	// failover, admin kill). Without a handler that crashes the process.
	pool.on('error', (error) => options.onError?.(error))
	return { pool, db: drizzle(pool, { schema }) }
}

export async function withTransaction<T>(
	pool: pg.Pool,
	fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const result = await fn(client)
		await client.query('COMMIT')
		return result
	} catch (error) {
		await client.query('ROLLBACK').catch(() => {})
		throw error
	} finally {
		client.release()
	}
}

// Applies drizzle migrations plus the idempotent per-role grants. Run with the
// migrator role; the runtime roles never hold DDL privileges.
export async function migrate(
	database: DatabaseContext,
	migrationsFolder = resolve(process.cwd(), 'migrations')
): Promise<void> {
	await runDrizzleMigrations(database.db, { migrationsFolder })
	const grants = await readFile(resolve(migrationsFolder, 'grants.sql'), 'utf8').catch(() => null)
	if (grants) await database.pool.query(grants)
}
