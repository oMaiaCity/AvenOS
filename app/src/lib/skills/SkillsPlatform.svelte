<script lang="ts">
import { Background, type Edge, type Node, SvelteFlow } from '@xyflow/svelte'
import '@xyflow/svelte/dist/style.css'
import { loadMachine } from '../actors/machine'
import FitView from '../mesh/FitView.svelte'
import StateMachineView from '../mesh/StateMachineView.svelte'
import FlowNode from './FlowNode.svelte'
import { layoutWorkflow, NODE_W, workflowDoors } from './flow-layout'
import { skills } from './registry'
import { type FlowNodeDef, skillInterface } from './skill'

/**
 * The skills platform: skills on the left (a skill is a COLLECTION of
 * composable workflows), the selected workflow as an n8n canvas in the
 * middle — triggers → nodes → outputs, every wire derived from
 * provides ∩ requires — and the node inspector on the right: manifest,
 * statechart (its own `.pl`), raw JSON. Doors past the last column are
 * other skills fed by this workflow: the cross-skill recipe edges.
 */

let skillId = $state(skills[0].id)
let workflowId = $state(skills[0].workflows[0].id)
let selectedId = $state<string | null>(null)
let canvasW = $state(0)
let canvasH = $state(0)

const skill = $derived(skills.find((s) => s.id === skillId) ?? skills[0])
const workflow = $derived(skill.workflows.find((w) => w.id === workflowId) ?? skill.workflows[0])
const laid = $derived(layoutWorkflow(workflow))
const doors = $derived(
	workflowDoors(
		workflow,
		skills.filter((s) => s.id !== skill.id)
	)
)
const boundary = $derived(skillInterface(skill))

const selected = $derived<FlowNodeDef | null>(
	workflow.nodes.find((n) => n.id === selectedId) ?? null
)
const selectedMachine = $derived(selected?.machine ? loadMachine(selected.machine) : null)

function pickSkill(id: string) {
	skillId = id
	workflowId = (skills.find((s) => s.id === id) ?? skills[0]).workflows[0].id
	selectedId = null
}

let nodes = $state.raw<Node[]>([])
let edges = $state.raw<Edge[]>([])
$effect.pre(() => {
	const doorX = (Math.max(...laid.nodes.map((n) => n.position.x), 0) ?? 0) + NODE_W + 130
	const doorNodes: Node[] = doors.map((d, i) => ({
		id: d.id,
		type: 'flow',
		position: { x: doorX, y: i * 190 },
		data: {
			node: {
				id: d.id,
				kind: 'output',
				name: d.skill.name,
				about: d.skill.about,
				type: 'skill',
				requires: d.predicates
			},
			selected: false,
			door: true
		}
	}))
	nodes = [
		...laid.nodes.map((n) => ({
			id: n.id,
			type: 'flow',
			position: n.position,
			data: { node: n.node, selected: n.id === selectedId }
		})),
		...doorNodes
	]
	const doorEdges: Edge[] = doors.flatMap((d) =>
		workflow.nodes
			.filter((n) =>
				(n.provides ?? []).some((p) =>
					d.predicates.some((q) => q.split('(')[0] === p.split('(')[0])
				)
			)
			.map((n) => ({
				id: `${n.id}->${d.id}`,
				source: n.id,
				target: d.id,
				label: d.predicates[0],
				type: 'smoothstep',
				style: 'stroke: rgba(47,93,80,0.4); stroke-dasharray: 6 4;',
				labelStyle: 'font-size: 10px; fill: rgba(30,41,59,0.6);',
				labelBgStyle: 'fill: var(--color-linen);',
				labelBgPadding: [4, 2] as [number, number],
				labelBgBorderRadius: 4
			}))
	)
	edges = [
		...laid.edges.map((e, i) => ({
			id: `${e.from}-${e.predicate}-${e.to}-${i}`,
			source: e.from,
			target: e.to,
			label: e.predicate,
			type: 'smoothstep',
			style: 'stroke: rgba(47,93,80,0.5); stroke-width: 1.5;',
			labelStyle: 'font-size: 10px; fill: rgba(30,41,59,0.7);',
			labelBgStyle: 'fill: var(--color-linen);',
			labelBgPadding: [4, 2] as [number, number],
			labelBgBorderRadius: 4
		})),
		...doorEdges
	]
})

const nodeTypes = { flow: FlowNode }
</script>

<div class="flex min-h-0 flex-1 gap-2">
	<!-- The catalog: a skill is a collection of composable workflows. -->
	<nav
		class="flex w-56 shrink-0 flex-col overflow-y-auto rounded-2xl border border-border bg-surface-card/25"
	>
		<h3
			class="border-border border-b px-4 pt-3 pb-2 font-semibold text-foreground/50 text-xs uppercase tracking-wide"
		>
			Skills
		</h3>
		{#each skills as s (s.id)}
			<button
				type="button"
				onclick={() => pickSkill(s.id)}
				class="border-border/25 border-b px-4 py-2.5 text-left transition-colors {skillId === s.id
					? 'bg-surface-sunken'
					: 'hover:bg-surface-card'}"
			>
				<div class="flex items-baseline gap-2">
					<span class="font-semibold text-sm">{s.name}</span>
					<span class="text text--mono-meta">
						{s.workflows.length}
						{s.workflows.length === 1 ? 'workflow' : 'workflows'}
					</span>
				</div>
				<p class="pt-0.5 text-foreground/50 text-xs leading-snug">{s.about}</p>
			</button>
		{/each}
		<p class="px-4 py-3 text-[length:var(--fs-micro)] text-foreground/35 leading-relaxed">
			A skill is a collection of composable workflows; a workflow is triggers → nodes → outputs; a
			node is an actor. Every wire is derived from provides ∩ requires — nothing stores a graph.
		</p>
	</nav>

	<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
		<!-- The skill's workflows, and its derived boundary. -->
		<div class="flex items-center justify-between px-1">
			<div class="flex gap-0.5 rounded-full border border-border p-0.5 text-xs">
				{#each skill.workflows as w (w.id)}
					<button
						type="button"
						onclick={() => {
							workflowId = w.id
							selectedId = null
						}}
						class="rounded-full px-3 py-0.5 transition-colors {workflowId === w.id
							? 'bg-primary text-primary-foreground'
							: 'opacity-60 hover:opacity-100'}"
					>
						{w.name}
					</button>
				{/each}
			</div>
			<span class="truncate text text--mono-meta">
				{boundary.requires.join(' · ')}
				→ {boundary.produces.slice(0, 4).join(' · ')}
			</span>
		</div>
		<div
			bind:clientWidth={canvasW}
			bind:clientHeight={canvasH}
			class="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface-sunken/25"
		>
			{#key skillId + workflowId}
				<SvelteFlow
					{nodes}
					{edges}
					{nodeTypes}
					fitView
					minZoom={0.15}
					proOptions={{ hideAttribution: true }}
					onnodeclick={({ node }) => {
						if (node.id.startsWith('door:')) {
							pickSkill(node.id.slice('door:'.length))
							return
						}
						selectedId = selectedId === node.id ? null : node.id
					}}
					onpaneclick={() => {
						selectedId = null
					}}
				>
					<Background bgColor="transparent" patternColor="rgba(30,41,59,0.08)" />
					<FitView w={canvasW} h={canvasH} />
				</SvelteFlow>
			{/key}
		</div>
	</div>

	<!-- The node inspector: the folded-in explorer — manifest, statechart, JSON. -->
	<aside
		class="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-surface-card p-4"
	>
		{#if selected}
			<div>
				<div class="flex items-baseline gap-2">
					<span class="font-semibold text-sm">{selected.name}</span>
					<span class="text text--mono-meta">{selected.id}</span>
					<span
						class="ml-auto rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[length:var(--fs-micro)]"
					>
						{selected.type}
					</span>
				</div>
				<p class="pt-1 text-foreground/65 text-xs leading-relaxed">{selected.about}</p>
			</div>
			<div class="flex flex-wrap gap-1">
				{#each selected.requires ?? [] as r (r)}
					<span
						class="rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[length:var(--fs-micro)]"
						>→ {r}</span
					>
				{/each}
				{#each selected.provides ?? [] as p (p)}
					<span
						class="rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[length:var(--fs-micro)]"
					>
						{p}
						→
					</span>
				{/each}
			</div>
			{#if selectedMachine}
				<div>
					<h4 class="pb-1 font-semibold text-xs">States</h4>
					<StateMachineView machine={selectedMachine} />
				</div>
			{/if}
			{#if selected.config}
				<div>
					<h4 class="pb-1 font-semibold text-xs">Config</h4>
					<pre
						class="overflow-x-auto rounded-xl bg-surface-sunken p-3 font-mono text-[length:var(--fs-micro)] leading-relaxed"
					>{JSON.stringify(
							selected.config,
							null,
							2
						)}</pre>
				</div>
			{/if}
			<div>
				<h4 class="pb-1 font-semibold text-xs">JSON</h4>
				<pre
					class="overflow-x-auto rounded-xl bg-surface-sunken p-3 font-mono text-[length:var(--fs-micro)] leading-relaxed"
				>{JSON.stringify(
						{ ...selected, machine: selected.machine ? '…(.pl)' : undefined },
						null,
						2
					)}</pre>
			</div>
		{:else}
			<p class="pt-6 text-center text-foreground/35 text-sm">
				Click a node — its manifest, statechart and JSON render here.
			</p>
			<div>
				<h4 class="pb-1 font-semibold text-xs">Skill boundary (derived)</h4>
				<div class="flex flex-wrap gap-1">
					{#each boundary.requires as r (r)}
						<span
							class="rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[length:var(--fs-micro)]"
						>
							→ {r}
						</span>
					{/each}
					{#each boundary.produces as p (p)}
						<span
							class="rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[length:var(--fs-micro)]"
						>
							{p}
							→
						</span>
					{/each}
				</div>
			</div>
		{/if}
	</aside>
</div>
