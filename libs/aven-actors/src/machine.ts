import { type Bindings, resolve, unify } from './term'

/**
 * A fact-only Prolog reader — the smallest engine that turns a `.pl` state
 * machine into answers. It reuses the actor layer's `unify` (term.ts, "the
 * real Prolog half"): a goal like `transition(E, F, T)` is unified against
 * every clause, and each success is one substitution. No rules (`:-`), no
 * backtracking — a finite-state machine is a set of ground facts, and that
 * is all this parses.
 *
 * The one discipline the `.pl` must keep: ground facts, no list literals.
 * Arguments are split on the top-level comma, so `[a, b]` would break —
 * flat `shows(list, open)` facts stand in for a list.
 */

export interface Transition {
	event: string
	from: string
	to: string
}

export interface Guard {
	event: string
	/** The raw condition term, e.g. `status(done)`. */
	cond: string
}

export interface Machine {
	/** The canonical clause strings, in file order. */
	db: string[]
	states: string[]
	initial: string[]
	terminal: string[]
	transitions: Transition[]
	views: string[]
	/** Which states each view renders — the list/board column set. */
	shows: { view: string; state: string }[]
	guards: Guard[]
	/** The board button's forward walk: from-state → next-state. */
	cycles: { from: string; to: string }[]
	/**
	 * The actor's OUTER contracts, from `requires(P)` / `produces(P)` facts —
	 * the `.pl` as SSOT across actors, not just within one: the same file
	 * that declares the machine declares what flows in and out, and every
	 * inter-actor edge unifies out of these.
	 */
	contracts: { requires: string[]; produces: string[] }
	/** Is this exact move a declared transition? The live-app gate. */
	legal(event: string, from: string, to: string): boolean
	/** Every move out of a state — what a task in `from` may do next. */
	nextStates(from: string): { event: string; to: string }[]
	/**
	 * The status-to-status moves among real states (open/doing/done) — the
	 * table the reducer gates on. Excludes create (from the void) and the
	 * deletions (into it), keeping only moves between shown columns.
	 */
	statusMoves(): { from: string; to: string }[]
	/** May a task move directly from one status to another? */
	legalStatus(from: string, to: string): boolean
	/** The board button's next status after `from`, or `from` if none. */
	nextStatus(from: string): string
}

/**
 * Split a Prolog program into canonical clause strings: strip `%` comments,
 * collapse whitespace, split on the clause-terminating `.`. Ground facts
 * carry no `.` of their own, so the split is safe.
 */
export function parseProgram(source: string): string[] {
	return source
		.split('\n')
		.map((line) => line.replace(/%.*$/, ''))
		.join('\n')
		.split('.')
		.map((clause) => clause.replace(/\s+/g, ' ').trim())
		.filter((clause) => clause.length > 0)
}

/**
 * Contract facts, extracted by shape rather than unification: the inner term
 * of `requires(utterance(T))` is itself a predicate with parentheses, which
 * the flat argument split would mangle — the regex takes the whole inside.
 */
export function contractsOf(db: string[]): { requires: string[]; produces: string[] } {
	const pick = (name: string) =>
		db.flatMap((clause) => {
			const m = clause.match(new RegExp(`^${name}\\((.+)\\)$`))
			const predicate = m?.[1]
			return predicate ? [predicate.trim()] : []
		})
	return { requires: pick('requires'), produces: pick('produces') }
}

/** findall: every substitution under which `goal` unifies with a clause. */
export function query(db: string[], goal: string): Bindings[] {
	const out: Bindings[] = []
	for (const clause of db) {
		const bindings = unify(goal, clause)
		if (bindings) out.push(bindings)
	}
	return out
}

/** Load a `.pl` program into a queryable, typed state machine. */
export function loadMachine(source: string): Machine {
	const db = parseProgram(source)
	const one = (goal: string, v: string) => query(db, goal).map((b) => resolve(v, b))

	const transitions: Transition[] = query(db, 'transition(E, F, T)').map((b) => ({
		event: resolve('E', b),
		from: resolve('F', b),
		to: resolve('T', b)
	}))
	const states = one('state(S)', 'S')
	const cycles = query(db, 'cycle(F, T)').map((b) => ({
		from: resolve('F', b),
		to: resolve('T', b)
	}))
	const isState = (s: string) => states.includes(s)
	const statusMoves = () =>
		transitions
			.filter((t) => isState(t.from) && isState(t.to))
			.map((t) => ({ from: t.from, to: t.to }))

	return {
		db,
		states,
		initial: one('initial(S)', 'S'),
		terminal: one('terminal(S)', 'S'),
		transitions,
		views: one('view(V)', 'V'),
		shows: query(db, 'shows(V, S)').map((b) => ({
			view: resolve('V', b),
			state: resolve('S', b)
		})),
		guards: query(db, 'guard(E, C)').map((b) => ({
			event: resolve('E', b),
			cond: resolve('C', b)
		})),
		cycles,
		contracts: contractsOf(db),
		legal: (event, from, to) =>
			transitions.some((t) => t.event === event && t.from === from && t.to === to),
		nextStates: (from) =>
			transitions.filter((t) => t.from === from).map((t) => ({ event: t.event, to: t.to })),
		statusMoves,
		legalStatus: (from, to) => statusMoves().some((m) => m.from === from && m.to === to),
		nextStatus: (from) => cycles.find((c) => c.from === from)?.to ?? from
	}
}
