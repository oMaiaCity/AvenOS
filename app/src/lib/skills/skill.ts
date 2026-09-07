import { compositeInterface } from '../actors/actor'
import { unifiable } from '../actors/term'

/**
 * The skills platform ontology (0152), three tiers, all data:
 *
 *   SKILL     — a collection of composable workflows + its end-user views
 *   WORKFLOW  — one n8n flow: trigger(s) → nodes → outputs
 *   NODE      — the leaf ACTOR doing one step; triggers are actors too
 *
 * Wiring is NEVER stored: an edge exists inside a workflow wherever one
 * node provides what another requires (unification), and skills compose
 * at their boundaries the same way — the recipe interfaces are the same
 * contract predicates the `.pl` files declare. One law, every level.
 */

export interface FlowNodeDef {
	id: string
	kind: 'trigger' | 'op' | 'output'
	name: string
	about: string
	/** Verb namespace: 'trigger:mail', 'llm:classify', 'route:intent', 'view:list'… */
	type: string
	requires?: string[]
	provides?: string[]
	/** The node's own statechart, when it has one — same `.pl` idiom. */
	machine?: string
	/** Backed by a running actor today (vs declared/mocked). */
	live?: boolean
	config?: Record<string, unknown>
}

export interface WorkflowDef {
	id: string
	name: string
	about: string
	nodes: FlowNodeDef[]
}

export interface SkillDef {
	id: string
	name: string
	about: string
	tags?: string[]
	workflows: WorkflowDef[]
	/** The end-user windows this skill ships (keys into the window registry). */
	views?: { key: string; name: string }[]
}

export interface FlowEdge {
	from: string
	to: string
	predicate: string
}

/** Runtime state painted over a workflow template or processing DAG. */
export type FlowInstanceState =
	| 'done'
	| 'running'
	| 'waiting'
	| 'retrying'
	| 'error'
	| 'review'
	| 'skipped'

/** Edges within one workflow — provides ∩ requires, derived at read time. */
export function workflowEdges(w: WorkflowDef): FlowEdge[] {
	const out: FlowEdge[] = []
	for (const a of w.nodes) {
		for (const b of w.nodes) {
			if (a === b) continue
			for (const need of b.requires ?? []) {
				if ((a.provides ?? []).some((p) => unifiable(p, need))) {
					out.push({ from: a.id, to: b.id, predicate: need })
				}
			}
		}
	}
	return out
}

/** A workflow's boundary — the merge law over its nodes (derive, never store). */
export function workflowInterface(w: WorkflowDef): { requires: string[]; produces: string[] } {
	return compositeInterface(
		w.nodes.map((n) => ({ requires: n.requires ?? [], produces: n.provides ?? [] }))
	)
}

/** A skill's boundary — the merge law over all its workflows' nodes. */
export function skillInterface(s: SkillDef): { requires: string[]; produces: string[] } {
	return compositeInterface(
		s.workflows.flatMap((w) =>
			w.nodes.map((n) => ({ requires: n.requires ?? [], produces: n.provides ?? [] }))
		)
	)
}

/**
 * Cross-skill recipe edges: skill A feeds skill B wherever A's boundary
 * provides what any of B's nodes requires — the doors on the canvas. Node
 * level on the receiving side, deliberately: an input port may have many
 * suppliers (the voice trigger AND the inbox both feed todo creation), and
 * an internally-satisfied need still accepts an outside wire.
 */
export function crossSkillEdges(skills: SkillDef[]): FlowEdge[] {
	const out: FlowEdge[] = []
	for (const a of skills) {
		const provides = skillInterface(a).produces
		for (const b of skills) {
			if (a === b) continue
			const needs = [
				...new Set(b.workflows.flatMap((w) => w.nodes.flatMap((n) => n.requires ?? [])))
			]
			for (const need of needs) {
				if (provides.some((p) => unifiable(p, need))) {
					out.push({ from: a.id, to: b.id, predicate: need })
				}
			}
		}
	}
	return out
}
