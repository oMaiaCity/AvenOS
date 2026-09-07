import {
	type ActorAuthorizer,
	type ActorExecutionHost,
	type ActorFactoryResolver,
	ActorRegistry,
	type ActorRegistrySnapshot,
	type AffordanceDefinition,
	type Ingredient,
	type PlanRunStartRequest,
	type RuntimeArtifactPublisher,
	type RuntimeArtifactResolver
} from '@avenos/actors'

type Awaitable<Value> = Value | Promise<Value>

export interface ServerActorHostDependencies {
	registryFor(request: PlanRunStartRequest): Awaitable<ActorRegistrySnapshot>
	authorizerFor(request: PlanRunStartRequest): Awaitable<ActorAuthorizer>
	factoriesFor(request: PlanRunStartRequest): Awaitable<ActorFactoryResolver>
	artifactsFor(
		request: PlanRunStartRequest
	): Awaitable<RuntimeArtifactResolver & RuntimeArtifactPublisher>
	resourceFor?(request: PlanRunStartRequest): Awaitable<Record<string, unknown> | undefined>
	affordancesFor?(request: PlanRunStartRequest): Awaitable<AffordanceDefinition[]>
	relatedIngredientsFor?(request: PlanRunStartRequest): Awaitable<Ingredient[]>
}

/**
 * Server composition root for the portable actor executor.
 *
 * The default host is deliberately empty and fail-closed. Application catalogs,
 * entitlement-backed authorization, factories, and tenant-scoped Artifact Store
 * adapters enter only through these ports; none belong in SqlPlanRunner or a plan.
 */
export function createServerActorExecutionHost(
	dependencies: ServerActorHostDependencies = failClosedDependencies()
): ActorExecutionHost {
	return {
		executionEnvironment: 'server',
		registry: dependencies.registryFor,
		authorizer: dependencies.authorizerFor,
		factories: dependencies.factoriesFor,
		artifacts: dependencies.artifactsFor,
		...(dependencies.resourceFor && { resource: dependencies.resourceFor }),
		...(dependencies.affordancesFor && { affordances: dependencies.affordancesFor }),
		...(dependencies.relatedIngredientsFor && {
			relatedIngredients: dependencies.relatedIngredientsFor
		})
	}
}

function failClosedDependencies(): ServerActorHostDependencies {
	const registry = new ActorRegistry()
	const unavailableArtifacts: RuntimeArtifactResolver & RuntimeArtifactPublisher = {
		resolve: async () => {
			throw new Error('the server Actor Store adapter is not configured')
		},
		publish: async () => {
			throw new Error('the server Actor Store adapter is not configured')
		}
	}
	return {
		registryFor: () => registry.snapshot(),
		authorizerFor: () => ({
			decide: async () => ({
				allow: false,
				decisionId: 'deny:server-host-unconfigured',
				reasonCode: 'ACTOR_HOST_UNCONFIGURED'
			})
		}),
		factoriesFor: () => ({ resolve: () => undefined }),
		artifactsFor: () => unavailableArtifacts
	}
}
