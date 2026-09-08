import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pg from 'pg'
import {
	databaseNameForEnvironment,
	databaseRoleName
} from '../../libs/aven-customer-contracts/src/index.js'
import type { IdentityClaims } from '../../libs/aven-identity/src/index.js'
import { SqlPlanRunner } from '../../services/actor-runner/src/sql-runner.js'
import { deterministicRunRequest } from '../../services/actor-runner/tests/support/deterministic-execution.js'
import { CustomerStore } from '../../services/aven-api/src/customers/store.js'
import { ControlStore } from '../../services/platform-provisioner/src/control.js'
import {
	CustomerMovementStore,
	resumeMovement
} from '../../services/platform-provisioner/src/movement.js'
import { PostgresMovementDriver } from '../../services/platform-provisioner/src/movement-postgres.js'

const root = resolve(import.meta.dir, '../..')
const scratch = await mkdtemp(join(tmpdir(), 'aven-customer-movement-'))
const names = [0, 1].map((index) => `aven-movement-${randomUUID()}-${index}`)
const pools: pg.Pool[] = []
const databaseImage =
	'postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73'
async function command(args: string[]) {
	const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
	const [code, output, error] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text()
	])
	if (code) throw new Error(`${args[0]} failed: ${error}`)
	return output.trim()
}
function pool(url: string, database = 'postgres', user = 'postgres'): pg.Pool {
	const parsed = new URL(url)
	parsed.pathname = `/${database}`
	parsed.username = user
	const value = new pg.Pool({
		connectionString: parsed.toString(),
		max: 4,
		connectionTimeoutMillis: 1000
	})
	value.on('error', () => {})
	pools.push(value)
	return value
}
async function eventually(check: () => Promise<boolean>) {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (await check()) return
		await Bun.sleep(50)
	}
	throw new Error('bounded customer movement condition timed out')
}
try {
	const urls: string[] = []
	for (const name of names) {
		await command([
			'docker',
			'run',
			'--detach',
			'--name',
			name,
			'--publish',
			'127.0.0.1::5432',
			'--env',
			'POSTGRES_PASSWORD=movement-test',
			databaseImage
		])
		const port = (await command(['docker', 'port', name, '5432/tcp'])).split(':').at(-1)
		const url = `postgres://postgres:movement-test@127.0.0.1:${port}/postgres?sslmode=disable`
		urls.push(url)
		await eventually(async () => {
			const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 500 })
			try {
				await client.connect()
				await client.query('SELECT 1')
				return true
			} catch {
				return false
			} finally {
				await client.end().catch(() => {})
			}
		})
	}
	for (const url of urls)
		await pool(url).query("COMMENT ON DATABASE postgres IS 'aven-platform:movement-test'")
	await pool(urls[1]).query("CREATE ROLE unrelated_customer LOGIN PASSWORD 'movement-test'")
	const source = pool(urls[0])
	await source.query('CREATE DATABASE aven_api')
	const control = pool(urls[0], 'aven_api')
	for (const role of [
		'aven_api_authorization',
		'aven_api_entitlements',
		'aven_api_reconciler',
		'aven_api_migrator'
	])
		await source.query(`CREATE ROLE ${role} NOLOGIN`)
	for (const file of ['0001_customer_platform.sql', '0002_customer_movement.sql'])
		await control.query(await readFile(join(root, 'services/aven-api/migrations', file), 'utf8'))
	const store = new CustomerMovementStore(control)
	await store.registerRuntime('primary', 'a'.repeat(40))
	await store.registerRuntime('green', 'b'.repeat(40))
	await assert.rejects(store.registerRuntime('green', 'c'.repeat(40)), /another release/)
	const customers = new CustomerStore(control)
	const subject = randomUUID()
	const environments: string[] = []
	for (const name of ['customer-a', 'customer-b']) {
		const { environmentId } = await customers.acceptEntitlement({
			eventId: randomUUID(),
			eventType: 'purchase_granted',
			subjectId: subject,
			purchasedName: name,
			occurredAt: new Date().toISOString()
		})
		environments.push(environmentId)
		const db = databaseNameForEnvironment(environmentId)
		for (const suffix of ['db_owner', 'int_api', 'act_api', 'act_worker'])
			await source.query(
				`CREATE ROLE ${databaseRoleName(environmentId, suffix)} ${suffix === 'db_owner' ? 'NOLOGIN' : "LOGIN PASSWORD 'movement-test'"}`
			)
		await source.query(`CREATE DATABASE ${db} OWNER ${databaseRoleName(environmentId, 'db_owner')}`)
		const customer = pool(urls[0], db)
		await customer.query(
			`REVOKE ALL ON DATABASE ${db} FROM PUBLIC; GRANT CONNECT ON DATABASE ${db} TO ${['int_api', 'act_api', 'act_worker'].map((suffix) => databaseRoleName(environmentId, suffix)).join(',')}`
		)
		await customer.query(`CREATE SCHEMA aven_platform; CREATE TABLE aven_platform.environment_identity (
		 singleton boolean PRIMARY KEY DEFAULT true,environment_id uuid NOT NULL,routing_generation bigint NOT NULL,execution_enabled boolean NOT NULL DEFAULT true,execution_unsettled uuid[] NOT NULL DEFAULT '{}')`)
		await customer.query(
			'INSERT INTO aven_platform.environment_identity(singleton,environment_id,routing_generation,execution_enabled) VALUES(true,$1,1,true)',
			[environmentId]
		)
		await customer.query(
			'CREATE TABLE aven_platform.component_installations(component_ref text PRIMARY KEY,schema_version integer,migration_set_digest text,routing_generation bigint)'
		)
		for (const component of (
			await control.query('SELECT * FROM customer_environment_components WHERE environment_id=$1', [
				environmentId
			])
		).rows)
			await customer.query('INSERT INTO aven_platform.component_installations VALUES($1,$2,$3,1)', [
				component.component_ref,
				component.target_schema_version,
				component.migration_set_digest
			])
		await customer.query('CREATE TABLE content(id integer PRIMARY KEY, bytes bytea NOT NULL)')
		await customer.query('INSERT INTO content VALUES(1,$1)', [
			Buffer.from(`exact bytes for ${name}\0\u2603`)
		])
		await customer.query('CREATE SCHEMA aven_actor_runs')
		await customer.query(
			`SET search_path=aven_actor_runs,public; ${await readFile(join(root, 'services/platform-provisioner/components/actor-runs/0001_actor_runs.sql'), 'utf8')}`
		)
		for (const suffix of ['int_api', 'act_api', 'act_worker']) {
			const role = databaseRoleName(environmentId, suffix)
			await customer.query(
				`GRANT USAGE ON SCHEMA public,aven_platform,aven_actor_runs TO ${role}; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public,aven_actor_runs TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA aven_platform TO ${role}`
			)
		}
		await customer.query(
			`GRANT UPDATE(execution_unsettled) ON aven_platform.environment_identity TO ${databaseRoleName(environmentId, 'act_worker')}`
		)
	}
	await control.query(
		"UPDATE customer_environments SET observed_state='ready'; UPDATE customer_environment_components SET observed_state='ready'; UPDATE customer_component_operations SET status='succeeded'"
	)
	const [a, b] = environments
	const aDb = databaseNameForEnvironment(a),
		bDb = databaseNameForEnvironment(b)
	const aAdmin = pool(urls[0], aDb),
		bApi = pool(urls[0], bDb, databaseRoleName(b, 'int_api'))
	const aApi = pool(urls[0], aDb, databaseRoleName(a, 'act_api'))
	const aWorker = pool(urls[0], aDb, databaseRoleName(a, 'act_worker'))
	for (const connection of [aApi, aWorker]) {
		// A single physical connection is enough for this deterministic executor fixture.
		connection.options.options = '-c search_path=aven_actor_runs,public,pg_catalog'
	}
	let releaseExecutor = () => {}
	let startedExecutor = () => {}
	const executing = new Promise<void>((done) => {
		startedExecutor = done
	})
	const drain = new Promise<void>((done) => {
		releaseExecutor = done
	})
	const runner = new SqlPlanRunner(
		aApi,
		aWorker,
		async () => {
			startedExecutor()
			await drain
			return { remainingGoals: [] }
		},
		true
	)
	const run = await runner.start(deterministicRunRequest('server', subject, randomUUID()))
	await executing
	const operationId = randomUUID()
	const input = {
		id: operationId,
		environmentId: a,
		sourceRuntimeId: 'primary',
		destinationRuntimeId: 'green',
		expectedGeneration: 1
	}
	await store.begin(input)
	assert.equal(await store.begin(input), operationId)
	await assert.rejects(store.begin({ ...input, id: randomUUID() }), /placement/)
	await assert.rejects(store.begin({ ...input, expectedGeneration: 2 }), /different input/)
	const claims = { sub: subject, sid: 'session', role: 'user' } as IdentityClaims
	await assert.rejects(
		customers.authorize(claims, a, 'ceo.aven:component:data:intents@1', ['intents:read']),
		/not ready/
	)
	assert.equal(
		(await customers.authorize(claims, b, 'ceo.aven:component:data:intents@1', ['intents:read']))
			.runtimeId,
		'primary'
	)
	await control.query(
		"UPDATE customer_component_operations SET status='queued' WHERE environment_id=$1",
		[a]
	)
	assert.equal(await new ControlStore(control, 'test', 60).claim(), null)
	const runtimes = {
		primary: { url: urls[0], releaseSha: 'a'.repeat(40) },
		green: { url: urls[1], releaseSha: 'b'.repeat(40) }
	}
	let failVerification = true
	let failObservation = true
	const driver = new PostgresMovementDriver({
		runtimes,
		archiveDirectory: scratch,
		platformId: 'movement-test',
		async prepareDestination(movement) {
			const db = pool(
				runtimes[movement.destination_runtime_id as keyof typeof runtimes].url,
				movement.database_name
			)
			await db.query(
				'UPDATE aven_platform.environment_identity SET routing_generation=$1 WHERE singleton',
				[movement.destination_generation]
			)
			await db.query('UPDATE aven_platform.component_installations SET routing_generation=$1', [
				movement.destination_generation
			])
			for (const suffix of ['int_api', 'act_api', 'act_worker']) {
				const role = databaseRoleName(movement.environment_id, suffix)
				await db.query(
					`ALTER ROLE ${role} LOGIN PASSWORD 'movement-test'; GRANT CONNECT ON DATABASE ${movement.database_name} TO ${role}`
				)
			}
		},
		async verifyApplication(movement) {
			if (failVerification) throw new Error('injected readiness failure')
			if (failObservation && movement.phase === 'activated')
				throw new Error('injected post-activation failure')
			const db = pool(
				runtimes[movement.destination_runtime_id as keyof typeof runtimes].url,
				movement.database_name
			)
			assert.equal(
				(await db.query('SELECT bytes FROM content WHERE id=1')).rows[0].bytes.toString(),
				`exact bytes for ${movement.environment_id === a ? 'customer-a' : 'customer-b'}\0\u2603`
			)
		}
	})
	const movement = await store.read(operationId)
	await pool(urls[1]).query("COMMENT ON DATABASE postgres IS 'aven-platform:another-target'")
	await assert.rejects(
		driver.fence(movement, new AbortController().signal),
		/another installation target/
	)
	assert.equal(
		(await aAdmin.query('SELECT execution_enabled FROM aven_platform.environment_identity')).rows[0]
			.execution_enabled,
		true
	)
	await pool(urls[1]).query("COMMENT ON DATABASE postgres IS 'aven-platform:movement-test'")
	let fenced = false
	const fencing = driver.fence(movement, new AbortController().signal).then(() => {
		fenced = true
	})
	await eventually(
		async () =>
			(await aAdmin.query('SELECT execution_enabled FROM aven_platform.environment_identity'))
				.rows[0]?.execution_enabled === false
	)
	assert.equal(fenced, false, 'active execution must delay fencing')
	await bApi.query("INSERT INTO content VALUES(2,'other customer kept writing'::bytea)")
	releaseExecutor()
	await fencing
	await store.advance(operationId, 'paused', 'fenced', {})
	assert.equal(
		(await aAdmin.query('SELECT state FROM aven_actor_runs.runs WHERE id=$1', [run.runId])).rows[0]
			.state,
		'succeeded'
	)
	await assert.rejects(aApi.query('SELECT 1'))
	await assert.rejects(resumeMovement(store, operationId, driver), /injected readiness/)
	assert.equal((await store.read(operationId)).phase, 'copied')
	assert.equal(
		(await control.query('SELECT runtime_id FROM customer_environments WHERE id=$1', [a])).rows[0]
			.runtime_id,
		'primary'
	)
	failVerification = false
	await assert.rejects(resumeMovement(store, operationId, driver), /post-activation failure/)
	assert.equal((await store.read(operationId)).phase, 'activated')
	assert.equal(
		(await customers.authorize(claims, a, 'ceo.aven:component:data:intents@1', ['intents:read']))
			.runtimeId,
		'green'
	)
	await assert.rejects(pool(urls[1], aDb, 'unrelated_customer').query('SELECT 1'))
	const aNew = pool(urls[1], aDb, databaseRoleName(a, 'int_api'))
	await aNew.query("INSERT INTO content VALUES(2,'new history'::bytea)")
	await assert.rejects(
		store.begin({
			environmentId: a,
			sourceRuntimeId: 'green',
			destinationRuntimeId: 'primary',
			expectedGeneration: 2,
			rollbackOf: operationId
		}),
		/divergence/
	)
	const rollback = await store.begin({
		environmentId: a,
		sourceRuntimeId: 'green',
		destinationRuntimeId: 'primary',
		expectedGeneration: 2,
		rollbackOf: operationId,
		acceptDivergence: true
	})
	assert.equal((await store.read(operationId)).phase, 'superseded')
	failObservation = false
	assert.equal((await resumeMovement(store, rollback, driver)).phase, 'completed')
	assert.equal(
		(await customers.authorize(claims, a, 'ceo.aven:component:data:intents@1', ['intents:read']))
			.routingGeneration,
		3
	)
	assert.equal((await aAdmin.query('SELECT count(*)::int AS n FROM content')).rows[0].n, 1)
	assert.equal(
		(await pool(urls[1], aDb).query('SELECT count(*)::int AS n FROM content')).rows[0].n,
		2
	)
	assert.equal(
		(await aAdmin.query('SELECT execution_enabled FROM aven_platform.environment_identity')).rows[0]
			.execution_enabled,
		false
	)
	assert.equal((await bApi.query('SELECT count(*)::int AS n FROM content')).rows[0].n, 2)
	const pausedRunner = new SqlPlanRunner(
		pool(urls[0], aDb, databaseRoleName(a, 'act_api')),
		pool(urls[0], aDb, databaseRoleName(a, 'act_worker')),
		async () => {
			throw new Error('paused execution must not run')
		},
		true
	)
	await assert.rejects(
		pausedRunner.start(deterministicRunRequest('server', subject, randomUUID())),
		/Work is paused/
	)

	// A second controller cannot run effects while the first owns the operation lock.
	let releaseController = () => {}
	let controllerEntered = () => {}
	const controllerReady = new Promise<void>((done) => {
		controllerEntered = done
	})
	const controllerWait = new Promise<void>((done) => {
		releaseController = done
	})
	const held = store.exclusive(operationId, async () => {
		controllerEntered()
		await controllerWait
	})
	await controllerReady
	await assert.rejects(
		store.exclusive(operationId, async () => {}),
		/another controller/
	)
	releaseController()
	await held
	// A lost worker session leaves a durable uncertain attempt; lock absence alone is insufficient.
	const bAdmin = pool(urls[0], bDb)
	await bAdmin.query(
		'UPDATE aven_platform.environment_identity SET execution_unsettled=ARRAY[$1::uuid]',
		[randomUUID()]
	)
	const blocked = await store.begin({
		environmentId: b,
		sourceRuntimeId: 'primary',
		destinationRuntimeId: 'green',
		expectedGeneration: 1
	})
	await assert.rejects(resumeMovement(store, blocked, driver), /requires reconciliation/)
	assert.equal((await store.read(blocked)).phase, 'paused')
	assert.equal(
		(await control.query('SELECT runtime_id FROM customer_environments WHERE id=$1', [b])).rows[0]
			.runtime_id,
		'primary'
	)
	// Entitlement changes remain effective, but cannot remove the independent migration hold.
	await customers.acceptEntitlement({
		eventId: randomUUID(),
		eventType: 'purchase_revoked',
		subjectId: subject,
		purchasedName: 'customer-b',
		occurredAt: new Date().toISOString()
	})
	assert.equal(
		(await control.query('SELECT movement_id FROM customer_environments WHERE id=$1', [b])).rows[0]
			.movement_id,
		blocked
	)
	assert.equal(await new ControlStore(control, 'held-test', 60).claim(), null)
	await assert.rejects(
		customers.authorize(claims, b, 'ceo.aven:component:data:intents@1', ['intents:read']),
		/not ready/
	)
	await bAdmin.query("UPDATE aven_platform.environment_identity SET execution_unsettled='{}'")
	await assert.rejects(resumeMovement(store, blocked, driver), /entitlement changed/)
	assert.equal((await store.read(blocked)).phase, 'verified')
	await customers.acceptEntitlement({
		eventId: randomUUID(),
		eventType: 'purchase_granted',
		subjectId: subject,
		purchasedName: 'customer-b',
		occurredAt: new Date().toISOString()
	})
	assert.equal((await resumeMovement(store, blocked, driver)).phase, 'completed')
	assert.equal(
		(await customers.authorize(claims, b, 'ceo.aven:component:data:intents@1', ['intents:read']))
			.runtimeId,
		'green'
	)
	console.info(
		'Customer movement proof passed: two clusters, one customer paused, executor drain, source fence, restore, failed readiness, resume, routing and divergent rollback with both histories preserved.'
	)
} finally {
	await Promise.allSettled(pools.map((value) => value.end()))
	for (const name of names) await command(['docker', 'rm', '--force', name]).catch(() => {})
	await rm(scratch, { recursive: true, force: true })
}
