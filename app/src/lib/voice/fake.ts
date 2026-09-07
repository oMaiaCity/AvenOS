import type {
	BeginSpeech,
	CancelSpeech,
	ModelLoadStatus,
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
	VoiceEvent,
	VoiceEventEnvelope,
	VoiceFeature,
	VoiceSessionStarted,
	VoiceSnapshot
} from './protocol'

export class FakeVoiceBackend implements VoiceBackend {
	#handlers = new Set<(event: VoiceEventEnvelope) => void>()
	#modelHandlers = new Set<(status: ModelLoadStatus) => void>()
	#sequence = 0
	#session = 0
	#turn = 0
	#routeGeneration = 0
	#activeSession: SessionId | undefined
	readonly segments: SpeechSegment[] = []
	readonly cancellations: CancelSpeech[] = []
	readonly stoppedSessions: SessionId[] = []
	readonly diagnostics: Array<{ sessionId: SessionId; enabled: boolean }> = []

	get subscriberCount(): number {
		return this.#handlers.size + this.#modelHandlers.size
	}

	async prepare(features: VoiceFeature[]): Promise<PreparationSnapshot> {
		return {
			runtime: 'ready',
			input_ready: features.includes('input'),
			output_ready: features.includes('output')
		}
	}

	async startSession(_options: VoiceSessionOptions): Promise<VoiceSessionStarted> {
		this.#session++
		this.#routeGeneration++
		this.#activeSession = `fake-session-${this.#session}`
		return {
			session_id: this.#activeSession,
			snapshot: fakeSnapshot(this.#activeSession, this.#routeGeneration)
		}
	}

	async stopSession(sessionId: SessionId): Promise<void> {
		this.stoppedSessions.push(sessionId)
		if (this.#activeSession === sessionId) this.#activeSession = undefined
	}

	async beginSpeech(_request: BeginSpeech): Promise<SpeechTurnStarted> {
		this.#turn++
		return { turn_id: `fake-turn-${this.#turn}`, pending_segment_capacity: 8 }
	}

	async enqueueSpeech(segment: SpeechSegment): Promise<EnqueueResult> {
		this.segments.push(segment)
		return { accepted: true, idempotent: false, remaining_segment_capacity: 8 }
	}

	async finishSpeech(_sessionId: SessionId, turnId: TurnId): Promise<void> {
		this.emit({ type: 'playback.started', turn_id: turnId })
		this.emit({ type: 'playback.completed', turn_id: turnId })
	}

	async cancelSpeech(request: CancelSpeech): Promise<void> {
		this.cancellations.push(request)
	}

	async resetInput(_sessionId: SessionId, _reason: InputResetReason): Promise<void> {}

	async snapshot(sessionId?: SessionId): Promise<VoiceSnapshot> {
		return fakeSnapshot(sessionId ?? this.#activeSession, this.#routeGeneration)
	}

	async setDiagnostics(sessionId: SessionId, enabled: boolean): Promise<void> {
		this.diagnostics.push({ sessionId, enabled })
	}

	subscribe(handler: (event: VoiceEventEnvelope) => void): Unsubscribe {
		this.#handlers.add(handler)
		return () => this.#handlers.delete(handler)
	}

	subscribeModelStatus(handler: (status: ModelLoadStatus) => void): Unsubscribe {
		this.#modelHandlers.add(handler)
		return () => this.#modelHandlers.delete(handler)
	}

	emitModelStatus(status: ModelLoadStatus): void {
		for (const handler of this.#modelHandlers) handler(status)
	}

	emit(
		event: VoiceEvent,
		override: {
			session_id?: SessionId | null
			route_generation?: string | null
			sequence?: number
		} = {}
	): void {
		this.#sequence = override.sequence ?? this.#sequence + 1
		const envelope: VoiceEventEnvelope = {
			protocol_version: 1,
			sequence: String(this.#sequence),
			session_id:
				override.session_id === undefined ? (this.#activeSession ?? null) : override.session_id,
			route_generation:
				override.route_generation === undefined
					? this.#activeSession
						? String(this.#routeGeneration)
						: null
					: override.route_generation,
			at_mono_ms: this.#sequence,
			event
		}
		for (const handler of this.#handlers) handler(envelope)
	}
}

function fakeSnapshot(sessionId?: SessionId, routeGeneration = 0): VoiceSnapshot {
	return {
		runtime: 'ready',
		session: { status: sessionId ? 'active' : 'closed', session_id: sessionId ?? null },
		route: sessionId
			? {
					route_id: `fake-route-${routeGeneration}`,
					generation: String(routeGeneration),
					input_rate_hz: 48_000,
					input_channels: 1,
					output_rate_hz: 48_000,
					output_channels: 1,
					input_callback_frames: 480,
					output_callback_frames: 480,
					input_timestamp_quality: 'hardware',
					output_timestamp_quality: 'hardware',
					full_duplex_barge_in: false
				}
			: null,
		capture: { status: sessionId ? 'live' : 'closed', callback_age_ms: 0, overruns: '0' },
		echo: {
			status: 'bypassed',
			delay_hint_ms: null,
			drift_correction_ppm: 0,
			render_rms: 0,
			render_peak: 0,
			raw_rms: 0,
			raw_peak: 0,
			clean_rms: 0,
			clean_peak: 0,
			clipped_fraction: 0,
			echo_return_loss_db: null,
			echo_return_loss_enhancement_db: null,
			residual_echo_likelihood: null,
			reference_overruns: '0'
		},
		utterance: { status: 'idle', candidate_id: null, vad_probability: 0, partial: '' },
		recognizer: { status: 'sleeping', last_duration_ms: null },
		synthesis: {
			worker: { status: 'sleeping', last_duration_ms: null },
			turn_id: null,
			segment_index: null
		},
		playback: {
			status: 'silent',
			speaking: false,
			queued_seconds: 0,
			buffered_seconds: 0,
			underruns: '0'
		},
		queues: [],
		workers: [],
		recent_errors: []
	}
}
