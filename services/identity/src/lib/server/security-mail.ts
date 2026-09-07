import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	randomUUID
} from 'node:crypto'
import { securityMailToken } from '@avenos/aven-identity/security-mail'
import type pg from 'pg'
import type { IdentityConfig } from './config.js'

type Connection = Pick<pg.PoolClient, 'query'>
export async function queueSecurityNotice(
	client: Connection,
	userId: string,
	kind: 'setup-used' | 'first-passkey'
) {
	// Reopening a reusable link may create sessions on several devices. Coalesce use
	// notices per hour so that replay does not turn into an unbounded email sender.
	const key = `${kind}:${userId}${kind === 'setup-used' ? `:${Math.floor(Date.now() / 3600_000)}` : ''}`
	await client.query(
		`INSERT INTO identity_security_mail(id,user_id,channel,kind,dedupe_key)
	 SELECT $1,id,notification_channel,$3,$4 FROM "user" WHERE id=$2 AND notification_channel IS NOT NULL
	 ON CONFLICT(dedupe_key) DO NOTHING`,
		[randomUUID(), userId, kind, key]
	)
}
function encryptionKey(secret: string) {
	return createHmac('sha256', secret).update('aven.identity.mail-at-rest.v1').digest()
}
export function encryptSetupToken(token: string, secret: string): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
	return Buffer.concat([iv, cipher.update(token), cipher.final(), cipher.getAuthTag()]).toString(
		'base64url'
	)
}
export function decryptSetupToken(value: string, secret: string): string {
	const bytes = Buffer.from(value, 'base64url')
	const cipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), bytes.subarray(0, 12))
	cipher.setAuthTag(bytes.subarray(-16))
	return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString()
}

export class IdentitySecurityMailer {
	private timer?: ReturnType<typeof setInterval>
	private busy = false
	constructor(
		private pool: pg.Pool,
		private config: IdentityConfig,
		private fetcher: typeof fetch = fetch
	) {}
	start() {
		void this.deliver()
		this.timer = setInterval(() => void this.deliver(), 5000)
		this.timer.unref()
	}
	stop() {
		clearInterval(this.timer)
	}
	async deliver() {
		if (this.busy) return
		this.busy = true
		try {
			// Persist the retry lease before network work. Two processes can safely overlap;
			// checkout's durable idempotency key covers a crash after delivery, before ack.
			const rows = await this.pool.query<{
				id: string
				email: string
				kind: string
				channel: string
				token_ciphertext: string | null
				attempts: number
			}>(`
			 WITH selected AS (SELECT id FROM identity_security_mail WHERE delivered_at IS NULL AND NOT dead
			 AND available_at <= now() ORDER BY available_at LIMIT 10 FOR UPDATE SKIP LOCKED),
			 claimed AS (UPDATE identity_security_mail m SET attempts=attempts+1,available_at=now()+interval '2 minutes'
			 FROM selected WHERE m.id=selected.id RETURNING m.*)
			 SELECT c.*,u.email FROM claimed c JOIN "user" u ON u.id=c.user_id`)
			for (const row of rows.rows) {
				try {
					const index = this.config.IDENTITY_MAIL_ORIGINS.indexOf(row.channel)
					const relaySecret = this.config.IDENTITY_PROVISIONING_SECRETS[index]
					if (index < 0 || !relaySecret) throw new Error('Mail channel unavailable')
					const setupToken = row.token_ciphertext
						? decryptSetupToken(row.token_ciphertext, this.config.BETTER_AUTH_SECRET)
						: undefined
					if (
						setupToken &&
						!(
							await this.pool.query(
								'SELECT 1 FROM setup_links WHERE token_hash=$1 AND expires_at > now()',
								[createHash('sha256').update(setupToken).digest('hex')]
							)
						).rows.length
					) {
						// Do not send a superseded/expired credential after a provider outage.
						await this.pool.query('DELETE FROM identity_security_mail WHERE id=$1', [row.id])
						continue
					}
					const response = await this.fetcher(new URL('/internal/v1/identity-mail', row.channel), {
						method: 'POST',
						redirect: 'error',
						signal: AbortSignal.timeout(10_000),
						headers: {
							authorization: `Bearer ${securityMailToken(relaySecret)}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify({
							id: row.id,
							email: row.email,
							kind: row.kind,
							...(setupToken ? { setupToken } : {})
						})
					})
					await response.body?.cancel()
					if (!response.ok) throw new Error('Mail relay unavailable')
					await this.pool.query(
						'UPDATE identity_security_mail SET delivered_at=now(),token_ciphertext=NULL WHERE id=$1',
						[row.id]
					)
				} catch {
					// No provider text, recipient, ciphertext or bearer credential enters logs.
					await this.pool.query(
						`UPDATE identity_security_mail SET dead=($2>=32),
					 available_at=now()+least(3600,30*power(2,least($2,7)))*interval '1 second' WHERE id=$1`,
						[row.id, row.attempts]
					)
				}
			}
			await this.pool.query(`DELETE FROM identity_security_mail WHERE id IN (SELECT id FROM identity_security_mail
			 WHERE delivered_at < now()-interval '7 days' OR created_at < now()-interval '30 days' LIMIT 1000)`)
		} catch {
			console.error('identity.security_mail_worker_failed')
		} finally {
			this.busy = false
		}
	}
}
