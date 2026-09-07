import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// A checkout-owned projection of the stable aven.id subject. It contains no
// credential, session, authenticator, or authorization state.
export const checkoutCustomers = pgTable('checkout_customers', {
	subjectId: text('subject_id').primaryKey(),
	email: text('email').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
})
