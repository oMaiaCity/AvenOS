import { type CapabilitySlot, functor, type Manifest, type Predicate } from './actor'
import { resourceId } from './ids'
import { type Bindings, parseTerm, resolve, unify } from './term'

/** A durable value which is already available when planning starts. */
export interface Ingredient {
	predicate: Predicate
	artifactId?: string
}

/**
 * One invocable operation advertised by an actor.
 *
 * This is intentionally method-level. Actor-level requires/produces are useful
 * for discovery and diagrams, but a plan must name the envelope it can send.
 */
export interface Capability {
	id: string
	actor: string
	method: string
	requires: Predicate[]
	produces: Predicate[]
	/** A relative planning cost. Runtime telemetry can supply this later. */
	cost?: number
	/** Unavailable physical implementations remain discoverable but are not planned. */
	available?: boolean
	mode?: 'transform' | 'observe' | 'effect' | 'stream' | 'view'
	idempotency?: 'pure' | 'idempotent' | 'reconcilable' | 'none'
	parametersSchema?: Record<string, unknown>
	inputSlots?: CapabilitySlot[]
	outputSlots?: CapabilitySlot[]
}

/**
 * Turn actor registry contributions into the method-level operations the
 * planner can actually invoke.
 *
 * Method contracts win when present. Actor-level contracts remain a useful
 * shorthand for actors that expose one transformation and are inherited by a
 * method only when that method does not declare its own side of the contract.
 */
export function capabilitiesFromManifests(manifests: readonly Manifest[]): Capability[] {
	return manifests.flatMap((manifest) =>
		manifest.methods.flatMap((method) => {
			const requires = method.requires ?? manifest.requires ?? []
			const produces = method.produces ?? manifest.produces ?? []
			if (produces.length === 0) return []
			return [
				{
					id: resourceId({
						authority: manifest.authority,
						kind: 'capability',
						namespace: `${manifest.namespace}.${manifest.id}`,
						name: method.name,
						version: manifest.version
					}),
					actor: resourceId({
						authority: manifest.authority,
						kind: 'actor',
						namespace: manifest.namespace,
						name: manifest.id,
						version: manifest.version
					}),
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
	)
}

export interface PlanValue {
	predicate: Predicate
	source:
		| { kind: 'ingredient'; artifactId?: string }
		| { kind: 'step'; stepId: string; output: number }
}

export interface PlanStep {
	id: string
	capability: string
	actor: string
	method: string
	inputs: PlanValue[]
	outputs: PlanValue[]
	dependsOn: string[]
	cost: number
}

export interface AdHocProgram {
	goals: Predicate[]
	steps: PlanStep[]
	totalCost: number
	/** Final facts, including their symbolic or durable source. */
	results: PlanValue[]
}

export type SolveResult =
	| { ok: true; program: AdHocProgram; exploredStates: number }
	| { ok: false; unmetGoals: Predicate[]; exploredStates: number; reason: string }

export interface SolveOptions {
	maxSteps?: number
	maxStates?: number
}

export interface EnrichmentOptions {
	/** Predicate functors or namespace prefixes admitted by the skill. */
	factFamilies: string[]
	/** Safety guard, not a cost or effort policy. */
	maxSteps?: number
}

export type EnrichmentPlanResult =
	| { ok: true; program: AdHocProgram; exploredInvocations: number }
	| { ok: false; reason: string; exploredInvocations: number }

export type GoalThenEnrichmentPlanResult =
	| { ok: true; program: AdHocProgram; exploredInvocations: number; exploredStates: number }
	| { ok: false; reason: string; exploredInvocations: number; exploredStates: number }

interface SearchState {
	facts: PlanValue[]
	steps: PlanStep[]
	cost: number
}

export interface RequirementMatch {
	bindings: Bindings
	inputs: PlanValue[]
}

const DEFAULT_MAX_STEPS = 24
const DEFAULT_MAX_STATES = 2_000
const DEFAULT_MAX_ENRICHMENT_STEPS = 512

/**
 * Compile a goal into the cheapest program reachable from the supplied facts.
 *
 * This is uniform-cost forward search over AND/OR capabilities:
 * - every `requires` entry of one capability is an AND;
 * - multiple capabilities producing the same goal are alternatives (OR);
 * - predicate variables are bound consistently across all inputs of a step;
 * - the resulting dependency links expose which steps may run in parallel.
 *
 * The function plans only. It does not send envelopes or mutate runtime state.
 */
export function solve(
	capabilities: Capability[],
	ingredients: Ingredient[],
	goals: Predicate[],
	options: SolveOptions = {}
): SolveResult {
	const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
	const maxStates = options.maxStates ?? DEFAULT_MAX_STATES
	const start: SearchState = {
		facts: ingredients.map((ingredient) => ({
			predicate: ingredient.predicate,
			source: {
				kind: 'ingredient',
				...(ingredient.artifactId && { artifactId: ingredient.artifactId })
			}
		})),
		steps: [],
		cost: 0
	}
	const queue = [start]
	const best = new Map<string, number>()
	let exploredStates = 0

	while (queue.length > 0 && exploredStates < maxStates) {
		queue.sort(compareStates)
		const state = queue.shift()
		if (!state) break
		const key = stateKey(state)
		if ((best.get(key) ?? Number.POSITIVE_INFINITY) <= state.cost) continue
		best.set(key, state.cost)
		exploredStates++

		const results = resolveGoals(goals, state.facts)
		if (results) {
			return {
				ok: true,
				program: { goals, steps: state.steps, totalCost: state.cost, results },
				exploredStates
			}
		}
		if (state.steps.length >= maxSteps) continue

		for (const capability of [...capabilities].sort((a, b) => a.id.localeCompare(b.id))) {
			if (capability.available === false) continue
			for (const match of matchRequirements(capability.requires, state.facts)) {
				const outputPredicates = capability.produces.map((p) => substitute(p, match.bindings))
				if (outputPredicates.every((p) => state.facts.some((f) => unify(f.predicate, p)))) continue

				const stepId = `step-${state.steps.length + 1}`
				const outputs: PlanValue[] = outputPredicates.map((predicate, output) => ({
					predicate,
					source: { kind: 'step', stepId, output }
				}))
				const stepCost = capability.cost ?? 1
				const step: PlanStep = {
					id: stepId,
					capability: capability.id,
					actor: capability.actor,
					method: capability.method,
					inputs: match.inputs,
					outputs,
					dependsOn: [
						...new Set(
							match.inputs.flatMap((input) =>
								input.source.kind === 'step' ? [input.source.stepId] : []
							)
						)
					],
					cost: stepCost
				}
				queue.push({
					facts: [...state.facts, ...outputs],
					steps: [...state.steps, step],
					cost: state.cost + stepCost
				})
			}
		}
	}

	const reachable = closure(capabilities, start.facts, maxSteps)
	const unmetGoals = goals.filter((goal) => !reachable.some((fact) => unify(goal, fact.predicate)))
	return {
		ok: false,
		unmetGoals,
		exploredStates,
		reason:
			exploredStates >= maxStates
				? `search limit reached after ${maxStates} states`
				: `no program produces: ${unmetGoals.join(', ')}`
	}
}

/**
 * Plan every applicable non-effecting capability once for each distinct input binding.
 *
 * Unlike `solve`, this does not choose one cheapest proof and does not stop when a
 * predicate already exists. Independent extractors may publish the same logical fact
 * with different evidence, so both invocations remain in the program. New outputs
 * extend the fact set until no admitted capability can run with a new binding.
 */
export function planEnrichment(
	capabilities: Capability[],
	ingredients: Ingredient[],
	options: EnrichmentOptions
): EnrichmentPlanResult {
	const facts: PlanValue[] = ingredients.map((ingredient) => ({
		predicate: ingredient.predicate,
		source: {
			kind: 'ingredient',
			...(ingredient.artifactId && { artifactId: ingredient.artifactId })
		}
	}))
	return expandEnrichment(capabilities, facts, [], options, [])
}

/** Prove directed goals first, then exhaust the admitted non-effecting frontier. */
export function planGoalThenEnrichment(
	capabilities: Capability[],
	ingredients: Ingredient[],
	goals: Predicate[],
	options: EnrichmentOptions & SolveOptions
): GoalThenEnrichmentPlanResult {
	const exact = solve(capabilities, ingredients, goals, options)
	if (!exact.ok) {
		return {
			ok: false,
			reason: exact.reason,
			exploredInvocations: 0,
			exploredStates: exact.exploredStates
		}
	}
	const facts: PlanValue[] = [
		...ingredients.map((ingredient) => ({
			predicate: ingredient.predicate,
			source: {
				kind: 'ingredient' as const,
				...(ingredient.artifactId && { artifactId: ingredient.artifactId })
			}
		})),
		...exact.program.steps.flatMap((step) => step.outputs)
	]
	const enriched = expandEnrichment(capabilities, facts, exact.program.steps, options, goals)
	return enriched.ok
		? { ...enriched, exploredStates: exact.exploredStates }
		: { ...enriched, exploredStates: exact.exploredStates }
}

function expandEnrichment(
	capabilities: Capability[],
	facts: PlanValue[],
	initialSteps: PlanStep[],
	options: EnrichmentOptions,
	goals: Predicate[]
): EnrichmentPlanResult {
	const maxSteps = options.maxSteps ?? DEFAULT_MAX_ENRICHMENT_STEPS
	const steps = [...initialSteps]
	const invoked = new Set(
		initialSteps.map((step) => `${step.capability}\0${step.inputs.map(planValueKey).join('\0')}`)
	)
	const eligible = [...capabilities]
		.filter(
			(capability) =>
				capability.available !== false &&
				(capability.mode === undefined ||
					capability.mode === 'observe' ||
					capability.mode === 'transform') &&
				capability.produces.some((predicate) =>
					belongsToFactFamilies(predicate, options.factFamilies)
				)
		)
		.sort((left, right) => left.id.localeCompare(right.id))

	for (;;) {
		let changed = false
		for (const capability of eligible) {
			for (const match of matchRequirements(capability.requires, facts)) {
				if (match.inputs.some((input) => hasCapabilityInAncestry(input, capability.id, steps))) {
					continue
				}
				const invocation = invocationKey(capability, match.inputs)
				if (invoked.has(invocation)) continue
				if (steps.length >= maxSteps) {
					return {
						ok: false,
						reason: `enrichment safety limit reached after ${maxSteps} steps`,
						exploredInvocations: invoked.size
					}
				}
				invoked.add(invocation)
				const stepId = `step-${steps.length + 1}`
				const outputs: PlanValue[] = capability.produces.map((predicate, output) => ({
					predicate: substitute(predicate, match.bindings),
					source: { kind: 'step', stepId, output }
				}))
				steps.push({
					id: stepId,
					capability: capability.id,
					actor: capability.actor,
					method: capability.method,
					inputs: match.inputs,
					outputs,
					dependsOn: [
						...new Set(
							match.inputs.flatMap((input) =>
								input.source.kind === 'step' ? [input.source.stepId] : []
							)
						)
					],
					cost: capability.cost ?? 1
				})
				facts.push(...outputs)
				changed = true
			}
		}
		if (!changed) break
	}

	return {
		ok: true,
		program: {
			goals,
			steps,
			totalCost: steps.reduce((total, step) => total + step.cost, 0),
			results: facts
		},
		exploredInvocations: invoked.size
	}
}

export class RequirementSearchLimit extends Error {
	constructor() {
		super('requirement search limit reached')
	}
}

export function matchRequirements(
	requirements: Predicate[],
	facts: PlanValue[],
	options: { maxAttempts?: number; maxMatches?: number } = {}
): RequirementMatch[] {
	if (requirements.length === 0) return [{ bindings: {}, inputs: [] }]
	const matches: RequirementMatch[] = []
	let attempts = 0
	const candidates = requirements.map((requirement) => {
		const term = parseTerm(requirement)
		return facts.filter((fact) => {
			const other = parseTerm(fact.predicate)
			return other.functor === term.functor && other.args.length === term.args.length
		})
	})
	const visit = (index: number, bindings: Bindings, inputs: PlanValue[]) => {
		if (matches.length >= (options.maxMatches ?? Infinity)) return
		if (index === requirements.length) {
			matches.push({ bindings, inputs })
			return
		}
		for (const fact of candidates[index] ?? []) {
			if (matches.length >= (options.maxMatches ?? Infinity)) return
			if (++attempts > (options.maxAttempts ?? Infinity)) throw new RequirementSearchLimit()
			const next = unify(requirements[index] ?? '', fact.predicate, bindings)
			if (next) visit(index + 1, next, [...inputs, fact])
		}
	}
	visit(0, {}, [])
	return matches
}

export function substitute(predicate: Predicate, bindings: Bindings): Predicate {
	const term = parseTerm(predicate)
	if (!predicate.includes('(')) return term.functor
	return `${term.functor}(${term.args.map((arg) => resolve(arg, bindings)).join(', ')})`
}

function belongsToFactFamilies(predicate: Predicate, families: string[]): boolean {
	const name = functor(predicate)
	return families.some((family) => name === family || name.startsWith(`${family}.`))
}

function invocationKey(capability: Capability, inputs: PlanValue[]): string {
	return `${capability.id}\0${inputs.map(planValueKey).join('\0')}`
}

function planValueKey(value: PlanValue): string {
	if (value.source.kind === 'step') {
		return `${value.predicate}\0step:${value.source.stepId}:${value.source.output}`
	}
	return `${value.predicate}\0ingredient:${value.source.artifactId ?? ''}`
}

function hasCapabilityInAncestry(
	value: PlanValue,
	capabilityId: string,
	steps: PlanStep[],
	visited = new Set<string>()
): boolean {
	if (value.source.kind !== 'step' || visited.has(value.source.stepId)) return false
	const stepId = value.source.stepId
	visited.add(stepId)
	const step = steps.find((candidate) => candidate.id === stepId)
	if (!step) return false
	if (step.capability === capabilityId) return true
	return step.inputs.some((input) => hasCapabilityInAncestry(input, capabilityId, steps, visited))
}

function resolveGoals(goals: Predicate[], facts: PlanValue[]): PlanValue[] | null {
	return matchRequirements(goals, facts)[0]?.inputs ?? null
}

function stateKey(state: SearchState): string {
	return [...state.facts.map((fact) => fact.predicate)].sort().join('|')
}

function compareStates(a: SearchState, b: SearchState): number {
	return (
		a.cost - b.cost || a.steps.length - b.steps.length || stateKey(a).localeCompare(stateKey(b))
	)
}

/** A cheap reachability pass used only to make failure diagnostics useful. */
function closure(capabilities: Capability[], initial: PlanValue[], maxSteps: number): PlanValue[] {
	let facts = [...initial]
	for (let pass = 0; pass < maxSteps; pass++) {
		let changed = false
		for (const capability of capabilities) {
			if (capability.available === false) continue
			const match = matchRequirements(capability.requires, facts)[0]
			if (!match) continue
			for (const predicate of capability.produces.map((p) => substitute(p, match.bindings))) {
				if (facts.some((fact) => unify(fact.predicate, predicate))) continue
				facts = [
					...facts,
					{ predicate, source: { kind: 'step', stepId: `closure-${capability.id}`, output: 0 } }
				]
				changed = true
			}
		}
		if (!changed) break
	}
	return facts
}
