import { describe, expect, test } from 'bun:test'
import { Actor, functor } from '../src/lib/actors/actor'
import { MessageBus } from '../src/lib/actors/bus'

const TEST_MANIFEST_IDENTITY = {
	authority: 'ceo.aven',
	namespace: 'tests.actors',
	version: '1'
} as const

/** Two tiny actors whose contracts chain: source produces what sink requires. */
function pair() {
	const source = new Actor(
		{
			id: 'source',
			...TEST_MANIFEST_IDENTITY,
			name: 'Source',
			description: 'Erzeugt Dinge.',
			tags: ['test'],
			methods: [
				{
					name: 'make_thing',
					description: 'Macht ein Ding.',
					parameters: { type: 'object', properties: {} },
					produces: ['thing(T)']
				}
			]
		},
		{
			make_thing: () => ({ record: '{"ok":true}', wire: 'ein Ding gemacht' })
		}
	)
	const sink = new Actor({
		id: 'sink',
		...TEST_MANIFEST_IDENTITY,
		name: 'Sink',
		description: 'Verbraucht Dinge.',
		tags: ['test'],
		methods: [],
		requires: ['thing(X)'],
		produces: ['done(X)']
	})
	const bus = new MessageBus()
	bus.register(source)
	bus.register(sink)
	return { bus, source, sink }
}

describe('actor core', () => {
	test('an envelope reaches the right handler', async () => {
		const { bus } = pair()
		const result = await bus.dispatch('test', 'make_thing', {})
		expect(result.wire).toBe('ein Ding gemacht')
	})

	test('an unknown method answers as a structured error, never throws', async () => {
		const { bus } = pair()
		const result = await bus.dispatch('test', 'no_such_method', {})
		expect(JSON.parse(result.record).ok).toBe(false)
		expect(result.wire).toContain('no_such_method')
	})

	test('edges derive from produces→requires unification', () => {
		const { bus } = pair()
		expect(bus.edges()).toEqual([{ from: 'source', to: 'sink', predicate: 'thing' }])
	})

	test('predicates unify on their functor, arguments free', () => {
		// thing(T) and thing(X) are the same functor — that IS the unification.
		expect(functor('thing(T)')).toBe(functor('thing(X)'))
	})

	test('stages place producers before consumers', () => {
		const { bus } = pair()
		const ids = bus.stages().map((stage) => stage.map((a) => a.manifest.id))
		expect(ids).toEqual([['source'], ['sink']])
	})

	test('the derived tool list carries every method plus the send primitive', () => {
		const { bus } = pair()
		const names = bus.toolSpecs().map((s) => s.name)
		expect(names).toContain('make_thing')
		expect(names).toContain('send')
	})
})

describe('execution engine', () => {
	test('emit fans out to exactly the actors whose requires unify', async () => {
		const bus = new MessageBus()
		const seen: string[] = []
		const listenerFor = (id: string) =>
			new Actor(
				{
					id,
					...TEST_MANIFEST_IDENTITY,
					name: id,
					description: '',
					tags: [],
					methods: [],
					requires: ['thing(X)'],
					produces: []
				},
				{
					thing: (p) => {
						seen.push(`${id}:${p.value}`)
						return { record: '{"ok":true}', wire: 'ok' }
					}
				}
			)
		bus.register(listenerFor('a'))
		bus.register(listenerFor('b'))
		// c requires something else and must NOT receive the emit
		bus.register(
			new Actor(
				{
					id: 'c',
					...TEST_MANIFEST_IDENTITY,
					name: 'c',
					description: '',
					tags: [],
					methods: [],
					requires: ['other(Y)']
				},
				{
					other: () => {
						seen.push('c')
						return { record: '{"ok":true}', wire: 'ok' }
					}
				}
			)
		)
		await bus.emit('thing(T)', { value: 1 })
		expect(seen.sort()).toEqual(['a:1', 'b:1'])
	})

	test('a mailbox processes async handlers strictly one at a time, in order', async () => {
		const log: string[] = []
		const actor = new Actor(
			{
				id: 's',
				...TEST_MANIFEST_IDENTITY,
				name: 's',
				description: '',
				tags: [],
				methods: []
			},
			{
				slow: async (p) => {
					log.push(`start:${p.n}`)
					// The first message dawdles; without a real mailbox the second
					// would interleave and finish first.
					await new Promise((r) => setTimeout(r, p.n === 1 ? 30 : 1))
					log.push(`end:${p.n}`)
					return { record: '{"ok":true}', wire: 'ok' }
				}
			}
		)
		await Promise.all([actor.deliver('slow', { n: 1 }), actor.deliver('slow', { n: 2 })])
		expect(log).toEqual(['start:1', 'end:1', 'start:2', 'end:2'])
	})

	test('a throwing handler is contained as a structured error', async () => {
		const actor = new Actor(
			{
				id: 't',
				...TEST_MANIFEST_IDENTITY,
				name: 't',
				description: '',
				tags: [],
				methods: []
			},
			{
				boom: () => {
					throw new Error('kaputt')
				}
			}
		)
		const result = await actor.deliver('boom', {})
		expect(JSON.parse(result.record).ok).toBe(false)
		expect(result.wire).toContain('kaputt')
	})
})

describe('supervision', () => {
	test('a handler that throws once is retried and succeeds silently', async () => {
		let calls = 0
		const actor = new Actor(
			{
				id: 'flaky',
				...TEST_MANIFEST_IDENTITY,
				name: 'flaky',
				description: '',
				tags: [],
				methods: []
			},
			{
				work: () => {
					calls++
					if (calls === 1) throw new Error('transient')
					return { record: '{"ok":true}', wire: 'geschafft' }
				}
			}
		)
		const result = await actor.deliver('work', {})
		expect(result.wire).toBe('geschafft')
		expect(actor.failures).toBe(0)
	})

	test('a handler that keeps throwing is recorded after the retry', async () => {
		const actor = new Actor(
			{
				id: 'dead',
				...TEST_MANIFEST_IDENTITY,
				name: 'dead',
				description: '',
				tags: [],
				methods: []
			},
			{
				work: () => {
					throw new Error('permanent')
				}
			}
		)
		const result = await actor.deliver('work', {})
		expect(JSON.parse(result.record).ok).toBe(false)
		expect(actor.failures).toBe(1)
		expect(actor.lastError).toContain('permanent')
	})
})

describe('term unification (0128)', () => {
	test('variables bind, constants must match', async () => {
		const { unify, unifiable } = await import('../src/lib/actors/term')
		expect(unify('intent(M, hoch)', 'intent(X, hoch)')).not.toBeNull()
		expect(unify('intent(M, hoch)', 'intent(X, niedrig)')).toBeNull()
		const bound = unify('intent(M, hoch)', 'intent(X, Class)')
		expect(bound?.Class).toBe('hoch')
		expect(unifiable('interrupted()', 'interrupted()')).toBe(true)
	})

	test('ROUTING uses the same rule: mismatched constants never arrive', async () => {
		const bus = new MessageBus()
		const seen: string[] = []
		bus.register(
			new Actor(
				{
					id: 'done-only',
					...TEST_MANIFEST_IDENTITY,
					name: '',
					description: '',
					tags: [],
					methods: [],
					requires: ['status(erledigt)']
				},
				{
					status: () => {
						seen.push('done-only')
						return { record: '{"ok":true}', wire: 'ok' }
					}
				}
			)
		)
		await bus.emit('status(offen)', {})
		expect(seen).toEqual([])
		await bus.emit('status(erledigt)', {})
		expect(seen).toEqual(['done-only'])
	})
})

describe('registry actor (0128)', () => {
	test('registry_list names every registered actor', async () => {
		const bus = new MessageBus()
		bus.register(
			new Actor({
				id: 'a',
				...TEST_MANIFEST_IDENTITY,
				name: 'A',
				description: '',
				tags: [],
				methods: []
			})
		)
		const { RegistryActor } = await import('../src/lib/actors/registry.actor')
		const registry = new RegistryActor(bus)
		expect(registry.manifest.authority).toBe('os.aven')
		bus.register(registry)
		const result = await bus.dispatch('test', 'registry_list', {})
		expect(result.wire).toContain('a')
		expect(result.wire).toContain('registry')
	})

	test('the registry cannot create, change or delete actors', async () => {
		const { RegistryActor } = await import('../src/lib/actors/registry.actor')
		const bus = new MessageBus()
		bus.register(new RegistryActor(bus))
		const tools = bus.toolSpecs().map((t) => t.name)
		expect(tools).toContain('registry_list')
		// the engine has no manual gateway: goals run through real tools/voice
		expect(tools).not.toContain('goal_run')
		expect(tools).not.toContain('actor_create')
		expect(tools).not.toContain('actor_update')
		expect(tools).not.toContain('actor_delete')
	})
})

describe('catalog (code is the source of truth, reduced — 0130)', () => {
	test('no declared catalog remains: the demo pair and its bridge are gone', async () => {
		// The metric/imperial pair existed ONLY to give the Negotiator
		// something incompatible to bridge; with the negotiator retired the
		// pair had no reason to exist either. What ships is the real mesh —
		// the work items actor and the voice/chat lane, wired in code.
		const catalog = await import('../src/lib/actors/catalog').catch(() => null)
		expect(catalog).toBeNull()
	})
})

describe('the UI event door reduces through the sandbox', () => {
	test('a UI event reduces through the actor sandbox', async () => {
		const bus = new MessageBus()
		const actor = new Actor({
			id: 'todo',
			...TEST_MANIFEST_IDENTITY,
			name: 'Todo',
			description: 'Keeps todos.',
			tags: [],
			methods: [],
			logic: `
				function initState() { return { n: 0 } }
				function reduce(state, ev) { return { n: state.n + 1 } }
				function shape() { return null }
			`
		})
		bus.register(actor)
		await bus.uiEvent('ui', actor.uuid, { send: 'BUMP' })
		expect(actor.state.n).toBe(1)
	})
})

describe('one primitive (0130): declared events serve tools, UI and the proof engine', () => {
	const TODO_LOGIC = `
		function initState(source) { return { items: [], n: 0 } }
		function reduce(state, ev) {
			if (ev.send === 'CREATE') {
				var items = state.items.concat([{ id: 'x' + (state.n + 1), title: ev.payload.title }])
				return {
					state: { items: items, n: state.n + 1 },
					said: 'created ' + ev.payload.title,
					record: { ok: true, created: items[items.length - 1] }
				}
			}
			return state
		}
		function shape(state, raw) { return null }
	`

	function todoActor() {
		// No subclass, no special class: ONE Actor — logic in the manifest is
		// all it takes.
		return new Actor({
			id: 'todo',
			...TEST_MANIFEST_IDENTITY,
			name: 'Todo',
			description: 'Keeps todos.',
			tags: [],
			methods: [
				{
					name: 'todo_create',
					description: 'Creates one todo.',
					parameters: { type: 'object', properties: { title: { type: 'string' } } },
					produces: ['todo(T)'],
					event: { send: 'CREATE' }
				}
			],
			logic: TODO_LOGIC
		})
	}

	test('the generic adapter speaks what the sandbox said', async () => {
		const bus = new MessageBus()
		bus.register(todoActor())
		const result = await bus.dispatch('test', 'todo_create', { title: 'Milk' })
		expect(result.wire).toBe('created Milk')
		expect(JSON.parse(result.record)).toEqual({ ok: true, created: { id: 'x1', title: 'Milk' } })
	})
})

describe('json extraction from model text', () => {
	test('survives the observed failure shapes', async () => {
		const { extractJsonObject } = await import('../src/lib/chat/redpill')
		// clean object
		expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
		// prose apology spliced between a broken and a good object (seen live)
		const spliced =
			'{"id":"habit-stre ak-hub"} I apologize—let me provide the correct manifest cleanly: ' +
			'{"id":"habit-hub","name":"Habit Hub","description":"Keeps one record per habit."}'
		expect((extractJsonObject(spliced) as { id: string }).id).toBe('habit-hub')
		// markdown fences + trailing chatter
		expect(extractJsonObject('```json\n{"ping":"pong"}\n```\nHope this helps!')).toEqual({
			ping: 'pong'
		})
		// trailing comma healed
		expect(extractJsonObject('{"a":[1,2,],}')).toEqual({ a: [1, 2] })
		// nothing parseable
		expect(extractJsonObject('no json here')).toBeNull()
	})
})
