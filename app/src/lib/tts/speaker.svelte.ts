import { isTauri } from '@tauri-apps/api/core'
import { settings } from '$lib/settings.svelte'
import { voiceController } from '$lib/voice/controller.svelte'

export type SpeakerStatus = 'unavailable' | 'preparing' | 'ready' | 'error'

/** Semantic view of the one native TTS/playback rail. */
export class Speaker {
	muted = $state(import.meta.env.VITE_AVEN_E2E === 'true')
	#localFailure = $state<string | null>(null)

	constructor() {
		if (isTauri() && import.meta.env.VITE_AVEN_E2E !== 'true') void voiceController.start()
	}

	get status(): SpeakerStatus {
		if (!isTauri()) return 'unavailable'
		if (voiceController.runtime === 'failed') return 'error'
		return voiceController.runtime === 'ready' ? 'ready' : 'preparing'
	}

	get on(): boolean {
		return this.status === 'ready' || this.status === 'preparing'
	}

	get speaking(): boolean {
		return voiceController.speaking
	}

	get failure(): string | null {
		return this.#localFailure ?? voiceController.failure
	}

	set failure(value: string | null) {
		this.#localFailure = value
		if (value === null) voiceController.failure = null
	}

	get progress(): number {
		return voiceController.outputModelProgress
	}

	get output(): 'running' | 'suspended' | 'none' {
		if (voiceController.session === 'active') return 'running'
		if (voiceController.session === 'suspended') return 'suspended'
		return 'none'
	}

	get inflight(): number {
		return voiceController.snapshot?.synthesis.worker.status === 'processing' ? 1 : 0
	}

	get decoded(): number {
		return 0
	}

	get lead(): number {
		return voiceController.snapshot?.playback.buffered_seconds ?? 0
	}

	resumeAudio(): void {
		if (!this.muted) void voiceController.start()
	}

	feed(delta: string): void {
		if (!this.on || this.muted) return
		voiceController.feedSpeech(delta, settings.voice)
	}

	flush(): void {
		if (!this.on || this.muted) return
		voiceController.finishSpeech(settings.voice)
	}

	silence(): void {
		voiceController.cancelSpeech(this.muted ? 'muted' : 'manual')
	}
}
