import type {
	ClientRunPublication,
	CommittedClientRun,
	PublishedClientRun
} from '@avenos/artifact-store'
import { describe, expect, test } from 'vitest'
import type { OpenItem, StatementTransaction } from '../src/reconciliation'
import {
	decideReconciliation,
	type ReconciliationArtifact,
	type ReconciliationGateway,
	reconcileInvoices
} from '../src/reconciliation-flow'

const invoice: OpenItem = {
	businessKey: 'invoice:acme:re42',
	businessKeyBasis: 'supplier-invoice-number',
	documentKind: 'invoice',
	direction: 'payable',
	supplierName: 'ACME GmbH',
	supplierIbans: [],
	invoiceNumber: 'RE-42',
	orderNumber: null,
	issueDate: '2026-08-15',
	dueDate: '2026-08-30',
	currency: 'EUR',
	grossMinor: 1200,
	amountDueMinor: 1200,
	amountPaidMinor: null,
	references: ['RE-42'],
	validationStatus: 'consistent',
	summary: 'Invoice RE-42'
}
const transaction = (overrides: Partial<StatementTransaction> = {}): StatementTransaction => ({
	dedupKey: 'provider:account:42',
	dedupBasis: 'provider-id',
	accountRef: 'iban:DE89370400440532013000',
	providerTransactionId: '42',
	bookingDate: '2026-08-18',
	valueDate: '2026-08-18',
	title: 'Transfer',
	amountMinor: -1200,
	currency: 'EUR',
	counterpartyName: 'ACME GmbH',
	counterpartyIban: null,
	description: 'Payment RE-42',
	originalAmountMinor: null,
	originalCurrency: null,
	exchangeRate: null,
	fxSurchargeMinor: null,
	foreignExchangeFeeBps: null,
	balanceAfterMinor: null,
	sourceRow: 1,
	sourceOrdinal: 0,
	statementValidationStatus: 'consistent',
	statementCoverage: 'verified',
	...overrides
})

/** Immutable scoped store simulator; real-store coverage belongs in the platform E2E rail. */
class Store implements ReconciliationGateway {
	sequence = 0
	ordinal = 0
	pageSize = 2
	artifacts: (ReconciliationArtifact & { sequence: number })[] = []
	runs = new Map<string, { run: ClientRunPublication; receipt: PublishedClientRun }>()
	lostAcknowledgement = false
	queries: { typeKey: string; snapshotSequence?: number; after?: string }[] = []
	add(typeKey: string, payload: unknown) {
		const artifactId = `00000000-0000-4000-8000-${String(++this.ordinal).padStart(12, '0')}`
		this.artifacts.push({
			artifactId,
			typeKey,
			payload: structuredClone(payload) as Record<string, unknown>,
			sequence: ++this.sequence
		})
		return artifactId
	}
	async artifact(id: string) {
		const value = this.artifacts.find((item) => item.artifactId === id)
		if (!value) throw new Error('artifact not found in scope')
		return structuredClone(value)
	}
	async query(query: { typeKey: string; snapshotSequence?: number; after?: string }) {
		this.queries.push(query)
		const snapshotSequence = query.snapshotSequence ?? this.sequence
		const all = this.artifacts.filter(
			(item) =>
				item.typeKey === query.typeKey &&
				item.sequence <= snapshotSequence &&
				(!query.after || item.artifactId > query.after)
		)
		const items = all.slice(0, this.pageSize)
		return {
			snapshotSequence,
			items: structuredClone(items),
			nextAfter: all.length > items.length ? items.at(-1)!.artifactId : null
		}
	}
	async lookup(id: string): Promise<CommittedClientRun | null> {
		const stored = this.runs.get(id)
		return stored
			? structuredClone({
					receipt: { ...stored.receipt, replayed: true },
					artifacts: stored.run.artifacts,
					procedureKey: stored.run.procedureKey,
					procedureVersion: stored.run.procedureVersion,
					parameters: stored.run.parameters
				})
			: null
	}
	async publish(run: ClientRunPublication) {
		const existing = this.runs.get(run.publicationId)
		if (existing) {
			if (JSON.stringify(existing.run) !== JSON.stringify(run))
				throw new Error('publication conflict')
			return { ...existing.receipt, replayed: true }
		}
		for (const input of run.inputs) await this.artifact(input.artifactId)
		for (const evidence of run.evidence) {
			expect(
				run.inputs.some(
					(input) => input.role === evidence.inputRole && input.ordinal === evidence.inputOrdinal
				)
			).toBe(true)
			expect(run.artifacts.some((artifact) => artifact.localKey === evidence.outputLocalKey)).toBe(
				true
			)
		}
		const artifacts = run.artifacts.map((draft) => ({
			localKey: draft.localKey,
			artifactId: this.add(draft.typeKey, draft.payload)
		}))
		const receipt = {
			publicationId: run.publicationId,
			runId: crypto.randomUUID(),
			replayed: false,
			artifacts
		}
		this.runs.set(run.publicationId, structuredClone({ run, receipt }))
		if (this.lostAcknowledgement) {
			this.lostAcknowledgement = false
			throw new Error('acknowledgement lost')
		}
		return receipt
	}
}

describe('solver-driven reconciliation flow', () => {
	for (const order of ['invoice-first', 'statement-first'])
		test(`${order}: discover, rank, review, persist and recover`, async () => {
			const store = new Store()
			const first =
				order === 'invoice-first'
					? store.add('bookkeeping.open-item', invoice)
					: store.add('banking.transaction', transaction())
			expect((await reconcileInvoices(store)).reviews).toEqual([])
			const second =
				order === 'invoice-first'
					? store.add('banking.transaction', transaction())
					: store.add('bookkeeping.open-item', invoice)
			const result = await reconcileInvoices(store)
			expect(result.reviews).toHaveLength(1)
			const review = result.reviews[0]!
			expect(review.openItemArtifactId).toBe(order === 'invoice-first' ? first : second)
			expect(review.transactionArtifactId).toBe(order === 'invoice-first' ? second : first)
			expect(store.artifacts.filter((item) => item.typeKey === 'reconciliation.decision')).toEqual(
				[]
			)
			const count = store.runs.size
			expect((await reconcileInvoices(store)).reviews).toEqual(result.reviews)
			expect(store.runs.size).toBe(count)
			const decision = await decideReconciliation(store, review, 'accepted')
			expect((await store.artifact(decision)).payload).toEqual({
				candidateArtifactId: review.candidateArtifactId,
				openItemArtifactId: review.openItemArtifactId,
				transactionArtifactId: review.transactionArtifactId,
				decision: 'accepted',
				relation: 'supports-booking',
				note: null
			})
			expect(await decideReconciliation(store, review, 'accepted')).toBe(decision)
			expect((await reconcileInvoices(store)).reviews).toEqual([])
		})

	test('pages one frozen snapshot, bounds ranking inputs, and reports truncation', async () => {
		const store = new Store()
		const id = store.add('bookkeeping.open-item', invoice)
		for (let i = 0; i < 70; i++)
			store.add(
				'banking.transaction',
				transaction({ dedupKey: `provider:${i}`, providerTransactionId: String(i) })
			)
		const result = await reconcileInvoices(store)
		expect(result.consideredTransactionCount).toBe(70)
		expect(result.reviews).toHaveLength(64)
		expect(result.truncatedOpenItemIds).toEqual([id])
		expect(new Set(store.queries.slice(1).map((item) => item.snapshotSequence))).toEqual(
			new Set([71])
		)
		expect(
			[...store.runs.values()][0]!.run.inputs.filter((input) => input.role === 'transaction')
		).toHaveLength(64)
	})

	test('preserves identical fingerprint occurrences and binds each exact input', async () => {
		const store = new Store()
		store.add('bookkeeping.open-item', invoice)
		const first = store.add('banking.transaction', transaction({ dedupBasis: 'fingerprint' }))
		const second = store.add('banking.transaction', transaction({ dedupBasis: 'fingerprint' }))
		const result = await reconcileInvoices(store)
		expect(result.reviews.map((review) => review.transactionArtifactId)).toEqual([first, second])
		expect(result.reviews.map((review) => review.candidate.transactionInputOrdinal)).toEqual([0, 1])
	})

	test('retains all conflicting provider evidence in the ranker publication', async () => {
		const store = new Store()
		store.add('bookkeeping.open-item', invoice)
		store.add('banking.transaction', transaction())
		store.add('banking.transaction', transaction({ amountMinor: -900 }))
		const result = await reconcileInvoices(store)
		expect(result.reviews).toHaveLength(1)
		expect(result.reviews[0]!.candidate.blockers).toContain('conflicting-provider-observations')
		expect(result.reviews[0]!.candidate.duplicateCount).toBe(2)
		expect([...store.runs.values()][0]!.run.inputs).toHaveLength(3)
		store.add('banking.transaction', transaction({ amountMinor: -800 }))
		const revised = await reconcileInvoices(store)
		expect(revised.reviews[0]!.candidate.duplicateCount).toBe(3)
		expect(revised.reviews[0]!.candidateArtifactId).not.toBe(result.reviews[0]!.candidateArtifactId)
	})

	test('recovers a committed ranking after lost acknowledgement without republishing', async () => {
		const store = new Store()
		store.add('bookkeeping.open-item', invoice)
		store.add('banking.transaction', transaction())
		store.lostAcknowledgement = true
		await expect(reconcileInvoices(store)).rejects.toThrow('acknowledgement lost')
		expect((await reconcileInvoices(store)).reviews).toHaveLength(1)
		expect(store.runs.size).toBe(1)
	})

	test('records rejection separately and keeps alternative occurrences reviewable', async () => {
		const store = new Store()
		store.add('bookkeeping.open-item', invoice)
		store.add('banking.transaction', transaction({ dedupBasis: 'fingerprint' }))
		store.add('banking.transaction', transaction({ dedupBasis: 'fingerprint' }))
		const initial = await reconcileInvoices(store)
		await decideReconciliation(store, initial.reviews[0]!, 'rejected')
		const remaining = await reconcileInvoices(store)
		expect(remaining.reviews).toEqual([initial.reviews[1]!])
	})

	test('does not fabricate a route for unknown currency, and observes cancellation', async () => {
		const store = new Store()
		const id = store.add('bookkeeping.open-item', invoice)
		store.add('banking.transaction', transaction({ currency: null }))
		expect((await reconcileInvoices(store)).unmatchedOpenItemIds).toEqual([id])
		expect(store.runs.size).toBe(0)
		await expect(reconcileInvoices(store, { signal: AbortSignal.abort() })).rejects.toThrow(
			'cancelled'
		)
	})
})
