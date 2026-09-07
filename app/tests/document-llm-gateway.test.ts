import { modelRequest } from '@avenos/document-ingest/model'
import { describe, expect, test } from 'vitest'
import {
	type DocumentLlmClient,
	documentLlmRequest,
	LlmDocumentModelGateway
} from '../src/lib/actors/document-llm-gateway'
import type { LlmCompletionRequest } from '../src/lib/models/gateway'

const models = [
	{
		id: 'vision/primary',
		label: 'Primary vision model',
		capabilities: ['text-generation', 'vision', 'structured-output']
	},
	{
		id: 'vision/alternative',
		label: 'Alternative vision model',
		capabilities: ['text-generation', 'vision', 'structured-output']
	}
]

const response = {
	output: { format: 'json' as const, value: { resolvedKind: 'invoice' } },
	receipt: {
		modelId: 'vision/primary',
		modelLabel: 'Primary vision model',
		capabilities: ['text-generation', 'vision', 'structured-output'],
		providerRequestId: 'provider-request',
		httpRequestId: 'http-request',
		providerReportedModel: 'upstream-vision-v2',
		profile: 'openai-json-schema',
		usage: { total_tokens: 42 },
		finishReason: 'stop',
		requestKey: 'request-key',
		inputDigest: 'input-digest',
		implementationDigest: 'implementation-digest'
	}
}

describe('document LLM gateway adapter', () => {
	test('selects one explicit model while reporting every compatible alternative', async () => {
		let completion: LlmCompletionRequest | undefined
		const client: DocumentLlmClient = {
			discover: async (capabilities) => {
				expect(capabilities).toEqual(['vision', 'structured-output'])
				return models
			},
			complete: async (request) => {
				completion = request
				return response
			}
		}
		const gateway = new LlmDocumentModelGateway(undefined, client)
		expect(await gateway.status()).toEqual({
			available: true,
			maxPages: 63,
			modelId: 'vision/primary',
			modelLabel: 'Primary vision model',
			alternatives: [
				{ id: 'vision/primary', label: 'Primary vision model' },
				{ id: 'vision/alternative', label: 'Alternative vision model' }
			]
		})

		const request = modelRequest(
			'classify-document',
			[{ page: 1, mediaType: 'image/png', base64: 'aGVsbG8=' }],
			'Invoice 42'
		)
		const completed = await gateway.complete(request)
		expect(completion).toEqual(documentLlmRequest('vision/primary', request))
		expect(completion?.requiredCapabilities).toEqual(['vision', 'structured-output'])
		expect(completion?.output).toMatchObject({ format: 'json', name: 'classify_document' })
		expect(completed.structured).toEqual({ resolvedKind: 'invoice' })
		expect(completed.receipt).toMatchObject({
			model: 'vision/primary',
			modelLabel: 'Primary vision model',
			providerReportedModel: 'upstream-vision-v2',
			promptDigest: 'input-digest'
		})
	})

	test('does not substitute another model when an explicit preference is absent', async () => {
		const client: DocumentLlmClient = {
			discover: async () => models,
			complete: async () => response
		}
		const gateway = new LlmDocumentModelGateway('vision/missing', client)
		expect(await gateway.status()).toMatchObject({
			available: false,
			alternatives: expect.any(Array)
		})
		await expect(gateway.complete(modelRequest('analyze-page', [], 'text'))).rejects.toThrow(
			'Preferred document model vision/missing is unavailable.'
		)
	})

	test('retries catalog discovery after a transient failure', async () => {
		let attempts = 0
		const client: DocumentLlmClient = {
			discover: async () => {
				attempts += 1
				if (attempts === 1) throw new Error('offline')
				return models
			},
			complete: async () => response
		}
		const gateway = new LlmDocumentModelGateway(undefined, client)
		await expect(gateway.status()).rejects.toThrow('offline')
		await expect(gateway.status()).resolves.toMatchObject({ available: true })
	})
})
