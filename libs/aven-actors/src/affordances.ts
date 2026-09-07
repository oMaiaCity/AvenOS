import type { Predicate } from './actor'
import {
	type Capability,
	type Ingredient,
	matchRequirements,
	type PlanValue,
	solve,
	substitute
} from './planner'

/** A useful next operation exposed by an application skill catalog. */
export interface AffordanceDefinition {
	id: string
	label: string
	description: string
	requires: Predicate[]
	goals: Predicate[]
	effect: 'none' | 'prepare' | 'commit'
}

/** A grounded action for which both facts and an executable route exist. */
export interface AvailableAffordance {
	id: string
	label: string
	description: string
	goals: Predicate[]
	effect: AffordanceDefinition['effect']
	ingredients: Ingredient[]
}

/**
 * Resolve application actions from supported facts without executing them.
 *
 * Definitions provide the human-facing product vocabulary. Capability contracts
 * remain authoritative for whether the proposed goals have an executable route.
 */
export function discoverAffordances(
	definitions: AffordanceDefinition[],
	facts: Ingredient[],
	capabilities: Capability[]
): AvailableAffordance[] {
	const values = facts.map(ingredientValue)
	const available = new Map<string, AvailableAffordance>()
	for (const definition of [...definitions].sort((left, right) =>
		left.id.localeCompare(right.id)
	)) {
		for (const match of matchRequirements(definition.requires, values)) {
			const goals = definition.goals.map((goal) => substitute(goal, match.bindings))
			if (!solve(capabilities, facts, goals).ok) continue
			const ingredients = match.inputs.flatMap((input) => {
				if (input.source.kind !== 'ingredient' || !input.source.artifactId) return []
				return [{ predicate: input.predicate, artifactId: input.source.artifactId }]
			})
			const key = `${definition.id}\0${goals.join('\0')}`
			if (available.has(key)) continue
			available.set(key, {
				id: definition.id,
				label: definition.label,
				description: definition.description,
				goals,
				effect: definition.effect,
				ingredients
			})
		}
	}
	return [...available.values()]
}

function ingredientValue(ingredient: Ingredient): PlanValue {
	return {
		predicate: ingredient.predicate,
		source: {
			kind: 'ingredient',
			...(ingredient.artifactId && { artifactId: ingredient.artifactId })
		}
	}
}
