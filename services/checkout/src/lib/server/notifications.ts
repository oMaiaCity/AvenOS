import type { NotifierConfig } from './config.js'
import type { Queryable } from './db.js'
import { enqueueSystemEmail, type QueueSettings } from './email/queue.js'

export interface Notifier {
	namePurchaseLink(
		connection: Queryable,
		input: { email: string; name: string; claimUrl: string; expiresAt: string }
	): Promise<void>
	namePurchased(
		connection: Queryable,
		input: { name: string; ownerEmail: string; accessUrl?: string }
	): Promise<void>
}

export function createNotifier(config: NotifierConfig, settings: QueueSettings): Notifier {
	return {
		async namePurchaseLink(connection, input) {
			await enqueueSystemEmail(settings, connection, {
				template: 'name.purchase-link',
				to: input.email,
				data: {
					name: input.name,
					claimUrl: input.claimUrl,
					expiresAt: new Date(input.expiresAt).toUTCString(),
					baseUrl: config.PUBLIC_BASE_URL
				},
				priority: 10
			})
		},
		async namePurchased(connection, input) {
			await enqueueSystemEmail(settings, connection, {
				template: 'name.purchased',
				to: input.ownerEmail,
				data: {
					name: input.name,
					accessUrl: input.accessUrl ?? '',
					baseUrl: config.PUBLIC_BASE_URL
				},
				idempotencyKey: `name-purchased:${input.name}`
			})
		}
	}
}
