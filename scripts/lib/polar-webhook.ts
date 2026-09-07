import { Polar } from '@polar-sh/sdk'

export const POLAR_WEBHOOK_EVENTS = [
	'checkout.created',
	'checkout.updated',
	'checkout.expired',
	'customer.created',
	'customer.updated',
	'customer.deleted',
	'customer.state_changed',
	'customer_seat.assigned',
	'customer_seat.claimed',
	'customer_seat.revoked',
	'member.created',
	'member.updated',
	'member.deleted',
	'order.created',
	'order.updated',
	'order.paid',
	'order.refunded',
	'subscription.created',
	'subscription.updated',
	'subscription.active',
	'subscription.canceled',
	'subscription.uncanceled',
	'subscription.revoked',
	'subscription.past_due',
	'subscription.paused',
	'subscription.resumed',
	'refund.created',
	'refund.updated',
	'product.created',
	'product.updated',
	'benefit.created',
	'benefit.updated',
	'benefit_grant.created',
	'benefit_grant.cycled',
	'benefit_grant.updated',
	'benefit_grant.revoked',
	'organization.updated'
] as const

interface WebhookEndpoint {
	id: string
	url: string
	name?: string | null
	format: string
	events: readonly string[]
	enabled: boolean
	secret: string
}

interface WebhookPage {
	result: { items: WebhookEndpoint[] }
}

interface PolarWebhookApi {
	listWebhookEndpoints(input: {
		organizationId: string
		limit: number
	}): Promise<AsyncIterable<WebhookPage>>
	createWebhookEndpoint(input: {
		organizationId?: string
		url: string
		name: string
		format: 'raw'
		events: string[]
	}): Promise<WebhookEndpoint>
	updateWebhookEndpoint(input: {
		id: string
		webhookEndpointUpdate: {
			url: string
			name: string
			format: 'raw'
			events: string[]
			enabled: true
		}
	}): Promise<WebhookEndpoint>
}

export interface EnsurePolarWebhookInput {
	accessToken: string
	organizationId: string
	server: 'sandbox' | 'production'
	target: 'next' | 'production'
	api?: PolarWebhookApi
}

function isOrganizationTokenOrganizationIdError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false
	const candidate = error as { statusCode?: unknown; body?: unknown }
	return (
		candidate.statusCode === 422 &&
		typeof candidate.body === 'string' &&
		candidate.body.includes('organization_token') &&
		candidate.body.includes('organization_id')
	)
}

export async function ensurePolarWebhook(input: EnsurePolarWebhookInput): Promise<WebhookEndpoint> {
	const url =
		input.target === 'next'
			? 'https://portal.next.aven.ceo/api/webhooks/polar'
			: 'https://portal.aven.ceo/api/webhooks/polar'
	const name = `avenOS ${input.target}`
	const api =
		input.api ??
		(new Polar({ accessToken: input.accessToken, server: input.server })
			.webhooks as unknown as PolarWebhookApi)
	const listed = await api.listWebhookEndpoints({
		organizationId: input.organizationId,
		limit: 100
	})
	const matches: WebhookEndpoint[] = []
	for await (const page of listed) {
		matches.push(...page.result.items.filter((endpoint) => endpoint.url === url))
	}
	if (matches.length > 1)
		throw new Error(`Polar has multiple webhook endpoints for ${url}; remove the duplicate first.`)
	if (matches.length === 0) {
		const endpoint = {
			url,
			name,
			format: 'raw' as const,
			events: [...POLAR_WEBHOOK_EVENTS]
		}
		try {
			return await api.createWebhookEndpoint({
				organizationId: input.organizationId,
				...endpoint
			})
		} catch (error) {
			// Personal access tokens require an organization ID. Organization tokens
			// derive it from the token and reject that same field. Retry only Polar's
			// exact validation response; every other provider error stays fatal.
			if (!isOrganizationTokenOrganizationIdError(error)) throw error
			return api.createWebhookEndpoint(endpoint)
		}
	}
	return api.updateWebhookEndpoint({
		id: matches[0].id,
		webhookEndpointUpdate: {
			url,
			name,
			format: 'raw',
			events: [...POLAR_WEBHOOK_EVENTS],
			enabled: true
		}
	})
}
