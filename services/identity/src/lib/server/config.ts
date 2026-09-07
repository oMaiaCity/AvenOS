import { z } from 'zod'

const bool = z.enum(['true', 'false']).transform((value) => value === 'true')
const fingerprints = z
	.string()
	.default('')
	.transform((value) =>
		value
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean)
	)
const provisioningSecrets = z.string().transform((value, context) => {
	const secrets = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
	if (!secrets.length || secrets.some((secret) => secret.length < 32)) {
		context.addIssue({ code: 'custom', message: 'must contain secrets of at least 32 characters' })
		return z.NEVER
	}
	if (new Set(secrets).size !== secrets.length) {
		context.addIssue({ code: 'custom', message: 'must not contain duplicate secrets' })
		return z.NEVER
	}
	return secrets
})

export const identityConfigSchema = z
	.object({
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		PUBLIC_BASE_URL: z.url().default('http://localhost:3100'),
		WEBAUTHN_RP_ID: z.string().min(1).default('localhost'),
		TRUSTED_WEB_ORIGINS: z.string().default(''),
		ANDROID_APP_CERT_SHA256_FINGERPRINTS: fingerprints,
		DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
		ACCOUNTS_DATABASE_URL: z
			.string()
			.regex(/^postgres(ql)?:\/\//)
			.optional(),
		AUTHORIZATION_DATABASE_URL: z
			.string()
			.regex(/^postgres(ql)?:\/\//)
			.optional(),
		MIGRATOR_DATABASE_URL: z
			.string()
			.regex(/^postgres(ql)?:\/\//)
			.optional(),
		BETTER_AUTH_SECRET: z.string().min(32),
		BACKUP_HEALTH_FILE: z.string().optional(),
		IDENTITY_PROVISIONING_SECRETS: provisioningSecrets,
		IDENTITY_MAIL_ORIGINS: z
			.string()
			.default('')
			.transform((value) =>
				value
					.split(',')
					.map((v) => v.trim())
					.filter(Boolean)
			),
		REQUIRE_PASSKEY_PRF: bool.default(false),
		SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(43_200),
		SESSION_UPDATE_AGE_SECONDS: z.coerce.number().int().positive().default(3_600),
		ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
		POW_DIFFICULTY_BITS: z.coerce.number().int().min(8).max(28).default(16),
		POW_CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(300),
		LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
	})
	.superRefine((config, context) => {
		if (
			config.IDENTITY_MAIL_ORIGINS.length &&
			config.IDENTITY_MAIL_ORIGINS.length !== config.IDENTITY_PROVISIONING_SECRETS.length
		)
			context.addIssue({
				code: 'custom',
				path: ['IDENTITY_MAIL_ORIGINS'],
				message: 'must match provisioning-secret order and count'
			})
		for (const value of config.IDENTITY_MAIL_ORIGINS) {
			try {
				const url = new URL(value)
				if (
					url.origin !== value ||
					url.username ||
					url.password ||
					(url.protocol !== 'https:' &&
						!(config.NODE_ENV !== 'production' && url.protocol === 'http:'))
				)
					throw new Error('origin')
			} catch {
				context.addIssue({
					code: 'custom',
					path: ['IDENTITY_MAIL_ORIGINS'],
					message: 'must contain fixed HTTPS origins (HTTP only outside production)'
				})
			}
		}
		const origin = new URL(config.PUBLIC_BASE_URL)
		if (origin.pathname !== '/' || origin.search || origin.hash)
			context.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'must be an origin' })
		if (origin.hostname !== config.WEBAUTHN_RP_ID)
			context.addIssue({
				code: 'custom',
				path: ['WEBAUTHN_RP_ID'],
				message: 'must equal the public hostname'
			})
		if (config.NODE_ENV === 'production' && origin.protocol !== 'https:')
			context.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'must use HTTPS' })
		if (config.NODE_ENV === 'production') {
			if (!config.IDENTITY_MAIL_ORIGINS.length)
				context.addIssue({
					code: 'custom',
					path: ['IDENTITY_MAIL_ORIGINS'],
					message: 'security mail delivery is required in production'
				})
			for (const key of ['ACCOUNTS_DATABASE_URL', 'AUTHORIZATION_DATABASE_URL'] as const)
				if (!config[key])
					context.addIssue({
						code: 'custom',
						path: [key],
						message: 'is required in production for database-role separation'
					})
			const urls = [
				config.DATABASE_URL,
				config.ACCOUNTS_DATABASE_URL,
				config.AUTHORIZATION_DATABASE_URL
			]
				.filter(Boolean)
				.map((value) => new URL(value as string).username)
			if (new Set(urls).size !== urls.length)
				context.addIssue({
					code: 'custom',
					path: ['DATABASE_URL'],
					message: 'identity functions must use distinct database users'
				})
		}
	})

export type IdentityConfig = z.infer<typeof identityConfigSchema>

export function loadIdentityConfig(env: NodeJS.ProcessEnv = process.env): IdentityConfig {
	return identityConfigSchema.parse(env)
}

export function trustedOrigins(config: IdentityConfig): string[] {
	return [
		config.PUBLIC_BASE_URL,
		...config.TRUSTED_WEB_ORIGINS.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean)
	]
}
