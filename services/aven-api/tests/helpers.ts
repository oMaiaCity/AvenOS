import { type FacadeConfig, facadeConfigSchema } from '../src/config.js'

export function testConfig(overrides: Record<string, string> = {}): FacadeConfig {
	return facadeConfigSchema.parse({
		DATABASE_URL: 'postgres://aven_api:test@database/aven_api',
		SITE_HOST_DIRECTORY_BEARER_TOKEN: 'd'.repeat(32),
		CUSTOMER_ENTITLEMENT_TOKEN: 'e'.repeat(32),
		TENANT_GRANT_PRIVATE_KEY: 'test-private-key-material-'.repeat(5),
		...overrides
	})
}
