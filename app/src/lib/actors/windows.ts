import AvenVibeEngine from './AvenVibeEngine.svelte'
import { Actor } from './actor'
import { bus } from './bus'
import { registryTick } from './reactivity.svelte'
import { singleton } from './singleton'
import { todoActor } from './todo.svelte'
import { isWindow, WindowActor } from './window.actor.svelte'

/**
 * The windows — views as actors, one per subject, colocated here and
 * registered like everyone else. The Views surface derives from the
 * registry; the model can toggle any of these by message.
 *
 * Catalog actors get their windows here too: the declared view goes to the
 * universal renderer, extra named views become their own switchable windows
 * over the SAME actor, and an actor without a view keeps the generic one.
 * All of it follows from code — nothing is created at runtime.
 */
export const listWindow = singleton(
	'aven.window.list',
	() =>
		new WindowActor(todoActor, AvenVibeEngine, {
			key: 'list',
			name: 'Todos',
			// Closed until asked for: a window renders inline in the conversation
			// the moment the model opens it ("zeig mir die Todos").
			open: false
		})
)
export const boardWindow = singleton(
	'aven.window.board',
	() =>
		new WindowActor(todoActor, AvenVibeEngine, {
			key: 'board',
			name: 'Kanban Board',
			props: { view: todoActor.manifest.views?.[0]?.view },
			open: false
		})
)
/**
 * THE STREAM as an actor — the intent's activity log and conversation, the
 * tier behind the first tab. It has no surface of its own to render (the
 * column IS it); it exists so "zeig mir die Aktivität" is a tool call like
 * "zeig mir das Board": showing it hides every view, and the column follows.
 */
class StreamActor extends Actor {
	constructor() {
		super({
			id: 'stream',
			authority: 'ceo.aven',
			namespace: 'ui.activity',
			version: '1',
			name: 'Aktivität',
			description:
				"The activity stream: the intent's log and conversation, the default tier " +
				'of the center column. Shown by message; showing it hides every view.',
			tags: ['window'],
			methods: [
				{
					name: 'stream_show',
					description:
						'Shows the activity stream (log + conversation) on screen and hides ' +
						'every view. Use it whenever the user asks to see the activity, the ' +
						'stream, the log, or to go back from a view.',
					parameters: { type: 'object', properties: {} }
				}
			]
		})
		this.bind({
			stream_show: () => {
				for (const other of bus.actors()) if (isWindow(other)) other.open = false
				return {
					record: JSON.stringify({ ok: true, stream: true }),
					wire: 'The activity stream is now on screen.'
				}
			}
		})
	}
}
export const streamActor = singleton('aven.stream', () => new StreamActor())

// The board and the list are two FACES of the same subject — each its own
// window actor, switched like any other ("show the board"). The combined
// todos-window from before this split may linger on the HMR-surviving
// bus; clear it so it cannot shadow the pair.
bus.unregister('todos-window')
bus.register(listWindow)
bus.register(boardWindow)
bus.register(streamActor)

bus.onChange = () => {
	registryTick.v++
}

export { isWindow }

/** Imported for its side effects by the shell. */
export const windowsBound = true
