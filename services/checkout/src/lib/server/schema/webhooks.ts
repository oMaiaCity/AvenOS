import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const polarWebhookDeliveries = pgTable(
	'polar_webhook_deliveries',
	{
		deliveryId: text('delivery_id').primaryKey(),
		eventId: text('event_id'),
		eventType: text('event_type').notNull(),
		payload: jsonb('payload').notNull(),
		headers: jsonb('headers').notNull(),
		state: text('state').notNull().default('processing'),
		attemptCount: integer('attempt_count').notNull().default(1),
		processingError: text('processing_error'),
		receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
		lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow(),
		processedAt: timestamp('processed_at', { withTimezone: true })
	},
	(table) => [
		index('polar_webhook_deliveries_event_idx').on(
			table.eventType,
			table.eventId,
			table.receivedAt
		),
		index('polar_webhook_deliveries_state_idx').on(table.state, table.receivedAt)
	]
)
