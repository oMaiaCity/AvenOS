import { describe, expect, test } from 'vitest'
import {
	LLM_CAPABILITIES,
	type LlmCompletionRequest,
	LlmGatewayService
} from '../src/lib/server/llm-gateway.js'
import { testConfig } from './helpers.js'

const CREDENTIALS = JSON.stringify({ primary: 'generic-llm-gateway-secret' })
const MODELS = JSON.stringify([
	{
		id: 'vision-fast',
		label: 'Vision Fast',
		capabilities: ['text-generation', 'structured-output', 'vision', 'streaming', 'tool-calling'],
		baseUrl: 'https://models.example.test/v1',
		upstreamModel: 'provider-vision-fast',
		profile: 'openai-json-schema',
		authMode: 'bearer',
		credentialId: 'primary',
		requestHeaders: { 'x-redpill-provider': 'phala' }
	},
	{
		id: 'vision-accurate',
		label: 'Vision Accurate',
		capabilities: [
			'text-generation',
			'structured-output',
			'vision',
			'reasoning',
			'streaming',
			'tool-calling'
		],
		baseUrl: 'https://models.example.test/v1',
		upstreamModel: 'provider-vision-accurate',
		profile: 'openai-json-schema',
		authMode: 'bearer',
		credentialId: 'primary',
		requestHeaders: { 'x-redpill-provider': 'phala' }
	},
	{
		id: 'text-small',
		label: 'Text Small',
		capabilities: ['text-generation'],
		baseUrl: 'https://models.example.test/v1',
		upstreamModel: 'provider-text-small',
		profile: 'generic-json',
		authMode: 'bearer',
		credentialId: 'primary'
	}
])

const config = () =>
	testConfig({
		LLM_GATEWAY_ENABLED: 'true',
		LLM_GATEWAY_MODELS_JSON: MODELS,
		LLM_GATEWAY_CREDENTIALS_JSON: CREDENTIALS
	})

const request = (overrides: Partial<LlmCompletionRequest> = {}): LlmCompletionRequest => ({
	modelId: 'vision-fast',
	requiredCapabilities: [],
	messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this.' }] }],
	output: { format: 'text' },
	...overrides
})

describe('generic authenticated LLM gateway', () => {
	test('lists every alternative matching all required capabilities with stable id and label', () => {
		const gateway = LlmGatewayService.fromConfig(config())

		expect(gateway?.models([LLM_CAPABILITIES.vision, LLM_CAPABILITIES.structuredOutput])).toEqual([
			{
				id: 'vision-fast',
				label: 'Vision Fast',
				capabilities: [
					'streaming',
					'structured-output',
					'text-generation',
					'tool-calling',
					'vision'
				]
			},
			{
				id: 'vision-accurate',
				label: 'Vision Accurate',
				capabilities: [
					'reasoning',
					'streaming',
					'structured-output',
					'text-generation',
					'tool-calling',
					'vision'
				]
			}
		])
	})

	test('uses the explicit model id and returns its public identity in the receipt', async () => {
		let outbound: Request | undefined
		const gateway = LlmGatewayService.fromConfig(config(), async (input, init) => {
			outbound = new Request(input, init)
			return new Response(
				JSON.stringify({
					id: 'provider-request-1',
					model: 'provider-vision-accurate-2026-08',
					choices: [{ finish_reason: 'stop', message: { content: 'A useful answer.' } }],
					usage: { prompt_tokens: 8, completion_tokens: 4 }
				}),
				{ headers: { 'x-request-id': 'http-request-1' } }
			)
		})

		const result = await gateway?.complete(
			request({
				modelId: 'vision-accurate',
				requiredCapabilities: ['reasoning']
			})
		)

		expect(outbound?.url).toBe('https://models.example.test/v1/chat/completions')
		expect(outbound?.headers.get('authorization')).toBe('Bearer generic-llm-gateway-secret')
		expect(outbound?.headers.get('x-redpill-provider')).toBe('phala')
		expect(outbound?.headers.get('idempotency-key')).toMatch(/^[a-f0-9]{64}$/u)
		expect(await outbound?.json()).toMatchObject({ model: 'provider-vision-accurate' })
		expect(result).toMatchObject({
			output: { format: 'text', text: 'A useful answer.' },
			receipt: {
				modelId: 'vision-accurate',
				modelLabel: 'Vision Accurate',
				providerRequestId: 'provider-request-1',
				httpRequestId: 'http-request-1',
				finishReason: 'stop'
			}
		})
	})

	test('formats schema output and rejects a model without required capabilities', async () => {
		let calls = 0
		const gateway = LlmGatewayService.fromConfig(config(), async () => {
			calls += 1
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"answer":42}' } }]
				})
			)
		})
		const jsonOutput = {
			format: 'json' as const,
			name: 'answer_result',
			schema: {
				type: 'object',
				additionalProperties: false,
				required: ['answer'],
				properties: { answer: { type: 'integer' } }
			}
		}

		await expect(
			gateway?.complete(request({ modelId: 'text-small', output: jsonOutput }))
		).rejects.toMatchObject({ code: 'LLM_MODEL_CAPABILITY_MISMATCH' })
		expect(calls).toBe(0)

		const result = await gateway?.complete(request({ output: jsonOutput }))
		expect(result?.output).toEqual({ format: 'json', value: { answer: 42 } })
		expect(calls).toBe(1)
	})

	test('disables Qwen thinking before forcing a structured tool call', async () => {
		let outbound: Request | undefined
		const qwenModel = JSON.stringify([
			{
				id: 'qwen-local',
				label: 'Qwen local',
				capabilities: ['text-generation', 'structured-output', 'vision', 'tool-calling'],
				baseUrl: 'https://qwen.example.test/v1',
				upstreamModel: 'Qwen/Qwen3.8-27B',
				profile: 'qwen-tools',
				authMode: 'none'
			}
		])
		const gateway = LlmGatewayService.fromConfig(
			testConfig({
				LLM_GATEWAY_ENABLED: 'true',
				LLM_GATEWAY_MODELS_JSON: qwenModel,
				LLM_GATEWAY_CREDENTIALS_JSON: '{}'
			}),
			async (input, init) => {
				outbound = new Request(input, init)
				return new Response(
					JSON.stringify({
						choices: [
							{
								finish_reason: 'tool_calls',
								message: {
									tool_calls: [
										{
											function: { name: 'answer_result', arguments: '{"answer":42}' }
										}
									]
								}
							}
						]
					})
				)
			}
		)
		const output = {
			format: 'json' as const,
			name: 'answer_result',
			schema: {
				type: 'object',
				additionalProperties: false,
				required: ['answer'],
				properties: {
					answer: { type: 'integer' },
					note: { type: 'string', maxLength: 100 },
					tags: { type: 'array', uniqueItems: true, items: { type: 'string' } }
				}
			}
		}

		const result = await gateway?.complete(
			request({ modelId: 'qwen-local', output, maxOutputTokens: 4096 })
		)
		const body = (await outbound?.json()) as Record<string, unknown>

		expect(result?.output).toEqual({ format: 'json', value: { answer: 42 } })
		expect(body).toMatchObject({
			model: 'Qwen/Qwen3.8-27B',
			max_tokens: 4096,
			chat_template_kwargs: { enable_thinking: false },
			tool_choice: { type: 'function', function: { name: 'answer_result' } },
			parallel_tool_calls: false
		})
		expect(JSON.stringify(body.tools)).not.toContain('maxLength')
		expect(JSON.stringify(body.tools)).not.toContain('uniqueItems')
	})

	test('passes through OpenAI streaming, schemas, tools, tool results, and provider extensions', async () => {
		let outbound: Request | undefined
		const stream =
			'data: {"choices":[{"delta":{"reasoning_content":"checking"}}]}\n\n' +
			'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{\\"id\\":42}"}}]}}]}\n\n' +
			'data: [DONE]\n\n'
		const gateway = LlmGatewayService.fromConfig(config(), async (input, init) => {
			outbound = new Request(input, init)
			return new Response(stream, {
				headers: { 'content-type': 'text/event-stream', 'x-request-id': 'provider-http-7' }
			})
		})
		const schema = {
			type: 'object',
			additionalProperties: false,
			properties: { answer: { type: 'string' } }
		}

		const response = await gateway?.openAiChatCompletion({
			model: 'vision-fast',
			messages: [
				{ role: 'user', content: 'Find it.' },
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'previous_call',
							type: 'function',
							function: { name: 'lookup', arguments: '{"id":1}' }
						}
					]
				},
				{ role: 'tool', tool_call_id: 'previous_call', content: '{"name":"one"}' }
			],
			stream: true,
			stream_options: { include_usage: true },
			tools: [
				{
					type: 'function',
					function: {
						name: 'lookup',
						description: 'Look up one record.',
						parameters: { type: 'object', properties: { id: { type: 'integer' } } }
					}
				}
			],
			tool_choice: 'auto',
			parallel_tool_calls: false,
			response_format: {
				type: 'json_schema',
				json_schema: { name: 'answer', strict: true, schema }
			},
			chat_template_kwargs: { enable_thinking: false },
			frequency_penalty: 0.3,
			max_tokens: 16_384
		})

		expect(await response?.text()).toBe(stream)
		expect(response?.headers.get('content-type')).toBe('text/event-stream')
		expect(response?.headers.get('x-aven-model-id')).toBe('vision-fast')
		expect(response?.headers.get('x-aven-provider-request-id')).toBe('provider-http-7')
		const body = (await outbound?.json()) as Record<string, unknown>
		expect(body).toMatchObject({
			model: 'provider-vision-fast',
			stream: true,
			stream_options: { include_usage: true },
			tool_choice: 'auto',
			parallel_tool_calls: false,
			response_format: { type: 'json_schema' },
			chat_template_kwargs: { enable_thinking: false },
			frequency_penalty: 0.3,
			max_tokens: 16_384
		})
		expect(body.tools).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ function: expect.objectContaining({ name: 'lookup' }) })
			])
		)
		expect(body.messages).toEqual([
			{ role: 'user', content: 'Find it.' },
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'previous_call',
						type: 'function',
						function: { name: 'lookup', arguments: '{"id":1}' }
					}
				]
			},
			{ role: 'tool', tool_call_id: 'previous_call', content: '{"name":"one"}' }
		])
	})

	test('rejects OpenAI streaming or tool requests on a model that does not advertise them', async () => {
		let called = false
		const gateway = LlmGatewayService.fromConfig(config(), async () => {
			called = true
			return new Response('{}')
		})

		await expect(
			gateway?.openAiChatCompletion({
				model: 'text-small',
				messages: [{ role: 'user', content: 'Call a tool.' }],
				stream: true,
				tools: [{ type: 'function', function: { name: 'work', parameters: {} } }]
			})
		).rejects.toMatchObject({ code: 'LLM_MODEL_CAPABILITY_MISMATCH' })
		expect(called).toBe(false)
	})

	test('accepts provider-style public ids and rewrites non-streaming response identity', async () => {
		const providerStyleModels = JSON.stringify([
			{
				...JSON.parse(MODELS)[0],
				id: 'deepseek/deepseek-v4-flash-0731',
				label: 'DeepSeek Voice'
			}
		])
		const gateway = LlmGatewayService.fromConfig(
			testConfig({
				LLM_GATEWAY_ENABLED: 'true',
				LLM_GATEWAY_MODELS_JSON: providerStyleModels,
				LLM_GATEWAY_CREDENTIALS_JSON: CREDENTIALS
			}),
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-1',
						model: 'private-provider-deployment',
						choices: [{ finish_reason: 'stop', message: { content: 'Hello.' } }]
					})
				)
		)

		const response = await gateway?.openAiChatCompletion({
			model: 'deepseek/deepseek-v4-flash-0731',
			messages: [{ role: 'user', content: 'Hello.' }]
		})
		const body = await response?.json()

		expect(body).toMatchObject({
			model: 'deepseek/deepseek-v4-flash-0731',
			aven: {
				modelId: 'deepseek/deepseek-v4-flash-0731',
				modelLabel: 'DeepSeek Voice',
				providerReportedModel: 'private-provider-deployment'
			}
		})
	})

	test('fails startup when catalog model ids are ambiguous', () => {
		const duplicated = JSON.stringify([
			JSON.parse(MODELS)[0],
			{ ...JSON.parse(MODELS)[0], label: 'Duplicate' }
		])
		expect(() =>
			LlmGatewayService.fromConfig(
				testConfig({
					LLM_GATEWAY_ENABLED: 'true',
					LLM_GATEWAY_MODELS_JSON: duplicated,
					LLM_GATEWAY_CREDENTIALS_JSON: CREDENTIALS
				})
			)
		).toThrow('model id must be unique')
	})
})
