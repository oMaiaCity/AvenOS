import { z } from 'zod'

export const intentServiceConfigSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3010),
	CUSTOMER_DATABASE_HOST: z.string().min(1),
	CUSTOMER_DATABASE_PORT: z.coerce.number().int().positive().default(5432),
	CUSTOMER_DATABASE_SSL: z.stringbool().default(false),
	INTENT_DATABASE_CREDENTIAL_ROOT: z.string().min(32),
	INTENT_SERVICE_BEARER_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
	IDENTITY_ISSUER: z.url().default('https://aven.id'),
	IDENTITY_JWKS_URL: z.url().optional(),
	IDENTITY_AUDIENCE: z.string().min(1).default('aven-services'),
	TENANT_GRANT_ISSUER: z.url().default('https://api.aven.ceo'),
	TENANT_GRANT_PUBLIC_KEY: z.string().min(1)
})

export type IntentServiceConfig = z.infer<typeof intentServiceConfigSchema>
export const loadIntentServiceConfig = (env: NodeJS.ProcessEnv = process.env) =>
	intentServiceConfigSchema.parse(env)
