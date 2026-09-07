import { bigserial, boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { checkoutCustomers } from './customers.js'

export const billingCustomers = pgTable('billing_customers', {
	userId: text('user_id')
		.primaryKey()
		.references(() => checkoutCustomers.subjectId, { onDelete: 'cascade' }),
	providerCustomerId: text('provider_customer_id').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const subscriptions = pgTable(
	'subscriptions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => checkoutCustomers.subjectId, { onDelete: 'cascade' }),
		providerSubscriptionId: text('provider_subscription_id').notNull().unique(),
		tier: text('tier').notNull(),
		status: text('status').notNull(),
		currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
		cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
		pauseAtPeriodEnd: boolean('pause_at_period_end').notNull().default(false),
		priceEurCents: integer('price_eur_cents').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('subscriptions_user_idx').on(table.userId)]
)

export const billingCheckouts = pgTable(
	'billing_checkouts',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => checkoutCustomers.subjectId, { onDelete: 'cascade' }),
		checkoutId: text('checkout_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('billing_checkouts_user_idx').on(table.userId, table.createdAt)]
)
