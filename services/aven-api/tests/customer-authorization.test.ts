import { randomUUID } from 'node:crypto'
import { membershipAllows } from '@avenos/aven-customer-contracts'
import type { IdentityClaims } from '@avenos/aven-identity'
import type pg from 'pg'
import { describe, expect, test } from 'vitest'
import { CustomerStore } from '../src/customers/store.js'

const components = [
	['ceo.aven:component:data:artifacts@1', ['artifacts:read', 'artifacts:write']],
	[
		'ceo.aven:component:data:intents@1',
		['intents:read', 'intents:write', 'intents:delete', 'intents:merge']
	],
	['os.aven:component:actors:run-repository@1', ['actor-runs:read', 'actor-runs:write']]
] as const

describe('customer membership authorization', () => {
	test('explicit role × component × action matrix denies unknown and cross-component actions', () => {
		const all = components.flatMap(([, actions]) => [...actions])
		for (const role of ['owner', 'admin', 'member'])
			for (const [component, actions] of components) {
				for (const action of all) {
					const expected =
						(actions as readonly string[]).includes(action) &&
						(role !== 'member' || !['intents:delete', 'intents:merge'].includes(action))
					expect(membershipAllows(role, component, [action])).toBe(expected)
				}
				expect(membershipAllows(role, component, ['unknown:write'])).toBe(false)
				expect(membershipAllows(role, component, [])).toBe(false)
			}
		expect(membershipAllows('administrator', components[0][0], ['artifacts:read'])).toBe(false)
		expect(membershipAllows('owner', 'constructor', ['artifacts:read'])).toBe(false)
	})
	test('reloads membership for each grant; a global admin cannot override downgrade or removal', async () => {
		const environment = randomUUID()
		const claims = { sub: randomUUID(), sid: 'existing-session', role: 'admin' } as IdentityClaims
		let role: string | null = 'owner'
		const pool = {
			query: async (sql: string, values: unknown[]) => {
				expect(sql).toContain('m.role AS membership_role')
				expect(values).toEqual([environment, claims.sub, components[1][0]])
				return {
					rows: role
						? [
								{
									database_name: 'customer_test',
									routing_generation: 1,
									desired_state: 'ready',
									observed_state: 'ready',
									component_state: 'ready',
									membership_role: role
								}
							]
						: []
				}
			}
		} as unknown as pg.Pool
		const store = new CustomerStore(pool)
		const grant = () => store.authorize(claims, environment, components[1][0], ['intents:delete'])
		expect((await grant()).membershipRole).toBe('owner')
		role = 'member'
		await expect(grant()).rejects.toMatchObject({ status: 403, code: 'MEMBERSHIP_ACTION_DENIED' })
		role = null
		await expect(grant()).rejects.toMatchObject({ status: 404, code: 'ENVIRONMENT_NOT_FOUND' })
	})
})
