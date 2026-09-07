// One file per module so a future extraction can lift a module's tables (and
// its grants in migrations/grants.sql) wholesale.
export * from './abuse.js'
export * from './billing.js'
export * from './customers.js'
export * from './email.js'
export * from './names.js'
export * from './ops.js'
export * from './webhooks.js'

import { proofOfWorkChallenges } from './abuse.js'
import { billingCheckouts, billingCustomers, subscriptions } from './billing.js'
import { checkoutCustomers } from './customers.js'
import { emailQueue } from './email.js'
import { nameHolds, names, paymentEvents } from './names.js'
import { auditEvents, workerHeartbeats } from './ops.js'
import { polarWebhookDeliveries } from './webhooks.js'

export const schema = {
	checkoutCustomers,
	billingCustomers,
	subscriptions,
	billingCheckouts,
	proofOfWorkChallenges,
	emailQueue,
	names,
	nameHolds,
	paymentEvents,
	auditEvents,
	workerHeartbeats,
	polarWebhookDeliveries
}
