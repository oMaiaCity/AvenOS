import {
	customerComponentCatalog,
	databaseRoleName,
	deriveDatabasePassword,
	type TenantGrantClaims
} from '@avenos/aven-customer-contracts'
import pg from 'pg'

interface CachedPool {
	pool: pg.Pool
	lastUsed: number
}

export class TenantPoolProvider {
	private readonly pools = new Map<string, CachedPool>()

	constructor(
		private readonly config: {
			host: string
			port: number
			ssl: boolean
			credentialRoot: string
			roleKind: string
			roleSuffix: string
			componentRef: string
			searchPath: string[]
			maxPools?: number
			maxConnectionsPerPool?: number
			idleMilliseconds?: number
		}
	) {}

	private searchPath(): string {
		if (
			this.config.searchPath.length < 1 ||
			this.config.searchPath.some((value) => !/^[a-z][a-z0-9_]{0,62}$/.test(value))
		)
			throw new Error('tenant pool search path is invalid')
		return [...this.config.searchPath, 'aven_platform', 'pg_catalog'].join(',')
	}

	async forGrant(grant: TenantGrantClaims): Promise<pg.Pool> {
		if (grant.componentRef !== this.config.componentRef)
			throw new Error('tenant pool component mismatch')
		const component = customerComponentCatalog.find(
			(candidate) => candidate.componentRef === this.config.componentRef
		)
		if (!component) throw new Error('tenant pool component is absent from the pinned catalog')
		const key = [
			grant.environmentId,
			grant.databaseName,
			grant.routingGeneration,
			this.config.roleKind
		].join('\0')
		const now = Date.now()
		await this.evictIdle(now)
		const cached = this.pools.get(key)
		if (cached) {
			cached.lastUsed = now
			return cached.pool
		}
		while (this.pools.size >= (this.config.maxPools ?? 8)) await this.evictOldest()
		const user = databaseRoleName(grant.environmentId, this.config.roleSuffix)
		const password = deriveDatabasePassword({
			root: this.config.credentialRoot,
			environmentId: grant.environmentId,
			routingGeneration: grant.routingGeneration,
			roleKind: this.config.roleKind
		})
		const pool = new pg.Pool({
			host: this.config.host,
			port: this.config.port,
			database: grant.databaseName,
			user,
			password,
			ssl: this.config.ssl ? { rejectUnauthorized: true } : false,
			max: this.config.maxConnectionsPerPool ?? 2,
			connectionTimeoutMillis: 5_000,
			statement_timeout: 20_000,
			options: `-c search_path=${this.searchPath()}`
		})
		pool.on('error', () => {})
		try {
			const installation = (
				await pool.query<{
					schema_version: number
					migration_set_digest: string
					routing_generation: number
				}>(
					`SELECT schema_version,migration_set_digest,routing_generation
					 FROM aven_platform.component_installations WHERE component_ref=$1`,
					[grant.componentRef]
				)
			).rows[0]
			if (
				!installation ||
				Number(installation.routing_generation) !== grant.routingGeneration ||
				Number(installation.schema_version) < component.minimumRuntimeSchemaVersion ||
				Number(installation.schema_version) > component.maximumRuntimeSchemaVersion ||
				installation.migration_set_digest !== component.migrationSetDigest
			)
				throw new Error('customer component installation is incompatible')
		} catch (error) {
			await pool.end()
			throw error
		}
		this.pools.set(key, { pool, lastUsed: now })
		return pool
	}

	async invalidate(environmentId: string): Promise<void> {
		for (const [key, entry] of this.pools) {
			if (!key.startsWith(`${environmentId}\0`)) continue
			this.pools.delete(key)
			await entry.pool.end()
		}
	}

	async close(): Promise<void> {
		const entries = [...this.pools.values()]
		this.pools.clear()
		await Promise.all(entries.map((entry) => entry.pool.end()))
	}

	private async evictIdle(now: number): Promise<void> {
		for (const [key, entry] of this.pools) {
			if (now - entry.lastUsed < (this.config.idleMilliseconds ?? 300_000)) continue
			this.pools.delete(key)
			await entry.pool.end()
		}
	}

	private async evictOldest(): Promise<void> {
		const oldest = [...this.pools.entries()].sort(
			(left, right) => left[1].lastUsed - right[1].lastUsed
		)[0]
		if (!oldest) return
		this.pools.delete(oldest[0])
		await oldest[1].pool.end()
	}
}
