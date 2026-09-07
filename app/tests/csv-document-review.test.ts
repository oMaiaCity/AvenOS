import { describe, expect, test } from 'bun:test'
import { type HeldMessage, MessageBus } from '@avenos/actors'
import { createDocumentActors } from '@avenos/document-ingest/actors'
import type { CsvDetection } from '@avenos/document-ingest/csv'
import { confirmCsvStatement } from '@avenos/document-ingest/csv-confirmation'
import { DocumentProcessingRuntime } from '@avenos/document-ingest/runtime'
import { ServerDocumentDecoder } from '@avenos/document-ingest/server'
import {
	CsvMemoryGateway,
	csvSource
} from '../../libs/aven-document-ingest/tests/support/csv-corpus'
import { holdCsvDocumentReview } from '../src/lib/artifacts/csv-document-review'
import { decodePlainText } from '../src/lib/artifacts/plain-text-document'

describe('mandatory physical CSV document confirmation', () => {
	test('local and remote byte decoding preserve Windows-1252 CSV identically', async () => {
		const source = await csvSource('de-haspa-camt')
		const local = decodePlainText(source, Buffer.from(source.base64, 'base64'))
		const remote = await new ServerDocumentDecoder().decode(source)
		expect(remote).toEqual(local)
		expect(local?.outcome).toBe('ok')
		expect(local?.pages[0]?.runs[0]?.text).toContain('Musterwerk Bürobedarf GmbH')
	})
	for (const decision of ['confirm', 'reject'] as const)
		test(decision, async () => {
			const source = await csvSource(),
				store = new CsvMemoryGateway(),
				bus = new MessageBus()
			const actors = createDocumentActors(new ServerDocumentDecoder())
			const runtime = new DocumentProcessingRuntime(actors, store)
			const presentation = await runtime.start(source)
			const held: HeldMessage[] = []
			bus.onHold = (item) => held.push(item)
			let resumed = 0
			expect(
				await holdCsvDocumentReview({
					presentation,
					publications: store,
					bus,
					resume: async () => {
						resumed++
						await runtime.start(source)
					}
				})
			).toBe(true)
			expect(held).toHaveLength(1)
			expect(held[0]!.label).toBe('Confirm this CSV is an account statement')
			expect(bus.toolSpecs().some((t) => t.name.includes('confirm'))).toBe(false)
			expect(resumed).toBe(0)
			expect(store.runs.some((r) => r.procedureKey === 'client.confirm-csv-statement')).toBe(false)
			if (decision === 'confirm') await bus.confirmHeld(held[0]!.id)
			else await bus.rejectHeld(held[0]!.id)
			expect(resumed).toBe(decision === 'confirm' ? 1 : 0)
			expect(
				store.runs.find((r) => r.procedureKey === 'client.confirm-csv-statement')?.artifacts[0]
					?.payload.decision
			).toBe(decision === 'confirm' ? 'accepted' : 'rejected')
			expect(store.runs.some((r) => r.procedureKey === 'client.admit-csv-statement')).toBe(
				decision === 'confirm'
			)
			expect(store.runs.some((r) => r.procedureKey === 'client.review-reconciliation')).toBe(false)
			for (const actor of actors.all) actor.dispose()
		})

	test('failed save keeps the gate and cannot resume; retry is idempotent', async () => {
		const store = new CsvMemoryGateway(),
			bus = new MessageBus()
		const actors = createDocumentActors(new ServerDocumentDecoder())
		const runtime = new DocumentProcessingRuntime(actors, store)
		const p = await runtime.start(await csvSource())
		let held!: HeldMessage,
			resumed = 0
		bus.onHold = (item) => {
			held = item
		}
		await holdCsvDocumentReview({
			presentation: p,
			publications: store,
			bus,
			resume: async () => {
				resumed++
			}
		})
		store.failPublication = true
		await expect(bus.confirmHeld(held.id)).rejects.toThrow('publication failure')
		expect(resumed).toBe(0)
		store.failPublication = false
		await bus.confirmHeld(held.id)
		await bus.confirmHeld(held.id)
		expect(resumed).toBe(1)
		for (const actor of actors.all) actor.dispose()
	})

	test('unknown CSV cannot be made reconcilable by showing a human gate', async () => {
		const store = new CsvMemoryGateway(),
			bus = new MessageBus(),
			held: HeldMessage[] = []
		bus.onHold = (item) => held.push(item)
		const actors = createDocumentActors(new ServerDocumentDecoder())
		const p = await new DocumentProcessingRuntime(actors, store).start(
			await csvSource('eu-revolut-states')
		)
		await holdCsvDocumentReview({
			presentation: p,
			publications: store,
			bus,
			resume: async () => {
				throw new Error('Must not resume')
			}
		})
		expect(held).toEqual([])
		for (const actor of actors.all) actor.dispose()
	})

	for (const decision of ['accepted', 'rejected'] as const)
		test(`restoring a saved ${decision} document decision never asks again or pretends to be a new human click`, async () => {
			const source = await csvSource(),
				store = new CsvMemoryGateway()
			const actors = createDocumentActors(new ServerDocumentDecoder())
			const runtime = new DocumentProcessingRuntime(actors, store)
			try {
				const stalePresentation = await runtime.start(source)
				const id = await confirmCsvStatement(
					store,
					String(stalePresentation.metadata.csvDetectionArtifactId),
					stalePresentation.metadata.csvDetection as unknown as CsvDetection,
					decision
				)
				const bus = new MessageBus(),
					resumed: Array<[string, boolean]> = []
				bus.onHold = () => {
					throw new Error('Saved decisions must not ask again')
				}
				const stop = await holdCsvDocumentReview({
					presentation: stalePresentation,
					publications: store,
					bus,
					resume: async (artifactId, fromHuman) => {
						resumed.push([artifactId, fromHuman])
					}
				})
				expect(stop).toBe(true)
				expect(resumed).toEqual(decision === 'accepted' ? [[id, false]] : [])
				const freshPresentation = await runtime.start(source)
				expect(
					await holdCsvDocumentReview({
						presentation: freshPresentation,
						publications: store,
						bus,
						resume: async () => {
							throw new Error('Already projected')
						}
					})
				).toBe(decision === 'rejected')
			} finally {
				for (const actor of actors.all) actor.dispose()
			}
		})
})
