import { randomUUID } from 'node:crypto'
import { ACTOR_RUN_PROTOCOL, type PlanRunRecord, resourceId } from '@avenos/actors'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { executeAlreadySatisfied } from '../src/execution.js'
import { SqlPlanRunner } from '../src/sql-runner.js'
import {
	deterministicExecutionHarness,
	deterministicRunRequest,
	deterministicSecretExecutor,
	SECRET_CONTINUATION_ID,
	secretContinuationRunRequest
} from './support/deterministic-execution.js'

const databaseUrl = process.env.TEST_ACTOR_RUNNER_DATABASE_URL
const describeWithPostgres = databaseUrl ? describe : describe.skip
const schema = `actor_runner_e2e_${randomUUID().replaceAll('-', '')}`
let admin: pg.Pool

describeWithPostgres('SQL runner persistence', () => {
	beforeAll(async () => {
		admin = new pg.Pool({ connectionString: databaseUrl, max: 1 })
		await admin.query(`CREATE SCHEMA ${schema}`)
		await admin.query(`
			CREATE TABLE ${schema}.runs (
				id uuid PRIMARY KEY,
				subject_id uuid NOT NULL,
				idempotency_key text NOT NULL,
				material_hash text NOT NULL,
				state text NOT NULL,
				revision bigint NOT NULL,
				record jsonb NOT NULL,
				created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
				updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
				UNIQUE(subject_id,idempotency_key)
			)
		`)
	})

	afterAll(async () => {
		if (!admin) return
		await admin.query(`DROP SCHEMA ${schema} CASCADE`)
		await admin.end()
	})

	test('publishes progress before completion without adding a replay checkpoint', async () => {
		const pool = new pg.Pool({
			connectionString: databaseUrl,
			max: 2,
			options: `-c search_path=${schema},pg_catalog`
		})
		let release = () => {}
		const pending = new Promise<void>((resolve) => {
			release = resolve
		})
		let observed = () => {}
		const reported = new Promise<void>((resolve) => {
			observed = resolve
		})
		const runner = new SqlPlanRunner(pool, pool, async (_request, context) => {
			await context!.reportProgress!({ phase: 'waiting-for-model', attempt: 1 })
			observed()
			await pending
			return { remainingGoals: [] }
		})
		try {
			const handle = await runner.start(
				deterministicRunRequest('server', randomUUID(), randomUUID())
			)
			await reported
			const progress = await runner.status(handle.runId)
			expect(progress).toMatchObject({
				state: 'accepted',
				revision: 2,
				checkpoints: [],
				progress: { phase: 'waiting-for-model', attempt: 1 }
			})
			release()
			expect(await terminalRecord(runner, handle.runId)).toMatchObject({
				state: 'succeeded',
				revision: 3
			})
		} finally {
			release()
			await pool.end()
		}
	}, 5_000)

	test('a fresh runner reclaims a committed accepted run', async () => {
		const firstProcess = new pg.Pool({
			connectionString: databaseUrl,
			max: 1,
			options: `-c search_path=${schema},pg_catalog`
		})
		const runId = randomUUID()
		const subjectId = randomUUID()
		const now = new Date().toISOString()
		const record: PlanRunRecord = {
			protocol: ACTOR_RUN_PROTOCOL,
			runId,
			revision: 1,
			state: 'accepted',
			executionEnvironment: 'server',
			requestId: randomUUID(),
			idempotencyKey: randomUUID(),
			requestedAt: now,
			skillRef: resourceId({
				authority: 'ceo.aven',
				kind: 'skill',
				namespace: 'e2e',
				name: 'persistence',
				version: '1'
			}),
			security: {
				principal: {
					subjectId,
					kind: 'user',
					assurance: ['passkey'],
					sessionId: randomUUID()
				},
				access: { tenantId: randomUUID() },
				establishedBy: 'api.aven.ceo/actor-runner-boundary',
				authorizedAt: now
			},
			createdAt: now,
			updatedAt: now,
			ingredients: [{ predicate: 'ceo.aven.e2e.done(persistence)' }],
			goals: ['ceo.aven.e2e.done(persistence)'],
			parameters: {},
			checkpoints: [],
			continuations: []
		}

		await firstProcess.query(
			`INSERT INTO runs(id,subject_id,idempotency_key,material_hash,state,revision,record)
			 VALUES($1,$2,$3,$4,'accepted',1,$5)`,
			[runId, subjectId, record.idempotencyKey, 'e2e-crash-window', record]
		)
		await firstProcess.end()

		const secondProcess = new pg.Pool({
			connectionString: databaseUrl,
			max: 1,
			options: `-c search_path=${schema},pg_catalog`
		})
		try {
			const runner = new SqlPlanRunner(secondProcess, secondProcess, executeAlreadySatisfied)
			expect((await runner.status(runId))?.state).toBe('accepted')
			expect(await runner.recoverAcceptedRuns()).toBe(1)
			expect(await runner.status(runId)).toMatchObject({
				runId,
				state: 'succeeded',
				revision: 2,
				checkpoints: [
					expect.objectContaining({
						ordinal: 0,
						remainingGoals: []
					})
				]
			})
			expect(await runner.recoverAcceptedRuns()).toBe(0)
		} finally {
			await secondProcess.end()
		}
	})

	test('concurrent recovery claims an accepted run only once', async () => {
		const pool = new pg.Pool({
			connectionString: databaseUrl,
			max: 4,
			options: `-c search_path=${schema},pg_catalog`
		})
		let executions = 0
		let releaseExecution = () => {}
		const executionReleased = new Promise<void>((resolve) => {
			releaseExecution = resolve
		})
		const executor = async () => {
			executions += 1
			await executionReleased
			return { remainingGoals: [] }
		}
		const request = deterministicRunRequest('server', randomUUID(), randomUUID())
		const runId = randomUUID()
		const now = new Date().toISOString()
		const record: PlanRunRecord = {
			...request,
			runId,
			revision: 1,
			state: 'accepted',
			createdAt: now,
			updatedAt: now,
			checkpoints: [],
			continuations: []
		}
		try {
			await pool.query(
				`INSERT INTO runs(id,subject_id,idempotency_key,material_hash,state,revision,record)
				 VALUES($1,$2,$3,$4,'accepted',1,$5)`,
				[
					runId,
					request.security.principal.subjectId,
					request.idempotencyKey,
					'concurrent-recovery',
					record
				]
			)
			const first = new SqlPlanRunner(pool, pool, executor)
			const second = new SqlPlanRunner(pool, pool, executor)
			const recoveries = Promise.all([first.recoverAcceptedRuns(), second.recoverAcceptedRuns()])
			const deadline = Date.now() + 2_000
			while (executions === 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
			expect(executions).toBe(1)
			await new Promise((resolve) => setTimeout(resolve, 50))
			expect(executions).toBe(1)
			releaseExecution()
			expect((await recoveries).sort()).toEqual([0, 1])
			expect(await first.status(runId)).toMatchObject({
				state: 'succeeded',
				revision: 2,
				checkpoints: [expect.objectContaining({ ordinal: 0 })]
			})
		} finally {
			releaseExecution()
			await pool.end()
		}
	})

	test('persists a deterministic generic execution and matches the local outcome', async () => {
		const pool = new pg.Pool({
			connectionString: databaseUrl,
			max: 2,
			options: `-c search_path=${schema},pg_catalog`
		})
		const subjectId = randomUUID()
		const tenantId = randomUUID()
		const local = deterministicExecutionHarness('local')
		const server = deterministicExecutionHarness('server')
		const base = deterministicRunRequest('local', subjectId, tenantId)
		try {
			const localExecution = await local.execute(base)
			const runner = new SqlPlanRunner(pool, pool, server.execute)
			const started = await runner.start({
				...base,
				executionEnvironment: 'server',
				requestId: randomUUID(),
				idempotencyKey: `server-${randomUUID()}`
			})
			const record = await terminalRecord(runner, started.runId)

			expect(record).toMatchObject({
				state: 'succeeded',
				executionEnvironment: 'server',
				requestedAt: base.requestedAt,
				checkpoints: [
					expect.objectContaining({
						completedStepIds: ['step-1'],
						artifactIds: server.artifacts().map((artifact) => artifact.artifactId),
						remainingGoals: [],
						registryRevision: server.registryRevision()
					})
				]
			})
			expect(record.checkpoints[0]?.policyDecisionIds).toHaveLength(3)
			expect(server.canonicalManifest()).toEqual(local.canonicalManifest())
			expect(localExecution.remainingGoals).toEqual([])
			expect(server.spawned()).toBe(1)
			expect(server.released()).toBe(1)
		} finally {
			await pool.end()
		}
	})

	test('survives replacement, postpones, and resumes without persisting a secret', async () => {
		const firstPool = new pg.Pool({
			connectionString: databaseUrl,
			max: 1,
			options: `-c search_path=${schema},pg_catalog`
		})
		const request = secretContinuationRunRequest(randomUUID(), randomUUID())
		const firstRunner = new SqlPlanRunner(firstPool, firstPool, deterministicSecretExecutor)
		const started = await firstRunner.start(request)
		await recordInState(firstRunner, started.runId, 'waiting_for_input')
		await firstPool.end()

		const replacementPool = new pg.Pool({
			connectionString: databaseUrl,
			max: 1,
			options: `-c search_path=${schema},pg_catalog`
		})
		try {
			const replacement = new SqlPlanRunner(
				replacementPool,
				replacementPool,
				deterministicSecretExecutor
			)
			await replacement.resume(started.runId, {
				requestId: randomUUID(),
				continuationId: SECRET_CONTINUATION_ID,
				action: 'postpone'
			})
			expect(await replacement.status(started.runId)).toMatchObject({
				state: 'waiting_for_input',
				continuations: [{ continuationId: SECRET_CONTINUATION_ID, state: 'postponed' }]
			})

			await replacement.resume(started.runId, {
				requestId: randomUUID(),
				continuationId: SECRET_CONTINUATION_ID,
				action: 'submit',
				kind: 'secret',
				value: 'correct horse battery staple'
			})
			const record = await replacement.status(started.runId)
			expect(record).toMatchObject({
				state: 'succeeded',
				continuations: [{ continuationId: SECRET_CONTINUATION_ID, state: 'resolved' }],
				checkpoints: [
					expect.objectContaining({ completedStepIds: [], remainingGoals: request.goals }),
					expect.objectContaining({ completedStepIds: ['unlock-step'], remainingGoals: [] })
				]
			})
			expect(JSON.stringify(record)).not.toContain('correct horse battery staple')
			const stored = (
				await replacementPool.query<{ record: PlanRunRecord }>(
					'SELECT record FROM runs WHERE id=$1',
					[started.runId]
				)
			).rows[0]?.record
			expect(JSON.stringify(stored)).not.toContain('correct horse battery staple')
		} finally {
			await replacementPool.end()
		}
	})
})

async function terminalRecord(runner: SqlPlanRunner, runId: string): Promise<PlanRunRecord> {
	const deadline = Date.now() + 5_000
	while (Date.now() < deadline) {
		const record = await runner.status(runId)
		if (record && ['succeeded', 'failed', 'cancelled'].includes(record.state)) return record
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`run ${runId} did not reach a terminal state`)
}

async function recordInState(
	runner: SqlPlanRunner,
	runId: string,
	state: PlanRunRecord['state']
): Promise<PlanRunRecord> {
	const deadline = Date.now() + 5_000
	while (Date.now() < deadline) {
		const record = await runner.status(runId)
		if (record?.state === state) return record
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`run ${runId} did not reach ${state}`)
}
