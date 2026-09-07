import { api, readJson, requireUser } from '$lib/server/api.js'
import { AppError } from '$lib/server/errors.js'

// The official invoice PDF for ONE of the caller's own orders. The order id
// is client input, but it is resolved strictly against the session
// customer's order list — a foreign order id is simply not found.
export const POST = api(async (event, rt) => {
	const user = await requireUser(event)
	const body = (await readJson(event)) as { orderId?: string }
	const orderId = String(body.orderId ?? '')
	if (!orderId) throw new AppError(400, 'VALIDATION_ERROR', 'orderId is required.')
	return { body: { url: await rt.subscriptions.orderInvoiceUrl(user, orderId) } }
})
