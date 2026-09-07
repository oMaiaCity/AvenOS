import { importTenantGrantPublicKey } from '@avenos/aven-customer-contracts'
import { TenantPoolProvider } from '@avenos/aven-customer-runtime'
import { IdentityVerifier } from '@avenos/aven-identity'
import { BoundarySignals } from '@avenos/http-boundary'
import pino from 'pino'
import { loadIntentServiceConfig } from './config.js'
import { createIntentHandler } from './handler.js'
import { IntentStore } from './store.js'

const config = loadIntentServiceConfig()
const logger = pino({ redact: ['req.headers.authorization', 'req.headers.x-aven-identity-token'] })
const pools = new TenantPoolProvider({
	host: config.CUSTOMER_DATABASE_HOST,
	port: config.CUSTOMER_DATABASE_PORT,
	ssl: config.CUSTOMER_DATABASE_SSL,
	credentialRoot: config.INTENT_DATABASE_CREDENTIAL_ROOT,
	roleKind: 'ceo.aven:db-role:intents:api@1',
	roleSuffix: 'int_api',
	componentRef: 'ceo.aven:component:data:intents@1',
	searchPath: ['aven_intents']
})
const tenantGrantPublicKey = await importTenantGrantPublicKey(config.TENANT_GRANT_PUBLIC_KEY)
const handler = createIntentHandler(
	config,
	new IdentityVerifier({
		issuer: config.IDENTITY_ISSUER,
		jwksUrl: config.IDENTITY_JWKS_URL,
		audience: config.IDENTITY_AUDIENCE
	}),
	tenantGrantPublicKey,
	{ forGrant: async (grant) => new IntentStore(await pools.forGrant(grant)) },
	(error) => logger.error({ err: error }, 'Intent request failed')
)

const boundary = new BoundarySignals('facade-to-intents', (summary) =>
	logger.warn(summary, 'Service boundary denials observed')
)
Bun.serve({
	port: config.PORT,
	async fetch(request, server) {
		const response = await handler(request)
		boundary.record(response.status, server.requestIP(request)?.address)
		return response
	},
	error(error) {
		logger.error({ err: error }, 'Intent server failed')
		return Response.json(
			{ code: 'INTENT_UNAVAILABLE', message: 'Intent state is unavailable.' },
			{ status: 500 }
		)
	}
})
logger.info({ port: config.PORT }, 'Intent Service listening')
