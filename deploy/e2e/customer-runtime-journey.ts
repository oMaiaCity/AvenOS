import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import pg from 'pg'
import {
	databaseNameForEnvironment,
	databaseRoleName,
	signTenantGrant
} from '../../libs/aven-customer-contracts/src/index.js'
import { TenantPoolProvider } from '../../libs/aven-customer-runtime/src/index.js'
import { IdentityVerifier } from '../../libs/aven-identity/src/index.js'
import { facadeConfigSchema } from '../../services/aven-api/src/config.js'
import { CustomerHandler } from '../../services/aven-api/src/customers/handler.js'
import { CustomerStore } from '../../services/aven-api/src/customers/store.js'
import { createFacadeHandler } from '../../services/aven-api/src/facade.js'
import { createIntentHandler } from '../../services/intent-service/src/handler.js'
import { IntentStore } from '../../services/intent-service/src/store.js'
import { loadCatalog } from '../../services/platform-provisioner/src/catalog.js'
import { provisionerConfigSchema } from '../../services/platform-provisioner/src/config.js'
import { ControlStore, type Operation } from '../../services/platform-provisioner/src/control.js'
import {
	CustomerMovementStore,
	type Movement,
	type MovementDriver,
	resumeMovement
} from '../../services/platform-provisioner/src/movement.js'
import { PostgresMovementDriver } from '../../services/platform-provisioner/src/movement-postgres.js'
import { CustomerDatabaseProvisioner } from '../../services/platform-provisioner/src/postgres.js'

const root = resolve(import.meta.dir, '../..')
const scratch = await mkdtemp(join(tmpdir(), 'aven-runtime-journey-'))
const containers: string[] = []
const pools: pg.Pool[] = []
const providers: TenantPoolProvider[] = []
const servers: ReturnType<typeof Bun.serve>[] = []
const started = performance.now()
const component = 'ceo.aven:component:data:intents@1'
const serviceToken = 's'.repeat(40)
const credentialRoot = 'r'.repeat(43)
async function command(args: string[]) {
	const child = Bun.spawn(args, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
	const [code, output, error] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text()
	])
	if (code) throw new Error(`${args[0]} failed: ${error}`)
	return output.trim()
}
function pool(url: string, database = 'postgres') {
	const parsed = new URL(url)
	parsed.pathname = `/${database}`
	const value = new pg.Pool({
		connectionString: parsed.toString(),
		max: 2,
		connectionTimeoutMillis: 1000
	})
	value.on('error', () => {})
	pools.push(value)
	return value
}
async function eventually(work: () => Promise<unknown>) {
	let last: unknown
	for (let n = 0; n < 100; n++) {
		try {
			return await work()
		} catch (e) {
			last = e
			await Bun.sleep(100)
		}
	}
	throw last
}
function serve(fetch: (request: Request) => Response | Promise<Response>) {
	const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch })
	servers.push(server)
	return server
}
try {
	await command([
		'docker',
		'build',
		'--file',
		'services/artifact-store/Dockerfile',
		'--tag',
		'aven-movement-artifacts:local',
		'.'
	])
	const identityKeys = await generateKeyPair('EdDSA')
	const tenantKeys = await generateKeyPair('EdDSA')
	const jwk = {
		...(await exportJWK(identityKeys.publicKey)),
		kid: 'journey',
		alg: 'EdDSA',
		use: 'sig'
	}
	const identity = serve(() => Response.json({ keys: [jwk] }))
	const issuer = identity.url.origin
	const verifier = new IdentityVerifier({ issuer, jwksUrl: `${issuer}/jwks` })
	const subject = randomUUID()
	const token = await new SignJWT({
		sid: 'unchanged-session',
		email: 'customer@example.test',
		email_verified: true,
		role: 'user',
		amr: ['passkey'],
		scope: 'services:access'
	})
		.setProtectedHeader({ alg: 'EdDSA', kid: 'journey' })
		.setIssuer(issuer)
		.setAudience('aven-services')
		.setSubject(subject)
		.setIssuedAt()
		.setExpirationTime('20m')
		.sign(identityKeys.privateKey)
	const claims = await verifier.verify(token)
	const runtimes: Record<
		string,
		{ url: string; releaseSha: string; provisioner: CustomerDatabaseProvisioner; intents: string }
	> = {}
	for (const [index, id] of ['primary', 'green'].entries()) {
		const name = `aven-journey-${randomUUID()}`
		containers.push(name)
		await command([
			'docker',
			'run',
			'--detach',
			'--name',
			name,
			'--publish',
			'127.0.0.1::5432',
			'--env',
			'POSTGRES_PASSWORD=journey-test',
			'postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73'
		])
		const port = (await command(['docker', 'port', name, '5432/tcp'])).split(':').at(-1)
		assert.ok(port)
		const url = `postgres://postgres:journey-test@127.0.0.1:${port}/postgres?sslmode=disable`
		const admin = pool(url)
		await eventually(() => admin.query('SELECT 1'))
		await admin.query(
			"COMMENT ON DATABASE postgres IS 'aven-platform:runtime-journey'; CREATE ROLE aven_backup NOLOGIN; CREATE ROLE aven_artifact_store_provisioner LOGIN PASSWORD 'journey-artifacts'"
		)
		const reservation = serve(() => new Response())
		const artifactPort = reservation.port
		assert.ok(artifactPort)
		await reservation.stop(true)
		const artifactName = `${name}-artifacts`
		containers.push(artifactName)
		const artifactUrl = new URL(url)
		artifactUrl.username = 'aven_artifact_store_provisioner'
		artifactUrl.password = 'journey-artifacts'
		await command([
			'docker',
			'run',
			'--detach',
			'--name',
			artifactName,
			'--network',
			'host',
			'--env',
			`ARTIFACT_STORE_PROVISIONER_DATABASE_URL=${artifactUrl}`,
			'--env',
			`ARTIFACT_STORE_PROVISIONER_BEARER_TOKEN=${serviceToken}`,
			'--env',
			`ARTIFACT_STORE_PROVISIONER_LISTEN=127.0.0.1:${artifactPort}`,
			'--env',
			`ARTIFACT_STORE_HEALTH_PORT=${artifactPort}`,
			'aven-movement-artifacts:local',
			'serve-provisioner'
		])
		await eventually(async () =>
			assert.equal((await fetch(`http://127.0.0.1:${artifactPort}/health/ready`)).ok, true)
		)
		const config = provisionerConfigSchema.parse({
			CLUSTER_DATABASE_URL: url,
			CONTROL_DATABASE_URL: url,
			CUSTOMER_RUNTIME_ID: id,
			INTENTS_API_DB_CREDENTIAL_ROOT: credentialRoot,
			ACTOR_API_DB_CREDENTIAL_ROOT: credentialRoot,
			ACTOR_WORKER_DB_CREDENTIAL_ROOT: credentialRoot,
			ARTIFACT_API_DB_CREDENTIAL_ROOT: credentialRoot,
			ARTIFACT_STORE_PROVISIONER_URL: `http://127.0.0.1:${artifactPort}`,
			ARTIFACT_STORE_PROVISIONER_TOKEN: serviceToken
		})
		const provider = new TenantPoolProvider({
			host: '127.0.0.1',
			port: Number(port),
			ssl: false,
			credentialRoot,
			roleKind: 'ceo.aven:db-role:intents:api@1',
			roleSuffix: 'int_api',
			componentRef: component,
			searchPath: ['aven_intents']
		})
		providers.push(provider)
		const intents = serve(
			createIntentHandler(
				{ INTENT_SERVICE_BEARER_TOKEN: serviceToken, TENANT_GRANT_ISSUER: 'https://api.aven.ceo' },
				verifier,
				tenantKeys.publicKey,
				{ forGrant: async (grant) => new IntentStore(await provider.forGrant(grant)) },
				console.error
			)
		)
		runtimes[id] = {
			url,
			releaseSha: String(index + 1).repeat(40),
			provisioner: new CustomerDatabaseProvisioner(url, config),
			intents: intents.url.origin
		}
	}
	await pool(runtimes.primary.url).query('CREATE DATABASE aven_api;')
	const control = pool(runtimes.primary.url, 'aven_api')
	for (const name of ['authorization', 'entitlements', 'reconciler', 'migrator'])
		await pool(runtimes.primary.url).query(`CREATE ROLE aven_api_${name} NOLOGIN`)
	for (const file of (await readdir(join(root, 'services/aven-api/migrations')))
		.filter((f) => /^\d+_customer|^\d+_runtime/.test(f))
		.sort())
		await control.query(await readFile(join(root, 'services/aven-api/migrations', file), 'utf8'))
	const movementStore = new CustomerMovementStore(control)
	for (const [id, runtime] of Object.entries(runtimes))
		await movementStore.registerRuntime(id, runtime.releaseSha)
	const customers = new CustomerStore(control)
	const customerHandler = new CustomerHandler(
		customers,
		customers,
		serviceToken,
		tenantKeys.privateKey
	)
	const target = (id: string) => ({
		segment: 'intents',
		baseUrl: runtimes[id].intents,
		targetPrefix: '/api/intents',
		bearerToken: serviceToken,
		componentRef: component,
		readAction: 'intents:read',
		writeAction: 'intents:write'
	})
	const config = facadeConfigSchema.parse({
		DATABASE_URL: runtimes.primary.url,
		SITE_HOST_DIRECTORY_BEARER_TOKEN: serviceToken,
		CUSTOMER_ENTITLEMENT_TOKEN: serviceToken,
		TENANT_GRANT_PRIVATE_KEY: 'unused'.repeat(20),
		IDENTITY_ISSUER: issuer,
		CUSTOMER_DOWNSTREAMS_JSON: JSON.stringify([target('primary')]),
		CUSTOMER_RUNTIMES_JSON: JSON.stringify([
			{
				id: 'green',
				targets: [target('green')],
				artifactStoreBaseUrl: 'http://127.0.0.1:1',
				artifactStoreBearerToken: serviceToken
			}
		])
	})
	const gateway = serve(createFacadeHandler(config, verifier, fetch, undefined, customerHandler))
	async function request(env: string, path = '', method = 'GET', body?: unknown) {
		return fetch(`${gateway.url.origin}/api/environments/${env}/intents${path}`, {
			method,
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		})
	}
	process.chdir(join(root, 'services/platform-provisioner'))
	const catalog = await loadCatalog()
	const getEntry = (ref: string) => {
		const entry = catalog.get(ref)
		assert.ok(entry)
		return entry
	}
	const catalogTargets = [...catalog.values()].map((e) => ({
		componentRef: e.manifest.componentRef,
		targetSchemaVersion: e.manifest.targetSchemaVersion,
		migrationSetDigest: e.manifest.migrationSetDigest
	}))
	async function install(id: string) {
		const work = new ControlStore(control, `journey-${id}`, 60, id)
		for (;;) {
			const op = await work.claim()
			if (!op) return
			await runtimes[id].provisioner.reconcile(op, getEntry(op.componentRef))
			await work.finish(op)
		}
	}
	async function purchase(name: string) {
		const response = await fetch(`${gateway.url.origin}/internal/v1/customer-entitlement-events`, {
			method: 'POST',
			headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				eventId: randomUUID(),
				eventType: 'purchase_granted',
				subjectId: subject,
				purchasedName: name,
				occurredAt: new Date().toISOString()
			})
		})
		assert.equal(response.status, 201, await response.clone().text())
		return ((await response.json()) as { environmentId: string }).environmentId
	}
	const a = await purchase('journey-a'),
		b = await purchase('journey-b')
	await install('primary')
	const intent = randomUUID()
	assert.equal(
		(await request(a, '', 'POST', { id: intent, title: 'Preserve this Intent ☃' })).status,
		201
	)
	assert.equal(
		(
			await request(a, `/${intent}`, 'POST', {
				id: randomUUID(),
				contributorKind: 'human',
				kind: 'message',
				text: 'Exact customer history ☃',
				payload: { nested: ['retained', 42] }
			})
		).status,
		201
	)
	const before = await (await request(a, `/${intent}`)).json()
	const expectedByEnvironment = new Map<string, unknown>([[a, before]])
	const stale = await customerHandler.grant({
		claims,
		environmentId: a,
		componentRef: component,
		actions: ['intents:read']
	})
	function operation(m: Movement, ref: string): Operation {
		const e = getEntry(ref)
		return {
			id: m.id,
			environmentId: m.environment_id,
			databaseName: m.database_name,
			componentRef: ref,
			action: 'reconcile',
			targetSchemaVersion: e.manifest.targetSchemaVersion,
			migrationSetDigest: e.manifest.migrationSetDigest,
			routingGeneration: m.destination_generation
		}
	}
	const driver = new PostgresMovementDriver({
		runtimes,
		platformId: 'runtime-journey',
		archiveDirectory: scratch,
		async prepareDestination(m, signal) {
			for (const ref of catalog.keys()) {
				signal.throwIfAborted()
				await runtimes[m.destination_runtime_id].provisioner.reconcile(
					operation(m, ref),
					getEntry(ref)
				)
			}
		},
		async verifyApplication(m, signal) {
			for (const ref of catalog.keys()) {
				signal.throwIfAborted()
				await runtimes[m.destination_runtime_id].provisioner.verify(
					operation(m, ref),
					getEntry(ref)
				)
			}
			const grant = await signTenantGrant(
				{
					...stale.claims,
					environmentId: m.environment_id,
					databaseName: m.database_name,
					routingGeneration: m.destination_generation
				},
				tenantKeys.privateKey
			)
			const response = await fetch(
				`${runtimes[m.destination_runtime_id].intents}/api/intents/${intent}`,
				{
					headers: {
						authorization: `Bearer ${serviceToken}`,
						'x-aven-identity-token': token,
						'x-aven-tenant-grant': grant,
						'x-aven-subject': subject,
						'x-aven-role': 'user',
						'x-aven-session': 'unchanged-session'
					}
				}
			)
			assert.equal(response.status, 200, await response.clone().text())
			assert.deepEqual(await response.json(), expectedByEnvironment.get(m.environment_id))
		}
	})
	const movement = await movementStore.begin({
		environmentId: a,
		sourceRuntimeId: 'primary',
		destinationRuntimeId: 'green',
		expectedGeneration: 1
	})
	assert.equal((await request(a)).status, 503)
	// Interrupt after each physical phase succeeds but before its durable transition.
	for (const phase of [
		'fence',
		'copy',
		'verify',
		'beforeActivate',
		'afterActivate',
		'observe'
	] as const) {
		if (phase === 'copy') {
			const owner = databaseRoleName(a, 'db_owner')
			await pool(runtimes.green.url).query(`CREATE ROLE ${owner} NOLOGIN;`)
			await pool(runtimes.green.url).query(
				`CREATE DATABASE movement_${movement.replaceAll('-', '')} OWNER ${owner} TEMPLATE template0 ALLOW_CONNECTIONS false`
			)
		}
		const interrupted: MovementDriver = Object.fromEntries(
			['fence', 'copy', 'verify', 'beforeActivate', 'afterActivate', 'observe'].map((name) => [
				name,
				async (m: Movement, signal: AbortSignal) => {
					const method: (m: Movement, signal: AbortSignal) => Promise<unknown> =
						driver[name as keyof PostgresMovementDriver]
					assert.equal(typeof method, 'function')
					const result = await method.call(driver, m, signal)
					if (name === phase) throw new Error(`interrupt-${phase}`)
					return result
				}
			])
		) as unknown as MovementDriver
		await assert.rejects(
			resumeMovement(movementStore, movement, interrupted),
			new RegExp(`interrupt-${phase}`)
		)
		if (phase === 'beforeActivate')
			assert.equal(
				(
					await pool(runtimes.green.url, databaseNameForEnvironment(a)).query(
						'SELECT execution_enabled FROM aven_platform.environment_identity'
					)
				).rows[0].execution_enabled,
				false
			)

		assert.equal(
			(
				await request(b, '', 'POST', {
					id: randomUUID(),
					title: `Customer B remains writable after ${phase}`
				})
			).status,
			201
		)
	}
	assert.equal((await resumeMovement(movementStore, movement, driver)).phase, 'completed')
	const staleOperation = operation(await movementStore.read(movement), component)
	await assert.rejects(
		runtimes.green.provisioner.reconcile(
			{ ...staleOperation, routingGeneration: 1 },
			getEntry(component)
		),
		/generation is stale/
	)

	assert.deepEqual(await (await request(a, `/${intent}`)).json(), before)
	const staleResponse = await fetch(`${runtimes.primary.intents}/api/intents/${intent}`, {
		headers: {
			authorization: `Bearer ${serviceToken}`,
			'x-aven-identity-token': token,
			'x-aven-tenant-grant': stale.token,
			'x-aven-subject': subject,
			'x-aven-role': 'user',
			'x-aven-session': 'unchanged-session'
		}
	})
	assert.notEqual(staleResponse.status, 200)
	assert.equal(
		(await request(a, '', 'POST', { id: randomUUID(), title: 'New generation history' })).status,
		201
	)
	const rollback = await movementStore.begin({
		environmentId: a,
		sourceRuntimeId: 'green',
		destinationRuntimeId: 'primary',
		expectedGeneration: 2,
		rollbackOf: movement,
		acceptDivergence: true
	})
	assert.equal((await resumeMovement(movementStore, rollback, driver)).phase, 'completed')
	assert.deepEqual(await (await request(a, `/${intent}`)).json(), before)
	const aDb = databaseNameForEnvironment(a)
	assert.equal(
		(
			await pool(runtimes.primary.url, aDb).query(
				'SELECT count(*)::int AS n FROM aven_intents.intents'
			)
		).rows[0].n,
		1
	)
	assert.equal(
		(
			await pool(runtimes.green.url, aDb).query(
				'SELECT count(*)::int AS n FROM aven_intents.intents'
			)
		).rows[0].n,
		2
	)
	assert.equal(
		(
			await pool(runtimes.primary.url, aDb).query(
				'SELECT execution_enabled FROM aven_platform.environment_identity'
			)
		).rows[0].execution_enabled,
		false
	)
	await movementStore.selectDefaultRuntime('green', runtimes.green.releaseSha, catalogTargets)
	await assert.rejects(
		movementStore.selectDefaultRuntime(
			'green',
			runtimes.green.releaseSha,
			catalogTargets.map((c) => ({ ...c, migrationSetDigest: 'f'.repeat(64) }))
		),
		/immutable catalog/
	)
	const c = await purchase('journey-c')
	await install('green')
	assert.equal(
		(await customers.authorize(claims, c, component, ['intents:read'])).runtimeId,
		'green'
	)
	assert.equal(
		(await request(c, '', 'POST', { id: randomUUID(), title: 'New customer on selected runtime' }))
			.status,
		201
	)
	assert.equal(
		(
			await pool(runtimes.primary.url).query('SELECT 1 FROM pg_database WHERE datname=$1', [
				databaseNameForEnvironment(c)
			])
		).rowCount,
		0
	)
	for (const phase of ['paused', 'fenced', 'closed', 'empty', 'copied', 'verified'] as const) {
		const env = await purchase(`return-${phase}`)
		await install('green')
		assert.equal(
			(await request(env, '', 'POST', { id: intent, title: `Return safely from ${phase}` })).status,
			201
		)
		expectedByEnvironment.set(env, await (await request(env, `/${intent}`)).json())
		const id = await movementStore.begin({
			environmentId: env,
			sourceRuntimeId: 'green',
			destinationRuntimeId: 'primary',
			expectedGeneration: 1
		})
		if (phase !== 'paused')
			await movementStore.advance(
				id,
				'paused',
				'fenced',
				await driver.fence(await movementStore.read(id), new AbortController().signal)
			)

		if (phase === 'closed' || phase === 'empty') {
			const owner = databaseRoleName(env, 'db_owner'),
				database = databaseNameForEnvironment(env)
			const target = pool(runtimes.primary.url)
			await target.query(`CREATE ROLE ${owner} NOLOGIN`)
			await target.query(
				`CREATE DATABASE ${database} OWNER ${owner} ALLOW_CONNECTIONS ${phase === 'empty'}`
			)
			await target.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`)
			await target.query(
				`COMMENT ON DATABASE ${database} IS 'aven-movement:${id}:${'0'.repeat(64)}'`
			)
		}
		if (phase === 'copied' || phase === 'verified')
			await movementStore.advance(
				id,
				'fenced',
				'copied',
				await driver.copy(await movementStore.read(id), new AbortController().signal)
			)
		if (phase === 'verified')
			await movementStore.advance(
				id,
				'copied',
				'verified',
				await driver.verify(await movementStore.read(id), new AbortController().signal)
			)
		const interrupted: MovementDriver = {
			fence: driver.fence.bind(driver),
			copy: driver.copy.bind(driver),
			verify: driver.verify.bind(driver),
			beforeActivate: driver.beforeActivate.bind(driver),
			observe: driver.observe.bind(driver),
			afterActivate: driver.afterActivate.bind(driver),
			async returnToSource(m, signal) {
				await driver.returnToSource(m, signal)
				throw new Error('interrupted return')
			}
		}
		await assert.rejects(resumeMovement(movementStore, id, interrupted, true), /interrupted return/)
		assert.equal((await request(env)).status, 503)
		assert.equal((await resumeMovement(movementStore, id, driver)).phase, 'cancelled')
		assert.equal((await resumeMovement(movementStore, id, driver, true)).phase, 'cancelled')
		const route = await customers.authorize(claims, env, component, ['intents:read'])
		assert.equal(route.runtimeId, 'green')
		assert.equal(route.routingGeneration, 3)
		assert.deepEqual(
			await (await request(env, `/${intent}`)).json(),
			expectedByEnvironment.get(env)
		)
		assert.equal(
			(
				await request(env, '', 'POST', {
					id: randomUUID(),
					title: 'Source accepts fresh-generation writes'
				})
			).status,
			201
		)
	}
	await assert.rejects(
		resumeMovement(movementStore, rollback, driver, true),
		/only allowed before activation/
	)

	console.info(
		`Customer runtime journey passed in ${Math.round((performance.now() - started) / 1000)}s: real catalog and Artifact Store provisioning; signed identity and tenant grants; HTTP reads/writes across two clusters; interruption at every handover phase; unaffected second customer; stale source rejected; divergent rollback; explicit default placement; interrupted return from every pre-activation phase.`
	)
} finally {
	for (const server of servers) await server.stop(true)
	await Promise.allSettled(providers.map((p) => p.close()))
	await Promise.allSettled(pools.map((p) => p.end()))
	for (const name of containers.reverse())
		await command(['docker', 'rm', '--force', name]).catch(() => {})
	await rm(scratch, { recursive: true, force: true })
}
