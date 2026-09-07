import type {
	ArtifactProcessingPresentation,
	ArtifactProcessingView
} from '$lib/artifacts/processing'
import type { AnonymousSpeaker } from './anonymous-speaker'
import { type ChatMessage, repairCall, streamChat, type ToolSpec } from './redpill'

/**
 * The dashboard's conversation.
 *
 * Two histories, deliberately: `turns` is what a person sees, and `#wire` is
 * what the model sees — the same exchange plus the tool calls and their
 * results, which nobody wants rendered as chat bubbles but the model needs in
 * order to know what it already did.
 *
 * A turn is not finished when the first response ends. If the model asked for
 * tools, they are run and the whole thing is sent back so it can answer with
 * the results in hand; that repeats until it replies with prose.
 */

/**
 * The five-word rule earns its place: nothing is spoken until a sentence
 * boundary arrives, so the opening sentence's length sets the time to first
 * audio. A short one is synthesized and playing while the rest is still being
 * written, and the reply begins in a fraction of the time.
 */
const SYSTEM_PROMPT =
	'You are avenOS, a terse and direct assistant. You answer questions of every ' +
	'kind freely and naturally — knowledge, explanations, ideas, short texts — ' +
	'like any good assistant; you need no tools for that. ' +
	'Always answer in the language the user speaks, in plain flowing prose with ' +
	'no markdown, lists or emojis — your reply is read out loud. ' +
	'Your first sentence is always very short, five words at most, ending with a ' +
	'period. Everything else follows in the sentences after it. ' +
	"You also keep the user's task list. Only when the topic is tasks do the " +
	'tool rules apply: act immediately — call the tools in the same turn you ' +
	'learn of a change, and multiple tasks always in one single call. ' +
	'After the tools, answer the human like in a conversation: briefly say how ' +
	'things stand now. Never talk about tools, ids, confirmations or actions; ' +
	'ids are internal and never read out. ' +
	'Every task is its own entry with a short title — never append several ' +
	'things to an existing title. "Four healthy ingredients" means four separate ' +
	'tasks you think up yourself. ' +
	'Tasks are addressed by their id, never by title — call todo_list ' +
	'before you change, delete, or talk about the list. ' +
	'Every task belongs to exactly one spark, the spark context: "me" for ' +
	'personal things, "team" for shared ones. Without a mention, the active ' +
	'spark applies; "for the team" means spark=team. ' +
	'Tasks have three statuses: open, in_progress, done. When someone says a ' +
	'thing is finished, call todo_update with status=done; "just starting" ' +
	'means status=in_progress. Deleting happens only on explicit request. Read ' +
	'lists out as flowing prose. ' +
	'Exactly one window is on screen at a time; switch with the *_window_toggle ' +
	'tools and open=true — the previous window disappears by itself. "Show the ' +
	'list" means list_window_toggle, "show the board" means board_window_toggle ' +
	'— each with open=true. todo_show only switches the spark. All of these ' +
	'are view changes, never data changes. ' +
	'The conversation is scoped to ONE intent — the matter on screen. The ' +
	"user's intents are their open matters; intent_list names them. If a " +
	'request is about another intent than the one on screen, call ' +
	'intent_switch FIRST and only then answer — the request and your answer ' +
	'move to that intent. Something new that belongs to no intent gets ' +
	'intent_create; "done with" or "put away" is intent_archive; combining is ' +
	'intent_merge; renaming, re-dating or changing the state is intent_update; ' +
	'deleting is intent_delete and needs an explicit request. ' +
	'The files in this conversation are listed under ARTIFACTS in your context, ' +
	'one line each with kind and current state. When a question is about a ' +
	'file, call artifact_detail with its name or id first and answer only ' +
	'from what it returns — never guess file contents or figures. ' +
	'Call registry_list when you are unsure which actors exist. ' +
	'Destructive actions are HELD: the call returns held=..., a bar appears ' +
	'for the human, and only their button press executes it. Say that you ' +
	'have prepared it and the user must press Confirm. ' +
	'Messages come from speech recognition and are sometimes cut off ' +
	'mid-sentence. If a message reads like the continuation of the previous ' +
	'one, treat both together as one request. ' +
	'When you call tools, write no text in the same turn — your answer comes ' +
	'once you have the results, and then in one piece.'

/**
 * Hard stop on tool rounds, so a model that keeps calling cannot loop forever.
 *
 * Deleting everything finished takes list, then one delete per item, then the
 * answer — and four rounds ran out partway, leaving whatever the last round had
 * written as the final reply. That is how "Ich rufe todo_delete, todo_delete…
 * auf." ended up on screen as an answer while nothing was deleted.
 */
const MAX_TOOL_ROUNDS = 8

/**
 * A reply that has stopped being language.
 *
 * Twenty consecutive characters with no letter and no digit do not occur in
 * German prose; they are the model stuck in a punctuation loop (streams of `}`
 * were the observed shape). Checked against the tail as the reply streams.
 */
const DEGENERATE = /[^\p{L}\p{Nd}]{20}$/u

/** What to shave off a reply cut short by the degeneration guard. */
const TRAILING_JUNK = /[^\p{L}\p{Nd}]+$/u

/**
 * A reply that claims or promises list work.
 *
 * Qwen's failure mode is the polite deferral — "Habe ich notiert.", "Ich lege
 * nun die Aufgabe an." — prose in place of a tool call, with the list
 * untouched. A reply matching this in a round that called no tools is not
 * accepted: the model is told once to execute, and only what comes back after
 * that stands.
 */
const CLAIMS_ACTION =
	/notier|hinzugefügt|hinzufüg|angelegt|aktualisiert|gelöscht|abgehakt|markiert|eingetragen|erstellt|registriert|erschaffen|steht auf|stehen auf|auf der liste|auf deiner liste|von der liste|ist jetzt sichtbar|wird angezeigt|ist jetzt auf dem bildschirm|ist jetzt zu sehen|wird geöffnet|is now (visible|shown|on screen)|\bich (füge|lege|trage|erstelle|kümmere|werde)\b|\badded\b|\bcreated\b|\bdeleted\b|\bremoved\b|\bupdated\b|\bchecked off\b|\bmarked\b|\bnoted\b|\bis on (the|your) list\b|\bare on (the|your) list\b|\bI('ll| will| have|'ve)? (add|create|delete|remove|update|take care)\b/i

const NUDGE =
	'You called no tool — nothing happened on the list. ' +
	'Execute the change with the tools now, without text.'

/**
 * The other collapse: a whole sentence repeated verbatim, on and on —
 * "Lerne ich deine Aufgaben. Was ist zu tun?" six times in a row. Letters
 * throughout, so the junk guard cannot see it. If the last 32 characters
 * already appear at least twice earlier in the reply, the model is looping;
 * everything from the second occurrence on is noise.
 */
function loopStart(content: string): number {
	if (content.length < 96) return -1
	const gram = content.slice(-32)
	const first = content.indexOf(gram)
	if (first === -1 || first >= content.length - 64) return -1
	const second = content.indexOf(gram, first + 1)
	return second !== -1 && second < content.length - 32 ? second : -1
}

export interface Turn {
	id: string
	role: 'user' | 'assistant'
	content: string
	/** Local, anonymous diarization metadata; never added to the model prompt. */
	anonymousSpeaker?: AnonymousSpeaker
	attachment?: ArtifactAttachment
	/** Every tool call this turn ran, with its result, for the transcript. */
	calls?: { name: string; result: string }[]
}

export type ArtifactUploadStatus =
	| 'queued'
	| 'preparing'
	| 'uploading'
	| 'finalizing'
	| 'committed'
	| 'failed'

export interface ArtifactAttachment {
	readonly uploadId: string
	readonly publicationId: string
	originalName: string
	length: number
	status: ArtifactUploadStatus
	progress: number
	artifactId?: string
	mediaType?: string
	sha256?: string
	error?: string
	processing?: ArtifactProcessingView
}

export interface UploadedArtifactReceipt {
	publicationId: string
	intentId: string
	intentDeclarationArtifactId: string
	artifactId: string
	originalName: string
	mediaType: string
	sha256: string
	length: number
	scopeSequence: number
	replayed: boolean
}

/** Hooks for anything that wants the reply as it arrives — the speaker, today. */
export interface ChatSink {
	onDelta?: (text: string) => void
	onDone?: () => void
	/** The turn is starting over after tool calls — drop what was said so far. */
	onRestart?: () => void
	/** A turn boundary: a bubble was pushed or the log cleared — re-render. */
	onTurn?: () => void
}

export interface ChatTools {
	specs: ToolSpec[]
	/**
	 * Run one call. `record` is the machine-readable result, kept on the turn
	 * for the transcript; `wire` is what the model reads back — the two differ
	 * because the model gets prose where the transcript wants structure. May be
	 * async: the ask() path consults an LLM.
	 */
	run: (
		name: string,
		args: string
	) => { record: string; wire: string } | Promise<{ record: string; wire: string }>
}

const id = () => crypto.randomUUID()

/** One conversation: what a person sees, and what the model saw. */
interface Session {
	turns: Turn[]
	wire: ChatMessage[]
}

export class Chat {
	turns = $state<Turn[]>([])
	streaming = $state(false)
	failure = $state<string | null>(null)
	/**
	 * Which conversation `turns` currently shows. The chat is scoped per
	 * intent: every intent has its own session stream, and selecting an
	 * intent switches to it (`use`). Sessions are kept in memory for the
	 * lifetime of the chat; a reply in flight keeps writing into the session
	 * it started in, even if the view has moved on.
	 */
	session = $state('')
	#sessions = new Map<string, Session>()
	#uploads = new Map<string, { attachment: ArtifactAttachment; session: string }>()
	#artifacts = new Map<string, ArtifactAttachment>()
	/**
	 * The turn in flight: which session's arrays it writes to, and where in
	 * them it began. A tool may move the whole turn to another session
	 * (`relocateTurn`) — creating an intent puts the question and its answer
	 * into the new intent's stream, not the one it was asked from.
	 */
	#live: {
		turns: Turn[]
		wire: ChatMessage[]
		fromTurn: number
		fromWire: number
		session: string
	} | null = null
	onExchange: ((session: string, user: Turn, assistant: Turn) => void) | null = null
	/**
	 * The request while it is being ROUTED: sent, but not yet a bubble in any
	 * stream. It stays here — shown as a working state in the composer card
	 * wherever you are, with the reply streaming under it — until the answer
	 * round is complete; the tool rounds before it may have moved the turn
	 * to another intent. Then it settles into the stream it belongs to.
	 */
	routing = $state<string | null>(null)
	/**
	 * Live context for every request, appended to the system prompt: what the
	 * world looks like right now (the intents, which one is on screen), so
	 * routing decisions are made with the facts in view rather than after a
	 * tool call. Set by whoever owns those facts.
	 */
	context: (() => string) | null = null
	/** What the model has said so far while the request is still routing. */
	routingReply = $state('')
	/**
	 * The last request to the model, exactly as sent: the system prompt with
	 * the live context appended, the full message history, and the tool set.
	 * Captured per round in `#round`; the debug view renders this, so what is
	 * shown is byte-for-byte what the model saw, never a reconstruction.
	 */
	lastRequest = $state<{
		at: string
		session: string
		messages: ChatMessage[]
		tools: ToolSpec[]
	} | null>(null)
	#pending: { user: Turn; reply: Turn } | null = null
	#reply: Turn | null = null

	// The system prompt is NOT stored here — it is prepended per request, so a
	// long-lived singleton Chat always speaks with the current prompt instead
	// of whatever was compiled in when the instance was born.
	#wire: ChatMessage[] = []
	#abort: AbortController | null = null
	#sendTail: Promise<void> = Promise.resolve()
	#sendEpoch = 0
	#sink: ChatSink
	#tools: ChatTools
	#stream: typeof streamChat

	constructor(
		sink: ChatSink = {},
		tools: ChatTools = { specs: [], run: () => ({ record: '', wire: '' }) },
		stream: typeof streamChat = streamChat
	) {
		this.#sink = sink
		this.#tools = tools
		this.#stream = stream
	}

	get canSend(): boolean {
		return !this.streaming
	}

	/**
	 * A new session. Its `turns` is born as a `$state` proxy: every array that
	 * can end up in `this.turns` must be one, because a plain array assigned
	 * to the field gets wrapped on the way in — and pushes through the plain
	 * reference afterwards (a turn settling in the background) never reach
	 * the wrapper's signals. The stream then shows a stale length: turns that
	 * exist and are invisible.
	 */
	#fresh(): Session {
		const turns = $state<Turn[]>([])
		return { turns, wire: [] }
	}

	/** Switch the visible conversation to `key`, creating it on first use. */
	use(key: string): void {
		if (key === this.session) return
		this.#sessions.set(this.session, { turns: this.turns, wire: this.#wire })
		const next = this.#sessions.get(key) ?? this.#fresh()
		this.session = key
		this.turns = next.turns
		this.#wire = next.wire
		this.failure = null
		this.#sink.onTurn?.()
	}

	hydrate(key: string, turns: Turn[]): void {
		const existing =
			key === this.session ? { turns: this.turns, wire: this.#wire } : this.#sessions.get(key)
		if (existing && existing.turns.length > 0) return
		const session = this.#fresh()
		session.turns.push(...turns)
		session.wire.push(
			...turns
				.filter((turn) => turn.content !== '')
				.map((turn) => ({ role: turn.role, content: turn.content }) as ChatMessage)
		)
		this.#sessions.set(key, session)
		if (key === this.session) {
			this.turns = session.turns
			this.#wire = session.wire
			this.#sink.onTurn?.()
		}
	}

	/**
	 * The live turn's abort signal — the REPLY scope only. Long-running work
	 * (long-running work) deliberately hangs on the separate work signal
	 * in the actor wiring: barge-in fires on any voice activity and must not
	 * kill a design run.
	 */
	get signal(): AbortSignal | undefined {
		return this.#abort?.signal
	}

	beginArtifactUpload(uploadId: string, publicationId: string, originalName: string): void {
		this.failure = null
		this.turns.push({
			id: id(),
			role: 'user',
			content: '',
			attachment: {
				uploadId,
				publicationId,
				originalName,
				length: 0,
				status: 'queued',
				progress: 0
			}
		})
		const attachment = this.turns.at(-1)?.attachment
		if (attachment) this.#uploads.set(uploadId, { attachment, session: this.session })

		this.#sink.onTurn?.()
	}

	updateArtifactUpload(
		uploadId: string,
		status: Exclude<ArtifactUploadStatus, 'queued' | 'committed' | 'failed'>,
		sent: number,
		total: number
	): void {
		const attachment = this.#uploads.get(uploadId)?.attachment
		if (!attachment || attachment.status === 'committed' || attachment.status === 'failed') return
		attachment.status = status
		attachment.length = total
		attachment.progress = total === 0 ? 0 : Math.min(100, Math.floor((sent / total) * 100))
		this.#sink.onTurn?.()
	}

	commitArtifactUpload(uploadId: string, receipt: UploadedArtifactReceipt): void {
		const upload = this.#uploads.get(uploadId)
		if (!upload) return
		const { attachment } = upload
		attachment.originalName = receipt.originalName
		attachment.length = receipt.length
		attachment.status = 'committed'
		attachment.progress = 100
		attachment.artifactId = receipt.artifactId
		attachment.mediaType = receipt.mediaType
		attachment.sha256 = receipt.sha256
		attachment.error = undefined
		attachment.processing = {
			availability: 'discovering',
			caseId: '',
			state: 'active',
			projectionVersion: '',
			preferredType: 'file',
			label: 'File',
			summary: null,
			metadata: {},
			warnings: [],
			stages: [],
			derivedArtifacts: []
		}
		this.#artifacts.set(receipt.artifactId, attachment)

		const content =
			`Attached file:\n` +
			`originalName=${JSON.stringify(receipt.originalName)}\n` +
			`artifactId=${JSON.stringify(receipt.artifactId)}`
		// Transient uploads never enter model history. Only the authoritative
		// committed reference is appended, and it does not trigger inference.
		const wire =
			upload.session === this.session ? this.#wire : this.#sessions.get(upload.session)?.wire
		wire?.push({ role: 'user', content })
		this.#uploads.delete(uploadId)
		this.#sink.onTurn?.()
	}

	hasArtifact(artifactId: string): boolean {
		return this.#artifacts.has(artifactId)
	}

	markArtifactProcessingPending(artifactId: string): void {
		const attachment = this.#artifacts.get(artifactId)
		if (!attachment?.processing) return
		attachment.processing.availability = 'discovering'
		attachment.processing.lookupError = undefined
		this.#sink.onTurn?.()
	}

	updateArtifactProcessing(artifactId: string, presentation: ArtifactProcessingPresentation): void {
		const attachment = this.#artifacts.get(artifactId)
		if (!attachment) return
		attachment.processing = {
			...presentation,
			availability: 'available',
			lookupError: undefined
		}
		this.#sink.onTurn?.()
	}

	markArtifactProcessingUnavailable(artifactId: string, error: string): void {
		const attachment = this.#artifacts.get(artifactId)
		if (!attachment?.processing) return
		attachment.processing.availability = 'unavailable'
		attachment.processing.lookupError = error
		this.#sink.onTurn?.()
	}

	/**
	 * What the model can see of one committed artifact: name, size, media type
	 * and its live processing view. The artifact manifest in the system
	 * context and the artifact_detail tool both read through here, so the
	 * in-memory registry — not the rendered turns — is the source of truth.
	 */
	artifactInfo(artifactId: string): ArtifactAttachment | undefined {
		return this.#artifacts.get(artifactId)
	}

	/**
	 * Adopt a persisted artifact into the in-memory registry without a turn —
	 * the restart path. `commitArtifactUpload` does this for fresh uploads;
	 * this brings back what the backend already knows, so the processing
	 * watcher (and the model's artifact view) have something to hold onto.
	 */
	adoptArtifact(
		artifactId: string,
		originalName: string,
		mediaType?: string,
		length?: number,
		processing?: ArtifactProcessingView
	): void {
		const existing = this.#artifacts.get(artifactId)
		if (existing) {
			if (mediaType) existing.mediaType = mediaType
			if (length) existing.length = length
			if (processing)
				existing.processing = { ...processing, availability: 'available', lookupError: undefined }
			return
		}
		this.#artifacts.set(artifactId, {
			uploadId: '',
			publicationId: '',
			originalName,
			length: length ?? 0,
			status: 'committed',
			progress: 100,
			artifactId,
			mediaType,
			processing: processing ? { ...processing, availability: 'available' } : undefined
		})
	}

	failArtifactUpload(uploadId: string, error: string): void {
		const attachment = this.#uploads.get(uploadId)?.attachment
		if (!attachment || attachment.status === 'committed') return
		attachment.status = 'failed'
		attachment.error = error
		this.#uploads.delete(uploadId)

		this.#sink.onTurn?.()
	}

	/**
	 * Serialize user turns across an asynchronous barge-in.
	 *
	 * Aborting a native/model stream is not instantaneous. The confirmed voice
	 * candidate can become a final utterance while the old request is still
	 * unwinding; dropping sends while `streaming` loses exactly that utterance.
	 * Stop the old request and queue the new turn behind it instead.
	 */
	send(text: string, anonymousSpeaker?: AnonymousSpeaker): Promise<void> {
		const prompt = text.trim()
		if (prompt === '') return Promise.resolve()
		if (this.streaming) this.stop()
		const epoch = this.#sendEpoch
		const operation = this.#sendTail.then(async () => {
			if (epoch !== this.#sendEpoch) return
			await this.#send(prompt, anonymousSpeaker)
		})
		this.#sendTail = operation.catch(() => {})
		return operation
	}

	async #send(prompt: string, anonymousSpeaker?: AnonymousSpeaker): Promise<void> {
		this.failure = null
		// Pinned for the whole turn: `use()` may swap the visible session while
		// the reply streams, and the reply must land where it was asked — unless
		// a tool relocates the turn on purpose.
		const live = {
			turns: this.turns,
			wire: this.#wire,
			fromTurn: this.turns.length,
			fromWire: this.#wire.length,
			session: this.session
		}
		this.#live = live
		live.wire.push({ role: 'user', content: prompt })
		this.routing = prompt

		// Push first, then take the reference back OUT of the array. `turns` is a
		// `$state` proxy: it hands out a proxied view on read, and only writes
		// through that view are tracked. Holding on to the object literal we
		// pushed and mutating it would update the data and tell no one — the
		// reply would stream into a bubble that never re-renders.
		const replyId = id()
		// The bubbles wait in `#pending` until the request is routed; `#settle`
		// pushes them into the stream they belong to and re-points `#reply` at
		// the proxied copy the array hands back — writes through the original
		// literal would update the data and tell no one.
		this.#pending = {
			user: { id: id(), role: 'user', content: prompt, anonymousSpeaker },
			reply: { id: replyId, role: 'assistant', content: '', calls: [] }
		}
		this.#reply = this.#pending.reply
		const dropStub = () => {
			const at = live.turns.findIndex((t) => t.id === replyId)
			if (at >= 0) live.turns.splice(at, 1)
		}

		this.streaming = true
		this.#sink.onTurn?.()
		this.#abort = new AbortController()

		try {
			let nudged = false
			for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
				const calls = await this.#round(live.wire)
				const reply = this.#reply as Turn
				if (calls.length === 0) {
					// The answer round is complete: the tools before it have had
					// every chance to route the turn, so the stream it is in now is
					// the right one. This is the ONE place a request settles (the
					// safety net in `finally` aside) — settling any earlier put it
					// into the origin stream for a moment before it moved.
					// Said it did something, called nothing — in the WHOLE turn. The
					// round alone is the wrong scope: the natural closing sentence
					// after a successful tool round ("Fenster öffnen ist abgehakt.")
					// names the action too, and bouncing that accused the model of
					// lying right after it did the work — to which it answered ever
					// more defensively ("wurde bereits ausgeführt, wie die IDs
					// zeigen"). Only a turn that ran nothing at all gets the nudge.
					if (!nudged && (reply.calls?.length ?? 0) === 0 && CLAIMS_ACTION.test(reply.content)) {
						nudged = true
						reply.content = ''
						this.routingReply = ''
						this.#sink.onRestart?.()
						live.wire.push({ role: 'user', content: NUDGE })
						continue
					}
					this.#settle()
					break
				}

				// Anything said before calling a tool was a placeholder — "Alles klar,
				// mache ich." — and the real answer comes in the next round. Keeping
				// both meant two spoken responses per turn and one bubble with both
				// jammed together, so the placeholder is dropped from the bubble and
				// unsaid by the speaker.
				if (reply.content !== '') {
					reply.content = ''
					this.routingReply = ''
					this.#sink.onRestart?.()
				}

				// One tool message per call, addressed by id — the format the model's
				// own template expects, so nothing here reads as conversation.
				for (const call of calls) {
					const result = await this.#tools.run(call.name, call.arguments)
					;(this.#reply as Turn).calls?.push({ name: call.name, result: result.record })
					live.wire.push({ role: 'tool', tool_call_id: call.id, content: result.wire })
				}
				// NOT settled here: a tool round may be followed by another that
				// moves the turn (intent_list, then intent_switch). The request
				// stays in the card until the answer round is complete.
			}
			this.#sink.onDone?.()
		} catch (err) {
			this.#settle()
			const reply = this.#reply as Turn
			if (this.#abort?.signal.aborted) {
				// Interrupted. The assistant turn still has to go into the history,
				// even half-finished: the stream threw before `#round` could record
				// it, which would leave two user turns back to back — the malformed
				// shape that makes this model start improvising around the hole.
				live.wire.push({
					role: 'assistant',
					content: reply.content || '(unterbrochen)'
				})
				if (reply.content === '') dropStub()
			} else {
				this.failure = err instanceof Error ? err.message : String(err)
				// Drop the stub rather than leaving an empty bubble behind. A reply
				// that got partway through is kept — it is still worth reading.
				if (reply.content === '') dropStub()
			}
		} finally {
			this.#settle()
			this.streaming = false
			this.#abort = null
			this.#live = null
			this.#reply = null
		}
	}

	/** The request becomes bubbles in the stream the turn lives in now. */
	#settle(): void {
		const pending = this.#pending
		const live = this.#live
		if (!pending || !live) return
		this.#pending = null
		this.routing = null
		this.routingReply = ''
		live.turns.push(pending.user, pending.reply)
		this.#reply = live.turns[live.turns.length - 1]
		this.onExchange?.(live.session, pending.user, pending.reply)
	}

	/**
	 * Move the turn in flight — its question, its reply so far, and the wire
	 * messages behind them — into session `key`, creating it if needed. Called
	 * by tools that change which intent the conversation is about, so the
	 * exchange lands where it belongs. A no-op outside a turn.
	 */
	relocateTurn(key: string): void {
		const live = this.#live
		if (!live) return
		const target =
			key === this.session
				? { turns: this.turns, wire: this.#wire }
				: (this.#sessions.get(key) ?? this.#fresh())
		if (target.turns === live.turns) return
		if (key !== this.session) this.#sessions.set(key, target)
		const movedTurns = live.turns.splice(live.fromTurn)
		const movedWire = live.wire.splice(live.fromWire)
		live.fromTurn = target.turns.length
		live.fromWire = target.wire.length
		target.turns.push(...movedTurns)
		target.wire.push(...movedWire)
		live.turns = target.turns
		live.wire = target.wire
		live.session = key
		this.#sink.onTurn?.()
	}

	/**
	 * One request/response. Streams any prose into `reply` and returns the tool
	 * calls the model asked for, which the caller runs before going round again.
	 */
	async #round(wire: ChatMessage[]): Promise<{ id: string; name: string; arguments: string }[]> {
		let content = ''
		// Keyed by the index the model assigns, since fragments interleave.
		const calls = new Map<number, { id: string; name: string; arguments: string }>()

		const system = this.context ? `${SYSTEM_PROMPT}\n\n${this.context()}` : SYSTEM_PROMPT
		const messages: ChatMessage[] = [{ role: 'system', content: system }, ...wire]
		this.lastRequest = {
			at: new Date().toISOString(),
			session: this.session,
			messages,
			tools: this.#tools.specs
		}
		for await (const event of this.#stream(
			messages,
			this.#tools.specs,
			this.#abort?.signal ?? undefined
		)) {
			if (event.kind === 'text') {
				const reply = this.#reply as Turn
				content += event.text
				reply.content += event.text
				// Still routing: the words show in the composer card meanwhile.
				if (this.#pending) this.routingReply += event.text
				this.#sink.onDelta?.(event.text)
				// The model sometimes collapses into emitting punctuation forever —
				// `}` after `}` after `}` — and would keep going for its whole output
				// budget. No German sentence has thirty-two straight characters
				// without a letter or digit, so that tail is the collapse itself:
				// stop the stream, cut the junk, and let what was said stand.
				const looped = loopStart(content)
				if (DEGENERATE.test(content) || looped !== -1) {
					content = (looped !== -1 ? content.slice(0, looped) : content).replace(TRAILING_JUNK, '')
					;(this.#reply as Turn).content = content
					break
				}
				continue
			}

			const call = calls.get(event.index) ?? { id: '', name: '', arguments: '' }
			if (event.id) call.id = event.id
			if (event.name) call.name = event.name
			// Arguments stream in as JSON fragments and are only valid concatenated.
			if (event.args) call.arguments += event.args
			calls.set(event.index, call)
		}

		// Repaired before anything reads the name: this model sometimes writes the
		// whole call into the name field as Python.
		// Repaired before anything reads the name, and with ids guaranteed —
		// the tool results reference their call by id.
		const asked = [...calls.values()]
			.filter((c) => c.name !== '')
			.map(repairCall)
			.map((c, i) => ({ ...c, id: c.id || `call_${i}` }))

		// The turn goes into the history exactly as the model made it: prose in
		// content, calls in tool_calls. The synthetic fillers of the Gemma era
		// ("Ich rufe X auf.", a bare "…") each ended up imitated as answers —
		// what sits here is what the model learns a reply looks like.
		wire.push({
			role: 'assistant',
			content,
			...(asked.length > 0 && {
				tool_calls: asked.map((c) => ({
					id: c.id,
					type: 'function' as const,
					function: { name: c.name, arguments: c.arguments }
				}))
			})
		})
		return asked
	}

	/**
	 * The whole conversation as one JSON document, for pasting into a debugging
	 * session.
	 *
	 * `wire` is the part that matters: the exact messages the model saw and
	 * produced — system prompt, tool_calls with their raw arguments, tool
	 * results by id. The rendered `turns` ride along so the human-visible side
	 * (including what the stream guards cut) can be compared against it.
	 */
	export(): unknown {
		return {
			wire: [{ role: 'system', content: SYSTEM_PROMPT }, ...this.#wire],
			turns: this.turns,
			failure: this.failure
		}
	}

	/**
	 * Fold the conversations of `from` into `into`, in order, and forget the
	 * sources — merging intents merges their streams. The turn in flight, if
	 * it lives in one of the sources, moves along with it.
	 */
	mergeSessions(from: string[], into: string): void {
		const grab = (key: string): Session | undefined => {
			if (key === this.session) return { turns: this.turns, wire: this.#wire }
			return this.#sessions.get(key)
		}
		const target = grab(into) ?? this.#fresh()
		if (into !== this.session) this.#sessions.set(into, target)
		for (const key of from) {
			if (key === into) continue
			for (const upload of this.#uploads.values()) {
				if (upload.session === key) upload.session = into
			}
			const src = grab(key)
			if (!src) continue
			if (this.#live && this.#live.turns === src.turns) {
				this.#live.fromTurn += target.turns.length
				this.#live.fromWire += target.wire.length
				this.#live.turns = target.turns
				this.#live.wire = target.wire
			}
			target.turns.push(...src.turns.splice(0))
			target.wire.push(...src.wire.splice(0))
			this.#sessions.delete(key)
			// The visible session was a source: show the target instead.
			if (key === this.session) {
				this.session = into
				this.turns = target.turns
				this.#wire = target.wire
			}
		}
		this.#sink.onTurn?.()
	}

	/** Stop mid-reply. Whatever has arrived so far stays on screen. */
	stop(): void {
		this.#abort?.abort()
	}

	clear(): void {
		this.#sendEpoch++
		this.stop()
		for (const [uploadId, upload] of this.#uploads) {
			if (upload.session === this.session) this.#uploads.delete(uploadId)
		}
		for (const turn of this.turns) {
			if (turn.attachment?.artifactId) this.#artifacts.delete(turn.attachment.artifactId)
		}
		this.turns = []
		this.#wire = []
		this.failure = null
		this.#sink.onTurn?.()
	}
}
