const publicChatModelId = 'deepseek/deepseek-v4-flash-0731'
const publicDesignModelId = 'moonshotai/kimi-k3'

export interface LocalLlmEnvironment {
	LOCAL_LLM_MODEL?: string
	LOCAL_LLM_LABEL?: string
	LOCAL_LLM_BASE_URL?: string
	LOCAL_LLM_VISION?: string
}

function required(value: string | undefined, name: string): string {
	const normalized = value?.trim()
	if (!normalized) throw new Error(`${name} is required.`)
	return normalized
}

function boolean(value: string | undefined, name: string): boolean {
	if (value === undefined || value === '') return false
	if (value === 'true') return true
	if (value === 'false') return false
	throw new Error(`${name} must be true or false.`)
}

/**
 * Maps the stable model ids used by the desktop application onto one local
 * OpenAI-compatible model. The catalog describes capabilities rather than a
 * specific server, so LM Studio, llama.cpp, vLLM, and compatible runtimes can
 * share the same local-stack seam.
 */
export function localLlmCatalog(environment: LocalLlmEnvironment): unknown[] {
	const upstreamModel = required(environment.LOCAL_LLM_MODEL, 'LOCAL_LLM_MODEL')
	const label = environment.LOCAL_LLM_LABEL?.trim() || `Local ${upstreamModel}`
	const baseUrl = environment.LOCAL_LLM_BASE_URL?.trim() || 'http://host.docker.internal:1234/v1'
	const parsedBaseUrl = new URL(baseUrl)
	if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
		throw new Error('LOCAL_LLM_BASE_URL must use HTTP or HTTPS.')
	}
	if (
		parsedBaseUrl.username ||
		parsedBaseUrl.password ||
		parsedBaseUrl.search ||
		parsedBaseUrl.hash
	) {
		throw new Error('LOCAL_LLM_BASE_URL cannot contain credentials, a query, or a fragment.')
	}
	const vision = boolean(environment.LOCAL_LLM_VISION, 'LOCAL_LLM_VISION')
	const profile = /(?:^|[/_-])qwen(?:[\d./_-]|$)/i.test(upstreamModel)
		? 'qwen-tools'
		: 'generic-json'
	const shared = {
		baseUrl,
		upstreamModel,
		profile,
		authMode: 'none'
	}
	const chatCapabilities = ['text-generation', 'streaming', 'tool-calling']
	if (vision) chatCapabilities.push('vision', 'structured-output')

	return [
		{
			id: publicChatModelId,
			label: `${label} (chat)`,
			capabilities: chatCapabilities,
			...shared
		},
		{
			id: publicDesignModelId,
			label: `${label} (design)`,
			capabilities: ['text-generation', 'streaming', 'tool-calling', 'structured-output'],
			...shared
		}
	]
}

if (import.meta.main) console.log(JSON.stringify(localLlmCatalog(process.env)))
