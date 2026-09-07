// The recurring subscription (avenCEO), sold through the payment provider and
// mirrored into two tables the portal reads. Strictly customer-self-service:
// every method takes the SESSION's user id — none accepts a provider id from
// outside, because the row lookup here is the authorization.
//
// Subscriptions are keyed and tracked PER TIER, so the machinery already
// supports several coexisting on one account; today the self-serve set has
// collapsed to a single tier (avenCEO), each booked and canceled on its own,
// with no cross-tier change of any kind.
//
// HOW MANY of one tier an account may hold is not decided here — it is
// `maxPerAccount` in the pricing SSOT, asked via `canBuyMore`. It is 1 today;
// raising it there is what makes several avenCEO subscriptions sellable,
// without this file learning a second rule.
//
// The webhook is the only writer of subscription state. Actions (cancel,
// resume) call the provider and return; the row updates when the
// provider's event lands, so the UI shows a pending state instead of a lie.

import { randomUUID } from 'node:crypto'
import type { IdentityProvisioningClient } from '@avenos/aven-identity'
import { canBuyMore } from '@myavenceo/aven-ceo/pricing'
import type pg from 'pg'
import { writeAudit } from '../audit.js'
import { AppError } from '../errors.js'
import type { OrderRow, PaymentProvider, SubscriptionEvent } from './provider.js'
import { productSeeds } from './seeds.js'

/** The tiers that exist as recurring, self-serve subscriptions — avenCEO is
 * the only one. avenNAME (`aven-name`) is a one-off (the names flow
 * owns it) and avenCOOP is not a product at all — that relationship is handled
 * individually, outside this system. */
export const SUBSCRIPTION_TIERS = ['aven-ceo'] as const
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number]

export function isSubscriptionTier(value: string): value is SubscriptionTier {
	return (SUBSCRIPTION_TIERS as readonly string[]).includes(value)
}

/** A subscription in one of these states is over — the tier is bookable
 * again. Everything else counts as standing (incl. past_due). */
export const ENDED_STATUSES = ['canceled', 'expired', 'incomplete_expired', 'unpaid', 'revoked']

export interface SubscriptionStanding {
	tier: string
	status: string
	priceEurCents: number
	currentPeriodEnd: string | null
	cancelAtPeriodEnd: boolean
	pauseAtPeriodEnd: boolean
}

interface SubscriptionRow {
	id: string
	user_id: string
	provider_subscription_id: string
	tier: string
	status: string
	current_period_end: Date | null
	cancel_at_period_end: boolean
	pause_at_period_end: boolean
	price_eur_cents: number
}

export class SubscriptionService {
	// tier → provider product id, resolved once per process. Seeding is
	// idempotent at the provider, so racing first calls are merely redundant.
	private products: Promise<Record<string, string>> | null = null

	constructor(
		private pool: pg.Pool,
		private config: { PUBLIC_BASE_URL: string },
		private payments: PaymentProvider,
		private identity: Pick<IdentityProvisioningClient, 'provisionVerifiedAccount'>
	) {}

	/** The caller's provider customer id — from our table first, or discovered
	 * from the provider using the SESSION's own verified email. */
	private async customerId(user: { id: string; email: string }): Promise<string | null> {
		const stored = await this.pool.query(
			'SELECT provider_customer_id FROM billing_customers WHERE user_id=$1',
			[user.id]
		)
		const known = stored.rows[0]?.provider_customer_id as string | undefined
		if (known) return known
		const found = await this.payments.findCustomerByEmail(user.email.toLowerCase())
		if (!found) return null
		await this.pool.query(
			`INSERT INTO billing_customers (user_id, provider_customer_id) VALUES ($1,$2)
			 ON CONFLICT (user_id) DO UPDATE SET provider_customer_id=EXCLUDED.provider_customer_id`,
			[user.id, found]
		)
		return found
	}

	/** Ensure every product (the one-off avenNAME and the recurring avenCEO)
	 * exists at the provider, priced from the SSOT; cached per process. */
	ensureProducts(): Promise<Record<string, string>> {
		this.products ??= this.payments.ensureProducts(productSeeds())
		return this.products
	}

	private async productId(tier: SubscriptionTier): Promise<string> {
		const id = (await this.ensureProducts())[tier]
		if (!id)
			throw new AppError(502, 'BILLING_PRODUCT_MISSING', `No provider product exists for ${tier}.`)
		return id
	}

	/** The latest row per tier for a user — each tier stands on its own. */
	private async rows(userId: string): Promise<SubscriptionRow[]> {
		const result = await this.pool.query(
			`SELECT DISTINCT ON (tier) * FROM subscriptions
			 WHERE user_id=$1 ORDER BY tier, updated_at DESC`,
			[userId]
		)
		return result.rows as SubscriptionRow[]
	}

	/** How many subscriptions of one tier the user currently HOLDS — anything
	 * not in an ended state. The number `canBuyMore` weighs against the SSOT's
	 * limit; counting rows rather than asking "is there one" is what lets the
	 * limit rise past 1 without this query changing. */
	private async liveCount(userId: string, tier: string): Promise<number> {
		const result = await this.pool.query(
			`SELECT count(*)::int AS live FROM subscriptions
			 WHERE user_id=$1 AND tier=$2 AND NOT (status = ANY($3))`,
			[userId, tier, ENDED_STATUSES]
		)
		return (result.rows[0]?.live as number | undefined) ?? 0
	}

	private async tierRow(userId: string, tier: string): Promise<SubscriptionRow | null> {
		if (!isSubscriptionTier(tier))
			throw new AppError(400, 'VALIDATION_ERROR', 'Unknown subscription tier.')
		const result = await this.pool.query(
			'SELECT * FROM subscriptions WHERE user_id=$1 AND tier=$2 ORDER BY updated_at DESC LIMIT 1',
			[userId, tier]
		)
		return (result.rows[0] as SubscriptionRow | undefined) ?? null
	}

	/** The caller's standing per tier — the session is the only selector. */
	async me(userId: string): Promise<SubscriptionStanding[]> {
		const rows = await this.rows(userId)
		return rows.map((row) => ({
			tier: row.tier,
			status: row.status,
			priceEurCents: row.price_eur_cents,
			currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
			cancelAtPeriodEnd: row.cancel_at_period_end,
			pauseAtPeriodEnd: row.pause_at_period_end
		}))
	}

	/** Start a checkout for a tier. Tiers are independent; how many of ONE
	 * tier may stand at once is the SSOT's `maxPerAccount` (1 today, so a
	 * live avenCEO blocks a second). */
	async subscribe(
		user: { id: string; email: string },
		rawTier: string,
		embedOrigin: string | null = null,
		locale: string | null = null
	): Promise<{ checkoutUrl: string }> {
		const tier = rawTier
		if (!isSubscriptionTier(tier))
			throw new AppError(400, 'VALIDATION_ERROR', 'Unknown subscription tier.')
		const held = await this.liveCount(user.id, tier)
		if (!canBuyMore(tier, held))
			throw new AppError(
				409,
				'SUBSCRIPTION_EXISTS',
				'You already have an active subscription for this product.'
			)
		const session = await this.payments.createSubscriptionCheckout({
			productId: await this.productId(tier),
			tier,
			userId: user.id,
			email: user.email,
			successUrl: new URL('/dashboard', this.config.PUBLIC_BASE_URL).toString(),
			embedOrigin,
			locale
		})
		// Remember the checkout so the pane can ask "where does MY checkout
		// stand" without ever naming it.
		await this.pool.query('INSERT INTO billing_checkouts (user_id, checkout_id) VALUES ($1,$2)', [
			user.id,
			session.checkoutId
		])
		return { checkoutUrl: session.checkoutUrl }
	}

	async cancel(userId: string, tier: string, immediate = false): Promise<void> {
		const row = await this.requireActive(userId, tier)
		await this.payments.cancelSubscription(row.provider_subscription_id, immediate)
	}

	/** Fortsetzen: lifts a (scheduled) pause, otherwise reverts a scheduled
	 * cancellation. */
	async resume(userId: string, tier: string): Promise<void> {
		const row = await this.tierRow(userId, tier)
		if (!row || ENDED_STATUSES.includes(row.status))
			throw new AppError(404, 'SUBSCRIPTION_MISSING', 'There is no subscription to resume.')
		const paused = row.status === 'paused' || row.pause_at_period_end
		await this.payments.resumeSubscription(
			row.provider_subscription_id,
			paused ? 'unpause' : 'uncancel'
		)
	}

	/** Pausieren: schedules a pause at period end. */
	async pause(userId: string, tier: string): Promise<void> {
		const row = await this.requireActive(userId, tier)
		await this.payments.pauseSubscription(row.provider_subscription_id)
	}

	/** The caller's orders — the one-off avenNAME and every subscription
	 * charge — resolved through the same session-only customer lookup. */
	async orders(user: { id: string; email: string }): Promise<OrderRow[]> {
		const providerCustomerId = await this.customerId(user)
		if (!providerCustomerId) return []
		return this.payments.listOrders(providerCustomerId)
	}

	/** The official invoice PDF for ONE of the caller's own orders. The
	 * order id is client input, so it is only ever resolved against the
	 * session customer's order list — a foreign id simply is not found. */
	async orderInvoiceUrl(user: { id: string; email: string }, orderId: string): Promise<string> {
		const owned = (await this.orders(user)).find((order) => order.id === orderId)
		if (!owned) throw new AppError(404, 'ORDER_MISSING', 'There is no such order.')
		return this.payments.orderInvoiceUrl(owned.id)
	}

	/** Where the session's LATEST checkout stands. The checkout id comes
	 * from our own row, never from the client — the pane polls this while
	 * the inline embed runs, so it does not depend on the iframe message. */
	async checkoutStatus(userId: string): Promise<{ status: string } | null> {
		const row = await this.pool.query(
			'SELECT checkout_id FROM billing_checkouts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
			[userId]
		)
		const checkoutId = row.rows[0]?.checkout_id as string | undefined
		if (!checkoutId) return null
		return { status: await this.payments.checkoutStatus(checkoutId) }
	}

	private async requireActive(userId: string, tier: string): Promise<SubscriptionRow> {
		const row = await this.tierRow(userId, tier)
		if (!row || ENDED_STATUSES.includes(row.status))
			throw new AppError(404, 'SUBSCRIPTION_MISSING', 'There is no active subscription.')
		return row
	}

	/** Apply one verified subscription-bearing webhook. Idempotent: keyed on
	 * the provider's subscription id, replays converge on the same row. The
	 * buyer is resolved from checkout metadata (userId, which Polar also
	 * mirrors as the customer's external id) first, their email second —
	 * the same trust chain the names grant uses. */
	async applyEvent(event: SubscriptionEvent): Promise<{ applied: boolean }> {
		const client = await this.pool.connect()
		try {
			await client.query('BEGIN')
			let userId = event.userId
			if (userId) {
				const known = await client.query(
					'SELECT subject_id FROM checkout_customers WHERE subject_id=$1',
					[userId]
				)
				if (!known.rows[0]) userId = null
			}
			if (!userId && event.email) {
				const provisioned = await this.identity.provisionVerifiedAccount(
					event.email.toLowerCase(),
					'subscription'
				)
				userId = provisioned.account.id
				await client.query(
					`INSERT INTO checkout_customers(subject_id,email,created_at,updated_at) VALUES($1,$2,now(),now())
					 ON CONFLICT(subject_id) DO UPDATE SET email=EXCLUDED.email,updated_at=now()`,
					[userId, provisioned.account.email]
				)
			}
			if (!userId) {
				await writeAudit(client, {
					eventType: 'billing.subscription_unmatched',
					metadata: { eventId: event.id, subscriptionId: event.providerSubscriptionId }
				})
				await client.query('COMMIT')
				return { applied: false }
			}
			if (event.providerCustomerId) {
				await client.query(
					`INSERT INTO billing_customers (user_id, provider_customer_id) VALUES ($1,$2)
					 ON CONFLICT (user_id) DO UPDATE SET provider_customer_id=EXCLUDED.provider_customer_id`,
					[userId, event.providerCustomerId]
				)
			}
			await client.query(
				`INSERT INTO subscriptions
				   (id, user_id, provider_subscription_id, tier, status, current_period_end,
				    cancel_at_period_end, price_eur_cents, pause_at_period_end)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
				 ON CONFLICT (provider_subscription_id) DO UPDATE SET
				   status=EXCLUDED.status,
				   tier=COALESCE(NULLIF(EXCLUDED.tier,''), subscriptions.tier),
				   current_period_end=COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
				   cancel_at_period_end=EXCLUDED.cancel_at_period_end,
				   pause_at_period_end=CASE WHEN $10 THEN EXCLUDED.pause_at_period_end
				     ELSE subscriptions.pause_at_period_end END,
				   price_eur_cents=CASE WHEN EXCLUDED.price_eur_cents > 0
				     THEN EXCLUDED.price_eur_cents ELSE subscriptions.price_eur_cents END,
				   updated_at=now()`,
				[
					randomUUID(),
					userId,
					event.providerSubscriptionId,
					event.tier ?? '',
					event.status,
					event.currentPeriodEnd,
					event.cancelAtPeriodEnd,
					event.priceCents ?? 0,
					// A payload without pause information keeps the stored flag —
					// $10 says whether $9 is authoritative.
					event.pauseAtPeriodEnd ?? false,
					event.pauseAtPeriodEnd !== null
				]
			)
			await writeAudit(client, {
				eventType: 'billing.subscription_applied',
				metadata: {
					eventId: event.id,
					type: event.type,
					subscriptionId: event.providerSubscriptionId,
					status: event.status,
					tier: event.tier
				}
			})
			await client.query('COMMIT')
			return { applied: true }
		} catch (error) {
			await client.query('ROLLBACK')
			throw error
		} finally {
			client.release()
		}
	}
}
