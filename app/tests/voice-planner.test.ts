import { describe, expect, test } from 'bun:test'
import { FakeVoiceBackend } from '../src/lib/voice/fake'
import { SpeechPlanner } from '../src/lib/voice/speech-planner'

describe('SpeechPlanner', () => {
	test('streams complete sentences and preserves a contiguous index', () => {
		const planner = new SpeechPlanner()
		expect(planner.feed('Hallo Welt. Noch')).toEqual([{ index: 0, text: 'Hallo Welt.' }])
		expect(planner.feed(' ein Satz! ')).toEqual([{ index: 1, text: 'Noch ein Satz!' }])
		expect(planner.flush()).toEqual([])
	})

	test('uses an opening clause to reduce first audio latency', () => {
		const planner = new SpeechPlanner()
		const planned = planner.feed(
			'Dies ist eine absichtlich sehr lange eröffnende Formulierung, danach geht es weiter'
		)
		expect(planned).toEqual([
			{ index: 0, text: 'Dies ist eine absichtlich sehr lange eröffnende Formulierung,' }
		])
	})

	test('bounds Unicode scalar values and drops punctuation-only output', () => {
		const planner = new SpeechPlanner()
		expect(planner.feed('!!! ')).toEqual([])
		const planned = planner.feed(`${'ä'.repeat(1_025)}. `)
		expect(planned.map((segment) => [...segment.text].length)).toEqual([512, 512, 2])
		expect(planned.map((segment) => segment.index)).toEqual([0, 1, 2])
	})

	test('reset discards pending text and restarts indices', () => {
		const planner = new SpeechPlanner()
		planner.feed('unfinished')
		planner.reset()
		expect(planner.feed('Neu. ')).toEqual([{ index: 0, text: 'Neu.' }])
	})
})

describe('FakeVoiceBackend', () => {
	test('is semantic and deterministic', async () => {
		const backend = new FakeVoiceBackend()
		const seen: string[] = []
		backend.subscribe((envelope) => seen.push(`${envelope.sequence}:${envelope.event.type}`))
		await backend.startSession({})
		backend.emit({
			type: 'input.candidate_started',
			candidate_id: 'candidate',
			far_end_active: false
		})
		backend.emit({
			type: 'input.confirmed',
			candidate_id: 'candidate',
			barge_in_started: true
		})
		expect(seen).toEqual(['1:input.candidate_started', '2:input.confirmed'])
	})
})
