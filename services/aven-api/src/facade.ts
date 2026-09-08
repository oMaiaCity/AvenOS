import { timingSafeEqual } from 'node:crypto'
import type { IdentityVerifier } from '@avenos/aven-identity'
import {
	IdentityAuthenticationError,
	type IdentityClaims,
	requireIdentity
} from '@avenos/aven-identity'
import { BodyLimitError, readBoundedBytes, readBoundedJson } from '@avenos/http-boundary'
import { ArtifactHandler } from './artifacts/handler.js'
import type { FacadeConfig } from './config.js'
import type { CustomerHandler } from './customers/handler.js'
import type { HostingHandler } from './hosting/handler.js'
import { ArtifactFileService } from './lib/server/artifacts/service.js'
import { AppError } from './lib/server/errors.js'
import type { LlmGatewayService } from './lib/server/llm-gateway.js'

function hasBearer(request: Request, expected: string | undefined): boolean {
	if (!expected) return false
	const actual = Buffer.from(request.headers.get('authorization') ?? '')
	const wanted = Buffer.from(`Bearer ${expected}`)
	return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	})
const hopByHop = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
])

function downstreamFor(pathname: string, config: FacadeConfig) {
	return config.DOWNSTREAMS_JSON.find(
		(entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
	)
}

export function forwardedHeaders(
	request: Request,
	claims: IdentityClaims,
	serviceToken: string,
	identityToken: string,
	tenantGrant?: string
): Headers {
	const headers = new Headers()
	for (const [name, value] of request.headers) {
		const lower = name.toLowerCase()
		if (
			!hopByHop.has(lower) &&
			![
				'authorization',
				'cookie',
				'host',
				'x-aven-identity-token',
				'x-aven-subject',
				'x-aven-role',
				'x-aven-session',
				'x-aven-tenant-grant',
				'x-aven-environment',
				'x-aven-database',
				'x-aven-routing-generation',
				'x-aven-runtime'
			].includes(lower)
		)
			headers.set(name, value)
	}
	headers.set('authorization', `Bearer ${serviceToken}`)
	headers.set('x-aven-identity-token', identityToken)
	headers.set('x-aven-subject', claims.sub)
	headers.set('x-aven-role', claims.role)
	headers.set('x-aven-session', claims.sid)
	if (tenantGrant) headers.set('x-aven-tenant-grant', tenantGrant)
	return headers
}

export function createFacadeHandler(
	config: FacadeConfig,
	verifier: Pick<IdentityVerifier, 'verify'>,
	fetcher: (request: Request) => Promise<Response> = fetch,
	hosting?: HostingHandler,
	customers?: CustomerHandler,
	artifacts?: ArtifactHandler,
	llmGateway?: LlmGatewayService | null
) {
	const runtimeArtifacts = new Map(
		config.CUSTOMER_RUNTIMES_JSON.map((runtime) => {
			const service = ArtifactFileService.fromConfig({
				ARTIFACT_STORE_BASE_URL: runtime.artifactStoreBaseUrl,
				ARTIFACT_STORE_BEARER_TOKEN: runtime.artifactStoreBearerToken
			})
			if (!service) throw new Error('runtime artifact configuration is incomplete')
			return [runtime.id, new ArtifactHandler(service)] as const
		})
	)
	const allowedOrigins = new Set(
		config.CORS_ORIGINS.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	)
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url)
		if (url.pathname === '/health/live') return json(200, { status: 'ok', service: 'aven-api' })
		if (url.pathname.startsWith('/internal/v1/static-sites/'))
			return hosting ? hosting.internal(request) : json(404, { code: 'ROUTE_NOT_FOUND' })
		if (url.pathname === '/internal/v1/customer-entitlement-events')
			return customers ? customers.internal(request) : json(404, { code: 'ROUTE_NOT_FOUND' })
		if (url.pathname === '/internal/v1/llm/models' && request.method === 'GET') {
			if (!hasBearer(request, config.LLM_GATEWAY_ACTOR_RUNNER_BEARER_TOKEN))
				return json(401, { code: 'AUTHENTICATION_REQUIRED' })
			if (!llmGateway)
				return json(503, {
					code: 'LLM_GATEWAY_UNAVAILABLE',
					message: 'The LLM gateway is not configured.'
				})
			return json(200, { models: llmGateway.models(url.searchParams.getAll('capability')) })
		}
		if (url.pathname === '/internal/v1/llm/completions' && request.method === 'POST') {
			if (!hasBearer(request, config.LLM_GATEWAY_ACTOR_RUNNER_BEARER_TOKEN))
				return json(401, { code: 'AUTHENTICATION_REQUIRED' })
			if (!llmGateway)
				return json(503, {
					code: 'LLM_GATEWAY_UNAVAILABLE',
					message: 'The LLM gateway is not configured.'
				})
			try {
				return json(200, await llmGateway.complete(await readBoundedJson(request, 2 * 1024 * 1024)))
			} catch (error) {
				if (error instanceof BodyLimitError) return json(error.status, { code: error.code })
				if (error instanceof AppError)
					return json(error.status, { code: error.code, message: error.message })
				throw error
			}
		}
		if (request.method === 'OPTIONS') {
			const origin = request.headers.get('origin')
			if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403 })
			return new Response(null, {
				status: 204,
				headers: {
					'access-control-allow-origin': origin,
					'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
					'access-control-allow-headers': 'authorization,content-type',
					'access-control-max-age': '600',
					vary: 'Origin'
				}
			})
		}
		try {
			const claims = await requireIdentity(request, verifier)
			if (url.pathname === '/api/llm/models' && request.method === 'GET') {
				if (!llmGateway)
					throw new AppError(503, 'LLM_GATEWAY_UNAVAILABLE', 'The LLM gateway is not configured.')
				return json(200, {
					models: llmGateway.models(url.searchParams.getAll('capability'))
				})
			}
			if (url.pathname === '/api/llm/completions' && request.method === 'POST') {
				if (!llmGateway)
					throw new AppError(503, 'LLM_GATEWAY_UNAVAILABLE', 'The LLM gateway is not configured.')
				return json(200, await llmGateway.complete(await readBoundedJson(request, 2 * 1024 * 1024)))
			}
			if (url.pathname === '/api/llm/v1/chat/completions' && request.method === 'POST') {
				if (!llmGateway)
					throw new AppError(503, 'LLM_GATEWAY_UNAVAILABLE', 'The LLM gateway is not configured.')
				return llmGateway.openAiChatCompletion(await readBoundedJson(request, 2 * 1024 * 1024))
			}
			if (url.pathname === '/api/environments' && request.method === 'GET')
				return customers
					? customers.list(claims)
					: json(404, { code: 'ROUTE_NOT_FOUND', message: 'Environment routes are disabled.' })
			if (url.pathname === '/api/sites' || url.pathname.startsWith('/api/sites/'))
				return hosting
					? hosting.user(request, claims)
					: json(404, { code: 'ROUTE_NOT_FOUND', message: 'The site route does not exist.' })
			const customerMatch = url.pathname.match(
				/^\/api\/environments\/([0-9a-f-]{36})\/([a-z][a-z0-9-]{1,40})(\/.*)?$/
			)
			if (customerMatch) {
				const targetConfig = config.CUSTOMER_DOWNSTREAMS_JSON.find(
					(target) => target.segment === customerMatch[2]
				)
				if (!customers || !targetConfig)
					return json(404, {
						code: 'ROUTE_NOT_FOUND',
						message: 'The customer route does not exist.'
					})
				if (!targetConfig.roles.includes(claims.role))
					return json(403, {
						code: 'AUTHORIZATION_DENIED',
						message: 'The authenticated principal cannot use this route.'
					})
				const action = ['GET', 'HEAD'].includes(request.method)
					? targetConfig.readAction
					: request.method === 'DELETE' && targetConfig.deleteAction
						? targetConfig.deleteAction
						: (customerMatch[3] ?? '').endsWith('/merge') && targetConfig.mergeAction
							? targetConfig.mergeAction
							: targetConfig.writeAction
				const grant = await customers.grant({
					claims,
					environmentId: customerMatch[1],
					componentRef: targetConfig.componentRef,
					actions: [action]
				})
				const runtime = config.CUSTOMER_RUNTIMES_JSON.find((entry) => entry.id === grant.runtimeId)
				const destination =
					runtime?.targets.find((entry) => entry.segment === customerMatch[2]) ??
					(grant.runtimeId === 'primary' && !runtime ? targetConfig : undefined)
				if (!destination || destination.componentRef !== targetConfig.componentRef)
					throw new AppError(
						503,
						'CUSTOMER_RUNTIME_UNAVAILABLE',
						'The customer system is unavailable.'
					)
				const artifactHandler =
					runtimeArtifacts.get(grant.runtimeId) ??
					(grant.runtimeId === 'primary' && !runtime ? artifacts : undefined)
				if (customerMatch[2] === 'artifacts') {
					if (!artifactHandler)
						throw new AppError(
							503,
							'CUSTOMER_RUNTIME_UNAVAILABLE',
							'The customer system is unavailable.'
						)
					return artifactHandler.user(request, claims, grant.claims, customerMatch[3] ?? '')
				}
				const identityToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
				const suffix = customerMatch[3] ?? ''
				const targetPath = `${destination.targetPrefix.replace(/\/$/, '')}${suffix || ''}${url.search}`
				const target = new URL(targetPath, destination.baseUrl)
				const body = ['GET', 'HEAD'].includes(request.method)
					? undefined
					: await readBoundedBytes(
							request,
							customerMatch[2] === 'intents' ? 256 * 1024 : 1024 * 1024
						)
				const response = await fetcher(
					new Request(target, {
						method: request.method,
						headers: forwardedHeaders(
							request,
							claims,
							destination.bearerToken,
							identityToken,
							grant.token
						),
						body,
						redirect: 'manual'
					})
				)
				const headers = new Headers(response.headers)
				for (const name of hopByHop) headers.delete(name)
				headers.set('cache-control', 'no-store')
				const origin = request.headers.get('origin')
				if (origin && allowedOrigins.has(origin)) {
					headers.set('access-control-allow-origin', origin)
					headers.append('vary', 'Origin')
				}
				return new Response(response.body, { status: response.status, headers })
			}

			const downstream = downstreamFor(url.pathname, config)
			if (!downstream)
				return json(404, { code: 'ROUTE_NOT_FOUND', message: 'The facade route does not exist.' })
			if (!downstream.roles.includes(claims.role))
				return json(403, {
					code: 'AUTHORIZATION_DENIED',
					message: 'The authenticated principal cannot use this route.'
				})
			const identityToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
			const suffix = url.pathname.slice(downstream.prefix.length)
			const targetPath = `${downstream.targetPrefix.replace(/\/$/, '')}${suffix || '/'}${url.search}`
			const target = new URL(targetPath, downstream.baseUrl)
			const body = ['GET', 'HEAD'].includes(request.method)
				? undefined
				: await readBoundedBytes(request, 1024 * 1024)
			const response = await fetcher(
				new Request(target, {
					method: request.method,
					headers: forwardedHeaders(request, claims, downstream.bearerToken, identityToken),
					body,
					redirect: 'manual'
				})
			)
			const headers = new Headers(response.headers)
			for (const name of hopByHop) headers.delete(name)
			headers.set('cache-control', 'no-store')
			const origin = request.headers.get('origin')
			if (origin && allowedOrigins.has(origin)) {
				headers.set('access-control-allow-origin', origin)
				headers.append('vary', 'Origin')
			}
			return new Response(response.body, { status: response.status, headers })
		} catch (error) {
			if (error instanceof BodyLimitError) return json(error.status, { code: error.code })
			if (error instanceof AppError)
				return json(error.status, { code: error.code, message: error.message })
			if (error instanceof IdentityAuthenticationError)
				return json(401, { code: 'AUTHENTICATION_REQUIRED', message: error.message })
			const customerFailure = customers?.failure(error)
			if (customerFailure) return customerFailure
			return json(502, {
				code: 'DOWNSTREAM_UNAVAILABLE',
				message: 'The requested service is unavailable.'
			})
		}
	}
}
