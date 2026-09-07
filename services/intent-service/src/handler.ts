import type { TenantGrantClaims, TenantGrantKey } from '@avenos/aven-customer-contracts'
import { admitCustomerRequest, CustomerAdmissionError } from '@avenos/aven-customer-runtime'
import type { IdentityVerifier } from '@avenos/aven-identity'
import { BodyLimitError, readBoundedText } from '@avenos/http-boundary'
import { z } from 'zod'
import type { IntentServiceConfig } from './config.js'
import {
	IntentConflictError,
	IntentNotFoundError,
	type IntentStore,
	type MergeCommand,
	type UpdateIntent,
	type VersionCommand
} from './store.js'

const uuid = z.uuid()
const createSchema = z
	.object({
		id: uuid,
		title: z.string().trim().min(1).max(512),
		intentType: z.string().trim().min(1).max(128).default('intent'),
		sourceLabel: z.string().trim().min(1).max(256).default('Conversation'),
		deadline: z.string().trim().min(1).max(128).nullable().default(null),
		routingSummary: z.string().trim().min(1).max(1024).optional()
	})
	.strict()
const contributionSchema = z
	.object({
		id: uuid,
		contributorKind: z.enum(['human', 'agent']),
		kind: z.string().trim().min(1).max(64),
		text: z.string().max(100_000).nullable(),
		payload: z.record(z.string(), z.unknown()).default({})
	})
	.strict()
	.refine((input) => Buffer.byteLength(JSON.stringify(input.payload)) <= 64 * 1024, {
		message: 'payload must not exceed 64 KiB'
	})
const updateSchema = z
	.object({
		expectedVersion: z.number().int().positive(),
		title: z.string().trim().min(1).max(512).optional(),
		intentType: z.string().trim().min(1).max(128).optional(),
		sourceLabel: z.string().trim().min(1).max(256).optional(),
		deadline: z.string().trim().min(1).max(128).optional(),
		clearDeadline: z.boolean().default(false),
		routingSummary: z.string().trim().min(1).max(1024).optional(),
		state: z.enum(['working', 'waiting', 'done', 'error']).optional()
	})
	.strict()
	.refine(
		(input) =>
			input.title !== undefined ||
			input.intentType !== undefined ||
			input.sourceLabel !== undefined ||
			input.deadline !== undefined ||
			input.clearDeadline ||
			input.routingSummary !== undefined ||
			input.state !== undefined,
		{ message: 'at least one intent field must change' }
	)
const versionSchema = z.object({ id: uuid, expectedVersion: z.number().int().positive() }).strict()
const mergeSchema = versionSchema
	.extend({
		commandId: uuid,
		sources: z
			.array(z.object({ id: uuid, expectedVersion: z.number().int().positive() }).strict())
			.min(1)
			.max(100)
	})
	.strict()

type Store = Pick<
	IntentStore,
	| 'append'
	| 'archiveOrRestore'
	| 'create'
	| 'detail'
	| 'list'
	| 'merge'
	| 'ready'
	| 'tombstone'
	| 'update'
>

function json(status: number, value: unknown): Response {
	return Response.json(value, {
		status,
		headers: { 'cache-control': 'no-store' }
	})
}

function problem(status: number, code: string, message: string): Response {
	return json(status, { code, message })
}

async function requestJson(request: Request): Promise<unknown> {
	const text = await readBoundedText(request, 256 * 1024)
	try {
		return JSON.parse(text)
	} catch {
		throw new IntentInputError('Request body must be valid JSON.')
	}
}

class IntentInputError extends Error {}

function actionFor(request: Request, pathname: string): string {
	if (request.method === 'GET') return 'intents:read'
	if (request.method === 'DELETE') return 'intents:delete'
	if (pathname.endsWith('/merge')) return 'intents:merge'
	return 'intents:write'
}

interface StoreProvider {
	forGrant(grant: TenantGrantClaims): Promise<Store>
}

export function createIntentHandler(
	config: Pick<IntentServiceConfig, 'INTENT_SERVICE_BEARER_TOKEN' | 'TENANT_GRANT_ISSUER'>,
	verifier: Pick<IdentityVerifier, 'verify'>,
	tenantGrantPublicKey: TenantGrantKey,
	stores: StoreProvider,
	logError: (error: unknown) => void = () => {}
) {
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url)
		const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
		if (request.method === 'GET' && pathname === '/health/live')
			return json(200, { status: 'ok', service: 'intent-service' })
		if (request.method === 'GET' && pathname === '/health/ready') {
			return json(200, { status: 'ready', service: 'intent-service' })
		}

		try {
			const admitted = await admitCustomerRequest(request, {
				serviceToken: config.INTENT_SERVICE_BEARER_TOKEN,
				identityVerifier: verifier,
				tenantGrantPublicKey,
				tenantGrantIssuer: config.TENANT_GRANT_ISSUER,
				componentRef: 'ceo.aven:component:data:intents@1',
				requiredAction: actionFor(request, pathname)
			})
			const claims = admitted.identity
			const store = await stores.forGrant(admitted.tenant)
			await store.ready()
			if (pathname === '/api/intents') {
				if (request.method === 'GET') return json(200, await store.list(claims.sub))
				if (request.method === 'POST') {
					const input = createSchema.parse(await requestJson(request))
					return json(201, await store.create(claims.sub, input))
				}
			}

			const lifecycle = pathname.match(/^\/api\/intents\/([0-9a-f-]+)\/(archive|restore|merge)$/i)
			if (lifecycle && request.method === 'POST') {
				const intentId = uuid.parse(lifecycle[1])
				const action = lifecycle[2]
				if (action === 'merge') {
					const input = mergeSchema.parse(await requestJson(request)) as MergeCommand
					return json(200, await store.merge(claims.sub, intentId, input))
				}
				const input = versionSchema.parse(await requestJson(request)) as VersionCommand
				return json(
					200,
					await store.archiveOrRestore(claims.sub, intentId, input, action === 'restore')
				)
			}

			const detail = pathname.match(/^\/api\/intents\/([0-9a-f-]+)$/i)
			if (detail) {
				const intentId = uuid.parse(detail[1])
				if (request.method === 'GET') return json(200, await store.detail(claims.sub, intentId))
				if (request.method === 'POST') {
					const input = contributionSchema.parse(await requestJson(request))
					return json(201, await store.append(claims.sub, intentId, input))
				}
				if (request.method === 'PATCH') {
					const input = updateSchema.parse(await requestJson(request)) as UpdateIntent
					return json(200, await store.update(claims.sub, intentId, input))
				}
				if (request.method === 'DELETE') {
					const input = versionSchema.parse(await requestJson(request)) as VersionCommand
					await store.tombstone(claims.sub, intentId, input)
					return new Response(null, { status: 204 })
				}
			}
			return problem(404, 'ROUTE_NOT_FOUND', 'The intent route does not exist.')
		} catch (error) {
			if (error instanceof BodyLimitError) return problem(error.status, error.code, error.message)
			if (error instanceof CustomerAdmissionError)
				return problem(401, 'AUTHENTICATION_REQUIRED', 'Intent authentication failed.')
			if (error instanceof IntentNotFoundError)
				return problem(404, 'INTENT_NOT_FOUND', 'The requested intent does not exist.')
			if (error instanceof IntentConflictError)
				return problem(409, 'INTENT_VERSION_CONFLICT', error.message)
			if (error instanceof IntentInputError || error instanceof z.ZodError)
				return problem(400, 'INTENT_INPUT_INVALID', 'The intent request is invalid.')
			logError(error)
			return problem(500, 'INTENT_UNAVAILABLE', 'Intent state is unavailable.')
		}
	}
}
