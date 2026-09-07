import { describe, expect, test } from 'bun:test'
import { persistentLogEntries } from '../src/lib/intents/activity-log'
import type { Contribution } from '../src/lib/intents/intents.svelte'

/**
 * The activity log is the intent's journey, not a transcript: message
 * contributions (human/agent, kind 'message') belong in the chat and must
 * never become log entries — that is exactly the double rendering this
 * fixes. Everything else (uploads, lifecycle events, future skill activity)
 * stays in the log, typed and in order.
 */
function contribution(over: Partial<Contribution> = {}): Contribution {
	let n = 0
	return {
		id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
		sequence: n,
		contributorKind: 'human',
		kind: 'message',
		text: null,
		payload: {},
		createdAt: new Date(Date.UTC(2026, 7, 27, 10, n)).toISOString(),
		...over
	}
}

describe('persistentLogEntries', () => {
	test('excludes chat messages — human and agent alike', () => {
		const entries = persistentLogEntries([
			contribution({
				contributorKind: 'human',
				kind: 'message',
				text: 'Kannst du die Rechnung prüfen?'
			}),
			contribution({
				contributorKind: 'agent',
				kind: 'message',
				text: 'Ja, der Gesamtbetrag ist 249,00 €.'
			}),
			contribution({ kind: 'file-upload', payload: { originalName: 'rechnung-01.pdf' } })
		])
		expect(entries).toHaveLength(1)
		expect(entries[0].step).toBe('File uploaded')
		expect(entries.some((e) => e.note?.includes('Rechnung prüfen'))).toBe(false)
	})

	test('keeps the file upload as a typed timeline entry', () => {
		const [entry] = persistentLogEntries([
			contribution({ kind: 'file-upload', payload: { originalName: 'rechnung-01.pdf' } })
		])
		expect(entry.step).toBe('File uploaded')
		expect(entry.skill).toBe('file')
		expect(entry.state).toBe('done')
		expect(entry.note).toBe('rechnung-01.pdf')
	})

	test('labels intent lifecycle events instead of mislabeling them as agent responses', () => {
		const entries = persistentLogEntries([
			contribution({
				contributorKind: 'system',
				kind: 'intent-created',
				payload: { triggerKind: 'human' }
			}),
			contribution({
				contributorKind: 'system',
				kind: 'intents-merged',
				payload: { sourceIntentIds: ['a', 'b'] }
			})
		])
		expect(entries.map((e) => e.step)).toEqual(['Intent created', 'Intents merged'])
		expect(entries.every((e) => e.skill === 'system')).toBe(true)
		expect(entries[1].note).toBe('2 intents merged in')
	})

	test('keeps unknown contribution kinds so future skill activity still lands in the log', () => {
		const [entry] = persistentLogEntries([
			contribution({
				contributorKind: 'skill',
				kind: 'invoice-extraction',
				text: 'supplier: Muster AG'
			})
		])
		expect(entry.step).toBe('Contribution')
		expect(entry.skill).toBe('skill')
		expect(entry.note).toBe('supplier: Muster AG')
	})

	test('prefers text over payload for the note', () => {
		const [entry] = persistentLogEntries([
			contribution({
				contributorKind: 'skill',
				kind: 'some-activity',
				text: 'done',
				payload: { originalName: 'x.pdf' }
			})
		])
		expect(entry.note).toBe('done')
	})

	test('preserves contribution order and renders a timestamp per entry', () => {
		const entries = persistentLogEntries([
			contribution({
				kind: 'intent-created',
				contributorKind: 'system',
				createdAt: '2026-08-27T10:00:00Z'
			}),
			contribution({
				kind: 'file-upload',
				createdAt: '2026-08-27T10:05:00Z',
				payload: { originalName: 'a.pdf' }
			})
		])
		expect(entries.map((e) => e.step)).toEqual(['Intent created', 'File uploaded'])
		for (const entry of entries) {
			expect(entry.when).not.toBe('')
			expect(Number.isNaN(Date.parse(entry.when))).toBe(false)
		}
	})

	test('returns an empty log when messages are the only contributions', () => {
		const entries = persistentLogEntries([
			contribution({ contributorKind: 'human', kind: 'message', text: 'hi' }),
			contribution({ contributorKind: 'agent', kind: 'message', text: 'hallo' })
		])
		expect(entries).toEqual([])
	})
})
