import { randomUUID } from 'node:crypto'
import type { Queryable } from './db.js'

export interface AuditInput {
	eventType: string
	actorUserId?: string | null
	targetUserId?: string | null
	emailQueueId?: string | null
	metadata?: Record<string, unknown>
}

export async function writeAudit(connection: Queryable, input: AuditInput): Promise<string> {
	const id = randomUUID()
	await connection.query(
		`INSERT INTO audit_events (id,event_type,actor_user_id,target_user_id,email_queue_id,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		[
			id,
			input.eventType,
			input.actorUserId ?? null,
			input.targetUserId ?? null,
			input.emailQueueId ?? null,
			JSON.stringify(input.metadata ?? {}),
			new Date()
		]
	)
	return id
}
