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
import { executeAlreadySatisfied } from './execution.js'

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
	const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
		left.localeCompare(right)
	)
	return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}

const materialCommand = (request: PlanRunStartRequest): string =>
	stableJson({
		protocol: request.protocol,
		skillRef: request.skillRef,
		executionEnvironment: request.executionEnvironment,
		ingredients: request.ingredients,
		goals: request.goals,
		...(request.goalSpec && { goalSpec: request.goalSpec }),
		parameters: request.parameters
	})

/**
 * Process-local reference runner for development and boundary tests.
 *
 * It implements protocol semantics and asynchronous execution, but deliberately
 * does not pretend to be the durable SQL repository specified for production.
 */
export class MemoryPlanRunner implements PlanRunner {
	readonly #records = new Map<string, PlanRunRecord>()
	readonly #idempotency = new Map<string, { runId: string; material: string }>()

	constructor(private readonly execute: PlanRunExecutor = executeAlreadySatisfied) {}

	async start(
		request: PlanRunStartRequest,
		context?: PlanRunExecutionContext
	): Promise<PlanRunHandle> {
		const admitted = portableRunClone(request)
		if (admitted.executionEnvironment !== 'server') {
			throw new Error('the server runner accepts only server placement')
		}
		const key = `${admitted.security.principal.subjectId}\0${admitted.security.access.tenantId ?? ''}\0${admitted.skillRef}\0${admitted.idempotencyKey}`
		const material = materialCommand(admitted)
		const previous = this.#idempotency.get(key)
		if (previous) {
			if (previous.material !== material) {
				throw new PlanRunConflict('the idempotency key is already bound to another command')
			}
			const record = this.#records.get(previous.runId)
			if (!record) throw new Error('the idempotency index references a missing run')
			return portableRunClone(handle(record))
		}

		const now = new Date().toISOString()
		const record: PlanRunRecord = {
			protocol: admitted.protocol,
			runId: crypto.randomUUID(),
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
		this.#records.set(record.runId, record)
		this.#idempotency.set(key, { runId: record.runId, material })
		queueMicrotask(() => void this.#run(record.runId, admitted, context))
		return portableRunClone(handle(record))
	}

	async status(runId: string): Promise<PlanRunRecord | null> {
		const record = this.#records.get(runId)
		return record ? portableRunClone(record) : null
	}

	async resume(
		runId: string,
		submission: PlanRunContinuationSubmission,
		context?: PlanRunExecutionContext
	): Promise<PlanRunHandle> {
		const record = this.#required(runId)
		if (record.state !== 'waiting_for_input') throw new Error('the run is not waiting for input')
		const continuation = requiredContinuation(record, submission.continuationId)
		if (submission.action === 'postpone') {
			continuation.state = 'postponed'
			this.#transition(record, 'waiting_for_input')
			return portableRunClone(handle(record))
		}
		if (submission.kind !== continuation.kind) throw new Error('continuation kind mismatch')
		portableRunClone(submission)
		this.#transition(record, 'running')
		const revision = record.revision
		try {
			const result = await this.execute(this.#request(record), { ...context, submission })
			const current = this.#required(runId)
			if (current.state === 'cancelled') return portableRunClone(handle(current))
			if (current.revision !== revision || current.state !== 'running') {
				throw new PlanRunConflict('the actor run changed concurrently')
			}
			this.#applyResult(current, result, continuation)
			return portableRunClone(handle(current))
		} catch (error) {
			const current = this.#required(runId)
			if (current.state !== 'cancelled' && current.state === 'running') {
				current.failure = {
					code: 'EXECUTION_FAILED',
					message:
						continuation.kind === 'secret'
							? 'Secret continuation execution failed.'
							: error instanceof Error
								? error.message
								: String(error),
					retryable: false
				}
				this.#transition(current, 'failed')
			}
			return portableRunClone(handle(current))
		}
	}

	async cancel(runId: string, _requestId: string): Promise<PlanRunHandle> {
		const record = this.#required(runId)
		if (record.state === 'cancelled') return portableRunClone(handle(record))
		assertPlanRunTransition(record.state, 'cancelled')
		this.#transition(record, 'cancelled')
		return portableRunClone(handle(record))
	}

	async #run(
		runId: string,
		request: PlanRunStartRequest,
		context?: PlanRunExecutionContext
	): Promise<void> {
		const record = this.#required(runId)
		try {
			if (record.state !== 'accepted') return
			this.#transition(record, 'planning')
			this.#transition(record, 'running')
			const result = await this.execute(portableRunClone(request), {
				...context,
				reportProgress: async (progress) => {
					const current = this.#required(runId)
					if (current.state !== 'running')
						throw new PlanRunConflict('the actor run is no longer active')
					current.progress = portableRunClone(progress)
					current.revision += 1
					current.updatedAt = new Date().toISOString()
				}
			})
			const current = this.#required(runId)
			if (current.state === 'cancelled') return
			this.#applyResult(current, result)
		} catch (error) {
			const current = this.#required(runId)
			if (current.state === 'cancelled') return
			current.failure = {
				code: 'EXECUTION_FAILED',
				message: error instanceof Error ? error.message : String(error),
				retryable: false
			}
			this.#transition(current, 'failed')
		}
	}

	#required(runId: string): PlanRunRecord {
		const record = this.#records.get(runId)
		if (!record) throw new Error('run not found')
		return record
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
			this.#appendCheckpoint(record, result)
			this.#transition(record, 'waiting_for_input')
			return
		}
		if (remainingGoals.length > 0) {
			throw new Error(`executor left unmet goals: ${remainingGoals.join(', ')}`)
		}
		if (resolved) resolved.state = 'resolved'
		this.#appendCheckpoint(record, result)
		this.#transition(record, 'succeeded')
	}

	#appendCheckpoint(record: PlanRunRecord, result: PlanRunExecutionResult): void {
		const checkpoint: PlanRunCheckpoint = {
			checkpointId: crypto.randomUUID(),
			ordinal: record.checkpoints.length,
			committedAt: new Date().toISOString(),
			completedStepIds: [...(result.completedStepIds ?? [])],
			artifactIds: [...(result.artifactIds ?? [])],
			remainingGoals: [...(result.remainingGoals ?? [])],
			registryRevision: result.registryRevision ?? 0,
			policyDecisionIds: [...(result.policyDecisionIds ?? [])],
			...(result.output && { output: portableRunClone(result.output) })
		}
		record.checkpoints.push(checkpoint)
	}

	#transition(record: PlanRunRecord, state: PlanRunRecord['state']): void {
		assertPlanRunTransition(record.state, state)
		record.state = state
		record.revision += 1
		record.updatedAt = new Date().toISOString()
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
