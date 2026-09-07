import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
	Actor,
	type ActorAccessContext,
	type ActorAuthorizationRequest,
	type ActorAuthorizer,
	type ActorFactory,
	type ActorFactoryOffer,
	type ActorFactoryResolver,
	type ActorPrincipal,
	ActorRegistry,
	type ActorSpawnRequest,
	type ActorStepPayload,
	authorizeRegistryForPlanning,
	definitionFromManifest,
	executePhysicalProgram,
	type Manifest,
	type RuntimeArtifact,
	type RuntimeArtifactPublisher,
	type RuntimeArtifactResolver,
	type RuntimeStepPublication,
	resourceId,
	type SpawnedActor,
	solveAuthorized
} from '../src'

const SOURCE_SCHEMA = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'source',
	version: '1'
})
const PROFILE_SCHEMA = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'profile',
	version: '1'
})
const FIELDS_SCHEMA = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'fields',
	version: '1'
})
const RESULT_SCHEMA = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'result',
	version: '1'
})

const sourcePredicate = 'os.aven.testing.source(fixture_1)'
const goalPredicate = 'os.aven.testing.result(fixture_1)'

const manifest = (
	id: string,
	method: string,
	requires: string[],
	produces: string[],
	inputSlots: Manifest['methods'][number]['inputSlots'],
	outputSlots: Manifest['methods'][number]['outputSlots'],
	cost?: number
): Manifest => ({
	id,
	authority: 'os.aven',
	namespace: 'testing.runtime',
	version: '1',
	name: id,
	description: `Deterministic ${id} conformance actor.`,
	tags: ['testing', 'runtime-conformance'],
	methods: [
		{
			name: method,
			description: method,
			parameters: { type: 'object', additionalProperties: false },
			mode: 'transform',
			idempotency: 'pure',
			requires,
			produces,
			inputSlots,
			outputSlots,
			...(cost !== undefined && { cost })
		}
	]
})

const INSPECT = manifest(
	'inspect-fixture',
	'inspect_fixture',
	['os.aven.testing.source(D)'],
	['os.aven.testing.profile(D, structured)'],
	[
		{
			name: 'source',
			predicate: 'os.aven.testing.source(D)',
			schema: SOURCE_SCHEMA,
			role: 'source',
			cardinality: 'one'
		}
	],
	[
		{
			name: 'profile',
			predicate: 'os.aven.testing.profile(D, structured)',
			schema: PROFILE_SCHEMA,
			role: 'profile',
			cardinality: 'one'
		}
	]
)

const EXTRACT = manifest(
	'extract-structured-fixture',
	'extract_structured_fixture',
	['os.aven.testing.source(D)', 'os.aven.testing.profile(D, structured)'],
	['os.aven.testing.fields(D)'],
	[
		{
			name: 'source',
			predicate: 'os.aven.testing.source(D)',
			schema: SOURCE_SCHEMA,
			role: 'source',
			cardinality: 'one'
		},
		{
			name: 'profile',
			predicate: 'os.aven.testing.profile(D, structured)',
			schema: PROFILE_SCHEMA,
			role: 'profile',
			cardinality: 'one'
		}
	],
	[
		{
			name: 'fields',
			predicate: 'os.aven.testing.fields(D)',
			schema: FIELDS_SCHEMA,
			role: 'fields',
			cardinality: 'one'
		}
	]
)

const EXTRACT_FALLBACK = manifest(
	'extract-structured-fixture-fallback',
	'extract_structured_fixture_fallback',
	['os.aven.testing.source(D)', 'os.aven.testing.profile(D, structured)'],
	['os.aven.testing.fields(D)'],
	[
		{
			name: 'source',
			predicate: 'os.aven.testing.source(D)',
			schema: SOURCE_SCHEMA,
			role: 'source',
			cardinality: 'one'
		},
		{
			name: 'profile',
			predicate: 'os.aven.testing.profile(D, structured)',
			schema: PROFILE_SCHEMA,
			role: 'profile',
			cardinality: 'one'
		}
	],
	[
		{
			name: 'fields',
			predicate: 'os.aven.testing.fields(D)',
			schema: FIELDS_SCHEMA,
			role: 'fields',
			cardinality: 'one'
		}
	],
	10
)

const NORMALIZE = manifest(
	'normalize-fixture',
	'normalize_fixture',
	['os.aven.testing.fields(D)'],
	['os.aven.testing.result(D)'],
	[
		{
			name: 'fields',
			predicate: 'os.aven.testing.fields(D)',
			schema: FIELDS_SCHEMA,
			role: 'fields',
			cardinality: 'one'
		}
	],
	[
		{
			name: 'result',
			predicate: 'os.aven.testing.result(D)',
			schema: RESULT_SCHEMA,
			role: 'result',
			cardinality: 'one'
		}
	]
)

const VISUAL = manifest(
	'extract-visual-fixture',
	'extract_visual_fixture',
	['os.aven.testing.source(D)', 'os.aven.testing.profile(D, visual)'],
	['os.aven.testing.fields(D)'],
	[
		{
			name: 'source',
			predicate: 'os.aven.testing.source(D)',
			schema: SOURCE_SCHEMA,
			role: 'source',
			cardinality: 'one'
		},
		{
			name: 'profile',
			predicate: 'os.aven.testing.profile(D, visual)',
			schema: PROFILE_SCHEMA,
			role: 'profile',
			cardinality: 'one'
		}
	],
	[
		{
			name: 'fields',
			predicate: 'os.aven.testing.fields(D)',
			schema: FIELDS_SCHEMA,
			role: 'fields',
			cardinality: 'one'
		}
	]
)

const handlers: Record<string, (payload: ActorStepPayload) => { record: string; wire: string }> = {
	inspect_fixture: (payload) => {
		const source = payload.inputs.source?.value as { marker: string }
		return answer({ profile: { kind: source.marker } })
	},
	extract_structured_fixture: (payload) => {
		const source = payload.inputs.source?.value as {
			fields: { vendor: string; amountMinor: number }
		}
		return answer({ fields: source.fields })
	},
	extract_structured_fixture_fallback: (payload) => {
		const source = payload.inputs.source?.value as {
			fields: { vendor: string; amountMinor: number }
		}
		return answer({ fields: source.fields })
	},
	extract_visual_fixture: () => answer({ fields: { vendor: 'wrong route', amountMinor: 0 } }),
	normalize_fixture: (payload) => {
		const fields = payload.inputs.fields?.value as {
			vendor: string
			amountMinor: number
		}
		return answer({
			result: {
				vendor: fields.vendor.trim(),
				amount: (fields.amountMinor / 100).toFixed(2),
				currency: 'EUR'
			}
		})
	}
}

function answer(outputs: Record<string, unknown>): {
	record: string
	wire: string
} {
	return { record: JSON.stringify({ ok: true, outputs }), wire: 'ok' }
}

class MemoryArtifacts implements RuntimeArtifactResolver, RuntimeArtifactPublisher {
	readonly publications: RuntimeStepPublication[] = []
	readonly #values = new Map<string, RuntimeArtifact>()

	constructor(source: RuntimeArtifact) {
		this.#values.set(source.artifactId, source)
	}

	async resolve(artifactId: string): Promise<RuntimeArtifact | null> {
		return this.#values.get(artifactId) ?? null
	}

	async publish(publication: RuntimeStepPublication): Promise<RuntimeArtifact[]> {
		this.publications.push(structuredClone(publication))
		return publication.outputs.map((output) => {
			const typeKey = `runtime.${output.slot}`
			const artifact: RuntimeArtifact = {
				artifactId: `${publication.publicationId}:${output.slot}`,
				predicate: output.predicate,
				schema: output.schema,
				typeKey,
				schemaVersion: 1,
				contentDigest: digest(output.value),
				value: structuredClone(output.value)
			}
			this.#values.set(artifact.artifactId, artifact)
			return artifact
		})
	}
}

class FixtureFactory implements ActorFactory {
	spawned = 0
	released = 0

	constructor(
		readonly offer: ActorFactoryOffer,
		private readonly definition: ReturnType<typeof definitionFromManifest>
	) {}

	async assess(request: ActorSpawnRequest) {
		return {
			admitted: true as const,
			admissionId: `admission:${request.requestId}`,
			expiresAt: '2026-08-29T23:59:59.000Z',
			grantedCapabilities: request.requestedCapabilities,
			normalizedConfiguration: request.configuration
		}
	}

	async spawn(request: ActorSpawnRequest): Promise<SpawnedActor> {
		this.spawned += 1
		const method = this.definition.manifest.methods[0]?.name
		if (!method) throw new Error('fixture actor has no method')
		const actor = new Actor(this.definition.manifest, {
			[method]: (payload) =>
				handlers[method]?.(payload as unknown as ActorStepPayload) ?? answer({})
		})
		let released = false
		return {
			actor,
			advertisement: {
				instanceId: actor.uuid,
				definitionRef: this.definition.ref,
				label: this.offer.label,
				address: { kind: 'local', value: actor.uuid },
				capabilityIds: request.requestedCapabilities,
				status: 'available',
				executionEnvironment: this.offer.executionEnvironment
			},
			release: () => {
				if (released) return
				released = true
				this.released += 1
				actor.dispose()
			}
		}
	}
}

class FactoryMap implements ActorFactoryResolver {
	constructor(private readonly factories: FixtureFactory[]) {}

	resolve(factoryId: ActorFactoryOffer['factoryId']): ActorFactory | undefined {
		return this.factories.find((factory) => factory.offer.factoryId === factoryId)
	}
}

interface Harness {
	registry: ActorRegistry
	factories: FixtureFactory[]
	authorizer: ActorAuthorizer
	authorizationCalls: ActorAuthorizationRequest[]
	principal: ActorPrincipal
	access: ActorAccessContext
}

function harness(
	executionEnvironment: 'local' | 'server',
	deniedAction?: ActorAuthorizationRequest['action'],
	deniedCapabilityId?: string
): Harness {
	const registry = new ActorRegistry(() => new Date('2026-08-29T12:00:00.000Z'))
	const factories: FixtureFactory[] = []
	for (const actorManifest of [INSPECT, EXTRACT, EXTRACT_FALLBACK, NORMALIZE, VISUAL]) {
		const definition = definitionFromManifest(actorManifest)
		registry.registerDefinition(definition)
		const offer: ActorFactoryOffer = {
			offerId: resourceId({
				authority: 'os.aven',
				kind: 'offer',
				namespace: 'testing.runtime',
				name: `${executionEnvironment}-${actorManifest.id}`,
				version: '1'
			}),
			factoryId: resourceId({
				authority: 'os.aven',
				kind: 'factory',
				namespace: 'testing.runtime',
				name: `${executionEnvironment}-${actorManifest.id}`,
				version: '1'
			}),
			definitionRef: definition.ref,
			label: `${executionEnvironment} ${actorManifest.name}`,
			capabilityIds: definition.capabilities.map((capability) => capability.id),
			executionEnvironment,
			lifetime: 'step'
		}
		registry.publishOffer(offer)
		factories.push(new FixtureFactory(offer, definition))
	}
	const authorizationCalls: ActorAuthorizationRequest[] = []
	const authorizer: ActorAuthorizer = {
		decide(request) {
			authorizationCalls.push(structuredClone(request))
			if (
				request.action === deniedAction &&
				(!deniedCapabilityId || request.capabilityId === deniedCapabilityId)
			) {
				return {
					allow: false,
					decisionId: `deny:${request.action}:${request.method ?? 'definition'}`,
					reasonCode: 'TEST_POLICY_DENIAL'
				}
			}
			return {
				allow: true,
				decisionId: `allow:${request.action}:${request.method ?? 'definition'}`
			}
		}
	}
	return {
		registry,
		factories,
		authorizer,
		authorizationCalls,
		principal: {
			subjectId: 'runtime-user',
			kind: 'user',
			assurance: ['passkey']
		},
		access: {
			tenantId: 'runtime-tenant',
			entitlements: ['runtime-conformance']
		}
	}
}

async function prepareFixture(
	executionEnvironment: 'local' | 'server',
	deniedAction?: ActorAuthorizationRequest['action'],
	deniedCapabilityId?: string
) {
	const setup = harness(executionEnvironment, deniedAction, deniedCapabilityId)
	const snapshot = setup.registry.snapshot()
	const view = await authorizeRegistryForPlanning(snapshot, setup.principal, setup.authorizer, {
		access: setup.access
	})
	const planned = solveAuthorized(
		view,
		[{ predicate: sourcePredicate, artifactId: 'fixture-source' }],
		[goalPredicate],
		{ executionEnvironment }
	)
	if (!planned.ok) throw new Error(planned.reason)
	const artifacts = new MemoryArtifacts({
		artifactId: 'fixture-source',
		predicate: sourcePredicate,
		schema: SOURCE_SCHEMA,
		typeKey: 'runtime.source',
		schemaVersion: 1,
		contentDigest: digest({
			marker: 'structured',
			fields: { vendor: ' Aven ', amountMinor: 4242 }
		}),
		value: {
			marker: 'structured',
			fields: { vendor: ' Aven ', amountMinor: 4242 }
		}
	})
	return { ...setup, artifacts, planned: planned.program, snapshot }
}

async function runFixture(executionEnvironment: 'local' | 'server') {
	const setup = await prepareFixture(executionEnvironment)
	const result = await executePhysicalProgram({
		runId: `run-${executionEnvironment}`,
		program: setup.planned,
		registry: setup.snapshot,
		principal: setup.principal,
		access: setup.access,
		authorizer: setup.authorizer,
		factories: new FactoryMap(setup.factories),
		artifacts: setup.artifacts
	})
	return { ...setup, result }
}

describe('deterministic actor runtime conformance slice', () => {
	test('plans, dynamically admits, executes, publishes, and releases the local fixture skill', async () => {
		const run = await runFixture('local')

		expect(run.planned.steps.map((step) => step.method)).toEqual([
			'inspect_fixture',
			'extract_structured_fixture',
			'normalize_fixture'
		])
		expect(run.result).toMatchObject({
			completedStepIds: ['step-1', 'step-2', 'step-3'],
			fulfilledPredicates: [goalPredicate],
			remainingGoals: [],
			warnings: []
		})
		expect(run.result.artifacts.at(-1)?.value).toEqual({
			vendor: 'Aven',
			amount: '42.42',
			currency: 'EUR'
		})
		expect(canonicalManifest(run.result.artifacts, run.result, run.artifacts.publications)).toEqual(
			{
				terminalState: 'succeeded',
				fulfilledPredicates: [goalPredicate],
				remainingGoals: [],
				outputs: [
					{
						predicate: 'os.aven.testing.profile(fixture_1, structured)',
						typeKey: 'runtime.profile',
						schema: PROFILE_SCHEMA,
						schemaVersion: 1,
						contentDigest: '57b38b8048fd16f14a2d24c3d7ea7a0c08c1267a2b9d4970a3a232cfbf82c8fd'
					},
					{
						predicate: 'os.aven.testing.fields(fixture_1)',
						typeKey: 'runtime.fields',
						schema: FIELDS_SCHEMA,
						schemaVersion: 1,
						contentDigest: '2c70eadd84f74d1bee218dd5eeeb5ed244a00fbd7cc720a1999802f052356260'
					},
					{
						predicate: goalPredicate,
						typeKey: 'runtime.result',
						schema: RESULT_SCHEMA,
						schemaVersion: 1,
						contentDigest: 'a5ff5510994e547d352ea512ce9f5edff9f78565cf99a22978806d2f47978bff'
					}
				],
				provenance: [
					{
						capabilityId: 'os.aven:capability:testing.runtime.inspect-fixture:inspect_fixture@1',
						inputRoles: ['source'],
						outputRoles: ['profile']
					},
					{
						capabilityId:
							'os.aven:capability:testing.runtime.extract-structured-fixture:extract_structured_fixture@1',
						inputRoles: ['source', 'profile'],
						outputRoles: ['fields']
					},
					{
						capabilityId:
							'os.aven:capability:testing.runtime.normalize-fixture:normalize_fixture@1',
						inputRoles: ['fields'],
						outputRoles: ['result']
					}
				],
				warnings: []
			}
		)
		expect(run.artifacts.publications).toHaveLength(3)
		expect(
			run.factories.filter((factory) => factory.spawned > 0).map((factory) => factory.offer.label)
		).toEqual([
			'local inspect-fixture',
			'local extract-structured-fixture',
			'local normalize-fixture'
		])
		expect(run.factories.every((factory) => factory.spawned === factory.released)).toBe(true)
		expect(run.authorizationCalls.filter((call) => call.action === 'spawn')).toHaveLength(3)
		expect(run.authorizationCalls.filter((call) => call.action === 'invoke')).toHaveLength(3)
		const inspectSpawn = run.authorizationCalls.find(
			(call) => call.action === 'spawn' && call.method === 'inspect_fixture'
		)
		expect(inspectSpawn?.inputs).toEqual([
			{
				slot: 'source',
				role: 'source',
				artifactId: 'fixture-source',
				predicate: sourcePredicate,
				schema: SOURCE_SCHEMA,
				typeKey: 'runtime.source',
				schemaVersion: 1,
				contentDigest: '899680f0bc5e21de91bcc866f1f68f47f856124939d72296b1aab18bae03a0a7'
			}
		])
		expect(
			run.authorizationCalls.find(
				(call) => call.action === 'invoke' && call.method === 'inspect_fixture'
			)?.inputs
		).toEqual(inspectSpawn?.inputs)
		expect(run.result.policyDecisionIds).toHaveLength(9)
	})

	test('keeps the portable executor outcome equivalent across local and server placements', async () => {
		const [local, server] = await Promise.all([runFixture('local'), runFixture('server')])

		expect(
			canonicalManifest(server.result.artifacts, server.result, server.artifacts.publications)
		).toEqual(canonicalManifest(local.result.artifacts, local.result, local.artifacts.publications))
		expect(local.planned.steps.every((step) => step.target.executionEnvironment === 'local')).toBe(
			true
		)
		expect(
			server.planned.steps.every((step) => step.target.executionEnvironment === 'server')
		).toBe(true)
	})

	test('rechecks invocation policy, releases denied actors, and publishes nothing on either host', async () => {
		for (const executionEnvironment of ['local', 'server'] as const) {
			const run = await prepareFixture(executionEnvironment, 'invoke')
			await expect(
				executePhysicalProgram({
					runId: `denied-${executionEnvironment}`,
					program: run.planned,
					registry: run.snapshot,
					principal: run.principal,
					access: run.access,
					authorizer: run.authorizer,
					factories: new FactoryMap(run.factories),
					artifacts: run.artifacts
				})
			).rejects.toThrow('invoke denied: TEST_POLICY_DENIAL')

			expect(run.artifacts.publications).toHaveLength(0)
			expect(run.factories.reduce((total, factory) => total + factory.spawned, 0)).toBe(1)
			expect(run.factories.reduce((total, factory) => total + factory.released, 0)).toBe(1)
		}
	})

	test('removes an unauthorized cheaper actor before planning and executes only the fallback', async () => {
		const preferredCapability =
			'os.aven:capability:testing.runtime.extract-structured-fixture:extract_structured_fixture@1'
		for (const executionEnvironment of ['local', 'server'] as const) {
			const run = await prepareFixture(executionEnvironment, 'plan', preferredCapability)
			expect(run.planned.steps.map((step) => step.method)).toEqual([
				'inspect_fixture',
				'extract_structured_fixture_fallback',
				'normalize_fixture'
			])

			const result = await executePhysicalProgram({
				runId: `fallback-${executionEnvironment}`,
				program: run.planned,
				registry: run.snapshot,
				principal: run.principal,
				access: run.access,
				authorizer: run.authorizer,
				factories: new FactoryMap(run.factories),
				artifacts: run.artifacts
			})

			expect(result.remainingGoals).toEqual([])
			expect(result.artifacts.at(-1)?.value).toEqual({
				vendor: 'Aven',
				amount: '42.42',
				currency: 'EUR'
			})
			expect(
				run.factories.find((factory) => factory.offer.capabilityIds.includes(preferredCapability))
					?.spawned
			).toBe(0)
			expect(
				run.authorizationCalls.some(
					(call) => call.action === 'plan' && call.capabilityId === preferredCapability
				)
			).toBe(true)
		}
	})
})

function canonicalManifest(
	artifacts: RuntimeArtifact[],
	result: Awaited<ReturnType<typeof executePhysicalProgram>>,
	publications: RuntimeStepPublication[]
) {
	return {
		terminalState: result.remainingGoals.length === 0 ? 'succeeded' : 'failed',
		fulfilledPredicates: [...result.fulfilledPredicates].sort(),
		remainingGoals: [...result.remainingGoals].sort(),
		outputs: artifacts.map((artifact) => ({
			predicate: artifact.predicate,
			typeKey: artifact.typeKey,
			schema: artifact.schema,
			schemaVersion: artifact.schemaVersion,
			contentDigest: artifact.contentDigest
		})),
		provenance: publications.map((publication) => ({
			capabilityId: publication.capabilityId,
			inputRoles: publication.inputs.map((input) => input.role),
			outputRoles: publication.outputs.map((output) => output.role)
		})),
		warnings: [...result.warnings].sort()
	}
}

function digest(value: unknown): string {
	return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
		.join(',')}}`
}
