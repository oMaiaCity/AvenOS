<script lang="ts">
import { type StyleDef, type UiEvent, VibeEngine, type ViewDef } from '@myavenceo/aven-vibes'
import { onDestroy } from 'svelte'
import type { Actor } from './actor'
import { bus } from './bus'
import type { ActorEvent } from './sandbox'

/**
 * THE view renderer (0130): one component that mounts any actor's view —
 * validated view/style JSON through the aven-ui engine into a shadow root.
 *
 * State never originates here. The actor owns its state (the sandbox
 * reduces it); this component renders that state and forwards every UI
 * event back to `applyEvent`, the same door the voice tools use. Two
 * windows over one actor (list + board) are just two AvenVibeEngines with
 * different view defs over the SAME state.
 */

/** A named view window passes its own defs; defaults are the manifest's. */
const {
	actor,
	view: viewOverride,
	style: styleOverride
}: { actor: Actor; view?: ViewDef; style?: StyleDef } = $props()

const viewDef = $derived(viewOverride ?? actor.manifest.view)
const styleDef = $derived(styleOverride ?? actor.manifest.style ?? {})

let engine: VibeEngine | null = null
let mounted = $state(false)
let renderError = $state<string | null>(null)

function attachHost(element: HTMLElement) {
	void mount(element)
	return () => {
		void engine?.unmount()
		engine = null
		mounted = false
	}
}

async function mount(element: HTMLElement): Promise<void> {
	// A view renders whether the behaviour is sandboxed (logic) or host code
	// (the chat) — the engine only needs the view def and the actor's state.
	if (!viewDef) return
	renderError = null
	try {
		engine = new VibeEngine({
			container: element,
			onEvent: (event: UiEvent) => {
				// Through the bus, never behind its back — the click becomes a
				// message and shows up in the trace like every other sender.
				bus.uiEvent('ui', actor.uuid, event as ActorEvent).catch((err) => {
					renderError = err instanceof Error ? err.message : String(err)
				})
			}
		})
		await engine.mount({ view: viewDef, style: styleDef, state: actor.state ?? {} })
		mounted = true
	} catch (err) {
		renderError = err instanceof Error ? err.message : String(err)
	}
}

// The actor's state is the single source; every reduction re-renders.
$effect(() => {
	const state = actor.state
	if (engine && mounted && state) void engine.replaceState(state)
})

onDestroy(() => {
	void engine?.unmount()
	engine = null
})
</script>

{#if renderError}
	<p class="shrink-0 px-1 text-sm text-error-ink" role="alert">{renderError}</p>
{/if}
{#if viewDef}
	<div {@attach attachHost} class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"></div>
{:else}
	<p class="text-muted-foreground px-1 text-sm">{actor.manifest.name} has no view to render.</p>
{/if}
