import {
	type CustomerComponentManifest,
	databaseNameForEnvironment,
	databaseRoleName,
	deriveDatabasePassword,
	quoteIdentifier
} from '@avenos/aven-customer-contracts'
import pg from 'pg'
import type { ComponentCatalogEntry } from './catalog.js'
import type { ProvisionerConfig } from './config.js'
import type { Operation } from './control.js'

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

export class CustomerDatabaseProvisioner {
	private readonly roots: Record<string, string>

	constructor(
		private readonly clusterUrl: string,
		private readonly config: ProvisionerConfig
	) {
		this.roots = {
			'ceo.aven:db-role:intents:api@1': this.config.INTENTS_API_DB_CREDENTIAL_ROOT,
			'os.aven:db-role:actors:api@1': this.config.ACTOR_API_DB_CREDENTIAL_ROOT,
			'os.aven:db-role:actors:worker@1': this.config.ACTOR_WORKER_DB_CREDENTIAL_ROOT,
			'ceo.aven:db-role:artifacts:api@1': this.config.ARTIFACT_API_DB_CREDENTIAL_ROOT
		}
	}

	private pool(database: string, options: pg.PoolConfig = {}): pg.Pool {
		const url = new URL(this.clusterUrl)
		url.pathname = `/${database}`
		return new pg.Pool({ connectionString: url.toString(), max: 1, ...options })
	}

	async reconcile(operation: Operation, entry: ComponentCatalogEntry): Promise<void> {
		if (databaseNameForEnvironment(operation.environmentId) !== operation.databaseName)
			throw new Error('trusted database mapping is inconsistent')
		if (operation.migrationSetDigest !== entry.manifest.migrationSetDigest)
			throw new Error('operation migration digest does not match static catalog')
		const locks = this.pool('postgres')
		const lock = await locks.connect()
		try {
			await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [
				`customer-environment:${operation.environmentId}`
			])
			await this.ensureDatabase(operation.environmentId, operation.databaseName)
			if (operation.action === 'suspend') {
				await this.suspend(operation, entry.manifest)
				return
			}
			await this.install(operation, entry)
		} finally {
			await lock
				.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
					`customer-environment:${operation.environmentId}`
				])
				.catch(() => {})
			lock.release()
			await locks.end()
		}
	}

	private async ensureDatabase(environmentId: string, databaseName: string): Promise<void> {
		const cluster = this.pool('postgres')
		const databaseOwner = databaseRoleName(environmentId, 'db_owner')
		const platformOwner = databaseRoleName(environmentId, 'platform_owner')
		try {
			for (const owner of [databaseOwner, platformOwner]) {
				await cluster.query(
					`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${literal(owner)})
					 THEN CREATE ROLE ${quoteIdentifier(owner)} NOLOGIN; END IF; END $$`
				)
				await cluster.query(`GRANT ${quoteIdentifier(owner)} TO CURRENT_USER WITH SET TRUE`)
			}
			if (
				!(await cluster.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName])).rows[0]
			)
				await cluster.query(
					`CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(databaseOwner)}`
				)
			await cluster.query(`SET ROLE ${quoteIdentifier(databaseOwner)}`)
			await cluster.query(`REVOKE ALL ON DATABASE ${quoteIdentifier(databaseName)} FROM PUBLIC`)
			await cluster.query(
				`GRANT CONNECT,CREATE ON DATABASE ${quoteIdentifier(databaseName)} TO SESSION_USER`
			)
			await cluster.query(
				`GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${quoteIdentifier(this.config.BACKUP_DATABASE_ROLE)}`
			)
			await cluster.query('RESET ROLE')
		} finally {
			await cluster.end()
		}
		const customer = this.pool(databaseName)
		const client = await customer.connect()
		try {
			await client.query(
				`CREATE SCHEMA IF NOT EXISTS aven_platform AUTHORIZATION ${quoteIdentifier(platformOwner)}`
			)
			await client.query(`SET ROLE ${quoteIdentifier(platformOwner)}`)
			await client.query(
				`CREATE TABLE IF NOT EXISTS aven_platform.environment_identity (
				 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
				 environment_id uuid NOT NULL,routing_generation bigint NOT NULL,
				 created_at timestamptz NOT NULL DEFAULT now())`
			)
			await client.query(
				`INSERT INTO aven_platform.environment_identity(singleton,environment_id,routing_generation)
				 VALUES(true,$1,1) ON CONFLICT(singleton) DO NOTHING`,
				[environmentId]
			)
			const identity = (
				await client.query<{ environment_id: string }>(
					'SELECT environment_id FROM aven_platform.environment_identity WHERE singleton'
				)
			).rows[0]
			if (identity?.environment_id !== environmentId)
				throw new Error('existing customer database belongs to another environment')
			await client.query(
				`CREATE TABLE IF NOT EXISTS aven_platform.component_migrations (
				 component_ref text NOT NULL,migration_id text NOT NULL,digest text NOT NULL,
				 applied_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(component_ref,migration_id))`
			)
			await client.query(
				`CREATE TABLE IF NOT EXISTS aven_platform.component_installations (
				 component_ref text PRIMARY KEY,schema_version integer NOT NULL,
				 migration_set_digest text NOT NULL,routing_generation bigint NOT NULL,
				 verified_at timestamptz NOT NULL)`
			)
			await client.query('GRANT USAGE ON SCHEMA aven_platform TO SESSION_USER')
			await client.query(
				'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA aven_platform TO SESSION_USER'
			)
			await client.query('RESET ROLE')
		} finally {
			client.release()
			await customer.end()
		}
	}

	private async ensureRoles(
		operation: Operation,
		manifest: CustomerComponentManifest
	): Promise<Record<string, string>> {
		const cluster = this.pool('postgres')
		const owner = databaseRoleName(operation.environmentId, manifest.ownerRoleSuffix)
		const databaseOwner = databaseRoleName(operation.environmentId, 'db_owner')
		const roles: Record<string, string> = {}
		try {
			await cluster.query(
				`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${literal(owner)})
				 THEN CREATE ROLE ${quoteIdentifier(owner)} NOLOGIN; END IF; END $$`
			)
			await cluster.query(`GRANT ${quoteIdentifier(owner)} TO CURRENT_USER WITH SET TRUE`)
			if (manifest.componentRef === 'ceo.aven:component:data:artifacts@1') {
				const provisioner = quoteIdentifier(this.config.ARTIFACT_STORE_PROVISIONER_DATABASE_ROLE)
				await cluster.query(`GRANT ${quoteIdentifier(owner)} TO ${provisioner}`)
				await cluster.query(`SET ROLE ${quoteIdentifier(databaseOwner)}`)
				await cluster.query(
					`GRANT CONNECT ON DATABASE ${quoteIdentifier(operation.databaseName)} TO ${provisioner}`
				)
				await cluster.query('RESET ROLE')
			}
			for (const spec of manifest.functionRoles) {
				const role = databaseRoleName(operation.environmentId, spec.roleSuffix)
				const password = deriveDatabasePassword({
					root: this.roots[spec.kind] ?? '',
					environmentId: operation.environmentId,
					routingGeneration: operation.routingGeneration,
					roleKind: spec.kind
				})
				await cluster.query(
					`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${literal(role)})
					 THEN CREATE ROLE ${quoteIdentifier(role)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB
					 NOCREATEROLE NOREPLICATION CONNECTION LIMIT ${spec.connectionLimit}; END IF; END $$`
				)
				await cluster.query(
					`ALTER ROLE ${quoteIdentifier(role)} LOGIN NOINHERIT
					 CONNECTION LIMIT ${spec.connectionLimit}`
				)
				await cluster.query(`ALTER ROLE ${quoteIdentifier(role)} PASSWORD ${literal(password)}`)
				await cluster.query(`SET ROLE ${quoteIdentifier(databaseOwner)}`)
				await cluster.query(
					`REVOKE ALL ON DATABASE ${quoteIdentifier(operation.databaseName)} FROM ${quoteIdentifier(role)}`
				)
				await cluster.query(
					`GRANT CONNECT ON DATABASE ${quoteIdentifier(operation.databaseName)} TO ${quoteIdentifier(role)}`
				)
				await cluster.query('RESET ROLE')
				roles[spec.kind] = role
			}
			return roles
		} finally {
			await cluster.end()
		}
	}

	private async install(operation: Operation, entry: ComponentCatalogEntry): Promise<void> {
		const roles = await this.ensureRoles(operation, entry.manifest)
		const owner = databaseRoleName(operation.environmentId, entry.manifest.ownerRoleSuffix)
		const platformOwner = databaseRoleName(operation.environmentId, 'platform_owner')
		const customer = this.pool(operation.databaseName)
		try {
			await customer.query(
				`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(entry.manifest.schema)} AUTHORIZATION ${quoteIdentifier(owner)}`
			)
			for (const migration of entry.migrations) {
				const applied = (
					await customer.query<{ digest: string }>(
						`SELECT digest FROM aven_platform.component_migrations
						 WHERE component_ref=$1 AND migration_id=$2`,
						[entry.manifest.componentRef, migration.id]
					)
				).rows[0]
				if (applied) {
					if (applied.digest !== migration.digest)
						throw new Error('historical migration digest drift')
					continue
				}
				const client = await customer.connect()
				try {
					await client.query('BEGIN')
					await client.query(`SET LOCAL ROLE ${quoteIdentifier(owner)}`)
					await client.query(migration.sql)
					await client.query('RESET ROLE')
					await client.query(
						`INSERT INTO aven_platform.component_migrations(component_ref,migration_id,digest)
						 VALUES($1,$2,$3)`,
						[entry.manifest.componentRef, migration.id, migration.digest]
					)
					await client.query('COMMIT')
				} catch (error) {
					await client.query('ROLLBACK').catch(() => {})
					throw error
				} finally {
					client.release()
				}
			}
			const grantsClient = await customer.connect()
			try {
				for (const spec of entry.manifest.functionRoles) {
					const role = roles[spec.kind]
					if (!role) throw new Error(`missing role for ${spec.kind}`)
					await grantsClient.query(`SET ROLE ${quoteIdentifier(owner)}`)
					await grantsClient.query(
						`REVOKE ALL ON SCHEMA ${quoteIdentifier(entry.manifest.schema)} FROM ${quoteIdentifier(role)}`
					)
					await grantsClient.query(
						`GRANT USAGE ON SCHEMA ${quoteIdentifier(entry.manifest.schema)} TO ${quoteIdentifier(role)}`
					)
					const grants = entry.grants[spec.kind]
					for (const table of grants?.tables ?? [])
						await grantsClient.query(
							`GRANT ${table.privileges.join(',')} ON TABLE ${quoteIdentifier(entry.manifest.schema)}.${quoteIdentifier(table.name)} TO ${quoteIdentifier(role)}`
						)
					await grantsClient.query('RESET ROLE')
					await grantsClient.query(`SET ROLE ${quoteIdentifier(platformOwner)}`)
					await grantsClient.query(
						`GRANT USAGE ON SCHEMA aven_platform TO ${quoteIdentifier(role)}`
					)
					await grantsClient.query(
						`GRANT SELECT ON aven_platform.environment_identity,
						 aven_platform.component_installations TO ${quoteIdentifier(role)}`
					)
					await grantsClient.query('RESET ROLE')
				}
			} finally {
				grantsClient.release()
			}
			if (entry.externalProvisioner === 'artifact-store') {
				const endpoint = new URL(
					`/internal/v1/databases/${operation.databaseName}/scopes/${operation.environmentId}`,
					this.config.ARTIFACT_STORE_PROVISIONER_URL
				)
				const response = await fetch(endpoint, {
					method: 'PUT',
					headers: {
						authorization: `Bearer ${this.config.ARTIFACT_STORE_PROVISIONER_TOKEN}`
					},
					signal: AbortSignal.timeout(60_000)
				})
				if (!response.ok)
					throw new Error(`artifact store provisioning failed with HTTP ${response.status}`)
			}
			await customer.query(
				`INSERT INTO aven_platform.component_installations
				 (component_ref,schema_version,migration_set_digest,routing_generation,verified_at)
				 VALUES($1,$2,$3,$4,now()) ON CONFLICT(component_ref) DO UPDATE SET
				 schema_version=EXCLUDED.schema_version,migration_set_digest=EXCLUDED.migration_set_digest,
				 routing_generation=EXCLUDED.routing_generation,verified_at=now()`,
				[
					entry.manifest.componentRef,
					entry.manifest.targetSchemaVersion,
					entry.manifest.migrationSetDigest,
					operation.routingGeneration
				]
			)
			await customer.query(
				`UPDATE aven_platform.environment_identity SET routing_generation=$1 WHERE singleton`,
				[operation.routingGeneration]
			)
		} finally {
			await customer.end()
		}
		await this.verify(operation, entry)
	}

	private async verify(operation: Operation, entry: ComponentCatalogEntry): Promise<void> {
		const spec = entry.manifest.functionRoles[0]
		if (!spec) throw new Error('component has no runtime verification role')
		const role = databaseRoleName(operation.environmentId, spec.roleSuffix)
		const password = deriveDatabasePassword({
			root: this.roots[spec.kind] ?? '',
			environmentId: operation.environmentId,
			routingGeneration: operation.routingGeneration,
			roleKind: spec.kind
		})
		const url = new URL(this.clusterUrl)
		url.username = role
		url.password = password
		url.pathname = `/${operation.databaseName}`
		const runtime = new pg.Pool({ connectionString: url.toString(), max: 1 })
		try {
			const installation = (
				await runtime.query<{
					schema_version: number
					migration_set_digest: string
					routing_generation: number
				}>(
					`SELECT schema_version,migration_set_digest,routing_generation
					 FROM aven_platform.component_installations WHERE component_ref=$1`,
					[entry.manifest.componentRef]
				)
			).rows[0]
			if (
				Number(installation?.schema_version) !== entry.manifest.targetSchemaVersion ||
				installation?.migration_set_digest !== entry.manifest.migrationSetDigest ||
				Number(installation?.routing_generation) !== operation.routingGeneration
			)
				throw new Error('runtime component verification failed')
			const verifyTable = entry.verifyTable ?? entry.grants[spec.kind]?.tables[0]?.name
			if (!verifyTable) throw new Error('component has no runtime verification table')
			await runtime.query(
				`SELECT 1 FROM ${quoteIdentifier(entry.manifest.schema)}.${quoteIdentifier(verifyTable)} LIMIT 1`
			)
			await expectDenied(runtime, 'CREATE TABLE public.forbidden(id int)')
		} finally {
			await runtime.end()
		}
	}

	private async suspend(operation: Operation, manifest: CustomerComponentManifest): Promise<void> {
		const cluster = this.pool('postgres')
		const databaseOwner = databaseRoleName(operation.environmentId, 'db_owner')
		try {
			for (const spec of manifest.functionRoles) {
				const role = databaseRoleName(operation.environmentId, spec.roleSuffix)
				await cluster.query(`SET ROLE ${quoteIdentifier(databaseOwner)}`)
				await cluster.query(
					`REVOKE CONNECT ON DATABASE ${quoteIdentifier(operation.databaseName)} FROM ${quoteIdentifier(role)}`
				)
				await cluster.query('RESET ROLE')
				await cluster.query(
					`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
					 WHERE datname=$1 AND usename=$2 AND pid<>pg_backend_pid()`,
					[operation.databaseName, role]
				)
			}
		} finally {
			await cluster.end()
		}
	}
}

async function expectDenied(pool: pg.Pool, sql: string): Promise<void> {
	try {
		await pool.query(sql)
	} catch {
		return
	}
	throw new Error(`runtime privilege probe unexpectedly succeeded: ${sql}`)
}
