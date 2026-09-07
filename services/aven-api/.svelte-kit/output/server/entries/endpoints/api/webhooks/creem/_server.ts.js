import { d as AppError, l as parseCreemSubscriptionEvent, s as writeAudit, t as runtime } from "../../../../../chunks/runtime.js";
import { json } from "@sveltejs/kit";
//#region src/routes/api/webhooks/creem/+server.ts
var POST = async (event) => {
	const rt = await runtime();
	const rawBody = await event.request.text();
	let paymentEvent;
	try {
		paymentEvent = rt.payments.verifyWebhook(rawBody, event.request.headers.get("creem-signature"));
	} catch (error) {
		if (error instanceof AppError) return json({
			code: error.code,
			message: error.message
		}, { status: error.status });
		throw error;
	}
	try {
		if (paymentEvent.type === "checkout.completed") if (paymentEvent.metadata.holdId) await rt.names.grantFromEvent(paymentEvent);
		else await writeAudit(rt.database.pool, {
			eventType: "billing.subscription_checkout_completed",
			metadata: {
				eventId: paymentEvent.id,
				tier: paymentEvent.metadata.tier ?? null
			}
		});
		else if (paymentEvent.type.startsWith("subscription.")) {
			const subscriptionEvent = parseCreemSubscriptionEvent(rawBody);
			if (subscriptionEvent) await rt.subscriptions.applyEvent(subscriptionEvent);
		} else if (paymentEvent.type === "refund.created" || paymentEvent.type === "dispute.created") await rt.names.revokeFromEvent(paymentEvent);
		else await writeAudit(rt.database.pool, {
			eventType: "billing.event_ignored",
			metadata: {
				eventId: paymentEvent.id,
				type: paymentEvent.type
			}
		});
	} catch (error) {
		rt.logger.error({
			err: error,
			eventId: paymentEvent.id,
			type: paymentEvent.type
		}, "webhook processing failed");
		return json({ received: false }, { status: 500 });
	}
	return json({ received: true });
};
//#endregion
export { POST };
