import { describe, expect, test } from 'bun:test'
import { localLlmCatalog } from './llm-catalog'

describe('local LLM catalog', () => {
	test('maps both desktop model ids onto one local model', () => {
		expect(
			localLlmCatalog({
				LOCAL_LLM_MODEL: 'Qwen/Qwen3.8-27B',
				LOCAL_LLM_LABEL: 'Qwen local',
				LOCAL_LLM_BASE_URL: 'http://100.96.61.57:8000/v1',
				LOCAL_LLM_VISION: 'true'
			})
		).toEqual([
			expect.objectContaining({
				id: 'deepseek/deepseek-v4-flash-0731',
				label: 'Qwen local (chat)',
				baseUrl: 'http://100.96.61.57:8000/v1',
				upstreamModel: 'Qwen/Qwen3.8-27B',
				profile: 'qwen-tools',
				capabilities: [
					'text-generation',
					'streaming',
					'tool-calling',
					'vision',
					'structured-output'
				]
			}),
			expect.objectContaining({
				id: 'moonshotai/kimi-k3',
				label: 'Qwen local (design)',
				capabilities: ['text-generation', 'streaming', 'tool-calling', 'structured-output']
			})
		])
	})

	test('does not advertise vision unless the operator confirms support', () => {
		const [chat] = localLlmCatalog({ LOCAL_LLM_MODEL: 'tool-model' }) as Array<{
			capabilities: string[]
			profile: string
		}>
		expect(chat.capabilities).not.toContain('vision')
		expect(chat.profile).toBe('generic-json')
	})

	test('rejects unsafe provider coordinates and invalid flags', () => {
		expect(() =>
			localLlmCatalog({
				LOCAL_LLM_MODEL: 'model',
				LOCAL_LLM_BASE_URL: 'file:///tmp/model'
			})
		).toThrow('HTTP or HTTPS')
		expect(() => localLlmCatalog({ LOCAL_LLM_MODEL: 'model', LOCAL_LLM_VISION: 'yes' })).toThrow(
			'true or false'
		)
	})
})
