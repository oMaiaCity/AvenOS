import type { Actor } from './actor'
import type {
	ActorAccessContext,
	ActorAuthorizationInput,
	ActorPrincipal,
	AuthorizationConstraints
} from './authorization'
import type { ActorFactoryId, ActorOfferId, CapabilityId } from './ids'
import type { ActorFactoryOffer, ActorInstanceAdvertisement } from './registry'

export interface ActorSpawnRequest {
	requestId: string
	runId: string
	principal: ActorPrincipal
	access: ActorAccessContext
	offerId: ActorOfferId
	requestedCapabilities: CapabilityId[]
	configuration: Record<string, unknown>
	/** Exact validated artifacts bound to the capability invocation. */
	inputs: ActorAuthorizationInput[]
	resource?: Record<string, unknown>
}

export type ActorAdmissionDecision =
	| {
			admitted: true
			admissionId: string
			expiresAt: string
			grantedCapabilities: CapabilityId[]
			normalizedConfiguration: Record<string, unknown>
			constraints?: AuthorizationConstraints
			obligations?: string[]
	  }
	| {
			admitted: false
			decisionId: string
			reasonCode: string
	  }

export interface SpawnedActor {
	actor: Actor
	advertisement: ActorInstanceAdvertisement
	/** Host-owned shutdown. It must withdraw the advertisement and dispose the actor. */
	release(): void | Promise<void>
}

/**
 * Execution-side implementation behind a serializable ActorFactoryOffer.
 * Admission is deliberately separate from spawn so a denial has no resource
 * side effects and can cause a safe re-plan.
 */
export interface ActorFactory {
	readonly offer: ActorFactoryOffer
	assess(request: ActorSpawnRequest): Promise<ActorAdmissionDecision>
	spawn(
		request: ActorSpawnRequest,
		admission: Extract<ActorAdmissionDecision, { admitted: true }>
	): Promise<SpawnedActor>
}

export interface ActorFactoryResolver {
	resolve(factoryId: ActorFactoryId): ActorFactory | undefined
}
