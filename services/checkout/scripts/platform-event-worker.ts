import { randomUUID } from 'node:crypto'
import pg from 'pg'
import pino from 'pino'
import { loadPlatformEventWorkerConfig } from '../src/lib/server/config.js'

const config = loadPlatformEventWorkerConfig()
const logger = pino({
	level: config.LOG_LEVEL,
	redact: ['authorization', 'token', 'password', 'secret']
})
const pool = new pg.Pool({ connectionString: config.PLATFORM_EVENT_WORKER_DATABASE_URL, max: 2 })
pool.on('error', (error) => logger.error({ err: error }, 'platform event database error'))
const instanceId = randomUUID()
let stopped = false

interface EventRow {
	id: string
	event_type: 'purchase_granted' | 'purchase_revoked'
	subject_id: string
	purchased_name: string
	occurred_at: Date
	attempts: number
}

async function claim(): Promise<EventRow | null> {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const row = (
			await client.query<EventRow>(
				`SELECT id,event_type,subject_id,purchased_name,occurred_at,attempts
				 FROM platform_event_outbox
				 WHERE (status='pending' AND available_at<=now())
				    OR (status='sending' AND lease_expires_at<now())
				 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`
			)
		).rows[0]
		if (!row) {
			await client.query('COMMIT')
			return null
		}
		await client.query(
			`UPDATE platform_event_outbox SET status='sending',attempts=attempts+1,
			 lease_owner=$2,lease_expires_at=now()+make_interval(secs=>$3),updated_at=now()
			 WHERE id=$1`,
			[row.id, instanceId, config.PLATFORM_EVENT_WORKER_LEASE_SECONDS]
		)
		await client.query('COMMIT')
		return row
	} catch (error) {
		await client.query('ROLLBACK').catch(() => {})
		throw error
	} finally {
		client.release()
	}
}

async function deliver(row: EventRow): Promise<void> {
	try {
		const response = await fetch(
			new URL('/internal/v1/customer-entitlement-events', config.PLATFORM_API_INTERNAL_URL),
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${config.PLATFORM_EVENT_TOKEN}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					eventId: row.id,
					eventType: row.event_type,
					subjectId: row.subject_id,
					purchasedName: row.purchased_name,
					occurredAt: row.occurred_at.toISOString()
				}),
				signal: AbortSignal.timeout(10_000)
			}
		)
		if (!response.ok) throw new Error(`platform API returned ${response.status}`)
		await pool.query(
			`UPDATE platform_event_outbox SET status='delivered',delivered_at=now(),
			 lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now()
			 WHERE id=$1 AND lease_owner=$2`,
			[row.id, instanceId]
		)
		logger.info({ eventId: row.id, eventType: row.event_type }, 'platform event delivered')
	} catch (error) {
		const nextAttempts = row.attempts + 1
		const dead = nextAttempts >= config.PLATFORM_EVENT_WORKER_MAX_ATTEMPTS
		const delay = Math.min(2 ** Math.min(nextAttempts, 10), 900)
		await pool.query(
			`UPDATE platform_event_outbox SET status=$3,available_at=now()+make_interval(secs=>$4),
			 lease_owner=NULL,lease_expires_at=NULL,last_error=$5,updated_at=now()
			 WHERE id=$1 AND lease_owner=$2`,
			[row.id, instanceId, dead ? 'dead' : 'pending', delay, String(error).slice(0, 1000)]
		)
		logger[dead ? 'error' : 'warn']({ eventId: row.id, err: error }, 'platform event failed')
	}
}

async function main() {
	logger.info({ instanceId }, 'platform event worker started')
	while (!stopped) {
		const row = await claim()
		if (row) await deliver(row)
		else await Bun.sleep(config.PLATFORM_EVENT_WORKER_POLL_INTERVAL_MS)
	}
}

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		stopped = true
	})

try {
	await main()
} finally {
	await pool.end()
}
