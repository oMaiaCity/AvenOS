import { randomUUID } from 'node:crypto'
import { verifyTenantGrant } from '@avenos/aven-customer-contracts'
import type { IdentityClaims } from '@avenos/aven-identity'
import { generateKeyPair } from 'jose'
import type pg from 'pg'
import { expect, test } from 'vitest'
import { CustomerHandler } from '../src/customers/handler.js'
import { CustomerStore } from '../src/customers/store.js'
import { createFacadeHandler } from '../src/facade.js'
import { testConfig } from './helpers.js'

test('the same signed-in customer follows the current directory and a held or unknown destination fails closed', async () => {
	const environment = randomUUID()
	const subject = randomUUID()
	const identity = {
		sub: subject,
		sid: 'unchanged-session',
		role: 'user',
		scope: 'services:access',
		amr: ['passkey']
	} as IdentityClaims
	let runtimeId = 'primary'
	let generation = 1
	let movement: string | null = null
	const keys = await generateKeyPair('EdDSA')
	const pool = {
		query: async (_sql: string, args: string[]) => {
			expect(args.slice(0, 2)).toEqual([environment, subject])
			return {
				rows: [
					{
						database_name: `cust_${environment.replaceAll('-', '')}`,
						runtime_id: runtimeId,
						movement_id: movement,
						routing_generation: generation,
						desired_state: 'ready',
						observed_state: 'ready',
						component_state: 'ready',
						membership_role: 'owner'
					}
				]
			}
		}
	} as unknown as pg.Pool
	const store = new CustomerStore(pool)
	const customers = new CustomerHandler(store, store, 't'.repeat(32), keys.privateKey)
	const target = {
		segment: 'intents',
		baseUrl: 'http://blue.internal',
		targetPrefix: '/api/intents',
		bearerToken: 'b'.repeat(32),
		componentRef: 'ceo.aven:component:data:intents@1',
		readAction: 'intents:read',
		writeAction: 'intents:write'
	}
	const config = testConfig({
		CUSTOMER_DOWNSTREAMS_JSON: JSON.stringify([target]),
		CUSTOMER_RUNTIMES_JSON: JSON.stringify([
			{
				id: 'green',
				targets: [{ ...target, baseUrl: 'http://green.internal', bearerToken: 'g'.repeat(32) }],
				artifactStoreBaseUrl: 'http://green-artifacts.internal',
				artifactStoreBearerToken: 'a'.repeat(32)
			}
		])
	})
	let calls = 0
	const handler = createFacadeHandler(
		config,
		{ verify: async () => identity },
		async (request) => {
			calls++
			expect(new URL(request.url).hostname).toBe(
				runtimeId === 'primary' ? 'blue.internal' : 'green.internal'
			)
			expect(request.headers.get('authorization')).toBe(
				`Bearer ${(runtimeId === 'primary' ? 'b' : 'g').repeat(32)}`
			)
			expect(request.headers.get('x-aven-runtime')).toBeNull()
			const grant = await verifyTenantGrant(
				request.headers.get('x-aven-tenant-grant') ?? '',
				keys.publicKey,
				{
					issuer: 'https://api.aven.ceo',
					audience: target.componentRef,
					action: 'intents:read'
				}
			)
			expect(grant.environmentId).toBe(environment)
			expect(grant.routingGeneration).toBe(generation)
			return Response.json({ items: [] })
		},
		undefined,
		customers
	)
	const request = () =>
		handler(
			new Request(`https://api.aven.ceo/api/environments/${environment}/intents`, {
				headers: { authorization: 'Bearer unchanged-identity', 'x-aven-runtime': 'untrusted' }
			})
		)
	expect((await request()).status).toBe(200)
	runtimeId = 'green'
	generation = 2
	expect((await request()).status).toBe(200)
	movement = randomUUID()
	expect((await request()).status).toBe(503)
	movement = null
	runtimeId = 'unconfigured'
	expect((await request()).status).toBe(503)
	expect(calls).toBe(2)
})
