import {
	ACTOR_RUN_PROTOCOL,
	createActorPlanExecutor,
	type PlanRunStartRequest,
	resourceId
} from '@avenos/actors'
import { describe, expect, test } from 'vitest'
import { createServerActorExecutionHost } from '../src/host.js'

const PRESENT = 'os.aven.testing.present(fixture_1)'

function request(
	executionEnvironment: PlanRunStartRequest['executionEnvironment'] = 'server'
): PlanRunStartRequest {
	const now = new Date().toISOString()
	return {
		protocol: ACTOR_RUN_PROTOCOL,
		requestId: crypto.randomUUID(),
		idempotencyKey: crypto.randomUUID(),
		requestedAt: now,
		skillRef: resourceId({
			authority: 'ceo.aven',
			kind: 'skill',
			namespace: 'testing.runtime',
			name: 'host-composition',
			version: '1'
		}),
		executionEnvironment,
		ingredients: [{ predicate: PRESENT, artifactId: crypto.randomUUID() }],
		goals: [PRESENT],
		parameters: {},
		security: {
			principal: { subjectId: crypto.randomUUID(), kind: 'user', assurance: ['passkey'] },
			access: { tenantId: crypto.randomUUID(), entitlements: [] },
			establishedBy: 'test',
			authorizedAt: now
		}
	}
}

describe('server Actor execution host composition', () => {
	test('executes an already-satisfied zero-step program through the generic planner', async () => {
		const execute = createActorPlanExecutor(createServerActorExecutionHost())

		await expect(execute(request())).resolves.toEqual({
			artifactIds: [],
			completedStepIds: [],
			remainingGoals: [],
			registryRevision: 0,
			policyDecisionIds: []
		})
	})

	test('fails closed when the host has no authorized capability for a goal', async () => {
		const execute = createActorPlanExecutor(createServerActorExecutionHost())
		const command = request()
		command.goals = ['os.aven.testing.unavailable(fixture_1)']

		await expect(execute(command)).rejects.toThrow()
	})

	test('rejects a placement that does not belong to the host', async () => {
		const execute = createActorPlanExecutor(createServerActorExecutionHost())

		await expect(execute(request('local'))).rejects.toThrow(
			'server execution host cannot run local placement'
		)
	})
})
