import { Speaker } from '$lib/tts/speaker.svelte'
import { Actor } from './actor'
import { singleton } from './singleton'
import speakerMachineSource from './speaker-machine.pl?raw'

/**
 * The voice as an actor. The proven TTS internals (gapless clock, sentence
 * feeding, watchdog) stay in Speaker; this wrapper gives them a manifest,
 * contracts, and a mailbox. Everything it consumes arrives as emitted
 * predicates — the same delta the chat bubble renders is the delta the
 * mouth hears.
 */
export class SpeakerActor extends Actor {
	readonly core = new Speaker()

	constructor() {
		super({
			id: 'speaker',
			authority: 'os.aven',
			namespace: 'voice',
			version: '1',
			name: 'Speaker',
			description:
				'The voice: speaks replies sentence by sentence while they are still being ' +
				'written. On-device Supertonic TTS; goes silent instantly on interruption.',
			tags: ['voice'],
			methods: [],
			// Flow AND contracts from the one `.pl` — requires(delta(D)) etc.
			machine: speakerMachineSource
		})
		this.bind({
			delta: (p) => {
				this.core.feed(String(p.text ?? ''))
				return { record: '{"ok":true}', wire: 'ok' }
			},
			reply: () => {
				this.core.flush()
				return { record: '{"ok":true}', wire: 'ok' }
			},
			discard: () => {
				this.core.silence()
				return { record: '{"ok":true}', wire: 'ok' }
			},
			interrupted: () => {
				this.core.silence()
				return { record: '{"ok":true}', wire: 'ok' }
			},
			// The user speaking is the gesture that may wake the output device.
			utterance: () => {
				this.core.resumeAudio()
				return { record: '{"ok":true}', wire: 'ok' }
			}
		})
	}

	override instanceState(): Record<string, unknown> {
		return {
			status: this.core.status,
			speaking: this.core.speaking ? 'yes' : 'no',
			output: this.core.output
		}
	}
}

import { bus as _bus } from './bus'

export const speakerActor = singleton('aven.speaker', () => new SpeakerActor())
_bus.register(speakerActor)
