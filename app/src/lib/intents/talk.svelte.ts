import { singleton } from '$lib/actors/singleton'

/**
 * The shell's one surface switch: the left rail drives it — intents (the
 * default), the skills platform, or the artifacts shelf.
 *
 * `talk` used to live here too, a boolean for "the chat is showing" that had
 * quietly become a scoping rule for HITL gates as well. Both jobs moved to
 * `$lib/query` (0159), where the answer surface owns its own state and its
 * intent context IS the scope.
 */
class ShellState {
	tab = $state<'intents' | 'skills' | 'artifacts'>('intents')
	/**
	 * Mobile only: whether an intent has been OPENED. Below `lg` the intents
	 * workspace is list-first — the rail and the intent stream fill the
	 * screen, the center surface appears once an intent is tapped, and Back
	 * returns to the list. Desktop (≥ lg, 1024px — tablets collapse too) ignores the flag: all three columns show.
	 */
	detail = $state(false)
	/** Mobile only: the right column (skills + artifacts) drawer, toggled
	 * from the dock's bottom-right button. */
	rightOpen = $state(false)
}

export const shell = singleton('aven.shell', () => new ShellState())
