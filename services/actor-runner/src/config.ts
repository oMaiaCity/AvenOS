import { z } from 'zod'

export const actorRunnerConfigSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3010),
	IDENTITY_ISSUER: z.url().default('https://aven.id'),
	IDENTITY_JWKS_URL: z.url().optional(),
	IDENTITY_AUDIENCE: z.string().min(1).default('aven-services'),
	ACTOR_RUNNER_SERVICE_BEARER_TOKEN: z.string().min(32),
	TENANT_GRANT_ISSUER: z.url().default('https://api.aven.ceo'),
	TENANT_GRANT_PUBLIC_KEY: z.string().min(1),
	CUSTOMER_DATABASE_HOST: z.string().min(1),
	CUSTOMER_DATABASE_PORT: z.coerce.number().int().positive().default(5432),
	CUSTOMER_DATABASE_SSL: z.stringbool().default(false),
	ACTOR_API_DB_CREDENTIAL_ROOT: z.string().min(32),
	ACTOR_WORKER_DB_CREDENTIAL_ROOT: z.string().min(32),
	ARTIFACT_STORE_BASE_URL: z.url(),
	ARTIFACT_STORE_BEARER_TOKEN: z.string().min(32),
	LLM_GATEWAY_BASE_URL: z.url(),
	LLM_GATEWAY_BEARER_TOKEN: z.string().min(32),
	DOCUMENT_MODEL_ID: z.string().min(1).optional()
})

export type ActorRunnerConfig = z.infer<typeof actorRunnerConfigSchema>

export const loadActorRunnerConfig = (env: NodeJS.ProcessEnv = process.env): ActorRunnerConfig =>
	actorRunnerConfigSchema.parse(env)
