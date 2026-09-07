export function e2eModelCatalog(env: Record<string, string | undefined>) {
	const baseUrl = env.TEST_DOCUMENT_PROVIDER_BASE_URL
	const model = env.TEST_DOCUMENT_PROVIDER_MODEL
	if (Boolean(baseUrl) !== Boolean(model))
		throw new Error('Live E2E OCR requires both the provider base URL and exact model ID.')
	if (baseUrl) {
		const url = new URL(baseUrl)
		if (
			!['http:', 'https:'].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw new Error('Use an HTTP(S) provider base URL without credentials, query or fragment.')
		if (!/^\S+$/.test(model!)) throw new Error('The provider model ID must not contain whitespace.')
	}
	const profile = env.TEST_DOCUMENT_PROVIDER_PROFILE ?? 'openai-json-schema'
	if (!['openai-json-schema', 'openai-tools', 'qwen-tools', 'generic-json'].includes(profile))
		throw new Error('Unsupported document provider profile.')
	return [
		{
			id: 'deepseek/deepseek-v4-flash-0731',
			label: 'E2E Chat',
			capabilities: ['text-generation', 'streaming', 'tool-calling'],
			baseUrl: 'http://llm-mock:8090/v1',
			upstreamModel: 'e2e-chat',
			profile: 'generic-json',
			authMode: 'none'
		},
		{
			id: 'e2e/document',
			label: 'E2E Documents',
			capabilities: ['text-generation', 'vision', 'structured-output'],
			baseUrl: baseUrl ?? 'http://llm-mock:8090/v1',
			upstreamModel: model ?? 'e2e-document',
			profile: baseUrl ? profile : 'openai-json-schema',
			authMode: 'none',
			timeoutSeconds: 45
		}
	]
}

if (import.meta.main) console.log(JSON.stringify(e2eModelCatalog(process.env)))
