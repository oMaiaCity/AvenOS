import { randomUUID } from 'node:crypto'
import { facadeConfigSchema } from '../../services/aven-api/src/config'
import { LlmGatewayService } from '../../services/aven-api/src/lib/server/llm-gateway'

// Opt-in provider proof. Only repository fixtures are submitted; production provider
// translation, request limits, structured output and provenance remain unchanged.
const baseUrl = process.env.TEST_DOCUMENT_PROVIDER_BASE_URL
const model = process.env.TEST_DOCUMENT_PROVIDER_MODEL
if (!baseUrl || !model)
	throw new Error('Set TEST_DOCUMENT_PROVIDER_BASE_URL and TEST_DOCUMENT_PROVIDER_MODEL.')
const credential = process.env.TEST_DOCUMENT_PROVIDER_TOKEN
const corpus = process.env.TEST_DOCUMENT_CORPUS ?? 'reviewed'
if (!['reviewed', 'market', 'public'].includes(corpus)) throw new Error('Unknown document corpus.')
const testFile =
	corpus === 'market'
		? 'market-provider.e2e.test.ts'
		: corpus === 'public'
			? 'public-corpus.e2e.test.ts'
			: 'provider-golden.e2e.test.ts'
const suiteBudgetSeconds = corpus === 'market' && !process.env.TEST_DOCUMENT_CASE ? 1590 : 270
const service = LlmGatewayService.fromConfig(
	facadeConfigSchema.parse({
		DATABASE_URL: 'postgres://unused:unused@localhost/unused',
		SITE_HOST_DIRECTORY_BEARER_TOKEN: 'unused'.repeat(8),
		CUSTOMER_ENTITLEMENT_TOKEN: 'unused'.repeat(8),
		TENANT_GRANT_PRIVATE_KEY: 'unused'.repeat(20),
		LLM_GATEWAY_ENABLED: 'true',
		LLM_GATEWAY_ALLOW_INSECURE_HTTP: String(new URL(baseUrl).protocol === 'http:'),
		LLM_GATEWAY_TIMEOUT_SECONDS: 45,
		LLM_GATEWAY_CREDENTIALS_JSON: JSON.stringify(credential ? { fixture: credential } : {}),
		LLM_GATEWAY_MODELS_JSON: JSON.stringify([
			{
				id: 'provider-golden',
				label: 'Explicitly selected test provider',
				capabilities: ['text-generation', 'vision', 'structured-output'],
				baseUrl,
				upstreamModel: model,
				profile: process.env.TEST_DOCUMENT_PROVIDER_PROFILE ?? 'openai-json-schema',
				authMode: credential ? 'bearer' : 'none',
				...(credential && { credentialId: 'fixture' })
			}
		])
	}),
	async (input, init) => {
		const started = Date.now()
		const response = await fetch(input, init)
		const raw = await response
			.clone()
			.json()
			.catch(() => null)
		const choice = raw?.choices?.[0]
		console.info(
			'[provider-golden response]',
			JSON.stringify({
				status: response.status,
				milliseconds: Date.now() - started,
				finishReason: choice?.finish_reason,
				usage: raw?.usage,
				contentCharacters: choice?.message?.content?.length,
				toolCalls: choice?.message?.tool_calls?.length
			})
		)
		return response
	}
)!
const token = randomUUID()
const server = Bun.serve({
	hostname: '127.0.0.1',
	port: 0,
	idleTimeout: 60,
	async fetch(request) {
		if (request.headers.get('authorization') !== `Bearer ${token}`)
			return new Response(null, { status: 401 })
		const url = new URL(request.url)
		if (request.method === 'GET' && url.pathname === '/models')
			return Response.json({ models: service.models(url.searchParams.getAll('capability')) })
		if (request.method !== 'POST' || url.pathname !== '/completions')
			return new Response(null, { status: 404 })
		try {
			return Response.json(await service.complete(await request.json()))
		} catch (error) {
			console.error('[provider-golden gateway]', error instanceof Error ? error.message : error)
			return Response.json(
				{ error: 'Provider request failed; see gateway diagnostics.' },
				{ status: 502 }
			)
		}
	}
})
const child = Bun.spawn(
	[
		'node',
		new URL('../../libs/aven-document-ingest/node_modules/vitest/vitest.mjs', import.meta.url)
			.pathname,
		'run',
		`tests/${testFile}`,
		'--reporter=verbose',
		'--bail=1'
	],
	{
		detached: true,
		cwd: new URL('../../libs/aven-document-ingest', import.meta.url).pathname,
		env: {
			...process.env,
			REQUIRE_DOCUMENT_PROVIDER_GOLDEN: 'true',
			TEST_DOCUMENT_LLM_BASE_URL: server.url.toString().replace(/\/$/, ''),
			TEST_DOCUMENT_LLM_BEARER_TOKEN: token,
			TEST_DOCUMENT_MODEL_ID: 'provider-golden',
			TRACE_DOCUMENT_PROVIDER_GOLDEN: 'true'
		},
		stdout: 'inherit',
		stderr: 'inherit'
	}
)
const deadline = setTimeout(() => {
	console.error(`Provider golden suite exceeded its ${suiteBudgetSeconds}-second budget.`)
	stopChild('SIGKILL')
}, suiteBudgetSeconds * 1000)
function stopChild(signal: NodeJS.Signals) {
	try {
		process.kill(-child.pid, signal)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
	}
}
const interrupted = () => {
	stopChild('SIGTERM')
	server.stop(true)
}
process.once('SIGINT', interrupted)
process.once('SIGTERM', interrupted)
try {
	process.exitCode = await child.exited
} finally {
	clearTimeout(deadline)
	stopChild('SIGTERM')
	server.stop(true)
}
