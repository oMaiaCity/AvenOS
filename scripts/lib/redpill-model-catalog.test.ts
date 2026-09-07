import { describe, expect, test } from 'bun:test'
import { fetchRedpillPhalaCatalog, redpillPhalaCatalog } from './redpill-model-catalog.js'

describe('RedPill Phala model catalog', () => {
	test('keeps Phala chat models and derives only advertised capabilities', () => {
		const catalog = redpillPhalaCatalog({
			data: [
				{
					id: 'qwen/qwen-vision',
					name: 'Qwen Vision',
					providers: ['phala', 'near-ai'],
					input_modalities: ['text', 'image'],
					output_modalities: ['text'],
					supported_features: ['tools', 'structured_outputs'],
					supported_parameters: ['stream']
				},
				{
					id: 'sentence-transformers/embed',
					name: 'Embedding',
					providers: ['phala'],
					output_modalities: ['embedding']
				},
				{ id: 'other/chat', name: 'Other', providers: ['chutes'], output_modalities: ['text'] }
			]
		})

		expect(catalog).toEqual([
			{
				id: 'qwen/qwen-vision',
				label: 'Qwen Vision',
				capabilities: [
					'text-generation',
					'vision',
					'structured-output',
					'streaming',
					'tool-calling'
				],
				baseUrl: 'https://tee.redpill.ai/v1',
				upstreamModel: 'qwen/qwen-vision',
				profile: 'openai-tools',
				authMode: 'bearer',
				credentialId: 'redpill',
				requestHeaders: { 'x-redpill-provider': 'phala' }
			}
		])
	})

	test('rejects an empty or malformed provider response', () => {
		expect(() => redpillPhalaCatalog({ data: [] })).toThrow('no Phala-hosted chat models')
		expect(() => redpillPhalaCatalog({})).toThrow('data array')
	})

	test('uses the supplied API key for live catalog validation', async () => {
		let authorization: string | null = null
		await fetchRedpillPhalaCatalog(async (_input, init) => {
			authorization = new Headers(init?.headers).get('authorization')
			return new Response(
				JSON.stringify({
					data: [
						{
							id: 'phala/example',
							name: 'Example',
							providers: ['phala'],
							output_modalities: ['text']
						}
					]
				})
			)
		}, 'test-api-key')
		expect(authorization).toBe('Bearer test-api-key')
	})
})
