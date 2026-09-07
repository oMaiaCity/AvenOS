// Unit-test helpers. Tests run against a real postgres — start one with
// `docker compose up -d db` (published on 127.0.0.1:55432 by default) or point
// TEST_ADMIN_DATABASE_URL at any cluster. Each call to createTestDatabase()
// provisions a throwaway database and applies the migrations.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { type ServerConfig, serverConfigSchema } from '../src/lib/server/config.js'
import { decodeEncryptionKey } from '../src/lib/server/crypto.js'
import { type DatabaseContext, migrate, openDatabase } from '../src/lib/server/db.js'
import type { QueueSettings } from '../src/lib/server/email/queue.js'
import { createNotifier, type Notifier } from '../src/lib/server/notifications.js'

const adminUrl =
	process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:aven-dev@127.0.0.1:55432/postgres'

export function testConfig(overrides: Record<string, string> = {}): ServerConfig {
	return serverConfigSchema.parse({
		PUBLIC_BASE_URL: 'http://localhost:5173',
		DATABASE_URL: adminUrl,
		EMAIL_QUEUE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
		SMTP_URL: 'smtp://127.0.0.1:2525',
		SMTP_FROM: 'Aven <no-reply@example.test>',
		NODE_ENV: 'test',
		...overrides
	})
}

export interface TestDatabase extends DatabaseContext {
	name: string
	teardown(): Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabase> {
	const name = `aven_test_${randomUUID().replaceAll('-', '')}`
	const admin = new pg.Pool({ connectionString: adminUrl, max: 1 })
	admin.on('error', () => {})
	await admin.query(`CREATE DATABASE ${name}`)
	const url = new URL(adminUrl)
	url.pathname = `/${name}`
	const database = openDatabase(url.toString(), { max: 3 })
	await migrate(database)
	return {
		...database,
		name,
		async teardown() {
			await database.pool.end()
			// Let fire-and-forget writes (job logs, lease renewals) settle before
			// the forced drop kills their connections.
			await new Promise((resolve) => setTimeout(resolve, 200))
			await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
			await admin.end()
		}
	}
}

export function testQueueSettings(config: ServerConfig): QueueSettings {
	return {
		key: decodeEncryptionKey(config.EMAIL_QUEUE_ENCRYPTION_KEY),
		maxAttempts: config.EMAIL_MAX_ATTEMPTS
	}
}

export function testNotifier(config: ServerConfig): Notifier {
	return createNotifier(config, testQueueSettings(config))
}

export async function insertUser(
	database: DatabaseContext
): Promise<{ id: string; name: string; email: string }> {
	const id = randomUUID()
	const user = { id, name: 'Test User', email: `${id}@example.test` }
	await database.pool.query(
		'INSERT INTO checkout_customers(subject_id,email,created_at,updated_at) VALUES($1,$2,$3,$3)',
		[id, user.email, new Date()]
	)
	return user
}

export function testIdentityProvisioner() {
	return {
		async provisionVerifiedAccount(email: string) {
			return {
				account: {
					id: randomUUID(),
					name: email.split('@')[0] ?? email,
					email,
					role: 'user' as const
				},
				setupUrl: `https://aven.id/setup/${randomUUID()}`
			}
		}
	}
}
