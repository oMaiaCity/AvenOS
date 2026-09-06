import { describe, expect, test } from 'bun:test'
import { e2eModelCatalog } from './llm-catalog'

describe('deterministic E2E LLM catalog', () => {
	test('keeps chat and explicitly synthetic document capabilities separate', async () => {
		const [model, documents] = e2eModelCatalog({})
		expect(model?.capabilities).toEqual(['text-generation', 'streaming', 'tool-calling'])
		expect(model?.capabilities).not.toContain('vision')
		expect(model?.capabilities).not.toContain('structured-output')
		expect(documents?.capabilities).toEqual(['text-generation', 'vision', 'structured-output'])
	})
	test('live OCR is explicit and never changes the chat provider', () => {
		const catalog = e2eModelCatalog({
			TEST_DOCUMENT_PROVIDER_BASE_URL: 'http://model.example.test:8000/v1',
			TEST_DOCUMENT_PROVIDER_MODEL: 'example-vision',
			TEST_DOCUMENT_PROVIDER_PROFILE: 'qwen-tools'
		})
		expect(catalog[0]).toEqual(e2eModelCatalog({})[0])
		expect(catalog[1]).toMatchObject({
			upstreamModel: 'example-vision',
			profile: 'qwen-tools',
			timeoutSeconds: 45
		})
		expect(() => e2eModelCatalog({ TEST_DOCUMENT_PROVIDER_MODEL: 'incomplete' })).toThrow()
		expect(() =>
			e2eModelCatalog({
				TEST_DOCUMENT_PROVIDER_BASE_URL: 'file:///tmp/model',
				TEST_DOCUMENT_PROVIDER_MODEL: 'model'
			})
		).toThrow()
	})
})
