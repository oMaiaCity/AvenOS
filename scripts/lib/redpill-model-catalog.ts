const REDPILL_BASE_URL = 'https://tee.redpill.ai/v1'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: []
}

function modalities(model: JsonRecord, key: 'input_modalities' | 'output_modalities'): string[] {
	const direct = strings(model[key])
	return direct.length > 0 ? direct : strings(record(model.architecture)[key])
}

function hostedByPhala(model: JsonRecord): boolean {
	return strings(model.providers).some((provider) => provider.toLowerCase() === 'phala')
}

function capabilities(model: JsonRecord): string[] {
	const features = new Set(strings(model.supported_features).map((value) => value.toLowerCase()))
	const parameters = new Set(
		strings(model.supported_parameters).map((value) => value.toLowerCase())
	)
	const result = ['text-generation']
	if (modalities(model, 'input_modalities').includes('image')) result.push('vision')
	if (
		features.has('structured_outputs') ||
		features.has('structured-output') ||
		parameters.has('response_format')
	)
		result.push('structured-output')
	// RedPill's chat-completion endpoint supports streaming for its chat catalog.
	result.push('streaming')
	if (features.has('tools') || parameters.has('tools')) result.push('tool-calling')
	return result
}

function profileFor(
	modelCapabilities: string[]
): 'openai-tools' | 'openai-json-schema' | 'generic-json' {
	if (modelCapabilities.includes('tool-calling')) return 'openai-tools'
	if (modelCapabilities.includes('structured-output')) return 'openai-json-schema'
	return 'generic-json'
}

export interface GatewayModel {
	id: string
	label: string
	capabilities: string[]
	baseUrl: string
	upstreamModel: string
	profile: 'openai-tools' | 'openai-json-schema' | 'generic-json'
	authMode: 'bearer'
	credentialId: 'redpill'
	requestHeaders: { 'x-redpill-provider': 'phala' }
}

export function redpillPhalaCatalog(payload: unknown): GatewayModel[] {
	const data = record(payload).data
	if (!Array.isArray(data)) throw new Error('RedPill model response must contain a data array.')
	const catalog = data.flatMap((entry): GatewayModel[] => {
		const model = record(entry)
		const id = typeof model.id === 'string' ? model.id : ''
		const label = typeof model.name === 'string' ? model.name.trim() : id
		if (!id || !label || !hostedByPhala(model)) return []
		const outputs = modalities(model, 'output_modalities')
		if (outputs.length > 0 && !outputs.includes('text')) return []
		const modelCapabilities = capabilities(model)
		return [
			{
				id,
				label,
				capabilities: modelCapabilities,
				baseUrl: REDPILL_BASE_URL,
				upstreamModel: id,
				profile: profileFor(modelCapabilities),
				authMode: 'bearer',
				credentialId: 'redpill',
				requestHeaders: { 'x-redpill-provider': 'phala' }
			}
		]
	})
	catalog.sort(
		(left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
	)
	if (catalog.length === 0)
		throw new Error('The RedPill catalog contains no Phala-hosted chat models.')
	return catalog
}

export async function fetchRedpillPhalaCatalog(
	fetcher: typeof fetch = fetch,
	apiKey?: string
): Promise<GatewayModel[]> {
	const response = await fetcher('https://api.redpill.ai/v1/models', {
		headers: {
			accept: 'application/json',
			...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
		},
		redirect: 'error',
		signal: AbortSignal.timeout(15_000)
	})
	if (!response.ok) throw new Error(`RedPill model catalog returned HTTP ${response.status}.`)
	return redpillPhalaCatalog(await response.json())
}
