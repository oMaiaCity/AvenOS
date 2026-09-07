import type {
	EnqueueResult,
	InputResetReason,
	PreparationSnapshot,
	SessionId,
	SpeechCancelReason,
	SpeechTurnStarted,
	TurnId,
	VoiceEventEnvelope,
	VoiceFeature,
	VoiceSessionStarted,
	VoiceSnapshot
} from './protocol'

export interface VoiceSessionOptions {
	preferred_input?: string
	preferred_output?: string
}

export interface BeginSpeech {
	session_id: SessionId
	client_turn_key?: string
	language: string
	voice: string
}

export interface SpeechSegment {
	session_id: SessionId
	turn_id: TurnId
	segment_index: number
	text: string
}

export interface CancelSpeech {
	session_id: SessionId
	turn_id?: TurnId
	reason: SpeechCancelReason
}

export type Unsubscribe = () => void

export interface ModelLoadStatus {
	feature: 'asr' | 'tts'
	stage: 'download' | 'load' | 'ready'
	progress: number
}

export interface VoiceBackend {
	prepare(features: VoiceFeature[]): Promise<PreparationSnapshot>
	startSession(options: VoiceSessionOptions): Promise<VoiceSessionStarted>
	stopSession(sessionId: SessionId): Promise<void>
	beginSpeech(request: BeginSpeech): Promise<SpeechTurnStarted>
	enqueueSpeech(segment: SpeechSegment): Promise<EnqueueResult>
	finishSpeech(sessionId: SessionId, turnId: TurnId): Promise<void>
	cancelSpeech(request: CancelSpeech): Promise<void>
	resetInput(sessionId: SessionId, reason: InputResetReason): Promise<void>
	snapshot(sessionId?: SessionId): Promise<VoiceSnapshot>
	setDiagnostics(sessionId: SessionId, enabled: boolean): Promise<void>
	subscribe(handler: (event: VoiceEventEnvelope) => void): Unsubscribe
	waitForEventSubscription?(): Promise<void>
	subscribeModelStatus?(handler: (status: ModelLoadStatus) => void): Unsubscribe
}
