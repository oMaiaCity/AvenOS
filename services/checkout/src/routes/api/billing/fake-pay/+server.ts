// Dev/e2e only: the "Pay" button of the local mock checkout. Builds a signed,
// Polar-shaped webhook and delivers it to our own webhook endpoint so the
// production grant path is exercised end to end. 404s when a real payment
// provider is configured.

import type { RequestEvent } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { FakePaymentProvider } from '$lib/server/billing/fake.js'
import { signWebhookHeaders } from '$lib/server/billing/provider.js'
import { runtime } from '$lib/server/runtime.js'
import { emailAddress } from '$lib/validation.js'

const fakePaySchema = z.object({
	checkoutId: z.string().min(1),
	holdId: z.string().min(1),
	name: z.string().min(1),
	email: emailAddress,
	successUrl: z.string().default('')
})

export const POST = async (event: RequestEvent) => {
	const rt = await runtime()
	if (!(rt.payments instanceof FakePaymentProvider))
		return json({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404 })
	const input = fakePaySchema.parse(await event.request.json())
	const rawBody = rt.payments.buildCompletedWebhookBody({
		...input,
		amountEur: rt.config.NAME_PRICE_EUR
	})
	const response = await event.fetch('/api/webhooks/polar', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...signWebhookHeaders(rawBody, rt.config.POLAR_WEBHOOK_SECRET)
		},
		body: rawBody
	})
	if (!response.ok)
		return json(
			{ code: 'FAKE_PAYMENT_FAILED', message: 'The mock webhook delivery failed.' },
			{ status: 502 }
		)
	// Redirect to the real success URL (carrying the purchase token) exactly
	// like the hosted checkout would.
	return json({
		paid: true,
		redirect: input.successUrl || `/purchase/success?name=${encodeURIComponent(input.name)}`
	})
}
