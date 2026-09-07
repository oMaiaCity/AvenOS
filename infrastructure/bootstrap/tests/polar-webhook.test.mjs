import assert from 'node:assert/strict'
import test from 'node:test'
import { ensurePolarWebhook, POLAR_WEBHOOK_EVENTS } from '../../../scripts/lib/polar-webhook.ts'

const endpoint = (overrides = {}) => ({
	id: 'endpoint-1',
	url: 'https://portal.next.aven.ceo/api/webhooks/polar',
	name: 'old name',
	format: 'raw',
	events: ['order.created'],
	enabled: false,
	secret: 'polar-secret',
	...overrides
})

function fakeApi(existing = []) {
	const calls = []
	return {
		calls,
		async listWebhookEndpoints(input) {
			calls.push(['list', input])
			return {
				async *[Symbol.asyncIterator]() {
					yield { result: { items: existing } }
				}
			}
		},
		async createWebhookEndpoint(input) {
			calls.push(['create', input])
			return endpoint({ ...input, id: 'created', secret: 'created-secret', enabled: true })
		},
		async updateWebhookEndpoint(input) {
			calls.push(['update', input])
			return endpoint({
				...input.webhookEndpointUpdate,
				id: input.id,
				secret: 'existing-secret'
			})
		}
	}
}

test('creates a raw endpoint for every Polar event', async () => {
	const api = fakeApi()
	const result = await ensurePolarWebhook({
		accessToken: 'token',
		organizationId: 'org',
		server: 'sandbox',
		target: 'next',
		api
	})
	assert.equal(result.secret, 'created-secret')
	assert.equal(api.calls[1][0], 'create')
	assert.deepEqual(api.calls[1][1].events, [...POLAR_WEBHOOK_EVENTS])
	assert.equal(api.calls[1][1].format, 'raw')
})

test('retries creation without organization ID for an organization token', async () => {
	const api = fakeApi()
	const create = api.createWebhookEndpoint
	api.createWebhookEndpoint = async (input) => {
		api.calls.push(['create', input])
		if ('organizationId' in input) {
			throw {
				statusCode: 422,
				body: JSON.stringify({
					detail: [
						{
							type: 'organization_token',
							loc: ['body', 'organization_id']
						}
					]
				})
			}
		}
		return create(input)
	}
	const result = await ensurePolarWebhook({
		accessToken: 'organization-token',
		organizationId: 'org',
		server: 'sandbox',
		target: 'next',
		api
	})
	assert.equal(result.secret, 'created-secret')
	assert.equal(api.calls[1][0], 'create')
	assert.equal(api.calls[1][1].organizationId, 'org')
	assert.equal(api.calls[2][0], 'create')
	assert.equal('organizationId' in api.calls[2][1], false)
})

test('does not retry unrelated Polar validation failures', async () => {
	const api = fakeApi()
	const failure = { statusCode: 422, body: '{"detail":"invalid URL"}' }
	api.createWebhookEndpoint = async () => {
		throw failure
	}
	await assert.rejects(
		ensurePolarWebhook({
			accessToken: 'token',
			organizationId: 'org',
			server: 'sandbox',
			target: 'next',
			api
		}),
		(error) => error === failure
	)
})

test('reconciles an existing endpoint without rotating its secret', async () => {
	const api = fakeApi([endpoint()])
	const result = await ensurePolarWebhook({
		accessToken: 'token',
		organizationId: 'org',
		server: 'sandbox',
		target: 'next',
		api
	})
	assert.equal(result.secret, 'existing-secret')
	assert.equal(api.calls[1][0], 'update')
	assert.equal(api.calls[1][1].webhookEndpointUpdate.enabled, true)
	assert.deepEqual(api.calls[1][1].webhookEndpointUpdate.events, [...POLAR_WEBHOOK_EVENTS])
})

test('refuses an ambiguous duplicate endpoint', async () => {
	const api = fakeApi([endpoint(), endpoint({ id: 'endpoint-2' })])
	await assert.rejects(
		ensurePolarWebhook({
			accessToken: 'token',
			organizationId: 'org',
			server: 'sandbox',
			target: 'next',
			api
		}),
		/multiple webhook endpoints/
	)
})
