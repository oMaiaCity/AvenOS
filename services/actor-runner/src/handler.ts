import type {
	PlanRunContinuationSubmission,
	PlanRunner,
	PlanRunRecord,
	PlanRunSecurityContext
} from '@avenos/actors/run'
import type { TenantGrantClaims, TenantGrantKey } from '@avenos/aven-customer-contracts'
import { admitCustomerRequest, CustomerAdmissionError } from '@avenos/aven-customer-runtime'
import type { IdentityVerifier } from '@avenos/aven-identity'
import { BodyLimitError, readBoundedBytes } from '@avenos/http-boundary'
import { ZodError } from 'zod'
import { parsePlanRunStartCommand } from './command.js'

const json = (status: number, body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	})

const MAX_COMMAND_BYTES = 1024 * 1024

class ActorRunHttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message)
	}
}

async function readJson(request: Request): Promise<unknown> {
	const declared = Number(request.headers.get('content-length') ?? 0)
	if (Number.isFinite(declared) && declared > MAX_COMMAND_BYTES) {
		throw new ActorRunHttpError(413, 'COMMAND_TOO_LARGE', 'The actor run command is too large.')
	}
	const bytes = await readBoundedBytes(request, MAX_COMMAND_BYTES)
	if (bytes.byteLength > MAX_COMMAND_BYTES) {
		throw new ActorRunHttpError(413, 'COMMAND_TOO_LARGE', 'The actor run command is too large.')
	}
	return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function parseContinuationSubmission(value: unknown): PlanRunContinuationSubmission {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new ActorRunHttpError(400, 'COMMAND_INVALID', 'The continuation command is invalid.')
	}
	const input = value as Record<string, unknown>
	if (
		typeof input.requestId !== 'string' ||
		input.requestId.length < 1 ||
		typeof input.continuationId !== 'string' ||
		input.continuationId.length < 1
	) {
		throw new ActorRunHttpError(400, 'COMMAND_INVALID', 'Continuation identifiers are required.')
	}
	if (input.action === 'postpone') {
		if (!onlyKeys(input, ['requestId', 'continuationId', 'action'])) {
			throw new ActorRunHttpError(400, 'COMMAND_INVALID', 'The postpone command is invalid.')
		}
		return {
			requestId: input.requestId,
			continuationId: input.continuationId,
			action: 'postpone'
		}
	}
	if (
		input.action !== 'submit' ||
		!['input', 'secret', 'approval', 'assurance'].includes(String(input.kind)) ||
		!Object.hasOwn(input, 'value') ||
		!onlyKeys(input, ['requestId', 'continuationId', 'action', 'kind', 'value'])
	) {
		throw new ActorRunHttpError(400, 'COMMAND_INVALID', 'The submission command is invalid.')
	}
	return {
		requestId: input.requestId,
		continuationId: input.continuationId,
		action: 'submit',
		kind: input.kind as 'input' | 'secret' | 'approval' | 'assurance',
		value: input.value
	}
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	const keys = new Set(allowed)
	return Object.keys(value).every((key) => keys.has(key))
}

function visible(record: PlanRunRecord | null, subjectId: string): PlanRunRecord | null {
	return record?.security.principal.subjectId === subjectId ? record : null
}

interface RunnerProvider {
	forGrant(grant: TenantGrantClaims): Promise<PlanRunner>
}

export function createActorRunnerHandler(
	runners: RunnerProvider,
	verifier: Pick<IdentityVerifier, 'verify'>,
	config: {
		serviceToken: string
		tenantGrantIssuer: string
		tenantGrantPublicKey: TenantGrantKey
	}
) {
	if (config.serviceToken.length < 32)
		throw new Error('runner service token must contain at least 32 bytes')
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url)
		if (request.method === 'GET' && ['/health/live', '/health/ready'].includes(url.pathname)) {
			return json(200, { status: 'ok', service: 'actor-runner', authority: 'os.aven' })
		}
		try {
			const admitted = await admitCustomerRequest(request, {
				serviceToken: config.serviceToken,
				identityVerifier: verifier,
				tenantGrantPublicKey: config.tenantGrantPublicKey,
				tenantGrantIssuer: config.tenantGrantIssuer,
				componentRef: 'os.aven:component:actors:run-repository@1',
				requiredAction: ['GET', 'HEAD'].includes(request.method)
					? 'actor-runs:read'
					: 'actor-runs:write'
			})
			const claims = admitted.identity
			const runner = await runners.forGrant(admitted.tenant)
			const security: PlanRunSecurityContext = {
				principal: {
					subjectId: claims.sub,
					kind: 'user',
					assurance: [...claims.amr],
					sessionId: claims.sid
				},
				access: { tenantId: admitted.tenant.environmentId },
				establishedBy: 'api.aven.ceo/actor-runner-boundary',
				authorizedAt: new Date().toISOString()
			}
			const segments = url.pathname.replace(/\/$/, '').split('/').filter(Boolean)
			if (segments[0] !== 'api' || segments[1] !== 'actor-runs') {
				return json(404, { code: 'ROUTE_NOT_FOUND' })
			}
			if (segments.length === 2 && request.method === 'POST') {
				const command = parsePlanRunStartCommand(await readJson(request))
				const handle = await runner.start(
					{ ...command, security },
					{ session: { identityToken: admitted.identityToken, sessionId: claims.sid } }
				)
				return json(202, handle)
			}
			const runId = segments[2]
			if (!runId) return json(404, { code: 'ROUTE_NOT_FOUND' })
			const record = visible(await runner.status(runId), claims.sub)
			if (!record) return json(404, { code: 'RUN_NOT_FOUND' })
			if (segments.length === 3 && request.method === 'GET') return json(200, record)
			if (segments[3] === 'events' && segments.length === 4 && request.method === 'GET') {
				return new Response(
					`id: ${record.revision}\nevent: run\ndata: ${JSON.stringify(record)}\n\n`,
					{
						status: 200,
						headers: {
							'content-type': 'text/event-stream',
							'cache-control': 'no-store'
						}
					}
				)
			}
			if (segments[3] === 'cancel' && segments.length === 4 && request.method === 'POST') {
				const body = (await readJson(request)) as { requestId?: unknown }
				if (typeof body.requestId !== 'string' || body.requestId.length < 1) {
					return json(400, { code: 'COMMAND_INVALID', message: 'requestId is required.' })
				}
				return json(202, await runner.cancel(runId, body.requestId))
			}
			if (segments[3] === 'continuations' && segments.length === 5 && request.method === 'POST') {
				const submission = parseContinuationSubmission(await readJson(request))
				if (submission.continuationId !== segments[4]) {
					return json(400, { code: 'COMMAND_INVALID', message: 'continuation ID mismatch.' })
				}
				return json(
					202,
					await runner.resume(runId, submission, {
						session: { identityToken: admitted.identityToken, sessionId: claims.sid }
					})
				)
			}
			return json(404, { code: 'ROUTE_NOT_FOUND' })
		} catch (error) {
			if (error instanceof BodyLimitError) return json(error.status, { code: error.code })
			if (error instanceof ActorRunHttpError) {
				return json(error.status, { code: error.code, message: error.message })
			}
			if (error instanceof CustomerAdmissionError) {
				return json(401, { code: 'AUTHENTICATION_REQUIRED', message: error.message })
			}
			if (error instanceof ZodError) {
				return json(400, { code: 'COMMAND_INVALID', message: 'The actor run command is invalid.' })
			}
			if (error instanceof SyntaxError) {
				return json(400, {
					code: 'COMMAND_INVALID',
					message: 'The request body is not valid JSON.'
				})
			}
			return json(409, {
				code: 'RUN_COMMAND_REJECTED',
				message: error instanceof Error ? error.message : 'The actor run command was rejected.'
			})
		}
	}
}
