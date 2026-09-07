import type { PlanRunExecutionResult, PlanRunStartRequest } from '@avenos/actors/run'

export type {
	PlanRunExecutionContext,
	PlanRunExecutionResult,
	PlanRunExecutor
} from '@avenos/actors/run'

/** Minimal zero-step reference used by protocol tests; production SQL hosts inject an executor. */
export async function executeAlreadySatisfied(
	request: PlanRunStartRequest
): Promise<PlanRunExecutionResult> {
	const facts = new Set(request.ingredients.map((ingredient) => ingredient.predicate))
	const remainingGoals = request.goals.filter((goal) => !facts.has(goal))
	if (remainingGoals.length > 0) {
		throw new Error('no actor executor is registered for the requested goal')
	}
	return { remainingGoals: [] }
}
