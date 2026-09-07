import { randomUUID } from 'node:crypto'
import pg from 'pg'
import pino from 'pino'
import { catalogDigest, loadCatalog } from './catalog.js'
import { loadProvisionerConfig } from './config.js'
import { ControlStore } from './control.js'
import { CustomerDatabaseProvisioner } from './postgres.js'

const config = loadProvisionerConfig()
const logger = pino({ level: config.LOG_LEVEL, redact: ['password', 'secret', 'token', 'root'] })
const controlPool = new pg.Pool({ connectionString: config.CONTROL_DATABASE_URL, max: 4 })
controlPool.on('error', (error) => logger.error({ err: error }, 'control database error'))
const catalog = await loadCatalog()
const digest = catalogDigest(catalog)
const instanceId = config.PROVISIONER_INSTANCE_ID ?? randomUUID()
const control = new ControlStore(controlPool, instanceId, config.PROVISIONER_LEASE_SECONDS)
const databases = new CustomerDatabaseProvisioner(config.CLUSTER_DATABASE_URL, config)
let stopped = false

async function work(): Promise<boolean> {
	const operation = await control.claim()
	if (!operation) return false
	const entry = catalog.get(operation.componentRef)
	if (!entry) {
		await control.fail(operation, new Error('component is absent from the static catalog'))
		return true
	}
	try {
		await databases.reconcile(operation, entry)
		await control.finish(operation)
		logger.info({ operationId: operation.id, component: operation.componentRef }, 'reconciled')
	} catch (error) {
		await control.fail(operation, error)
		logger.error({ operationId: operation.id, err: error }, 'reconciliation failed')
	}
	return true
}

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		stopped = true
	})

logger.info({ instanceId, catalogDigest: digest }, 'platform provisioner started')
try {
	while (!stopped) {
		await control.heartbeat(digest)
		const results = await Promise.all(
			Array.from({ length: config.PROVISIONER_CONCURRENCY }, () => work())
		)
		if (!results.some(Boolean)) await Bun.sleep(config.PROVISIONER_POLL_INTERVAL_MS)
	}
} finally {
	await controlPool.end()
}
