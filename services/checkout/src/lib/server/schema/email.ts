// Email-outbox module. The API may only insert;
// the email worker role owns claiming, sending, and terminal states.
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const emailQueue = pgTable(
	'email_queue',
	{
		id: text('id').primaryKey(),
		templateKey: text('template_key').notNull(),
		toAddress: text('to_address').notNull(),
		payloadEncrypted: text('payload_encrypted'),
		status: text('status').notNull(),
		priority: integer('priority').notNull(),
		attempts: integer('attempts').notNull(),
		maxAttempts: integer('max_attempts').notNull(),
		availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
		leaseOwner: text('lease_owner'),
		leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
		idempotencyKey: text('idempotency_key').unique(),
		lastErrorCode: text('last_error_code'),
		lastErrorMessage: text('last_error_message'),
		smtpMessageId: text('smtp_message_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
		sentAt: timestamp('sent_at', { withTimezone: true }),
		deadAt: timestamp('dead_at', { withTimezone: true })
	},
	(t) => [
		index('email_queue_claim_idx').on(t.status, t.availableAt, t.priority),
		index('email_queue_created_idx').on(t.createdAt),
		index('email_queue_to_idx').on(t.toAddress),
		index('email_queue_template_idx').on(t.templateKey)
	]
)
