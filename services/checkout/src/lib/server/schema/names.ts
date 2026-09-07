// Name-registry module: permanently purchased unique names plus short-lived
// purchase holds (the honest-urgency mechanic). Owned by the server role.
import { index, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { checkoutCustomers } from './customers.js'

export const names = pgTable(
	'names',
	{
		name: text('name').primaryKey(),
		ownerUserId: text('owner_user_id')
			.notNull()
			.references(() => checkoutCustomers.subjectId),
		status: text('status').notNull(),
		checkoutId: text('checkout_id'),
		orderId: text('order_id'),
		pricePaidEur: numeric('price_paid_eur'),
		purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		revokeReason: text('revoke_reason'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
	},
	(t) => [
		index('names_owner_idx').on(t.ownerUserId),
		index('names_status_idx').on(t.status),
		index('names_checkout_idx').on(t.checkoutId)
	]
)

// Purchase requests and reservations. A row is created per request (several
// people may request the same name) and does NOT reserve anything; only
// clicking the emailed claim link — proving the inbox — sets reserved_until
// (a short, configurable window). expires_at is the claim link's validity.
export const nameHolds = pgTable(
	'name_holds',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		/** Which canonical plan CTA sent the customer here. */
		tier: text('tier').notNull().default(''),
		/** What to call them. */
		salutation: text('salutation').notNull().default(''),
		/** Free text: what they want to build. Read when deciding a wildcard invite. */
		idea: text('idea').notNull().default(''),
		claimTokenHash: text('claim_token_hash').notNull().default(''),
		successTokenHash: text('success_token_hash').notNull().default(''),
		emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
		reservedUntil: timestamp('reserved_until', { withTimezone: true }),
		checkoutId: text('checkout_id'),
		checkoutUrl: text('checkout_url'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
	},
	(t) => [
		index('name_holds_name_idx').on(t.name),
		index('name_holds_expiry_idx').on(t.expiresAt),
		index('name_holds_email_idx').on(t.email),
		index('name_holds_tier_idx').on(t.tier),
		index('name_holds_claim_token_idx').on(t.claimTokenHash),
		index('name_holds_reserved_idx').on(t.reservedUntil)
	]
)

// One-time bridge from a completed payment to a signed-in dashboard: the
// token is minted at checkout creation, rides through the provider's success
// redirect, and becomes redeemable (here, hashed, short TTL) once the grant
// lands — so the happy path never needs the email inbox.
// Payment-provider event idempotency is independent from name ownership. A
// replay is recorded once even when its domain effect is intentionally a no-op.
export const paymentEvents = pgTable(
	'payment_events',
	{
		id: text('id').primaryKey(),
		eventType: text('event_type').notNull(),
		checkoutId: text('checkout_id'),
		payload: jsonb('payload').notNull().default({}),
		processedAt: timestamp('processed_at', { withTimezone: true }).notNull()
	},
	(table) => [index('payment_events_checkout_idx').on(table.checkoutId)]
)
