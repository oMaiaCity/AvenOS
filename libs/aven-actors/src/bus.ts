import type { MethodSpec } from './actor'
import { type Actor, functor, type HandlerResult, type Llm } from './actor'
import { ActorRegistry } from './registry'
import { singleton } from './singleton'
import { unifiable } from './term'

/**
 * The substrate: every message between any two parties flows here.
 *
 * Minimal and growable — the envelope carries what a local bus needs and
 * nothing it doesn't; the wire-format fields (sequence numbers, protocol
 * versions) arrive with the wire, later. The directory doubles as the
 * registry, and the registry is itself reachable as an actor, because a
 * layer the bus itself can't see is a layer that doesn't exist.
 */

export interface Envelope {
	id: string
	from: string
	to: string
	method: string
	payload: Record<string, unknown>
	correlationId?: string
}

let nextEnvelope = 0

/** An edge derived by unification: `from` produces what `to` requires. */
export interface DerivedEdge {
	from: string
	to: string
	predicate: string
}

/** One message waiting for a human button press — the universal HITL unit. */
export interface HeldMessage {
	id: string
	actor: string
	method: string
	label: string
	detail: string
	/** The intent this gate belongs to; absent = it belongs to the conversation. */
	context?: string
	/**
	 * The thing being decided, carried WITH the gate so the human sees it
	 * where they answer — a draft's text, a payment's figures, a proposed
	 * classification. Data only: the bar renders title/body/rows generically,
	 * never anything domain-shaped.
	 */
	preview?: HeldPreview
}

/**
 * What a gate shows while it waits. `layout` is STRUCTURAL, never domain —
 * a draft and a filing both read as `document`, a payment as a `ledger`,
 * a classification as a `choice`, a match or a merge as a `compare`, a
 * deletion as a `list`. The bar owns those five shapes; skills own which
 * one their gate speaks in.
 */
export interface HeldPreview {
	kind: string
	layout: 'document' | 'ledger' | 'choice' | 'compare' | 'list'
	title: string
	/** document: the text itself. */
	body?: string
	/** document: what rides along. */
	attachments?: string[]
	/** ledger: the figures, the first one lead. */
	rows?: { label: string; value: string }[]
	/** choice: what is proposed against what else is possible. */
	options?: { label: string; note?: string; chosen?: boolean }[]
	/** compare: exactly two sides, held against each other. */
	sides?: { heading: string; lines: string[] }[]
	/** list: what goes, what stays. */
	items?: { text: string; note?: string; struck?: boolean }[]
}

export class MessageBus {
	#actors = new Map<string, Actor>()
	readonly registry: ActorRegistry

	constructor(registry = new ActorRegistry()) {
		this.registry = registry
	}

	/**
	 * The model lane, derived — never injected. The registered `llm` ACTOR is
	 * the only door to the model (abject: the LLM is a service actor); this
	 * closure turns a message to it back into the plain Llm function the
	 * execution engine consumes. No llm actor registered = no lane.
	 */
	llmLane(): Llm | undefined {
		const actor = this.get('llm')
		if (!actor) return undefined
		return async (system, question, settings) => {
			const result = await actor.deliver('llm_complete', {
				system,
				question,
				...(settings && { settings })
			})
			try {
				const parsed = JSON.parse(result.record) as { ok?: boolean; text?: unknown }
				if (parsed.ok !== false) return String(parsed.text ?? '')
			} catch {
				// fall through to the failure below
			}
			throw new Error(result.wire)
		}
	}
	/**
	 * How machine output is parsed out of model text; the app injects the
	 * string-aware extractor. Default: plain JSON.parse, fine for tests.
	 */
	extractJson: (text: string) => unknown = (text) => {
		try {
			return JSON.parse(text)
		} catch {
			return null
		}
	}
	/** UI seam: called on registry changes; the app wires reactivity here. */
	onChange?: () => void

	/**
	 * Identity vs discovery: actors are stored by UUID — the envelope
	 * address; names are an INDEX. A template name (manifest.id) resolves to
	 * its default instance (the first registered).
	 */
	#byName = new Map<string, string>()

	register(actor: Actor): void {
		this.#actors.set(actor.uuid, actor)
		if (!this.#byName.has(actor.manifest.id)) this.#byName.set(actor.manifest.id, actor.uuid)
		if (!this.#byName.has(actor.instanceName)) this.#byName.set(actor.instanceName, actor.uuid)
		this.registry.registerActor(actor)
		this.onChange?.()
	}

	unregister(ref: string): void {
		const actor = this.get(ref)
		if (!actor) return
		this.#actors.delete(actor.uuid)
		for (const [name, uuid] of this.#byName) {
			if (uuid === actor.uuid) this.#byName.delete(name)
		}
		this.registry.withdrawInstance(actor.uuid)
		// Leaving the mesh frees the sandbox — WASM memory is not garbage.
		actor.dispose()
		this.onChange?.()
	}

	actors(): Actor[] {
		return [...this.#actors.values()]
	}

	/** Resolve uuid OR name (template name = its default instance). */
	get(ref: string): Actor | undefined {
		return this.#actors.get(ref) ?? this.#actors.get(this.#byName.get(ref) ?? '')
	}

	/** Route one envelope into its actor's mailbox. Unknown addressees error. */
	async send(envelope: Envelope): Promise<HandlerResult> {
		const actor = this.get(envelope.to)
		if (!actor) {
			const record = JSON.stringify({ ok: false, error: `no actor ${envelope.to}` })
			return { record, wire: `no actor ${envelope.to}` }
		}
		return actor.deliver(envelope.method, envelope.payload)
	}

	/**
	 * The execution engine, forward-chaining: emitting a predicate delivers it
	 * to every actor whose requires unifies with its functor — the handler for
	 * a subscribed predicate is the handler named after the functor. This is
	 * produce/require as ROUTING rather than documentation: the graph the
	 * canvas derives is the graph that runs.
	 */
	emit(
		predicate: string,
		payload: Record<string, unknown>,
		from = 'system'
	): Promise<HandlerResult[]> {
		const name = functor(predicate)
		// Unifiability, not functor equality — an emit
		// of status(offen) never reaches a consumer of status(erledigt).
		const targets = this.actors().filter(
			(a) => a.requires.some((r) => unifiable(r, predicate)) && a.handles(name)
		)
		return Promise.all(
			targets.map((t) =>
				this.send({
					id: `env_${nextEnvelope++}`,
					from,
					to: t.manifest.id,
					method: name,
					payload
				})
			)
		)
	}

	/**
	 * The model's tool list, derived from the registry — never hand-assembled.
	 * Register an actor and the model can call it; that is the whole
	 * "grows by adoption" mechanism.
	 */
	toolSpecs(): MethodSpec[] {
		const seen = new Set<string>()
		const specs: MethodSpec[] = []
		for (const actor of this.actors()) {
			for (const method of actor.manifest.methods) {
				if (seen.has(method.name)) continue
				seen.add(method.name)
				specs.push(method)
			}
		}
		return [
			...specs,
			{
				// The primitive itself, exposed: one envelope — to, method,
				// payload. Everything above is derived sugar over this.
				name: 'send',
				description:
					'Send one message to one actor: the universal envelope. Use when ' +
					'no named tool fits.',
				parameters: {
					type: 'object',
					properties: {
						to: { type: 'string', description: 'Actor id or name.' },
						method: { type: 'string', description: 'The method to deliver.' },
						payload: { type: 'object', additionalProperties: true }
					},
					required: ['to', 'method']
				}
			}
		]
	}

	/**
	 * The UI event door: a click in a view is a MESSAGE like any other — it
	 * reduces through the actor's sandbox. Views must never call applyEvent
	 * behind the bus's back.
	 */
	async uiEvent(
		_from: string,
		ref: string,
		event: { send: string; payload?: Record<string, unknown> }
	): Promise<void> {
		const actor = this.get(ref)
		if (!actor) return
		try {
			await actor.applyEvent(event)
		} catch {
			// a failed reduction leaves the actor's state untouched
		}
	}

	/**
	 * Tool-call bridge: a named method becomes an ordinary envelope.
	 */
	dispatch(from: string, method: string, payload: Record<string, unknown>): Promise<HandlerResult> {
		const owner = this.actors().find((a) => a.handles(method))
		if (!owner) {
			const record = JSON.stringify({ ok: false, error: `unknown tool ${method}` })
			return Promise.resolve({ record, wire: `unknown tool ${method}` })
		}
		const envelope = {
			id: `env_${nextEnvelope++}`,
			from,
			to: owner.uuid,
			method,
			payload
		}
		// The human gate (universal HITL): a declared `hitl` entry is HELD —
		// the message exists, but only a physical button press releases it.
		// Confirming is NOT a tool; voice cannot do it.
		const spec = owner.manifest.methods.find((m) => m.name === method)
		if (spec?.hitl && !this.onHold) {
			return Promise.resolve({
				record: JSON.stringify({ ok: false, error: 'human review is unavailable' }),
				wire: 'human review is unavailable'
			})
		}
		if (spec?.hitl && this.onHold) {
			const id = `held_${nextEnvelope++}`
			this.#held.set(id, { confirm: () => this.send(envelope) })
			this.onHold({
				id,
				actor: owner.instanceName,
				method,
				label: spec.hitl,
				detail: JSON.stringify(envelope.payload)
			})
			return Promise.resolve({
				record: JSON.stringify({ ok: true, held: id, confirmation: 'required' }),
				wire:
					`${spec.hitl} — held for the human. A button press in the HUD confirms; ` +
					'voice cannot confirm. Tell the user to press Confirm or Reject.'
			})
		}
		return this.send(envelope)
	}

	/** Held messages: the queue behind the one HITL bar. */
	#held = new Map<string, { confirm: () => Promise<HandlerResult>; reject?: () => Promise<void> }>()
	#resolving = new Set<string>()
	onHold?: (held: HeldMessage) => void
	onHeldResolved?: (id: string) => void

	/** Bind an application review to the existing human gate, without exposing a confirm tool. */
	holdAction(
		held: HeldMessage,
		action: { confirm: () => Promise<HandlerResult>; reject?: () => Promise<void> }
	): void {
		if (!this.onHold) throw new Error('human review is unavailable')
		if (this.#held.has(held.id)) return
		this.#held.set(held.id, action)
		this.onHold(held)
	}

	async confirmHeld(id: string): Promise<HandlerResult> {
		if (this.#resolving.has(id))
			return {
				record: JSON.stringify({ ok: false, error: 'review is being saved' }),
				wire: 'review is being saved'
			}
		const run = this.#held.get(id)
		if (!run) {
			return { record: JSON.stringify({ ok: false, error: 'nothing held' }), wire: 'nothing held' }
		}
		this.#resolving.add(id)
		try {
			const result = await run.confirm()
			if (JSON.parse(result.record)?.ok === false) return result
			this.#held.delete(id)
			this.onHeldResolved?.(id)
			return result
		} finally {
			this.#resolving.delete(id)
		}
	}

	async rejectHeld(id: string): Promise<void> {
		if (this.#resolving.has(id)) return
		this.#resolving.add(id)
		try {
			await this.#held.get(id)?.reject?.()
			this.#held.delete(id)
			this.onHeldResolved?.(id)
		} finally {
			this.#resolving.delete(id)
		}
	}

	/**
	 * The flow graph, derived: an edge exists wherever one actor produces what
	 * another requires. Nothing stored, nothing to keep in sync — change the
	 * registry and the next derivation changes with it.
	 */
	edges(): DerivedEdge[] {
		const result: DerivedEdge[] = []
		for (const producer of this.actors()) {
			for (const consumer of this.actors()) {
				if (consumer === producer) continue
				for (const need of consumer.requires) {
					if (producer.produces.some((p) => unifiable(p, need))) {
						result.push({
							from: producer.manifest.id,
							to: consumer.manifest.id,
							predicate: functor(need)
						})
					}
				}
			}
		}
		return result
	}

	/**
	 * Solver stages for layout: actors whose requirements are external facts
	 * fire first; everyone else joins as their inputs become available.
	 */
	stages(): Actor[][] {
		const allProduced = this.actors().flatMap((a) => a.produces)
		const known: string[] = []
		const pending = [...this.actors()]
		const result: Actor[][] = []

		while (pending.length > 0) {
			const ready = pending.filter((a) =>
				a.requires.every(
					(r) => known.some((k) => unifiable(k, r)) || !allProduced.some((p) => unifiable(p, r))
				)
			)
			if (ready.length === 0) {
				result.push(pending.splice(0))
				break
			}
			for (const actor of ready) {
				pending.splice(pending.indexOf(actor), 1)
				known.push(...actor.produces)
			}
			result.push(ready)
		}
		return result
	}
}

/** The app's one bus. Tests build their own. */
export const bus = singleton('aven.bus', () => new MessageBus())
