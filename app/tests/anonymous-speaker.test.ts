import { describe, expect, test } from 'bun:test'
import {
	anonymousSpeaker,
	anonymousSpeakerFromPayload,
	anonymousSpeakerPayload,
	anonymousSpeakerTone
} from '../src/lib/chat/anonymous-speaker'

describe('anonymous speaker contribution metadata', () => {
	test('keeps the diarization label scoped to its native voice session', () => {
		const first = anonymousSpeaker('session-a', { speaker_id: 'speaker-1', confidence: 0.84 })
		const restarted = anonymousSpeaker('session-b', {
			speaker_id: 'speaker-1',
			confidence: 0.9
		})

		expect(first).toEqual({
			session_id: 'session-a',
			speaker_id: 'speaker-1',
			confidence: 0.84
		})
		expect(restarted?.session_id).not.toBe(first?.session_id)
	})

	test('round-trips through an Intent Service contribution payload', () => {
		const speaker = anonymousSpeaker('session-a', {
			speaker_id: 'speaker-2',
			confidence: 0.72
		})
		const payload = anonymousSpeakerPayload(speaker ?? undefined)

		expect(anonymousSpeakerFromPayload(payload)).toEqual(speaker)
		expect(anonymousSpeakerTone(speaker ?? undefined)).toBe('two')
	})

	test('rejects malformed persisted metadata and leaves typed input neutral', () => {
		expect(anonymousSpeaker(null, { speaker_id: 'speaker-1', confidence: 1 })).toBeNull()
		expect(anonymousSpeakerFromPayload({ anonymousSpeaker: { speaker_id: 'admin' } })).toBeNull()
		expect(
			anonymousSpeakerFromPayload({
				anonymousSpeaker: {
					session_id: 'session-a',
					speaker_id: 'speaker-2',
					confidence: 2
				}
			})
		).toBeNull()
		expect(anonymousSpeakerPayload(undefined)).toEqual({})
	})
})
