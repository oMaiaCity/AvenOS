import { a as emailAddress, c as FakePaymentProvider, t as runtime, u as signWebhookPayload } from "../../../../../chunks/runtime.js";
import { json } from "@sveltejs/kit";
import { z } from "zod";
//#region src/routes/api/billing/fake-pay/+server.ts
var fakePaySchema = z.object({
	checkoutId: z.string().min(1),
	holdId: z.string().min(1),
	name: z.string().min(1),
	email: emailAddress,
	successUrl: z.string().default("")
});
var POST = async (event) => {
	const rt = await runtime();
	if (!(rt.payments instanceof FakePaymentProvider)) return json({
		code: "NOT_FOUND",
		message: "Not found."
	}, { status: 404 });
	const input = fakePaySchema.parse(await event.request.json());
	const rawBody = rt.payments.buildCompletedWebhookBody({
		...input,
		amountEur: rt.config.NAME_PRICE_EUR
	});
	if (!(await fetch(new URL("/api/webhooks/creem", rt.config.PUBLIC_BASE_URL), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"creem-signature": signWebhookPayload(rawBody, rt.config.CREEM_WEBHOOK_SECRET)
		},
		body: rawBody
	})).ok) return json({
		code: "FAKE_PAYMENT_FAILED",
		message: "The mock webhook delivery failed."
	}, { status: 502 });
	return json({
		paid: true,
		redirect: input.successUrl || `/purchase/success?name=${encodeURIComponent(input.name)}`
	});
};
//#endregion
export { POST };
