import { isTauri } from '@tauri-apps/api/core'
import { voiceController } from '$lib/voice/controller.svelte'
import type { SessionId, SpeakerAttribution } from '$lib/voice/protocol'

export type ListenerStatus = 'unavailable' | 'preparing' | 'listening' | 'denied' | 'error'

export interface ListenerHooks {
	/** ASR-confirmed speech that is safe to submit and interrupt with. */
	onSpeechStart?: () => void
	onPartial?: (text: string) => void
	onSpeaker?: (speaker: SpeakerAttribution) => void
	onUtterance?: (
		text: string,
		speaker: SpeakerAttribution | null,
		sessionId: SessionId | null
	) => void
}

/**
 * Semantic view of the native input rail. Microphone capture, resampling, VAD,
 * recognition, echo safety, and recovery are all owned by the Rust runtime.
 */
export class Listener {
	#localFailure = $state<string | null>(null)
	#unsubscribe: (() => void) | null

	constructor(hooks: ListenerHooks = {}) {
		this.#unsubscribe = voiceController.onInput({
			onConfirmed: hooks.onSpeechStart,
			onPartial: hooks.onPartial,
			onSpeaker: hooks.onSpeaker,
			onFinal: hooks.onUtterance
		})
	}

	dispose(): void {
		this.#unsubscribe?.()
		this.#unsubscribe = null
	}

	get available(): boolean {
		return isTauri()
	}

	get status(): ListenerStatus {
		if (!this.available) return 'unavailable'
		if (voiceController.capture === 'denied') return 'denied'
		if (voiceController.capture === 'failed' || voiceController.runtime === 'failed') return 'error'
		if (voiceController.capture === 'live') return 'listening'
		return 'preparing'
	}

	get speech(): boolean {
		return voiceController.hearing
	}

	get partial(): string {
		return voiceController.partial
	}

	get speaker(): SpeakerAttribution | null {
		return voiceController.speaker
	}

	get progress(): number {
		return voiceController.inputModelProgress
	}

	get level(): number {
		return Math.min(voiceController.snapshot?.echo.clean_rms ?? 0, 1)
	}

	get rate(): number {
		return voiceController.snapshot?.route?.input_rate_hz ?? 0
	}

	get pushes(): number {
		return 0
	}

	get probability(): number {
		return voiceController.snapshot?.utterance.vad_probability ?? 0
	}

	get stage(): 'download' | 'load' | 'ready' {
		return voiceController.inputModelStage
	}

	get dropped(): number {
		return Number(voiceController.snapshot?.capture.overruns ?? 0)
	}

	get restarts(): number {
		return voiceController.session === 'recovering' ? 1 : 0
	}

	get failure(): string | null {
		return this.#localFailure ?? voiceController.failure
	}

	set failure(value: string | null) {
		this.#localFailure = value
		if (value === null) voiceController.failure = null
	}

	async start(): Promise<void> {
		this.#localFailure = null
		await voiceController.start()
	}

	stop(): void {
		void voiceController.stop()
	}

	async reset(): Promise<void> {
		await voiceController.resetInput()
	}
}
