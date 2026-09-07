import { randomUUID } from 'node:crypto'
import type pg from 'pg'

export type PlatformEventType = 'purchase_granted' | 'purchase_revoked'

export async function enqueuePlatformEvent(
	client: pg.PoolClient,
	input: { eventType: PlatformEventType; userId: string; name: string }
): Promise<void> {
	await client.query(
		`INSERT INTO platform_event_outbox(id,event_type,subject_id,purchased_name)
		 VALUES($1,$2,$3,$4)`,
		[randomUUID(), input.eventType, input.userId, input.name]
	)
}
