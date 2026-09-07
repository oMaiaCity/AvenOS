import type {
	BeginSpeech,
	CancelSpeech,
	SpeechSegment,
	Unsubscribe,
	VoiceBackend,
	VoiceSessionOptions
} from './backend'
import type {
	EnqueueResult,
	InputResetReason,
	PreparationSnapshot,
	SessionId,
	SpeechTurnStarted,
	TurnId,
	VoiceEventEnvelope,
	VoiceFeature,
	VoiceSessionStarted,
	VoiceSnapshot
} from './protocol'

const UNAVAILABLE = new Error('Native voice is unavailable in this browser.')

export class UnavailableVoiceBackend implements VoiceBackend {
	async prepare(_features: VoiceFeature[]): Promise<PreparationSnapshot> {
		return { runtime: 'dormant', input_ready: false, output_ready: false }
	}
	async startSession(_options: VoiceSessionOptions): Promise<VoiceSessionStarted> {
		throw UNAVAILABLE
	}
	async stopSession(_sessionId: SessionId): Promise<void> {}
	async beginSpeech(_request: BeginSpeech): Promise<SpeechTurnStarted> {
		throw UNAVAILABLE
	}
	async enqueueSpeech(_segment: SpeechSegment): Promise<EnqueueResult> {
		throw UNAVAILABLE
	}
	async finishSpeech(_sessionId: SessionId, _turnId: TurnId): Promise<void> {}
	async cancelSpeech(_request: CancelSpeech): Promise<void> {}
	async resetInput(_sessionId: SessionId, _reason: InputResetReason): Promise<void> {}
	async snapshot(_sessionId?: SessionId): Promise<VoiceSnapshot> {
		throw UNAVAILABLE
	}
	async setDiagnostics(_sessionId: SessionId, _enabled: boolean): Promise<void> {}
	subscribe(_handler: (event: VoiceEventEnvelope) => void): Unsubscribe {
		return () => {}
	}
}
