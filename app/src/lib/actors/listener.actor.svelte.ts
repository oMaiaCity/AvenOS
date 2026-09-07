import { Listener } from '$lib/asr/listener.svelte'
import { anonymousSpeaker } from '$lib/chat/anonymous-speaker'
import { Actor } from './actor'
import { bus } from './bus'
import listenerMachineSource from './listener-machine.pl?raw'
import { singleton } from './singleton'

/**
 * The ears as an actor. VAD + recognition stay in Listener; the wrapper
 * declares what they mean to the mesh: finished utterances and barge-ins are
 * emitted predicates, delivered to whoever requires them — today the chat
 * and the speaker, tomorrow whoever else registers.
 */
export class ListenerActor extends Actor {
	readonly core = new Listener({
		// Candidate UI is immediate; interruption fires only after lexical ASR
		// evidence has been confirmed safe by the native echo state.
		onSpeechStart: () => {
			void bus.emit('interrupted()', {}, 'listener')
		},
		onUtterance: (text, attribution, sessionId) => {
			void bus.emit(
				'utterance(T)',
				{ text, anonymousSpeaker: anonymousSpeaker(sessionId, attribution) },
				'listener'
			)
		}
	})

	constructor() {
		super({
			id: 'listener',
			authority: 'os.aven',
			namespace: 'voice',
			version: '1',
			name: 'Listener',
			description:
				'The ears: Silero VAD and Nemotron recognition on-device. Finished utterances ' +
				'are emitted as utterance(T), talking over the assistant as interrupted().',
			tags: ['voice'],
			methods: [],
			// Flow AND contracts from the one `.pl` — produces(utterance(T)) etc.
			machine: listenerMachineSource
		})
	}

	override dispose(): void {
		this.core.dispose()
		super.dispose()
	}

	override instanceState(): Record<string, unknown> {
		return {
			status: this.core.status,
			hearing: this.core.speech ? 'yes' : 'no',
			'sample rate': this.core.rate || '—'
		}
	}
}

import { bus as _bus } from './bus'

export const listenerActor = singleton('aven.listener', () => new ListenerActor())
_bus.register(listenerActor)
