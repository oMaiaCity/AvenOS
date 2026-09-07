import { Actor, type LlmSettings } from './actor'

/**
 * The model as a service actor (0130, straight from the abject rule: "the
 * LLM is a service abject, summoned when needed, silent otherwise").
 *
 * Every completion in the mesh is a MESSAGE to this actor — ask() answers,
 * llm-actor execution, all of it. The transport it wraps is the single
 * client of the authenticated native gateway transport, so model ids,
 * temperature clamps and JSON mode have exactly one home. The bus derives
 * its lane from this actor — no ambient model function exists anymore.
 *
 * The mailbox serializes completions like any actor's messages — the
 * actor-model guarantee, accepted deliberately over parallel calls.
 */

/**
 * Host-side ride-alongs on the lane settings. They travel ONLY between host
 * functions (cap impl → dispatch payload → transport) — never through the
 * sandbox membrane and never into a request body: the transport picks them
 * off before serializing.
 */
export interface LaneExtras {
	json?: boolean
	/** Abort seam: Stop kills the fetch, not just the reply stream. */
	signal?: AbortSignal
	/** Requested completion budget — sized to the step's need. */
	maxTokens?: number
	/** Live progress: streamed reasoning/text while the model works. */
	onDelta?: (delta: { reasoning?: string; text?: string }) => void
}

export type LlmTransport = (
	system: string,
	question: string,
	settings?: LlmSettings & LaneExtras
) => Promise<string>

/** One completed (or failed) lane call, kept for the under-the-hood view. */
interface Exchange {
	at: number
	model: string
	ok: boolean
	ms: number
	question: string
	answer: string
}

export class LlmActor extends Actor {
	#transport: LlmTransport
	/**
	 * The lane's own biography: the last completions with excerpts, surfaced
	 * through instanceState so the Explorer's Instances lens answers "what did
	 * the model ACTUALLY say" — a 163s upstream death must be readable, not
	 * inferred from a bare ok:false.
	 */
	#log: Exchange[] = []

	constructor(transport: LlmTransport) {
		super({
			id: 'llm',
			authority: 'ceo.aven',
			namespace: 'ai.gateway',
			version: '1',
			name: 'LLM',
			description:
				'The model lane as an actor: relays one completion per message to the ' +
				'inference proxy. Internal service — conversation already has its own brain.',
			tags: ['application', 'llm'],
			methods: [
				{
					name: 'llm_complete',
					description:
						'Internal relay: one whole completion from the model lane. Never needed ' +
						'in conversation — you are already talking to the model.',
					parameters: {
						type: 'object',
						properties: {
							system: { type: 'string' },
							question: { type: 'string' }
						},
						required: ['question']
					}
				}
			]
		})
		this.#transport = transport
		this.bind({
			llm_complete: async (p) => {
				const settings =
					p.settings && typeof p.settings === 'object'
						? (p.settings as LlmSettings & LaneExtras)
						: undefined
				const started = Date.now()
				const entry: Exchange = {
					at: started,
					model: settings?.model ?? 'default',
					ok: false,
					ms: 0,
					question: String(p.question ?? '').slice(0, 160),
					answer: ''
				}
				try {
					const text = await this.#transport(
						String(p.system ?? ''),
						String(p.question ?? ''),
						settings
					)
					entry.ok = true
					entry.answer = text.slice(0, 200)
					return { record: JSON.stringify({ ok: true, text }), wire: text }
				} catch (err) {
					entry.answer = `ERROR: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200)
					throw err
				} finally {
					entry.ms = Date.now() - started
					this.#log.push(entry)
					if (this.#log.length > 12) this.#log.splice(0, this.#log.length - 12)
				}
			}
		})
	}

	override instanceState(): Record<string, unknown> {
		return {
			completions: this.#log.filter((e) => e.ok).length,
			failures: this.#log.filter((e) => !e.ok).length,
			log: this.#log
				.slice(-6)
				.map((e) => `${e.ok ? '✓' : '✕'} ${e.model} ${e.ms}ms — ${e.answer || e.question}`)
		}
	}
}
