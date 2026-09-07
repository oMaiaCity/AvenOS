import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
	databaseNameForEnvironment,
	databaseRoleName,
	deriveDatabasePassword,
	importTenantGrantPrivateKey,
	importTenantGrantPublicKey,
	signTenantGrant,
	verifyTenantGrant
} from '../src/index.js'

describe('customer database role contract', () => {
	const environmentId = '55a1d196-7ae1-42dd-9ef5-1adc95ce600a'
	const root = Buffer.alloc(32, 7).toString('base64url')

	test('derives stable bounded database and role identities', () => {
		expect(databaseNameForEnvironment(environmentId)).toBe('cust_55a1d1967ae142dd9ef51adc95ce600a')
		expect(databaseRoleName(environmentId, 'int_api')).toBe(
			'c_55a1d1967ae142dd9ef51adc95ce600a_int_api'
		)
	})

	test('domain-separates customer, generation, role, and root', () => {
		const derive = (overrides: Partial<Parameters<typeof deriveDatabasePassword>[0]> = {}) =>
			deriveDatabasePassword({
				root,
				environmentId,
				routingGeneration: 1,
				roleKind: 'ceo.aven:db-role:intents:api@1',
				...overrides
			})
		const password = derive()
		expect(password).toHaveLength(43)
		expect(derive()).toBe(password)
		expect(derive({ environmentId: randomUUID() })).not.toBe(password)
		expect(derive({ routingGeneration: 2 })).not.toBe(password)
		expect(derive({ roleKind: 'os.aven:db-role:actors:api@1' })).not.toBe(password)
		expect(derive({ root: randomBytes(32).toString('base64url') })).not.toBe(password)
	})
})

describe('tenant grant contract', () => {
	test('binds subject, session, environment, database, component, and action', async () => {
		const pair = generateKeyPairSync('ed25519')
		const privateKey = await importTenantGrantPrivateKey(
			pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
		)
		const publicKey = await importTenantGrantPublicKey(
			pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
		)
		const environmentId = randomUUID()
		const token = await signTenantGrant(
			{
				iss: 'https://api.aven.ceo',
				aud: 'ceo.aven:component:data:intents@1',
				sub: randomUUID(),
				sid: 'session-1',
				role: 'user',
				membershipRole: 'owner',
				environmentId,
				databaseName: databaseNameForEnvironment(environmentId),
				routingGeneration: 3,
				componentRef: 'ceo.aven:component:data:intents@1',
				actions: ['intents:read', 'intents:write']
			},
			privateKey,
			60
		)
		const claims = await verifyTenantGrant(token, publicKey, {
			issuer: 'https://api.aven.ceo',
			audience: 'ceo.aven:component:data:intents@1',
			action: 'intents:write'
		})
		expect(claims.environmentId).toBe(environmentId)
		await expect(
			verifyTenantGrant(token, publicKey, {
				issuer: 'https://api.aven.ceo',
				audience: 'ceo.aven:component:data:intents@1',
				action: 'intents:delete-all'
			})
		).rejects.toThrow()
	})
})
