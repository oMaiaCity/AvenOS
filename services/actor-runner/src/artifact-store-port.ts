import { createHash } from 'node:crypto'
import {
	type CapabilityId,
	type Predicate,
	type RuntimeArtifact,
	type RuntimeArtifactPublisher,
	type RuntimeArtifactResolver,
	type RuntimeStepPublication,
	type SchemaId,
	unifiable
} from '@avenos/actors'
import {
	type ArtifactJson,
	type ArtifactStoreClient,
	canonicalArtifactJson
} from '@avenos/artifact-store'

export interface ArtifactStoreSchemaBinding {
	schema: SchemaId
	typeKey: string
	typeVersion: number
	/** Project trusted facts from a schema-validated, committed payload. */
	project(payload: ArtifactJson, artifactId: string): Predicate[]
}

export interface ArtifactStoreProcedureBinding {
	capabilityId: CapabilityId
	procedureKey: string
	procedureVersion: string
	executor: { kind: 'agent' | 'service'; id: string }
	implementation: ArtifactJson
}

export interface ArtifactStoreRuntimePortOptions {
	client: ArtifactStoreClient
	scopeId: string
	initiator: { kind: 'user' | 'service'; id: string }
	schemas: readonly ArtifactStoreSchemaBinding[]
	procedures: readonly ArtifactStoreProcedureBinding[]
}

/**
 * Concrete Artifact Store port for the generic executor.
 *
 * It never accepts a predicate from storage or echoes the planner's expectation.
 * Facts are projected by a schema binding after the store has validated the type and
 * payload. Outputs are committed as one production run before they are returned to
 * the executor as available values.
 */
export class ArtifactStoreRuntimePort implements RuntimeArtifactResolver, RuntimeArtifactPublisher {
	readonly #client: ArtifactStoreClient
	readonly #scopeId: string
	readonly #initiator: ArtifactStoreRuntimePortOptions['initiator']
	readonly #schemas: readonly ArtifactStoreSchemaBinding[]
	readonly #procedures: readonly ArtifactStoreProcedureBinding[]

	constructor(options: ArtifactStoreRuntimePortOptions) {
		this.#client = options.client
		this.#scopeId = assertUuid(options.scopeId, 'scope ID')
		this.#initiator = structuredClone(options.initiator)
		this.#schemas = [...options.schemas]
		this.#procedures = [...options.procedures]
	}

	async resolve(artifactId: string, expectedPredicate: Predicate): Promise<RuntimeArtifact | null> {
		const id = assertUuid(artifactId, 'artifact ID')
		const envelope = record(await this.#client.artifact(this.#scopeId, id), 'artifact')
		if (stringField(envelope, 'artifactId', 'artifact') !== id) {
			throw new Error('Artifact Store returned a different artifact ID')
		}
		const typeKey = stringField(envelope, 'typeKey', 'artifact')
		const typeVersion = integerField(envelope, 'typeVersion', 'artifact')
		const bindings = this.#schemas.filter(
			(candidate) => candidate.typeKey === typeKey && candidate.typeVersion === typeVersion
		)
		if (bindings.length === 0)
			throw new Error(`no runtime schema binding for ${typeKey}@${typeVersion}`)
		const payload = artifactJsonField(envelope, 'payload')
		for (const binding of bindings) {
			const predicate = binding
				.project(payload, id)
				.find((candidate) => unifiable(candidate, expectedPredicate))
			if (predicate) {
				return {
					artifactId: id,
					predicate,
					schema: binding.schema,
					typeKey,
					schemaVersion: typeVersion,
					contentDigest: payloadDigest(payload),
					value: structuredClone(payload)
				}
			}
		}
		return null
	}

	async publish(publication: RuntimeStepPublication): Promise<RuntimeArtifact[]> {
		const procedure = this.#procedures.find(
			(candidate) => candidate.capabilityId === publication.capabilityId
		)
		if (!procedure) throw new Error(`no Artifact Store procedure for ${publication.capabilityId}`)
		const context = record(await this.#client.context(), 'Artifact Store context')
		const storeEpoch = assertUuid(
			stringField(context, 'storeEpoch', 'Artifact Store context'),
			'store epoch'
		)
		const publicationId = stablePublicationUuid(publication.publicationId)
		const roleOrdinals = new Map<string, number>()
		const outputs = publication.outputs.map((output) => {
			const binding = this.#schemas.find((candidate) => candidate.schema === output.schema)
			if (!binding) throw new Error(`no Artifact Store schema binding for ${output.schema}`)
			const ordinal = roleOrdinals.get(output.role) ?? 0
			roleOrdinals.set(output.role, ordinal + 1)
			return {
				binding,
				draft: output,
				artifact: {
					localKey: output.slot,
					typeKey: binding.typeKey,
					typeVersion: binding.typeVersion,
					payload: output.value as ArtifactJson,
					blob: null,
					references: [],
					output: { role: output.role, ordinal }
				} satisfies ArtifactJson
			}
		})
		const inputOrdinals = new Map<string, number>()
		const result = record(
			await this.#client.publish(this.#scopeId, publicationId, storeEpoch, {
				intent: {
					commandVersion: 1,
					publicationId,
					scopeId: this.#scopeId,
					kind: 'run',
					run: {
						procedureKey: procedure.procedureKey,
						procedureVersion: procedure.procedureVersion,
						initiator: this.#initiator,
						executor: procedure.executor,
						inputs: publication.inputs.map((input) => {
							const ordinal = inputOrdinals.get(input.role) ?? 0
							inputOrdinals.set(input.role, ordinal + 1)
							return {
								role: input.role,
								ordinal,
								artifactId: assertUuid(input.artifact.artifactId, 'input artifact ID')
							}
						}),
						parameters: {},
						implementation: procedure.implementation,
						receipt: { outcome: 'succeeded' }
					},
					artifacts: outputs.map((output) => output.artifact),
					evidence: []
				},
				blobAuthorities: {}
			}),
			'publication result'
		)
		if (stringField(result, 'publicationId', 'publication result') !== publicationId) {
			throw new Error('Artifact Store returned a different publication ID')
		}
		const published = result.artifacts
		if (!Array.isArray(published) || published.length !== outputs.length) {
			throw new Error('Artifact Store returned an invalid output mapping')
		}
		return outputs.map((output) => {
			const mapped = record(
				published.find(
					(value) =>
						typeof value === 'object' &&
						value !== null &&
						(value as Record<string, unknown>).localKey === output.draft.slot
				),
				`published output ${output.draft.slot}`
			)
			return {
				artifactId: assertUuid(
					stringField(mapped, 'artifactId', 'published output'),
					'published artifact ID'
				),
				predicate: output.draft.predicate,
				schema: output.binding.schema,
				typeKey: output.binding.typeKey,
				schemaVersion: output.binding.typeVersion,
				contentDigest: payloadDigest(output.draft.value as ArtifactJson),
				value: structuredClone(output.draft.value)
			}
		})
	}
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLICATION_NAMESPACE = Uint8Array.from([
	0x73, 0x83, 0x19, 0xca, 0xb4, 0x8f, 0x4c, 0x7d, 0x9a, 0x69, 0x7b, 0xc1, 0x1f, 0x38, 0xe8, 0x91
])

export function stablePublicationUuid(identity: string): string {
	if (UUID_PATTERN.test(identity)) return identity.toLowerCase()
	const digest = createHash('sha1').update(PUBLICATION_NAMESPACE).update(identity).digest()
	const bytes = Uint8Array.from(digest.subarray(0, 16))
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
	const hex = Buffer.from(bytes).toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function payloadDigest(value: ArtifactJson): string {
	return createHash('sha256').update(canonicalArtifactJson(value)).digest('hex')
}

function record(value: unknown, label: string): Record<string, ArtifactJson> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`)
	}
	return value as Record<string, ArtifactJson>
}

function stringField(value: Record<string, ArtifactJson>, field: string, label: string): string {
	const candidate = value[field]
	if (typeof candidate !== 'string' || candidate.length === 0) {
		throw new Error(`${label}.${field} must be a string`)
	}
	return candidate
}

function integerField(value: Record<string, ArtifactJson>, field: string, label: string): number {
	const candidate = value[field]
	if (typeof candidate !== 'number' || !Number.isInteger(candidate)) {
		throw new Error(`${label}.${field} must be an integer`)
	}
	return candidate
}

function artifactJsonField(value: Record<string, ArtifactJson>, field: string): ArtifactJson {
	if (!Object.hasOwn(value, field)) throw new Error(`artifact.${field} is missing`)
	return structuredClone(value[field] ?? null)
}

function assertUuid(value: string, label: string): string {
	if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID`)
	return value.toLowerCase()
}
