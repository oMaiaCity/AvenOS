export const LLM_CAPABILITIES = {
	textGeneration: 'text-generation',
	vision: 'vision',
	structuredOutput: 'structured-output',
	streaming: 'streaming',
	toolCalling: 'tool-calling'
} as const

export interface LlmModelDescriptor {
	id: string
	label: string
	capabilities: string[]
}

export type LlmContentPart =
	| { type: 'text'; text: string }
	| {
			type: 'image'
			mediaType: 'image/png' | 'image/jpeg'
			base64: string
			detail?: 'low' | 'high' | 'auto'
	  }

export interface LlmMessage {
	role: 'user' | 'assistant'
	content: LlmContentPart[]
}

export type LlmOutputRequest =
	| { format: 'text' }
	| {
			format: 'json'
			name: string
			description?: string
			schema: Record<string, unknown>
	  }

export interface LlmCompletionRequest {
	modelId: string
	requiredCapabilities?: string[]
	instructions?: string
	messages: LlmMessage[]
	output?: LlmOutputRequest
	temperature?: number
	maxOutputTokens?: number
}

export interface LlmGatewayReceipt {
	modelId: string
	modelLabel: string
	capabilities: string[]
	providerRequestId: string | null
	httpRequestId: string | null
	providerReportedModel: string
	profile: string
	usage: Record<string, unknown> | null
	finishReason: string | null
	requestKey: string
	inputDigest: string
	implementationDigest: string
}

export type LlmCompletionResponse =
	| { output: { format: 'text'; text: string }; receipt: LlmGatewayReceipt }
	| {
			output: { format: 'json'; value: Record<string, unknown> }
			receipt: LlmGatewayReceipt
	  }

export interface OpenAiChatCompletionRequest extends Record<string, unknown> {
	model: string
	messages: unknown[]
	stream?: boolean
}

/** Minimal transport port shared by desktop, browser, and headless consumers. */
export interface LlmGatewayClient {
	discover(requiredCapabilities: string[]): Promise<LlmModelDescriptor[]>
	complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>
}

export function supportsCapabilities(
	model: LlmModelDescriptor,
	requiredCapabilities: readonly string[]
): boolean {
	const advertised = new Set(model.capabilities)
	return requiredCapabilities.every((capability) => advertised.has(capability))
}
