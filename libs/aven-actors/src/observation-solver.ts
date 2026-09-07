import type { Predicate } from './actor'
import {
	type Capability,
	matchRequirements,
	type PlanValue,
	RequirementSearchLimit,
	substitute
} from './planner'
import { assertPortableRunValue } from './run'
import { type Bindings, isVariable, parseTerm } from './term'

/** A grounded observation. The host owns admission and persistent evidence resolution. */
export interface SolverFact {
	id: string
	predicate: Predicate
	value: unknown
}

/** A sealed collection is an exact, ordered list, never a query over currently known facts. */
export interface SolverCollection {
	members: string[]
}

export interface SolverGather {
	name: string
	/** Index of the requirement whose value is a SolverCollection. */
	collection: number
	/** A variable used in predicate to denote each declared member. */
	member: string
	predicate: Predicate
}

export interface SolverOperation extends Capability {
	gathers?: SolverGather[]
	/** Failures are observations too, but only these declared facts may follow them. */
	failureProduces?: Predicate[]
}

export interface SolverInvocation {
	id: string
	operation: string
	bindings: Bindings
	inputs: SolverFact[]
	gathers: Record<string, SolverFact[]>
}

export interface SolverReceipt {
	invocationId: string
	operation: string
	state: 'succeeded' | 'failed'
	facts: SolverFact[]
	error?: string
}

/**
 * Hosts implement atomic receipt persistence and resolve its committed evidence.
 * invoke must not return optimistic/planned facts. An uncertain commit must throw;
 * the next attempt consults lookup before invoking again.
 */
export interface ObservationExecutionPort {
	lookup(invocation: SolverInvocation): Promise<SolverReceipt | null>
	invoke(invocation: SolverInvocation): Promise<SolverReceipt>
}

export interface ObservationRunResult {
	state: 'complete' | 'partial' | 'no-route' | 'limit' | 'cancelled'
	facts: SolverFact[]
	receipts: SolverReceipt[]
	goalsSatisfied: boolean
}

/** One compiler for the ready-frontier contract, independent of the physical host. */
export function compileObservationOperations(
	operations: readonly SolverOperation[]
): SolverOperation[] {
	const ids = new Set<string>()
	for (const operation of operations) {
		if (ids.has(operation.id)) throw new Error(`duplicate operation ${operation.id}`)
		ids.add(operation.id)
		if (!Number.isFinite(operation.cost ?? 1) || (operation.cost ?? 1) < 0) {
			throw new Error(`invalid operation cost ${operation.id}`)
		}
		for (const predicate of [
			...operation.requires,
			...operation.produces,
			...(operation.failureProduces ?? [])
		]) {
			validatePredicate(predicate)
		}
		const names = new Set<string>()
		for (const gather of operation.gathers ?? []) {
			if (names.has(gather.name)) throw new Error(`duplicate gather ${gather.name}`)
			names.add(gather.name)
			if (!Number.isInteger(gather.collection) || !operation.requires[gather.collection]) {
				throw new Error(`gather ${gather.name} has no collection requirement`)
			}
			validatePredicate(gather.predicate)
			if (
				gather.member === '_' ||
				!isVariable(gather.member) ||
				!parseTerm(gather.predicate).args.includes(gather.member)
			) {
				throw new Error(`gather ${gather.name} must bind its member variable`)
			}
			if (
				operation.requires.some((predicate) => parseTerm(predicate).args.includes(gather.member))
			) {
				throw new Error(`gather ${gather.name} captures a requirement variable`)
			}
		}
	}
	// Compile metadata only. Installed packages may keep executable bindings beside
	// it; closures must never enter a portable plan or a registry snapshot.
	return operations
		.map(
			({
				id,
				actor,
				method,
				requires,
				produces,
				cost,
				available,
				mode,
				idempotency,
				parametersSchema,
				inputSlots,
				outputSlots,
				gathers,
				failureProduces
			}) =>
				structuredClone({
					id,
					actor,
					method,
					requires,
					produces,
					cost,
					available,
					mode,
					idempotency,
					parametersSchema,
					inputSlots,
					outputSlots,
					gathers,
					failureProduces
				})
		)
		.sort((a, b) => (a.cost ?? 1) - (b.cost ?? 1) || a.id.localeCompare(b.id))
}

/** Plan only invocations justified by committed observations, using the shared unifier. */
export async function solveObservedFrontier(
	runId: string,
	operations: readonly SolverOperation[],
	facts: readonly SolverFact[],
	maxSearchAttempts = 100_000
): Promise<SolverInvocation[]> {
	const byId = new Map(facts.map((fact) => [fact.id, fact]))
	if (byId.size !== facts.length) throw new Error('duplicate fact occurrence identity')
	const values = facts.map(planValue)
	const invocations: SolverInvocation[] = []
	for (const operation of operations) {
		if (operation.available === false) continue
		for (const match of matchRequirements(operation.requires, values, {
			maxAttempts: maxSearchAttempts
		})) {
			const inputs = match.inputs.map((input) => byId.get(ingredientId(input))!)
			const gathers: Record<string, SolverFact[]> = {}
			let ready = true
			for (const gather of operation.gathers ?? []) {
				const collection = inputs[gather.collection]?.value as Partial<SolverCollection> | undefined
				if (
					!collection ||
					!Array.isArray(collection.members) ||
					collection.members.some((member) => typeof member !== 'string' || isVariable(member))
				) {
					throw new Error(`invalid sealed collection for ${operation.id}:${gather.name}`)
				}
				if (new Set(collection.members).size !== collection.members.length) {
					throw new Error(`duplicate collection member for ${operation.id}:${gather.name}`)
				}
				const gathered: SolverFact[] = []
				for (const member of collection.members) {
					const query = substitute(gather.predicate, { ...match.bindings, [gather.member]: member })
					const matches = matchRequirements([query], values)
					if (matches.length > 1)
						throw new Error(`ambiguous collection member ${operation.id}:${gather.name}:${member}`)
					const input = matches[0]?.inputs[0]
					if (!input) {
						ready = false
						break
					}
					gathered.push(byId.get(ingredientId(input))!)
				}
				gathers[gather.name] = gathered
				if (!ready) break
			}
			if (!ready) continue
			const identity = JSON.stringify([
				runId,
				operation.id,
				inputs.map((fact) => fact.id),
				Object.entries(gathers).map(([name, members]) => [name, members.map((fact) => fact.id)])
			])
			invocations.push({
				id: await solverIdentity(identity),
				operation: operation.id,
				bindings: match.bindings,
				inputs,
				gathers
			})
		}
	}
	return invocations
}

/**
 * Receding-horizon execution. No operation's advertised outputs enter the fact set.
 * After each committed invocation the shared solver recomputes the ready frontier.
 * Effecting operations are admitted only by an explicit allowEffects policy.
 */
export async function executeObservedProgram(options: {
	runId: string
	operations: readonly SolverOperation[]
	ingredients: SolverFact[]
	goals?: Predicate[]
	completion?: 'goal-only' | 'saturate'
	port: ObservationExecutionPort
	maxInvocations?: number
	/** Per-operation join budget, checked before materializing a Cartesian frontier. */
	maxSearchAttempts?: number
	allowEffects?: boolean
	signal?: AbortSignal
	onReceipt?: (receipt: SolverReceipt, invocation: SolverInvocation) => void
}): Promise<ObservationRunResult> {
	const operations = compileObservationOperations(options.operations).filter((operation) =>
		operation.mode === 'effect'
			? options.allowEffects === true
			: operation.mode !== 'stream' && operation.mode !== 'view'
	)
	const facts = new Map<string, SolverFact>()
	const receipts: SolverReceipt[] = []
	const completed = new Set<string>()
	const admit = (fact: SolverFact) => {
		validatePredicate(fact.predicate)
		if (!fact.id || parseTerm(fact.predicate).args.some(isVariable))
			throw new Error(`observation is not grounded: ${fact.predicate}`)
		assertPortableRunValue(fact)
		const existing = facts.get(fact.id)
		if (existing && JSON.stringify(existing) !== JSON.stringify(fact))
			throw new Error(`conflicting fact occurrence ${fact.id}`)
		facts.set(fact.id, structuredClone(fact))
	}
	for (const fact of options.ingredients) admit(fact)
	const goalsSatisfied = () =>
		matchRequirements(options.goals ?? [], [...facts.values()].map(planValue), { maxMatches: 1 })
			.length > 0
	const result = (state: ObservationRunResult['state']): ObservationRunResult => ({
		state,
		facts: [...facts.values()],
		receipts,
		goalsSatisfied: goalsSatisfied()
	})
	for (;;) {
		if (options.signal?.aborted) return result('cancelled')
		if (options.completion === 'goal-only' && goalsSatisfied()) return result('complete')
		let frontier: SolverInvocation[]
		try {
			frontier = await solveObservedFrontier(
				options.runId,
				operations,
				[...facts.values()],
				options.maxSearchAttempts
			)
		} catch (error) {
			if (error instanceof RequirementSearchLimit) return result('limit')
			throw error
		}
		const invocation = frontier.find((candidate) => !completed.has(candidate.id))
		if (!invocation)
			return result(
				!goalsSatisfied()
					? 'no-route'
					: receipts.some((receipt) => receipt.state === 'failed')
						? 'partial'
						: 'complete'
			)
		if (receipts.length >= (options.maxInvocations ?? 1024)) return result('limit')
		const operation = operations.find((candidate) => candidate.id === invocation.operation)!
		const receipt =
			(await options.port.lookup(invocation)) ?? (await options.port.invoke(invocation))
		if (
			receipt.invocationId !== invocation.id ||
			receipt.operation !== invocation.operation ||
			!['succeeded', 'failed'].includes(receipt.state)
		) {
			throw new Error('receipt does not belong to the admitted invocation')
		}
		const declared =
			receipt.state === 'failed' ? (operation.failureProduces ?? []) : operation.produces
		for (const fact of receipt.facts) {
			if (
				!declared.some(
					(predicate) =>
						matchRequirements([substitute(predicate, invocation.bindings)], [planValue(fact)])
							.length > 0
				)
			) {
				throw new Error(`${operation.id} published an undeclared observation: ${fact.predicate}`)
			}
		}
		for (const fact of receipt.facts) admit(fact)
		completed.add(invocation.id)
		receipts.push(receipt)
		options.onReceipt?.(receipt, invocation)
	}
}

function planValue(fact: SolverFact): PlanValue {
	return { predicate: fact.predicate, source: { kind: 'ingredient', artifactId: fact.id } }
}

function ingredientId(value: PlanValue): string {
	if (value.source.kind !== 'ingredient' || !value.source.artifactId)
		throw new Error('ungrounded solver input')
	return value.source.artifactId
}

function validatePredicate(predicate: string): void {
	if (
		!/^[a-zA-Z][a-zA-Z0-9_.-]*(?:\(\s*[a-zA-Z0-9_:./-]+(?:\s*,\s*[a-zA-Z0-9_:./-]+)*\s*\))?$/.test(
			predicate
		)
	) {
		throw new Error(`unsupported predicate syntax: ${predicate}`)
	}
}

/** Stable portable identity for a bound invocation, not its position in a transient plan. */
export async function solverIdentity(seed: string): Promise<string> {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
	).slice(0, 16)
	digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x80
	digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80
	const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
