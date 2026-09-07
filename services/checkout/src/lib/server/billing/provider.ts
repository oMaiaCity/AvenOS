// Payment boundary. Domain code (the names module) only ever sees this
// interface and the normalized PaymentEvent — never Polar payload shapes.
// Swap the provider (or add one) without touching the registry.

import { randomUUID } from 'node:crypto'
import { Webhook, WebhookVerificationError } from 'standardwebhooks'
import { AppError } from '../errors.js'

export interface CheckoutInput {
	name: string
	email: string
	holdId: string
	successUrl: string
	/** Checkout-chrome language ('de' | 'en'), null = the provider's default.
	 * Localizes Polar's checkout UI only — the product copy stays authored. */
	locale: string | null
}
export interface CheckoutSession {
	checkoutId: string
	checkoutUrl: string
}

export interface PaymentEvent {
	id: string
	type: 'order.paid' | 'refund.created' | string
	checkoutId: string | null
	orderId: string | null
	email: string | null
	amountEur: number | null
	metadata: Record<string, unknown>
}

/** One product to guarantee exists at the provider, straight from the
 * pricing SSOT. Prices are GROSS cents — Polar presents them tax-INCLUSIVE
 * ("inkl. USt."), extracting the buyer's VAT from the total. */
export interface ProductSeed {
	tier: string
	name: string
	description: string
	priceCents: number
	/** `null` = one-time (avenNAME, wire key `aven-name`), otherwise the recurring interval. */
	interval: 'week' | 'month' | null
}

export interface SubscriptionCheckoutInput {
	productId: string
	tier: string
	userId: string
	email: string
	successUrl: string
	/** The origin of the page that will iframe-embed the checkout. */
	embedOrigin: string | null
	/** Checkout-chrome language ('de' | 'en'), null = the provider's default. */
	locale: string | null
}

/** One order, reduced to what the pane shows. Polar (merchant of record)
 * issues the official invoice PDF per order via API — `orderInvoiceUrl`
 * fetches it (generating on first ask). */
export interface OrderRow {
	id: string
	createdAt: string
	productId: string
	/** The exact tier stored in the product's `metadata.tier`, when present. */
	tier: string | null
	subTotalCents: number
	taxCents: number
	discountCents: number
	amountPaidCents: number
	currency: string
	status: string
	/** Whether the official invoice PDF has already been generated. */
	invoiceGenerated: boolean
}

/** The Standard-Webhooks headers a delivery carries. */
export type WebhookHeaders = {
	'webhook-id': string
	'webhook-timestamp': string
	'webhook-signature': string
}

export interface PaymentProvider {
	readonly kind: 'polar' | 'fake'
	createCheckout(input: CheckoutInput): Promise<CheckoutSession>
	verifyWebhook(rawBody: string, headers: Record<string, string | null>): PaymentEvent
	/** Idempotent: finds products by `metadata.tier`, creates the missing
	 * ones, corrects drifted prices/names, returns tier → product id. */
	ensureProducts(seeds: ProductSeed[]): Promise<Record<string, string>>
	/** Idempotent like ensureProducts: ensures every SSOT benefit (skill
	 * feature flags, per-tier AI-runtime) exists at the provider — found by
	 * `metadata.key` — and attaches the full set per product. Returns tier →
	 * attached benefit count. The fake provider no-ops. */
	ensureBenefits(): Promise<Record<string, number>>
	createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutSession>
	cancelSubscription(providerSubscriptionId: string, immediate: boolean): Promise<void>
	/** Schedules a pause at period end. Polar guards this (active, no
	 * scheduled cancel, no end date) — the service surfaces its refusal. */
	pauseSubscription(providerSubscriptionId: string): Promise<void>
	/** `unpause` lifts a (scheduled) pause; `uncancel` reverts a scheduled
	 * cancellation. */
	resumeSubscription(providerSubscriptionId: string, mode: 'uncancel' | 'unpause'): Promise<void>
	/** Look up the provider's customer for an email; null when none exists. */
	findCustomerByEmail(email: string): Promise<string | null>
	/** The customer's orders — the real "Meine Bestellungen". */
	listOrders(providerCustomerId: string): Promise<OrderRow[]>
	/** The official invoice PDF for one order, generating it on first ask.
	 * Callers MUST have verified the order belongs to the session's customer. */
	orderInvoiceUrl(orderId: string): Promise<string>
	/** Where a checkout stands: pending | processing | completed | expired. */
	checkoutStatus(providerCheckoutId: string): Promise<string>
}

/** The normalized shape of a subscription-bearing webhook. Field names on
 * the wire vary (snake/camel, nested product vs product_id) — the parsers
 * here are the only place that knows; everything downstream sees this. */
export interface SubscriptionEvent {
	id: string
	type: string
	providerSubscriptionId: string
	providerCustomerId: string | null
	email: string | null
	userId: string | null
	tier: string | null
	status: string
	currentPeriodEnd: string | null
	cancelAtPeriodEnd: boolean
	/** null = the payload carried no pause information (e.g. customer state
	 * summaries) — the upsert must then keep what it has. */
	pauseAtPeriodEnd: boolean | null
	priceCents: number | null
}

// ---------------------------------------------------------------------------
// Standard Webhooks (https://www.standardwebhooks.com) — the scheme Polar
// signs with. The secret is treated as UTF-8 exactly like the SDK's
// validateEvent does, so real dashboard secrets and the dev default both
// work. Signing lives here so the fake provider and the local simulator
// produce deliveries the verifier accepts.

function standardWebhook(secret: string): Webhook {
	return new Webhook(Buffer.from(secret, 'utf-8').toString('base64'))
}

export function signWebhookHeaders(
	rawBody: string,
	secret: string,
	messageId = `msg_${randomUUID()}`
): WebhookHeaders {
	const timestamp = new Date()
	return {
		'webhook-id': messageId,
		'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
		'webhook-signature': standardWebhook(secret).sign(messageId, timestamp, rawBody)
	}
}

export function assertWebhookSignature(
	rawBody: string,
	headers: Record<string, string | null>,
	secret: string
): void {
	const id = headers['webhook-id']
	const timestamp = headers['webhook-timestamp']
	const signature = headers['webhook-signature']
	if (!id || !timestamp || !signature)
		throw new AppError(
			403,
			'WEBHOOK_SIGNATURE_MISSING',
			'The webhook signature headers are missing.'
		)
	try {
		standardWebhook(secret).verify(rawBody, {
			'webhook-id': id,
			'webhook-timestamp': timestamp,
			'webhook-signature': signature
		})
	} catch (error) {
		if (error instanceof WebhookVerificationError)
			throw new AppError(403, 'WEBHOOK_SIGNATURE_INVALID', 'The webhook signature is invalid.')
		throw error
	}
}

// ---------------------------------------------------------------------------
// Polar webhook envelope: { type, data } where data is the order,
// subscription or customer-state the event is about (snake_case on the
// raw wire — we receive format `raw`).

function parseEnvelope(rawBody: string): { type: string; data: Record<string, any> } {
	let payload: Record<string, any>
	try {
		payload = JSON.parse(rawBody) as Record<string, any>
	} catch {
		throw new AppError(400, 'WEBHOOK_PAYLOAD_INVALID', 'The webhook payload is not JSON.')
	}
	return { type: String(payload.type ?? ''), data: (payload.data ?? {}) as Record<string, any> }
}

export function parsePolarEvent(rawBody: string): PaymentEvent {
	const { type, data } = parseEnvelope(rawBody)
	const customer = (data.customer ?? {}) as Record<string, any>
	const amountCents = Number(data.total_amount ?? data.amount ?? NaN)
	return {
		id: String(data.id ?? ''),
		type,
		checkoutId: data.checkout_id ?? null,
		orderId: type.startsWith('order.') ? (data.id ?? null) : (data.order_id ?? null),
		email: customer.email ?? data.customer_email ?? null,
		amountEur: Number.isFinite(amountCents) ? amountCents / 100 : null,
		metadata: (data.metadata ?? {}) as Record<string, unknown>
	}
}

export function parsePolarSubscriptionEvent(rawBody: string): SubscriptionEvent | null {
	const { type, data } = parseEnvelope(rawBody)
	if (!type.startsWith('subscription.')) return null
	const subscriptionId = String(data.id ?? '')
	if (!subscriptionId) return null
	const customer = (data.customer ?? {}) as Record<string, any>
	const product = (data.product ?? {}) as Record<string, any>
	const metadata = (data.metadata ?? {}) as Record<string, unknown>
	const productMetadata = (product.metadata ?? {}) as Record<string, unknown>
	const priceCents = Number(data.amount ?? NaN)
	return {
		id: subscriptionId,
		type,
		providerSubscriptionId: subscriptionId,
		providerCustomerId: customer.id ?? data.customer_id ?? null,
		email: customer.email ?? null,
		userId:
			typeof metadata.userId === 'string'
				? metadata.userId
				: typeof customer.external_id === 'string'
					? customer.external_id
					: null,
		// Provider history is evidence: preserve its exact metadata value.
		tier:
			typeof metadata.tier === 'string'
				? metadata.tier
				: typeof productMetadata.tier === 'string'
					? productMetadata.tier
					: null,
		status: String(data.status ?? ''),
		currentPeriodEnd: data.current_period_end ?? null,
		cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
		pauseAtPeriodEnd:
			data.pause_at_period_end === undefined ? null : Boolean(data.pause_at_period_end),
		priceCents: Number.isFinite(priceCents) ? priceCents : null
	}
}

/** `customer.state_changed` carries the customer plus every active
 * subscription — enough to reconcile status/periods for rows we already
 * know (tier stays untouched: the upsert preserves it when empty). */
export function parsePolarCustomerState(rawBody: string): SubscriptionEvent[] {
	const { type, data } = parseEnvelope(rawBody)
	if (type !== 'customer.state_changed') return []
	const subscriptions = Array.isArray(data.active_subscriptions) ? data.active_subscriptions : []
	return subscriptions
		.filter((sub: Record<string, any>) => sub?.id)
		.map((sub: Record<string, any>) => ({
			id: String(sub.id),
			type,
			providerSubscriptionId: String(sub.id),
			providerCustomerId: data.id ?? null,
			email: data.email ?? null,
			userId: typeof data.external_id === 'string' ? data.external_id : null,
			tier: null,
			status: String(sub.status ?? 'active'),
			currentPeriodEnd: sub.current_period_end ?? null,
			cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
			pauseAtPeriodEnd:
				sub.pause_at_period_end === undefined ? null : Boolean(sub.pause_at_period_end),
			priceCents: Number.isFinite(Number(sub.amount)) ? Number(sub.amount) : null
		}))
}
