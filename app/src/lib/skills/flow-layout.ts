import type { WorkflowDef } from './skill'
import { type FlowEdge, type FlowNodeDef, type SkillDef, workflowEdges } from './skill'

/**
 * Lay one workflow out n8n-style: columns from graph depth (longest path
 * from an unfed node), triggers naturally in the first column, rows stacked
 * and centred. Wiring is derived on the spot — the canvas draws an
 * inference, never a stored graph.
 */

export const NODE_W = 240
const COL_GAP = 100
const ROW_GAP = 48
const HEAD_H = 84
const PORT_H = 24

export function nodeHeight(n: FlowNodeDef): number {
	return HEAD_H + Math.max(n.requires?.length ?? 0, n.provides?.length ?? 0, 1) * PORT_H
}

export interface LaidFlowNode {
	id: string
	position: { x: number; y: number }
	node: FlowNodeDef
}

export interface FlowLayout {
	nodes: LaidFlowNode[]
	edges: FlowEdge[]
}

export function layoutWorkflow(w: WorkflowDef): FlowLayout {
	return layoutFlow(w.nodes, workflowEdges(w))
}

/** Lay out a runtime DAG whose edges are already authoritative. */
export function layoutFlow(nodesToLayout: FlowNodeDef[], wires: FlowEdge[]): FlowLayout {
	// Longest path from any unfed node — the column a node belongs in.
	const preds = new Map<string, string[]>()
	for (const e of wires) preds.set(e.to, [...(preds.get(e.to) ?? []), e.from])
	const depth = new Map<string, number>()
	const walking = new Set<string>()
	const visit = (id: string): number => {
		const known = depth.get(id)
		if (known !== undefined) return known
		if (walking.has(id)) return 0
		walking.add(id)
		let d = 0
		for (const p of preds.get(id) ?? []) d = Math.max(d, visit(p) + 1)
		walking.delete(id)
		depth.set(id, d)
		return d
	}
	for (const n of nodesToLayout) visit(n.id)

	const columns: FlowNodeDef[][] = []
	for (const n of nodesToLayout) {
		const c = depth.get(n.id) ?? 0
		if (!columns[c]) columns[c] = []
		columns[c].push(n)
	}
	const colHeight = columns.map(
		(col) => col.reduce((h, n) => h + nodeHeight(n), 0) + ROW_GAP * (col.length - 1)
	)
	const tallest = Math.max(...colHeight, 0)

	const nodes: LaidFlowNode[] = []
	columns.forEach((col, c) => {
		const x = c * (NODE_W + COL_GAP)
		let y = (tallest - colHeight[c]) / 2
		for (const n of col) {
			nodes.push({ id: n.id, position: { x, y }, node: n })
			y += nodeHeight(n) + ROW_GAP
		}
	})

	return { nodes, edges: wires }
}

/**
 * The doors out of a workflow: for each OTHER skill, the predicates this
 * workflow provides that the other skill's nodes require — the cross-skill
 * boundary, drawn one column past the members.
 */
export interface Door {
	id: string
	skill: SkillDef
	predicates: string[]
}

export function workflowDoors(w: WorkflowDef, others: SkillDef[]): Door[] {
	const provided = w.nodes.flatMap((n) => n.provides ?? [])
	return others
		.map((s) => {
			const needs = [
				...new Set(s.workflows.flatMap((wf) => wf.nodes.flatMap((n) => n.requires ?? [])))
			]
			const predicates = needs.filter((need) =>
				provided.some((p) => p.split('(')[0] === need.split('(')[0])
			)
			return { id: `door:${s.id}`, skill: s, predicates }
		})
		.filter((d) => d.predicates.length > 0)
}
