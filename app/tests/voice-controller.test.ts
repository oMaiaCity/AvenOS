import { beforeAll, describe, expect, test } from 'bun:test'
import { FakeVoiceBackend } from '../src/lib/voice/fake'

let VoiceController: typeof import('../src/lib/voice/controller.svelte').VoiceController

beforeAll(async () => {
	;(globalThis as typeof globalThis & { $state: <T>(value: T) => T }).$state = <T>(value: T) =>
		value
	VoiceController = (await import('../src/lib/voice/controller.svelte')).VoiceController
})

describe('VoiceController', () => {
	test('candidate UI never confirms until the ordered semantic confirmation', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		let candidates = 0
		let confirmations = 0
		const finals: string[] = []
		controller.onInput({
			onCandidate: () => candidates++,
			onConfirmed: () => confirmations++,
			onFinal: (text) => finals.push(text)
		})

		backend.emit({
			type: 'input.candidate_started',
			candidate_id: 'candidate-1',
			far_end_active: true
		})
		backend.emit({ type: 'input.partial', candidate_id: 'candidate-1', text: 'Hallo' })
		expect({ candidates, confirmations, hearing: controller.hearing }).toEqual({
			candidates: 1,
			confirmations: 0,
			hearing: true
		})

		backend.emit({
			type: 'input.confirmed',
			candidate_id: 'candidate-1',
			barge_in_started: true
		})
		backend.emit({
			type: 'input.confirmed',
			candidate_id: 'candidate-1',
			barge_in_started: true
		})
		backend.emit({ type: 'input.final', candidate_id: 'candidate-1', text: 'Hallo Welt' })
		expect(confirmations).toBe(1)
		expect(finals).toEqual(['Hallo Welt'])
		expect(controller.hearing).toBe(false)
		controller.dispose()
	})

	test('rejects stale session, route, and sequence envelopes', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		backend.emit(
			{ type: 'input.partial', candidate_id: 'candidate-stale', text: 'wrong session' },
			{ session_id: 'another-session' }
		)
		backend.emit(
			{ type: 'input.partial', candidate_id: 'candidate-stale', text: 'wrong route' },
			{ route_generation: '999' }
		)
		backend.emit(
			{ type: 'input.partial', candidate_id: 'candidate-current', text: 'fresh' },
			{ sequence: 10 }
		)
		backend.emit(
			{ type: 'input.partial', candidate_id: 'candidate-stale', text: 'old sequence' },
			{ sequence: 9 }
		)
		expect(controller.partial).toBe('fresh')
		controller.dispose()
	})

	test('correlates an anonymous speaker label with the accepted final candidate', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		const speakers: string[] = []
		const finals: Array<{ text: string; speaker: string | null; session: string | null }> = []
		controller.onInput({
			onSpeaker: (speaker) => speakers.push(speaker.speaker_id),
			onFinal: (text, speaker, session) =>
				finals.push({ text, speaker: speaker?.speaker_id ?? null, session })
		})

		backend.emit({
			type: 'input.candidate_started',
			candidate_id: 'candidate-speaker',
			far_end_active: false
		})
		backend.emit({
			type: 'input.speaker_identified',
			candidate_id: 'candidate-speaker',
			speaker: { speaker_id: 'speaker-2', confidence: 0.82 }
		})
		backend.emit({
			type: 'input.final',
			candidate_id: 'candidate-speaker',
			text: 'Ich übernehme das.'
		})

		expect(speakers).toEqual(['speaker-2'])
		expect(finals).toEqual([
			{ text: 'Ich übernehme das.', speaker: 'speaker-2', session: controller.sessionId }
		])
		expect(controller.speaker?.speaker_id).toBe('speaker-2')
		controller.dispose()
	})

	test('replaces a suspended session instead of treating it as started', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		const oldSession = controller.sessionId
		expect(oldSession).not.toBeNull()
		backend.emit({ type: 'status.session', status: 'suspended' })
		await controller.start()
		expect(controller.sessionId).not.toBe(oldSession)
		expect(backend.stoppedSessions).toContain(oldSession)
		controller.dispose()
	})

	test('one-off preview completes through semantic playback events', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		await controller.previewSpeech('Eine Vorschau.', 'M1')
		expect(backend.segments.map((segment) => segment.text)).toEqual(['Eine Vorschau.'])
		expect(controller.speaking).toBe(false)
		controller.dispose()
	})

	test('authoritative playback events restore and cancel an active narrated turn', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		backend.emit({ type: 'playback.turn_started', turn_id: 'restored-turn' })
		backend.emit({ type: 'playback.started', turn_id: 'restored-turn' })
		expect(controller.speaking).toBe(true)
		controller.cancelSpeech('manual')
		backend.emit({
			type: 'playback.cancelled',
			turn_id: 'restored-turn',
			reason: 'barge_in'
		})
		expect(controller.speaking).toBe(false)
		controller.dispose()
	})

	test('an enqueue rejection aborts queued indices and the next turn restarts at zero', async () => {
		class RejectFirstEnqueueBackend extends FakeVoiceBackend {
			readonly attemptedIndices: number[] = []
			#reject = true

			override async enqueueSpeech(
				segment: Parameters<FakeVoiceBackend['enqueueSpeech']>[0]
			): ReturnType<FakeVoiceBackend['enqueueSpeech']> {
				this.attemptedIndices.push(segment.segment_index)
				if (this.#reject) {
					this.#reject = false
					throw new Error('synthetic queue rejection')
				}
				return super.enqueueSpeech(segment)
			}
		}

		const backend = new RejectFirstEnqueueBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		controller.feedSpeech('Erster Satz. ', 'M1')
		controller.feedSpeech('Zweiter Satz. ', 'M1')
		controller.finishSpeech('M1')
		await settleAsyncWork()
		expect(backend.attemptedIndices).toEqual([0])
		expect(controller.failure).toBe('synthetic queue rejection')

		controller.feedSpeech('Neuer Versuch. ', 'M1')
		controller.finishSpeech('M1')
		await settleAsyncWork()
		expect(backend.attemptedIndices).toEqual([0, 0])
		expect(backend.segments.map((segment) => segment.segment_index)).toEqual([0])
		controller.dispose()
	})

	test('waits for native capacity before enqueueing the next contiguous segment', async () => {
		class OneSlotBackend extends FakeVoiceBackend {
			readonly attemptedIndices: number[] = []

			override async beginSpeech(
				request: Parameters<FakeVoiceBackend['beginSpeech']>[0]
			): ReturnType<FakeVoiceBackend['beginSpeech']> {
				const begun = await super.beginSpeech(request)
				return { ...begun, pending_segment_capacity: 1 }
			}

			override async enqueueSpeech(
				segment: Parameters<FakeVoiceBackend['enqueueSpeech']>[0]
			): ReturnType<FakeVoiceBackend['enqueueSpeech']> {
				this.attemptedIndices.push(segment.segment_index)
				await super.enqueueSpeech(segment)
				return { accepted: true, idempotent: false, remaining_segment_capacity: 0 }
			}
		}

		const backend = new OneSlotBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		controller.feedSpeech('Erster Satz. ', 'M1')
		controller.feedSpeech('Zweiter Satz. ', 'M1')
		controller.finishSpeech('M1')
		await settleAsyncWork()
		expect(backend.attemptedIndices).toEqual([0])

		backend.emit({ type: 'capacity.changed', pending_segments: 0, synthesized_lead_ms: 0 })
		await settleAsyncWork()
		expect(backend.attemptedIndices).toEqual([0, 1])
		controller.dispose()
	})

	test('tracks download and load progress independently for both models', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		const starting = controller.start()
		backend.emitModelStatus({ feature: 'asr', stage: 'download', progress: 0.4 })
		backend.emitModelStatus({ feature: 'tts', stage: 'load', progress: 0 })
		expect(controller.inputModelStage).toBe('download')
		expect(controller.inputModelProgress).toBe(0.4)
		expect(controller.outputModelStage).toBe('load')
		await starting
		expect(controller.inputModelStage).toBe('ready')
		expect(controller.outputModelStage).toBe('ready')
		controller.dispose()
	})

	test('enables live diagnostics and releases every subscription on dispose', async () => {
		const backend = new FakeVoiceBackend()
		const controller = new VoiceController(backend)
		await controller.start()
		expect(backend.subscriberCount).toBe(2)
		expect(backend.diagnostics.at(-1)).toEqual({
			sessionId: controller.sessionId,
			enabled: true
		})
		controller.dispose()
		expect(backend.subscriberCount).toBe(0)
		await Promise.resolve()
		expect(backend.diagnostics.at(-1)?.enabled).toBe(false)
	})
})

async function settleAsyncWork(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve()
	await new Promise((resolve) => setTimeout(resolve, 0))
}
