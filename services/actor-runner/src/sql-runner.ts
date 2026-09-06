import { createHash, randomUUID } from 'node:crypto'
import {
	assertPlanRunTransition,
	type PlanRunCheckpoint,
	type PlanRunContinuation,
	type PlanRunContinuationSubmission,
	type PlanRunExecutionContext,
	type PlanRunExecutionResult,
	type PlanRunExecutor,
	type PlanRunHandle,
	type PlanRunner,
	type PlanRunRecord,
	type PlanRunStartRequest,
	portableRunClone
} from '@avenos/actors/run'
import type pg from 'pg'

export class PlanRunConflict extends Error {}

const handle = (record: PlanRunRecord): PlanRunHandle => ({
	runId: record.runId,
	revision: record.revision,
	state: record.state,
	executionEnvironment: record.executionEnvironment
})

const stableJson = (value: unknown): string => {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
		.join(',')}}`
}

const materialHash = (request: PlanRunStartRequest): string =>
	createHash('sha256')
		.update(
			stableJson({
				protocol: request.protocol,
				skillRef: request.skillRef,
				executionEnvironment: request.executionEnvironment,
				ingredients: request.ingredients,
				goals: request.goals,
				...(request.goalSpec && { goalSpec: request.goalSpec }),
				parameters: request.parameters
			})
		)
		.digest('hex')

export class SqlPlanRunner implements PlanRunner {
	constructor(
		private readonly api: pg.Pool,
		private readonly worker: pg.Pool,
		private readonly executor: PlanRunExecutor
	) {}

	async start(
		request: PlanRunStartRequest,
		context?: PlanRunExecutionContext
	): Promise<PlanRunHandle> {
		const admitted = portableRunClone(request)
		if (admitted.executionEnvironment !== 'server')
			throw new Error('the server runner accepts only server placement')
		const hash = materialHash(admitted)
		const now = new Date().toISOString()
		const record: PlanRunRecord = {
			protocol: admitted.protocol,
			runId: randomUUID(),
			revision: 1,
			state: 'accepted',
			executionEnvironment: admitted.executionEnvironment,
			requestId: admitted.requestId,
			idempotencyKey: admitted.idempotencyKey,
			requestedAt: admitted.requestedAt,
			skillRef: admitted.skillRef,
			security: admitted.security,
			createdAt: now,
			updatedAt: now,
			ingredients: admitted.ingredients,
			goals: admitted.goals,
			...(admitted.goalSpec && { goalSpec: admitted.goalSpec }),
			parameters: admitted.parameters,
			checkpoints: [],
			continuations: []
		}
		const inserted = await this.api.query(
			`INSERT INTO runs(id,subject_id,idempotency_key,material_hash,state,revision,record)
			 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(subject_id,idempotency_key) DO NOTHING`,
			[
				record.runId,
				admitted.security.principal.subjectId,
				admitted.idempotencyKey,
				hash,
				record.state,
				record.revision,
				record
			]
		)
		if (!inserted.rowCount) {
			const prior = (
				await this.api.query<{ material_hash: string; record: PlanRunRecord }>(
					'SELECT material_hash,record FROM runs WHERE subject_id=$1 AND idempotency_key=$2',
					[admitted.security.principal.subjectId, admitted.idempotencyKey]
				)
			).rows[0]
			if (!prior || prior.material_hash !== hash)
				throw new PlanRunConflict('the idempotency key is already bound to another command')
			return portableRunClone(handle(prior.record))
		}
		queueMicrotask(() => void this.execute(record.runId, context).catch(() => {}))
		return portableRunClone(handle(record))
	}

	async status(runId: string): Promise<PlanRunRecord | null> {
		const row = (
			await this.api.query<{ record: PlanRunRecord }>('SELECT record FROM runs WHERE id=$1', [
				runId
			])
		).rows[0]
		return row ? portableRunClone(row.record) : null
	}

	/** Resume work that was durably admitted before this runner process started. */
	async recoverAcceptedRuns(): Promise<number> {
		const accepted = await this.worker.query<{ id: string }>(
			`SELECT id FROM runs WHERE state='accepted' ORDER BY created_at,id`
		)
		let recovered = 0
		for (const { id } of accepted.rows) {
			if (await this.execute(id)) recovered += 1
		}
		return recovered
	}

	async resume(
		runId: string,
		submission: PlanRunContinuationSubmission,
		context?: PlanRunExecutionContext
	): Promise<PlanRunHandle> {
		portableRunClone(submission)
		const row = (
			await this.worker.query<{ record: PlanRunRecord }>(
				`SELECT record FROM runs WHERE id=$1 AND state='waiting_for_input'`,
				[runId]
			)
		).rows[0]
		if (!row) throw new Error('the run is not waiting for input')
		const record = row.record
		const expectedRevision = record.revision
		const continuation = requiredContinuation(record, submission.continuationId)
		if (submission.action === 'postpone') {
			continuation.state = 'postponed'
			record.revision += 1
			record.updatedAt = new Date().toISOString()
			await this.#replaceWaiting(record, expectedRevision)
			return portableRunClone(handle(record))
		}
		if (submission.kind !== continuation.kind) throw new Error('continuation kind mismatch')
		try {
			assertPlanRunTransition(record.state, 'running')
			const result = await this.executor(this.#request(record), { ...context, submission })
			this.#applyResult(record, result, continuation)
		} catch (error) {
			record.state = 'failed'
			record.failure = {
				code: 'EXECUTION_FAILED',
				message:
					continuation.kind === 'secret'
						? 'Secret continuation execution failed.'
						: error instanceof Error
							? error.message
							: String(error),
				retryable: false
			}
		}
		record.revision += 1
		record.updatedAt = new Date().toISOString()
		await this.#replaceWaiting(record, expectedRevision)
		return portableRunClone(handle(record))
	}

	async cancel(runId: string, _requestId: string): Promise<PlanRunHandle> {
		const record = await this.status(runId)
		if (!record) throw new Error('run not found')
		if (record.state === 'cancelled') return handle(record)
		assertPlanRunTransition(record.state, 'cancelled')
		record.state = 'cancelled'
		record.revision += 1
		record.updatedAt = new Date().toISOString()
		const updated = await this.api.query(
			`UPDATE runs SET state=$2,revision=$3,record=$4,updated_at=clock_timestamp()
			 WHERE id=$1 AND revision=$5`,
			[runId, record.state, record.revision, record, record.revision - 1]
		)
		if (!updated.rowCount) throw new PlanRunConflict('the actor run changed concurrently')
		return portableRunClone(handle(record))
	}

	private async execute(runId: string, context?: PlanRunExecutionContext): Promise<boolean> {
		const connection = await this.worker.connect()
		let claimed = false
		try {
			claimed =
				(
					await connection.query<{ claimed: boolean }>(
						`SELECT pg_try_advisory_lock(hashtext('aven_actor_run'),hashtext($1)) AS claimed`,
						[runId]
					)
				).rows[0]?.claimed === true
			if (!claimed) return false
			const row = (
				await connection.query<{ record: PlanRunRecord }>(
					`SELECT record FROM runs WHERE id=$1 AND state='accepted'`,
					[runId]
				)
			).rows[0]
			if (!row) return false
			const record = row.record
			try {
				const result = await this.executor(this.#request(record), {
					...context,
					reportProgress: async (progress) => {
						record.progress = portableRunClone(progress)
						record.revision += 1
						record.updatedAt = new Date().toISOString()
						const saved = await connection.query(
							`UPDATE runs SET revision=$2,record=$3,updated_at=clock_timestamp()
							 WHERE id=$1 AND state='accepted'`,
							[runId, record.revision, record]
						)
						if (!saved.rowCount) throw new PlanRunConflict('the actor run is no longer active')
					}
				})
				this.#applyResult(record, result)
			} catch (error) {
				record.state = 'failed'
				record.failure = {
					code: 'EXECUTION_FAILED',
					message: error instanceof Error ? error.message : String(error),
					retryable: false
				}
			}
			record.revision += 1
			record.updatedAt = new Date().toISOString()
			const updated = await connection.query(
				`UPDATE runs SET state=$2,revision=$3,record=$4,updated_at=clock_timestamp()
				 WHERE id=$1 AND state='accepted'`,
				[runId, record.state, record.revision, record]
			)
			return Boolean(updated.rowCount)
		} finally {
			try {
				if (claimed) {
					await connection.query(
						`SELECT pg_advisory_unlock(hashtext('aven_actor_run'),hashtext($1))`,
						[runId]
					)
				}
			} finally {
				connection.release()
			}
		}
	}

	#request(record: PlanRunRecord): PlanRunStartRequest {
		return portableRunClone({
			protocol: record.protocol,
			requestId: record.requestId,
			idempotencyKey: record.idempotencyKey,
			requestedAt: record.requestedAt,
			skillRef: record.skillRef,
			executionEnvironment: record.executionEnvironment,
			ingredients: record.ingredients,
			goals: record.goals,
			...(record.goalSpec && { goalSpec: record.goalSpec }),
			parameters: record.parameters,
			security: record.security
		})
	}

	#applyResult(
		record: PlanRunRecord,
		result: PlanRunExecutionResult,
		resolved?: PlanRunContinuation
	): void {
		const remainingGoals = result.remainingGoals ?? []
		if (result.continuation) {
			assertContinuation(result.continuation)
			if (remainingGoals.length === 0) {
				throw new Error('a continuation must retain at least one unfinished goal')
			}
			if (resolved && resolved.continuationId !== result.continuation.continuationId) {
				resolved.state = 'resolved'
			}
			upsertContinuation(record, result.continuation)
			record.state = 'waiting_for_input'
		} else {
			if (remainingGoals.length > 0) {
				throw new Error(`executor left unmet goals: ${remainingGoals.join(', ')}`)
			}
			if (resolved) resolved.state = 'resolved'
			record.state = 'succeeded'
		}
		record.checkpoints.push(checkpoint(record, result))
	}

	async #replaceWaiting(record: PlanRunRecord, expectedRevision: number): Promise<void> {
		const updated = await this.worker.query(
			`UPDATE runs SET state=$2,revision=$3,record=$4,updated_at=clock_timestamp()
			 WHERE id=$1 AND state='waiting_for_input' AND revision=$5`,
			[record.runId, record.state, record.revision, record, expectedRevision]
		)
		if (!updated.rowCount) throw new PlanRunConflict('the actor run changed concurrently')
	}
}

function requiredContinuation(record: PlanRunRecord, continuationId: string): PlanRunContinuation {
	const continuation = record.continuations.find(
		(candidate) =>
			candidate.continuationId === continuationId &&
			(candidate.state === 'open' || candidate.state === 'postponed')
	)
	if (!continuation) throw new Error('continuation is not open')
	return continuation
}

function assertContinuation(continuation: PlanRunContinuation): void {
	portableRunClone(continuation)
	if (continuation.state !== 'open') throw new Error('executor continuation must be open')
	if (continuation.kind === 'secret' && continuation.persistence !== 'metadata-only') {
		throw new Error('secret continuation metadata cannot request artifact persistence')
	}
}

function upsertContinuation(record: PlanRunRecord, continuation: PlanRunContinuation): void {
	const index = record.continuations.findIndex(
		(candidate) => candidate.continuationId === continuation.continuationId
	)
	const persisted = portableRunClone(continuation)
	if (index < 0) record.continuations.push(persisted)
	else record.continuations[index] = persisted
}

function checkpoint(record: PlanRunRecord, result: PlanRunExecutionResult): PlanRunCheckpoint {
	if (result.output) portableRunClone(result.output)
	return {
		checkpointId: randomUUID(),
		ordinal: record.checkpoints.length,
		committedAt: new Date().toISOString(),
		completedStepIds: [...(result.completedStepIds ?? [])],
		artifactIds: [...(result.artifactIds ?? [])],
		remainingGoals: [...(result.remainingGoals ?? [])],
		registryRevision: result.registryRevision ?? 0,
		policyDecisionIds: [...(result.policyDecisionIds ?? [])],
		...(result.output && { output: portableRunClone(result.output) })
	}
}
