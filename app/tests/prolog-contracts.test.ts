import { describe, expect, test } from 'bun:test'
import { Actor } from '../src/lib/actors/actor'
import chatMachineSource from '../src/lib/actors/chat-machine.pl?raw'
import listenerMachineSource from '../src/lib/actors/listener-machine.pl?raw'
import { contractsOf, loadMachine, parseProgram } from '../src/lib/actors/machine'
import speakerMachineSource from '../src/lib/actors/speaker-machine.pl?raw'
import { unifiable } from '../src/lib/actors/term'
import { todoConfig } from '../src/lib/actors/todo.config'

const TEST_MANIFEST_IDENTITY = {
	authority: 'ceo.aven',
	namespace: 'tests.contracts',
	version: '1'
} as const

/**
 * Prolog as SSOT inside AND across actors: one `.pl` per actor declares its
 * state machine (within) and its contracts (requires/produces — the facts
 * every inter-actor edge unifies out of). No TS manifest arrays for actors
 * that carry a machine; the whole graph is Prolog-defined.
 */

describe('contracts live in the .pl', () => {
	test('requires/produces facts parse — nested predicate args intact', () => {
		const c = contractsOf(parseProgram(chatMachineSource))
		expect(c.requires.sort()).toEqual(['interrupted()', 'utterance(T)'])
		expect(c.produces.sort()).toEqual(['delta(D)', 'discard(R)', 'reply(R)'])
	})

	test('an Actor with a machine takes its contracts FROM the machine', () => {
		const chat = new Actor({
			id: 'chat',
			...TEST_MANIFEST_IDENTITY,
			name: 'Chat',
			description: '',
			tags: [],
			methods: [],
			machine: chatMachineSource
		})
		expect(chat.requires.sort()).toEqual(['interrupted()', 'utterance(T)'])
		expect(chat.produces.sort()).toEqual(['delta(D)', 'discard(R)', 'reply(R)'])
	})

	test('the todo actor-level contract comes from todo-machine.pl', () => {
		const todo = new Actor(todoConfig)
		expect(todo.produces).toContain('todo(T)')
	})

	test('the voice pipeline edges unify out of .pl contracts alone', () => {
		const listener = contractsOf(parseProgram(listenerMachineSource))
		const chat = contractsOf(parseProgram(chatMachineSource))
		const speaker = contractsOf(parseProgram(speakerMachineSource))
		// listener → chat: the utterance
		expect(listener.produces.some((p) => chat.requires.some((r) => unifiable(p, r)))).toBe(true)
		// chat → speaker: the streamed reply
		expect(chat.produces.some((p) => speaker.requires.some((r) => unifiable(p, r)))).toBe(true)
		// listener → speaker: the barge-in silences the voice
		expect(speaker.requires.some((r) => unifiable('interrupted()', r))).toBe(true)
	})
})

describe('the voice trio machines — full lifecycle with the failure edges', () => {
	test('chat: a turn machine; interrupt escapes every busy state', () => {
		const m = loadMachine(chatMachineSource)
		expect(m.states.sort()).toEqual(['idle', 'replying', 'thinking'])
		expect(m.legal('utterance', 'idle', 'thinking')).toBe(true)
		expect(m.legal('tool_round', 'replying', 'thinking')).toBe(true)
		expect(m.legal('interrupt', 'thinking', 'idle')).toBe(true)
		expect(m.legal('interrupt', 'replying', 'idle')).toBe(true)
		// a reply cannot appear out of thin air
		expect(m.legal('delta', 'idle', 'replying')).toBe(false)
	})

	test('listener: denied and error are states, with ways back', () => {
		const m = loadMachine(listenerMachineSource)
		expect(m.states).toContain('denied')
		expect(m.states).toContain('error')
		expect(m.legal('deny', 'preparing', 'denied')).toBe(true)
		expect(m.legal('retry', 'error', 'preparing')).toBe(true)
		// stop works from every live state
		for (const from of ['preparing', 'listening', 'hearing', 'error']) {
			expect(m.legal('stop', from, 'idle')).toBe(true)
		}
	})

	test('speaker: mute parks the voice; silence and interrupt return to ready', () => {
		const m = loadMachine(speakerMachineSource)
		expect(m.legal('mute', 'ready', 'muted')).toBe(true)
		expect(m.legal('mute', 'speaking', 'muted')).toBe(true)
		expect(m.legal('unmute', 'muted', 'ready')).toBe(true)
		expect(m.legal('silence', 'speaking', 'ready')).toBe(true)
		expect(m.legal('interrupt', 'speaking', 'ready')).toBe(true)
		// muted never speaks
		expect(m.legal('speak', 'muted', 'speaking')).toBe(false)
	})
})
