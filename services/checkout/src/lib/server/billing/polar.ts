// Polar behind the PaymentProvider boundary — one SDK client, environment
// from POLAR_SERVER (sandbox|production), never hardcoded. Products are
// resolved by `metadata.tier` (the SSOT wire key) and synced from the seeds:
// created when missing, price/name corrected when drifted. The org access
// token already scopes every call to our organization.
import { Polar } from '@polar-sh/sdk'
import type { BillingConfig } from '../config.js'
import { AppError } from '../errors.js'
import {
	assertWebhookSignature,
	type CheckoutInput,
	type CheckoutSession,
	type OrderRow,
	type PaymentEvent,
	type PaymentProvider,
	type ProductSeed,
	parsePolarEvent,
	type SubscriptionCheckoutInput
} from './provider.js'
import { type BenefitSpec, productBenefitSpecs, productSeeds } from './seeds.js'

/** Polar checkout statuses, mapped onto the pane's vocabulary. */
const CHECKOUT_STATUS: Record<string, string> = {
	open: 'pending',
	confirmed: 'processing',
	succeeded: 'completed',
	failed: 'failed',
	expired: 'expired'
}

export class PolarProvider implements PaymentProvider {
	readonly kind = 'polar' as const
	private polar: Polar
	// tier → product id, synced once per process (idempotent at Polar).
	private products: Promise<Record<string, string>> | null = null
	// tier → attached benefit count, synced once per process.
	private benefits: Promise<Record<string, number>> | null = null

	constructor(private config: BillingConfig) {
		this.polar = new Polar({
			accessToken: config.POLAR_API_KEY,
			server: config.POLAR_SERVER
		})
	}

	/** One place for every Polar call: error surfaces read the same and the
	 * token never leaves the SDK client. */
	private async call<T>(label: string, fn: () => Promise<T>): Promise<T> {
		try {
			return await fn()
		} catch (error) {
			if (error instanceof AppError) throw error
			const detail = error instanceof Error ? error.message : String(error)
			throw new AppError(
				502,
				'BILLING_PROVIDER_ERROR',
				`The payment provider rejected ${label}.`,
				detail.slice(0, 300)
			)
		}
	}

	/** Memoized per process — the names funnel and the subscription service
	 * both sync the same SSOT seeds, so one pass serves both. */
	ensureProducts(seeds: ProductSeed[]): Promise<Record<string, string>> {
		this.products ??= this.syncProducts(seeds)
		return this.products
	}

	private async syncProducts(seeds: ProductSeed[]): Promise<Record<string, string>> {
		const map: Record<string, string> = {}
		const listed = await this.call('list-products', () =>
			this.polar.products.list({ limit: 100, isArchived: false })
		)
		const existing = listed.result.items
		for (const seed of seeds) {
			// Exact canonical metadata prevents an unrelated retired product from
			// being adopted into the fresh catalog.
			const found = existing.find((product) => {
				const stored = product.metadata?.tier
				return stored === seed.tier
			})
			if (found) {
				map[seed.tier] = found.id
				// Correct drift: the SSOT is the truth for name, description and
				// gross price — and for the wire key itself.
				const price = found.prices.find((p) => 'priceAmount' in p && p.amountType === 'fixed') as
					| { priceAmount: number }
					| undefined
				const priceDrifted = price ? price.priceAmount !== seed.priceCents : true
				const nameDrifted = found.name !== seed.name
				const descriptionDrifted = (found.description ?? '') !== seed.description
				const tierDrifted = found.metadata?.tier !== seed.tier
				if (priceDrifted || nameDrifted || descriptionDrifted || tierDrifted) {
					await this.call(`update-product ${seed.tier}`, () =>
						this.polar.products.update({
							id: found.id,
							productUpdate: {
								name: seed.name,
								description: seed.description,
								// Carry the rest of the metadata across — only `tier` is ours.
								metadata: { ...found.metadata, tier: seed.tier },
								prices: [
									{
										amountType: 'fixed',
										priceAmount: seed.priceCents,
										priceCurrency: 'eur' as const,
										taxBehavior: 'inclusive'
									}
								]
							}
						})
					)
				}
				continue
			}
			const base = {
				name: seed.name,
				description: seed.description,
				metadata: { tier: seed.tier },
				prices: [
					{
						amountType: 'fixed' as const,
						priceAmount: seed.priceCents,
						priceCurrency: 'eur' as const,
						// GROSS: the listed price IS what the buyer pays, VAT inside.
						taxBehavior: 'inclusive' as const
					}
				]
			}
			const created = await this.call(`create-product ${seed.tier}`, () =>
				this.polar.products.create(
					seed.interval ? { ...base, recurringInterval: seed.interval } : base
				)
			)
			map[seed.tier] = created.id
		}
		return map
	}

	/** Memoized per process, like the products. */
	ensureBenefits(): Promise<Record<string, number>> {
		this.benefits ??= this.syncBenefits()
		return this.benefits
	}

	/** The SSOT benefits at Polar: every benefit is found by its
	 * `metadata.key` (`skill:<slug>` / `runtime:<tier>`), created VISIBLE when
	 * missing, and the full set is attached per product — so the checkout
	 * shows exactly what the pricing page promises. */
	private async syncBenefits(): Promise<Record<string, number>> {
		const products = await this.ensureProducts(productSeeds())
		const specs = productBenefitSpecs()
		const listed = await this.call('list-benefits', () => this.polar.benefits.list({ limit: 100 }))
		const idByKey = new Map<string, string>()
		const existingByKey = new Map<string, { id: string; type: string; description: string }>()
		for (const benefit of listed.result.items) {
			const key = benefit.metadata?.key
			if (typeof key === 'string' && benefit.metadata?.source === 'ssot') {
				idByKey.set(key, benefit.id)
				existingByKey.set(key, {
					id: benefit.id,
					type: String(benefit.type),
					description: benefit.description
				})
			}
		}
		for (const spec of Object.values(specs).flat()) {
			const existing = existingByKey.get(spec.key)
			if (existing) {
				// The SSOT owns the title — correct drift on rename.
				if (existing.description !== spec.description) {
					await this.call(`update-benefit ${spec.key}`, () =>
						this.polar.benefits.update({
							id: existing.id,
							requestBody: {
								type: existing.type,
								description: spec.description
							} as Parameters<typeof this.polar.benefits.update>[0]['requestBody']
						})
					)
				}
				continue
			}
			idByKey.set(spec.key, await this.createBenefit(spec))
		}
		const counts: Record<string, number> = {}
		for (const [tier, tierSpecs] of Object.entries(specs)) {
			const productId = products[tier]
			if (!productId) continue
			const benefits = tierSpecs
				.map((spec) => idByKey.get(spec.key))
				.filter((id): id is string => Boolean(id))
			await this.call(`update-product-benefits ${tier}`, () =>
				this.polar.products.updateBenefits({
					id: productId,
					productBenefitsUpdate: { benefits }
				})
			)
			counts[tier] = benefits.length
		}
		return counts
	}

	private async createBenefit(spec: BenefitSpec): Promise<string> {
		const base = {
			description: spec.description,
			metadata: { source: 'ssot', key: spec.key },
			// Explicitly visible: these ARE the product's public feature list.
			visibility: 'public' as const
		}
		if (spec.kind === 'feature_flag') {
			const created = await this.call(`create-benefit ${spec.key}`, () =>
				this.polar.benefits.create({ ...base, type: 'feature_flag', properties: {} })
			)
			return created.id
		}
		// Runtime: PREFER a real meter-credit benefit (the included MIND credits
		// on the shared mind-credits meter). Meter features are gated per
		// organization, so probe — and fall back to a plain custom benefit
		// carrying the same short title when the org has them disabled.
		try {
			const meterId = await this.ensureMindCreditsMeter()
			const credits = spec.runtime?.mindCredits ?? 0
			const created = await this.call(`create-benefit ${spec.key}`, () =>
				this.polar.benefits.create({
					...base,
					type: 'meter_credit',
					properties: { units: credits, rollover: false, meterId }
				})
			)
			return created.id
		} catch {
			const created = await this.call(`create-benefit ${spec.key} (custom fallback)`, () =>
				this.polar.benefits.create({ ...base, type: 'custom', properties: {} })
			)
			return created.id
		}
	}

	/** The one shared usage meter the runtime credits draw from. */
	private async ensureMindCreditsMeter(): Promise<string> {
		const listed = await this.call('list-meters', () => this.polar.meters.list({ limit: 100 }))
		const found = listed.result.items.find((meter) => meter.name === 'mind-credits')
		if (found) return found.id
		const created = await this.call('create-meter mind-credits', () =>
			this.polar.meters.create({
				name: 'mind-credits',
				metadata: { source: 'ssot' },
				filter: {
					conjunction: 'and',
					clauses: [{ property: 'name', operator: 'eq', value: 'mind-credits' }]
				},
				aggregation: { func: 'sum', property: 'mind' }
			})
		)
		return created.id
	}

	/** The one-off avenNAME (wire key `aven-name`) checkout for the names funnel. */
	async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
		const products = await this.ensureProducts(productSeeds())
		const productId = products['aven-name']
		if (!productId)
			throw new AppError(
				502,
				'BILLING_PRODUCT_MISSING',
				'No provider product exists for aven-name.'
			)
		const checkout = await this.call('create-checkout', () =>
			this.polar.checkouts.create({
				products: [productId],
				customerEmail: input.email,
				successUrl: input.successUrl,
				embedOrigin: new URL(this.config.PUBLIC_BASE_URL).origin,
				// Pre-selects the checkout chrome's language (Localized Checkout);
				// our product copy stays the authored German either way.
				locale: input.locale,
				metadata: { holdId: input.holdId, name: input.name }
			})
		)
		return { checkoutId: checkout.id, checkoutUrl: checkout.url }
	}

	async createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutSession> {
		const checkout = await this.call('create-subscription-checkout', () =>
			this.polar.checkouts.create({
				products: [input.productId],
				customerEmail: input.email,
				// Our user id at the provider — webhooks resolve it straight back.
				externalCustomerId: input.userId,
				successUrl: input.successUrl,
				embedOrigin: input.embedOrigin,
				// Pre-selects the checkout chrome's language (Localized Checkout).
				locale: input.locale,
				metadata: { userId: input.userId, tier: input.tier }
			})
		)
		return { checkoutId: checkout.id, checkoutUrl: checkout.url }
	}

	async cancelSubscription(providerSubscriptionId: string, immediate: boolean): Promise<void> {
		if (immediate) {
			await this.call('revoke-subscription', () =>
				this.polar.subscriptions.revoke({ id: providerSubscriptionId })
			)
			return
		}
		// German Kündigungsbutton semantics: the default keeps access until
		// the period the member already paid for runs out.
		await this.call('cancel-subscription', () =>
			this.polar.subscriptions.update({
				id: providerSubscriptionId,
				subscriptionUpdate: { cancelAtPeriodEnd: true }
			})
		)
	}

	async pauseSubscription(providerSubscriptionId: string): Promise<void> {
		// Polar guards pausing (active, no scheduled cancel, no end date) —
		// a refusal surfaces as BILLING_PROVIDER_ERROR to the pane.
		await this.call('pause-subscription', () =>
			this.polar.subscriptions.update({
				id: providerSubscriptionId,
				subscriptionUpdate: { pauseAtPeriodEnd: true }
			})
		)
	}

	async resumeSubscription(
		providerSubscriptionId: string,
		mode: 'uncancel' | 'unpause'
	): Promise<void> {
		await this.call('resume-subscription', () =>
			this.polar.subscriptions.update({
				id: providerSubscriptionId,
				subscriptionUpdate: mode === 'unpause' ? { resume: true } : { cancelAtPeriodEnd: false }
			})
		)
	}

	/** The provider's customer record for an email, if one exists — how a
	 * member who bought BEFORE we started storing customer ids (the one-off
	 * avenNAME, wire key `aven-name`) gets their history connected. */
	async findCustomerByEmail(email: string): Promise<string | null> {
		const listed = await this.call('find-customer', () =>
			this.polar.customers.list({ email, limit: 1 })
		)
		return listed.result.items[0]?.id ?? null
	}

	async listOrders(providerCustomerId: string): Promise<OrderRow[]> {
		const listed = await this.call('list-orders', () =>
			this.polar.orders.list({ customerId: providerCustomerId, limit: 100 })
		)
		return listed.result.items.map((order) => ({
			id: order.id,
			createdAt: order.createdAt.toISOString(),
			productId: order.productId ?? '',
			// Provider history is evidence, so return its metadata verbatim.
			tier:
				typeof order.product?.metadata?.tier === 'string'
					? String(order.product.metadata.tier)
					: null,
			subTotalCents: order.subtotalAmount,
			taxCents: order.taxAmount,
			discountCents: order.discountAmount,
			amountPaidCents: order.totalAmount,
			currency: order.currency,
			status: String(order.status),
			invoiceGenerated: order.isInvoiceGenerated
		}))
	}

	/** The official invoice PDF for one order — generated on first ask,
	 * then fetched (generation is asynchronous at Polar, so poll briefly). */
	async orderInvoiceUrl(orderId: string): Promise<string> {
		const fetchUrl = () => this.polar.orders.invoice({ id: orderId }).then((invoice) => invoice.url)
		try {
			return await fetchUrl()
		} catch {
			await this.call('generate-invoice', () => this.polar.orders.generateInvoice({ id: orderId }))
		}
		for (let attempt = 0; attempt < 5; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 1_000))
			try {
				return await fetchUrl()
			} catch {
				// Not ready yet — keep polling within the small window.
			}
		}
		throw new AppError(
			502,
			'BILLING_INVOICE_PENDING',
			'The invoice is still being generated — try again in a moment.'
		)
	}

	async checkoutStatus(providerCheckoutId: string): Promise<string> {
		const checkout = await this.call('checkout-status', () =>
			this.polar.checkouts.get({ id: providerCheckoutId })
		)
		return CHECKOUT_STATUS[String(checkout.status)] ?? String(checkout.status)
	}

	verifyWebhook(rawBody: string, headers: Record<string, string | null>): PaymentEvent {
		assertWebhookSignature(rawBody, headers, this.config.POLAR_WEBHOOK_SECRET)
		return parsePolarEvent(rawBody)
	}
}
