import { readFile, stat } from 'node:fs/promises'
import type pg from 'pg'

type Check = { status: 'healthy' | 'degraded'; code: string; checkedAt: number }
export class IdentityCapabilities {
	private values: Record<string, Check> = {}
	private running = false
	constructor(
		private pool: pg.Pool,
		private backupPath?: string
	) {}
	start() {
		void this.refresh()
		setInterval(() => void this.refresh(), 60_000).unref()
	}
	snapshot(now = Date.now()) {
		const checks = Object.fromEntries(
			['database', 'proof_cleanup', 'security_mail', 'backup'].map((name) => {
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
			try {
				const query = {
					text: `SELECT NOT EXISTS (SELECT 1 FROM proof_of_work_redemptions WHERE expires_at < $1 LIMIT 1) AS healthy,
					 NOT EXISTS (SELECT 1 FROM identity_security_mail WHERE dead OR (delivered_at IS NULL AND created_at < now()-interval '5 minutes') LIMIT 1) AS mail_healthy`,
					values: [Date.now() - 300_000],
					query_timeout: 5000
				}
				const result = await this.pool.query<{ healthy: boolean; mail_healthy: boolean }>(query)
				record('database', true, 'DATABASE_UNAVAILABLE')
				record('proof_cleanup', result.rows[0]?.healthy === true, 'PROOF_CLEANUP_STALE')
				record(
					'security_mail',
					result.rows[0]?.mail_healthy === true,
					'SECURITY_MAIL_STALE_OR_FAILED'
				)
			} catch {
				record('database', false, 'DATABASE_UNAVAILABLE')
				record('proof_cleanup', false, 'PROOF_OBSERVATION_FAILED')
				record('security_mail', false, 'SECURITY_MAIL_OBSERVATION_FAILED')
			}
			try {
				if (!this.backupPath || (await stat(this.backupPath)).size > 4096)
					throw new Error('Invalid backup summary')
				const value = JSON.parse(await readFile(this.backupPath, 'utf8'))
				const age = Date.now() / 1000 - value.checkedAt
				record(
					'backup',
					value.status === 'healthy' &&
						age >= 0 &&
						age < 7200 &&
						Number.isSafeInteger(value.snapshotCount) &&
						value.snapshotCount > 0,
					'BACKUP_STALE_OR_FAILED'
				)
			} catch {
				record('backup', false, 'BACKUP_OBSERVATION_UNAVAILABLE')
			}
		} finally {
			this.running = false
		}
	}
}
