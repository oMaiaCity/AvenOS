import { IdentityProvisioningClient, IdentityVerifier } from '@avenos/aven-identity'
import pino from 'pino'
import { createPaymentProvider } from './billing/fake.js'
import type { PaymentProvider } from './billing/provider.js'
import { SubscriptionService } from './billing/subscriptions.js'
import { PolarWebhookDeliveryStore } from './billing/webhook-deliveries.js'
import { CheckoutCapabilities } from './capabilities.js'
import { loadApiConfig, type ServerConfig } from './config.js'
import { decodeEncryptionKey } from './crypto.js'
import { type DatabaseContext, openDatabase } from './db.js'
import type { QueueSettings } from './email/queue.js'
import { NameService } from './names/service.js'
import { createNotifier, type Notifier } from './notifications.js'
import { enqueuePlatformEvent } from './platform-events.js'
import { ProofOfWorkService } from './proof-of-work.js'

export interface Runtime {
	capabilities: CheckoutCapabilities
	config: ServerConfig
	logger: pino.Logger
	database: DatabaseContext
	webhookDatabase: DatabaseContext
	queueSettings: QueueSettings
	notifier: Notifier
	identityVerifier: IdentityVerifier
	identityProvisioner: IdentityProvisioningClient
	proofOfWork: ProofOfWorkService
	payments: PaymentProvider
	names: NameService
	webhookNames: NameService
	subscriptions: SubscriptionService
	webhookSubscriptions: SubscriptionService
	webhookDeliveries: PolarWebhookDeliveryStore
	shutdown(): Promise<void>
}

const KEY = Symbol.for('aven.checkout.runtime')

async function create(): Promise<Runtime> {
	const config = loadApiConfig()
	const logger = pino({
		level: config.LOG_LEVEL,
		redact: {
			paths: ['password', 'token', 'secret', 'authorization', 'cookie'],
			censor: '[REDACTED]'
		}
	})
	const database = openDatabase(config.DATABASE_URL, {
		onError: (error) => logger.warn({ err: error.message }, 'database connection error')
	})
	const webhookDatabase = openDatabase(config.WEBHOOK_DATABASE_URL ?? config.DATABASE_URL, {
		onError: (error) => logger.warn({ err: error.message }, 'webhook database connection error')
	})
	const queueSettings: QueueSettings = {
		key: decodeEncryptionKey(config.EMAIL_QUEUE_ENCRYPTION_KEY),
		maxAttempts: config.EMAIL_MAX_ATTEMPTS
	}
	const notifier = createNotifier(config, queueSettings)
	const proofOfWork = new ProofOfWorkService(
		database.pool,
		config.POW_DIFFICULTY_BITS,
		config.POW_CHALLENGE_TTL_SECONDS
	)
	const payments = createPaymentProvider(config)
	const identityVerifier = new IdentityVerifier({
		issuer: config.IDENTITY_ISSUER,
		jwksUrl: config.IDENTITY_JWKS_URL,
		audience: config.IDENTITY_AUDIENCE
	})
	const identityProvisioner = new IdentityProvisioningClient(
		config.IDENTITY_INTERNAL_URL ?? config.IDENTITY_ISSUER,
		config.IDENTITY_PROVISIONING_SECRET
	)
	const subscriptions = new SubscriptionService(
		database.pool,
		config,
		payments,
		identityProvisioner
	)
	const names = new NameService(
		database.pool,
		config,
		notifier,
		payments,
		(email, source) => identityProvisioner.provisionVerifiedAccount(email, source),
		(client, input) => enqueuePlatformEvent(client, { ...input, eventType: 'purchase_granted' }),
		(client, input) => enqueuePlatformEvent(client, { ...input, eventType: 'purchase_revoked' })
	)
	const webhookSubscriptions = new SubscriptionService(
		webhookDatabase.pool,
		config,
		payments,
		identityProvisioner
	)
	const webhookNames = new NameService(
		webhookDatabase.pool,
		config,
		notifier,
		payments,
		(email, source) => identityProvisioner.provisionVerifiedAccount(email, source),
		(client, input) => enqueuePlatformEvent(client, { ...input, eventType: 'purchase_granted' }),
		(client, input) => enqueuePlatformEvent(client, { ...input, eventType: 'purchase_revoked' })
	)
	if (payments.kind === 'fake') logger.warn('fake payments enabled')
	const capabilities = new CheckoutCapabilities(database.pool, config)
	capabilities.start()

	return {
		capabilities,
		config,
		logger,
		database,
		webhookDatabase,
		queueSettings,
		notifier,
		identityVerifier,
		identityProvisioner,
		proofOfWork,
		payments,
		names,
		webhookNames,
		subscriptions,
		webhookSubscriptions,
		webhookDeliveries: new PolarWebhookDeliveryStore(webhookDatabase.pool),
		async shutdown() {
			capabilities.stop()
			await Promise.all([database.pool.end(), webhookDatabase.pool.end()])
		}
	}
}

export function runtime(): Promise<Runtime> {
	const holder = globalThis as Record<symbol, unknown>
	if (!holder[KEY]) holder[KEY] = create()
	return holder[KEY] as Promise<Runtime>
}
