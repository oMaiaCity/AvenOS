import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const auditEvents = pgTable('audit_events', {
	id: text('id').primaryKey(),
	eventType: text('event_type').notNull(),
	actorUserId: text('actor_user_id'),
	targetUserId: text('target_user_id'),
	emailQueueId: text('email_queue_id'),
	metadata: jsonb('metadata').notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull()
})

export const workerHeartbeats = pgTable('worker_heartbeats', {
	workerName: text('worker_name').primaryKey(),
	instanceId: text('instance_id').notNull(),
	version: text('version').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
	lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull(),
	metadata: jsonb('metadata').notNull().default({})
})
