import type { PlanRunExecutor } from '@avenos/actors'

/** One application-owned skill implementation installed into the generic runner. */
export interface ApplicationSkillExecutor {
	readonly skillRef: string
	readonly execute: PlanRunExecutor
}

/**
 * Route admitted commands by application skill, retaining the generic actor
 * planner as the fail-closed fallback. The repository and HTTP protocol remain
 * application-neutral; only this composition root knows installed skills.
 */
export function createApplicationExecutor(
	applications: readonly ApplicationSkillExecutor[],
	fallback: PlanRunExecutor
): PlanRunExecutor {
	const bySkill = new Map(
		applications.map((application) => [application.skillRef, application.execute])
	)
	if (bySkill.size !== applications.length)
		throw new Error('application skill executors must be unique')
	return (request, context) => (bySkill.get(request.skillRef) ?? fallback)(request, context)
}
