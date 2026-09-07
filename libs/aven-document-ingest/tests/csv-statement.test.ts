import { describe, expect, test } from 'vitest'
import corpus from '../../../fixtures/golden/bank-csv/cases.json'
import { normalizeInvoiceOpenItem } from '../src/actors/open-item-normalizer'
import { createDocumentActors } from '../src/actors/registry'
import { type CsvDetection, detectCsvStatement, parseCsv } from '../src/csv'
import { confirmCsvStatement } from '../src/csv-confirmation'
import { decideReconciliation, reconcileInvoices } from '../src/reconciliation-flow'
import { DocumentProcessingRuntime } from '../src/runtime'
import { ServerDocumentDecoder } from '../src/server'
import { CsvMemoryGateway, csvSource } from './support/csv-corpus'

describe('source-backed synthetic CSV corpus', () => {
	for (const spec of corpus.cases)
		test(spec.id, async () => {
			const source = await csvSource(spec.id)
			const raw = Buffer.from(source.base64, 'base64')
			const decoded = new TextDecoder(spec.encoding, { fatal: true }).decode(raw)
			expect(parseCsv(decoded, spec.delimiter as ',' | ';')).toEqual([
				...spec.preamble.map((r) => (r.length ? r : [''])),
				...(spec.headers.length ? [spec.headers] : []),
				...spec.rows
			])
			expect(spec.sourceUrl).toMatch(/^https:\/\//)
			const detection = await detectCsvStatement(source)
			expect(detection.eligible).toBe(spec.id === 'nl-rabobank-official-layout')
			if (detection.eligible) {
				const rows = detection.statement!.transactions as Record<string, unknown>[]
				expect(rows.map((r) => r.amountMinor)).toEqual(spec.expected.amountsMinor)
				expect(rows.map((r) => r.bookingDate)).toEqual(spec.expected.bookingDates)
				expect(rows.map((r) => r.valueDate)).toEqual(spec.expected.valueDates)
				expect(detection.statement!.openingBalanceMinor).toBeNull()
				expect(detection.statement!.institution).toBeNull() // layout does not prove issuer
			}
		})
})

test('malformed CSV never silently returns partial records', () => {
	for (const text of [
		'a,b\n"unclosed',
		'a,b\n"closed"extra,2',
		'a,b\na"b,2',
		'a,b\n\0,2',
		Array(131).fill('a,b').join('\n')
	])
		expect(() => parseCsv(text, ',')).toThrow()
	expect(parseCsv('a,b\r\n"quoted, value","a""b\nline"\r\n', ',')).toEqual([
		['a', 'b'],
		['quoted, value', 'a"b\nline']
	])
})

test('known header is insufficient when any row, account, status or balance is ambiguous', async () => {
	const original = await csvSource()
	const originalText = Buffer.from(original.base64, 'base64').toString('utf8')
	const mutations = [
		(t: string) => t.replace('"-119,00"', '"-119.00"'),
		(t: string) => t.replace('"2026-09-02"', '"2026-02-30"'),
		(t: string) => t.replace('"+1904,80"', '"+1904,81"'),
		(t: string) => t.replace('"000000000000000002"', '"000000000000000001"'),
		(t: string) => t.replace('"NL91ABNA0417164300"', '"NL00ABNA0417164300"'),
		(t: string) => t.replace('"EUR"', '"USD"'),
		(t: string) => t.replace('"Musterwerk Bürobedarf GmbH"', '""'),
		(t: string) => t.split('\r\n')[0] + '\r\n',
		(t: string) => t + '"extra row"\r\n',
		(t: string) => t.replace('"SYNTHETIC refund"', '"SYNTHETIC refund","extra"')
	]
	for (const mutate of mutations) {
		const result = await detectCsvStatement({
			...original,
			base64: Buffer.from(mutate(originalText)).toString('base64')
		})
		expect(result.eligible, result.reason).toBe(false)
		expect(result.statement).toBeNull()
	}
	const haspa = await csvSource('de-haspa-camt')
	const sourceText = new TextDecoder('windows-1252').decode(Buffer.from(haspa.base64, 'base64'))
	// Explicit century supplied in this test variant; the checked-in two-digit
	// source remains blocked, rather than guessed relative to the current year.
	const fourDigit = sourceText.replaceAll('.26"', '.2026"')
	expect(
		(await detectCsvStatement({ ...haspa, base64: Buffer.from(fourDigit).toString('base64') }))
			.eligible
	).toBe(true)
	expect(
		(
			await detectCsvStatement({
				...haspa,
				base64: Buffer.from(fourDigit.replace('Umsatz gebucht', 'Umsatz vorgemerkt')).toString(
					'base64'
				)
			})
		).eligible
	).toBe(false)
})

function runtime(store: CsvMemoryGateway) {
	const actors = createDocumentActors(new ServerDocumentDecoder(), {
		status: async () => {
			throw new Error('CSV must not call an LLM')
		},
		complete: async () => {
			throw new Error('CSV must not call an LLM')
		}
	})
	return {
		actors,
		runtime: new DocumentProcessingRuntime(actors, store, async () => {
			throw new Error('CSV must not query model status')
		})
	}
}

test('general solver admits zero finance artifacts before document confirmation, then resumes from committed evidence', async () => {
	const source = await csvSource(),
		store = new CsvMemoryGateway(),
		first = runtime(store)
	const p = await first.runtime.start(source)
	expect(p.metadata.csvDocumentConfirmation).toBe('required')
	expect(
		store.runs
			.flatMap((r) => r.artifacts)
			.filter((a) =>
				['banking.transaction', 'banking.account-statement-candidate'].includes(a.typeKey)
			)
	).toEqual([])
	const detection = p.metadata.csvDetection as unknown as CsvDetection
	await confirmCsvStatement(store, String(p.metadata.csvDetectionArtifactId), detection, 'accepted')
	for (const actor of first.actors.all) actor.dispose()
	const restarted = runtime(store)
	const resumed = await restarted.runtime.start(source)
	expect(resumed.metadata.csvDocumentConfirmation).toBe('accepted')
	expect(resumed.derivedArtifacts.filter((a) => a.typeKey === 'banking.transaction')).toHaveLength(
		2
	)
	const admitted = store.runs.find((r) => r.procedureKey === 'client.admit-csv-statement')!
	expect(admitted.inputs.map((i) => i.role)).toEqual(['source', 'detection', 'confirmation'])
	expect(admitted.artifacts[0]!.payload).toEqual(detection.statement)
	expect(store.runs.some((r) => r.procedureKey === 'client.review-reconciliation')).toBe(false)
	const count = store.runs.length
	await restarted.runtime.start(source)
	expect(store.runs).toHaveLength(count)
	for (const actor of restarted.actors.all) actor.dispose()
})

test('rejection, another source ID and changed source bytes cannot grant CSV admission', async () => {
	const source = await csvSource(),
		store = new CsvMemoryGateway(),
		run = runtime(store)
	const p = await run.runtime.start(source)
	await confirmCsvStatement(
		store,
		String(p.metadata.csvDetectionArtifactId),
		p.metadata.csvDetection as unknown as CsvDetection,
		'rejected'
	)
	for (const next of [
		source,
		{ ...source, artifactId: '22222222-2222-4222-8222-222222222222' },
		{
			...source,
			base64: Buffer.from(
				Buffer.from(source.base64, 'base64')
					.toString()
					.replace('SYNTHETIC refund', 'SYNTHETIC changed')
			).toString('base64')
		}
	]) {
		const p2 = await run.runtime.start(next)
		expect(p2.derivedArtifacts.some((a) => a.typeKey === 'banking.transaction')).toBe(false)
	}
	for (const actor of run.actors.all) actor.dispose()
})

test('confirmed CSV bookings feed the general matcher, but a second explicit decision accepts the invoice relationship', async () => {
	// In-memory integration of real actors/solver, not a native UI or database test.
	class Store extends CsvMemoryGateway {
		materialized() {
			return [...this.committed.values()].flatMap((run, index) =>
				run.artifacts.map((a) => ({
					artifactId: run.receipt.artifacts.find((r) => r.localKey === a.localKey)!.artifactId,
					typeKey: a.typeKey,
					payload: a.payload,
					sequence: index + 1
				}))
			)
		}
		async artifact(id: string) {
			const value = this.materialized().find((a) => a.artifactId === id)
			if (!value) throw new Error('Missing test artifact')
			return value
		}
		async query(q: { typeKey: string; snapshotSequence?: number; after?: string }) {
			const snapshotSequence = q.snapshotSequence ?? this.committed.size
			return {
				snapshotSequence,
				items: this.materialized().filter(
					(a) =>
						a.typeKey === q.typeKey &&
						a.sequence <= snapshotSequence &&
						(!q.after || a.artifactId > q.after)
				),
				nextAfter: null
			}
		}
	}
	const source = await csvSource(),
		store = new Store(),
		run = runtime(store)
	try {
		// The invoice has already passed extraction/validation. This rail starts at
		// invoice normalization and exercises raw CSV -> review -> exact lineage.
		const invoice = normalizeInvoiceOpenItem(
			{
				supplier: 'Musterwerk Bürobedarf GmbH',
				invoiceNumber: 'RE-DE-1001',
				currency: 'EUR',
				grossMinor: 11900,
				summary: 'Synthetic office invoice'
			},
			{ supplier: null, issueDate: '2026-09-01', documentKind: 'invoice' },
			{ status: 'consistent' }
		)
		await store.publish({
			publicationId: crypto.randomUUID(),
			procedureKey: 'test.seed-validated-invoice',
			procedureVersion: 'client-v1',
			parameters: {},
			inputs: [],
			evidence: [],
			artifacts: [
				{
					localKey: 'invoice',
					typeKey: 'bookkeeping.open-item',
					typeVersion: 1,
					payload: { ...invoice },
					output: { role: 'open-item', ordinal: 0 }
				}
			]
		})
		const p = await run.runtime.start(source)
		expect((await reconcileInvoices(store)).reviews).toEqual([])
		await confirmCsvStatement(
			store,
			String(p.metadata.csvDetectionArtifactId),
			p.metadata.csvDetection as unknown as CsvDetection,
			'accepted'
		)
		await run.runtime.start(source)
		const result = await reconcileInvoices(store)
		const review = result.reviews.find((r) => r.transaction.amountMinor === -11900)!
		expect(review.candidate.amountDistanceMinor).toBe(0)
		expect(review.transaction.providerTransactionId).toBe('000000000000000001')
		expect(review.transaction.sourceRow).toBe(2)
		expect(store.materialized().filter((a) => a.typeKey === 'reconciliation.decision')).toEqual([])
		const decisionId = await decideReconciliation(store, review, 'accepted')
		expect((await store.artifact(decisionId)).payload).toMatchObject({
			decision: 'accepted',
			relation: 'supports-booking',
			transactionArtifactId: review.transactionArtifactId,
			openItemArtifactId: review.openItemArtifactId
		})
		expect(await decideReconciliation(store, review, 'accepted')).toBe(decisionId)
	} finally {
		for (const actor of run.actors.all) actor.dispose()
	}
})
