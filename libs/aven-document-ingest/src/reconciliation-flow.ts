import {
	ACTOR_RUN_PROTOCOL,
	executeObservedProgram,
	type PlanRunStartCommand,
	resourceId,
	type SolverFact,
	type SolverInvocation,
	type SolverOperation,
	solverIdentity
} from '@avenos/actors'
import type { ClientArtifactGateway, ClientRunPublication } from '@avenos/artifact-store'
import { clientRunIdentity } from '@avenos/artifact-store'
import { createReconciliationRankerActor } from './actors/reconciliation-ranker'
import {
	type OpenItem,
	type ReconciliationMatchCandidate,
	rankInvoiceTransactions,
	type StatementTransaction
} from './reconciliation'
import { parseDocumentActorResult } from './results'

export interface ReconciliationArtifact<T = Record<string, unknown>> {
	artifactId: string
	typeKey: string
	payload: T
}

export interface ReconciliationArtifactPage {
	snapshotSequence: number
	items: ReconciliationArtifact[]
	nextAfter: string | null
}

/** Scoped artifact access; neither execution host receives SQL or chooses a database. */
export interface ReconciliationGateway extends ClientArtifactGateway {
	query(query: {
		typeKey: string
		snapshotSequence?: number
		after?: string
	}): Promise<ReconciliationArtifactPage>
	artifact(artifactId: string): Promise<ReconciliationArtifact>
}

export interface ReconciliationReview {
	candidateArtifactId: string
	openItemArtifactId: string
	transactionArtifactId: string
	openItem: OpenItem
	transaction: StatementTransaction
	candidate: ReconciliationMatchCandidate
}

export interface ReconciliationResult {
	snapshotSequence: number
	reviews: ReconciliationReview[]
	unmatchedOpenItemIds: string[]
	consideredTransactionCount: number
	/** Retrieval is deliberately bounded; never present a shortlist as exhaustive matching. */
	shortlistLimit: number
	truncatedOpenItemIds: string[]
}

const atom = (id: string) => `a_${id}`
export const RECONCILIATION_SKILL = resourceId({
	authority: 'ceo.aven',
	kind: 'skill',
	namespace: 'bookkeeping',
	name: 'invoice-reconciliation',
	version: '2'
})
export const RECONCILIATION_GOAL = 'ceo.aven.reconciliation.review_ready(scope)'

export function reconciliationRunCommand(openItemArtifactId?: string): PlanRunStartCommand {
	const requestId = crypto.randomUUID()
	return {
		protocol: ACTOR_RUN_PROTOCOL,
		skillRef: RECONCILIATION_SKILL,
		executionEnvironment: 'server',
		requestId,
		idempotencyKey: requestId,
		requestedAt: new Date().toISOString(),
		ingredients: [],
		goals: [RECONCILIATION_GOAL],
		goalSpec: { mode: 'exact', completion: 'goal_only' },
		parameters: openItemArtifactId ? { openItemArtifactId } : {}
	}
}
const p = (name: string, ...args: string[]) => `ceo.aven.reconciliation.${name}(${args.join(', ')})`
const rule = (
	id: string,
	requires: string[],
	produces: string[],
	mode: SolverOperation['mode'] = 'transform'
): SolverOperation => ({
	id,
	actor: id,
	method: id,
	requires,
	produces,
	mode,
	idempotency: 'idempotent'
})

async function readType(
	gateway: ReconciliationGateway,
	typeKey: string,
	snapshotSequence?: number
): Promise<{ snapshotSequence: number; artifacts: ReconciliationArtifact[] }> {
	const artifacts: ReconciliationArtifact[] = []
	let after: string | undefined
	const seen = new Set<string>()
	for (;;) {
		const page = await gateway.query({
			typeKey,
			...(snapshotSequence !== undefined && { snapshotSequence }),
			...(after && { after })
		})
		if (snapshotSequence !== undefined && page.snapshotSequence !== snapshotSequence)
			throw new Error('reconciliation query changed its snapshot')
		snapshotSequence = page.snapshotSequence
		for (const artifact of page.items) {
			if (artifact.typeKey !== typeKey || seen.has(artifact.artifactId))
				throw new Error('reconciliation query returned an invalid occurrence')
			seen.add(artifact.artifactId)
			artifacts.push(artifact)
		}
		if (!page.nextAfter) return { snapshotSequence, artifacts }
		if (page.nextAfter === after || page.items.length === 0 || artifacts.length > 100_000)
			throw new Error('reconciliation query failed to reach a bounded snapshot')
		after = page.nextAfter
	}
}

/**
 * Query, shortlist, rank and prepare review through the general solver. The same
 * implementation is used on a device and by the remote worker. Human decisions
 * are a separate explicit effect; enrichment never attaches a document by itself.
 */
export async function reconcileInvoices(
	gateway: ReconciliationGateway,
	options: {
		signal?: AbortSignal
		openItemArtifactId?: string
		procedureVersion?: ClientRunPublication['procedureVersion']
	} = {}
): Promise<ReconciliationResult> {
	const procedureVersion = options.procedureVersion ?? 'client-v1'
	const operations = [
		rule('reconciliation.query.v2', [p('request', 'R')], [p('scope', 'S')], 'observe'),
		rule('reconciliation.shortlist.v2', [p('scope', 'S')], [p('candidates', 'I', 'B')]),
		rule('reconciliation.rank.v2', [p('candidates', 'I', 'B')], [p('ranked', 'I', 'B')]),
		rule('reconciliation.review.v2', [p('ranked', 'I', 'B')], [p('review', 'I', 'B')])
	]
	type Scope = {
		snapshotSequence: number
		invoices: ReconciliationArtifact<OpenItem>[]
		transactions: ReconciliationArtifact<StatementTransaction>[]
		decisions: ReconciliationArtifact[]
	}
	type Batch = {
		invoice: ReconciliationArtifact<OpenItem>
		transactions: ReconciliationArtifact<StatementTransaction>[]
		decisions: ReconciliationArtifact[]
	}
	type Ranked = Batch & { reviews: ReconciliationReview[] }
	const result: ReconciliationResult = {
		snapshotSequence: 0,
		reviews: [],
		unmatchedOpenItemIds: [],
		consideredTransactionCount: 0,
		shortlistLimit: 64,
		truncatedOpenItemIds: []
	}
	const observation = (
		invocation: SolverInvocation,
		predicate: string,
		value: unknown,
		id = invocation.id
	): SolverFact => ({ id, predicate, value })
	const run = await executeObservedProgram({
		runId: 'reconciliation-v2',
		operations,
		ingredients: [{ id: 'request', predicate: p('request', 'current'), value: {} }],
		...(options.signal && { signal: options.signal }),
		maxInvocations: 100_000,
		port: {
			lookup: async () => null,
			invoke: async (invocation) => {
				let facts: SolverFact[] = []
				if (invocation.operation === 'reconciliation.query.v2') {
					const invoices = await readType(gateway, 'bookkeeping.open-item')
					const transactions = await readType(
						gateway,
						'banking.transaction',
						invoices.snapshotSequence
					)
					const decisions = await readType(
						gateway,
						'reconciliation.decision',
						invoices.snapshotSequence
					)
					const scope: Scope = {
						snapshotSequence: invoices.snapshotSequence,
						invoices: invoices.artifacts as unknown as Scope['invoices'],
						transactions: transactions.artifacts as unknown as Scope['transactions'],
						decisions: decisions.artifacts
					}
					result.snapshotSequence = scope.snapshotSequence
					result.consideredTransactionCount = scope.transactions.length
					facts = [observation(invocation, p('scope', `snapshot_${scope.snapshotSequence}`), scope)]
				} else if (invocation.operation === 'reconciliation.shortlist.v2') {
					const source = invocation.inputs[0]!.value as Scope
					for (const invoice of source.invoices) {
						if (options.openItemArtifactId && invoice.artifactId !== options.openItemArtifactId)
							continue
						if (
							!options.openItemArtifactId &&
							source.decisions.some(
								(decision) =>
									decision.payload.openItemArtifactId === invoice.artifactId &&
									decision.payload.decision === 'accepted'
							)
						)
							continue
						const ranked = rankInvoiceTransactions(
							invoice.payload,
							source.transactions.map((item) => item.payload)
						)
						// Keep every observation of a selected provider identity together.
						// Otherwise narrowing the input set could erase conflicts or duplicate evidence.
						const transactions: Scope['transactions'] = []
						let truncated = false
						for (const candidate of ranked.filter((item) => item.amountMatchBasis !== null)) {
							const representative = source.transactions[candidate.transactionInputOrdinal]!
							const group =
								representative.payload.dedupBasis === 'provider-id'
									? source.transactions.filter(
											(item) =>
												item.payload.dedupBasis === 'provider-id' &&
												item.payload.dedupKey === representative.payload.dedupKey
										)
									: [representative]
							if (transactions.length + group.length > result.shortlistLimit) {
								truncated = true
								continue
							}
							transactions.push(...group)
						}
						if (truncated) result.truncatedOpenItemIds.push(invoice.artifactId)
						if (!transactions.length) {
							result.unmatchedOpenItemIds.push(invoice.artifactId)
							continue
						}
						const id = await solverIdentity(
							JSON.stringify([
								'candidate-batch-v2',
								invoice.artifactId,
								transactions.map((item) => item.artifactId)
							])
						)
						facts.push(
							observation(
								invocation,
								p('candidates', atom(invoice.artifactId), atom(id)),
								{ invoice, transactions, decisions: source.decisions },
								id
							)
						)
					}
				} else if (invocation.operation === 'reconciliation.rank.v2') {
					const batch = invocation.inputs[0]!.value as Batch
					const publicationId = await solverIdentity(
						JSON.stringify([
							'rank-v2',
							procedureVersion,
							batch.invoice.artifactId,
							batch.transactions.map((item) => item.artifactId)
						])
					)
					const committed = await gateway.lookup?.(publicationId)
					let reviews: ReconciliationReview[]
					if (committed) {
						reviews = committed.artifacts.map((artifact) => {
							const candidate = artifact.payload as unknown as ReconciliationMatchCandidate
							const transaction = batch.transactions[candidate.transactionInputOrdinal]
							const published = committed.receipt.artifacts.find(
								(item) => item.localKey === artifact.localKey
							)
							if (!transaction || !published)
								throw new Error('committed ranking lost its bound transaction')
							return {
								candidateArtifactId: published.artifactId,
								openItemArtifactId: batch.invoice.artifactId,
								transactionArtifactId: transaction.artifactId,
								openItem: batch.invoice.payload,
								transaction: transaction.payload,
								candidate
							}
						})
					} else {
						const actor = createReconciliationRankerActor()
						try {
							const ranked = parseDocumentActorResult(
								(
									await actor.deliver('reconciliation_rank_invoice_transactions', {
										openItem: batch.invoice.payload,
										transactions: batch.transactions.map((item) => item.payload)
									})
								).record
							)
							const receipt = await gateway.publish({
								publicationId,
								procedureKey: ranked.procedureKey,
								procedureVersion,
								inputs: [
									{ role: 'open-item', ordinal: 0, artifactId: batch.invoice.artifactId },
									...batch.transactions.map((item, ordinal) => ({
										role: 'transaction',
										ordinal,
										artifactId: item.artifactId
									}))
								],
								parameters: {},
								artifacts: ranked.artifacts,
								evidence: ranked.evidence
							})
							reviews = ranked.artifacts.map((artifact) => {
								const candidate = artifact.payload as unknown as ReconciliationMatchCandidate
								const transaction = batch.transactions[candidate.transactionInputOrdinal]!
								const published = receipt.artifacts.find(
									(item) => item.localKey === artifact.localKey
								)
								if (!published) throw new Error('ranking publication omitted a candidate')
								return {
									candidateArtifactId: published.artifactId,
									openItemArtifactId: batch.invoice.artifactId,
									transactionArtifactId: transaction.artifactId,
									openItem: batch.invoice.payload,
									transaction: transaction.payload,
									candidate
								}
							})
						} finally {
							actor.dispose()
						}
					}
					facts = [
						observation(invocation, p('ranked', invocation.bindings.I!, invocation.bindings.B!), {
							...batch,
							reviews
						})
					]
				} else {
					const ranked = invocation.inputs[0]!.value as Ranked
					const undecided = ranked.reviews.filter(
						(review) =>
							!ranked.decisions.some(
								(decision) =>
									decision.payload.openItemArtifactId === review.openItemArtifactId &&
									decision.payload.transactionArtifactId === review.transactionArtifactId
							)
					)
					result.reviews.push(...undecided)
					facts = [
						observation(invocation, p('review', invocation.bindings.I!, invocation.bindings.B!), {
							candidateArtifactIds: undecided.map((item) => item.candidateArtifactId)
						})
					]
				}
				return {
					invocationId: invocation.id,
					operation: invocation.operation,
					state: 'succeeded',
					facts
				}
			}
		}
	})
	if (run.state !== 'complete') throw new Error(`reconciliation did not complete: ${run.state}`)
	return result
}

/** Explicit reviewed relationship, not a payment instruction or an allocation of money. */
export async function decideReconciliation(
	gateway: ReconciliationGateway,
	review: Pick<
		ReconciliationReview,
		'candidateArtifactId' | 'openItemArtifactId' | 'transactionArtifactId'
	>,
	decision: 'accepted' | 'rejected',
	note: string | null = null
): Promise<string> {
	// Copy the reviewed identifiers explicitly: callers may carry display fields,
	// but neither those fields nor mutable UI data belong in the decision record.
	review = {
		candidateArtifactId: review.candidateArtifactId,
		openItemArtifactId: review.openItemArtifactId,
		transactionArtifactId: review.transactionArtifactId
	}
	const candidate = await gateway.artifact(review.candidateArtifactId)
	const invoice = await gateway.artifact(review.openItemArtifactId)
	const transaction = await gateway.artifact(review.transactionArtifactId)
	if (
		candidate.typeKey !== 'reconciliation.match-candidate' ||
		invoice.typeKey !== 'bookkeeping.open-item' ||
		transaction.typeKey !== 'banking.transaction'
	)
		throw new Error('review requires committed reconciliation artifacts')
	const operation = rule(
		'reconciliation.decide.v2',
		[p('human_decision', 'M', 'Decision')],
		[p('decision_recorded', 'M')],
		'effect'
	)
	let decisionArtifactId = ''
	const run = await executeObservedProgram({
		runId: 'reconciliation-decision-v2',
		operations: [operation],
		allowEffects: true,
		ingredients: [
			{
				id: `${review.candidateArtifactId}:${decision}`,
				predicate: p('human_decision', atom(review.candidateArtifactId), decision),
				value: review
			}
		],
		goals: [p('decision_recorded', atom(review.candidateArtifactId))],
		completion: 'goal-only',
		port: {
			lookup: async () => null,
			invoke: async (invocation) => {
				const publicationId = await clientRunIdentity(
					JSON.stringify([
						'reconciliation-decision-v2',
						review.openItemArtifactId,
						review.transactionArtifactId
					])
				)
				const publication: ClientRunPublication = {
					publicationId,
					procedureKey: 'client.review-reconciliation',
					procedureVersion: 'client-v1',
					inputs: [
						{ role: 'match-candidate', ordinal: 0, artifactId: review.candidateArtifactId },
						{ role: 'open-item', ordinal: 0, artifactId: review.openItemArtifactId },
						{ role: 'transaction', ordinal: 0, artifactId: review.transactionArtifactId }
					],
					parameters: {},
					artifacts: [
						{
							localKey: 'decision',
							typeKey: 'reconciliation.decision',
							typeVersion: 1,
							payload: { ...review, decision, relation: 'supports-booking', note },
							output: { role: 'decision', ordinal: 0 }
						}
					],
					evidence: ['match-candidate', 'open-item', 'transaction'].map((inputRole, ordinal) => ({
						ordinal,
						outputLocalKey: 'decision',
						outputLocator: { kind: 'artifact-root' },
						inputRole,
						inputOrdinal: 0,
						inputLocator: { kind: 'artifact-root' }
					}))
				}
				const receipt = await gateway.publish(publication)
				decisionArtifactId = receipt.artifacts[0]?.artifactId ?? ''
				if (!decisionArtifactId) throw new Error('review publication omitted its decision')
				return {
					invocationId: invocation.id,
					operation: operation.id,
					state: 'succeeded',
					facts: [
						{
							id: decisionArtifactId,
							predicate: p('decision_recorded', atom(review.candidateArtifactId)),
							value: { artifactId: decisionArtifactId }
						}
					]
				}
			}
		}
	})
	if (!run.goalsSatisfied) throw new Error('review decision was not committed')
	return decisionArtifactId
}
