import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import pg from 'pg'
import { z } from 'zod'
import { loadCatalog } from './catalog.js'
import { provisionerConfigSchema } from './config.js'
import { CustomerMovementStore, resumeMovement } from './movement.js'
import { PostgresMovementDriver } from './movement-postgres.js'
import { CustomerDatabaseProvisioner, restoreProvisionerAuthority } from './postgres.js'

const runtimeId = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/)
const configSchema = z
	.object({
		platformId: z.string().min(1).max(128),
		controlDatabaseUrl: z.string().regex(/^postgres(ql)?:\/\//),
		archiveDirectory: z.string().refine(isAbsolute),
		runtimes: z
			.array(
				z
					.object({
						id: runtimeId,
						releaseSha: z.string().regex(/^[a-f0-9]{40}$/),
						databaseToolsImage: z
							.string()
							.regex(/^(?:[a-zA-Z0-9][a-zA-Z0-9.:/_-]*@)?sha256:[a-f0-9]{64}$/)
							.optional(),
						recoveryDatabaseUrl: z.string().regex(/^postgres(ql)?:\/\//),
						provisioner: provisionerConfigSchema
					})
					.strict()
			)
			.min(1)
			.max(32)
	})
	.strict()

async function main(): Promise<void> {
	const [file, action, ...args] = process.argv.slice(2)
	if (
		!file ||
		![
			'register',
			'list',
			'begin',
			'resume',
			'status',
			'rollback',
			'default',
			'return',
			'reconcile'
		].includes(action ?? '')
	)
		throw new Error(
			'Use customer:move -- CONFIG register|list|begin|resume|status|rollback|default|return|reconcile; see the recovery handbook.'
		)
	const info = await lstat(file)
	if (
		!info.isFile() ||
		info.isSymbolicLink() ||
		(info.mode & 0o077) !== 0 ||
		info.uid !== process.getuid?.()
	)
		throw new Error('Movement configuration must be an operator-owned private regular file.')
	const config = configSchema.parse(JSON.parse(await readFile(file, 'utf8')))
	if (new Set(config.runtimes.map((runtime) => runtime.id)).size !== config.runtimes.length)
		throw new Error('Runtime IDs must be unique.')
	for (const runtime of config.runtimes) {
		const recovery = new URL(runtime.recoveryDatabaseUrl)
		const provisioning = new URL(runtime.provisioner.CLUSTER_DATABASE_URL)
		if (
			recovery.hostname !== provisioning.hostname ||
			(recovery.port || '5432') !== (provisioning.port || '5432') ||
			runtime.provisioner.CUSTOMER_RUNTIME_ID !== runtime.id
		)
			throw new Error('Recovery and provisioning must name the same runtime and database endpoint.')
	}
	const pool = new pg.Pool({
		connectionString: config.controlDatabaseUrl,
		max: 4,
		connectionTimeoutMillis: 5000
	})
	pool.on('error', () => {})
	const store = new CustomerMovementStore(pool)
	try {
		if (action === 'list') {
			if (args.length) throw new Error('List takes no additional arguments.')
			console.info(
				JSON.stringify(
					(
						await pool.query(
							'SELECT id,runtime_id,routing_generation,desired_state,observed_state,movement_id FROM customer_environments ORDER BY id'
						)
					).rows
				)
			)
			return
		}
		if (action === 'register') {
			if (args.length) throw new Error('Register takes no additional arguments.')
			for (const runtime of config.runtimes)
				await store.registerRuntime(runtime.id, runtime.releaseSha)
			console.info('Runtime release identities registered. Customer placement is unchanged.')
			return
		}
		if (action === 'begin' || action === 'rollback') {
			const [
				environmentId,
				sourceRuntimeId,
				destinationRuntimeId,
				generation,
				id,
				rollbackOf,
				acceptance
			] = args
			if (
				(action === 'begin' && args.length !== 5) ||
				(action === 'rollback' && (args.length !== 7 || acceptance !== 'accept-divergence'))
			)
				throw new Error(
					'Begin requires ENV SOURCE DESTINATION GENERATION OPERATION; rollback additionally requires RETAINED_OPERATION accept-divergence.'
				)
			const result = await store.begin({
				id: z.uuid().parse(id),
				environmentId: z.uuid().parse(environmentId),
				sourceRuntimeId: runtimeId.parse(sourceRuntimeId),
				destinationRuntimeId: runtimeId.parse(destinationRuntimeId),
				expectedGeneration: Number(generation),
				...(action === 'rollback' && {
					rollbackOf: z.uuid().parse(rollbackOf),
					acceptDivergence: true
				})
			})
			console.info(`Customer admission paused. Resume operation ${result}.`)
			return
		}
		if (args.length !== 1)
			throw new Error(
				'Resume and status require one operation UUID; default requires one runtime ID.'
			)
		const runtimeAction = action === 'default' || action === 'reconcile'
		const id = runtimeAction ? runtimeId.parse(args[0]) : z.uuid().parse(args[0])
		if (action === 'status') {
			console.info(JSON.stringify(await store.read(id), null, 2))
			return
		}
		const movement = runtimeAction ? undefined : await store.read(id)
		if (
			movement &&
			((action === 'resume' && ['completed', 'cancelled', 'superseded'].includes(movement.phase)) ||
				(action === 'return' && movement.phase === 'cancelled'))
		) {
			console.info(JSON.stringify(movement, null, 2))
			return
		}

		const destination = config.runtimes.find(
			(runtime) =>
				runtime.id ===
				(runtimeAction
					? id
					: action === 'return' || movement?.phase === 'returning'
						? movement?.source_runtime_id
						: movement?.destination_runtime_id)
		)
		if (!destination) throw new Error('Destination runtime is absent from the configuration.')
		// The installed controller comes from the verified immutable provisioner image.
		// Development invocations still require the destination's clean source checkout.
		const releaseFile = resolve(import.meta.dir, '../release-sha')
		if (await Bun.file(releaseFile).exists()) {
			if ((await readFile(releaseFile, 'utf8')).trim() !== destination.releaseSha)
				throw new Error('Use the controller from the destination release image.')
		} else {
			const revision = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
				cwd: resolve(import.meta.dir, '../../..'),
				stdout: 'pipe',
				stderr: 'ignore'
			})
			const currentSha = (await new Response(revision.stdout).text()).trim()
			if ((await revision.exited) !== 0 || currentSha !== destination.releaseSha)
				throw new Error('Run resume from the destination release checkout.')
			const changes = Bun.spawn(['git', 'status', '--porcelain', '--untracked-files=normal'], {
				cwd: resolve(import.meta.dir, '../../..'),
				stdout: 'pipe',
				stderr: 'ignore'
			})
			if ((await new Response(changes.stdout).text()).trim() || (await changes.exited) !== 0)
				throw new Error('The destination release checkout must be clean.')
		}
		for (const runtime of config.runtimes) {
			const registered = (
				await pool.query<{ release_sha: string }>(
					'SELECT release_sha FROM customer_runtimes WHERE id=$1',
					[runtime.id]
				)
			).rows[0]
			if (registered?.release_sha !== runtime.releaseSha)
				throw new Error('Configured and registered runtime releases differ.')
		}
		process.chdir(resolve(import.meta.dir, '..'))
		const catalog = await loadCatalog()
		if (action === 'default') {
			const health = await fetch(
				new URL('/health/ready', destination.provisioner.ARTIFACT_STORE_PROVISIONER_URL),
				{ signal: AbortSignal.timeout(5000) }
			)
			if (!health.ok) throw new Error('Destination provisioner is not ready.')
			await store.selectDefaultRuntime(
				destination.id,
				destination.releaseSha,
				[...catalog.values()].map(({ manifest }) => ({
					componentRef: manifest.componentRef,
					targetSchemaVersion: manifest.targetSchemaVersion,
					migrationSetDigest: manifest.migrationSetDigest
				}))
			)
			console.info(`New customer environments will use runtime ${destination.id}.`)
			return
		}
		const provisioner = new CustomerDatabaseProvisioner(
			destination.provisioner.CLUSTER_DATABASE_URL,
			destination.provisioner
		)
		if (action === 'reconcile') {
			// Queue work through the same placement-aware worker used for normal provisioning.
			// This never reopens a retained database or changes a customer's generation/catalog.
			const client = await pool.connect()
			try {
				await client.query('BEGIN')
				const customers = await client.query<{ id: string }>(
					"SELECT id FROM customer_environments WHERE runtime_id=$1 AND desired_state='ready' AND movement_id IS NULL ORDER BY id FOR UPDATE",
					[id]
				)
				for (const customer of customers.rows) {
					await restoreProvisionerAuthority(
						destination.recoveryDatabaseUrl,
						decodeURIComponent(new URL(destination.provisioner.CLUSTER_DATABASE_URL).username),
						customer.id,
						catalog.values()
					)
					await client.query(
						`UPDATE customer_component_operations o SET status='queued',last_error=NULL,updated_at=now()
						 FROM customer_environments e WHERE e.id=$1 AND o.environment_id=e.id
						 AND o.routing_generation=e.routing_generation AND o.action='reconcile' AND o.status='succeeded'`,
						[customer.id]
					)
					await client.query(
						"UPDATE customer_environment_components SET observed_state='pending' WHERE environment_id=$1 AND desired_state='ready'",
						[customer.id]
					)
					await client.query(
						"UPDATE customer_environments SET observed_state='reconciling' WHERE id=$1",
						[customer.id]
					)
				}
				await client.query('COMMIT')
				console.info(
					`Queued reconciliation for ${customers.rowCount} customer environments at their existing generation.`
				)
			} catch (error) {
				await client.query('ROLLBACK').catch(() => {})
				throw error
			} finally {
				client.release()
			}
			return
		}
		const driver = new PostgresMovementDriver({
			platformId: config.platformId,
			databaseToolsImage: destination.databaseToolsImage,
			archiveDirectory: config.archiveDirectory,
			runtimes: Object.fromEntries(
				config.runtimes.map((runtime) => [
					runtime.id,
					{ url: runtime.recoveryDatabaseUrl, releaseSha: runtime.releaseSha }
				])
			),
			async prepareDestination(current, signal) {
				await restoreProvisionerAuthority(
					destination.recoveryDatabaseUrl,
					decodeURIComponent(new URL(destination.provisioner.CLUSTER_DATABASE_URL).username),
					current.environment_id,
					catalog.values()
				)
				for (const entry of catalog.values()) {
					signal.throwIfAborted()
					await provisioner.reconcile(
						{
							id: current.id,
							environmentId: current.environment_id,
							databaseName: current.database_name,
							componentRef: entry.manifest.componentRef,
							action: 'reconcile',
							targetSchemaVersion: entry.manifest.targetSchemaVersion,
							migrationSetDigest: entry.manifest.migrationSetDigest,
							routingGeneration: current.destination_generation
						},
						entry
					)
				}
			},
			async verifyApplication(current, signal) {
				for (const entry of catalog.values()) {
					signal.throwIfAborted()
					await provisioner.verify(
						{
							id: current.id,
							environmentId: current.environment_id,
							databaseName: current.database_name,
							componentRef: entry.manifest.componentRef,
							action: 'reconcile',
							targetSchemaVersion: entry.manifest.targetSchemaVersion,
							migrationSetDigest: entry.manifest.migrationSetDigest,
							routingGeneration: current.destination_generation
						},
						entry
					)
				}
			}
		})
		console.info(
			JSON.stringify(await resumeMovement(store, id, driver, action === 'return'), null, 2)
		)
	} finally {
		await pool.end()
	}
}

await main().catch((error: unknown) => {
	// PostgreSQL, URL and schema errors can contain connection material. Keep diagnostics bounded.
	const databaseCode =
		error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
	const code =
		error instanceof z.ZodError
			? 'CONFIGURATION_INVALID'
			: ['28P01', '28000'].includes(databaseCode)
				? 'DATABASE_AUTHENTICATION_FAILED'
				: databaseCode === '42501'
					? 'DATABASE_PERMISSION_DENIED'
					: databaseCode === '42P01'
						? 'CONTROL_SCHEMA_MISSING'
						: ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(databaseCode)
							? 'DATABASE_UNREACHABLE'
							: 'OPERATION_FAILED'
	console.error(
		error instanceof Error && !('code' in error) && !(error instanceof z.ZodError)
			? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[database connection]')
			: `Customer movement failed (${code}). Admission and recovery material are preserved; inspect the operation status.`
	)
	process.exitCode = 1
})
