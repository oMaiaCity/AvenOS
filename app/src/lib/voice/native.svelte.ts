import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
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
	RequestId,
	SessionId,
	SpeechTurnStarted,
	TurnId,
	VoiceDiagnosticsSubscribeRequest,
	VoiceEventEnvelope,
	VoiceFeature,
	VoiceInputResetRequest,
	VoicePrepareRequest,
	VoiceSessionStarted,
	VoiceSessionStartRequest,
	VoiceSessionStopRequest,
	VoiceSnapshot,
	VoiceSnapshotRequest,
	VoiceSpeechBeginRequest,
	VoiceSpeechCancelRequest,
	VoiceSpeechEnqueueRequest,
	VoiceSpeechFinishRequest
} from './protocol'

const PROTOCOL_VERSION = 1
let nextRequest = 0

function meta(): { protocol_version: number; request_id: RequestId } {
	nextRequest++
	return {
		protocol_version: PROTOCOL_VERSION,
		request_id: `web-${nextRequest.toString(36)}`
	}
}

export class TauriNativeVoiceBackend implements VoiceBackend {
	#eventSubscriptionReady: Promise<void> = Promise.resolve()

	async prepare(features: VoiceFeature[]): Promise<PreparationSnapshot> {
		if (features.includes('input') && /Android/i.test(navigator.userAgent)) {
			await invoke('plugin:android-passkey|request_microphone')
		}
		const request: VoicePrepareRequest = { ...meta(), features }
		return await invoke('voice_prepare', { request })
	}

	startSession(options: VoiceSessionOptions): Promise<VoiceSessionStarted> {
		const request: VoiceSessionStartRequest = {
			...meta(),
			mode: 'conversation',
			preferred_input: options.preferred_input ?? null,
			preferred_output: options.preferred_output ?? null
		}
		return invoke('voice_session_start', { request })
	}

	stopSession(sessionId: SessionId): Promise<void> {
		const request: VoiceSessionStopRequest = { ...meta(), session_id: sessionId }
		return invoke('voice_session_stop', { request })
	}

	beginSpeech(value: BeginSpeech): Promise<SpeechTurnStarted> {
		const request: VoiceSpeechBeginRequest = {
			...meta(),
			session_id: value.session_id,
			client_turn_key: value.client_turn_key ?? null,
			language: value.language,
			voice: value.voice
		}
		return invoke('voice_speech_begin', { request })
	}

	enqueueSpeech(value: SpeechSegment): Promise<EnqueueResult> {
		const request: VoiceSpeechEnqueueRequest = { ...meta(), ...value }
		return invoke('voice_speech_enqueue', { request })
	}

	finishSpeech(sessionId: SessionId, turnId: TurnId): Promise<void> {
		const request: VoiceSpeechFinishRequest = {
			...meta(),
			session_id: sessionId,
			turn_id: turnId
		}
		return invoke('voice_speech_finish', { request })
	}

	cancelSpeech(value: CancelSpeech): Promise<void> {
		const request: VoiceSpeechCancelRequest = {
			...meta(),
			session_id: value.session_id,
			turn_id: value.turn_id ?? null,
			reason: value.reason
		}
		return invoke('voice_speech_cancel', { request })
	}

	resetInput(sessionId: SessionId, reason: InputResetReason): Promise<void> {
		const request: VoiceInputResetRequest = { ...meta(), session_id: sessionId, reason }
		return invoke('voice_input_reset', { request })
	}

	snapshot(sessionId?: SessionId): Promise<VoiceSnapshot> {
		const request: VoiceSnapshotRequest = { ...meta(), session_id: sessionId ?? null }
		return invoke('voice_snapshot', { request })
	}

	setDiagnostics(sessionId: SessionId, enabled: boolean): Promise<void> {
		const request: VoiceDiagnosticsSubscribeRequest = {
			...meta(),
			session_id: sessionId,
			enabled
		}
		return invoke('voice_diagnostics_subscribe', { request })
	}

	subscribe(handler: (event: VoiceEventEnvelope) => void): Unsubscribe {
		let active = true
		let release: Unsubscribe | undefined
		this.#eventSubscriptionReady = listen<VoiceEventEnvelope>('voice-event', ({ payload }) => {
			if (active) handler(payload)
		}).then((unlisten) => {
			if (active) release = unlisten
			else unlisten()
		})
		return () => {
			active = false
			release?.()
		}
	}

	waitForEventSubscription(): Promise<void> {
		return this.#eventSubscriptionReady
	}

	subscribeModelStatus(handler: (status: ModelLoadStatus) => void): Unsubscribe {
		let active = true
		const releases: Unsubscribe[] = []
		const track = (promise: Promise<Unsubscribe>) => {
			void promise.then((unlisten) => {
				if (active) releases.push(unlisten)
				else unlisten()
			})
		}
		track(
			listen<{ feature: string; received: number; total: number; done: boolean }>(
				'model-progress',
				({ payload }) => {
					if (!active || (payload.feature !== 'asr' && payload.feature !== 'tts')) return
					handler({
						feature: payload.feature,
						stage: 'download',
						progress: payload.done
							? 1
							: payload.total > 0
								? Math.min(payload.received / payload.total, 1)
								: 0
					})
				}
			)
		)
		track(
			listen<[string, string]>('model-stage', ({ payload: [feature, stage] }) => {
				if (
					!active ||
					(feature !== 'asr' && feature !== 'tts') ||
					(stage !== 'download' && stage !== 'load' && stage !== 'ready')
				)
					return
				handler({ feature, stage, progress: stage === 'ready' ? 1 : 0 })
			})
		)
		return () => {
			active = false
			for (const release of releases.splice(0)) release()
		}
	}
}
