// The recurring subscription, proven end to end at the unit seam: subscription
// webhooks persist idempotently PER TIER (the machinery is per-tier; the
// self-serve set has collapsed to a single tier, avenCEO), every read/action is
// scoped to the session's own user — a stranger's id never reaches provider
// or row — and the invoice URL only ever resolves the caller's own orders.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
	CheckoutInput,
	CheckoutSession,
	OrderRow,
	PaymentEvent,
	PaymentProvider,
	ProductSeed,
	SubscriptionCheckoutInput
} from '../src/lib/server/billing/provider.js'
import { parsePolarSubscriptionEvent } from '../src/lib/server/billing/provider.js'
import { SubscriptionService } from '../src/lib/server/billing/subscriptions.js'
import {
	createTestDatabase,
	type TestDatabase,
	testConfig,
	testIdentityProvisioner
} from './helpers.js'

/** Records every provider call, so the tests can assert WHICH provider
 * subscription id an action targeted — always the caller's own row. */
class StubProvider implements PaymentProvider {
	readonly kind = 'polar' as const
	calls: Array<{ method: string; args: unknown[] }> = []
	ordersByCustomer: Record<string, OrderRow[]> = {}

	private record(method: string, ...args: unknown[]) {
		this.calls.push({ method, args })
	}

	async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
		this.record('createCheckout', input)
		return { checkoutId: `ch_${input.holdId}`, checkoutUrl: 'https://sandbox.polar.sh/checkout' }
	}

	verifyWebhook(): PaymentEvent {
		throw new Error('not used in these tests')
	}

	async ensureProducts(seeds: ProductSeed[]): Promise<Record<string, string>> {
		this.record('ensureProducts', seeds)
		return Object.fromEntries(seeds.map((seed) => [seed.tier, `prod_${seed.tier}`]))
	}

	async ensureBenefits(): Promise<Record<string, number>> {
		this.record('ensureBenefits')
		return {}
	}

	async createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutSession> {
		this.record('createSubscriptionCheckout', input)
		return {
			checkoutId: `ch_${input.tier}_${input.userId.slice(0, 8)}`,
			checkoutUrl: `https://sandbox.polar.sh/checkout/${input.tier}`
		}
	}

	async cancelSubscription(id: string, immediate: boolean): Promise<void> {
		this.record('cancelSubscription', id, immediate)
	}

	async pauseSubscription(id: string): Promise<void> {
		this.record('pauseSubscription', id)
	}

	async resumeSubscription(id: string, mode: 'uncancel' | 'unpause'): Promise<void> {
		this.record('resumeSubscription', id, mode)
	}

	async findCustomerByEmail(email: string): Promise<string | null> {
		this.record('findCustomerByEmail', email)
		return null
	}

	async listOrders(customerId: string): Promise<OrderRow[]> {
		this.record('listOrders', customerId)
		return this.ordersByCustomer[customerId] ?? []
	}

	async orderInvoiceUrl(orderId: string): Promise<string> {
		this.record('orderInvoiceUrl', orderId)
		return `https://polar.sh/invoices/${orderId}.pdf`
	}

	async checkoutStatus(checkoutId: string): Promise<string> {
		this.record('checkoutStatus', checkoutId)
		return 'completed'
	}
}

function subscriptionWebhook(input: {
	subscriptionId: string
	userId: string
	email: string
	tier: string
	status: string
	cancelAtPeriodEnd?: boolean
	pauseAtPeriodEnd?: boolean
	amount?: number
}): string {
	return JSON.stringify({
		type: 'subscription.active',
		data: {
			id: input.subscriptionId,
			status: input.status,
			amount: input.amount ?? 9900,
			current_period_end: '2026-09-21T00:00:00.000Z',
			cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
			pause_at_period_end: input.pauseAtPeriodEnd ?? false,
			customer: {
				// Polar customer ids are UUIDs — the UUID guard in customerId()
				// must accept them, so the fixture reuses the user's own UUID.
				id: input.userId,
				email: input.email,
				external_id: input.userId
			},
			product: { id: `prod_${input.tier}`, metadata: { tier: input.tier } },
			metadata: { userId: input.userId, tier: input.tier }
		}
	})
}

describe('subscription state', () => {
	let database: TestDatabase
	beforeAll(async () => {
		database = await createTestDatabase()
	})
	afterAll(async () => {
		await database.teardown()
	})

	async function insertUser(): Promise<{ id: string; email: string }> {
		const id = randomUUID()
		const email = `u${id.slice(0, 8)}@example.test`
		await database.pool.query(
			`INSERT INTO checkout_customers(subject_id,email,created_at,updated_at)
			 VALUES($1,$2,now(),now())`,
			[id, email]
		)
		return { id, email }
	}

	async function applyWebhook(
		service: SubscriptionService,
		input: Parameters<typeof subscriptionWebhook>[0]
	) {
		const event = parsePolarSubscriptionEvent(subscriptionWebhook(input))
		if (!event) throw new Error('event did not parse')
		return service.applyEvent(event)
	}

	it('applies a subscription webhook idempotently and scopes /me to the owner', async () => {
		const provider = new StubProvider()
		const service = new SubscriptionService(
			database.pool,
			testConfig(),
			provider,
			testIdentityProvisioner()
		)
		const alice = await insertUser()
		const bob = await insertUser()
		const subscriptionId = `sub_${randomUUID()}`

		expect(
			await applyWebhook(service, {
				subscriptionId,
				userId: alice.id,
				email: alice.email,
				tier: 'aven-ceo',
				status: 'active'
			})
		).toEqual({ applied: true })
		// Replay: same event twice → still exactly one row, same state.
		expect(
			await applyWebhook(service, {
				subscriptionId,
				userId: alice.id,
				email: alice.email,
				tier: 'aven-ceo',
				status: 'active'
			})
		).toEqual({ applied: true })
		const rows = await database.pool.query('SELECT * FROM subscriptions WHERE user_id=$1', [
			alice.id
		])
		expect(rows.rows).toHaveLength(1)
		expect(rows.rows[0].tier).toBe('aven-ceo')
		expect(rows.rows[0].price_eur_cents).toBe(9900)

		// The customer key was captured — the handle every portal call hangs on.
		const customer = await database.pool.query(
			'SELECT provider_customer_id FROM billing_customers WHERE user_id=$1',
			[alice.id]
		)
		expect(customer.rows[0].provider_customer_id).toBe(alice.id)

		// Self-service isolation: the owner sees their standing, a stranger
		// sees nothing — there is no parameter that reaches alice's row.
		const mine = await service.me(alice.id)
		expect(mine).toHaveLength(1)
		expect(mine[0]).toMatchObject({ tier: 'aven-ceo', status: 'active' })
		expect(await service.me(bob.id)).toEqual([])
	})

	it('a same-tier duplicate is refused, and an ended subscription frees the tier again', async () => {
		// Subscriptions are keyed per tier, but the self-serve set has collapsed
		// to a single tier (avenCEO): the old "two tiers coexist on one account"
		// assertion can no longer be expressed, so this now proves the per-tier
		// duplicate guard and the release-on-end path against the one tier left.
		const provider = new StubProvider()
		const service = new SubscriptionService(
			database.pool,
			testConfig(),
			provider,
			testIdentityProvisioner()
		)
		const alice = await insertUser()

		await applyWebhook(service, {
			subscriptionId: `sub_${randomUUID()}`,
			userId: alice.id,
			email: alice.email,
			tier: 'aven-ceo',
			status: 'active',
			amount: 9900
		})

		const mine = await service.me(alice.id)
		expect(mine.map((standing) => standing.tier)).toEqual(['aven-ceo'])
		expect(mine.find((standing) => standing.tier === 'aven-ceo')?.priceEurCents).toBe(9900)

		// A second booking of the SAME tier is refused while one stands.
		await expect(service.subscribe(alice, 'aven-ceo')).rejects.toMatchObject({
			code: 'SUBSCRIPTION_EXISTS'
		})
		// An ended subscription frees the tier again.
		const endedId = `sub_${randomUUID()}`
		const carol = await insertUser()
		await applyWebhook(service, {
			subscriptionId: endedId,
			userId: carol.id,
			email: carol.email,
			tier: 'aven-ceo',
			status: 'canceled'
		})
		const started = await service.subscribe(carol, 'aven-ceo')
		expect(started.checkoutUrl).toContain('/checkout/aven-ceo')
	})

	it('rejects every non-canonical subscription tier', async () => {
		const provider = new StubProvider()
		const service = new SubscriptionService(
			database.pool,
			testConfig(),
			provider,
			testIdentityProvisioner()
		)
		const user = await insertUser()
		for (const unknown of ['avenceo', 'avenme', 'aven-coop', 'nonsense']) {
			await expect(service.subscribe(user, unknown)).rejects.toMatchObject({
				code: 'VALIDATION_ERROR'
			})
		}
	})

	it('actions are tier-scoped and resolve the provider id from the caller’s own row', async () => {
		// The self-serve set has collapsed to a single tier (avenCEO), so the
		// cross-tier isolation the old version asserted (an action on one tier
		// never touching another) can no longer be expressed with two tiers.
		// What remains — the provider id is taken from the caller's OWN row, the
		// resume mode is picked from that row, and a stranger reaches nothing —
		// is exercised against the one remaining tier.
		const provider = new StubProvider()
		const service = new SubscriptionService(
			database.pool,
			testConfig(),
			provider,
			testIdentityProvisioner()
		)
		const alice = await insertUser()
		const bob = await insertUser()
		const ceoId = `sub_ceo_${randomUUID()}`
		await applyWebhook(service, {
			subscriptionId: ceoId,
			userId: alice.id,
			email: alice.email,
			tier: 'aven-ceo',
			status: 'active',
			cancelAtPeriodEnd: true
		})

		// Cancel targets HER row — the id comes from the row, not the caller.
		await service.cancel(alice.id, 'aven-ceo')
		expect(provider.calls.at(-1)).toEqual({ method: 'cancelSubscription', args: [ceoId, false] })
		await service.cancel(alice.id, 'aven-ceo', true)
		expect(provider.calls.at(-1)).toEqual({ method: 'cancelSubscription', args: [ceoId, true] })

		// Resume picks the mode from the row: a scheduled cancel → uncancel.
		await service.resume(alice.id, 'aven-ceo')
		expect(provider.calls.at(-1)).toEqual({
			method: 'resumeSubscription',
			args: [ceoId, 'uncancel']
		})

		// Pause targets the tier's own subscription; once the row is
		// pause-scheduled, resume switches to unpause.
		await service.pause(alice.id, 'aven-ceo')
		expect(provider.calls.at(-1)).toEqual({ method: 'pauseSubscription', args: [ceoId] })
		await applyWebhook(service, {
			subscriptionId: ceoId,
			userId: alice.id,
			email: alice.email,
			tier: 'aven-ceo',
			status: 'active',
			pauseAtPeriodEnd: true
		})
		expect((await service.me(alice.id)).find((x) => x.tier === 'aven-ceo')?.pauseAtPeriodEnd).toBe(
			true
		)
		await service.resume(alice.id, 'aven-ceo')
		expect(provider.calls.at(-1)).toEqual({
			method: 'resumeSubscription',
			args: [ceoId, 'unpause']
		})

		// A stranger cannot act at all: bob holds nothing, so the service
		// refuses before any provider call could happen.
		await expect(service.cancel(bob.id, 'aven-ceo')).rejects.toMatchObject({
			code: 'SUBSCRIPTION_MISSING'
		})
		await expect(service.resume(bob.id, 'aven-ceo')).rejects.toMatchObject({
			code: 'SUBSCRIPTION_MISSING'
		})
		// And an unknown tier never reaches the database.
		await expect(service.cancel(alice.id, 'aven-coop')).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		})
	})

	it('orders and the invoice URL resolve strictly against the caller’s own customer', async () => {
		const provider = new StubProvider()
		const service = new SubscriptionService(
			database.pool,
			testConfig(),
			provider,
			testIdentityProvisioner()
		)
		const alice = await insertUser()
		const bob = await insertUser()
		await applyWebhook(service, {
			subscriptionId: `sub_${randomUUID()}`,
			userId: alice.id,
			email: alice.email,
			tier: 'aven-ceo',
			status: 'active'
		})
		const customerId = alice.id
		provider.ordersByCustomer[customerId] = [
			{
				id: 'ord_1',
				createdAt: '2026-08-24T00:00:00.000Z',
				productId: 'prod_aven_ceo',
				tier: 'aven-ceo',
				subTotalCents: 31681,
				taxCents: 6019,
				discountCents: 0,
				amountPaidCents: 9900,
				currency: 'eur',
				status: 'paid',
				invoiceGenerated: false
			}
		]

		const orders = await service.orders(alice)
		expect(orders).toHaveLength(1)
		expect(orders[0]).toMatchObject({ id: 'ord_1', tier: 'aven-ceo', amountPaidCents: 9900 })
		expect(provider.calls.at(-1)).toEqual({ method: 'listOrders', args: [customerId] })

		// The invoice URL: an owned order id resolves; a foreign or invented
		// one is simply not found — it never reaches the provider.
		const url = await service.orderInvoiceUrl(alice, 'ord_1')
		expect(url).toBe('https://polar.sh/invoices/ord_1.pdf')
		const before = provider.calls.length
		await expect(service.orderInvoiceUrl(alice, 'ord_foreign')).rejects.toMatchObject({
			code: 'ORDER_MISSING'
		})
		expect(
			provider.calls.slice(before).filter((call) => call.method === 'orderInvoiceUrl')
		).toHaveLength(0)

		// Bob has no customer row → empty history, no provider call with a
		// guessed id (the only lookup is by his own email).
		expect(await service.orders(bob)).toEqual([])
		expect(provider.calls.at(-1)).toEqual({ method: 'findCustomerByEmail', args: [bob.email] })

		// A stored provider id is authoritative for this fresh database.
		const carl = await insertUser()
		await database.pool.query(
			'INSERT INTO billing_customers (user_id, provider_customer_id) VALUES ($1,$2)',
			[carl.id, '11111111-1111-4111-8111-111111111111']
		)
		expect(await service.orders(carl)).toEqual([])
		expect(
			provider.calls.filter(
				(c) => c.method === 'listOrders' && c.args[0] === '11111111-1111-4111-8111-111111111111'
			)
		).toHaveLength(1)
	})

	it('reports the session’s own latest checkout without accepting an id', async () => {
		const provider = new StubProvider()
		const service = new SubscriptionService(
			database.pool,
			testConfig(),
			provider,
			testIdentityProvisioner()
		)
		const carol = await insertUser()
		const dave = await insertUser()

		const started = await service.subscribe(carol, 'aven-ceo', 'http://127.0.0.1:1420', 'de')
		expect(started.checkoutUrl).toContain('/checkout/aven-ceo')
		// The embed origin travels to the provider — Polar validates it
		// against the org's allowlist; it authorizes nothing on our side.
		// The locale rides along too and only picks the checkout language.
		const checkoutCall = provider.calls.find((c) => c.method === 'createSubscriptionCheckout')
		expect(checkoutCall?.args[0]).toMatchObject({
			tier: 'aven-ceo',
			userId: carol.id,
			embedOrigin: 'http://127.0.0.1:1420',
			locale: 'de'
		})

		expect(await service.checkoutStatus(carol.id)).toEqual({ status: 'completed' })
		expect(provider.calls.at(-1)).toEqual({
			method: 'checkoutStatus',
			args: [`ch_aven-ceo_${carol.id.slice(0, 8)}`]
		})
		// dave never started one: null, and no provider call with a guessed id.
		const before = provider.calls.length
		expect(await service.checkoutStatus(dave.id)).toBeNull()
		expect(provider.calls.length).toBe(before)
	})
})
