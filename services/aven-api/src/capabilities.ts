import { join } from 'node:path'
import type pg from 'pg'
import type { FacadeConfig } from './config.js'
import { RuntimeDirectory } from './customers/runtime-directory.js'

type Check = { status: 'healthy' | 'degraded'; code: string; checkedAt: number }
function healthyBackup(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false
	const record = value as { status?: string; checkedAt?: number; snapshotCount?: number }
	const age = Date.now() / 1000 - (record.checkedAt ?? 0)
	return (
		record.status === 'healthy' &&
		age >= 0 &&
		age < 7200 &&
		Number.isSafeInteger(record.snapshotCount) &&
		(record.snapshotCount ?? 0) > 0
	)
}
export const provisioningHealthQuery = `SELECT NOT EXISTS (
 SELECT 1 FROM customer_component_operations op JOIN customer_environments e
 ON e.id=op.environment_id AND e.routing_generation=op.routing_generation
 WHERE op.status IN ('failed','unknown')
 OR (op.status IN ('queued','running') AND op.created_at < now()-interval '5 minutes')
 OR (op.status='running' AND op.lease_expires_at < now())
) AND NOT EXISTS (
 SELECT 1 FROM (
   SELECT runtime_id FROM customer_environments UNION SELECT runtime_id FROM customer_runtime_defaults
 ) required WHERE NOT EXISTS (
   SELECT 1 FROM platform_worker_heartbeats h
   WHERE h.worker_name=CASE WHEN required.runtime_id='primary' THEN 'platform-provisioner'
     ELSE 'platform-provisioner:' || required.runtime_id END
   AND h.last_heartbeat_at > now()-interval '90 seconds'
 )
) AS healthy`
export class PlatformCapabilities {
	private values: Record<string, Check> = {}
	private running = false
	private timer?: ReturnType<typeof setInterval>
	constructor(
		private config: FacadeConfig,
		private pool: pg.Pool,
		private fetcher: typeof fetch = fetch,
		private readBackup: () => Promise<unknown> = async () => {
			if (!config.BACKUP_HEALTH_FILE) throw new Error('Backup health is not configured')
			const file = Bun.file(config.BACKUP_HEALTH_FILE)
			if (file.size > 4096) throw new Error('Invalid backup health record')
			return file.json()
		},
		private readRuntimeBackup: (id: string) => Promise<unknown> = async (id) => {
			if (!config.CUSTOMER_RUNTIME_BACKUP_HEALTH_DIRECTORY || !/^[a-z][a-z0-9-]{0,62}$/.test(id))
				throw new Error('Runtime backup health is not configured')
			const file = Bun.file(
				join(config.CUSTOMER_RUNTIME_BACKUP_HEALTH_DIRECTORY, id, 'health.json')
			)
			if (file.size > 4096) throw new Error('Invalid runtime backup health record')
			return file.json()
		}
	) {}
	start() {
		void this.refresh()
		this.timer = setInterval(() => void this.refresh(), 60_000)
		this.timer.unref()
	}
	stop() {
		clearInterval(this.timer)
	}
	snapshot(now = Date.now()) {
		const checks = Object.fromEntries(
			[
				'database',
				'provisioning',
				'identity',
				'checkout',
				'artifact_store',
				'actor_runner',
				'intents',
				'backup'
			].map((name) => {
				const value = this.values[name]
				return [
					name,
					value && now - value.checkedAt < 180_000
						? value
						: { status: 'degraded', code: 'OBSERVATION_STALE', checkedAt: value?.checkedAt ?? 0 }
				]
			})
		)
		return {
			status: Object.values(checks).every((value) => value.status === 'healthy')
				? 'healthy'
				: 'degraded',
			checks
		}
	}
	async refresh() {
		if (this.running) return
		this.running = true
		const record = (name: string, healthy: boolean, code: string) => {
			this.values[name] = {
				status: healthy ? 'healthy' : 'degraded',
				code: healthy ? 'OK' : code,
				checkedAt: Date.now()
			}
		}
		try {
			const query = async () => {
				try {
					const result = await this.pool.query<{ healthy: boolean }>(provisioningHealthQuery)
					record('database', true, 'DATABASE_UNAVAILABLE')
					record('provisioning', result.rows[0]?.healthy === true, 'PROVISIONING_STALE_OR_FAILED')
				} catch {
					record('database', false, 'DATABASE_UNAVAILABLE')
					record('provisioning', false, 'PROVISIONING_OBSERVATION_FAILED')
				}
			}
			const endpoints = {
				identity: new URL(
					'/api/health/ready',
					this.config.IDENTITY_JWKS_URL ?? this.config.IDENTITY_ISSUER
				).href,
				checkout: this.config.CHECKOUT_CAPABILITIES_URL,
				artifact_store:
					this.config.ARTIFACT_STORE_BASE_URL &&
					new URL('/health/ready', this.config.ARTIFACT_STORE_BASE_URL).href,
				actor_runner: this.config.CUSTOMER_DOWNSTREAMS_JSON.find(
					(entry) => entry.segment === 'actor-runs'
				)?.baseUrl,
				intents: this.config.CUSTOMER_DOWNSTREAMS_JSON.find((entry) => entry.segment === 'intents')
					?.baseUrl
			}
			await Promise.all([
				query(),
				...Object.entries(endpoints).map(async ([name, configured]) => {
					try {
						if (!configured) throw new Error('Dependency is not configured')
						const url =
							name === 'actor_runner' || name === 'intents'
								? new URL('/health/ready', configured).href
								: configured
						const response = await this.fetcher(url, {
							redirect: 'error',
							signal: AbortSignal.timeout(5000)
						})
						await response.body?.cancel()
						record(name, response.ok, 'DEPENDENCY_DEGRADED')
					} catch {
						record(name, false, 'DEPENDENCY_UNAVAILABLE')
					}
				}),
				(async () => {
					try {
						const value = await this.readBackup()
						record('backup', healthyBackup(value), 'BACKUP_STALE_OR_FAILED')
					} catch {
						record('backup', false, 'BACKUP_OBSERVATION_UNAVAILABLE')
					}
				})()
			])
			if (this.config.CUSTOMER_RUNTIMES_FILE || this.config.CUSTOMER_RUNTIMES_JSON?.length) {
				const names = ['artifact_store', 'actor_runner', 'intents', 'backup'] as const
				try {
					const placements = await this.pool.query<{ runtime_id: string }>(
						'SELECT runtime_id FROM customer_environments UNION SELECT runtime_id FROM customer_runtime_defaults'
					)
					if (!placements.rows.length) throw new Error('Runtime placement is unavailable')
					const directory = [...(await new RuntimeDirectory(this.config).read())]
					if (
						!this.config.CUSTOMER_RUNTIMES_FILE &&
						!directory.some((runtime) => runtime.id === 'primary')
					)
						directory.push({
							id: 'primary',
							targets: this.config.CUSTOMER_DOWNSTREAMS_JSON,
							artifactStoreBaseUrl: this.config.ARTIFACT_STORE_BASE_URL ?? '',
							artifactStoreBearerToken: this.config.ARTIFACT_STORE_BEARER_TOKEN ?? ''
						})
					const active = placements.rows.map(({ runtime_id }) => {
						const configured = directory.find((runtime) => runtime.id === runtime_id)
						if (!configured) throw new Error('Active runtime is not configured')
						return configured
					})
					await Promise.all(
						names.map(async (name) => {
							try {
								const results = await Promise.all(
									active.map(async (runtime) => {
										if (name === 'backup')
											return healthyBackup(
												await (runtime.id === 'primary'
													? this.readBackup()
													: this.readRuntimeBackup(runtime.id))
											)
										const base =
											name === 'artifact_store'
												? runtime.artifactStoreBaseUrl
												: runtime.targets.find(
														(entry) =>
															entry.segment === (name === 'actor_runner' ? 'actor-runs' : 'intents')
													)?.baseUrl
										if (!base) return false
										const response = await this.fetcher(new URL('/health/ready', base), {
											redirect: 'error',
											signal: AbortSignal.timeout(5000)
										})
										await response.body?.cancel()
										return response.ok
									})
								)
								// The central directory backup is required even when no customer remains on primary.
								const centralBackup = name !== 'backup' || healthyBackup(await this.readBackup())
								record(name, results.every(Boolean) && centralBackup, 'ACTIVE_RUNTIME_DEGRADED')
							} catch {
								record(name, false, 'ACTIVE_RUNTIME_UNAVAILABLE')
							}
						})
					)
				} catch {
					for (const name of names) record(name, false, 'RUNTIME_DIRECTORY_UNAVAILABLE')
				}
			}
		} finally {
			this.running = false
		}
	}
}
