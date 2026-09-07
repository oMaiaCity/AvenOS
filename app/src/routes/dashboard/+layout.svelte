<script lang="ts">
import type { Snippet } from 'svelte'
import { SPARKS, todoActor } from '$lib/actors/todo.svelte'
import { shell } from '$lib/intents/talk.svelte'
import {
	currentSurface,
	openSurface,
	type Surface,
	toggleSurface
} from '$lib/shell/navigation.svelte'

/**
 * The dashboard shell: the spark rail on the left, the route's surface on the
 * right. A layout rather than page furniture so the rail — which spark
 * context everything operates in — stays put across the workspace and the
 * settings page alike. Clicking a spark and saying "zeig die Team-Liste"
 * write the same store.
 *
 * Which surface is open is decided in ONE place (`$lib/shell/navigation`), not
 * re-derived per button. The rail is one exclusive group: whatever it opens,
 * it closes the rest, so leaving settings is part of pressing any other
 * button and the gear itself toggles. That makes a Back link redundant.
 */
const { children }: { children: Snippet } = $props()

const surface = $derived(currentSurface())

/**
 * The rail's foot, as data. These three used to be three near-identical blocks
 * of markup, each with its own copy of the active-class expression and its own
 * subtly different click handler — which is how they came to disagree.
 */
type IconShape =
	| { circle: [number, number, number]; d?: undefined }
	| { d: string; circle?: undefined }
type Tool = { id: Exclude<Surface, 'intents'>; label: string; paths: IconShape[] }

const TOOLS: Tool[] = [
	{
		id: 'skills',
		label: 'Skills',
		/* three linked nodes: the flow canvas, in miniature */
		paths: [
			{ circle: [5, 12, 2.5] },
			{ circle: [19, 6, 2.5] },
			{ circle: [19, 18, 2.5] },
			{ d: 'M7.2 10.8 16.8 7.2M7.2 13.2l9.6 3.6' }
		]
	},
	{
		id: 'artifacts',
		label: 'Artefakte',
		/* a document sheet with a folded corner: the artifact, in miniature */
		paths: [
			{ d: 'M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5z' },
			{ d: 'M14 3v4.5h4.5M9 12.5h6M9 16h6' }
		]
	},
	{
		id: 'settings',
		label: 'Einstellungen',
		/* gear */
		paths: [
			{ circle: [12, 12, 3] },
			{
				d: 'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z'
			}
		]
	}
]

/** One shape for every rail button, so they cannot drift apart again. */
const BUTTON_BASE = 'flex size-11 items-center justify-center transition-all'
const BUTTON_ON = 'rounded-2xl bg-primary text-primary-foreground'
const BUTTON_OFF =
	'rounded-full border border-border bg-surface-card opacity-60 hover:rounded-2xl hover:opacity-100'

function buttonClass(active: boolean): string {
	return `${BUTTON_BASE} ${active ? BUTTON_ON : BUTTON_OFF}`
}
</script>

<div class="flex h-dvh">
	<!-- On phones the rail is part of the LIST screen: once an intent is open
	     the detail takes the full width and the rail steps out with the list. -->
	<aside
		class="{surface === 'intents' && shell.detail
			? 'hidden lg:flex'
			: 'flex'} w-16 shrink-0 flex-col items-center gap-3 border-border border-r py-4 pt-[max(1rem,env(safe-area-inset-top))]"
	>
		{#each SPARKS as spark (spark.id)}
			{@const active = todoActor.state.active === spark.id && surface === 'intents'}
			<button
				type="button"
				onclick={() => {
					// One call puts the rail on the intents surface — route and flag
					// together — and the active spark is reducer state like any
					// other, switched through the SHOW event, the same door the
					// voice tool uses.
					openSurface('intents')
					void todoActor.applyEvent({ send: 'SHOW', payload: { spark: spark.id } })
				}}
				title={spark.name}
				aria-label="Spark {spark.name}"
				class="relative text-xs {buttonClass(active)} {active ? '' : 'opacity-70'}"
			>
				{spark.id.slice(0, 2).toUpperCase()}
				{#if active}
					<span class="-left-[13px] absolute h-6 w-1 rounded-full bg-primary"></span>
				{/if}
			</button>
		{/each}

		<!-- The rail's foot: the tool surfaces, below the contexts. The way
		     "back" went with the game — the dashboard is the root now; there is
		     nothing behind it. -->
		{#each TOOLS as tool, i (tool.id)}
			{@const active = surface === tool.id}
			<button
				type="button"
				onclick={() => toggleSurface(tool.id)}
				title={tool.label}
				aria-label={tool.label}
				class="relative {buttonClass(active)} {i === 0 ? 'mt-auto' : ''}"
			>
				<svg
					viewBox="0 0 24 24"
					class="size-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#each tool.paths as shape, j (j)}
						{#if shape.circle}
							<circle cx={shape.circle[0]} cy={shape.circle[1]} r={shape.circle[2]} />
						{:else}
							<path d={shape.d} />
						{/if}
					{/each}
				</svg>
				{#if active}
					<span class="-left-[13px] absolute h-6 w-1 rounded-full bg-primary"></span>
				{/if}
			</button>
		{/each}
	</aside>

	{@render children()}
</div>
