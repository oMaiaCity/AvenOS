import { artifactDescription, artifactProcessingProgress } from '$lib/artifacts/processing'
import { anonymousSpeakerFromPayload, anonymousSpeakerTone } from '$lib/chat/anonymous-speaker'
import { Chat } from '$lib/chat/chat.svelte'
import { complete, extractJsonObject } from '$lib/chat/redpill'
import type { Activity } from './activity.svelte'
import { activity } from './activity.svelte'
import { Actor } from './actor'
import { bus } from './bus'
import chatMachineSource from './chat-machine.pl?raw'
import { LlmActor } from './llm.actor'
import { RegistryActor } from './registry.actor'
import { singleton } from './singleton'
import { summarizeRecord } from './summarize'
import { todoActor } from './todo.svelte'
import { chatStyle, chatView } from './views/chat/view'

/**
 * The brain as an actor. The conversation machinery (streaming, tool rounds,
 * degeneration guards) stays in Chat; the wrapper puts it on the mesh:
 *
 * - in: utterance(T) from the listener, interrupted() for barge-in
 * - out: delta(D) while the reply streams, reply(R) when it is done,
 *   discard(R) when a tool round unsays the placeholder
 * - sideways: tool calls become envelopes on the bus, specs derived from the
 *   registry — register an actor and the model can call it.
 */
export class ChatActor extends Actor {
	readonly core: Chat

	/**
	 * The window projection: the conversation as renderable state for the
	 * universal view engine. Replaced wholesale on every turn event so the
	 * chat WINDOW re-renders like any other actor view.
	 */
	state = $state<Record<string, unknown>>({
		rows: [],
		statusText: '',
		statusClass: 'ch-status ch-status--hidden'
	})

	#project() {
		const rows = this.core.turns.map((t) => {
			const me = t.role === 'user'
			const speakerTone = t.anonymousSpeaker
				? ` ch-bubble--speaker-${anonymousSpeakerTone(t.anonymousSpeaker)}`
				: ''
			const attachment = t.attachment
			const processing = attachment?.processing
			const content = attachment
				? attachment.status === 'committed'
					? `${attachment.originalName} · artifact ${attachment.artifactId} · ${artifactDescription(attachment.originalName, processing)} · ${artifactProcessingProgress(processing).label}`
					: attachment.status === 'failed'
						? `${attachment.originalName} · upload failed`
						: `${attachment.originalName} · ${attachment.progress}%`
				: t.content === ''
					? '…'
					: t.content
			return {
				id: t.id,
				content,
				rowClass: `ch-row${me ? ' ch-row--me' : ''}`,
				bubbleClass: `ch-bubble${me ? ` ch-bubble--me${speakerTone}` : ''}`
			}
		})
		this.state = {
			rows,
			statusText: this.core.streaming ? 'thinking…' : rows.length === 0 ? 'Say something.' : '',
			statusClass: `ch-status${this.core.streaming || rows.length === 0 ? '' : ' ch-status--hidden'}`
		}
	}

	constructor() {
		super({
			id: 'chat',
			authority: 'ceo.aven',
			namespace: 'assistant.chat',
			version: '1',
			name: 'Chat',
			description:
				'The conversation: takes utterances, thinks with the model, calls tools ' +
				'over the bus, and streams the reply out sentence by sentence.',
			tags: ['voice', 'todo'],
			methods: [],
			// Flow AND contracts from the one `.pl` — the turn machine plus
			// requires(utterance(T)) / produces(delta(D)) etc.
			machine: chatMachineSource,
			view: chatView,
			style: chatStyle
		})

		this.core = new Chat(
			{
				onDelta: (text) => {
					this.#project()
					void bus.emit('delta(D)', { text }, 'chat')
				},
				onDone: () => {
					this.#project()
					void bus.emit('reply(R)', {}, 'chat')
				},
				// Tool calls mean the real answer is still coming; unsay the placeholder.
				onRestart: () => {
					this.#project()
					void bus.emit('discard(R)', {}, 'chat')
				},
				// Every turn boundary (user push, reply push, clear) re-projects
				// the window state.
				onTurn: () => {
					this.#project()
				}
			},
			{
				// A getter, not a snapshot: the registry grows at runtime (created
				// actors, their windows), and a list frozen at construction would
				// hide every late arrival from the model — which is exactly how
				// "zeig den Kalender" once had no tool to call.
				get specs() {
					return bus.toolSpecs().map(({ name, description, parameters }) => ({
						name,
						description,
						parameters
					}))
				},
				run: async (name, args) => {
					let payload: Record<string, unknown> = {}
					try {
						payload = args.trim() === '' ? {} : JSON.parse(args)
					} catch {
						const record = JSON.stringify({ ok: false, error: `unreadable arguments: ${args}` })
						return { record, wire: 'unreadable arguments' }
					}
					if (name === 'send') {
						const inner =
							payload.payload && typeof payload.payload === 'object'
								? (payload.payload as Record<string, unknown>)
								: {}
						const result = await bus.dispatch('chat', String(payload.method ?? ''), inner)
						activity.show(summarizeCall(String(payload.method ?? ''), result.record))
						return result
					}
					const result = await bus.dispatch('chat', name, payload)
					activity.show(summarizeCall(name, result.record))
					return result
				}
			}
		)

		this.bind({
			// Not awaited: a turn runs long, and the mailbox must stay free for
			// the barge-in that interrupts it.
			utterance: (p) => {
				void this.core.send(String(p.text ?? ''), anonymousSpeakerFromPayload(p) ?? undefined)
				return { record: '{"ok":true}', wire: 'ok' }
			},
			interrupted: () => {
				this.core.stop()
				return { record: '{"ok":true}', wire: 'ok' }
			}
		})
	}

	override instanceState(): Record<string, unknown> {
		return {
			turns: this.core.turns.length,
			streaming: this.core.streaming ? 'yes' : 'no',
			model: 'deepseek-v4-flash-0731'
		}
	}
}

/** One displayable entry for a call — the owning actor knows its own words. */
export function summarizeCall(name: string, record: string): Omit<Activity, 'id'> | null {
	if (name.endsWith('_window_toggle')) {
		try {
			const parsed = JSON.parse(record)
			return {
				kind: 'switched',
				titles: [],
				note: `window ${String(parsed.window ?? '').replace(/-window$/, '')} ${parsed.open ? 'on' : 'off'}`
			}
		} catch {
			return null
		}
	}
	return summarizeRecord(name, record)
}

/**
 * Registration and the one LLM, in dependency order: work items first so the
 * chat's derived tool list contains them, the pipeline actors after.
 */
// The model as a service ACTOR (0130): the mesh reaches the model only by
// message to `llm`, and this transport is the single client of the server
// proxy — model default, sampling, and JSON mode have one home.
export const llmActor = singleton(
	'aven.llm',
	() =>
		new LlmActor((system, question, settings) =>
			complete(
				[
					{ role: 'system', content: system },
					{ role: 'user', content: question }
				],
				{
					// Default lane = the fast voice model; a manifest's own llm
					// settings override it per actor.
					model: settings?.model ?? 'deepseek/deepseek-v4-flash-0731',
					temperature: settings?.temperature,
					json: settings?.json,
					// Host ride-alongs: Stop aborts the fetch, progress streams out.
					signal: settings?.signal,
					onDelta: settings?.onDelta,
					maxTokens: settings?.maxTokens
				}
			)
		)
)
bus.register(llmActor)
bus.extractJson = extractJsonObject

bus.register(todoActor)
export const registryActor = singleton('aven.registry', () => new RegistryActor(bus))
bus.register(registryActor)
export const chatActor = singleton('aven.chat', () => new ChatActor())
bus.register(chatActor)
