// Consumer side of the email-outbox boundary. Runs on its own connection pool
// with the email-worker role; it never touches auth or domain tables.
import { randomUUID } from 'node:crypto'
import nodemailer, { type Transporter } from 'nodemailer'
import type pg from 'pg'
import type pino from 'pino'
import { sanitizeError } from '../../validation.js'
import type { EmailWorkerConfig } from '../config.js'
import { decryptPayload } from '../crypto.js'
import { withTransaction } from '../db.js'
import { renderEmail, type SystemEmailTemplate, type TemplateDataMap } from './templates.js'

export interface ClaimedEmail {
	id: string
	template_key: string
	to_address: string
	payload_encrypted: string
	attempts: number
	max_attempts: number
}

export async function recoverExpiredLeases(pool: pg.Pool): Promise<number> {
	const now = new Date()
	const result = await pool.query(
		"UPDATE email_queue SET status='retry_wait',lease_owner=NULL,lease_expires_at=NULL,available_at=$1,updated_at=$1 WHERE status='sending' AND lease_expires_at < $1",
		[now]
	)
	return result.rowCount ?? 0
}

export async function claimEmails(
	pool: pg.Pool,
	owner: string,
	batchSize: number,
	leaseSeconds: number
): Promise<ClaimedEmail[]> {
	return withTransaction(pool, async (client) => {
		const now = new Date()
		const rows = (
			await client.query<ClaimedEmail>(
				`SELECT id,template_key,to_address,payload_encrypted,attempts,max_attempts FROM email_queue
       WHERE status IN ('queued','retry_wait') AND available_at <= $1 AND (lease_expires_at IS NULL OR lease_expires_at < $1) AND payload_encrypted IS NOT NULL
       ORDER BY priority DESC, created_at ASC LIMIT $2 FOR UPDATE SKIP LOCKED`,
				[now, batchSize]
			)
		).rows
		const lease = new Date(now.getTime() + leaseSeconds * 1000)
		for (const row of rows) {
			await client.query(
				"UPDATE email_queue SET status='sending',lease_owner=$1,lease_expires_at=$2,attempts=attempts+1,updated_at=$3 WHERE id=$4",
				[owner, lease, now, row.id]
			)
			row.attempts += 1
		}
		return rows
	})
}

export type SmtpFailureKind = 'retry' | 'dead'
export interface SmtpEndpoint {
	protocol: 'smtp' | 'smtps'
	host: string
	port: number
	secure: boolean
}

export function describeSmtpEndpoint(value: string): SmtpEndpoint {
	const url = new URL(value)
	if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:')
		throw new Error('SMTP_URL must use smtp:// or smtps://.')
	const secure = url.protocol === 'smtps:'
	return {
		protocol: secure ? 'smtps' : 'smtp',
		host: url.hostname,
		port: url.port ? Number(url.port) : secure ? 465 : 587,
		secure
	}
}

export function retryDelaySeconds(
	attempt: number,
	base: number,
	maximum: number,
	random = Math.random
): number {
	const delay = Math.min(base * 2 ** Math.max(0, attempt - 1), maximum)
	return delay + Math.floor(random() * Math.min(delay * 0.25, 60))
}
export function classifySmtpFailure(error: unknown): SmtpFailureKind {
	const value = error as { responseCode?: number; code?: string }
	if (value.responseCode && value.responseCode >= 500) return 'dead'
	if (value.responseCode && value.responseCode >= 400) return 'retry'
	return ['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ESOCKET', 'ETLS'].includes(value.code ?? '')
		? 'retry'
		: 'dead'
}

export function createTransport(config: Pick<EmailWorkerConfig, 'SMTP_URL'>): Transporter {
	return nodemailer.createTransport(config.SMTP_URL as never, { pool: true, maxConnections: 2 })
}

export class EmailWorker {
	private owner = randomUUID()
	private timer?: NodeJS.Timeout
	private heartbeatTimer?: NodeJS.Timeout
	private active = false
	private started = new Date()
	private smtpVerifiedAt = 0
	private smtpTimer?: NodeJS.Timeout
	constructor(
		private pool: pg.Pool,
		private config: EmailWorkerConfig,
		private key: Buffer,
		private transport: Transporter,
		private logger: pino.Logger
	) {}

	start() {
		const smtp = describeSmtpEndpoint(this.config.SMTP_URL)
		this.logger.info(
			{
				instanceId: this.owner,
				applicationVersion: this.config.APPLICATION_VERSION,
				pollIntervalMs: this.config.EMAIL_WORKER_POLL_INTERVAL_MS,
				batchSize: this.config.EMAIL_WORKER_BATCH_SIZE,
				leaseSeconds: this.config.EMAIL_WORKER_LEASE_SECONDS,
				smtp
			},
			'email worker started'
		)
		void recoverExpiredLeases(this.pool)
			.then((count) => {
				if (count > 0) this.logger.warn({ count }, 'expired email leases recovered')
				else this.logger.debug('no expired email leases found')
			})
			.catch((error) => {
				this.logger.error({ err: sanitizeError(error) }, 'email lease recovery failed')
			})
		void this.verifyTransport(smtp)
		this.smtpTimer = setInterval(() => void this.verifyTransport(smtp), 300_000)
		this.smtpTimer.unref()
		void this.heartbeat()
		this.timer = setInterval(() => {
			void this.tick()
		}, this.config.EMAIL_WORKER_POLL_INTERVAL_MS)
		this.heartbeatTimer = setInterval(
			() => void this.heartbeat(),
			this.config.EMAIL_WORKER_HEARTBEAT_SECONDS * 1000
		)
		this.timer.unref()
		this.heartbeatTimer.unref()
		void this.tick()
	}

	stop() {
		if (this.smtpTimer) clearInterval(this.smtpTimer)
		if (this.timer) clearInterval(this.timer)
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
		this.transport.close()
		this.logger.info({ instanceId: this.owner }, 'email worker stopped')
	}

	private async verifyTransport(smtp: SmtpEndpoint) {
		const started = Date.now()
		try {
			await this.transport.verify()
			this.smtpVerifiedAt = Date.now()
			this.logger.info({ smtp, durationMs: Date.now() - started }, 'SMTP connection verified')
		} catch (error) {
			this.smtpVerifiedAt = 0
			this.logger.warn(
				{ smtp, err: sanitizeError(error), durationMs: Date.now() - started },
				'SMTP connection verification failed'
			)
		}
	}

	async heartbeat() {
		try {
			await this.pool.query(
				`INSERT INTO worker_heartbeats(worker_name,instance_id,version,started_at,last_heartbeat_at,metadata) VALUES('email-worker',$1,$2,$3,$4,$5)
         ON CONFLICT(worker_name) DO UPDATE SET instance_id=EXCLUDED.instance_id,version=EXCLUDED.version,last_heartbeat_at=EXCLUDED.last_heartbeat_at,metadata=EXCLUDED.metadata`,
				[
					this.owner,
					this.config.APPLICATION_VERSION,
					this.started,
					new Date(),
					JSON.stringify({
						batchSize: this.config.EMAIL_WORKER_BATCH_SIZE,
						smtpVerifiedAt: this.smtpVerifiedAt
					})
				]
			)
		} catch (error) {
			this.logger.warn({ err: sanitizeError(error) }, 'email worker heartbeat failed')
		}
	}

	async tick() {
		if (this.active) return
		this.active = true
		try {
			const messages = await claimEmails(
				this.pool,
				this.owner,
				this.config.EMAIL_WORKER_BATCH_SIZE,
				this.config.EMAIL_WORKER_LEASE_SECONDS
			)
			if (messages.length > 0)
				this.logger.info(
					{ count: messages.length, emailQueueIds: messages.map((message) => message.id) },
					'email batch claimed'
				)
			await Promise.all(messages.map((message) => this.deliver(message)))
		} catch (error) {
			this.logger.error({ err: sanitizeError(error) }, 'email worker tick failed')
		} finally {
			this.active = false
		}
	}

	private async deliver(row: ClaimedEmail) {
		const started = Date.now()
		const context = {
			emailQueueId: row.id,
			templateKey: row.template_key,
			attempt: row.attempts,
			maxAttempts: row.max_attempts
		}
		this.logger.info(context, 'email delivery started')
		try {
			const data = decryptPayload<TemplateDataMap[SystemEmailTemplate]>(
				row.payload_encrypted,
				this.key
			)
			const rendered = renderEmail(row.template_key as SystemEmailTemplate, data as never)
			const info = await this.transport.sendMail({
				from: this.config.SMTP_FROM,
				replyTo: this.config.SMTP_REPLY_TO || undefined,
				to: row.to_address,
				subject: rendered.subject,
				text: rendered.text,
				html: rendered.html,
				headers: { 'X-Aven-Queue-ID': row.id }
			})
			const now = new Date()
			const updated = await this.pool.query(
				"UPDATE email_queue SET status='sent',payload_encrypted=NULL,smtp_message_id=$1,sent_at=$2,updated_at=$2,lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,last_error_message=NULL WHERE id=$3 AND lease_owner=$4",
				[info.messageId ?? null, now, row.id, this.owner]
			)
			if (updated.rowCount !== 1) {
				this.logger.error(
					{ ...context, durationMs: Date.now() - started },
					'email sent but queue lease was lost'
				)
				return
			}
			this.logger.info({ ...context, durationMs: Date.now() - started }, 'email sent')
		} catch (error) {
			await this.failure(row, error, started)
		}
	}

	private async failure(row: ClaimedEmail, error: unknown, started: number) {
		const kind = classifySmtpFailure(error)
		const exhausted = row.attempts >= row.max_attempts
		const now = new Date()
		const message = sanitizeError(error)
		const context = {
			emailQueueId: row.id,
			templateKey: row.template_key,
			attempt: row.attempts,
			maxAttempts: row.max_attempts,
			kind,
			exhausted,
			err: message,
			durationMs: Date.now() - started
		}
		if (kind === 'dead' || exhausted) {
			const errorCode = kind === 'dead' ? 'EMAIL_PERMANENT_FAILURE' : 'EMAIL_ATTEMPTS_EXHAUSTED'
			const updated = await this.pool.query(
				"UPDATE email_queue SET status='dead',dead_at=$1,updated_at=$1,lease_owner=NULL,lease_expires_at=NULL,last_error_code=$2,last_error_message=$3 WHERE id=$4 AND lease_owner=$5",
				[now, errorCode, message, row.id, this.owner]
			)
			if (updated.rowCount !== 1) {
				this.logger.error(context, 'email failure state discarded because queue lease was lost')
				return
			}
			this.logger.error({ ...context, errorCode }, 'email delivery abandoned')
		} else {
			const seconds = retryDelaySeconds(
				row.attempts,
				this.config.EMAIL_RETRY_BASE_SECONDS,
				this.config.EMAIL_RETRY_MAX_SECONDS
			)
			const nextAttemptAt = new Date(now.getTime() + seconds * 1000)
			const updated = await this.pool.query(
				"UPDATE email_queue SET status='retry_wait',available_at=$1,updated_at=$2,lease_owner=NULL,lease_expires_at=NULL,last_error_code='EMAIL_TRANSIENT_FAILURE',last_error_message=$3 WHERE id=$4 AND lease_owner=$5",
				[nextAttemptAt, now, message, row.id, this.owner]
			)
			if (updated.rowCount !== 1) {
				this.logger.error(context, 'email retry state discarded because queue lease was lost')
				return
			}
			this.logger.warn(
				{
					...context,
					errorCode: 'EMAIL_TRANSIENT_FAILURE',
					retryInSeconds: seconds,
					nextAttemptAt
				},
				'email delivery retry scheduled'
			)
		}
	}
}
