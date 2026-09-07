/**
 * The one primitive. Everything above this file is composition.
 *
 * An actor is an id, a manifest, private state, and handlers — the classic
 * Hewitt shape, Abject-flavored (abject.world), local-only. Two ideas carried
 * over deliberately:
 *
 * - **Messaging is the design surface.** Actors interact only through
 *   envelopes on the bus; the model's tool calls, the UI's clicks and (later)
 *   other machines are just different senders.
 * - **ask() is the one LLM-touching handler.** Every actor can be interviewed
 *   in natural language and answers *as itself*, from its own manifest and
 *   state. Ordinary messages stay deterministic. Without an LLM available the
 *   answer degrades to manifest prose — the cheap answer, never no answer.
 *
 * Contracts are Prolog-flavored: methods (and the actor itself) declare
 * `requires` / `produces` predicates like `work(M, Spark)`. Nothing is wired
 * by hand — the flow graph is DERIVED by unifying produces against requires
 * ("compression, not abstraction": a stored flow template would freeze a
 * judgment; the derivation regenerates with the registry).
 */

import type { SchemaId } from './ids'
import { contractsOf, parseProgram } from './machine'
import {
	type ActorEvent,
	type Capability,
	createSession,
	type LogicSession,
	type ReduceOutcome
} from './sandbox'
import { unifiable } from './term'

/** A predicate as written in a contract: `mail(M)`, `intent(M, Class)`. */
export type Predicate = string

/** Transport-neutral shape contributed by an optional view adapter. */
export interface ActorViewNode {
	tag?: string
	class?: string
	text?: string
	value?: string
	format?: 'md' | 'markdown'
	attrs?: Record<string, string>
	children?: ActorViewNode[]
	$each?: { items: string; template: ActorViewNode }
	$slot?: string
	$on?: Record<string, { send: string; payload?: Record<string, unknown> }>
}

export type ActorView = ActorViewNode & { content?: ActorViewNode }

export interface ActorStyle {
	tokens?: Record<string, unknown>
	components?: Record<string, Record<string, unknown>>
	selectors?: Record<string, Record<string, unknown>>
}

/** `mail(M)` → `mail` — predicates unify on their functor name. */
export function functor(p: Predicate): string {
	const at = p.indexOf('(')
	return (at === -1 ? p : p.slice(0, at)).trim()
}

/**
 * THE MERGE LAW (0148) — a composite's interface, derived from its members
 * and never stored:
 *
 *   requires = ⋃ members.requires \ ⋃ members.produces   (unsatisfied inputs)
 *   produces = ⋃ members.produces                        (everything offered)
 *
 * Abject, Prolog and category theory agree: the composite is the rule
 * `skill(X,Z) :- a(X,Y), b(Y,Z)` — the internally-bound `Y` disappears from
 * the head, the free `X`/`Z` are the boundary. Matching is by unification,
 * the same rule that derives every edge.
 */
export function compositeInterface(members: { requires: Predicate[]; produces: Predicate[] }[]): {
	requires: Predicate[]
	produces: Predicate[]
} {
	const produced = members.flatMap((m) => m.produces)
	const required = members.flatMap((m) => m.requires)
	return {
		requires: [...new Set(required.filter((r) => !produced.some((p) => unifiable(p, r))))],
		produces: [...new Set(produced)]
	}
}

export interface MethodSpec {
	name: string
	description: string
	/** JSON schema for the arguments, exactly what the LLM tool layer wants. */
	parameters: Record<string, unknown>
	/** How the operation behaves when considered by a general planner/runtime. */
	mode?: 'transform' | 'observe' | 'effect' | 'stream' | 'view'
	/** The strongest retry guarantee the implementation makes. */
	idempotency?: 'pure' | 'idempotent' | 'reconcilable' | 'none'
	/** Relative logical cost before a physical actor placement is selected. */
	cost?: number
	requires?: Predicate[]
	produces?: Predicate[]
	/** Artifact/envelope bindings for every logical input and output. */
	inputSlots?: CapabilitySlot[]
	outputSlots?: CapabilitySlot[]
	/**
	 * Declared behaviour (0130): the tool call IS this event into the actor's
	 * sandboxed reducer — payload passes through verbatim. With it, no handler
	 * is written by hand: ONE generic adapter serves every declared method,
	 * and the method doubles as the Prolog clause body for its `produces`.
	 */
	event?: { send: string }
	/**
	 * The human gate: a short imperative label ('Delete tasks irreversibly').
	 * A dispatch of this entry is HELD — it executes only after a physical
	 * button press in the HUD. Voice cannot confirm; confirming is not a
	 * tool. UI clicks bypass the gate (a click IS the button press).
	 */
	hitl?: string
}

export interface CapabilitySlot {
	name: string
	predicate: Predicate
	/** Canonical schema identity; a store adapter owns concrete type keys. */
	schema?: SchemaId
	role?: string
	cardinality: 'one' | 'optional' | 'many'
	/** Sensitive slots carry ephemeral handles, never durable secret values. */
	sensitive?: boolean
}

/** Per-actor model lane: which model answers as this actor, and how. */
export interface LlmSettings {
	/** Model id; unset = the app's default execution model. */
	model?: string
	temperature?: number
}

/**
 * The memory seam: an actor that keeps records. The engine calls `remember`
 * with each successful llm-execution output, so running "make an appointment"
 * IS what fills the calendar. Duck-typed so the bus needs no import of any
 * concrete class.
 */
export interface RecordKeeper {
	remember(out: unknown): void
	/** The newest record's data, if any — the shape template for the next run. */
	latestRecord?(): unknown
}

export function keepsRecords(actor: Actor): actor is Actor & RecordKeeper {
	return typeof (actor as Partial<RecordKeeper>).remember === 'function'
}

/**
 * The membrane seam (0130): an actor whose sandboxed logic exports shape()
 * parses raw model text ITSELF — the host hands the string in and receives
 * structured ops or null, never interpreting the text. Duck-typed like the
 * record seam.
 */
export function shapesModelText(actor: Actor): boolean {
	return typeof actor.manifest.logic === 'string' && actor.manifest.logic !== ''
}

export interface Manifest {
	id: string
	/** Explicit contract owner: identity `id.aven`, runtime `os.aven`, or app `ceo.aven`. */
	authority: string
	/** Stable domain namespace inside the authority. */
	namespace: string
	/** Contract version, never a deployment version. */
	version: string
	name: string
	description: string
	/** Display grouping — a "flow" is a tag, not a stored thing. */
	tags: string[]
	methods: MethodSpec[]
	/** Actor-level contracts, for actors whose role is one transformation. */
	requires?: Predicate[]
	produces?: Predicate[]
	/**
	 * Declared LLM actor: its description becomes its instruction (board
	 * 0129). `true` = default lane; an object picks the model and sampling
	 * for THIS actor — a careful worker may pin a slower model while a
	 * summarizer stays on the fast lane, each declared in its own manifest.
	 */
	llm?: boolean | LlmSettings
	/**
	 * The actor's granted capabilities (fail-closed): ONLY these host doors
	 * exist inside its sandbox — everything else throws. Names resolve
	 * against what the constructing wiring provides; an undeclared or
	 * unprovided capability simply does not exist.
	 */
	capabilities?: string[]
	/**
	 * The actor's state machine as data — the `.pl` source (parsed by
	 * machine.ts). The FLOW declaration, distinct from `logic` (behaviour):
	 * every actor is a statechart, and this is where it says so. Sandbox
	 * actors also inject it into their program; the canvas reads it to draw
	 * the actor's FSM.
	 */
	machine?: string
	/**
	 * The sandboxed program (0130): the actor's ENTIRE behaviour as data —
	 * initState/reduce/shape run in the QuickJS VM, never in the host.
	 */
	logic?: string
	/** Seed data handed to the logic's initState; defaults to {}. */
	source?: Record<string, unknown>
	/**
	 * The actor's view as data: validated JSON the aven-ui engine renders
	 * into a shadow root — the actor paints its own view, the host renders.
	 */
	view?: ActorView
	style?: ActorStyle
	/**
	 * Additional named views — the todo pattern (list + board over one
	 * subject): each becomes its OWN window over the SAME actor and logic.
	 */
	views?: { key: string; name: string; view: ActorView; style?: ActorStyle }[]
}

/** The declared model lane, normalized: null when the actor is not an llm actor. */
export function llmSettings(m: Manifest): LlmSettings | null {
	if (m.llm === true) return {}
	if (m.llm && typeof m.llm === 'object') return m.llm
	return null
}

/** What a handler gives back: a record for the UI, prose for the model. */
export interface HandlerResult {
	record: string
	wire: string
}

export type Handler = (payload: Record<string, unknown>) => HandlerResult | Promise<HandlerResult>

/**
 * The natural-language service an ask() consults; injected, never imported.
 * `json` rides along on machine lanes (llm-actor execution) so the transport
 * can enforce object output; ask() leaves it unset and gets prose.
 */
export type Llm = (
	system: string,
	question: string,
	settings?: LlmSettings & { json?: boolean }
) => Promise<string>

export class Actor {
	readonly manifest: Manifest
	/**
	 * The instance identity (0133): a global uuid, minted at construction —
	 * the envelope address. The manifest id is the TEMPLATE's durable name
	 * (abject's TypeId); this is the runtime one (abject's AbjectId).
	 */
	readonly uuid: string = crypto.randomUUID()
	/**
	 * The instance's display name — metadata for discovery, never identity.
	 * The default instance of a template goes by the template id itself.
	 */
	instanceName: string
	#handlers: Record<string, Handler>
	/** Supervision bookkeeping: how often handlers died, and the last reason. */
	failures = 0
	lastError: string | null = null

	/**
	 * The sandboxed half (0130): when the manifest carries `logic`, the actor
	 * boots a LogicSession — reduce/shape/initState run in the QuickJS VM,
	 * `state` mirrors the latest result. Subclasses that want reactivity
	 * `declare` nothing extra — they redeclare `state` with $state; the base
	 * never initializes the field (that would shadow a subclass accessor).
	 */
	declare state: Record<string, unknown>
	#session: LogicSession | null = null
	#ready: Promise<void> = Promise.resolve()
	/**
	 * The `.pl` as SSOT for contracts too (across actors, not just within):
	 * `requires(P)`/`produces(P)` facts in the machine, parsed once. When the
	 * machine declares them they ARE the actor-level contracts — the TS
	 * manifest arrays are only for actors without a machine.
	 */
	#contracts: { requires: Predicate[]; produces: Predicate[] } | null = null

	constructor(
		manifest: Manifest,
		handlers: Record<string, Handler> = {},
		caps: Record<string, Capability> = {}
	) {
		this.manifest = manifest
		this.instanceName = manifest.id
		this.#handlers = handlers
		if (manifest.machine) {
			const c = contractsOf(parseProgram(manifest.machine))
			if (c.requires.length > 0 || c.produces.length > 0) this.#contracts = c
		}
		if (manifest.logic) this.#ready = this.#boot(manifest, caps)
		// The generic adapter, bound for every declared method — and again
		// under the produced functor (the engine's clause body) AND the
		// required functor (the emit receiver): a consumer entry that requires
		// imperial(I) IS where imperial emissions land.
		for (const method of manifest.methods) {
			const send = method.event?.send
			if (!send) continue
			const adapter = (p: Record<string, unknown>) => this.#adapt(send, p)
			this.bind({ [method.name]: adapter })
			for (const predicate of [method.produces?.[0], method.requires?.[0]]) {
				if (predicate && !this.handles(functor(predicate))) {
					this.bind({ [functor(predicate)]: adapter })
				}
			}
		}
	}

	async #boot(manifest: Manifest, caps: Record<string, Capability>): Promise<void> {
		// Fail-closed grants: the session receives EXACTLY the declared and
		// provided capabilities — an undeclared name never enters the VM.
		const granted = Object.fromEntries(
			(manifest.capabilities ?? []).flatMap((name) => (caps[name] ? [[name, caps[name]]] : []))
		)
		this.#session = await createSession(manifest.logic ?? '', granted)
		this.state = await this.#session.initState(manifest.source ?? {})
	}

	/**
	 * Free the sandbox session — a QuickJS runtime is real WASM memory, and
	 * actors that leave the mesh (disposed instances, probe scratch, test
	 * meshes) must give it back or the module heap eventually runs dry.
	 */
	dispose(): void {
		this.#session?.dispose()
		this.#session = null
	}

	/**
	 * The one door for every state change — UI events, voice tools and the
	 * proof engine all land here, so the paths cannot drift apart.
	 */
	async applyEvent(event: ActorEvent): Promise<ReduceOutcome> {
		await this.#ready
		if (!this.#session) throw new Error(`${this.manifest.id} has no logic session`)
		const outcome = await this.#session.reduce(this.state, event)
		this.state = outcome.state
		return outcome
	}

	/**
	 * The membrane seam: raw model text is parsed by the SANDBOXED shape(),
	 * never by the host. Garbage returns null and the state stays exactly
	 * what it was.
	 */
	async shapeModelText(
		rawText: string
	): Promise<{ state?: Record<string, unknown>; ops?: unknown[] } | null> {
		await this.#ready
		if (!this.#session) return null
		const shaped = await this.#session.shape(this.state, rawText)
		if (shaped?.state) this.state = shaped.state
		return shaped
	}

	/** Tool payload → event, verbatim; the sandbox answers with words and data. */
	async #adapt(send: string, payload: Record<string, unknown>) {
		const outcome = await this.applyEvent({ send, payload })
		const record = outcome.record ?? { ok: true }
		return {
			record: JSON.stringify('ok' in record ? record : { ok: true, ...record }),
			wire: outcome.said ?? JSON.stringify(record)
		}
	}

	/**
	 * Coordinator gestalt (0148): the member actors this one composes. A
	 * composite is the Prolog rule `skill(X,Z) :- a(X,Y), b(Y,Z)` — and its
	 * interface is DERIVED from the members by the merge law, never stored.
	 */
	members: Actor[] = []

	/** Every contract this actor participates in, method- and actor-level, deduped. */
	get requires(): Predicate[] {
		if (this.members.length > 0) return compositeInterface(this.members).requires
		return [
			...new Set([
				...(this.#contracts?.requires ?? this.manifest.requires ?? []),
				...this.manifest.methods.flatMap((m) => m.requires ?? [])
			])
		]
	}

	get produces(): Predicate[] {
		if (this.members.length > 0) return compositeInterface(this.members).produces
		return [
			...new Set([
				...(this.#contracts?.produces ?? this.manifest.produces ?? []),
				...this.manifest.methods.flatMap((m) => m.produces ?? [])
			])
		]
	}

	/**
	 * Late-bound handlers, for subclasses whose handlers close over `this` —
	 * class fields are not initialized yet when super() runs.
	 */
	protected bind(handlers: Record<string, Handler>): void {
		Object.assign(this.#handlers, handlers)
	}

	handles(method: string): boolean {
		return method in this.#handlers
	}

	/**
	 * The handler's actual source — derived from the running function, never
	 * stored ("compression, not abstraction"): change the handler and the
	 * next read changes with it. This is the Abject move of answering from
	 * one's own code, minus the LLM.
	 */
	handlerSource(method: string): string | null {
		const handler = this.#handlers[method]
		return handler ? handler.toString() : null
	}

	/** Messages waiting in the mailbox right now. */
	get pending(): number {
		return this.#mailbox.length
	}

	/**
	 * The mailbox: messages are processed strictly one at a time, in arrival
	 * order — the actor-model guarantee that makes per-actor reasoning local.
	 * Ordinary messages stay deterministic (no LLM anywhere in this path); a
	 * handler that throws is contained as a structured error result and the
	 * mailbox keeps pumping.
	 */
	#mailbox: {
		method: string
		payload: Record<string, unknown>
		resolve: (r: HandlerResult) => void
	}[] = []
	#pumping = false

	deliver(method: string, payload: Record<string, unknown>): Promise<HandlerResult> {
		return new Promise((resolve) => {
			this.#mailbox.push({ method, payload, resolve })
			void this.#pump()
		})
	}

	async #pump(): Promise<void> {
		if (this.#pumping) return
		this.#pumping = true
		try {
			while (this.#mailbox.length > 0) {
				const message = this.#mailbox.shift()
				if (!message) break
				message.resolve(await this.#handle(message.method, message.payload))
			}
		} finally {
			this.#pumping = false
		}
	}

	async #handle(method: string, payload: Record<string, unknown>): Promise<HandlerResult> {
		const handler = this.#handlers[method]
		if (!handler) {
			const record = JSON.stringify({
				ok: false,
				error: `${this.manifest.id} does not know ${method}`
			})
			return { record, wire: `${this.manifest.id} does not know ${method}` }
		}
		// Supervision as backtracking, the runtime half: a handler that throws
		// gets one fresh attempt — the Erlang restart in miniature. Only after
		// the retry also dies is the failure recorded and returned as a
		// structured result; ok:false results are answers, not crashes, and are
		// never retried.
		for (let attempt = 0; ; attempt++) {
			try {
				return await handler(payload)
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err)
				if (attempt === 0) continue
				this.failures++
				this.lastError = `${method}: ${reason}`
				const record = JSON.stringify({ ok: false, error: `${method} failed: ${reason}` })
				return { record, wire: `${method} failed: ${reason}` }
			}
		}
	}

	/**
	 * The template/instance split, made explicit. The manifest is the CLASS —
	 * the timeless contract: what this kind of actor is, does, requires and
	 * produces. `instanceState()` is the INSTANCE — what this particular
	 * running one holds right now. Stubs return null: they are templates that
	 * no execution has instantiated yet.
	 */
	instanceState(): Record<string, unknown> | null {
		return null
	}
}
