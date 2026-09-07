import { type LaidFlowNode, layoutFlow } from '$lib/skills/flow-layout'
import type { FlowEdge, FlowInstanceState, FlowNodeDef } from '$lib/skills/skill'
import { type ArtifactProcessingStage, artifactProcessingStageLabel } from './processing'

export interface ProcessingFlowNode extends LaidFlowNode {
	instance: FlowInstanceState
	outputCount: number
}

export interface ProcessingFlowGraph {
	nodes: ProcessingFlowNode[]
	edges: FlowEdge[]
}

export function processingStageState(state: string): FlowInstanceState {
	if (state === 'succeeded') return 'done'
	if (state === 'running' || state === 'publishing') return 'running'
	if (state === 'retry_wait') return 'retrying'
	if (state === 'failed') return 'error'
	if (state === 'needs_review') return 'review'
	if (state === 'skipped' || state === 'unsupported') return 'skipped'
	return 'waiting'
}

function matching(keys: string[], prefix: string): string[] {
	return keys.filter((key) => key.startsWith(prefix))
}

function pageDependency(key: string, from: string, to: string, keys: Set<string>): string[] {
	const candidate = `${to}${key.slice(from.length)}`
	return keys.has(candidate) ? [candidate] : []
}

/** Compatibility for retained v2 presentations, before dependencies were public. */
function inferredDependencies(stage: ArtifactProcessingStage, orderedKeys: string[]): string[] {
	const keys = new Set(orderedKeys)
	const key = stage.key
	if (key === 'decompose-pages') return keys.has('inspect') ? ['inspect'] : []
	if (key.startsWith('extract-native-page-'))
		return keys.has('decompose-pages') ? ['decompose-pages'] : []
	if (key.startsWith('classify-page-')) {
		const native = pageDependency(key, 'classify-page-', 'extract-native-page-', keys)
		return native.length > 0 ? native : keys.has('decompose-pages') ? ['decompose-pages'] : []
	}
	if (key.startsWith('analyze-page-')) {
		return pageDependency(key, 'analyze-page-', 'extract-native-page-', keys)
	}
	if (key.startsWith('represent-page-')) {
		return pageDependency(key, 'represent-page-', 'classify-page-', keys)
	}
	if (key === 'assemble-document') {
		return matching(orderedKeys, 'analyze-page-').length > 0
			? matching(orderedKeys, 'analyze-page-')
			: matching(orderedKeys, 'extract-native-page-')
	}
	if (key === 'assemble-text') return matching(orderedKeys, 'represent-page-')
	if (key === 'aggregate-content') {
		return [
			...matching(orderedKeys, 'analyze-page-'),
			...matching(orderedKeys, 'classify-page-'),
			...(keys.has('assemble-document') ? ['assemble-document'] : [])
		]
	}
	if (key === 'classify-content-refined') return matching(orderedKeys, 'classify-page-')
	if (key === 'classify-document') {
		if (keys.has('classify-content-refined') || keys.has('assemble-text')) {
			return ['classify-content-refined', 'assemble-text'].filter((dependency) =>
				keys.has(dependency)
			)
		}
		return matching(orderedKeys, 'extract-native-page-')
	}
	if (key === 'extract-invoice' || key === 'extract-statement') {
		return keys.has('classify-document') ? ['classify-document'] : []
	}
	if (key === 'validate-invoice') return keys.has('extract-invoice') ? ['extract-invoice'] : []
	if (key === 'validate-statement')
		return keys.has('extract-statement') ? ['extract-statement'] : []
	if (key === 'normalize-invoice-open-item')
		return keys.has('validate-invoice') ? ['validate-invoice'] : []
	if (key === 'normalize-statement')
		return keys.has('validate-statement') ? ['validate-statement'] : []
	if (key.startsWith('fanout-statement-transactions-'))
		return keys.has('normalize-statement') ? ['normalize-statement'] : []
	if (key === 'rank-invoice-transactions') {
		return ['normalize-invoice-open-item', 'normalize-statement'].filter((dependency) =>
			keys.has(dependency)
		)
	}
	return []
}

function nodeType(stage: ArtifactProcessingStage): string {
	const usesModel = stage.procedureKey
		? stage.procedureKey.startsWith('model.')
		: /^(analyze|classify-document|extract-invoice|extract-statement)/.test(stage.key)
	if (usesModel) {
		return 'llm:process'
	}
	if (stage.key.startsWith('validate-')) return 'op:validate'
	if (stage.key === 'inspect') return 'trigger:file'
	return 'op:process'
}

function stateDescription(stage: ArtifactProcessingStage): string {
	const attempt = (stage.attemptCount ?? 0) > 1 ? ` · Versuch ${stage.attemptCount}` : ''
	const terminal = stage.terminalCode ? ` · ${stage.terminalCode}` : ''
	return `${stage.state.replaceAll('_', ' ')}${attempt}${terminal}`
}

export function processingFlowGraph(
	stages: ArtifactProcessingStage[],
	artifacts: Array<{ stageKey?: string | null }> = []
): ProcessingFlowGraph {
	const orderedKeys = stages.map((stage) => stage.key)
	const stageKeys = new Set(orderedKeys)
	const edges: FlowEdge[] = []
	for (const stage of stages) {
		const dependencies = stage.dependsOn ?? inferredDependencies(stage, orderedKeys)
		for (const dependency of dependencies) {
			if (stageKeys.has(dependency)) edges.push({ from: dependency, to: stage.key, predicate: '' })
		}
	}

	const definitions: FlowNodeDef[] = stages.map((stage) => ({
		id: stage.key,
		kind: stage.key === 'inspect' ? 'trigger' : stage.key.startsWith('validate-') ? 'output' : 'op',
		name: artifactProcessingStageLabel(stage.key),
		about: stateDescription(stage),
		type: nodeType(stage)
	}))
	const laid = layoutFlow(definitions, edges)
	return {
		nodes: laid.nodes.map((node) => {
			const stage = stages.find((candidate) => candidate.key === node.id)
			if (!stage) throw new Error(`Missing processing stage ${node.id}`)
			return {
				...node,
				instance: processingStageState(stage.state),
				outputCount: artifacts.filter((artifact) => artifact.stageKey === stage.key).length
			}
		}),
		edges
	}
}
