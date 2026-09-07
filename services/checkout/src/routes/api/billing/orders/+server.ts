import { api, requireUser } from '$lib/server/api.js'

// Meine Bestellungen — the caller's own orders, customer resolved from the
// session. Each paid order's official invoice PDF is fetched per order via
// POST /api/billing/invoices.
export const GET = api(async (event, rt) => {
	const user = await requireUser(event)
	return { body: { orders: await rt.subscriptions.orders(user) } }
})
