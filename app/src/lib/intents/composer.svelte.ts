import { chatActor } from '$lib/actors/chat.actor.svelte'
import { singleton } from '$lib/actors/singleton'
import { speakerActor } from '$lib/actors/speaker.actor.svelte'

/**
 * The one composer — the field at the foot of the intent's stream where you
 * write, and where what you say appears as it is heard. Its draft lives here
 * rather than in a component so the page (keystrokes anywhere, the live
 * transcript) and the column that renders the field share one state.
 */
class Composer {
	draft = $state('')
	/** Bumped to ask the field to take focus; the field watches it. */
	focusTick = $state(0)
	/**
	 * The field is up. It shows only while you are writing or words are
	 * arriving: raised by a keystroke or a tap, lowered when it is left empty
	 * or the draft is sent. A non-empty draft keeps it up regardless.
	 */
	active = $state(false)

	get composing(): boolean {
		return this.active || this.draft !== ''
	}

	/** Put the field away — unless there is still something in it. */
	dismiss(): void {
		if (this.draft.trim() === '') {
			this.draft = ''
			this.active = false
		}
	}

	/** Bring the field up, optionally seeded with the keystroke that asked. */
	focus(seed = ''): void {
		if (seed) this.draft += seed
		this.active = true
		this.focusTick++
	}

	/** Send the draft into the current intent's session. */
	send(): void {
		const text = this.draft.trim()
		if (text === '') return
		// The send is the user gesture the audio device needs; without it the
		// first reply would synthesize into a suspended context and never be heard.
		speakerActor.core.resumeAudio()
		this.draft = ''
		this.active = false
		void chatActor.core.send(text)
	}
}

export const composer = singleton('aven.composer', () => new Composer())
