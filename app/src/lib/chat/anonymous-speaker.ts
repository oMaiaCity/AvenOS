import type { SessionId, SpeakerAttribution, SpeakerId } from '$lib/voice/protocol'

/**
 * A diarization label is meaningful only inside the native voice session that
 * produced it. Keeping that scope beside the label prevents a later
 * `speaker-1` from being mistaken for the same person after voice restarts.
 */
export interface AnonymousSpeaker {
	session_id: SessionId
	speaker_id: SpeakerId
	confidence: number
}

export type AnonymousSpeakerTone = 'one' | 'two' | 'three'

export function anonymousSpeaker(
	sessionId: SessionId | null,
	attribution: SpeakerAttribution | null
): AnonymousSpeaker | null {
	if (!sessionId || !attribution) return null
	return {
		session_id: sessionId,
		speaker_id: attribution.speaker_id,
		confidence: attribution.confidence
	}
}

/** Read the untrusted JSON payload returned by the Intent Service. */
export function anonymousSpeakerFromPayload(payload: unknown): AnonymousSpeaker | null {
	if (!isRecord(payload)) return null
	const value = payload.anonymousSpeaker
	if (!isRecord(value)) return null
	if (
		typeof value.session_id !== 'string' ||
		value.session_id.length === 0 ||
		value.session_id.length > 256 ||
		typeof value.speaker_id !== 'string' ||
		!/^speaker-[1-9]\d*$/.test(value.speaker_id) ||
		typeof value.confidence !== 'number' ||
		!Number.isFinite(value.confidence) ||
		value.confidence < 0 ||
		value.confidence > 1
	) {
		return null
	}
	return {
		session_id: value.session_id,
		speaker_id: value.speaker_id,
		confidence: value.confidence
	}
}

export function anonymousSpeakerPayload(
	speaker: AnonymousSpeaker | undefined
): Record<string, unknown> {
	return speaker ? { anonymousSpeaker: speaker } : {}
}

export function anonymousSpeakerTone(speaker: AnonymousSpeaker | undefined): AnonymousSpeakerTone {
	const ordinal = Number(speaker?.speaker_id.match(/\d+$/)?.[0] ?? 1)
	return (ordinal - 1) % 3 === 1 ? 'two' : (ordinal - 1) % 3 === 2 ? 'three' : 'one'
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
