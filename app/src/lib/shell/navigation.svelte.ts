import { goto } from '$app/navigation'
import { page } from '$app/state'
import { shell } from '$lib/intents/talk.svelte'

/**
 * THE LEFT RAIL'S ONE SOURCE OF TRUTH.
 *
 * The rail opens four surfaces, but they were never stored the same way:
 * `settings` is a ROUTE while intents/skills/artifacts are a store flag. Two
 * axes that can disagree, reconciled ad-hoc inside four separate `onclick`
 * handlers that each did it slightly differently — one navigated and forgot
 * the flag, one set the flag and forgot to navigate, and every one of them
 * fired `goto()` without awaiting it while reading `page.url` in the same
 * breath. Click quickly and the branch you got was decided by whether the
 * pending navigation had landed yet: the flag would change without the route
 * following, and the rail would sit on settings showing the wrong thing.
 *
 * There is one axis here now. `surface` is DERIVED — never assigned — so the
 * route and the flag cannot drift apart, and `openSurface()` is the only
 * writer. It always does BOTH halves, in a fixed order, for every target.
 */
export type Surface = 'intents' | 'skills' | 'artifacts' | 'settings'

/** Settings is the one surface with a URL; everything else lives on the workspace. */
const WORKSPACE_PATH = '/dashboard'
const SETTINGS_PATH = '/dashboard/settings'

/**
 * Which surface is showing, read from the two places that between them decide
 * it. The route wins when it says settings, because a URL survives a reload
 * and the flag does not.
 */
export function currentSurface(): Surface {
	return page.url.pathname.startsWith(SETTINGS_PATH) ? 'settings' : shell.tab
}

/**
 * Open a surface. The ONLY thing that writes the rail's state.
 *
 * Both halves run for every target, unconditionally: the flag is set first
 * (synchronously, so the next render already agrees), then the route is
 * brought in line. Nothing branches on where we happen to be, which is what
 * made the old handlers order-dependent.
 *
 * `settings` deliberately leaves `shell.tab` alone: it is the surface you
 * come BACK from, and remembering what was underneath is the point.
 */
export function openSurface(surface: Surface): void {
	if (surface !== 'settings') {
		shell.tab = surface
		// A surface change starts at its own top, not inside the previous
		// surface's detail pane.
		shell.detail = false
	}
	const target = surface === 'settings' ? SETTINGS_PATH : WORKSPACE_PATH
	if (page.url.pathname !== target) void goto(target)
}

/**
 * The rail's gear and its two surface buttons toggle: pressing the one you are
 * already on returns you to the workspace default.
 */
export function toggleSurface(surface: Surface): void {
	openSurface(currentSurface() === surface ? 'intents' : surface)
}
