import { isDeepStrictEqual } from 'node:util'
import type pg from 'pg'
import { AppError } from '../errors.js'

export interface PolarWebhookDelivery {
	deliveryId: string
	eventId: string | null
	eventType: string
	payload: unknown
	headers: Record<string, string | null>
}

export class PolarWebhookDeliveryStore {
	constructor(private readonly pool: pg.Pool) {}

	async claim(delivery: PolarWebhookDelivery): Promise<'process' | 'processed' | 'in-flight'> {
		const inserted = await this.pool.query(
			`INSERT INTO polar_webhook_deliveries
			 (delivery_id,event_id,event_type,payload,headers,state,attempt_count)
			 VALUES($1,$2,$3,$4,$5,'processing',1)
			 ON CONFLICT(delivery_id) DO NOTHING RETURNING delivery_id`,
			[
				delivery.deliveryId,
				delivery.eventId,
				delivery.eventType,
				delivery.payload,
				delivery.headers
			]
		)
		if (inserted.rowCount === 1) return 'process'

		const existing = (
			await this.pool.query<{
				event_id: string | null
				event_type: string
				payload: unknown
				state: 'processing' | 'processed' | 'failed'
				last_attempt_at: Date
			}>(
				`SELECT event_id,event_type,payload,state,last_attempt_at
				 FROM polar_webhook_deliveries WHERE delivery_id=$1`,
				[delivery.deliveryId]
			)
		).rows[0]
		if (
			!existing ||
			existing.event_id !== delivery.eventId ||
			existing.event_type !== delivery.eventType ||
			!isDeepStrictEqual(existing.payload, delivery.payload)
		)
			throw new AppError(
				409,
				'WEBHOOK_DELIVERY_CONFLICT',
				'The webhook delivery ID is already bound to different content.'
			)
		if (existing.state === 'processed') return 'processed'
		const staleBefore = new Date(Date.now() - 5 * 60_000)
		if (existing.state === 'processing' && existing.last_attempt_at >= staleBefore)
			return 'in-flight'
		const reclaimed = await this.pool.query(
			`UPDATE polar_webhook_deliveries SET state='processing',attempt_count=attempt_count+1,
			 processing_error=NULL,last_attempt_at=clock_timestamp()
			 WHERE delivery_id=$1 AND
			 (state='failed' OR (state='processing' AND last_attempt_at < $2))
			 RETURNING delivery_id`,
			[delivery.deliveryId, staleBefore]
		)
		return reclaimed.rowCount === 1 ? 'process' : 'in-flight'
	}

	async processed(deliveryId: string): Promise<void> {
		await this.pool.query(
			`UPDATE polar_webhook_deliveries SET state='processed',processing_error=NULL,
			 processed_at=clock_timestamp() WHERE delivery_id=$1`,
			[deliveryId]
		)
	}

	async failed(deliveryId: string, error: unknown): Promise<void> {
		await this.pool.query(
			`UPDATE polar_webhook_deliveries SET state='failed',processing_error=$2,
			 processed_at=NULL WHERE delivery_id=$1`,
			[deliveryId, String(error).slice(0, 2_000)]
		)
	}
}
