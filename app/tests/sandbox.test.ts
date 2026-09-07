import { describe, expect, test } from 'bun:test'
import { createSession, SandboxError } from '../src/lib/actors/sandbox'

/**
 * The 0130 proof, slice A: the containment layer itself.
 *
 * Actor logic runs in a QuickJS WASM VM whose surface is EMPTY — host
 * ambient authority (fetch, require, process, dynamic import) does not
 * exist inside, a spinning reducer dies by fuel, and raw model text is
 * parsed only behind the membrane (shape), so a lying model can corrupt
 * nothing but its own return value.
 */

const COUNTER_LOGIC = `
function initState(source) {
	return { count: Number(source.start) || 0, label: String(source.label || 'counter') }
}
function reduce(state, ev) {
	if (ev.send === 'INC') return Object.assign({}, state, { count: state.count + 1 })
	if (ev.send === 'ADD') return Object.assign({}, state, { count: state.count + Number(ev.payload.n || 0) })
	return state
}
function shape(state, rawText) {
	var parsed
	try { parsed = JSON.parse(rawText) } catch (e) { return null }
	if (!parsed || typeof parsed !== 'object' || typeof parsed.count !== 'number') return null
	return { state: Object.assign({}, state, { count: parsed.count }), ops: [{ op: 'set', count: parsed.count }] }
}
`

describe('logic sandbox (0130 slice A)', () => {
	test('initState derives the rendered state from source', async () => {
		const session = await createSession(COUNTER_LOGIC)
		try {
			expect(await session.initState({ start: 4, label: 'Habits' })).toEqual({
				count: 4,
				label: 'Habits'
			})
		} finally {
			session.dispose()
		}
	})

	test('reduce is the one state transition for UI events and messages alike', async () => {
		const session = await createSession(COUNTER_LOGIC)
		try {
			const s0 = await session.initState({ start: 0 })
			const s1 = (await session.reduce(s0, { send: 'INC' })).state
			const s2 = (await session.reduce(s1, { send: 'ADD', payload: { n: 40 } })).state
			expect(s2.count).toBe(41)
			// unknown events are a no-op, never a crash
			expect((await session.reduce(s2, { send: 'NOPE' })).state.count).toBe(41)
		} finally {
			session.dispose()
		}
	})

	test('fail-closed: fetch, require, process and dynamic import do not exist', async () => {
		const session = await createSession(`
			function initState() { return {} }
			function reduce(state, ev) {
				if (ev.send === 'FETCH') fetch('https://example.com')
				if (ev.send === 'REQUIRE') require('node:fs')
				if (ev.send === 'PROCESS') process.exit(1)
				if (ev.send === 'IMPORT') {
					import('node:fs').then(
						function () { importOutcome = 'loaded' },
						function () { importOutcome = 'rejected' }
					)
				}
				if (ev.send === 'CHECK') return { importOutcome: importOutcome }
				return state
			}
			var importOutcome = 'pending'
		`)
		try {
			for (const send of ['FETCH', 'REQUIRE', 'PROCESS']) {
				await expect(session.reduce({}, { send })).rejects.toThrow(SandboxError)
			}
			// dynamic import: no module loader exists, so the promise REJECTS —
			// a module can never actually arrive
			await session.reduce({}, { send: 'IMPORT' })
			session.pump()
			expect((await session.reduce({}, { send: 'CHECK' })).state).toEqual({
				importOutcome: 'rejected'
			})
			// the Function-constructor escape reaches only the VM's own globals,
			// where fetch still does not exist
			const probe = await createSession(`
				function initState() { return {} }
				function reduce(state) {
					var g = globalThis.constructor && globalThis.constructor.constructor
						? globalThis.constructor.constructor('return this')()
						: globalThis
					return { hasFetch: typeof g.fetch, hasProcess: typeof g.process }
				}
			`)
			try {
				expect((await probe.reduce({}, { send: 'X' })).state).toEqual({
					hasFetch: 'undefined',
					hasProcess: 'undefined'
				})
			} finally {
				probe.dispose()
			}
		} finally {
			session.dispose()
		}
	})

	test('a while(true) reducer is killed by fuel', async () => {
		const session = await createSession(`
			function initState() { return {} }
			function reduce(state, ev) { while (true) {} }
		`)
		try {
			const before = Date.now()
			await expect(session.reduce({}, { send: 'SPIN' })).rejects.toThrow()
			// one second of pure VM fuel — well under a hung test runner
			expect(Date.now() - before).toBeLessThan(5000)
		} finally {
			session.dispose()
		}
	})

	test('broken logic never becomes a session', async () => {
		await expect(createSession('function initState( {')).rejects.toThrow(SandboxError)
	})

	test('shape parses model text behind the membrane; garbage returns null', async () => {
		const session = await createSession(COUNTER_LOGIC)
		try {
			const state = await session.initState({ start: 1 })
			// a well-formed model answer becomes structured ops + state
			const good = await session.shape(state, '{"count": 9}')
			expect(good?.state?.count).toBe(9)
			expect(good?.ops).toEqual([{ op: 'set', count: 9 }])
			// malformed model output yields null — the HOST state is whatever it
			// was; nothing threw, nothing mutated
			expect(await session.shape(state, 'I apologize, as an AI I cannot…')).toBeNull()
			expect(await session.shape(state, '{"count": "NaN-ish"}')).toBeNull()
			expect(state.count).toBe(1)
		} finally {
			session.dispose()
		}
	})
})

describe('todo logic (0130 slice B — parity + validation)', () => {
	test('both faces validate and the style passes the whitelist', async () => {
		const { validateStyleDef, validateViewDef } = await import('@myavenceo/aven-vibes')
		const { todoBoardView, todoListView } = await import('../src/lib/actors/views/todo/view')
		const { todoStyle } = await import('../src/lib/actors/views/todo/style')
		expect(() => validateViewDef(todoListView)).not.toThrow()
		expect(() => validateViewDef(todoBoardView)).not.toThrow()
		expect(() => validateStyleDef(todoStyle)).not.toThrow()
	})

	test('initState derives the rendered state from source', async () => {
		const { composeTodoProgram } = await import('../src/lib/actors/views/todo/logic')
		const { loadMachine } = await import('../src/lib/actors/machine')
		const todoMachineSource = (await import('../src/lib/actors/todo-machine.pl?raw')).default
		const todoLogic = composeTodoProgram(loadMachine(todoMachineSource))
		const session = await createSession(todoLogic)
		try {
			const state = await session.initState({
				items: [{ title: 'Milk', status: 'done', spark: 'me' }],
				active: 'me'
			})
			expect((state.items as unknown[]).length).toBe(1)
			expect((state.counts as { done: number }).done).toBe(1)
			expect(state.sparkName).toBe('Me')
			expect(state.progressText).toBe('1 of 1 done')
		} finally {
			session.dispose()
		}
	})

	test('PARITY: the UI event and the equivalent voice call are byte-identical', async () => {
		const { composeTodoProgram } = await import('../src/lib/actors/views/todo/logic')
		const { loadMachine } = await import('../src/lib/actors/machine')
		const todoMachineSource = (await import('../src/lib/actors/todo-machine.pl?raw')).default
		const todoLogic = composeTodoProgram(loadMachine(todoMachineSource))
		const ui = await createSession(todoLogic)
		const voice = await createSession(todoLogic)
		try {
			// the click path: the add form submits ADD {text}
			let uiState = await ui.initState({})
			uiState = (await ui.reduce(uiState, { send: 'ADD', payload: { text: 'Buy milk' } })).state
			uiState = (await ui.reduce(uiState, { send: 'TOGGLE', payload: { id: 'w1' } })).state
			// the voice path: todo_create + todo_update map to the same events
			let voiceState = await voice.initState({})
			const spoken = await voice.reduce(voiceState, {
				send: 'CREATE',
				payload: { titles: ['Buy milk'] }
			})
			// the sandbox authors the words AND the structured record itself
			expect(spoken.said).toBe('created (1): w1 Buy milk (open, me)')
			expect((spoken.record as { created: { id: string }[] }).created[0]?.id).toBe('w1')
			voiceState = spoken.state
			voiceState = (
				await voice.reduce(voiceState, {
					send: 'UPDATE',
					payload: { ids: ['w1'], status: 'done' }
				})
			).state
			expect(JSON.stringify(uiState)).toBe(JSON.stringify(voiceState))
		} finally {
			ui.dispose()
			voice.dispose()
		}
	})

	test('shape applies model ops through the SAME transitions; garbage changes nothing', async () => {
		const { composeTodoProgram } = await import('../src/lib/actors/views/todo/logic')
		const { loadMachine } = await import('../src/lib/actors/machine')
		const todoMachineSource = (await import('../src/lib/actors/todo-machine.pl?raw')).default
		const todoLogic = composeTodoProgram(loadMachine(todoMachineSource))
		const session = await createSession(todoLogic)
		try {
			const state = await session.initState({})
			const shaped = await session.shape(
				state,
				'{"ops": [{"op": "create", "titles": ["From the model"]}]}'
			)
			expect(shaped).not.toBeNull()
			const next = shaped?.state as Record<string, unknown>
			expect((next.items as { title: string }[])[0]?.title).toBe('From the model')
			// prose, wrong shapes, unknown ops — all null, host state untouched
			expect(await session.shape(state, 'Sure! Here is what I did…')).toBeNull()
			expect(await session.shape(state, '{"ops": [{"op": "drop_table"}]}')).toBeNull()
			expect((state.items as unknown[]).length).toBe(0)
		} finally {
			session.dispose()
		}
	})
})

describe('capabilities (the ONE host seam, fail-closed)', () => {
	const CAP_LOGIC = `
		function initState() { return { n: 0 } }
		function reduce(state, ev) {
			if (ev.send === 'ASK_HOST') {
				var got = cap('answer', { q: ev.payload.q })
				return { state: { n: got.n }, said: 'host said ' + got.n }
			}
			if (ev.send === 'STEAL') {
				return { state: { n: cap('filesystem', {}).n } }
			}
			return state
		}
		function shape() { return null }
	`

	test('an ASYNC granted capability suspends the VM and reads synchronously inside', async () => {
		const session = await createSession(CAP_LOGIC, {
			answer: async (p) => {
				await new Promise((r) => setTimeout(r, 50))
				return { n: String(p.q).length }
			}
		})
		try {
			const out = await session.reduce({ n: 0 }, { send: 'ASK_HOST', payload: { q: 'hello' } })
			expect(out.state.n).toBe(5)
			expect(out.said).toBe('host said 5')
		} finally {
			session.dispose()
		}
	})

	test('an ungranted capability throws — what is not granted does not exist', async () => {
		const session = await createSession(CAP_LOGIC, {
			answer: () => ({ n: 1 })
		})
		try {
			await expect(session.reduce({ n: 0 }, { send: 'STEAL' })).rejects.toThrow(/not granted/)
		} finally {
			session.dispose()
		}
	})
})
