import { Resolver } from 'node:dns/promises'
import { mkdir } from 'node:fs/promises'
import { loadConfig } from './config.js'
import { StaticSiteHost } from './host.js'

const config = loadConfig()
await mkdir(config.dataRoot, { recursive: true })
const resolver = config.dnsServers.length > 0 ? new Resolver() : undefined
resolver?.setServers(config.dnsServers)
const host = new StaticSiteHost(config, resolver)

await host.loadPersistedState().catch(() => {})

Bun.serve({ hostname: config.hostname, port: config.port, fetch: host.handle })
console.info(JSON.stringify({ message: 'static site host listening', port: config.port }))

await host
	.reconcile()
	.catch((error) =>
		console.error(
			JSON.stringify({ message: 'initial reconciliation failed', error: String(error) })
		)
	)
setInterval(
	() =>
		host
			.reconcile()
			.catch((error) =>
				console.error(JSON.stringify({ message: 'reconciliation failed', error: String(error) }))
			),
	config.pollMilliseconds
)
