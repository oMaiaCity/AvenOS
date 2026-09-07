<script lang="ts">
import { Background, type Edge, type Node, SvelteFlow } from '@xyflow/svelte'
import '@xyflow/svelte/dist/style.css'
import type { Machine } from '../actors/machine'
import FitView from './FitView.svelte'
import { layoutMachine } from './machine-layout'
import StateNode from './StateNode.svelte'

/**
 * A node's state machine, as the automaton diagram — the inspector's
 * statechart lens: states are nodes, transitions the labeled arrows, fed
 * a live `Machine` parsed from the node's `.pl`.
 */
const { machine }: { machine: Machine } = $props()
const laid = $derived(layoutMachine(machine))
const nodeTypes = { state: StateNode }

let w = $state(0)
let h = $state(0)

let nodes = $state.raw<Node[]>([])
let edges = $state.raw<Edge[]>([])
$effect.pre(() => {
	nodes = laid.nodes.map((n) => ({
		id: n.id,
		type: 'state',
		position: n.position,
		data: { label: n.label, kind: n.kind, initial: n.initial, terminal: n.terminal }
	}))
	edges = laid.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		label: e.label,
		type: 'bezier',
		style: 'stroke: rgba(47,93,80,0.5); stroke-width: 1.5;',
		labelStyle: 'font-size: 10px; fill: rgba(30,41,59,0.7);',
		labelBgStyle: 'fill: var(--color-linen);',
		labelBgPadding: [4, 2] as [number, number],
		labelBgBorderRadius: 4
	}))
})
</script>

<div
	bind:clientWidth={w}
	bind:clientHeight={h}
	class="h-56 w-full overflow-hidden rounded-xl border border-border bg-surface-sunken/25"
>
	{#key machine}
		<SvelteFlow
			{nodes}
			{edges}
			{nodeTypes}
			fitView
			minZoom={0.15}
			proOptions={{ hideAttribution: true }}
		>
			<Background bgColor="transparent" patternColor="rgba(30,41,59,0.08)" />
			<FitView {w} {h} />
		</SvelteFlow>
	{/key}
</div>
