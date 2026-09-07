import type { Predicate } from './actor'
import type { ActorFactoryId, ActorOfferId, CapabilityId, SchemaId } from './ids'
import type { Capability } from './planner'
import type {
	ActorAddress,
	ActorFactoryOffer,
	ActorInstanceAdvertisement,
	ActorRegistrySnapshot
} from './registry'

export interface ActorPrincipal {
	subjectId: string
	kind: 'anonymous' | 'user' | 'service'
	assurance: string[]
	sessionId?: string
}

/** Application/data-plane context, deliberately not asserted by identity. */
export interface ActorAccessContext {
	tenantId?: string
	entitlements?: string[]
	artifactGrantIds?: string[]
}

export type ActorAuthorizationAction = 'discover' | 'plan' | 'spawn' | 'invoke'

/** Immutable input identity available to execution-time policy decisions. */
export interface ActorAuthorizationInput {
	slot: string
	role: string
	artifactId: string
	predicate: Predicate
	schema: SchemaId
	typeKey: string
	schemaVersion: number
	contentDigest: string
}

export interface ActorAuthorizationRequest {
	action: ActorAuthorizationAction
	principal: ActorPrincipal
	access: ActorAccessContext
	definitionRef: string
	capabilityId?: CapabilityId
	method?: string
	target?:
		| { kind: 'instance'; instanceId: string }
		| { kind: 'factory'; offerId: ActorOfferId; factoryId: ActorFactoryId }
	configuration?: Record<string, unknown>
	/** Present only after the executor has resolved and validated the exact step inputs. */
	inputs?: ActorAuthorizationInput[]
	runId?: string
	resource?: Record<string, unknown>
}

export interface AuthorizationConstraints {
	/** Additional schema which the exact requested configuration must satisfy. */
	configurationSchema?: Record<string, unknown>
	/** Values the policy requires regardless of what the caller requested. */
	forcedConfiguration?: Record<string, unknown>
	maxUses?: number
}

export type ActorAuthorizationDecision =
	| {
			allow: true
			decisionId: string
			expiresAt?: string
			constraints?: AuthorizationConstraints
			obligations?: string[]
	  }
	| {
			allow: false
			decisionId: string
			/** Stable audit code. It need not be revealed to the requesting user. */
			reasonCode: string
	  }

export interface ActorAuthorizer {
	decide(
		request: ActorAuthorizationRequest
	): ActorAuthorizationDecision | Promise<ActorAuthorizationDecision>
}

export type AuthorizedActorTarget =
	| {
			kind: 'instance'
			instanceId: string
			definitionRef: string
			address: ActorAddress
			executionEnvironment: ActorInstanceAdvertisement['executionEnvironment']
			cost: number
			latencyMs?: number
			authorization: Extract<ActorAuthorizationDecision, { allow: true }>
	  }
	| {
			kind: 'factory'
			offerId: ActorOfferId
			factoryId: ActorFactoryId
			definitionRef: string
			configuration: Record<string, unknown>
			executionEnvironment: ActorFactoryOffer['executionEnvironment']
			cost: number
			latencyMs?: number
			authorization: Extract<ActorAuthorizationDecision, { allow: true }>
	  }

export interface AuthorizedCapability {
	capability: Capability
	targets: AuthorizedActorTarget[]
}

/** A principal-specific, non-authoritative planning projection. */
export interface AuthorizedRegistryView {
	registryRevision: number
	capturedAt: string
	principal: ActorPrincipal
	access: ActorAccessContext
	capabilities: AuthorizedCapability[]
}

export interface PlanningAuthorizationOptions {
	access?: ActorAccessContext
	configurationByOffer?: Partial<Record<ActorOfferId, Record<string, unknown>>>
	resource?: Record<string, unknown>
}

const usableInstance = (instance: ActorInstanceAdvertisement, capturedAt: string): boolean =>
	instance.status === 'available' && (!instance.expiresAt || instance.expiresAt > capturedAt)

/**
 * Hide unauthorized definitions and placements before search starts.
 *
 * These decisions optimize and redact planning only. The runtime MUST repeat
 * authoritative `spawn` and `invoke` decisions because entitlements and data
 * policy may change after this snapshot was compiled.
 */
export async function authorizeRegistryForPlanning(
	snapshot: ActorRegistrySnapshot,
	principal: ActorPrincipal,
	authorizer: ActorAuthorizer,
	options: PlanningAuthorizationOptions = {}
): Promise<AuthorizedRegistryView> {
	const capabilities: AuthorizedCapability[] = []
	const access = options.access ?? {}
	for (const definition of snapshot.definitions) {
		for (const capability of definition.capabilities) {
			const visible = await authorizer.decide({
				action: 'discover',
				principal,
				access,
				definitionRef: definition.ref,
				capabilityId: capability.id,
				method: capability.method,
				...(options.resource && { resource: options.resource })
			})
			if (!visible.allow) continue

			const targets: AuthorizedActorTarget[] = []
			for (const instance of snapshot.instances.filter(
				(candidate) =>
					candidate.definitionRef === definition.ref &&
					candidate.capabilityIds.includes(capability.id) &&
					usableInstance(candidate, snapshot.capturedAt)
			)) {
				const decision = await authorizer.decide({
					action: 'plan',
					principal,
					access,
					definitionRef: definition.ref,
					capabilityId: capability.id,
					method: capability.method,
					target: { kind: 'instance', instanceId: instance.instanceId },
					...(options.resource && { resource: options.resource })
				})
				if (!decision.allow) continue
				targets.push({
					kind: 'instance',
					instanceId: instance.instanceId,
					definitionRef: definition.ref,
					address: instance.address,
					executionEnvironment: instance.executionEnvironment,
					cost: instance.cost ?? 0,
					...(instance.latencyMs !== undefined && { latencyMs: instance.latencyMs }),
					authorization: decision
				})
			}

			for (const offer of snapshot.offers.filter(
				(candidate) =>
					candidate.definitionRef === definition.ref &&
					candidate.capabilityIds.includes(capability.id)
			)) {
				const configuration =
					options.configurationByOffer?.[offer.offerId] ?? offer.defaultConfiguration ?? {}
				const decision = await authorizer.decide({
					action: 'plan',
					principal,
					access,
					definitionRef: definition.ref,
					capabilityId: capability.id,
					method: capability.method,
					target: { kind: 'factory', offerId: offer.offerId, factoryId: offer.factoryId },
					configuration,
					...(options.resource && { resource: options.resource })
				})
				if (!decision.allow) continue
				targets.push(factoryTarget(offer, configuration, decision))
			}

			if (targets.length > 0) {
				targets.sort(
					(left, right) => left.cost - right.cost || targetId(left).localeCompare(targetId(right))
				)
				capabilities.push({ capability, targets })
			}
		}
	}
	return {
		registryRevision: snapshot.revision,
		capturedAt: snapshot.capturedAt,
		principal,
		access,
		capabilities
	}
}

function factoryTarget(
	offer: ActorFactoryOffer,
	configuration: Record<string, unknown>,
	authorization: Extract<ActorAuthorizationDecision, { allow: true }>
): AuthorizedActorTarget {
	return {
		kind: 'factory',
		offerId: offer.offerId,
		factoryId: offer.factoryId,
		definitionRef: offer.definitionRef,
		configuration: {
			...configuration,
			...authorization.constraints?.forcedConfiguration
		},
		executionEnvironment: offer.executionEnvironment,
		cost: offer.cost ?? 0,
		...(offer.latencyMs !== undefined && { latencyMs: offer.latencyMs }),
		authorization
	}
}

function targetId(target: AuthorizedActorTarget): string {
	return target.kind === 'instance' ? target.instanceId : target.offerId
}
