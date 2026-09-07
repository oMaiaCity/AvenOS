import type pg from 'pg'
import { withTransaction } from './db.js'
import { SETUP_LINK_SECONDS } from './enrollment.js'
import { encryptSetupToken } from './security-mail.js'
import { isToken, randomToken, sha256Hex } from './tokens.js'

export interface PasskeySummary {
	id: string
	name: string | null
	device_type: string
	backed_up: boolean
	prf_enabled: boolean
	created_at: Date
}

export class PasskeyService {
	constructor(
		private readonly pool: pg.Pool,
		private readonly requirePrf: boolean
	) {}

	async list(userId: string): Promise<PasskeySummary[]> {
		return (
			await this.pool.query<PasskeySummary>(
				'SELECT id,name,device_type,backed_up,prf_enabled,created_at FROM passkey WHERE user_id=$1 ORDER BY created_at ASC',
				[userId]
			)
		).rows
	}

	async issueSetupLink(
		userId: string,
		delivery?: { origins: string[]; encryptionSecret: string }
	): Promise<string | null> {
		return withTransaction(this.pool, async (client) => {
			await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [userId])
			if (
				(await client.query('SELECT 1 FROM passkey WHERE user_id=$1 LIMIT 1', [userId])).rows.length
			)
				return null
			let channel: string | undefined
			if (delivery) {
				channel = (
					await client.query<{ notification_channel: string }>(
						'SELECT notification_channel FROM "user" WHERE id=$1',
						[userId]
					)
				).rows[0]?.notification_channel
				if (!channel || !delivery.origins.includes(channel))
					throw new Error('Security mail is unavailable.')
				if (
					(
						await client.query(
							"SELECT 1 FROM setup_links WHERE user_id=$1 AND created_at > now()-interval '60 seconds'",
							[userId]
						)
					).rows.length
				)
					throw new Error('Please wait one minute before requesting another link.')
			}
			const token = randomToken()
			await client.query(
				`INSERT INTO setup_links(user_id,token_hash,created_at,expires_at) VALUES($1,$2,now(),now()+$3*interval '1 second')
				 ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=now(),expires_at=EXCLUDED.expires_at,last_used_at=NULL`,
				[userId, sha256Hex(token), SETUP_LINK_SECONDS]
			)
			await client.query('DELETE FROM session WHERE user_id=$1 AND setup_token_hash IS NOT NULL', [
				userId
			])
			if (delivery) {
				const id = crypto.randomUUID()
				await client.query(
					`INSERT INTO identity_security_mail(id,user_id,channel,kind,token_ciphertext,dedupe_key)
				 VALUES($1::uuid,$2,$3,'setup-replaced',$4,$1::text)`,
					[id, userId, channel, encryptSetupToken(token, delivery.encryptionSecret)]
				)
			}
			return token
		})
	}

	async verifySetupLink(token: string): Promise<{ userId: string; tokenHash: string } | null> {
		if (!isToken(token)) return null
		return withTransaction(this.pool, async (client) => {
			const row = (
				await client.query<{ user_id: string }>(
					'SELECT user_id FROM setup_links WHERE token_hash=$1 AND expires_at > now()',
					[sha256Hex(token)]
				)
			).rows[0]
			if (!row) return null
			const active = await client.query('SELECT 1 FROM "user" WHERE id=$1', [row.user_id])
			if (!active.rows[0]) return null
			await client.query('UPDATE setup_links SET last_used_at=now() WHERE user_id=$1', [
				row.user_id
			])
			return { userId: row.user_id, tokenHash: sha256Hex(token) }
		})
	}

	async finalize(
		userId: string,
		credentialId: string | undefined,
		prfEnabled: boolean
	): Promise<void> {
		await withTransaction(this.pool, async (client) => {
			const registered = credentialId
				? await client.query<{ id: string }>(
						'SELECT id FROM passkey WHERE user_id=$1 AND credential_id=$2',
						[userId, credentialId]
					)
				: await client.query<{ id: string }>(
						'SELECT id FROM passkey WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
						[userId]
					)
			const passkey = registered.rows[0]
			if (!passkey) throw new Error('Registered passkey not found.')
			if (this.requirePrf && !prfEnabled) throw new Error('Passkey PRF support is required.')
			await client.query('UPDATE passkey SET prf_enabled=$1 WHERE id=$2', [prfEnabled, passkey.id])
			// Setup links are bootstrap credentials. A normal authenticated session can
			// add as many additional passkeys as the account holder needs.
			await client.query('DELETE FROM setup_links WHERE user_id=$1', [userId])
		})
	}
}
