import { plan } from '@myavenceo/aven-ceo/pricing'
import { z } from 'zod'

const bool = z.enum(['true', 'false']).transform((value) => value === 'true')
const positiveInt = z.coerce.number().int().positive()
const postgresUrl = z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres URL')

function validEncryptionKey(value: string): boolean {
	try {
		return Buffer.from(value, 'base64').length === 32
	} catch {
		return false
	}
}

export const serverConfigSchema = z
	.object({
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		PUBLIC_BASE_URL: z.url(),
		IDENTITY_ISSUER: z.url().default('https://aven.id'),
		IDENTITY_JWKS_URL: z.url().optional(),
		IDENTITY_INTERNAL_URL: z.url().optional(),
		IDENTITY_AUDIENCE: z.string().min(1).default('aven-services'),
		IDENTITY_PROVISIONING_SECRET: z.string().min(32).default('dev-identity-provisioning-secret'),
		FACADE_BEARER_TOKEN: z
			.string()
			.regex(/^[A-Za-z0-9_-]{32,128}$/)
			.optional(),
		DOWNLOAD_URL: z.string().default(''),
		LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
		APPLICATION_VERSION: z.string().min(1).default('0.1.0'),
		DATABASE_URL: postgresUrl,
		WEBHOOK_DATABASE_URL: postgresUrl.optional(),
		MIGRATOR_DATABASE_URL: postgresUrl.optional(),
		EMAIL_WORKER_DATABASE_URL: postgresUrl.optional(),
		PLATFORM_EVENT_WORKER_DATABASE_URL: postgresUrl.optional(),
		PLATFORM_API_INTERNAL_URL: z.url().default('http://api:3000'),
		PLATFORM_EVENT_TOKEN: z
			.string()
			.regex(/^[A-Za-z0-9_-]{32,128}$/)
			.optional(),
		PLATFORM_EVENT_WORKER_POLL_INTERVAL_MS: positiveInt.default(500),
		PLATFORM_EVENT_WORKER_LEASE_SECONDS: positiveInt.default(30),
		PLATFORM_EVENT_WORKER_MAX_ATTEMPTS: positiveInt.default(20),
		POW_DIFFICULTY_BITS: z.coerce.number().int().min(8).max(28).default(16),
		POW_CHALLENGE_TTL_SECONDS: positiveInt.default(300),
		EMAIL_QUEUE_ENCRYPTION_KEY: z.string().default(''),
		EMAIL_MAX_ATTEMPTS: positiveInt.default(10),
		EMAIL_WORKER_STALE_SECONDS: positiveInt.default(45),
		SMTP_URL: z.string().default(''),
		SMTP_FROM: z.string().default(''),
		SMTP_REPLY_TO: z.string().optional().or(z.literal('')),
		EMAIL_WORKER_POLL_INTERVAL_MS: positiveInt.default(1_000),
		EMAIL_WORKER_BATCH_SIZE: positiveInt.default(10),
		EMAIL_WORKER_LEASE_SECONDS: positiveInt.default(120),
		EMAIL_WORKER_HEARTBEAT_SECONDS: positiveInt.default(10),
		EMAIL_RETRY_BASE_SECONDS: positiveInt.default(30),
		EMAIL_RETRY_MAX_SECONDS: positiveInt.default(21_600),
		ALLOW_FAKE_PAYMENTS: bool.default(false),
		NAME_PRICE_EUR: z.coerce.number().positive().default(25),
		NAME_HOLD_TTL_HOURS: positiveInt.default(24),
		NAME_RESERVATION_TTL_MINUTES: positiveInt.default(5),
		POLAR_API_KEY: z.string().default(''),
		POLAR_SERVER: z.enum(['sandbox', 'production']).default('sandbox'),
		POLAR_ORGANIZATION_ID: z.string().default(''),
		POLAR_WEBHOOK_SECRET: z.string().min(8).default('dev-fake-webhook-secret')
	})
	.superRefine((config, context) => {
		const publicUrl = new URL(config.PUBLIC_BASE_URL)
		if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash)
			context.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'must be an origin' })
		if (config.NODE_ENV === 'production' && publicUrl.protocol !== 'https:')
			context.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'must use HTTPS' })
	})

const apiConfigSchema = serverConfigSchema.superRefine((config, context) => {
	if (config.NODE_ENV === 'production' && !config.WEBHOOK_DATABASE_URL)
		context.addIssue({
			code: 'custom',
			path: ['WEBHOOK_DATABASE_URL'],
			message: 'is required in production for database-role separation'
		})
	if (
		config.WEBHOOK_DATABASE_URL &&
		new URL(config.WEBHOOK_DATABASE_URL).username === new URL(config.DATABASE_URL).username
	)
		context.addIssue({
			code: 'custom',
			path: ['WEBHOOK_DATABASE_URL'],
			message: 'must use a database user distinct from checkout HTTP'
		})
})

export type ServerConfig = z.infer<typeof serverConfigSchema>

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
	return serverConfigSchema.parse(env)
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
	const config = apiConfigSchema.parse(env)
	if (!validEncryptionKey(config.EMAIL_QUEUE_ENCRYPTION_KEY))
		throw new Error('EMAIL_QUEUE_ENCRYPTION_KEY must decode to 32 bytes.')
	if (!config.DOWNLOAD_URL && config.NODE_ENV === 'production')
		throw new Error('DOWNLOAD_URL is required.')
	if (
		config.NODE_ENV === 'production' &&
		Buffer.from(config.EMAIL_QUEUE_ENCRYPTION_KEY, 'base64').every((byte) => byte === 0)
	)
		throw new Error('EMAIL_QUEUE_ENCRYPTION_KEY must not be the all-zero key.')
	if (config.NODE_ENV === 'production' && !config.POLAR_API_KEY && !config.ALLOW_FAKE_PAYMENTS)
		throw new Error('POLAR_API_KEY is required.')
	if (config.NODE_ENV === 'production' && !config.FACADE_BEARER_TOKEN)
		throw new Error('FACADE_BEARER_TOKEN is required.')
	if (config.POLAR_API_KEY && config.POLAR_WEBHOOK_SECRET === 'dev-fake-webhook-secret')
		throw new Error('POLAR_WEBHOOK_SECRET is required.')
	if (config.NAME_PRICE_EUR !== plan('aven-name').eurPrice)
		throw new Error('NAME_PRICE_EUR must match the avenNAME price in @myavenceo/aven-ceo/pricing.')
	return config
}

export function loadEmailWorkerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
	const config = loadServerConfig(env)
	if (!validEncryptionKey(config.EMAIL_QUEUE_ENCRYPTION_KEY))
		throw new Error('EMAIL_QUEUE_ENCRYPTION_KEY must decode to 32 bytes.')
	if (!config.SMTP_URL || !config.SMTP_FROM) throw new Error('SMTP_URL and SMTP_FROM are required.')
	return config
}

export function loadPlatformEventWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
	const config = loadServerConfig(env)
	if (!config.PLATFORM_EVENT_WORKER_DATABASE_URL || !config.PLATFORM_EVENT_TOKEN)
		throw new Error('PLATFORM_EVENT_WORKER_DATABASE_URL and PLATFORM_EVENT_TOKEN are required.')
	return config as ServerConfig & {
		PLATFORM_EVENT_WORKER_DATABASE_URL: string
		PLATFORM_EVENT_TOKEN: string
	}
}

export type EmailWorkerConfig = Pick<
	ServerConfig,
	| 'APPLICATION_VERSION'
	| 'SMTP_URL'
	| 'SMTP_FROM'
	| 'SMTP_REPLY_TO'
	| 'EMAIL_WORKER_POLL_INTERVAL_MS'
	| 'EMAIL_WORKER_BATCH_SIZE'
	| 'EMAIL_WORKER_LEASE_SECONDS'
	| 'EMAIL_WORKER_HEARTBEAT_SECONDS'
	| 'EMAIL_RETRY_BASE_SECONDS'
	| 'EMAIL_RETRY_MAX_SECONDS'
>
export type NotifierConfig = Pick<ServerConfig, 'PUBLIC_BASE_URL'>
export type BillingConfig = Pick<
	ServerConfig,
	| 'PUBLIC_BASE_URL'
	| 'POLAR_API_KEY'
	| 'POLAR_SERVER'
	| 'POLAR_ORGANIZATION_ID'
	| 'POLAR_WEBHOOK_SECRET'
>
export type NameServiceConfig = Pick<
	ServerConfig,
	'PUBLIC_BASE_URL' | 'NAME_PRICE_EUR' | 'NAME_HOLD_TTL_HOURS' | 'NAME_RESERVATION_TTL_MINUTES'
>
