import { createHash, randomUUID } from 'node:crypto'
import {
	ACTOR_RUN_PROTOCOL,
	Actor,
	type ActorFactory,
	type ActorFactoryOffer,
	ActorRegistry,
	type ActorSpawnRequest,
	type ActorStepPayload,
	createActorPlanExecutor,
	definitionFromManifest,
	type ExecutionEnvironment,
	type Manifest,
	type PlanRunExecutionContext,
	type PlanRunExecutionResult,
	type PlanRunStartRequest,
	type RuntimeArtifact,
	type RuntimeArtifactPublisher,
	type RuntimeArtifactResolver,
	type RuntimeStepPublication,
	resourceId,
	type SpawnedActor
} from '@avenos/actors'

export const PERSISTENT_SOURCE_SCHEMA = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'persistent-source',
	version: '1'
})
export const PERSISTENT_RESULT_SCHEMA = resourceId({
	authority: 'os.aven',
	kind: 'schema',
	namespace: 'testing.fixture',
	name: 'persistent-result',
	version: '1'
})
export const PERSISTENT_SOURCE_PREDICATE = 'os.aven.testing.persistent_source(fixture_1)'
export const PERSISTENT_RESULT_PREDICATE = 'os.aven.testing.persistent_result(fixture_1)'
export const PERSISTENT_SOURCE_ARTIFACT_ID = '11111111-1111-4111-8111-111111111111'
export const SECRET_CONTINUATION_ID = 'password-for-fixture'
export const PERSISTENT_CAPABILITY_ID = resourceId({
	authority: 'os.aven',
	kind: 'capability',
	namespace: 'testing.runtime.persistent-fixture-transformer',
	name: 'transform_persistent_fixture',
	version: '1'
})

const persistentManifest: Manifest = {
	id: 'persistent-fixture-transformer',
	authority: 'os.aven',
	namespace: 'testing.runtime',
	version: '1',
	name: 'Persistent fixture transformer',
	description: 'Transforms one deterministic runtime conformance fixture.',
	tags: ['testing', 'runtime-conformance'],
	methods: [
		{
			name: 'transform_persistent_fixture',
			description: 'Normalize the deterministic source value.',
			parameters: { type: 'object', additionalProperties: false },
			mode: 'transform',
			idempotency: 'pure',
			requires: ['os.aven.testing.persistent_source(D)'],
			produces: ['os.aven.testing.persistent_result(D)'],
			inputSlots: [
				{
					name: 'source',
					predicate: 'os.aven.testing.persistent_source(D)',
					schema: PERSISTENT_SOURCE_SCHEMA,
					role: 'source',
					cardinality: 'one'
				}
			],
			outputSlots: [
				{
					name: 'result',
					predicate: 'os.aven.testing.persistent_result(D)',
					schema: PERSISTENT_RESULT_SCHEMA,
					role: 'result',
					cardinality: 'one'
				}
			]
		}
	]
}

export function deterministicRunRequest(
	executionEnvironment: ExecutionEnvironment,
	subjectId: string,
	tenantId: string,
	sourceArtifactId = PERSISTENT_SOURCE_ARTIFACT_ID
): PlanRunStartRequest {
	const now = new Date().toISOString()
	return {
		protocol: ACTOR_RUN_PROTOCOL,
		requestId: randomUUID(),
		idempotencyKey: `${executionEnvironment}-${randomUUID()}`,
		requestedAt: now,
		skillRef: resourceId({
			authority: 'ceo.aven',
			kind: 'skill',
			namespace: 'testing.runtime',
			name: 'persistent-conformance',
			version: '1'
		}),
		executionEnvironment,
		ingredients: [{ predicate: PERSISTENT_SOURCE_PREDICATE, artifactId: sourceArtifactId }],
		goals: [PERSISTENT_RESULT_PREDICATE],
		parameters: {},
		security: {
			principal: { subjectId, kind: 'user', assurance: ['passkey'] },
			access: { tenantId, entitlements: ['runtime-conformance'] },
			establishedBy: 'test',
			authorizedAt: now
		}
	}
}

export function secretContinuationRunRequest(
	subjectId: string,
	tenantId: string
): PlanRunStartRequest {
	const request = deterministicRunRequest('server', subjectId, tenantId)
	return {
		...request,
		requestId: randomUUID(),
		idempotencyKey: `secret-${randomUUID()}`,
		skillRef: resourceId({
			authority: 'ceo.aven',
			kind: 'skill',
			namespace: 'testing.runtime',
			name: 'secret-continuation',
			version: '1'
		}),
		goals: ['os.aven.testing.secret_unlocked(fixture_1)']
	}
}

export async function deterministicSecretExecutor(
	_request: PlanRunStartRequest,
	context?: PlanRunExecutionContext
): Promise<PlanRunExecutionResult> {
	const submission = context?.submission
	if (!submission) return secretRequest('Enter the password for the deterministic fixture.')
	if (submission.continuationId !== SECRET_CONTINUATION_ID || submission.kind !== 'secret') {
		throw new Error('unexpected continuation')
	}
	if (submission.value !== 'correct horse battery staple') {
		return secretRequest('That password did not unlock the fixture. Try again.')
	}
	return {
		completedStepIds: ['unlock-step'],
		remainingGoals: [],
		registryRevision: 1,
		policyDecisionIds: ['allow:secret-continuation']
	}
}

function secretRequest(prompt: string): PlanRunExecutionResult {
	return {
		remainingGoals: ['os.aven.testing.secret_unlocked(fixture_1)'],
		continuation: {
			continuationId: SECRET_CONTINUATION_ID,
			kind: 'secret',
			schema: 'os.aven:schema:testing.fixture:password@1',
			subject: 'fixture_1',
			prompt,
			persistence: 'metadata-only',
			state: 'open'
		}
	}
}

export function deterministicExecutionHarness(
	executionEnvironment: ExecutionEnvironment,
	externalArtifacts?: RuntimeArtifactResolver & RuntimeArtifactPublisher
) {
	const registry = new ActorRegistry(() => new Date('2026-08-29T12:00:00.000Z'))
	const definition = definitionFromManifest(persistentManifest)
	registry.registerDefinition(definition)
	const offer: ActorFactoryOffer = {
		offerId: resourceId({
			authority: 'os.aven',
			kind: 'offer',
			namespace: 'testing.runtime',
			name: `${executionEnvironment}-persistent-transformer`,
			version: '1'
		}),
		factoryId: resourceId({
			authority: 'os.aven',
			kind: 'factory',
			namespace: 'testing.runtime',
			name: `${executionEnvironment}-persistent-transformer`,
			version: '1'
		}),
		definitionRef: definition.ref,
		label: `${executionEnvironment} persistent transformer`,
		capabilityIds: definition.capabilities.map((capability) => capability.id),
		executionEnvironment,
		lifetime: 'step'
	}
	registry.publishOffer(offer)
	let spawnCount = 0
	let releaseCount = 0
	const factory: ActorFactory = {
		offer,
		async assess(request: ActorSpawnRequest) {
			return {
				admitted: true,
				admissionId: `admission:${request.requestId}`,
				expiresAt: '2026-08-29T23:59:59.000Z',
				grantedCapabilities: request.requestedCapabilities,
				normalizedConfiguration: request.configuration
			}
		},
		async spawn(request: ActorSpawnRequest): Promise<SpawnedActor> {
			spawnCount += 1
			const actor = new Actor(persistentManifest, {
				transform_persistent_fixture(payload) {
					const input = payload as unknown as ActorStepPayload
					const source = input.inputs.source?.value as { summary: string }
					return {
						record: JSON.stringify({
							ok: true,
							outputs: {
								result: {
									summary: source.summary.trim().toUpperCase(),
									topics: ['runtime-conformance']
								}
							}
						}),
						wire: 'normalized'
					}
				}
			})
			let released = false
			return {
				actor,
				advertisement: {
					instanceId: actor.uuid,
					definitionRef: definition.ref,
					label: offer.label,
					address: {
						kind: 'opaque',
						value: `${executionEnvironment}-test-host`
					},
					capabilityIds: request.requestedCapabilities,
					status: 'available',
					executionEnvironment
				},
				release() {
					if (released) return
					released = true
					releaseCount += 1
					actor.dispose()
				}
			}
		}
	}
	const source: RuntimeArtifact = {
		artifactId: PERSISTENT_SOURCE_ARTIFACT_ID,
		predicate: PERSISTENT_SOURCE_PREDICATE,
		schema: PERSISTENT_SOURCE_SCHEMA,
		typeKey: 'core.content-description',
		schemaVersion: 1,
		contentDigest: digest({ summary: ' persistent proof ', topics: [] }),
		value: { summary: ' persistent proof ', topics: [] }
	}
	const values = new Map([[source.artifactId, source]])
	const publications: RuntimeStepPublication[] = []
	const memoryArtifacts = {
		resolve: async (artifactId: string) => values.get(artifactId) ?? null,
		publish: async (publication: RuntimeStepPublication) =>
			publication.outputs.map((output) => ({
				artifactId: `${publication.publicationId}:${output.slot}`,
				predicate: output.predicate,
				schema: output.schema,
				typeKey: 'core.content-description',
				schemaVersion: 1,
				contentDigest: digest(output.value),
				value: structuredClone(output.value)
			}))
	}
	const artifactDelegate = externalArtifacts ?? memoryArtifacts
	const artifacts = {
		resolve: (artifactId: string, expectedPredicate: string) =>
			artifactDelegate.resolve(artifactId, expectedPredicate),
		publish: async (publication: RuntimeStepPublication) => {
			publications.push(structuredClone(publication))
			const published = await artifactDelegate.publish(publication)
			for (const artifact of published) values.set(artifact.artifactId, artifact)
			return published
		}
	}
	const authorizer = {
		decide(input: { action: string; method?: string }) {
			return {
				allow: true as const,
				decisionId: `allow:${input.action}:${input.method ?? 'definition'}`
			}
		}
	}
	const execute = createActorPlanExecutor({
		executionEnvironment,
		registry: () => registry.snapshot(),
		authorizer: () => authorizer,
		factories: () => ({
			resolve: (factoryId) => (factoryId === offer.factoryId ? factory : undefined)
		}),
		artifacts: () => artifacts
	})
	return {
		execute,
		artifacts: () =>
			[...values.values()].filter((artifact) => artifact.artifactId !== source.artifactId),
		registryRevision: () => registry.snapshot().revision,
		spawned: () => spawnCount,
		released: () => releaseCount,
		canonicalManifest: () => ({
			outputs: [...values.values()]
				.filter((artifact) => artifact.artifactId !== source.artifactId)
				.map((artifact) => ({
					predicate: artifact.predicate,
					typeKey: artifact.typeKey,
					schema: artifact.schema,
					contentDigest: artifact.contentDigest
				})),
			provenance: publications.map((publication) => ({
				capabilityId: publication.capabilityId,
				inputRoles: publication.inputs.map((input) => input.role),
				outputRoles: publication.outputs.map((output) => output.role)
			}))
		})
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
