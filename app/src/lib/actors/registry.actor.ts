import { Actor, type Manifest } from './actor'
import type { MessageBus } from './bus'

/**
 * The registry as an actor — no caste, no special path (0130): its
 * behaviour (list, describe) is sandboxed logic in its own manifest; the
 * host appears only as granted capabilities, fail-closed:
 *
 * - `actors`   → a snapshot of the mesh (rows, no references)
 * - `manifest` → one actor's manifest by id, or null
 *
 * It does not CREATE actors. The set of actors is declared in code — the
 * codebase is the source of truth, not a browser store.
 */

const REGISTRY_LOGIC = `
function initState(source) {
	return { queries: 0 }
}

function prose(m) {
	var parts = 'I am ' + m.name + ' (' + m.id + '). ' + m.description
	var methods = m.methods || []
	if (methods.length > 0) {
		var names = []
		for (var i = 0; i < methods.length; i++) names.push(methods[i].name + ' — ' + methods[i].description)
		parts += ' Methods: ' + names.join(' · ')
	}
	return parts
}

function reduce(state, ev) {
	var next = { queries: state.queries + 1 }

	if (ev.send === 'LIST') {
		var rows = cap('actors')
		var ids = []
		for (var i = 0; i < rows.length; i++) ids.push(rows[i].id)
		return {
			state: next,
			said: 'Registered (' + rows.length + '): ' + ids.join(', '),
			record: { ok: true, actors: rows }
		}
	}

	if (ev.send === 'DESCRIBE') {
		var m = cap('manifest', { actor: ev.payload.actor })
		if (!m) {
			return {
				state: next,
				said: 'There is no actor ' + ev.payload.actor + '.',
				record: { ok: false, error: 'no actor ' + ev.payload.actor }
			}
		}
		return { state: next, said: prose(m), record: { ok: true, manifest: m } }
	}

	return state
}

function shape(state, rawText) {
	return null
}
`

const REGISTRY_MANIFEST: Manifest = {
	id: 'registry',
	authority: 'os.aven',
	namespace: 'actors.system',
	version: '1',
	name: 'Registry',
	description:
		'The directory itself, as an actor: knows every actor in the mesh and describes ' +
		'them from their manifests.',
	tags: ['system'],
	capabilities: ['actors', 'manifest'],
	logic: REGISTRY_LOGIC,
	methods: [
		{
			name: 'registry_list',
			description: 'Lists every registered actor with id, name, tags and method count.',
			parameters: { type: 'object', properties: {} },
			event: { send: 'LIST' }
		},
		{
			name: 'registry_describe',
			description: 'Describes one actor completely from its manifest.',
			parameters: {
				type: 'object',
				properties: { actor: { type: 'string', description: 'The actor id.' } },
				required: ['actor']
			},
			event: { send: 'DESCRIBE' }
		}
	]
}

export class RegistryActor extends Actor {
	constructor(bus: MessageBus) {
		super(
			REGISTRY_MANIFEST,
			{},
			{
				actors: () =>
					bus.actors().map((a) => ({
						uuid: a.uuid,
						id: a.manifest.id,
						name: a.instanceName,
						tags: a.manifest.tags,
						methods: a.manifest.methods.length,
						live: a.instanceState() !== null
					})),
				manifest: (p) => bus.get(String(p.actor ?? ''))?.manifest ?? null
			}
		)
	}

	override instanceState(): Record<string, unknown> {
		return { queries: Number(this.state?.queries ?? 0) }
	}
}
