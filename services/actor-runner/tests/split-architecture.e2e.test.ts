import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { ACTOR_RUN_PROTOCOL, type PlanRunRecord, type Predicate } from '@avenos/actors'
import { type ArtifactJson, ArtifactStoreClient } from '@avenos/artifact-store'
import { databaseNameForEnvironment, signTenantGrant } from '@avenos/aven-customer-contracts'
import { IdentityVerifier } from '@avenos/aven-identity'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import pg from 'pg'
import { afterEach, describe, expect, test } from 'vitest'
import { facadeConfigSchema } from '../../aven-api/src/config.js'
import { CustomerHandler } from '../../aven-api/src/customers/handler.js'
import type { CustomerStore } from '../../aven-api/src/customers/store.js'
import { createFacadeHandler } from '../../aven-api/src/facade.js'
import { ArtifactStoreRuntimePort } from '../src/artifact-store-port.js'
import { createActorRunnerHandler } from '../src/handler.js'
import { MemoryPlanRunner } from '../src/memory-runner.js'
import { SqlPlanRunner } from '../src/sql-runner.js'
import {
	deterministicExecutionHarness,
	deterministicRunRequest,
	deterministicSecretExecutor,
	PERSISTENT_CAPABILITY_ID,
	PERSISTENT_RESULT_PREDICATE,
	PERSISTENT_RESULT_SCHEMA,
	PERSISTENT_SOURCE_PREDICATE,
	PERSISTENT_SOURCE_SCHEMA,
	SECRET_CONTINUATION_ID,
	secretContinuationRunRequest
} from './support/deterministic-execution.js'

const subject = '3f7b0f1e-7850-4902-a7b0-093f8604a0dd'
const sourceArtifactId = '11111111-1111-4111-8111-111111111111'
const resultArtifactId = '22222222-2222-4222-8222-222222222222'
const serviceToken = 'runner-service-token-0000000000000001'
const environmentId = '99999999-9999-4999-8999-999999999999'
const databaseUrl = process.env.TEST_ACTOR_RUNNER_DATABASE_URL
const artifactStoreBaseUrl = process.env.TEST_ARTIFACT_STORE_BASE_URL
const artifactStoreBearerToken = process.env.TEST_ARTIFACT_STORE_BEARER_TOKEN
const artifactStoreScopeId = process.env.TEST_ARTIFACT_STORE_SCOPE_ID
const artifactStoreConfig =
	artifactStoreBaseUrl && artifactStoreBearerToken && artifactStoreScopeId
		? {
				baseUrl: artifactStoreBaseUrl,
				bearerToken: artifactStoreBearerToken,
				scopeId: artifactStoreScopeId
			}
		: null
const testWithPostgres = databaseUrl ? test : test.skip
const servers: Server[] = []

afterEach(async () => {
	await Promise.all(
		servers
			.splice(0)
			.map(
				(server) =>
					new Promise<void>((resolve, reject) =>
						server.close((error) => (error ? reject(error) : resolve()))
					)
			)
	)
})

async function serve(
	handler: (request: Request) => Response | Promise<Response>
): Promise<{ server: Server; url: URL }> {
	const server = createServer(async (incoming, outgoing) => {
		try {
			const chunks: Buffer[] = []
			for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
			const address = server.address()
			if (!address || typeof address === 'string') throw new Error('test server has no address')
			const body = Buffer.concat(chunks)
			const response = await handler(
				new Request(`http://127.0.0.1:${address.port}${incoming.url ?? '/'}`, {
					method: incoming.method,
					headers: incoming.headers as HeadersInit,
					...(body.length > 0 && { body })
				})
			)
			outgoing.statusCode = response.status
			for (const [name, value] of response.headers) outgoing.setHeader(name, value)
			outgoing.end(Buffer.from(await response.arrayBuffer()))
		} catch (error) {
			outgoing.statusCode = 500
			outgoing.end(error instanceof Error ? error.message : String(error))
		}
	})
	servers.push(server)
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', resolve)
	})
	const address = server.address()
	if (!address || typeof address === 'string') throw new Error('test server has no address')
	return { server, url: new URL(`http://127.0.0.1:${address.port}`) }
}

async function identityFixture() {
	const { privateKey, publicKey } = await generateKeyPair('EdDSA')
	const key = {
		...(await exportJWK(publicKey)),
		kid: 'identity-test-key',
		use: 'sig',
		alg: 'EdDSA'
	}
	const identity = await serve((request) => {
		if (new URL(request.url).pathname === '/api/auth/jwks') {
			return Response.json({ keys: [key] })
		}
		return new Response(null, { status: 404 })
	})
	const issuer = identity.url.toString().replace(/\/$/, '')
	const token = await new SignJWT({
		sid: 'session-e2e',
		email: 'runner@example.test',
		email_verified: true,
		role: 'user',
		amr: ['passkey'],
		scope: 'openid services:access'
	})
		.setProtectedHeader({ alg: 'EdDSA', kid: key.kid })
		.setSubject(subject)
		.setIssuer(issuer)
		.setAudience('aven-services')
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(privateKey)
	return { issuer, token }
}

function command() {
	return {
		protocol: ACTOR_RUN_PROTOCOL,
		requestId: 'request-e2e-1',
		idempotencyKey: 'document-e2e-1',
		requestedAt: new Date().toISOString(),
		skillRef: 'ceo.aven:skill:docs.ingest:document-ingest@1',
		executionEnvironment: 'server',
		ingredients: [
			{
				predicate: 'ceo.aven.docs.document(document_1)',
				artifactId: sourceArtifactId
			}
		],
		goals: ['ceo.aven.docs.content_description(document_1)'],
		parameters: {}
	}
}

describe('split identity -> facade -> os.aven runner', () => {
	test('executes and reads a server run through real HTTP boundaries', async () => {
		const { issuer, token } = await identityFixture()
		const tenantKeys = await generateKeyPair('EdDSA')
		const verifier = new IdentityVerifier({
			issuer,
			audience: 'aven-services'
		})
		const runner = new MemoryPlanRunner(async (request, context) => {
			expect(request.security.principal.subjectId).toBe(subject)
			expect(request.security.principal.assurance).toContain('passkey')
			expect(request.executionEnvironment).toBe('server')
			expect(context?.session).toEqual({ identityToken: token, sessionId: 'session-e2e' })
			return {
				artifactIds: [resultArtifactId],
				remainingGoals: [],
				registryRevision: 7,
				policyDecisionIds: ['ceo-policy-e2e']
			}
		})
		const runnerServer = await serve(
			createActorRunnerHandler({ forGrant: async () => runner }, verifier, {
				serviceToken,
				tenantGrantIssuer: 'https://api.aven.ceo',
				tenantGrantPublicKey: tenantKeys.publicKey
			})
		)
		const facadeConfig = facadeConfigSchema.parse({
			DATABASE_URL: 'postgres://aven_api:test@database/aven_api',
			SITE_HOST_DIRECTORY_BEARER_TOKEN: 'd'.repeat(32),
			CUSTOMER_ENTITLEMENT_TOKEN: 'e'.repeat(32),
			TENANT_GRANT_PRIVATE_KEY: 'unused-test-private-key-'.repeat(5),
			IDENTITY_ISSUER: issuer,
			API_PUBLIC_BASE_URL: 'https://api.aven.ceo',
			CUSTOMER_DOWNSTREAMS_JSON: JSON.stringify([
				{
					segment: 'actor-runs',
					baseUrl: runnerServer.url.toString(),
					targetPrefix: '/api/actor-runs',
					bearerToken: serviceToken,
					componentRef: 'os.aven:component:actors:run-repository@1',
					readAction: 'actor-runs:read',
					writeAction: 'actor-runs:write',
					roles: ['user', 'admin']
				}
			])
		})
		const customerStore = {
			authorize: async (
				claims: { sub: string; sid: string; role: 'user' | 'admin' },
				id: string,
				componentRef: string,
				actions: string[]
			) => ({
				iss: 'https://api.aven.ceo',
				aud: componentRef,
				sub: claims.sub,
				sid: claims.sid,
				role: claims.role,
				membershipRole: 'owner',
				environmentId: id,
				databaseName: databaseNameForEnvironment(id),
				runtimeId: 'primary',
				routingGeneration: 1,
				componentRef,
				actions
			})
		} as unknown as CustomerStore
		const customers = new CustomerHandler(
			customerStore,
			customerStore,
			'e'.repeat(32),
			tenantKeys.privateKey
		)
		const facadeServer = await serve(
			createFacadeHandler(facadeConfig, verifier, fetch, undefined, customers)
		)

		const start = await fetch(
			new URL(`/api/environments/${environmentId}/actor-runs`, facadeServer.url),
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${token}`,
					'content-type': 'application/json',
					'x-aven-subject': 'forged-subject',
					'x-aven-identity-token': 'forged-token'
				},
				body: JSON.stringify(command())
			}
		)
		expect(start.status).toBe(202)
		const handle = (await start.json()) as { runId: string }

		let record: PlanRunRecord | undefined
		for (let attempt = 0; attempt < 50; attempt += 1) {
			const response = await fetch(
				new URL(`/api/environments/${environmentId}/actor-runs/${handle.runId}`, facadeServer.url),
				{
					headers: { authorization: `Bearer ${token}` }
				}
			)
			expect(response.status).toBe(200)
			record = (await response.json()) as PlanRunRecord
			if (record.state === 'succeeded') break
			await new Promise((resolve) => setTimeout(resolve, 2))
		}

		expect(record).toMatchObject({
			state: 'succeeded',
			executionEnvironment: 'server',
			security: {
				principal: {
					subjectId: subject,
					kind: 'user',
					sessionId: 'session-e2e'
				},
				establishedBy: 'api.aven.ceo/actor-runner-boundary'
			}
		})
		expect(record?.checkpoints).toEqual([
			expect.objectContaining({
				artifactIds: [resultArtifactId],
				registryRevision: 7,
				policyDecisionIds: ['ceo-policy-e2e'],
				remainingGoals: []
			})
		])
		expect(JSON.stringify(record)).not.toContain(token)
	})

	testWithPostgres(
		'persists the deterministic server skill through the authenticated facade and matches local execution',
		async () => {
			const schema = `actor_runner_http_e2e_${randomSchemaSuffix()}`
			const admin = new pg.Pool({ connectionString: databaseUrl, max: 1 })
			let pool: pg.Pool | undefined
			try {
				await admin.query(`CREATE SCHEMA ${schema}`)
				await admin.query(`
					CREATE TABLE ${schema}.runs (
						id uuid PRIMARY KEY,
						subject_id uuid NOT NULL,
						idempotency_key text NOT NULL,
						material_hash text NOT NULL,
						state text NOT NULL,
						revision bigint NOT NULL,
						record jsonb NOT NULL,
						created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
						updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
						UNIQUE(subject_id,idempotency_key)
					)
				`)
				pool = new pg.Pool({
					connectionString: databaseUrl,
					max: 2,
					options: `-c search_path=${schema},pg_catalog`
				})

				const local = deterministicExecutionHarness('local')
				const persistentArtifacts = artifactStoreConfig
					? await persistentArtifactFixture(artifactStoreConfig)
					: null
				const server = deterministicExecutionHarness('server', persistentArtifacts?.port)
				const localExecution = await local.execute(
					deterministicRunRequest('local', subject, environmentId)
				)
				const runner = new SqlPlanRunner(pool, pool, (request, context) =>
					request.skillRef.endsWith(':secret-continuation@1')
						? deterministicSecretExecutor(request, context)
						: server.execute(request)
				)
				const { issuer, token } = await identityFixture()
				const tenantKeys = await generateKeyPair('EdDSA')
				const verifier = new IdentityVerifier({
					issuer,
					audience: 'aven-services'
				})
				const runnerServer = await serve(
					createActorRunnerHandler(
						{
							forGrant: async (grant) => {
								expect(grant.environmentId).toBe(environmentId)
								expect(grant.databaseName).toBe(databaseNameForEnvironment(environmentId))
								return runner
							}
						},
						verifier,
						{
							serviceToken,
							tenantGrantIssuer: 'https://api.aven.ceo',
							tenantGrantPublicKey: tenantKeys.publicKey
						}
					)
				)
				const facadeConfig = facadeConfigSchema.parse({
					DATABASE_URL: 'postgres://aven_api:test@database/aven_api',
					SITE_HOST_DIRECTORY_BEARER_TOKEN: 'd'.repeat(32),
					CUSTOMER_ENTITLEMENT_TOKEN: 'e'.repeat(32),
					TENANT_GRANT_PRIVATE_KEY: 'unused-test-private-key-'.repeat(5),
					IDENTITY_ISSUER: issuer,
					API_PUBLIC_BASE_URL: 'https://api.aven.ceo',
					CUSTOMER_DOWNSTREAMS_JSON: JSON.stringify([
						{
							segment: 'actor-runs',
							baseUrl: runnerServer.url.toString(),
							targetPrefix: '/api/actor-runs',
							bearerToken: serviceToken,
							componentRef: 'os.aven:component:actors:run-repository@1',
							readAction: 'actor-runs:read',
							writeAction: 'actor-runs:write',
							roles: ['user', 'admin']
						}
					])
				})
				const customerStore = {
					authorize: async (
						claims: { sub: string; sid: string; role: 'user' | 'admin' },
						id: string,
						componentRef: string,
						actions: string[]
					) => ({
						iss: 'https://api.aven.ceo',
						aud: componentRef,
						sub: claims.sub,
						sid: claims.sid,
						role: claims.role,
						membershipRole: 'owner',
						environmentId: id,
						databaseName: databaseNameForEnvironment(id),
						runtimeId: 'primary',
						routingGeneration: 1,
						componentRef,
						actions
					})
				} as unknown as CustomerStore
				const customers = new CustomerHandler(
					customerStore,
					customerStore,
					'e'.repeat(32),
					tenantKeys.privateKey
				)
				const facadeServer = await serve(
					createFacadeHandler(facadeConfig, verifier, fetch, undefined, customers)
				)

				const internalRequest = deterministicRunRequest(
					'server',
					subject,
					environmentId,
					persistentArtifacts?.sourceArtifactId
				)
				const { security: _security, ...publicCommand } = internalRequest
				const started = await fetch(
					new URL(`/api/environments/${environmentId}/actor-runs`, facadeServer.url),
					{
						method: 'POST',
						headers: {
							authorization: `Bearer ${token}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify(publicCommand)
					}
				)
				expect(started.status).toBe(202)
				const handle = (await started.json()) as { runId: string }
				const record = await terminalRecordThroughFacade(facadeServer.url, token, handle.runId)

				expect(record).toMatchObject({
					state: 'succeeded',
					executionEnvironment: 'server',
					security: {
						principal: {
							subjectId: subject,
							kind: 'user',
							sessionId: 'session-e2e'
						},
						access: { tenantId: environmentId },
						establishedBy: 'api.aven.ceo/actor-runner-boundary'
					},
					checkpoints: [
						expect.objectContaining({
							completedStepIds: ['step-1'],
							artifactIds: server.artifacts().map((artifact) => artifact.artifactId),
							remainingGoals: [],
							registryRevision: server.registryRevision()
						})
					]
				})
				expect(record.checkpoints[0]?.policyDecisionIds).toHaveLength(3)
				expect(server.canonicalManifest()).toEqual(local.canonicalManifest())
				if (persistentArtifacts) {
					const outputArtifactId = record.checkpoints[0]?.artifactIds[0]
					if (!outputArtifactId) throw new Error('persistent run produced no artifact')
					expect(
						await persistentArtifacts.client.artifact(environmentId, outputArtifactId)
					).toMatchObject({
						artifactId: outputArtifactId,
						typeKey: 'core.content-description',
						payload: {
							summary: 'PERSISTENT PROOF',
							topics: ['runtime-conformance']
						}
					})
					expect(
						await persistentArtifacts.client.producerInputs(environmentId, outputArtifactId)
					).toMatchObject({
						artifactId: outputArtifactId,
						inputs: [
							{
								role: 'source',
								ordinal: 0,
								artifactId: persistentArtifacts.sourceArtifactId
							}
						]
					})
				}
				expect(localExecution.remainingGoals).toEqual([])
				expect(server.spawned()).toBe(1)
				expect(server.released()).toBe(1)

				const secretRequest = secretContinuationRunRequest(subject, environmentId)
				const { security: _secretSecurity, ...secretCommand } = secretRequest
				const secretStart = await fetch(
					new URL(`/api/environments/${environmentId}/actor-runs`, facadeServer.url),
					{
						method: 'POST',
						headers: {
							authorization: `Bearer ${token}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify(secretCommand)
					}
				)
				expect(secretStart.status).toBe(202)
				const secretHandle = (await secretStart.json()) as { runId: string }
				await recordThroughFacadeInState(
					facadeServer.url,
					token,
					secretHandle.runId,
					'waiting_for_input'
				)

				const postpone = await fetch(
					new URL(
						`/api/environments/${environmentId}/actor-runs/${secretHandle.runId}/continuations/${SECRET_CONTINUATION_ID}`,
						facadeServer.url
					),
					{
						method: 'POST',
						headers: {
							authorization: `Bearer ${token}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify({
							requestId: randomUUID(),
							continuationId: SECRET_CONTINUATION_ID,
							action: 'postpone'
						})
					}
				)
				expect(postpone.status).toBe(202)
				expect(await postpone.json()).toMatchObject({ state: 'waiting_for_input' })

				const secretValue = 'correct horse battery staple'
				const submit = await fetch(
					new URL(
						`/api/environments/${environmentId}/actor-runs/${secretHandle.runId}/continuations/${SECRET_CONTINUATION_ID}`,
						facadeServer.url
					),
					{
						method: 'POST',
						headers: {
							authorization: `Bearer ${token}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify({
							requestId: randomUUID(),
							continuationId: SECRET_CONTINUATION_ID,
							action: 'submit',
							kind: 'secret',
							value: secretValue
						})
					}
				)
				expect(submit.status).toBe(202)
				const secretRecord = await terminalRecordThroughFacade(
					facadeServer.url,
					token,
					secretHandle.runId
				)
				expect(secretRecord).toMatchObject({
					state: 'succeeded',
					continuations: [{ continuationId: SECRET_CONTINUATION_ID, state: 'resolved' }]
				})
				expect(JSON.stringify(secretRecord)).not.toContain(secretValue)
			} finally {
				await pool?.end()
				await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
				await admin.end()
			}
		}
	)

	test('rejects caller security assertions and inconsistent facade projections', async () => {
		const { issuer, token } = await identityFixture()
		const verifier = new IdentityVerifier({
			issuer,
			audience: 'aven-services'
		})
		const tenantKeys = await generateKeyPair('EdDSA')
		const runnerServer = await serve(
			createActorRunnerHandler({ forGrant: async () => new MemoryPlanRunner() }, verifier, {
				serviceToken,
				tenantGrantIssuer: 'https://api.aven.ceo',
				tenantGrantPublicKey: tenantKeys.publicKey
			})
		)
		const tenantGrant = await signTenantGrant(
			{
				iss: 'https://api.aven.ceo',
				aud: 'os.aven:component:actors:run-repository@1',
				sub: subject,
				sid: 'session-e2e',
				role: 'user',
				membershipRole: 'owner',
				environmentId,
				databaseName: databaseNameForEnvironment(environmentId),
				routingGeneration: 1,
				componentRef: 'os.aven:component:actors:run-repository@1',
				actions: ['actor-runs:write']
			},
			tenantKeys.privateKey
		)
		const directHeaders = {
			authorization: `Bearer ${serviceToken}`,
			'content-type': 'application/json',
			'x-aven-identity-token': token,
			'x-aven-tenant-grant': tenantGrant,
			'x-aven-subject': '00000000-0000-4000-8000-000000000000',
			'x-aven-role': 'user',
			'x-aven-session': 'session-e2e'
		}
		const mismatched = await fetch(new URL('/api/actor-runs', runnerServer.url), {
			method: 'POST',
			headers: directHeaders,
			body: JSON.stringify(command())
		})
		expect(mismatched.status).toBe(401)

		const asserted = await fetch(new URL('/api/actor-runs', runnerServer.url), {
			method: 'POST',
			headers: { ...directHeaders, 'x-aven-subject': subject },
			body: JSON.stringify({
				...command(),
				security: { principal: { subjectId: subject } }
			})
		})
		expect(asserted.status).toBe(400)
		expect(await asserted.json()).toMatchObject({ code: 'COMMAND_INVALID' })
	})
})

async function terminalRecordThroughFacade(
	facadeUrl: URL,
	token: string,
	runId: string
): Promise<PlanRunRecord> {
	const deadline = Date.now() + 5_000
	while (Date.now() < deadline) {
		const response = await fetch(
			new URL(`/api/environments/${environmentId}/actor-runs/${runId}`, facadeUrl),
			{ headers: { authorization: `Bearer ${token}` } }
		)
		expect(response.status).toBe(200)
		const record = (await response.json()) as PlanRunRecord
		if (['succeeded', 'failed', 'cancelled'].includes(record.state)) return record
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`run ${runId} did not reach a terminal state`)
}

async function recordThroughFacadeInState(
	facadeUrl: URL,
	token: string,
	runId: string,
	state: PlanRunRecord['state']
): Promise<PlanRunRecord> {
	const deadline = Date.now() + 5_000
	while (Date.now() < deadline) {
		const response = await fetch(
			new URL(`/api/environments/${environmentId}/actor-runs/${runId}`, facadeUrl),
			{ headers: { authorization: `Bearer ${token}` } }
		)
		expect(response.status).toBe(200)
		const record = (await response.json()) as PlanRunRecord
		if (record.state === state) return record
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`run ${runId} did not reach ${state}`)
}

function randomSchemaSuffix(): string {
	return crypto.randomUUID().replaceAll('-', '')
}

async function persistentArtifactFixture(config: {
	baseUrl: string
	bearerToken: string
	scopeId: string
}) {
	if (config.scopeId !== environmentId) {
		throw new Error('Artifact Store conformance scope must equal the actor-run environment')
	}
	const client = new ArtifactStoreClient({
		baseUrl: config.baseUrl,
		bearerToken: () => config.bearerToken
	})
	const context = artifactRecord(await client.context(), 'Artifact Store context')
	const storeEpoch = artifactString(context, 'storeEpoch', 'Artifact Store context')
	const publicationId = randomUUID()
	const result = artifactRecord(
		await client.publish(config.scopeId, publicationId, storeEpoch, {
			intent: {
				commandVersion: 1,
				publicationId,
				scopeId: config.scopeId,
				kind: 'roots',
				rootActor: { kind: 'service', id: 'service:runtime-conformance' },
				artifacts: [
					{
						localKey: 'source',
						typeKey: 'core.content-description',
						typeVersion: 1,
						payload: { summary: ' persistent proof ', topics: [] },
						blob: null,
						references: [],
						output: null
					}
				],
				evidence: []
			},
			blobAuthorities: {}
		}),
		'root publication'
	)
	const artifacts = result.artifacts
	if (!Array.isArray(artifacts) || artifacts.length !== 1) {
		throw new Error('root publication returned an invalid artifact mapping')
	}
	const sourceArtifactId = artifactString(
		artifactRecord(artifacts[0], 'root artifact'),
		'artifactId',
		'root artifact'
	)
	const port = new ArtifactStoreRuntimePort({
		client,
		scopeId: config.scopeId,
		initiator: { kind: 'service', id: 'service:actor-runner' },
		schemas: [
			{
				schema: PERSISTENT_SOURCE_SCHEMA,
				typeKey: 'core.content-description',
				typeVersion: 1,
				project: () => [PERSISTENT_SOURCE_PREDICATE as Predicate]
			},
			{
				schema: PERSISTENT_RESULT_SCHEMA,
				typeKey: 'core.content-description',
				typeVersion: 1,
				project: () => [PERSISTENT_RESULT_PREDICATE as Predicate]
			}
		],
		procedures: [
			{
				capabilityId: PERSISTENT_CAPABILITY_ID,
				procedureKey: 'testing.persistent-transform',
				procedureVersion: '1',
				executor: {
					kind: 'agent',
					id: 'os.aven:actor:testing.runtime:persistent-fixture-transformer@1'
				},
				implementation: { adapter: 'actor-runner', version: 1 }
			}
		]
	})
	return { client, port, sourceArtifactId }
}

function artifactRecord(value: unknown, label: string): Record<string, ArtifactJson> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`)
	}
	return value as Record<string, ArtifactJson>
}

function artifactString(value: Record<string, ArtifactJson>, field: string, label: string): string {
	const candidate = value[field]
	if (typeof candidate !== 'string' || candidate.length === 0) {
		throw new Error(`${label}.${field} must be a string`)
	}
	return candidate
}
