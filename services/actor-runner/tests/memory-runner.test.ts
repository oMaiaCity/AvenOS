import { ACTOR_RUN_PROTOCOL, type PlanRunStartRequest, resourceId } from '@avenos/actors'
import { describe, expect, test } from 'vitest'
import { MemoryPlanRunner, PlanRunConflict } from '../src/memory-runner.js'
import {
	deterministicSecretExecutor,
	SECRET_CONTINUATION_ID,
	secretContinuationRunRequest
} from './support/deterministic-execution.js'

const request = (): PlanRunStartRequest => ({
	protocol: ACTOR_RUN_PROTOCOL,
	requestId: crypto.randomUUID(),
	idempotencyKey: 'stable-start-key',
	requestedAt: new Date().toISOString(),
	skillRef: resourceId({
		authority: 'ceo.aven',
		kind: 'skill',
		namespace: 'docs.ingest',
		name: 'document-ingest',
		version: '1'
	}),
	executionEnvironment: 'server',
	ingredients: [{ predicate: 'ceo.aven.docs.document(document_1)' }],
	goals: ['ceo.aven.docs.document(document_1)'],
	parameters: {},
	security: {
		principal: {
			subjectId: '3f7b0f1e-7850-4902-a7b0-093f8604a0dd',
			kind: 'user',
			assurance: ['passkey'],
			sessionId: 'session-1'
		},
		access: {},
		establishedBy: 'test',
		authorizedAt: new Date().toISOString()
	}
})

describe('memory plan runner protocol reference', () => {
	test('delivers live session proof to one attempt without persisting it', async () => {
		let observedToken: string | undefined
		const runner = new MemoryPlanRunner(async (_request, context) => {
			observedToken = context?.session?.identityToken
			return { remainingGoals: [] }
		})
		const started = await runner.start(request(), {
			session: { identityToken: 'ephemeral.identity.jwt', sessionId: 'session-1' }
		})
		const record = await waitForState(runner, started.runId, 'succeeded')

		expect(observedToken).toBe('ephemeral.identity.jwt')
		expect(JSON.stringify(record)).not.toContain('ephemeral.identity.jwt')
	})

	test('replays one logical start while allowing a new request attempt ID', async () => {
		const runner = new MemoryPlanRunner()
		const firstRequest = { ...request(), parameters: { quality: 'standard', locale: 'de' } }
		const first = await runner.start(firstRequest)
		const replay = await runner.start({
			...request(),
			parameters: { locale: 'de', quality: 'standard' }
		})
		expect(replay.runId).toBe(first.runId)
	})

	test('does not let an idempotency key change its material command', async () => {
		const runner = new MemoryPlanRunner()
		await runner.start(request())
		await expect(
			runner.start({
				...request(),
				goals: ['ceo.aven.docs.content_description(document_1)']
			})
		).rejects.toBeInstanceOf(PlanRunConflict)
	})

	test('postpones and resolves a secret continuation without persisting its value', async () => {
		const runner = new MemoryPlanRunner(deterministicSecretExecutor)
		const started = await runner.start(
			secretContinuationRunRequest(
				'3f7b0f1e-7850-4902-a7b0-093f8604a0dd',
				'99999999-9999-4999-8999-999999999999'
			)
		)
		await waitForState(runner, started.runId, 'waiting_for_input')

		await runner.resume(started.runId, {
			requestId: crypto.randomUUID(),
			continuationId: SECRET_CONTINUATION_ID,
			action: 'postpone'
		})
		expect(await runner.status(started.runId)).toMatchObject({
			state: 'waiting_for_input',
			continuations: [{ continuationId: SECRET_CONTINUATION_ID, state: 'postponed' }]
		})
		await runner.resume(started.runId, {
			requestId: crypto.randomUUID(),
			continuationId: SECRET_CONTINUATION_ID,
			action: 'submit',
			kind: 'secret',
			value: 'wrong password'
		})
		expect(await runner.status(started.runId)).toMatchObject({
			state: 'waiting_for_input',
			continuations: [
				{
					continuationId: SECRET_CONTINUATION_ID,
					state: 'open',
					prompt: 'That password did not unlock the fixture. Try again.'
				}
			]
		})

		await runner.resume(started.runId, {
			requestId: crypto.randomUUID(),
			continuationId: SECRET_CONTINUATION_ID,
			action: 'submit',
			kind: 'secret',
			value: 'correct horse battery staple'
		})
		const record = await runner.status(started.runId)
		expect(record).toMatchObject({
			state: 'succeeded',
			continuations: [{ continuationId: SECRET_CONTINUATION_ID, state: 'resolved' }],
			checkpoints: [
				expect.objectContaining({
					completedStepIds: [],
					remainingGoals: ['os.aven.testing.secret_unlocked(fixture_1)']
				}),
				expect.objectContaining({
					completedStepIds: [],
					remainingGoals: ['os.aven.testing.secret_unlocked(fixture_1)']
				}),
				expect.objectContaining({ completedStepIds: ['unlock-step'], remainingGoals: [] })
			]
		})
		expect(JSON.stringify(record)).not.toContain('correct horse battery staple')
		expect(JSON.stringify(record)).not.toContain('wrong password')
	})
})

async function waitForState(
	runner: MemoryPlanRunner,
	runId: string,
	state: 'waiting_for_input' | 'succeeded'
) {
	const deadline = Date.now() + 2_000
	while (Date.now() < deadline) {
		const record = await runner.status(runId)
		if (record?.state === state) return record
		await new Promise((resolve) => setTimeout(resolve, 2))
	}
	throw new Error(`run ${runId} did not reach ${state}`)
}
