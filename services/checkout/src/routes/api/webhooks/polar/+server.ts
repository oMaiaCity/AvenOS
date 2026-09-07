import { BodyLimitError, readBoundedText } from '@avenos/http-boundary'
import type { RequestEvent } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { writeAudit } from '$lib/server/audit.js'
import {
	type PaymentEvent,
	parsePolarCustomerState,
	parsePolarSubscriptionEvent
} from '$lib/server/billing/provider.js'
import { AppError } from '$lib/server/errors.js'
import { runtime } from '$lib/server/runtime.js'

export const POST = async (event: RequestEvent) => {
	const rt = await runtime()
	let rawBody: string
	try {
		rawBody = await readBoundedText(event.request, 1024 * 1024)
	} catch (error) {
		if (error instanceof BodyLimitError) return json({ code: error.code }, { status: error.status })
		throw error
	}
	const webhookHeaders = {
		'webhook-id': event.request.headers.get('webhook-id'),
		'webhook-timestamp': event.request.headers.get('webhook-timestamp'),
		'webhook-signature': event.request.headers.get('webhook-signature')
	}
	let paymentEvent: PaymentEvent
	try {
		paymentEvent = rt.payments.verifyWebhook(rawBody, webhookHeaders)
	} catch (error) {
		if (error instanceof AppError)
			return json({ code: error.code, message: error.message }, { status: error.status })
		throw error
	}
	const deliveryId = webhookHeaders['webhook-id'] as string
	try {
		const claim = await rt.webhookDeliveries.claim({
			deliveryId,
			eventId: paymentEvent.id || null,
			eventType: paymentEvent.type,
			payload: JSON.parse(rawBody),
			headers: {
				...webhookHeaders,
				'content-type': event.request.headers.get('content-type'),
				'user-agent': event.request.headers.get('user-agent')
			}
		})
		if (claim === 'processed') return json({ received: true, replay: true })
		if (claim === 'in-flight')
			return json({ received: false, code: 'WEBHOOK_DELIVERY_IN_FLIGHT' }, { status: 409 })
	} catch (error) {
		if (error instanceof AppError)
			return json({ code: error.code, message: error.message }, { status: error.status })
		throw error
	}
	try {
		if (paymentEvent.type === 'order.paid') {
			// An order can be paid for a NAME (carries holdId) or for a
			// subscription tier — only the name path grants here; subscription
			// state arrives via its own subscription.* event.
			if (paymentEvent.metadata.holdId) {
				await rt.webhookNames.grantFromEvent(paymentEvent)
			} else {
				await writeAudit(rt.webhookDatabase.pool, {
					eventType: 'billing.order_paid',
					metadata: { eventId: paymentEvent.id, tier: paymentEvent.metadata.tier ?? null }
				})
			}
		} else if (paymentEvent.type.startsWith('subscription.')) {
			const subscriptionEvent = parsePolarSubscriptionEvent(rawBody)
			if (subscriptionEvent) await rt.webhookSubscriptions.applyEvent(subscriptionEvent)
		} else if (paymentEvent.type === 'customer.state_changed') {
			// The full standing in one event — reconcile every active
			// subscription it carries (tier is preserved by the upsert).
			for (const subscriptionEvent of parsePolarCustomerState(rawBody)) {
				await rt.webhookSubscriptions.applyEvent(subscriptionEvent)
			}
		} else if (paymentEvent.type === 'refund.created') {
			await rt.webhookNames.revokeFromEvent(paymentEvent)
		} else {
			await writeAudit(rt.webhookDatabase.pool, {
				eventType: 'billing.event_ignored',
				metadata: { eventId: paymentEvent.id, type: paymentEvent.type }
			})
		}
	} catch (error) {
		await rt.webhookDeliveries.failed(deliveryId, error).catch(() => {})
		// Non-2xx makes the provider retry with backoff — exactly what we want
		// for transient failures; the grant itself is idempotent.
		rt.logger.error(
			{ err: error, eventId: paymentEvent.id, type: paymentEvent.type },
			'webhook processing failed'
		)
		return json({ received: false }, { status: 500 })
	}
	await rt.webhookDeliveries.processed(deliveryId)
	return json({ received: true })
}
