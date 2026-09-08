import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
	databaseNameForEnvironment,
	databaseRoleName,
	quoteIdentifier
} from '@avenos/aven-customer-contracts'
import pg from 'pg'
import type { Movement, MovementDriver } from './movement.js'

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`
const executionLock = "hashtextextended('aven-customer-execution',0)"

export interface MovementDatabase {
	url: string
	releaseSha: string
}

/** Runs with generated recovery credentials, never with a customer or facade role. */
export class PostgresMovementDriver implements MovementDriver {
	constructor(
		private readonly config: {
			runtimes: Record<string, MovementDatabase>
			archiveDirectory: string
			platformId: string
			prepareDestination: (movement: Movement, signal: AbortSignal) => Promise<void>
			verifyApplication: (movement: Movement, signal: AbortSignal) => Promise<void>
		}
	) {}

	private runtime(movement: Movement, destination: boolean): MovementDatabase {
		if (databaseNameForEnvironment(movement.environment_id) !== movement.database_name)
			throw new Error('customer database mapping is inconsistent')
		const runtime =
			this.config.runtimes[
				destination ? movement.destination_runtime_id : movement.source_runtime_id
			]
		if (!runtime || !/^[0-9a-f]{40}$/.test(runtime.releaseSha))
			throw new Error('runtime release is not configured')
		return runtime
	}

	private async database<T>(
		movement: Movement,
		destination: boolean,
		work: (client: pg.Client) => Promise<T>,
		cluster = false
	): Promise<T> {
		const url = new URL(this.runtime(movement, destination).url)
		url.pathname = cluster ? '/postgres' : `/${movement.database_name}`
		const client = new pg.Client({
			connectionString: url.toString(),
			connectionTimeoutMillis: 5000,
			statement_timeout: 60000
		})
		client.on('error', () => {})
		await client.connect()
		try {
			return await work(client)
		} finally {
			await client.end()
		}
	}

	private async assertIdentity(movement: Movement, destination: boolean): Promise<void> {
		await this.database(movement, destination, async (client) => {
			const identity = (
				await client.query<{
					environment_id: string
					execution_enabled: boolean
					routing_generation: string
				}>(
					'SELECT environment_id,execution_enabled,routing_generation FROM aven_platform.environment_identity WHERE singleton'
				)
			).rows[0]
			if (
				identity?.environment_id !== movement.environment_id ||
				typeof identity.execution_enabled !== 'boolean' ||
				(!destination && Number(identity.routing_generation) !== movement.source_generation)
			)
				throw new Error('customer identity or execution barrier is missing')
		})
	}

	private async customerRoles(movement: Movement, destination: boolean): Promise<string[]> {
		const prefix = `c_${movement.environment_id.replaceAll('-', '')}_`
		return this.database(
			movement,
			destination,
			async (client) =>
				(
					await client.query<{ rolname: string }>(
						'SELECT rolname FROM pg_roles WHERE starts_with(rolname,$1) ORDER BY rolname',
						[prefix]
					)
				).rows.map((row) => row.rolname),
			true
		)
	}

	async fence(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>> {
		signal.throwIfAborted()
		await this.assertIdentity(movement, false)
		for (const destination of [false, true]) {
			await this.database(
				movement,
				destination,
				async (client) => {
					const marker = (
						await client.query<{ platform_id: string }>(
							"SELECT shobj_description(oid,'pg_database') AS platform_id FROM pg_database WHERE datname='postgres'"
						)
					).rows[0]
					if (marker?.platform_id !== `aven-platform:${this.config.platformId}`)
						throw new Error('database cluster belongs to another installation target')
				},
				true
			)
		}
		const sourceSystem = await this.database(
			movement,
			false,
			async (client) =>
				(
					await client.query<{ system_identifier: string }>(
						'SELECT system_identifier FROM pg_control_system()'
					)
				).rows[0]?.system_identifier,
			true
		)
		const targetSystem = await this.database(
			movement,
			true,
			async (client) =>
				(
					await client.query<{ system_identifier: string }>(
						'SELECT system_identifier FROM pg_control_system()'
					)
				).rows[0]?.system_identifier,
			true
		)
		if (!sourceSystem || sourceSystem === targetSystem)
			throw new Error('movement requires separate database clusters')
		// Pause first, then wait for every executor holding the shared barrier to leave.
		// A timeout preserves the pause. Never kill an executor to claim its effects stopped.
		await this.database(movement, false, async (client) => {
			await client.query(
				'UPDATE aven_platform.environment_identity SET execution_enabled=false WHERE singleton'
			)
			await client.query(`SELECT pg_advisory_lock(${executionLock})`)
			const unsettled = (
				await client.query<{ unsettled: number }>(
					'SELECT cardinality(execution_unsettled) AS unsettled FROM aven_platform.environment_identity WHERE singleton'
				)
			).rows[0]?.unsettled
			if (unsettled !== 0)
				throw new Error('interrupted Actor execution requires reconciliation before movement')
			signal.throwIfAborted()
			const roles = await this.customerRoles(movement, false)
			if (!roles.length) throw new Error('customer roles are absent')
			await this.database(
				movement,
				false,
				async (cluster) => {
					for (const role of roles) {
						await cluster.query(`ALTER ROLE ${quoteIdentifier(role)} NOLOGIN`)
						await cluster.query(
							`REVOKE CONNECT ON DATABASE ${quoteIdentifier(movement.database_name)} FROM ${quoteIdentifier(role)}`
						)
					}
					await cluster.query(
						'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND usename=ANY($2::text[])',
						[movement.database_name, roles]
					)
				},
				true
			)
		})
		await this.assertFenced(movement)
		return {
			fencedAt: new Date().toISOString(),
			sourceRelease: this.runtime(movement, false).releaseSha
		}
	}

	private async assertFenced(movement: Movement): Promise<void> {
		const roles = await this.customerRoles(movement, false)
		await this.database(movement, false, async (client) => {
			const enabled = (
				await client.query<{ execution_enabled: boolean }>(
					'SELECT execution_enabled FROM aven_platform.environment_identity WHERE singleton'
				)
			).rows[0]?.execution_enabled
			const login = await client.query(
				'SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[]) AND rolcanlogin',
				[roles]
			)
			const sessions = await client.query(
				'SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND usename=ANY($2::text[])',
				[movement.database_name, roles]
			)
			if (!roles.length || enabled !== false || login.rowCount || sessions.rowCount)
				throw new Error('source fence is not established')
		})
	}

	private async command(
		movement: Movement,
		destination: boolean,
		args: string[],
		signal: AbortSignal
	): Promise<void> {
		const url = new URL(this.runtime(movement, destination).url)
		const containerName = `aven-movement-${movement.id}-${args[0].replaceAll('_', '-')}`
		const child = Bun.spawn(
			[
				'docker',
				'run',
				'--rm',
				'--name',
				containerName,
				'--network',
				'host',
				'--user',
				`${process.getuid?.()}:${process.getgid?.()}`,
				'--volume',
				`${this.config.archiveDirectory}:${this.config.archiveDirectory}`,
				...[
					'PGHOST',
					'PGPORT',
					'PGUSER',
					'PGPASSWORD',
					'PGDATABASE',
					'PGSSLMODE',
					'PGCONNECT_TIMEOUT',
					'PGOPTIONS'
				].flatMap((name) => ['--env', name]),
				'postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73',
				...args
			],
			{
				env: {
					...process.env,
					PGHOST: url.hostname,
					PGPORT: url.port || '5432',
					PGUSER: decodeURIComponent(url.username),
					PGPASSWORD: decodeURIComponent(url.password),
					PGDATABASE: movement.database_name,
					PGSSLMODE: url.searchParams.get('sslmode') ?? 'require',
					PGCONNECT_TIMEOUT: '5',
					PGOPTIONS: '-c statement_timeout=600000'
				},
				stdout: 'ignore',
				stderr: 'ignore'
			}
		)
		let stopping: Promise<number> | undefined
		const stop = () => {
			// Killing only the Docker CLI leaves its restore process running in the container.
			stopping ??= Bun.spawn(['docker', 'rm', '--force', containerName], {
				stdout: 'ignore',
				stderr: 'ignore'
			}).exited
			child.kill()
		}
		signal.addEventListener('abort', stop, { once: true })
		const deadline = setTimeout(stop, 600000)
		try {
			signal.throwIfAborted()
			if ((await child.exited) !== 0)
				throw new Error(
					`${args[0]} failed; customer remains paused and recovery files are retained`
				)
			signal.throwIfAborted()
		} finally {
			clearTimeout(deadline)
			signal.removeEventListener('abort', stop)
			if (stopping) await stopping
		}
	}

	private async archive(movement: Movement): Promise<string> {
		const directory = join(this.config.archiveDirectory, movement.id)
		await mkdir(directory, { recursive: true, mode: 0o700 })
		const info = await stat(directory)
		if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
			throw new Error('movement archive must be private and owned by the operator')
		return join(directory, 'customer.dump')
	}

	async copy(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>> {
		await this.assertFenced(movement)
		if (movement.mode === 'rollback') {
			await this.assertIdentity(movement, true)
			return { retainedDatabase: true, executionRequiresReconciliation: true }
		}
		const archive = await this.archive(movement)
		try {
			await stat(archive)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
			await this.command(
				movement,
				false,
				['pg_dump', '--format=custom', '--file', `${archive}.partial`],
				signal
			)
			await chmod(`${archive}.partial`, 0o600)
			await rename(`${archive}.partial`, archive)
		}
		const hash = createHash('sha256')
		for await (const bytes of createReadStream(archive)) hash.update(bytes)
		const digest = hash.digest('hex')
		const roles = await this.customerRoles(movement, false)
		await this.database(
			movement,
			true,
			async (client) => {
				const existing = (
					await client.query<{ marker: string | null }>(
						"SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
						[movement.database_name]
					)
				).rows[0]
				const marker = `aven-movement:${movement.id}:${digest}`
				if (existing && existing.marker !== marker)
					throw new Error('destination database already exists; it will not be overwritten')
				for (const role of roles) {
					await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${literal(role)})
				 THEN CREATE ROLE ${quoteIdentifier(role)} NOLOGIN; END IF; END $$`)
					await client.query(`ALTER ROLE ${quoteIdentifier(role)} NOLOGIN`)
				}
				if (!existing) {
					await client.query(
						`CREATE DATABASE ${quoteIdentifier(movement.database_name)} OWNER ${quoteIdentifier(databaseRoleName(movement.environment_id, 'db_owner'))}`
					)
					await client.query(
						`REVOKE ALL ON DATABASE ${quoteIdentifier(movement.database_name)} FROM PUBLIC`
					)
					await client.query(
						`COMMENT ON DATABASE ${quoteIdentifier(movement.database_name)} IS ${literal(marker)}`
					)
				}
				await client.query(
					`REVOKE ALL ON DATABASE ${quoteIdentifier(movement.database_name)} FROM PUBLIC`
				)
			},
			true
		)
		const restored = await this.database(
			movement,
			true,
			async (client) =>
				(
					await client.query<{ present: string | null }>(
						"SELECT to_regclass('aven_platform.environment_identity') AS present"
					)
				).rows[0]?.present
		)
		if (!restored)
			await this.command(
				movement,
				true,
				[
					'pg_restore',
					'--exit-on-error',
					'--single-transaction',
					'--dbname',
					movement.database_name,
					archive
				],
				signal
			)
		await this.assertIdentity(movement, true)
		return {
			archiveSha256: digest,
			copiedAt: new Date().toISOString(),
			destinationRelease: this.runtime(movement, true).releaseSha
		}
	}

	async verify(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>> {
		await this.assertFenced(movement)
		await this.assertIdentity(movement, true)
		await this.config.prepareDestination(movement, signal)
		await this.config.verifyApplication(movement, signal)
		const components = await this.database(movement, true, async (client) => {
			const identity = (
				await client.query<{ routing_generation: string }>(
					'SELECT routing_generation FROM aven_platform.environment_identity WHERE singleton'
				)
			).rows[0]
			if (Number(identity?.routing_generation) !== movement.destination_generation)
				throw new Error('destination generation was not prepared')
			// A rollback cannot resume the old job journal until effects are reconciled.
			await client.query(
				'UPDATE aven_platform.environment_identity SET execution_enabled=$1 WHERE singleton',
				[movement.mode !== 'rollback']
			)
			return (
				await client.query(
					'SELECT component_ref,schema_version,migration_set_digest FROM aven_platform.component_installations WHERE routing_generation=$1 ORDER BY component_ref',
					[movement.destination_generation]
				)
			).rows
		})
		return {
			verifiedAt: new Date().toISOString(),
			verifiedComponents: components,
			executionRequiresReconciliation: movement.mode === 'rollback'
		}
	}

	async beforeActivate(movement: Movement, signal: AbortSignal): Promise<void> {
		signal.throwIfAborted()
		await this.assertFenced(movement)
		await this.assertIdentity(movement, true)
		await this.database(movement, true, async (client) => {
			const identity = (
				await client.query<{ routing_generation: string }>(
					'SELECT routing_generation FROM aven_platform.environment_identity WHERE singleton'
				)
			).rows[0]
			if (Number(identity?.routing_generation) !== movement.destination_generation)
				throw new Error('destination generation changed before activation')
			const components = (
				await client.query(
					'SELECT component_ref,schema_version,migration_set_digest FROM aven_platform.component_installations WHERE routing_generation=$1 ORDER BY component_ref',
					[movement.destination_generation]
				)
			).rows
			const expected = movement.evidence.verifiedComponents
			const values = (items: typeof components) =>
				items.map((item) => [item.component_ref, item.schema_version, item.migration_set_digest])
			if (
				!Array.isArray(expected) ||
				JSON.stringify(values(components)) !== JSON.stringify(values(expected))
			)
				throw new Error('destination components changed before activation')
		})
		await this.config.verifyApplication(movement, signal)
	}

	async observe(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>> {
		await this.config.verifyApplication(movement, signal)
		return { observedAt: new Date().toISOString() }
	}
}
