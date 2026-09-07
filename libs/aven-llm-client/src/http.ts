import type {
	LlmCompletionRequest,
	LlmCompletionResponse,
	LlmGatewayClient,
	LlmModelDescriptor
} from './index'

export interface HttpLlmGatewayClientOptions {
	baseUrl: string
	bearerToken: string | (() => string | Promise<string>)
	fetch?: typeof fetch
}

/** Service-authenticated transport for headless LLM gateway consumers. */
export class HttpLlmGatewayClient implements LlmGatewayClient {
	readonly #baseUrl: string
	readonly #bearerToken: HttpLlmGatewayClientOptions['bearerToken']
	readonly #fetch: typeof fetch

	constructor(options: HttpLlmGatewayClientOptions) {
		this.#baseUrl = options.baseUrl.replace(/\/$/, '')
		this.#bearerToken = options.bearerToken
		this.#fetch = options.fetch ?? fetch
	}

	async discover(requiredCapabilities: string[]): Promise<LlmModelDescriptor[]> {
		const url = new URL(`${this.#baseUrl}/models`)
		for (const capability of requiredCapabilities) url.searchParams.append('capability', capability)
		const body = await this.#request(url, { method: 'GET' })
		if (
			!body ||
			typeof body !== 'object' ||
			!Array.isArray((body as { models?: unknown }).models)
		) {
			throw new Error('LLM gateway returned an invalid model catalog')
		}
		return (body as { models: LlmModelDescriptor[] }).models
	}

	async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
		return (await this.#request(new URL(`${this.#baseUrl}/completions`), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(request)
		})) as LlmCompletionResponse
	}

	async #request(url: URL, init: RequestInit): Promise<unknown> {
		const token =
			typeof this.#bearerToken === 'function' ? await this.#bearerToken() : this.#bearerToken
		const headers = new Headers(init.headers)
		headers.set('authorization', `Bearer ${token}`)
		const response = await this.#fetch(new Request(url, { ...init, headers }))
		if (!response.ok) {
			throw new Error(`LLM gateway request failed with status ${response.status}`)
		}
		return response.json()
	}
}
