import { z } from 'zod'

const postgres = z.string().regex(/^postgres(ql)?:\/\//)
const root = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/)

export const provisionerConfigSchema = z.object({
	CLUSTER_DATABASE_URL: postgres,
	CONTROL_DATABASE_URL: postgres,
	INTENTS_API_DB_CREDENTIAL_ROOT: root,
	ACTOR_API_DB_CREDENTIAL_ROOT: root,
	ACTOR_WORKER_DB_CREDENTIAL_ROOT: root,
	ARTIFACT_API_DB_CREDENTIAL_ROOT: root,
	ARTIFACT_STORE_PROVISIONER_DATABASE_ROLE: z
		.string()
		.regex(/^[a-z][a-z0-9_]{0,62}$/)
		.default('aven_artifact_store_provisioner'),
	BACKUP_DATABASE_ROLE: z
		.string()
		.regex(/^[a-z][a-z0-9_]{0,62}$/)
		.default('aven_backup'),
	ARTIFACT_STORE_PROVISIONER_URL: z.url(),
	ARTIFACT_STORE_PROVISIONER_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
	PROVISIONER_INSTANCE_ID: z.string().min(1).max(128).optional(),
	PROVISIONER_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(60_000).default(500),
	PROVISIONER_LEASE_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
	PROVISIONER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
})

export type ProvisionerConfig = z.infer<typeof provisionerConfigSchema>
export const loadProvisionerConfig = (env: NodeJS.ProcessEnv = process.env) =>
	provisionerConfigSchema.parse(env)
