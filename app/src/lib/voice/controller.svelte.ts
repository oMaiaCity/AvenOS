import { isTauri } from '@tauri-apps/api/core'
import type { VoiceBackend } from './backend'
import { TauriNativeVoiceBackend } from './native.svelte'
import type {
	CandidateId,
	EchoStatus,
	SessionId,
	SpeakerAttribution,
	TurnId,
	VoiceEventEnvelope,
	VoiceSnapshot
} from './protocol'
import { type PlannedSegment, SpeechPlanner } from './speech-planner'
import { UnavailableVoiceBackend } from './unavailable'

export interface InputHooks {
	onCandidate?: () => void
	onPartial?: (text: string) => void
	onConfirmed?: () => void
	onSpeaker?: (speaker: SpeakerAttribution) => void
	onFinal?: (text: string, speaker: SpeakerAttribution | null, sessionId: SessionId | null) => void
	onDiscarded?: () => void
}

export interface PlaybackHooks {
	onSpeaking?: (speaking: boolean) => void
}

export class VoiceController {
	readonly backend: VoiceBackend
	sessionId = $state<SessionId | null>(null)
	runtime = $state<'dormant' | 'preparing' | 'ready' | 'failed'>('dormant')
	session = $state<'closed' | 'opening' | 'active' | 'suspended' | 'recovering'>('closed')
	capture = $state<'closed' | 'starting' | 'live' | 'denied' | 'failed'>('closed')
	echo = $state<EchoStatus>('bypassed')
	partial = $state('')
	speaker = $state<SpeakerAttribution | null>(null)
	hearing = $state(false)
	speaking = $state(false)
	failure = $state<string | null>(null)
	snapshot = $state<VoiceSnapshot | null>(null)
	inputModelStage = $state<'download' | 'load' | 'ready'>('load')
	inputModelProgress = $state(0)
	outputModelStage = $state<'download' | 'load' | 'ready'>('load')
	outputModelProgress = $state(0)

	#inputHooks = new Set<InputHooks>()
	#playbackHooks = new Set<PlaybackHooks>()
	#e2eSession = false
	#unsubscribe: (() => void) | null = null
	#modelUnsubscribe: (() => void) | null = null
	#starting: Promise<void> | null = null
	#lastSequence = 0n
	#routeGeneration: string | null = null
	#confirmed = new Set<CandidateId>()
	#candidate: CandidateId | null = null
	#candidateSpeakers = new Map<CandidateId, SpeakerAttribution>()
	#planner = new SpeechPlanner()
	#turn: TurnId | null = null
	#audibleTurn: TurnId | null = null
	#playbackWaiters = new Map<TurnId, { resolve: () => void; reject: (error: Error) => void }>()
	#speechEpoch = 0
	#speechChain: Promise<void> = Promise.resolve()
	#maxSegmentCapacity = 8
	#remainingSegmentCapacity = 8
	#capacityWaiters = new Set<() => void>()

	constructor(
		backend: VoiceBackend = isTauri()
			? new TauriNativeVoiceBackend()
			: new UnavailableVoiceBackend()
	) {
		this.backend = backend
	}

	onInput(hooks: InputHooks): () => void {
		this.#inputHooks.add(hooks)
		return () => this.#inputHooks.delete(hooks)
	}

	onPlayback(hooks: PlaybackHooks): () => void {
		this.#playbackHooks.add(hooks)
		return () => this.#playbackHooks.delete(hooks)
	}

	dispose(): void {
		this.#speechEpoch++
		this.#wakeCapacityWaiters()
		if (this.sessionId && !this.#e2eSession)
			void this.backend.setDiagnostics(this.sessionId, false).catch(() => {})
		this.#unsubscribe?.()
		this.#unsubscribe = null
		this.#modelUnsubscribe?.()
		this.#modelUnsubscribe = null
		this.#inputHooks.clear()
		this.#playbackHooks.clear()
		for (const [turnId] of this.#playbackWaiters) {
			this.#settlePlayback(turnId, new Error('Voice controller was disposed.'))
		}
	}

	start(): Promise<void> {
		if (this.sessionId && this.session === 'active') return Promise.resolve()
		if (this.#starting) return this.#starting
		if (this.sessionId || this.#turn) this.cancelSpeech('superseded')
		this.#starting = this.#start().finally(() => {
			this.#starting = null
		})
		return this.#starting
	}

	async #start(): Promise<void> {
		this.#e2eSession = false
		this.failure = null
		this.runtime = 'preparing'
		this.#unsubscribe ??= this.backend.subscribe((event) => this.#event(event))
		this.#modelUnsubscribe ??=
			this.backend.subscribeModelStatus?.((status) => {
				if (status.feature === 'asr') {
					this.inputModelStage = status.stage
					this.inputModelProgress = status.progress
				} else {
					this.outputModelStage = status.stage
					this.outputModelProgress = status.progress
				}
			}) ?? null
		await this.backend.waitForEventSubscription?.()
		try {
			if (this.sessionId) {
				const stale = this.sessionId
				this.sessionId = null
				await this.backend.stopSession(stale).catch(() => {})
			}
			const prepared = await this.backend.prepare(['input', 'output'])
			this.runtime = prepared.runtime
			if (prepared.input_ready) {
				this.inputModelStage = 'ready'
				this.inputModelProgress = 1
			}
			if (prepared.output_ready) {
				this.outputModelStage = 'ready'
				this.outputModelProgress = 1
			}
			if (!prepared.input_ready || !prepared.output_ready) {
				throw new Error('Native input and output models are not ready.')
			}
			const started = await this.backend.startSession({})
			this.sessionId = started.session_id
			this.#applySnapshot(started.snapshot)
			await this.backend.setDiagnostics(started.session_id, true).catch(() => {})
		} catch (error) {
			this.runtime = 'failed'
			this.failure = safeMessage(error)
		}
	}

	/** Attach the compiled E2E build to native events without opening host audio. */
	async attachE2eSession(sessionId: SessionId): Promise<void> {
		if (import.meta.env.VITE_AVEN_E2E !== 'true') {
			throw new Error('Synthetic voice sessions are available only in E2E builds.')
		}
		this.#unsubscribe ??= this.backend.subscribe((event) => this.#event(event))
		await this.backend.waitForEventSubscription?.()
		this.#lastSequence = 0n
		this.#routeGeneration = null
		this.#e2eSession = true
		this.sessionId = sessionId
		this.runtime = 'ready'
		this.session = 'active'
		this.capture = 'live'
		this.inputModelStage = 'ready'
		this.inputModelProgress = 1
		this.outputModelStage = 'ready'
		this.outputModelProgress = 1
	}

	async stop(): Promise<void> {
		this.cancelSpeech('session_stopped')
		const session = this.sessionId
		this.sessionId = null
		this.session = 'closed'
		this.capture = 'closed'
		this.hearing = false
		this.partial = ''
		this.speaker = null
		this.#candidate = null
		this.#candidateSpeakers.clear()
		this.#confirmed.clear()
		this.#audibleTurn = null
		if (session && !this.#e2eSession) {
			await this.backend.setDiagnostics(session, false).catch(() => {})
			await this.backend.stopSession(session).catch((error) => {
				this.failure = safeMessage(error)
			})
		}
		this.#e2eSession = false
	}

	async resetInput(): Promise<void> {
		this.hearing = false
		this.partial = ''
		this.speaker = null
		this.#candidate = null
		this.#candidateSpeakers.clear()
		if (this.sessionId && !this.#e2eSession) {
			await this.backend.resetInput(this.sessionId, 'conversation_cleared').catch((error) => {
				this.failure = safeMessage(error)
			})
		}
	}

	feedSpeech(delta: string, voice: string, language = 'de'): void {
		for (const segment of this.#planner.feed(delta)) this.#enqueue(segment, voice, language)
	}

	finishSpeech(voice: string, language = 'de'): void {
		for (const segment of this.#planner.flush()) this.#enqueue(segment, voice, language)
		const epoch = this.#speechEpoch
		this.#speechChain = this.#speechChain
			.then(async () => {
				if (epoch !== this.#speechEpoch || !this.sessionId || !this.#turn) return
				await this.backend.finishSpeech(this.sessionId, this.#turn)
			})
			.catch((error) => this.#abortSpeechEpoch(epoch, error))
	}

	/** Play a one-off sample through the same native rail as conversation speech. */
	async previewSpeech(text: string, voice: string, language = 'de'): Promise<void> {
		this.#speechEpoch++
		this.#planner.reset()
		this.#resetSegmentCapacity()
		const prior = this.#turn
		this.#turn = null
		if (prior) this.#settlePlayback(prior, new Error('Speech preview was superseded.'))
		if (!this.sessionId) await this.start()
		const session = this.sessionId
		if (!session) throw new Error(this.failure ?? 'Native voice is unavailable.')
		await this.backend.cancelSpeech({
			session_id: session,
			turn_id: prior ?? undefined,
			reason: 'superseded'
		})
		const begun = await this.backend.beginSpeech({ session_id: session, language, voice })
		this.#turn = begun.turn_id
		this.#maxSegmentCapacity = begun.pending_segment_capacity
		this.#remainingSegmentCapacity = begun.pending_segment_capacity
		const completed = new Promise<void>((resolve, reject) => {
			this.#playbackWaiters.set(begun.turn_id, { resolve, reject })
		})
		try {
			await this.backend.enqueueSpeech({
				session_id: session,
				turn_id: begun.turn_id,
				segment_index: 0,
				text
			})
			await this.backend.finishSpeech(session, begun.turn_id)
		} catch (error) {
			this.#settlePlayback(begun.turn_id, new Error(safeMessage(error)))
			throw error
		}
		await completed
	}

	cancelSpeech(reason: 'manual' | 'muted' | 'session_stopped' | 'superseded' = 'manual'): void {
		this.#speechEpoch++
		this.#planner.reset()
		this.#resetSegmentCapacity()
		const session = this.sessionId
		const turn = this.#turn
		this.#turn = null
		if (turn) this.#settlePlayback(turn, new Error('Speech was cancelled.'))
		if (session && !this.#e2eSession) {
			void this.backend
				.cancelSpeech({ session_id: session, turn_id: turn ?? undefined, reason })
				.catch((error) => {
					this.failure = safeMessage(error)
				})
		}
	}

	#enqueue(segment: PlannedSegment, voice: string, language: string): void {
		const epoch = this.#speechEpoch
		this.#speechChain = this.#speechChain
			.then(async () => {
				if (epoch !== this.#speechEpoch) return
				if (!this.sessionId) await this.start()
				const session = this.sessionId
				if (!session || epoch !== this.#speechEpoch) return
				if (!this.#turn) {
					const begun = await this.backend.beginSpeech({
						session_id: session,
						language,
						voice
					})
					if (epoch !== this.#speechEpoch) {
						void this.backend.cancelSpeech({
							session_id: session,
							turn_id: begun.turn_id,
							reason: 'superseded'
						})
						return
					}
					this.#turn = begun.turn_id
					this.#maxSegmentCapacity = begun.pending_segment_capacity
					this.#remainingSegmentCapacity = begun.pending_segment_capacity
				}
				await this.#waitForSegmentCapacity(epoch)
				if (epoch !== this.#speechEpoch || !this.#turn) return
				const result = await this.backend.enqueueSpeech({
					session_id: session,
					turn_id: this.#turn,
					segment_index: segment.index,
					text: segment.text
				})
				this.#remainingSegmentCapacity = result.remaining_segment_capacity
			})
			.catch((error) => {
				this.#abortSpeechEpoch(epoch, error)
			})
	}

	#event(envelope: VoiceEventEnvelope): void {
		if (envelope.protocol_version !== 1) return
		let sequence: bigint
		try {
			sequence = BigInt(envelope.sequence)
		} catch {
			return
		}
		if (sequence <= this.#lastSequence) return
		if (envelope.session_id && envelope.session_id !== this.sessionId) return
		if (
			this.#routeGeneration &&
			envelope.route_generation &&
			envelope.route_generation !== this.#routeGeneration &&
			envelope.event.type !== 'status.route'
		)
			return
		this.#lastSequence = sequence
		const event = envelope.event
		switch (event.type) {
			case 'status.runtime':
				this.runtime = event.status
				break
			case 'status.session':
				this.session = event.status
				break
			case 'status.route':
				this.#routeGeneration = event.route?.generation ?? null
				break
			case 'status.capture':
				this.capture = event.status
				break
			case 'status.echo':
				this.echo = event.status
				break
			case 'input.candidate_started':
				this.hearing = true
				this.partial = ''
				this.speaker = null
				this.#candidate = event.candidate_id
				for (const hooks of this.#inputHooks) hooks.onCandidate?.()
				break
			case 'input.partial':
				this.partial = event.text
				for (const hooks of this.#inputHooks) hooks.onPartial?.(event.text)
				break
			case 'input.confirmed':
				if (this.#confirmed.has(event.candidate_id)) break
				this.#confirmed.add(event.candidate_id)
				for (const hooks of this.#inputHooks) hooks.onConfirmed?.()
				break
			case 'input.speaker_identified':
				this.#candidateSpeakers.set(event.candidate_id, event.speaker)
				if (event.candidate_id === this.#candidate) this.speaker = event.speaker
				for (const hooks of this.#inputHooks) hooks.onSpeaker?.(event.speaker)
				break
			case 'input.final': {
				const finalSpeaker = this.#candidateSpeakers.get(event.candidate_id) ?? null
				this.#candidateSpeakers.delete(event.candidate_id)
				this.#confirmed.delete(event.candidate_id)
				this.hearing = false
				this.partial = ''
				this.#candidate = null
				for (const hooks of this.#inputHooks)
					hooks.onFinal?.(event.text, finalSpeaker, this.sessionId)
				break
			}
			case 'input.discarded':
				this.#candidateSpeakers.delete(event.candidate_id)
				this.#confirmed.delete(event.candidate_id)
				this.hearing = false
				this.partial = ''
				this.speaker = null
				this.#candidate = null
				for (const hooks of this.#inputHooks) hooks.onDiscarded?.()
				break
			case 'playback.started':
				this.#audibleTurn = event.turn_id
				this.#setSpeaking(true)
				break
			case 'playback.turn_started':
				this.#turn = event.turn_id
				break
			case 'playback.segment_accepted':
			case 'playback.synthesis_started':
			case 'playback.synthesis_completed':
			case 'playback.fading':
				break
			case 'capacity.changed':
				this.#remainingSegmentCapacity = Math.max(
					0,
					this.#maxSegmentCapacity - event.pending_segments
				)
				this.#wakeCapacityWaiters()
				break
			case 'playback.completed':
			case 'playback.cancelled':
			case 'playback.failed':
				this.#settlePlayback(
					event.turn_id,
					event.type === 'playback.failed' ? new Error(event.error.message) : undefined
				)
				if (event.turn_id === this.#audibleTurn) {
					this.#audibleTurn = null
					this.#setSpeaking(false)
				}
				if (event.turn_id !== this.#turn) break
				this.#turn = null
				this.#planner.reset()
				this.#resetSegmentCapacity()
				break
			case 'diagnostics.snapshot':
				this.#applySnapshot(event.snapshot)
				break
			case 'error.raised':
				this.failure = event.error.message
				break
			default:
				assertNever(event)
		}
	}

	#applySnapshot(snapshot: VoiceSnapshot): void {
		this.snapshot = snapshot
		this.runtime = snapshot.runtime
		this.session = snapshot.session.status
		this.capture = snapshot.capture.status
		this.echo = snapshot.echo.status
		this.partial = snapshot.utterance.partial
		this.hearing = snapshot.utterance.status !== 'idle'
		this.#routeGeneration = snapshot.route?.generation ?? null
		if (!snapshot.playback.speaking) this.#audibleTurn = null
		this.#setSpeaking(snapshot.playback.speaking)
	}

	#setSpeaking(speaking: boolean): void {
		if (this.speaking === speaking) return
		this.speaking = speaking
		for (const hooks of this.#playbackHooks) hooks.onSpeaking?.(speaking)
	}

	async #waitForSegmentCapacity(epoch: number): Promise<void> {
		while (epoch === this.#speechEpoch && this.#remainingSegmentCapacity === 0) {
			await new Promise<void>((resolve) => this.#capacityWaiters.add(resolve))
		}
	}

	#resetSegmentCapacity(): void {
		this.#maxSegmentCapacity = 8
		this.#remainingSegmentCapacity = 8
		this.#wakeCapacityWaiters()
	}

	#wakeCapacityWaiters(): void {
		for (const resolve of this.#capacityWaiters) resolve()
		this.#capacityWaiters.clear()
	}

	#abortSpeechEpoch(epoch: number, error: unknown): void {
		if (epoch !== this.#speechEpoch) return
		this.failure = safeMessage(error)
		this.#speechEpoch++
		this.#planner.reset()
		this.#resetSegmentCapacity()
		const session = this.sessionId
		const turn = this.#turn
		this.#turn = null
		this.#setSpeaking(false)
		if (turn) this.#settlePlayback(turn, new Error(this.failure))
		if (session && !this.#e2eSession) {
			void this.backend.cancelSpeech({
				session_id: session,
				turn_id: turn ?? undefined,
				reason: 'superseded'
			})
		}
	}

	#settlePlayback(turnId: TurnId, error?: Error): void {
		const waiter = this.#playbackWaiters.get(turnId)
		if (!waiter) return
		this.#playbackWaiters.delete(turnId)
		if (error) waiter.reject(error)
		else waiter.resolve()
	}
}

function assertNever(value: never): never {
	throw new Error(`Unknown voice event: ${JSON.stringify(value)}`)
}

function safeMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'object' && error && 'message' in error) return String(error.message)
	return String(error)
}

export const voiceController = new VoiceController()
