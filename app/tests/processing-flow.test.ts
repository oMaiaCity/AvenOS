import { describe, expect, test } from 'bun:test'
import { processingFlowGraph, processingStageState } from '../src/lib/artifacts/processing-flow'

describe('file processing flow', () => {
	test('renders the exact runtime dependency graph, including page fan-out and the chosen extractor', () => {
		const graph = processingFlowGraph(
			[
				{ key: 'inspect', state: 'succeeded', dependsOn: [], procedureKey: 'core.inspect-file' },
				{ key: 'decompose-pages', state: 'succeeded', dependsOn: ['inspect'] },
				{
					key: 'extract-native-page-001',
					state: 'succeeded',
					dependsOn: ['decompose-pages']
				},
				{
					key: 'analyze-page-001',
					state: 'running',
					dependsOn: ['extract-native-page-001'],
					procedureKey: 'model.analyze-page'
				},
				{
					key: 'classify-document',
					state: 'succeeded',
					dependsOn: ['extract-native-page-001']
				},
				{
					key: 'extract-invoice',
					state: 'succeeded',
					dependsOn: ['classify-document']
				},
				{
					key: 'validate-invoice',
					state: 'queued',
					dependsOn: ['extract-invoice']
				}
			],
			[{ artifactId: 'invoice', typeKey: 'invoice', typeVersion: 1, stageKey: 'extract-invoice' }]
		)
		expect(graph.edges.map(({ from, to }) => `${from}->${to}`)).toEqual([
			'inspect->decompose-pages',
			'decompose-pages->extract-native-page-001',
			'extract-native-page-001->analyze-page-001',
			'extract-native-page-001->classify-document',
			'classify-document->extract-invoice',
			'extract-invoice->validate-invoice'
		])
		expect(graph.nodes.find((node) => node.id === 'analyze-page-001')?.instance).toBe('running')
		expect(graph.nodes.find((node) => node.id === 'analyze-page-001')?.node.name).toBe(
			'Understanding pages · Page 1'
		)
		expect(graph.nodes.find((node) => node.id === 'extract-invoice')?.outputCount).toBe(1)
	})

	test('maps every durable processor state to an honest visual state', () => {
		expect(processingStageState('succeeded')).toBe('done')
		expect(processingStageState('publishing')).toBe('running')
		expect(processingStageState('retry_wait')).toBe('retrying')
		expect(processingStageState('failed')).toBe('error')
		expect(processingStageState('needs_review')).toBe('review')
		expect(processingStageState('unsupported')).toBe('skipped')
		expect(processingStageState('queued')).toBe('waiting')
	})

	test('keeps retained v2 presentations useful by inferring their known edges', () => {
		const graph = processingFlowGraph([
			{ key: 'inspect', state: 'succeeded' },
			{ key: 'decompose-pages', state: 'succeeded' },
			{ key: 'extract-native-page-001', state: 'running' }
		])
		expect(graph.edges.map(({ from, to }) => `${from}->${to}`)).toEqual([
			'inspect->decompose-pages',
			'decompose-pages->extract-native-page-001'
		])
	})
})
