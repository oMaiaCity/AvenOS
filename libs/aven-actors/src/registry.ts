import type { Actor, Manifest, Predicate } from './actor'
import {
	type ActorDefinitionId,
	type ActorFactoryId,
	type ActorOfferId,
	type CapabilityId,
	resourceId
} from './ids'
import type { Capability } from './planner'

export type ActorDefinitionRef = ActorDefinitionId
export type ExecutionEnvironment = 'local' | 'server'

export interface RegisteredCapability extends Capability {
	id: CapabilityId
	actor: ActorDefinitionId
}

export interface ActorDefinition {
	/** Version-qualified identity, for example `docs.ocr@2`. */
	ref: ActorDefinitionRef
	id: string
	version: string
	label: string
	description: string
	tags: string[]
	manifest: Manifest
	capabilities: RegisteredCapability[]
}

export type ActorAddress =
	| { kind: 'local'; value: string }
	| { kind: 'http'; value: string }
	| { kind: 'worker'; value: string }
	| { kind: 'opaque'; value: string }

/** A materialized actor which can accept envelopes now. */
export interface ActorInstanceAdvertisement {
	instanceId: string
	definitionRef: ActorDefinitionRef
	label: string
	address: ActorAddress
	capabilityIds: CapabilityId[]
	status: 'available' | 'draining' | 'unavailable'
	executionEnvironment: ExecutionEnvironment
	locality?: string
	trustDomain?: string
	cost?: number
	latencyMs?: number
	expiresAt?: string
	metadata?: Record<string, unknown>
}

/**
 * A placement which a runtime may ask a factory to materialize.
 *
 * Offers contain data only. The corresponding ActorFactory implementation is
 * resolved by `factoryId` in the execution environment and remains the final
 * authority for admission.
 */
export interface ActorFactoryOffer {
	offerId: ActorOfferId
	factoryId: ActorFactoryId
	definitionRef: ActorDefinitionRef
	label: string
	capabilityIds: CapabilityId[]
	executionEnvironment: ExecutionEnvironment
	configurationSchema?: Record<string, unknown>
	defaultConfiguration?: Record<string, unknown>
	locality?: string
	trustDomain?: string
	cost?: number
	latencyMs?: number
	/** Suggested ownership scope; the host may impose a shorter lifetime. */
	lifetime?: 'shared' | 'session' | 'run' | 'step'
	metadata?: Record<string, unknown>
}

export interface ActorRegistrySnapshot {
	readonly revision: number
	readonly capturedAt: string
	readonly definitions: readonly ActorDefinition[]
	readonly instances: readonly ActorInstanceAdvertisement[]
	readonly offers: readonly ActorFactoryOffer[]
}

export interface RegisterActorOptions {
	version?: string
	label?: string
	status?: ActorInstanceAdvertisement['status']
	executionEnvironment?: ExecutionEnvironment
	locality?: string
	trustDomain?: string
	cost?: number
	latencyMs?: number
	expiresAt?: string
	metadata?: Record<string, unknown>
}

export function definitionRef(
	id: string,
	version: string,
	authority: string,
	namespace: string
): ActorDefinitionRef {
	return resourceId({ authority, kind: 'actor', namespace, name: id, version })
}

function methodCapabilities(
	manifest: Manifest,
	version: string,
	actorRequires: readonly Predicate[] = manifest.requires ?? [],
	actorProduces: readonly Predicate[] = manifest.produces ?? []
): RegisteredCapability[] {
	const { authority, namespace } = manifest
	const ref = definitionRef(manifest.id, version, authority, namespace)
	return manifest.methods.flatMap((method) => {
		const requires = method.requires ?? actorRequires
		const produces = method.produces ?? actorProduces
		if (produces.length === 0) return []
		return [
			{
				id: resourceId({
					authority,
					kind: 'capability',
					namespace: `${namespace}.${manifest.id}`,
					name: method.name,
					version
				}),
				actor: ref,
				method: method.name,
				requires: [...requires],
				produces: [...produces],
				mode: method.mode ?? 'transform',
				idempotency: method.idempotency ?? 'none',
				...(method.cost !== undefined && { cost: method.cost }),
				parametersSchema: method.parameters,
				...(method.inputSlots && { inputSlots: method.inputSlots }),
				...(method.outputSlots && { outputSlots: method.outputSlots })
			}
		]
	})
}

export function definitionFromManifest(
	manifest: Manifest,
	version = manifest.version
): ActorDefinition {
	return {
		ref: definitionRef(manifest.id, version, manifest.authority, manifest.namespace),
		id: manifest.id,
		version,
		label: manifest.name,
		description: manifest.description,
		tags: [...manifest.tags],
		manifest,
		capabilities: methodCapabilities(manifest, version)
	}
}

/** Includes contracts derived by a live Actor from its Prolog machine. */
export function definitionFromActor(
	actor: Actor,
	version = actor.manifest.version
): ActorDefinition {
	return {
		...definitionFromManifest(actor.manifest, version),
		capabilities: methodCapabilities(actor.manifest, version, actor.requires, actor.produces)
	}
}

/**
 * Generic, transport-neutral discovery catalog.
 *
 * It owns advertisements, not actor processes. A host/factory owns spawning,
 * draining and disposal, and withdraws the advertisement when the instance is
 * no longer usable.
 */
export class ActorRegistry {
	#revision = 0
	#definitions = new Map<ActorDefinitionRef, ActorDefinition>()
	#instances = new Map<string, ActorInstanceAdvertisement>()
	#offers = new Map<ActorOfferId, ActorFactoryOffer>()
	readonly #now: () => Date
	onChange?: (revision: number) => void

	constructor(now: () => Date = () => new Date()) {
		this.#now = now
	}

	registerDefinition(definition: ActorDefinition): void {
		this.#definitions.set(definition.ref, immutableCopy(definition))
		this.#changed()
	}

	registerManifest(manifest: Manifest, version?: string): ActorDefinition {
		const definition = definitionFromManifest(manifest, version)
		this.registerDefinition(definition)
		return definition
	}

	registerActor(actor: Actor, options: RegisterActorOptions = {}): ActorInstanceAdvertisement {
		const definition = definitionFromActor(actor, options.version)
		this.registerDefinition(definition)
		const advertisement: ActorInstanceAdvertisement = {
			instanceId: actor.uuid,
			definitionRef: definition.ref,
			label: options.label ?? actor.instanceName,
			address: { kind: 'local', value: actor.uuid },
			capabilityIds: definition.capabilities.map((capability) => capability.id),
			status: options.status ?? 'available',
			executionEnvironment: options.executionEnvironment ?? 'local',
			...(options.locality && { locality: options.locality }),
			...(options.trustDomain && { trustDomain: options.trustDomain }),
			...(options.cost !== undefined && { cost: options.cost }),
			...(options.latencyMs !== undefined && { latencyMs: options.latencyMs }),
			...(options.expiresAt && { expiresAt: options.expiresAt }),
			...(options.metadata && { metadata: options.metadata })
		}
		this.advertiseInstance(advertisement)
		return advertisement
	}

	advertiseInstance(advertisement: ActorInstanceAdvertisement): void {
		this.#assertCapabilities(advertisement.definitionRef, advertisement.capabilityIds)
		this.#instances.set(advertisement.instanceId, immutableCopy(advertisement))
		this.#changed()
	}

	withdrawInstance(instanceId: string): void {
		if (!this.#instances.delete(instanceId)) return
		this.#changed()
	}

	publishOffer(offer: ActorFactoryOffer): void {
		this.#assertCapabilities(offer.definitionRef, offer.capabilityIds)
		this.#offers.set(offer.offerId, immutableCopy(offer))
		this.#changed()
	}

	withdrawOffer(offerId: ActorOfferId): void {
		if (!this.#offers.delete(offerId)) return
		this.#changed()
	}

	definition(ref: ActorDefinitionRef): ActorDefinition | undefined {
		return this.#definitions.get(ref)
	}

	instance(instanceId: string): ActorInstanceAdvertisement | undefined {
		return this.#instances.get(instanceId)
	}

	offer(offerId: ActorOfferId): ActorFactoryOffer | undefined {
		return this.#offers.get(offerId)
	}

	snapshot(): ActorRegistrySnapshot {
		return Object.freeze({
			revision: this.#revision,
			capturedAt: this.#now().toISOString(),
			definitions: Object.freeze([...this.#definitions.values()]),
			instances: Object.freeze([...this.#instances.values()]),
			offers: Object.freeze([...this.#offers.values()])
		})
	}

	#assertCapabilities(ref: ActorDefinitionRef, capabilityIds: readonly CapabilityId[]): void {
		const definition = this.#definitions.get(ref)
		if (!definition) throw new Error(`unknown actor definition ${ref}`)
		const known = new Set(definition.capabilities.map((capability) => capability.id))
		const unknown = capabilityIds.find((capabilityId) => !known.has(capabilityId))
		if (unknown) throw new Error(`${unknown} is not a capability of ${ref}`)
	}

	#changed(): void {
		this.#revision++
		this.onChange?.(this.#revision)
	}
}

function immutableCopy<Value>(value: Value): Value {
	return deepFreeze(structuredClone(value))
}

function deepFreeze<Value>(value: Value): Value {
	if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}
