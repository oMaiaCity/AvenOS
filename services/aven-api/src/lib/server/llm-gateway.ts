import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ServerConfig } from './config.js'
import { AppError } from './errors.js'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_SINGLE_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024
const MAX_IMAGES = 63
const MAX_OPENAI_REQUEST_BYTES = 56 * 1024 * 1024
const MAX_STREAM_BYTES = 64 * 1024 * 1024
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._/@:-]*$/u

export const LLM_CAPABILITIES = {
	textGeneration: 'text-generation',
	vision: 'vision',
	structuredOutput: 'structured-output',
	streaming: 'streaming',
	toolCalling: 'tool-calling'
} as const

export const llmCapabilitySchema = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u)

const profileSchema = z.enum(['openai-tools', 'openai-json-schema', 'qwen-tools', 'generic-json'])

const modelConfigurationSchema = z
	.object({
		id: z.string().min(1).max(128).regex(MODEL_ID_PATTERN),
		label: z.string().trim().min(1).max(120),
		capabilities: z.array(llmCapabilitySchema).min(1).max(32),
		baseUrl: z.url(),
		upstreamModel: z.string().min(1).max(255).regex(/^\S+$/u),
		profile: profileSchema,
		authMode: z.enum(['bearer', 'none']).default('bearer'),
		requestHeaders: z
			.record(
				z.string().regex(/^x-[a-z0-9-]+$/u),
				z
					.string()
					.min(1)
					.max(256)
					.regex(/^[^\r\n]+$/u)
			)
			.default({}),
		credentialId: z
			.string()
			.min(1)
			.max(64)
			.regex(/^[a-z0-9][a-z0-9._-]*$/u)
			.optional(),
		timeoutSeconds: z.number().int().min(5).max(900).optional()
	})
	.strict()
	.superRefine((model, context) => {
		if (!model.capabilities.includes(LLM_CAPABILITIES.textGeneration)) {
			context.addIssue({
				code: 'custom',
				path: ['capabilities'],
				message: `must include ${LLM_CAPABILITIES.textGeneration}`
			})
		}
		if (new Set(model.capabilities).size !== model.capabilities.length) {
			context.addIssue({
				code: 'custom',
				path: ['capabilities'],
				message: 'must not contain duplicates'
			})
		}
		if (model.authMode === 'bearer' && !model.credentialId) {
			context.addIssue({
				code: 'custom',
				path: ['credentialId'],
				message: 'is required in bearer auth mode'
			})
		}
		if (model.authMode === 'none' && model.credentialId) {
			context.addIssue({
				code: 'custom',
				path: ['credentialId'],
				message: 'must be absent in unauthenticated provider mode'
			})
		}
		if (Object.keys(model.requestHeaders).length > 16) {
			context.addIssue({
				code: 'custom',
				path: ['requestHeaders'],
				message: 'must contain at most 16 provider routing headers'
			})
		}
	})

const modelCatalogSchema = z
	.array(modelConfigurationSchema)
	.max(128)
	.superRefine((models, context) => {
		const ids = new Set<string>()
		for (const [index, model] of models.entries()) {
			if (ids.has(model.id)) {
				context.addIssue({
					code: 'custom',
					path: [index, 'id'],
					message: 'model id must be unique'
				})
			}
			ids.add(model.id)
		}
	})

const credentialsSchema = z.record(
	z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z0-9][a-z0-9._-]*$/u),
	z.string().min(20).max(512).regex(/^\S+$/u)
)

const imagePartSchema = z
	.object({
		type: z.literal('image'),
		mediaType: z.enum(['image/png', 'image/jpeg']),
		base64: z.string().min(4).max(16_800_000),
		detail: z.enum(['low', 'high', 'auto']).default('auto')
	})
	.strict()

const messagePartSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('text'), text: z.string().min(1).max(2_000_000) }).strict(),
	imagePartSchema
])

const outputSchema = z.discriminatedUnion('format', [
	z.object({ format: z.literal('text') }).strict(),
	z
		.object({
			format: z.literal('json'),
			name: z
				.string()
				.min(1)
				.max(64)
				.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/u),
			description: z.string().min(1).max(1000).optional(),
			schema: z.record(z.string(), z.unknown())
		})
		.strict()
])

export const llmCompletionRequestSchema = z
	.object({
		modelId: z.string().min(1).max(128).regex(MODEL_ID_PATTERN),
		requiredCapabilities: z.array(llmCapabilitySchema).max(16).default([]),
		instructions: z.string().min(1).max(12_000).optional(),
		messages: z
			.array(
				z
					.object({
						role: z.enum(['user', 'assistant']),
						content: z.array(messagePartSchema).min(1).max(64)
					})
					.strict()
			)
			.min(1)
			.max(32),
		output: outputSchema.default({ format: 'text' }),
		temperature: z.number().min(0).max(2).optional(),
		maxOutputTokens: z.number().int().min(1).max(131_072).optional()
	})
	.strict()

const openAiMessageSchema = z
	.object({
		role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
		content: z.unknown().optional()
	})
	.loose()

const openAiChatCompletionSchema = z
	.object({
		model: z.string().min(1).max(128).regex(MODEL_ID_PATTERN),
		messages: z.array(openAiMessageSchema).min(1).max(128),
		stream: z.boolean().optional(),
		tools: z.array(z.unknown()).max(128).optional(),
		response_format: z.unknown().optional()
	})
	.loose()

export type LlmCompletionRequest = z.infer<typeof llmCompletionRequestSchema>
type ModelConfiguration = z.infer<typeof modelConfigurationSchema>
type ProviderProfile = z.infer<typeof profileSchema>

export interface LlmModelDescriptor {
	id: string
	label: string
	capabilities: string[]
}

export interface LlmGatewayReceipt {
	modelId: string
	modelLabel: string
	capabilities: string[]
	providerRequestId: string | null
	httpRequestId: string | null
	providerReportedModel: string
	profile: ProviderProfile
	usage: Record<string, unknown> | null
	finishReason: string | null
	requestKey: string
	inputDigest: string
	implementationDigest: string
}

export type LlmGatewayResponse =
	| { output: { format: 'text'; text: string }; receipt: LlmGatewayReceipt }
	| { output: { format: 'json'; value: Record<string, unknown> }; receipt: LlmGatewayReceipt }

interface ResolvedModel {
	descriptor: LlmModelDescriptor
	configuration: ModelConfiguration
	endpoint: URL
	credential: string | null
	timeoutSeconds: number
}

const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

function parseConfigurationJson<T>(name: string, raw: string, schema: z.ZodType<T>): T {
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		throw new Error(`${name} must contain valid JSON.`)
	}
	const parsed = schema.safeParse(value)
	if (!parsed.success) {
		throw new Error(`${name} is invalid: ${z.prettifyError(parsed.error)}`)
	}
	return parsed.data
}

function strictSchema(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(strictSchema)
	if (!value || typeof value !== 'object') return value
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !['$schema', 'minLength', 'maxLength', 'uniqueItems'].includes(key))
			.map(([key, child]) => [key, strictSchema(child)])
	)
}

function parseJsonObject(value: string): Record<string, unknown> {
	const trimmed = value.trim()
	const withoutFence = trimmed.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
	let parsed: unknown
	try {
		parsed = JSON.parse(withoutFence)
	} catch {
		throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model returned invalid JSON.')
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model output was not a JSON object.')
	}
	return parsed as Record<string, unknown>
}

function responseMessage(raw: Record<string, unknown>): Record<string, unknown> {
	const choices = raw.choices
	const first = Array.isArray(choices) ? choices[0] : undefined
	const message =
		first && typeof first === 'object' ? (first as Record<string, unknown>).message : null
	if (!message || typeof message !== 'object' || Array.isArray(message)) {
		throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model response omitted its message.')
	}
	return message as Record<string, unknown>
}

function textContent(message: Record<string, unknown>): string {
	if (typeof message.content === 'string') return message.content
	if (Array.isArray(message.content)) {
		return message.content
			.map((part) =>
				part &&
				typeof part === 'object' &&
				typeof (part as Record<string, unknown>).text === 'string'
					? String((part as Record<string, unknown>).text)
					: ''
			)
			.join('')
	}
	throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model response omitted content.')
}

function structuredContent(
	profile: ProviderProfile,
	message: Record<string, unknown>,
	expectedFunction: string
): Record<string, unknown> {
	if (profile === 'openai-tools' || profile === 'qwen-tools') {
		if (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 1) {
			throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model must return exactly one tool call.')
		}
		const call = message.tool_calls[0]
		const fn = call && typeof call === 'object' ? (call as Record<string, unknown>).function : null
		if (!fn || typeof fn !== 'object' || Array.isArray(fn)) {
			throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model tool call was invalid.')
		}
		const functionRecord = fn as Record<string, unknown>
		if (functionRecord.name !== expectedFunction) {
			throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model called the wrong function.')
		}
		if (typeof functionRecord.arguments === 'string') {
			return parseJsonObject(functionRecord.arguments)
		}
		if (
			functionRecord.arguments &&
			typeof functionRecord.arguments === 'object' &&
			!Array.isArray(functionRecord.arguments)
		) {
			return functionRecord.arguments as Record<string, unknown>
		}
		throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model tool arguments were absent.')
	}
	return parseJsonObject(textContent(message))
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
	const reader = response.body?.getReader()
	if (!reader) throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model response was empty.')
	const chunks: Uint8Array[] = []
	let length = 0
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		length += value.length
		if (length > MAX_RESPONSE_BYTES) {
			await reader.cancel()
			throw new AppError(502, 'LLM_RESPONSE_TOO_LARGE', 'Model response was too large.')
		}
		chunks.push(value)
	}
	const bytes = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.length
	}
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object')
		return parsed as Record<string, unknown>
	} catch {
		throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model endpoint returned invalid JSON.')
	}
}

function finishReason(raw: Record<string, unknown>): string | null {
	const first = Array.isArray(raw.choices) ? raw.choices[0] : undefined
	return first && typeof first === 'object' && typeof first.finish_reason === 'string'
		? first.finish_reason
		: null
}

function imageBytesFromDataUrl(url: string): number {
	const match = url.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/u)
	if (!match) {
		throw new AppError(
			400,
			'LLM_IMAGE_INVALID',
			'OpenAI-compatible image URLs must be inline PNG/JPEG data URLs.'
		)
	}
	const encoded = match[2] ?? ''
	const bytes = Buffer.from(encoded, 'base64')
	if (bytes.toString('base64') !== encoded) {
		throw new AppError(400, 'LLM_IMAGE_INVALID', 'An image was not canonical base64.')
	}
	if (bytes.length > MAX_SINGLE_IMAGE_BYTES) {
		throw new AppError(413, 'LLM_IMAGE_TOO_LARGE', 'One image is too large.')
	}
	return bytes.length
}

function inspectOpenAiInput(value: unknown): { imageBytes: number; imageCount: number } {
	let imageBytes = 0
	let imageCount = 0
	const visit = (child: unknown): void => {
		if (Array.isArray(child)) {
			for (const item of child) visit(item)
			return
		}
		if (!child || typeof child !== 'object') return
		const record = child as Record<string, unknown>
		if (record.type === 'image_url') {
			const imageUrl = record.image_url
			const url =
				imageUrl && typeof imageUrl === 'object' && !Array.isArray(imageUrl)
					? (imageUrl as Record<string, unknown>).url
					: null
			if (typeof url !== 'string') {
				throw new AppError(400, 'LLM_IMAGE_INVALID', 'An image URL was absent.')
			}
			imageBytes += imageBytesFromDataUrl(url)
			imageCount += 1
			return
		}
		for (const nested of Object.values(record)) visit(nested)
	}
	visit(value)
	return { imageBytes, imageCount }
}

function hasToolConversation(messages: Array<Record<string, unknown>>): boolean {
	return messages.some(
		(message) =>
			message.role === 'tool' ||
			(Array.isArray(message.tool_calls) && message.tool_calls.length > 0) ||
			typeof message.tool_call_id === 'string'
	)
}

function responseFormatType(value: unknown): string | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? typeof (value as Record<string, unknown>).type === 'string'
			? String((value as Record<string, unknown>).type)
			: null
		: null
}

function boundedStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	const reader = body.getReader()
	let length = 0
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await reader.read()
				if (done) {
					controller.close()
					return
				}
				length += value.length
				if (length > MAX_STREAM_BYTES) {
					await reader.cancel()
					controller.error(new Error('LLM stream exceeded its byte limit.'))
					return
				}
				controller.enqueue(value)
			} catch (error) {
				controller.error(error)
			}
		},
		cancel(reason) {
			return reader.cancel(reason)
		}
	})
}

function resolveEndpoint(baseUrl: string, allowInsecureHttp: boolean): URL {
	const base = new URL(baseUrl)
	if (!['http:', 'https:'].includes(base.protocol)) {
		throw new Error('LLM model baseUrl must use HTTP or HTTPS.')
	}
	if (base.protocol !== 'https:' && !allowInsecureHttp) {
		throw new Error('LLM model baseUrl must use HTTPS unless insecure HTTP is enabled.')
	}
	if (base.username || base.password || base.search || base.hash) {
		throw new Error('LLM model baseUrl cannot contain credentials, query, or fragment.')
	}
	if (!base.pathname.endsWith('/')) base.pathname += '/'
	return new URL('chat/completions', base)
}

export class LlmGatewayService {
	readonly #models: ResolvedModel[]
	readonly #modelsById: Map<string, ResolvedModel>
	readonly #fetch: Fetch

	private constructor(config: ServerConfig, fetch: Fetch) {
		const catalog = parseConfigurationJson(
			'LLM_GATEWAY_MODELS_JSON',
			config.LLM_GATEWAY_MODELS_JSON,
			modelCatalogSchema
		)
		const credentials = parseConfigurationJson(
			'LLM_GATEWAY_CREDENTIALS_JSON',
			config.LLM_GATEWAY_CREDENTIALS_JSON,
			credentialsSchema
		)
		this.#models = catalog.map((model) => {
			const credential = model.credentialId ? (credentials[model.credentialId] ?? null) : null
			if (model.authMode === 'bearer' && !credential) {
				throw new Error(`LLM model ${model.id} references an absent credential.`)
			}
			return {
				descriptor: {
					id: model.id,
					label: model.label,
					capabilities: [...model.capabilities].sort()
				},
				configuration: model,
				endpoint: resolveEndpoint(model.baseUrl, config.LLM_GATEWAY_ALLOW_INSECURE_HTTP),
				credential,
				timeoutSeconds: model.timeoutSeconds ?? config.LLM_GATEWAY_TIMEOUT_SECONDS
			}
		})
		this.#modelsById = new Map(this.#models.map((model) => [model.descriptor.id, model]))
		this.#fetch = fetch
	}

	static fromConfig(
		config: ServerConfig,
		fetch: Fetch = globalThis.fetch
	): LlmGatewayService | null {
		return config.LLM_GATEWAY_ENABLED ? new LlmGatewayService(config, fetch) : null
	}

	models(requiredCapabilities: string[] = []): LlmModelDescriptor[] {
		const required = new Set(requiredCapabilities)
		return this.#models
			.filter((model) =>
				[...required].every((value) => model.descriptor.capabilities.includes(value))
			)
			.map((model) => structuredClone(model.descriptor))
	}

	async openAiChatCompletion(input: unknown): Promise<Response> {
		const request = openAiChatCompletionSchema.parse(input)
		const model = this.#modelsById.get(request.model)
		if (!model) throw new AppError(404, 'LLM_MODEL_NOT_FOUND', 'The selected model does not exist.')

		const serializedInput = JSON.stringify(request)
		if (Buffer.byteLength(serializedInput, 'utf8') > MAX_OPENAI_REQUEST_BYTES) {
			throw new AppError(413, 'LLM_REQUEST_TOO_LARGE', 'The chat completion request is too large.')
		}
		const images = inspectOpenAiInput(request.messages)
		if (images.imageCount > MAX_IMAGES || images.imageBytes > MAX_TOTAL_IMAGE_BYTES) {
			throw new AppError(413, 'LLM_IMAGES_TOO_LARGE', 'Image input is too large.')
		}
		const requiredCapabilities = new Set<string>([LLM_CAPABILITIES.textGeneration])
		if (images.imageCount > 0) requiredCapabilities.add(LLM_CAPABILITIES.vision)
		if (request.stream === true) requiredCapabilities.add(LLM_CAPABILITIES.streaming)
		if (
			(request.tools?.length ?? 0) > 0 ||
			hasToolConversation(request.messages as Array<Record<string, unknown>>)
		) {
			requiredCapabilities.add(LLM_CAPABILITIES.toolCalling)
		}
		const format = responseFormatType(request.response_format)
		if (format === 'json_object' || format === 'json_schema') {
			requiredCapabilities.add(LLM_CAPABILITIES.structuredOutput)
		}
		const missing = [...requiredCapabilities].filter(
			(capability) => !model.descriptor.capabilities.includes(capability)
		)
		if (missing.length > 0) {
			throw new AppError(
				400,
				'LLM_MODEL_CAPABILITY_MISMATCH',
				`The selected model lacks: ${missing.join(', ')}.`
			)
		}

		const body = { ...request, model: model.configuration.upstreamModel }
		const requestBody = JSON.stringify(body)
		const requestKey = sha256(
			`${model.descriptor.id}\0${model.endpoint.toString()}\0${requestBody}`
		)
		const headers: Record<string, string> = {
			...model.configuration.requestHeaders,
			accept: request.stream === true ? 'text/event-stream' : 'application/json',
			'content-type': 'application/json',
			'idempotency-key': requestKey
		}
		if (model.credential) headers.authorization = `Bearer ${model.credential}`

		let upstream: Response
		try {
			upstream = await this.#fetch(model.endpoint, {
				method: 'POST',
				headers,
				body: requestBody,
				redirect: 'error',
				signal: AbortSignal.timeout(model.timeoutSeconds * 1000)
			})
		} catch {
			throw new AppError(503, 'LLM_UNAVAILABLE', 'The selected model is unavailable.')
		}
		if (!upstream.ok) {
			throw new AppError(
				upstream.status === 429 ? 429 : 502,
				'LLM_UPSTREAM_ERROR',
				`The selected model returned HTTP ${upstream.status}.`
			)
		}
		const responseHeaders = new Headers({
			'x-aven-model-id': model.descriptor.id,
			'x-aven-model-label': encodeURIComponent(model.descriptor.label),
			'x-aven-model-capabilities': model.descriptor.capabilities.join(','),
			'x-aven-request-key': requestKey
		})
		const providerRequestId = upstream.headers.get('x-request-id')
		if (providerRequestId) responseHeaders.set('x-aven-provider-request-id', providerRequestId)

		if (request.stream === true) {
			if (!upstream.body) {
				throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Model stream was empty.')
			}
			responseHeaders.set('content-type', 'text/event-stream')
			responseHeaders.set('cache-control', 'no-cache')
			responseHeaders.set('connection', 'keep-alive')
			return new Response(boundedStream(upstream.body), { headers: responseHeaders })
		}

		const raw = await boundedJson(upstream)
		const providerReportedModel = typeof raw.model === 'string' ? raw.model : null
		raw.model = model.descriptor.id
		raw.aven = {
			modelId: model.descriptor.id,
			modelLabel: model.descriptor.label,
			capabilities: [...model.descriptor.capabilities],
			providerReportedModel,
			requestKey
		}
		responseHeaders.set('content-type', 'application/json')
		return new Response(JSON.stringify(raw), { headers: responseHeaders })
	}

	async complete(input: unknown): Promise<LlmGatewayResponse> {
		const request = llmCompletionRequestSchema.parse(input)
		const model = this.#modelsById.get(request.modelId)
		if (!model) throw new AppError(404, 'LLM_MODEL_NOT_FOUND', 'The selected model does not exist.')

		const requiredCapabilities = new Set(request.requiredCapabilities)
		if (request.messages.some((message) => message.content.some((part) => part.type === 'image'))) {
			requiredCapabilities.add(LLM_CAPABILITIES.vision)
		}
		if (request.output.format === 'json') {
			requiredCapabilities.add(LLM_CAPABILITIES.structuredOutput)
		}
		const missing = [...requiredCapabilities].filter(
			(capability) => !model.descriptor.capabilities.includes(capability)
		)
		if (missing.length > 0) {
			throw new AppError(
				400,
				'LLM_MODEL_CAPABILITY_MISMATCH',
				`The selected model lacks: ${missing.join(', ')}.`
			)
		}

		let textBytes = request.instructions ? new TextEncoder().encode(request.instructions).length : 0
		let imageBytes = 0
		let imageCount = 0
		for (const message of request.messages) {
			for (const part of message.content) {
				if (part.type === 'text') {
					textBytes += new TextEncoder().encode(part.text).length
					continue
				}
				imageCount += 1
				const bytes = Buffer.from(part.base64, 'base64')
				if (bytes.toString('base64') !== part.base64) {
					throw new AppError(400, 'LLM_IMAGE_INVALID', 'An image was not canonical base64.')
				}
				if (bytes.length > MAX_SINGLE_IMAGE_BYTES) {
					throw new AppError(413, 'LLM_IMAGE_TOO_LARGE', 'One image is too large.')
				}
				imageBytes += bytes.length
			}
		}
		if (textBytes > MAX_TEXT_BYTES) {
			throw new AppError(413, 'LLM_TEXT_TOO_LARGE', 'Text input is too large.')
		}
		if (imageCount > MAX_IMAGES || imageBytes > MAX_TOTAL_IMAGE_BYTES) {
			throw new AppError(413, 'LLM_IMAGES_TOO_LARGE', 'Image input is too large.')
		}

		const messages: Record<string, unknown>[] = []
		if (request.instructions) messages.push({ role: 'system', content: request.instructions })
		for (const message of request.messages) {
			messages.push({
				role: message.role,
				content: message.content.map((part) =>
					part.type === 'text'
						? { type: 'text', text: part.text }
						: {
								type: 'image_url',
								image_url: {
									url: `data:${part.mediaType};base64,${part.base64}`,
									detail: part.detail
								}
							}
				)
			})
		}

		const body: Record<string, unknown> = {
			model: model.configuration.upstreamModel,
			messages,
			...(request.temperature !== undefined && { temperature: request.temperature }),
			...(request.maxOutputTokens !== undefined && { max_tokens: request.maxOutputTokens })
		}
		if (request.output.format === 'json') {
			const schema =
				model.configuration.profile.startsWith('openai-') ||
				model.configuration.profile === 'qwen-tools'
					? strictSchema(request.output.schema)
					: request.output.schema
			if (model.configuration.profile === 'qwen-tools') {
				// Qwen 3 enables its extended thinking lane by default. That lane is useful
				// for conversational reasoning, but with a forced structured tool it can
				// consume the entire output budget before emitting the required call.
				// Keep this compatibility behavior scoped to qwen-tools JSON requests.
				body.chat_template_kwargs = { enable_thinking: false }
			}
			if (
				model.configuration.profile === 'openai-tools' ||
				model.configuration.profile === 'qwen-tools'
			) {
				body.tools = [
					{
						type: 'function',
						function: {
							name: request.output.name,
							description: request.output.description ?? 'Return the requested structured result.',
							strict: true,
							parameters: schema
						}
					}
				]
				body.tool_choice = { type: 'function', function: { name: request.output.name } }
				body.parallel_tool_calls = false
			} else if (model.configuration.profile === 'openai-json-schema') {
				body.response_format = {
					type: 'json_schema',
					json_schema: { name: request.output.name, strict: true, schema }
				}
			} else {
				body.response_format = { type: 'json_object' }
				messages.push({
					role: 'user',
					content: `Return one JSON object matching this schema exactly:\n${JSON.stringify(schema)}`
				})
			}
		}

		const requestBody = JSON.stringify(body)
		const requestKey = sha256(
			`${model.descriptor.id}\0${model.endpoint.toString()}\0${requestBody}`
		)
		const headers: Record<string, string> = {
			...model.configuration.requestHeaders,
			accept: 'application/json',
			'content-type': 'application/json',
			'idempotency-key': requestKey
		}
		if (model.credential) headers.authorization = `Bearer ${model.credential}`

		let response: Response
		try {
			response = await this.#fetch(model.endpoint, {
				method: 'POST',
				headers,
				body: requestBody,
				redirect: 'error',
				signal: AbortSignal.timeout(model.timeoutSeconds * 1000)
			})
		} catch {
			throw new AppError(503, 'LLM_UNAVAILABLE', 'The selected model is unavailable.')
		}
		if (!response.ok) {
			throw new AppError(
				response.status === 429 ? 429 : 502,
				'LLM_UPSTREAM_ERROR',
				`The selected model returned HTTP ${response.status}.`
			)
		}
		const raw = await boundedJson(response)
		const message = responseMessage(raw)
		const receipt: LlmGatewayReceipt = {
			modelId: model.descriptor.id,
			modelLabel: model.descriptor.label,
			capabilities: [...model.descriptor.capabilities],
			providerRequestId: typeof raw.id === 'string' ? raw.id : null,
			httpRequestId: response.headers.get('x-request-id'),
			providerReportedModel:
				typeof raw.model === 'string' ? raw.model : model.configuration.upstreamModel,
			profile: model.configuration.profile,
			usage:
				raw.usage && typeof raw.usage === 'object' && !Array.isArray(raw.usage)
					? (raw.usage as Record<string, unknown>)
					: null,
			finishReason: finishReason(raw),
			requestKey,
			inputDigest: sha256(
				JSON.stringify({
					instructions: request.instructions ?? null,
					messages: request.messages,
					output: request.output
				})
			),
			implementationDigest: sha256(
				`${model.descriptor.id}:${model.configuration.profile}:${model.configuration.upstreamModel}:${model.endpoint}`
			)
		}
		if (request.output.format === 'json') {
			return {
				output: {
					format: 'json',
					value: structuredContent(model.configuration.profile, message, request.output.name)
				},
				receipt
			}
		}
		return { output: { format: 'text', text: textContent(message) }, receipt }
	}
}
