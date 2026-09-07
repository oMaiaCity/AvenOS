// Producer side of the email-outbox boundary: the only write other modules
// may perform on email_queue is this INSERT (enforced by grants.sql).
import { randomUUID } from 'node:crypto'
import { encryptPayload } from '../crypto.js'
import type { Queryable } from '../db.js'
import type { SystemEmailTemplate, TemplateData } from './templates.js'

export interface QueueSettings {
	key: Buffer
	maxAttempts: number
}
export interface EnqueueSystemEmailInput<T extends SystemEmailTemplate = SystemEmailTemplate> {
	template: T
	to: string
	data: TemplateData<T>
	idempotencyKey?: string
	priority?: number
	availableAt?: Date
}

export async function enqueueSystemEmail<T extends SystemEmailTemplate>(
	settings: QueueSettings,
	connection: Queryable,
	input: EnqueueSystemEmailInput<T>
): Promise<string> {
	const id = randomUUID()
	const now = new Date()
	await connection.query(
		`INSERT INTO email_queue (id, template_key, to_address, payload_encrypted, status, priority, attempts, max_attempts, available_at, idempotency_key, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'queued',$5,0,$6,$7,$8,$9,$9) ON CONFLICT (idempotency_key) DO NOTHING`,
		[
			id,
			input.template,
			input.to,
			encryptPayload(input.data, settings.key),
			input.priority ?? 0,
			settings.maxAttempts,
			input.availableAt ?? now,
			input.idempotencyKey ?? null,
			now
		]
	)
	return id
}
