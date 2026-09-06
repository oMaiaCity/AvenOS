import type pg from 'pg'
import type { FacadeConfig } from './config.js'

type Check = { status: 'healthy' | 'degraded'; code: string; checkedAt: number }
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
					const result = await this.pool.query<{ healthy: boolean }>(`SELECT NOT EXISTS (
					 SELECT 1 FROM customer_component_operations WHERE status IN ('failed','unknown')
					 OR (status IN ('queued','running') AND created_at < now()-interval '5 minutes')
					 OR (status='running' AND lease_expires_at < now())
					) AND EXISTS (SELECT 1 FROM platform_worker_heartbeats
					 WHERE worker_name='platform-provisioner' AND last_heartbeat_at > now()-interval '90 seconds') AS healthy`)
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
						const value = (await this.readBackup()) as {
							status?: string
							checkedAt?: number
							snapshotCount?: number
						}
						const age = Date.now() / 1000 - (value.checkedAt ?? 0)
						record(
							'backup',
							value.status === 'healthy' &&
								age >= 0 &&
								age < 7200 &&
								Number.isSafeInteger(value.snapshotCount) &&
								(value.snapshotCount ?? 0) > 0,
							'BACKUP_STALE_OR_FAILED'
						)
					} catch {
						record('backup', false, 'BACKUP_OBSERVATION_UNAVAILABLE')
					}
				})()
			])
		} finally {
			this.running = false
		}
	}
}
