import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { type DatabaseContext, withTransaction } from './db.js'
import { schema } from './schema.js'
import { queueSecurityNotice } from './security-mail.js'

export const SETUP_SESSION_SECONDS = 1800
export const SETUP_LINK_SECONDS = 7 * 86400
export function registrationPrfEnabled(extensions: unknown): boolean {
	return Boolean(
		extensions &&
			typeof extensions === 'object' &&
			'prf' in extensions &&
			extensions.prf &&
			typeof extensions.prf === 'object' &&
			'enabled' in extensions.prf &&
			extensions.prf.enabled === true
	)
}
type Registration = { sessionId: string; userId: string; prfEnabled: boolean }
export const enrollmentContext = new AsyncLocalStorage<{ registration?: Registration }>()

export const setupAllowedPaths = new Set([
	'/api/auth/get-session',
	'/api/auth/sign-out',
	'/api/auth/passkey/generate-register-options',
	'/api/auth/passkey/verify-registration',
	'/api/passkeys',
	'/api/setup/resend'
])

// Keep the library's WebAuthn verifier and adapter. Only bootstrap-related writes need
// our account lock and atomic revocation; no second authentication implementation.
export function enrollmentAdapter(database: DatabaseContext) {
	const factory = drizzleAdapter(database.db, { provider: 'pg', schema })
	return ((options) => {
		const adapter = factory(options)
		const create: typeof adapter.create = async <T extends Record<string, unknown>, R = T>(input: {
			model: string
			data: Omit<T, 'id'>
			select?: string[]
			forceAllowId?: boolean
		}): Promise<R> => {
			const setupHash = input.model === 'session' ? input.data.setupTokenHash : undefined
			if (input.model !== 'passkey' && !setupHash) return adapter.create<T, R>(input)
			const registration = enrollmentContext.getStore()?.registration
			const userId = input.data.userId
			if (typeof userId !== 'string') throw new Error('Enrollment account is required')
			return withTransaction(database.pool, async (client) => {
				await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [userId])
				let bootstrap = false
				if (input.model === 'passkey') {
					if (!registration || registration.userId !== userId)
						throw new Error('Verified enrollment context is required')
					const session = (
						await client.query<{ setup_token_hash: string | null }>(
							'SELECT setup_token_hash FROM session WHERE id=$1 AND user_id=$2 AND expires_at > now()',
							[registration.sessionId, userId]
						)
					).rows[0]
					if (!session) throw new Error('Enrollment session is unavailable')
					bootstrap = Boolean(session.setup_token_hash)
					if (bootstrap) {
						const pending = await client.query(
							'SELECT 1 FROM setup_links WHERE user_id=$1 AND token_hash=$2 AND expires_at > now()',
							[userId, session.setup_token_hash]
						)
						if (!pending.rows.length) throw new Error('Setup link is unavailable')
					}
				} else {
					const pending = await client.query(
						'SELECT 1 FROM setup_links WHERE user_id=$1 AND token_hash=$2 AND expires_at > now()',
						[userId, setupHash]
					)
					if (!pending.rows.length) throw new Error('Setup link is unavailable')
				}
				const transactionAdapter = drizzleAdapter(drizzle(client, { schema }), {
					provider: 'pg',
					schema
				})(options)
				const result = await transactionAdapter.create<T, R>(input)
				if (input.model === 'session') await queueSecurityNotice(client, userId, 'setup-used')
				if (input.model === 'passkey') {
					if (bootstrap) await queueSecurityNotice(client, userId, 'first-passkey')
					await client.query(
						'UPDATE passkey SET prf_enabled=$1 WHERE user_id=$2 AND credential_id=$3',
						[registration?.prfEnabled ?? false, userId, input.data.credentialID]
					)
					await client.query('DELETE FROM setup_links WHERE user_id=$1', [userId])
					await client.query(
						'DELETE FROM session WHERE user_id=$1 AND setup_token_hash IS NOT NULL',
						[userId]
					)
				}
				return result
			})
		}
		return { ...adapter, create }
	}) satisfies typeof factory
}
