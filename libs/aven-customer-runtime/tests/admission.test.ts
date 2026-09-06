import { generateKeyPairSync, randomUUID } from 'node:crypto'
import {
	databaseNameForEnvironment,
	importTenantGrantPrivateKey,
	importTenantGrantPublicKey,
	signTenantGrant
} from '@avenos/aven-customer-contracts'
import { describe, expect, test } from 'vitest'
import { admitCustomerRequest } from '../src/index.js'

describe('customer request admission', () => {
	test('binds the facade projection, identity proof, grant, action, and workload', async () => {
		const pair = generateKeyPairSync('ed25519')
		const privateKey = await importTenantGrantPrivateKey(
			pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
		)
		const publicKey = await importTenantGrantPublicKey(
			pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
		)
		const subject = randomUUID()
		const environmentId = randomUUID()
		const identity = {
			sub: subject,
			sid: 'session-1',
			role: 'user' as const,
			scope: 'openid services:access',
			email: 'user@example.test',
			email_verified: true as const,
			amr: ['passkey'] as Array<'passkey' | 'bootstrap'>,
			iss: 'https://aven.id',
			aud: 'aven-services',
			iat: 1,
			exp: 9_999_999_999
		}
		const tenant = await signTenantGrant(
			{
				iss: 'https://api.aven.ceo',
				aud: 'ceo.aven:component:data:intents@1',
				sub: subject,
				sid: identity.sid,
				role: identity.role,
				membershipRole: 'owner',
				environmentId,
				databaseName: databaseNameForEnvironment(environmentId),
				routingGeneration: 1,
				componentRef: 'ceo.aven:component:data:intents@1',
				actions: ['intents:read']
			},
			privateKey
		)
		const request = new Request('http://intent/api/intents', {
			headers: {
				authorization: `Bearer ${'s'.repeat(32)}`,
				'x-aven-identity-token': 'identity-token',
				'x-aven-tenant-grant': tenant,
				'x-aven-subject': subject,
				'x-aven-role': 'user',
				'x-aven-session': identity.sid
			}
		})
		await expect(
			admitCustomerRequest(request, {
				serviceToken: 's'.repeat(32),
				identityVerifier: { verify: async () => identity },
				tenantGrantPublicKey: publicKey,
				tenantGrantIssuer: 'https://api.aven.ceo',
				componentRef: 'ceo.aven:component:data:intents@1',
				requiredAction: 'intents:read'
			})
		).resolves.toMatchObject({ tenant: { environmentId }, identity: { sub: subject } })
	})
})
