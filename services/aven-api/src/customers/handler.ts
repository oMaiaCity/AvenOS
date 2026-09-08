import { timingSafeEqual } from 'node:crypto'
import {
	signTenantGrant,
	type TenantGrantClaims,
	type TenantGrantKey
} from '@avenos/aven-customer-contracts'
import type { IdentityClaims } from '@avenos/aven-identity'
import { readBoundedJson } from '@avenos/http-boundary'
import { z } from 'zod'
import type { CustomerStore, EntitlementEvent } from './store.js'
import { CustomerAuthorizationError } from './store.js'

const entitlementSchema = z
	.object({
		eventId: z.uuid(),
		eventType: z.enum(['purchase_granted', 'purchase_revoked']),
		subjectId: z.uuid(),
		purchasedName: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
		occurredAt: z.iso.datetime()
	})
	.strict()

const json = (status: number, body: unknown) =>
	Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function authorized(request: Request, secret: string): boolean {
	const actual = Buffer.from(request.headers.get('authorization') ?? '')
	const expected = Buffer.from(`Bearer ${secret}`)
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export class CustomerHandler {
	constructor(
		private readonly entitlementStore: CustomerStore,
		private readonly authorizationStore: CustomerStore,
		private readonly entitlementToken: string,
		private readonly tenantGrantPrivateKey: TenantGrantKey
	) {}

	async internal(request: Request): Promise<Response> {
		if (!authorized(request, this.entitlementToken)) return json(404, { code: 'NOT_FOUND' })
		if (
			request.method !== 'POST' ||
			new URL(request.url).pathname !== '/internal/v1/customer-entitlement-events'
		)
			return json(404, { code: 'NOT_FOUND' })
		const parsed = entitlementSchema.safeParse(
			await readBoundedJson(request, 16384).catch(() => null)
		)
		if (!parsed.success) return json(400, { code: 'ENTITLEMENT_EVENT_INVALID' })
		try {
			const result = await this.entitlementStore.acceptEntitlement(parsed.data as EntitlementEvent)
			return json(result.replay ? 200 : 201, result)
		} catch (error) {
			return this.failure(error) ?? json(500, { code: 'ENTITLEMENT_EVENT_FAILED' })
		}
	}

	async list(claims: IdentityClaims): Promise<Response> {
		return json(200, { environments: await this.authorizationStore.list(claims.sub) })
	}

	async grant(input: {
		claims: IdentityClaims
		environmentId: string
		componentRef: string
		actions: string[]
	}): Promise<{
		claims: Omit<TenantGrantClaims, 'iat' | 'exp'>
		token: string
		runtimeId: string
	}> {
		const { runtimeId, ...claims } = await this.authorizationStore.authorize(
			input.claims,
			input.environmentId,
			input.componentRef,
			input.actions
		)
		return { claims, runtimeId, token: await signTenantGrant(claims, this.tenantGrantPrivateKey) }
	}

	failure(error: unknown): Response | null {
		if (error instanceof CustomerAuthorizationError)
			return json(error.status, { code: error.code, message: error.message })
		return null
	}
}
