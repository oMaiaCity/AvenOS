import type { Predicate } from './actor'
import type { AuthorizedActorTarget, AuthorizedRegistryView } from './authorization'
import {
	type AdHocProgram,
	type Ingredient,
	type PlanStep,
	planEnrichment,
	planGoalThenEnrichment,
	type SolveOptions,
	type SolveResult,
	solve
} from './planner'
import type { ExecutionEnvironment } from './registry'

export interface PhysicalPlanStep extends PlanStep {
	target: AuthorizedActorTarget
}

export interface PhysicalProgram extends Omit<AdHocProgram, 'steps'> {
	registryRevision: number
	plannedFor: { subjectId: string; tenantId?: string }
	executionEnvironment: ExecutionEnvironment
	steps: PhysicalPlanStep[]
}

export interface PhysicalPlanningOptions extends SolveOptions {
	/** One run is placed wholly in one environment. */
	executionEnvironment: ExecutionEnvironment
}

export type PhysicalPlanResult =
	| { ok: true; program: PhysicalProgram; exploredStates: number }
	| Extract<SolveResult, { ok: false }>

export type PhysicalEnrichmentResult =
	| { ok: true; program: PhysicalProgram; exploredInvocations: number }
	| { ok: false; reason: string; exploredInvocations: number }

/** Search only the capabilities and placements visible to this principal. */
export function solveAuthorized(
	view: AuthorizedRegistryView,
	ingredients: Ingredient[],
	goals: Predicate[],
	options: PhysicalPlanningOptions
): PhysicalPlanResult {
	const capabilities = availableCapabilities(view, options.executionEnvironment)
	const logical = solve(
		capabilities.map(({ capability, targets }) => ({
			...capability,
			cost: (capability.cost ?? 1) + Math.min(...targets.map((target) => target.cost))
		})),
		ingredients,
		goals,
		options
	)
	if (!logical.ok) return logical
	return {
		ok: true,
		exploredStates: logical.exploredStates,
		program: physicalProgram(view, logical.program, capabilities, options.executionEnvironment)
	}
}

/** Plan all authorized, non-effecting enrichment available in one environment. */
export function enrichAuthorized(
	view: AuthorizedRegistryView,
	ingredients: Ingredient[],
	factFamilies: string[],
	options: PhysicalPlanningOptions
): PhysicalEnrichmentResult {
	const capabilities = availableCapabilities(view, options.executionEnvironment)
	const logical = planEnrichment(
		capabilities.map(({ capability, targets }) => ({
			...capability,
			cost: (capability.cost ?? 1) + Math.min(...targets.map((target) => target.cost))
		})),
		ingredients,
		{ factFamilies, ...(options.maxSteps !== undefined && { maxSteps: options.maxSteps }) }
	)
	if (!logical.ok) return logical
	return {
		ok: true,
		exploredInvocations: logical.exploredInvocations,
		program: physicalProgram(view, logical.program, capabilities, options.executionEnvironment)
	}
}

/** Plan a cheapest directed prefix followed by exhaustive authorized enrichment. */
export function enrichAfterGoalsAuthorized(
	view: AuthorizedRegistryView,
	ingredients: Ingredient[],
	goals: Predicate[],
	factFamilies: string[],
	options: PhysicalPlanningOptions
): PhysicalEnrichmentResult {
	const capabilities = availableCapabilities(view, options.executionEnvironment)
	const logical = planGoalThenEnrichment(
		capabilities.map(({ capability, targets }) => ({
			...capability,
			cost: (capability.cost ?? 1) + Math.min(...targets.map((target) => target.cost))
		})),
		ingredients,
		goals,
		{ ...options, factFamilies }
	)
	if (!logical.ok) return logical
	return {
		ok: true,
		exploredInvocations: logical.exploredInvocations,
		program: physicalProgram(view, logical.program, capabilities, options.executionEnvironment)
	}
}

function availableCapabilities(
	view: AuthorizedRegistryView,
	executionEnvironment: ExecutionEnvironment
) {
	return view.capabilities
		.map(({ capability, targets }) => ({
			capability,
			targets: targets.filter((target) => target.executionEnvironment === executionEnvironment)
		}))
		.filter(({ targets }) => targets.length > 0)
}

function physicalProgram(
	view: AuthorizedRegistryView,
	logical: AdHocProgram,
	capabilities: ReturnType<typeof availableCapabilities>,
	executionEnvironment: ExecutionEnvironment
): PhysicalProgram {
	const targets = new Map(
		capabilities.map(({ capability, targets: candidates }) => [capability.id, candidates[0]])
	)
	const steps: PhysicalPlanStep[] = logical.steps.map((step) => {
		const target = targets.get(step.capability)
		if (!target) throw new Error(`authorized target disappeared for ${step.capability}`)
		return { ...step, target }
	})
	return {
		...logical,
		registryRevision: view.registryRevision,
		plannedFor: {
			subjectId: view.principal.subjectId,
			...(view.access.tenantId && { tenantId: view.access.tenantId })
		},
		executionEnvironment,
		steps
	}
}
