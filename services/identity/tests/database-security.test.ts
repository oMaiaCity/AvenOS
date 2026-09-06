import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createAuth } from '../src/lib/server/auth.js'
import { identityConfigSchema } from '../src/lib/server/config.js'
import { type DatabaseContext, migrate, openDatabase } from '../src/lib/server/db.js'
import { enrollmentAdapter, enrollmentContext } from '../src/lib/server/enrollment.js'
import { PasskeyService } from '../src/lib/server/passkeys.js'
import { ProofOfWorkService } from '../src/lib/server/proof-of-work.js'
import {
	decryptSetupToken,
	encryptSetupToken,
	IdentitySecurityMailer
} from '../src/lib/server/security-mail.js'
import { sha256Hex } from '../src/lib/server/tokens.js'

const adminUrl = process.env.TEST_IDENTITY_ADMIN_DATABASE_URL
describe.skipIf(!adminUrl)('identity database security boundaries', () => {
	const name = `identity_security_${randomUUID().replaceAll('-', '')}`
	let admin: pg.Pool
	let database: DatabaseContext
	let passkeys: PasskeyService
	let adapter: ReturnType<ReturnType<typeof enrollmentAdapter>>
	beforeAll(async () => {
		admin = new pg.Pool({ connectionString: adminUrl })
		for (const role of [
			'aven_identity_auth',
			'aven_identity_accounts',
			'aven_identity_authorization',
			'aven_identity_migrator'
		])
			await admin.query(
				`DO $$ BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`
			)
		await admin.query(`CREATE DATABASE ${name}`)
		const url = new URL(adminUrl!)
		url.pathname = `/${name}`
		database = openDatabase(url.href)
		await migrate(database, resolve('migrations'))
		passkeys = new PasskeyService(database.pool, false)
		const auth = createAuth(
			identityConfigSchema.parse({
				DATABASE_URL: url.href,
				BETTER_AUTH_SECRET: 'identity-security-test-secret-32-bytes',
				IDENTITY_PROVISIONING_SECRETS: 'identity-security-test-provisioning-32-bytes'
			}),
			database,
			(token) => passkeys.verifySetupLink(token)
		)
		adapter = enrollmentAdapter(database)((await auth.$context).options)
	})
	afterAll(async () => {
		await database?.pool.end()
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
			await admin.end()
		}
	})
	async function account() {
		const id = randomUUID()
		await database.pool.query(
			'INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',
			[id, `${id}@example.test`]
		)
		return id
	}
	async function setupSession(userId: string, token: string) {
		return adapter.create<Record<string, unknown>, { id: string }>({
			model: 'session',
			data: {
				userId,
				token: randomUUID(),
				setupTokenHash: sha256Hex(token),
				expiresAt: new Date(Date.now() + 1800_000),
				createdAt: new Date(),
				updatedAt: new Date()
			}
		})
	}
	async function enroll(userId: string, sessionId: string) {
		return enrollmentContext.run({ registration: { userId, sessionId, prfEnabled: false } }, () =>
			adapter.create({
				model: 'passkey',
				data: {
					userId,
					credentialID: randomUUID(),
					publicKey: 'test-fixture-only',
					counter: 0,
					deviceType: 'singleDevice',
					backedUp: false,
					createdAt: new Date()
				}
			})
		)
	}
	test('one reusable link establishes two sessions; concurrent first enrollment has exactly one winner', async () => {
		const userId = await account()
		await database.pool.query('UPDATE "user" SET notification_channel=$1 WHERE id=$2', [
			'http://checkout:3000',
			userId
		])
		const token = (await passkeys.issueSetupLink(userId))!
		expect(await passkeys.verifySetupLink(token)).toMatchObject({ userId })
		const first = await setupSession(userId, token)
		expect(await passkeys.verifySetupLink(token)).toMatchObject({ userId })
		const second = await setupSession(userId, token)
		const results = await Promise.allSettled([enroll(userId, first.id), enroll(userId, second.id)])
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(await passkeys.list(userId)).toHaveLength(1)
		expect(await passkeys.verifySetupLink(token)).toBeNull()
		expect(
			(await database.pool.query('SELECT 1 FROM session WHERE user_id=$1', [userId])).rows
		).toHaveLength(0)
		await expect(setupSession(userId, token)).rejects.toThrow('Setup link is unavailable')
		const notices = await database.pool.query(
			'SELECT kind FROM identity_security_mail WHERE user_id=$1 ORDER BY kind',
			[userId]
		)
		expect(notices.rows.map((row) => row.kind)).toEqual(['first-passkey', 'setup-used'])
	})
	test('replacement is atomic, encrypted at rest and delivered idempotently through the fixed relay', async () => {
		const userId = await account()
		const secret = 'identity-security-test-secret-32-bytes'
		const channel = 'http://replacement-checkout:3000'
		const config = identityConfigSchema.parse({
			DATABASE_URL: adminUrl,
			BETTER_AUTH_SECRET: secret,
			IDENTITY_PROVISIONING_SECRETS: 'identity-security-test-provisioning-32-bytes',
			IDENTITY_MAIL_ORIGINS: channel
		})
		const old = (await passkeys.issueSetupLink(userId))!
		const delivery = { origins: [channel], encryptionSecret: secret }
		await expect(passkeys.issueSetupLink(userId, delivery)).rejects.toThrow(
			'Security mail is unavailable'
		)
		expect(await passkeys.verifySetupLink(old)).not.toBeNull()
		await database.pool.query('UPDATE "user" SET notification_channel=$1 WHERE id=$2', [
			channel,
			userId
		])
		await expect(passkeys.issueSetupLink(userId, delivery)).rejects.toThrow('one minute')
		await database.pool.query(
			"UPDATE setup_links SET created_at=now()-interval '2 minutes' WHERE user_id=$1",
			[userId]
		)
		const token = (await passkeys.issueSetupLink(userId, delivery))!
		expect(await passkeys.verifySetupLink(old)).toBeNull()
		const event = (
			await database.pool.query('SELECT * FROM identity_security_mail WHERE user_id=$1', [userId])
		).rows[0]
		expect(JSON.stringify(event)).not.toContain(token)
		expect(decryptSetupToken(event.token_ciphertext, secret)).toBe(token)
		expect(() => decryptSetupToken(encryptSetupToken(token, secret), 'different-secret')).toThrow()
		const delivered: Array<{ id: string; setupToken?: string }> = []
		const mailer = new IdentitySecurityMailer(database.pool, config, (async (url, init) => {
			expect(String(url)).toBe(`${channel}/internal/v1/identity-mail`)
			delivered.push(JSON.parse(String(init?.body)))
			return new Response(null, { status: 202 })
		}) as typeof fetch)
		await mailer.deliver()
		expect(delivered).toEqual([expect.objectContaining({ id: event.id, setupToken: token })])
		await mailer.deliver()
		expect(delivered).toHaveLength(1)
		expect(
			(
				await database.pool.query(
					'SELECT token_ciphertext FROM identity_security_mail WHERE id=$1',
					[event.id]
				)
			).rows[0].token_ciphertext
		).toBeNull()
	})
	test('replacement revokes old sessions and tokens, with seven-day expiry', async () => {
		const userId = await account()
		const first = (await passkeys.issueSetupLink(userId))!
		await setupSession(userId, first)
		const second = (await passkeys.issueSetupLink(userId))!
		expect(await passkeys.verifySetupLink(first)).toBeNull()
		expect(await passkeys.verifySetupLink(second)).toMatchObject({ userId })
		expect(
			(await database.pool.query('SELECT 1 FROM session WHERE user_id=$1', [userId])).rows
		).toHaveLength(0)
		const expiry = await database.pool.query(
			'SELECT extract(epoch FROM expires_at-created_at)::int AS ttl FROM setup_links WHERE user_id=$1',
			[userId]
		)
		expect(expiry.rows[0].ttl).toBe(604800)
		await database.pool.query('UPDATE setup_links SET expires_at=now() WHERE user_id=$1', [userId])
		expect(await passkeys.verifySetupLink(second)).toBeNull()
		await expect(setupSession(userId, second)).rejects.toThrow('Setup link is unavailable')
	})
	test('ordinary passkey sessions can add further credentials without reviving bootstrap access', async () => {
		const userId = await account()
		const token = (await passkeys.issueSetupLink(userId))!
		const bootstrap = await setupSession(userId, token)
		await enroll(userId, bootstrap.id)
		const session = await adapter.create<Record<string, unknown>, { id: string }>({
			model: 'session',
			data: {
				userId,
				token: randomUUID(),
				expiresAt: new Date(Date.now() + 1800_000),
				createdAt: new Date(),
				updatedAt: new Date()
			}
		})
		await enroll(userId, session.id)
		expect(await passkeys.list(userId)).toHaveLength(2)
		expect(await passkeys.issueSetupLink(userId)).toBeNull()
	})
	test('cleanup deletes one bounded batch without removing unexpired replay markers', async () => {
		const service = new ProofOfWorkService(
			database.pool,
			8,
			300,
			'identity-security-test-secret-32-bytes'
		)
		await database.pool.query(
			'INSERT INTO proof_of_work_redemptions SELECT i::text, 0 FROM generate_series(1,2001) AS i'
		)
		await database.pool.query('INSERT INTO proof_of_work_redemptions VALUES($1,$2)', [
			'live',
			Date.now() + 300_000
		])
		expect(await service.cleanup()).toBe(1000)
		expect(
			(await database.pool.query('SELECT count(*)::int AS n FROM proof_of_work_redemptions'))
				.rows[0].n
		).toBe(1002)
		expect(
			(await database.pool.query('SELECT 1 FROM proof_of_work_redemptions WHERE id=$1', ['live']))
				.rows
		).toHaveLength(1)
	})
})
