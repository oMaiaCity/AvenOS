import { componentRefSchema } from '@avenos/aven-customer-contracts'
import { z } from 'zod'

const target = z.object({
	prefix: z.string().regex(/^\/(?:api|v1)\/[a-z0-9][a-z0-9/-]*$/),
	baseUrl: z.url(),
	targetPrefix: z
		.string()
		.regex(/^\/[a-z0-9/-]*$/)
		.default('/'),
	bearerToken: z.string().min(32),
	roles: z
		.array(z.enum(['user', 'admin']))
		.min(1)
		.default(['user', 'admin'])
})
const customerTarget = z.object({
	segment: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
	baseUrl: z.url(),
	targetPrefix: z.string().regex(/^\/(?:api|v1)(?:\/[a-z][a-z0-9/-]*)?$/),
	bearerToken: z.string().min(32),
	componentRef: componentRefSchema,
	readAction: z.string().regex(/^[a-z][a-z0-9:-]{0,80}$/),
	writeAction: z.string().regex(/^[a-z][a-z0-9:-]{0,80}$/),
	deleteAction: z
		.string()
		.regex(/^[a-z][a-z0-9:-]{0,80}$/)
		.optional(),
	mergeAction: z
		.string()
		.regex(/^[a-z][a-z0-9:-]{0,80}$/)
		.optional(),
	roles: z
		.array(z.enum(['user', 'admin']))
		.min(1)
		.default(['user', 'admin'])
})
const runtimeTargets = z
	.array(
		z
			.object({
				id: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
				targets: z.array(customerTarget).min(1),
				artifactStoreBaseUrl: z.url(),
				artifactStoreBearerToken: z.string().min(32)
			})
			.strict()
	)
	.max(32)
	.superRefine((values, context) => {
		if (new Set(values.map((value) => value.id)).size !== values.length)
			context.addIssue({ code: 'custom', message: 'runtime IDs must be unique' })
		for (const runtime of values)
			if (new Set(runtime.targets.map((value) => value.segment)).size !== runtime.targets.length)
				context.addIssue({ code: 'custom', message: 'runtime segments must be unique' })
	})
export const facadeConfigSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3000),
	DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
	HOSTING_DATABASE_URL: z
		.string()
		.regex(/^postgres(ql)?:\/\//)
		.optional(),
	AUTHORIZATION_DATABASE_URL: z
		.string()
		.regex(/^postgres(ql)?:\/\//)
		.optional(),
	ENTITLEMENTS_DATABASE_URL: z
		.string()
		.regex(/^postgres(ql)?:\/\//)
		.optional(),
	MIGRATOR_DATABASE_URL: z
		.string()
		.regex(/^postgres(ql)?:\/\//)
		.optional(),
	IDENTITY_ISSUER: z.url().default('https://aven.id'),
	IDENTITY_JWKS_URL: z.url().optional(),
	IDENTITY_AUDIENCE: z.string().min(1).default('aven-services'),
	API_PUBLIC_BASE_URL: z.url().default('https://api.aven.ceo'),
	CHECKOUT_CAPABILITIES_URL: z.url().optional(),
	BACKUP_HEALTH_FILE: z.string().optional(),
	CUSTOMER_ENTITLEMENT_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
	TENANT_GRANT_PRIVATE_KEY: z.string().min(80),
	CORS_ORIGINS: z.string().default('https://portal.aven.ceo,https://aven.ceo'),
	SITE_HOST_DIRECTORY_BEARER_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
	SITE_HOST_PUBLIC_IPV4: z.union([z.ipv4(), z.literal('')]).default(''),
	SITE_HOST_PUBLIC_IPV6: z.string().default(''),
	SYSTEM_SITES_JSON: z.string().default('[]'),
	ARTIFACT_STORE_BASE_URL: z.url().optional(),
	ARTIFACT_STORE_BEARER_TOKEN: z.string().min(32).optional(),
	LLM_GATEWAY_ENABLED: z.stringbool().default(false),
	LLM_GATEWAY_MODELS_JSON: z.string().max(131_072).default('[]'),
	LLM_GATEWAY_CREDENTIALS_JSON: z.string().max(65_536).default('{}'),
	LLM_GATEWAY_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(900).default(180),
	LLM_GATEWAY_ALLOW_INSECURE_HTTP: z.stringbool().default(false),
	LLM_GATEWAY_ACTOR_RUNNER_BEARER_TOKEN: z.string().min(32).optional(),
	DOWNSTREAMS_JSON: z
		.string()
		.default('[]')
		.transform((value, context) => {
			try {
				return z.array(target).parse(JSON.parse(value))
			} catch {
				context.addIssue({ code: 'custom', message: 'must be a JSON array of downstream targets' })
				return z.NEVER
			}
		}),
	CUSTOMER_RUNTIMES_JSON: z
		.string()
		.max(262144)
		.default('[]')
		.transform((value, context) => {
			try {
				return runtimeTargets.parse(JSON.parse(value))
			} catch {
				context.addIssue({
					code: 'custom',
					message: 'must be a JSON array of runtime destinations'
				})
				return z.NEVER
			}
		}),
	CUSTOMER_DOWNSTREAMS_JSON: z
		.string()
		.default('[]')
		.transform((value, context) => {
			try {
				return z.array(customerTarget).parse(JSON.parse(value))
			} catch {
				context.addIssue({ code: 'custom', message: 'must be a JSON array of customer targets' })
				return z.NEVER
			}
		})
})
export type FacadeConfig = z.infer<typeof facadeConfigSchema>
export type ServerConfig = FacadeConfig
export type ArtifactStoreConfig = Pick<
	FacadeConfig,
	'ARTIFACT_STORE_BASE_URL' | 'ARTIFACT_STORE_BEARER_TOKEN'
>
export const loadFacadeConfig = (env: NodeJS.ProcessEnv = process.env) =>
	facadeConfigSchema.parse(env)
