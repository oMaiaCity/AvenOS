import {
	newQuickJSAsyncWASMModule,
	type QuickJSAsyncContext,
	type QuickJSAsyncRuntime,
	type QuickJSAsyncWASMModule
} from 'quickjs-emscripten'

/**
 * The containment layer (0130): every actor's logic runs HERE, in a QuickJS
 * VM compiled to WASM — one path for browser dev and the native app alike,
 * one path for EVERY actor: no actor caste, only logic in the sandbox and
 * capabilities at the seam.
 *
 * The VM's surface is empty by construction. There is no fetch, no require,
 * no process, no import, no timer — a fresh QuickJS context never had them;
 * what is not injected does not exist. The ONLY doors are:
 *
 * - `initState(source)`  → the state the view first renders
 * - `reduce(state, ev)`  → the next state, for UI events and messages alike
 * - `shape(state, text)` → `{state?, ops?}` — the ONLY place raw model
 *   output is parsed; a malformed answer returns null and the host keeps
 *   its state untouched.
 * - `cap(name, payload)` → a HOST capability, injected fail-closed: only
 *   the capabilities the actor was granted exist inside; calling anything
 *   else throws. The runtime is asyncified, so an async host capability
 *   (the engine, the model door) suspends the VM and looks synchronous to
 *   the logic — the 0111 recipe.
 *
 * Runaway logic is killed by fuel: an interrupt handler enforces a
 * wall-clock deadline per call, and the runtime carries a memory cap.
 */

export interface ActorEvent {
	send: string
	payload?: Record<string, unknown>
}

export interface ShapeResult {
	/** Replacement state, when the model output changed it. */
	state?: Record<string, unknown>
	/** Validated operations for the host to apply — never raw model text. */
	ops?: unknown[]
}

/**
 * What one reduction yields. Plain-state returns stay valid (a reducer may
 * just return the next state); a full return also SPEAKS: `said` is the
 * wire sentence for the model, `record` the structured result fragment —
 * both authored in the sandbox, so the host carries zero behaviour
 * knowledge, not even the words.
 */
export interface ReduceOutcome {
	state: Record<string, unknown>
	said?: string
	record?: Record<string, unknown>
}

/** A host capability: named, granted fail-closed, may be async. */
export type Capability = (payload: Record<string, unknown>) => unknown | Promise<unknown>

/**
 * Wall-clock budget of PURE VM TIME per call. Host work does not burn fuel:
 * while a capability suspends the VM, the elapsed time is credited back to
 * the deadline — a spinning reducer still dies fast, a slow engine call
 * does not kill its caller.
 */
const FUEL_MS = 1000
/** Heap cap per session — actor logic is state shaping, not data science. */
const MEMORY_LIMIT = 32 * 1024 * 1024

export class SandboxError extends Error {}

/** One WASM module for all sessions — contexts share nothing but the code. */
let modulePromise: Promise<QuickJSAsyncWASMModule> | null = null
function quickjs(): Promise<QuickJSAsyncWASMModule> {
	modulePromise ??= newQuickJSAsyncWASMModule()
	return modulePromise
}

/**
 * One actor's logic, resident in its own context: evaluated once, then
 * called through JSON until `dispose`. Sessions are cheap; contexts share
 * the module but nothing else.
 */
export class LogicSession {
	#runtime: QuickJSAsyncRuntime
	#vm: QuickJSAsyncContext
	#deadline = 0
	#disposed = false

	constructor(runtime: QuickJSAsyncRuntime, vm: QuickJSAsyncContext) {
		this.#runtime = runtime
		this.#vm = vm
	}

	async initState(source: Record<string, unknown>): Promise<Record<string, unknown>> {
		const out = await this.#call(`initState(${JSON.stringify(source)})`)
		return this.#object(out, 'initState')
	}

	async reduce(state: Record<string, unknown>, event: ActorEvent): Promise<ReduceOutcome> {
		const out = this.#object(
			await this.#call(
				`reduce(${JSON.stringify(state)}, ${JSON.stringify({ send: event.send, payload: event.payload ?? {} })})`
			),
			'reduce'
		)
		// Normalize both shapes: a full outcome carries `state`; a bare next
		// state IS the state.
		if (out.state && typeof out.state === 'object' && !Array.isArray(out.state)) {
			return {
				state: out.state as Record<string, unknown>,
				...(typeof out.said === 'string' && { said: out.said }),
				...(out.record && typeof out.record === 'object'
					? { record: out.record as Record<string, unknown> }
					: {})
			}
		}
		return { state: out }
	}

	/**
	 * Model text goes IN as an opaque string and comes back as structured
	 * data or null — parsing happens behind the membrane, so a model that
	 * answers garbage can corrupt nothing but its own return value.
	 */
	async shape(state: Record<string, unknown>, rawText: string): Promise<ShapeResult | null> {
		const out = await this.#call(`shape(${JSON.stringify(state)}, ${JSON.stringify(rawText)})`)
		if (out === null || out === undefined) return null
		if (typeof out !== 'object') return null
		return out as ShapeResult
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#vm.dispose()
		this.#runtime.dispose()
	}

	/** Evaluate one expression under fuel, marshal the result out as JSON. */
	async #call(expression: string): Promise<unknown> {
		if (this.#disposed) throw new SandboxError('session is disposed')
		this.arm()
		const result = await this.#vm.evalCodeAsync(
			`JSON.stringify((function(){ return (${expression}) })() ?? null)`
		)
		if (result.error) {
			const reason = this.#vm.dump(result.error)
			result.error.dispose()
			throw new SandboxError(reasonText(reason))
		}
		const json = this.#vm.getString(result.value)
		result.value.dispose()
		return json === 'undefined' ? undefined : JSON.parse(json)
	}

	#object(value: unknown, entry: string): Record<string, unknown> {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			throw new SandboxError(`${entry} must return an object, got ${JSON.stringify(value)}`)
		}
		return value as Record<string, unknown>
	}

	/** The fuel gauge, read by the runtime's interrupt handler. */
	get deadline(): number {
		return this.#deadline
	}

	/** Arm the fuel before an evaluation the session did not start itself. */
	arm(): void {
		this.#deadline = Date.now() + FUEL_MS
	}

	/** Credit back time the VM spent suspended on a host capability. */
	credit(ms: number): void {
		this.#deadline += ms
	}

	/**
	 * Run the VM's pending promise jobs (under fuel). There is no module
	 * loader, so this exists mainly to let tests observe that a dynamic
	 * import REJECTS instead of loading.
	 */
	pump(): void {
		this.arm()
		this.#runtime.executePendingJobs()
	}
}

function reasonText(reason: unknown): string {
	return typeof reason === 'object' && reason !== null && 'message' in reason
		? String((reason as { message: unknown }).message)
		: String(reason)
}

/**
 * Evaluate an actor's logic in a fresh, empty VM and hand back the session.
 * `caps` is the actor's ENTIRE host surface: each entry becomes callable as
 * `cap(name, payload)` inside — asyncified, so async host work (the engine,
 * the model door) suspends the VM invisibly while the logic reads
 * synchronously. Nothing beyond the given caps exists; an unknown name
 * throws. Throws when the logic itself fails to evaluate — a broken view
 * never reaches the window.
 */
export async function createSession(
	logic: string,
	caps: Record<string, Capability> = {}
): Promise<LogicSession> {
	const module = await quickjs()
	const runtime = module.newRuntime()
	runtime.setMemoryLimit(MEMORY_LIMIT)
	const vm = runtime.newContext()
	const session = new LogicSession(runtime, vm)
	// The interrupt handler is the fuel: called by the engine mid-execution,
	// returning true aborts the current evaluation.
	runtime.setInterruptHandler(() => Date.now() > session.deadline)

	// The capability door — ONE asyncified host function; JSON marshalling
	// keeps the membrane: only data crosses, never references.
	const capFn = vm.newAsyncifiedFunction('__cap', async (nameH, payloadH) => {
		const name = vm.getString(nameH)
		const payloadJson = vm.getString(payloadH)
		const impl = caps[name]
		if (!impl) throw new Error(`capability "${name}" is not granted`)
		const started = Date.now()
		const result = await impl(JSON.parse(payloadJson) as Record<string, unknown>)
		session.credit(Date.now() - started)
		return vm.newString(JSON.stringify(result ?? null))
	})
	vm.setProp(vm.global, '__cap', capFn)
	capFn.dispose()

	session.arm()
	const prelude = vm.evalCode(
		'function cap(name, payload) { return JSON.parse(__cap(name, JSON.stringify(payload || {}))) }'
	)
	if (prelude.error) {
		prelude.error.dispose()
		session.dispose()
		throw new SandboxError('capability prelude failed')
	}
	prelude.value.dispose()

	const evaluated = await vm.evalCodeAsync(logic)
	if (evaluated.error) {
		const reason = vm.dump(evaluated.error)
		evaluated.error.dispose()
		session.dispose()
		throw new SandboxError(reasonText(reason))
	}
	evaluated.value.dispose()
	return session
}
