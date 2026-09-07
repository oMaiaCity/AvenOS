import type { TenantGrantClaims } from '@avenos/aven-customer-contracts'
import type { IdentityClaims } from '@avenos/aven-identity'
import { readBoundedBytes } from '@avenos/http-boundary'
import { z } from 'zod'
import {
	type ArtifactFileService,
	MAX_ARTIFACT_FILE_BYTES,
	type PublishClientRunInput
} from '../lib/server/artifacts/service.js'
import { AppError } from '../lib/server/errors.js'

const uuid = z.uuid()
const observedAt = z.iso.datetime()
const executionEnvironment = z.enum(['local', 'server'])
const MAX_CLIENT_RUN_BYTES = 36 * 1024 * 1024

const json = (status: number, body: unknown) =>
	Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function required(request: Request, name: string): string {
	const value = request.headers.get(name)
	if (!value) throw new AppError(400, 'ARTIFACT_HEADER_MISSING', `${name} is required.`)
	return value
}

function originalName(request: Request): string {
	const encoded = required(request, 'x-aven-original-name')
	let value: string
	try {
		value = Buffer.from(encoded, 'base64url').toString('utf8')
	} catch {
		throw new AppError(400, 'ARTIFACT_NAME_INVALID', 'The artifact filename is invalid.')
	}
	if (
		!value ||
		Buffer.byteLength(value) > 512 ||
		Buffer.from(value).toString('base64url') !== encoded
	)
		throw new AppError(400, 'ARTIFACT_NAME_INVALID', 'The artifact filename is invalid.')
	return value
}

function mediaTypeFor(envelope: Record<string, unknown>): string {
	const payload = envelope.payload
	if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
		const declared = (payload as Record<string, unknown>).declaredMediaType
		if (typeof declared === 'string' && declared.length <= 255) return declared
	}
	return envelope.typeKey === 'docs.extracted-text'
		? 'text/plain; charset=utf-8'
		: 'application/octet-stream'
}

export class ArtifactHandler {
	constructor(private readonly service: ArtifactFileService) {}

	async user(
		request: Request,
		identity: IdentityClaims,
		tenant: Omit<TenantGrantClaims, 'iat' | 'exp'>,
		suffix: string
	): Promise<Response> {
		try {
			const segments = suffix.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean)
			if (segments[0] === 'query' && segments.length === 1 && request.method === 'GET') {
				const query = z
					.object({
						typeKey: z.string().min(1).max(128),
						snapshotSequence: z.coerce.number().int().nonnegative().optional(),
						after: uuid.optional(),
						limit: z.coerce.number().int().min(1).max(128).optional()
					})
					.strict()
					.parse(Object.fromEntries(new URL(request.url).searchParams))
				return json(
					200,
					await this.service.queryArtifacts(
						tenant.databaseName,
						tenant.environmentId,
						query,
						tenant.routingGeneration
					)
				)
			}
			if (segments.length === 0 && request.method === 'GET') {
				return json(
					200,
					await this.service.browse(
						tenant.databaseName,
						tenant.environmentId,
						tenant.routingGeneration
					)
				)
			}
			if (segments[0] === 'files' && segments.length === 2 && request.method === 'PUT') {
				const publicationId = uuid.parse(segments[1])
				const length = Number(required(request, 'content-length'))
				if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ARTIFACT_FILE_BYTES)
					throw new AppError(413, 'ARTIFACT_FILE_TOO_LARGE', 'Files may not exceed 25 MiB.')
				if (!request.body)
					throw new AppError(400, 'ARTIFACT_BODY_MISSING', 'The file body is required.')
				return json(
					201,
					await this.service.publishFile({
						userId: identity.sub,
						databaseName: tenant.databaseName,
						scopeId: tenant.environmentId,
						routingGeneration: tenant.routingGeneration,
						publicationId,
						intentId: uuid.parse(required(request, 'x-aven-intent-id')),
						observedAt: observedAt.parse(required(request, 'x-aven-observed-at')),
						originalName: originalName(request),
						mediaType: required(request, 'content-type'),
						sha256: z
							.string()
							.regex(/^[0-9a-f]{64}$/)
							.parse(required(request, 'x-expected-sha256')),
						length,
						body: request.body,
						sourceKind: 'client-actor-ingest',
						executionEnvironment: executionEnvironment.parse(
							required(request, 'x-aven-execution-environment')
						)
					})
				)
			}
			if (segments[0] === 'client-runs' && segments.length === 2 && request.method === 'GET') {
				return json(
					200,
					await this.service.clientRun(
						tenant.databaseName,
						tenant.environmentId,
						uuid.parse(segments[1]),
						tenant.routingGeneration
					)
				)
			}
			if (segments[0] === 'client-runs' && segments.length === 2 && request.method === 'POST') {
				const bytes = await readBoundedBytes(request, MAX_CLIENT_RUN_BYTES)
				if (bytes.byteLength > MAX_CLIENT_RUN_BYTES)
					throw new AppError(413, 'CLIENT_RUN_TOO_LARGE', 'The client run is too large.')
				const run = JSON.parse(new TextDecoder().decode(bytes)) as Omit<
					PublishClientRunInput,
					'userId' | 'databaseName' | 'scopeId' | 'routingGeneration' | 'publicationId'
				>
				return json(
					201,
					await this.service.publishClientRun({
						...run,
						userId: identity.sub,
						databaseName: tenant.databaseName,
						scopeId: tenant.environmentId,
						routingGeneration: tenant.routingGeneration,
						publicationId: uuid.parse(segments[1])
					})
				)
			}
			if (segments.length >= 1) {
				const artifactId = uuid.parse(segments[0])
				if (segments.length === 1 && request.method === 'GET')
					return json(
						200,
						await this.service.artifact(
							tenant.databaseName,
							tenant.environmentId,
							artifactId,
							tenant.routingGeneration
						)
					)
				if (segments[1] === 'content' && segments.length === 2 && request.method === 'GET') {
					const envelope = (await this.service.artifact(
						tenant.databaseName,
						tenant.environmentId,
						artifactId,
						tenant.routingGeneration
					)) as Record<string, unknown>
					const content = await this.service.content(
						tenant.databaseName,
						tenant.environmentId,
						artifactId,
						tenant.routingGeneration
					)
					return new Response(Uint8Array.from(content), {
						headers: {
							'content-type': mediaTypeFor(envelope),
							'content-length': String(content.byteLength),
							'x-content-type-options': 'nosniff',
							'content-security-policy': "default-src 'none'; sandbox",
							'cache-control': 'no-store'
						}
					})
				}
				if (segments[1] === 'evidence' && segments.length === 2 && request.method === 'GET')
					return json(200, {
						artifactId,
						evidence: await this.service.evidence(
							tenant.databaseName,
							tenant.environmentId,
							artifactId,
							tenant.routingGeneration
						)
					})
				if (segments[1] === 'processing' && segments.length === 2 && request.method === 'GET')
					return json(404, { code: 'PROCESSING_NOT_SERVER_OWNED' })
			}
			return json(404, { code: 'ROUTE_NOT_FOUND' })
		} catch (error) {
			if (error instanceof AppError)
				return json(error.status, { code: error.code, message: error.message })
			if (error instanceof z.ZodError || error instanceof SyntaxError)
				return json(400, {
					code: 'ARTIFACT_REQUEST_INVALID',
					message: 'The artifact request is invalid.'
				})
			return json(502, {
				code: 'ARTIFACT_STORE_UNAVAILABLE',
				message: 'Artifact Store is unavailable.'
			})
		}
	}
}
