import { timingSafeEqual } from 'node:crypto'
import type { IdentityClaims } from '@avenos/aven-identity'
import { readBoundedJson } from '@avenos/http-boundary'
import { z } from 'zod'
import { HostingControlError, type HostingStore } from './store.js'
import { siteBindingInputSchema } from './validation.js'

const reportSchema = z.object({
	id: z.uuid(),
	status: z.enum(['awaiting_dns', 'syncing', 'active', 'dns_invalid', 'failed']),
	error: z.string().max(1000).nullable().optional(),
	artifactRevision: z
		.string()
		.regex(/^[0-9a-f]{40}$/)
		.nullable()
		.optional(),
	sourceRevision: z
		.string()
		.regex(/^[0-9a-f]{40}$/)
		.nullable()
		.optional(),
	dnsVerified: z.boolean().optional()
})

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	})

function authorized(request: Request, token: string): boolean {
	const actual = Buffer.from(request.headers.get('authorization') ?? '')
	const expected = Buffer.from(`Bearer ${token}`)
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function input(request: Request) {
	return siteBindingInputSchema.parse(await readBoundedJson(request, 65536).catch(() => null))
}

function failure(error: unknown): Response {
	if (error instanceof HostingControlError)
		return json(error.status, { code: error.code, message: error.message })
	if (error instanceof z.ZodError)
		return json(400, { code: 'VALIDATION_ERROR', message: 'The site binding is invalid.' })
	throw error
}

export class HostingHandler {
	constructor(
		private readonly store: HostingStore,
		private readonly directoryToken: string
	) {}

	async internal(request: Request): Promise<Response> {
		if (!authorized(request, this.directoryToken)) return json(404, { code: 'NOT_FOUND' })
		const pathname = new URL(request.url).pathname
		if (request.method === 'GET' && pathname === '/internal/v1/static-sites/bindings')
			return json(200, await this.store.directory())
		if (request.method === 'POST' && pathname === '/internal/v1/static-sites/status') {
			const parsed = reportSchema.safeParse(await readBoundedJson(request, 65536).catch(() => null))
			if (!parsed.success) return json(400, { code: 'VALIDATION_ERROR' })
			await this.store.report(parsed.data)
			return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
		}
		return json(404, { code: 'NOT_FOUND' })
	}

	async user(request: Request, claims: IdentityClaims): Promise<Response> {
		const pathname = new URL(request.url).pathname
		const match = pathname.match(/^\/api\/sites\/([0-9a-f-]+)$/)
		try {
			if (pathname === '/api/sites' && request.method === 'GET')
				return json(200, { sites: await this.store.list(claims.sub, claims.role === 'admin') })
			if (pathname === '/api/sites' && request.method === 'POST')
				return json(201, await this.store.create(claims.sub, await input(request)))
			if (match && z.uuid().safeParse(match[1]).success && request.method === 'PUT')
				return json(200, await this.store.update(claims.sub, match[1], await input(request)))
			if (match && z.uuid().safeParse(match[1]).success && request.method === 'DELETE') {
				await this.store.remove(claims.sub, match[1])
				return json(200, { removed: true })
			}
			return json(404, { code: 'ROUTE_NOT_FOUND', message: 'The site route does not exist.' })
		} catch (error) {
			return failure(error)
		}
	}
}
