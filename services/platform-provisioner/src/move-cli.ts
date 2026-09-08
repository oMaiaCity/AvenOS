import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import pg from 'pg'
import { z } from 'zod'
import { loadCatalog } from './catalog.js'
import { provisionerConfigSchema } from './config.js'
import { CustomerMovementStore, resumeMovement } from './movement.js'
import { PostgresMovementDriver } from './movement-postgres.js'
import { CustomerDatabaseProvisioner } from './postgres.js'

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
						recoveryDatabaseUrl: z.string().regex(/^postgres(ql)?:\/\//),
						provisioner: provisionerConfigSchema
					})
					.strict()
			)
			.min(2)
			.max(32)
	})
	.strict()

async function main(): Promise<void> {
	const [file, action, ...args] = process.argv.slice(2)
	if (!file || !['register', 'begin', 'resume', 'status', 'rollback'].includes(action ?? ''))
		throw new Error(
			'Use customer:move -- CONFIG register|begin|resume|status|rollback; see the recovery handbook.'
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
	const pool = new pg.Pool({
		connectionString: config.controlDatabaseUrl,
		max: 4,
		connectionTimeoutMillis: 5000
	})
	pool.on('error', () => {})
	const store = new CustomerMovementStore(pool)
	try {
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
		if (args.length !== 1) throw new Error('Resume and status require one operation UUID.')
		const id = z.uuid().parse(args[0])
		if (action === 'status') {
			console.info(JSON.stringify(await store.read(id), null, 2))
			return
		}
		const movement = await store.read(id)
		const destination = config.runtimes.find(
			(runtime) => runtime.id === movement.destination_runtime_id
		)
		if (!destination) throw new Error('Destination runtime is absent from the configuration.')
		// Migrations are executable source. The controller must use the destination release.
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
		const provisioner = new CustomerDatabaseProvisioner(
			destination.provisioner.CLUSTER_DATABASE_URL,
			destination.provisioner
		)
		const driver = new PostgresMovementDriver({
			platformId: config.platformId,
			archiveDirectory: config.archiveDirectory,
			runtimes: Object.fromEntries(
				config.runtimes.map((runtime) => [
					runtime.id,
					{ url: runtime.recoveryDatabaseUrl, releaseSha: runtime.releaseSha }
				])
			),
			async prepareDestination(current, signal) {
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
		console.info(JSON.stringify(await resumeMovement(store, id, driver), null, 2))
	} finally {
		await pool.end()
	}
}

await main().catch((error: unknown) => {
	// PostgreSQL, URL and schema errors can contain connection material. Keep diagnostics bounded.
	console.error(
		error instanceof Error && !('code' in error) && !(error instanceof z.ZodError)
			? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[database connection]')
			: 'Customer movement failed. Admission and recovery material are preserved; inspect the operation status.'
	)
	process.exitCode = 1
})
