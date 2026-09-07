// Local stand-in for Polar when no API key is configured: the "checkout" is a
// page served by this app, and paying there posts a correctly signed,
// Polar-shaped webhook back to our own webhook endpoint — so development and
// e2e exercise the identical grant path as production.
import { randomUUID } from 'node:crypto'
import type { BillingConfig } from '../config.js'
import { PolarProvider } from './polar.js'
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

export class FakePaymentProvider implements PaymentProvider {
	readonly kind = 'fake' as const
	constructor(private config: BillingConfig) {}

	async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
		const checkoutId = `fake_${randomUUID()}`
		const url = new URL('/purchase/fake-checkout', this.config.PUBLIC_BASE_URL)
		url.searchParams.set('checkoutId', checkoutId)
		url.searchParams.set('holdId', input.holdId)
		url.searchParams.set('name', input.name)
		url.searchParams.set('email', input.email)
		url.searchParams.set('successUrl', input.successUrl)
		return { checkoutId, checkoutUrl: url.toString() }
	}

	verifyWebhook(rawBody: string, headers: Record<string, string | null>): PaymentEvent {
		assertWebhookSignature(rawBody, headers, this.config.POLAR_WEBHOOK_SECRET)
		return parsePolarEvent(rawBody)
	}

	// The subscription surface in fake mode is deterministic and local: stable
	// per-tier product ids, a checkout URL on our own fake page, and actions
	// that succeed silently — state still only ever changes via the webhook,
	// exactly like production.
	async ensureProducts(seeds: ProductSeed[]): Promise<Record<string, string>> {
		return Object.fromEntries(seeds.map((seed) => [seed.tier, `fake_prod_${seed.tier}`]))
	}

	/** Benefits only exist at the real provider — nothing to sync locally. */
	async ensureBenefits(): Promise<Record<string, number>> {
		return {}
	}

	async createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutSession> {
		const checkoutId = `fake_${randomUUID()}`
		const url = new URL('/purchase/fake-checkout', this.config.PUBLIC_BASE_URL)
		url.searchParams.set('checkoutId', checkoutId)
		url.searchParams.set('tier', input.tier)
		url.searchParams.set('userId', input.userId)
		url.searchParams.set('email', input.email)
		url.searchParams.set('successUrl', input.successUrl)
		return { checkoutId, checkoutUrl: url.toString() }
	}

	async cancelSubscription(): Promise<void> {}
	async pauseSubscription(): Promise<void> {}
	async resumeSubscription(): Promise<void> {}

	async findCustomerByEmail(): Promise<string | null> {
		return null
	}

	async listOrders(): Promise<OrderRow[]> {
		return []
	}

	async orderInvoiceUrl(): Promise<string> {
		return new URL('/purchase/fake-checkout', this.config.PUBLIC_BASE_URL).toString()
	}

	async checkoutStatus(): Promise<string> {
		return 'pending'
	}

	/** A Polar-shaped `order.paid` body for the local grant path. */
	buildCompletedWebhookBody(input: {
		checkoutId: string
		holdId: string
		name: string
		email: string
		amountEur: number
	}): string {
		return JSON.stringify({
			type: 'order.paid',
			data: {
				id: `ord_fake_${randomUUID()}`,
				checkout_id: input.checkoutId,
				status: 'paid',
				paid: true,
				total_amount: Math.round(input.amountEur * 100),
				currency: 'eur',
				customer: { id: `cus_fake_${randomUUID()}`, email: input.email },
				metadata: { holdId: input.holdId, name: input.name }
			}
		})
	}
}

export function createPaymentProvider(config: BillingConfig): PaymentProvider {
	return config.POLAR_API_KEY ? new PolarProvider(config) : new FakePaymentProvider(config)
}
