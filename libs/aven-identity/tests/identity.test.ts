import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, test } from 'vitest'
import {
	bearerToken,
	IdentityAuthenticationError,
	IdentityProvisioningClient,
	IdentityVerifier,
	requireIdentity
} from '../src/index.js'

describe('identity boundary', () => {
	test('extracts only an explicit bearer token', () => {
		expect(bearerToken(new Request('https://api.aven.ceo'))).toBeNull()
		expect(
			bearerToken(new Request('https://api.aven.ceo', { headers: { authorization: 'Basic abc' } }))
		).toBeNull()
		expect(
			bearerToken(
				new Request('https://api.aven.ceo', { headers: { authorization: 'Bearer signed' } })
			)
		).toBe('signed')
	})

	test('fails closed when verification rejects', async () => {
		await expect(
			requireIdentity(
				new Request('https://api.aven.ceo', { headers: { authorization: 'Bearer forged' } }),
				{
					verify: async () => {
						throw new Error('bad signature')
					}
				}
			)
		).rejects.toBeInstanceOf(IdentityAuthenticationError)
	})

	test('verifies issuer, audience, signature, and required authorization claims', async () => {
		const { privateKey, publicKey } = await generateKeyPair('EdDSA')
		const publicJwk = await exportJWK(publicKey)
		let jwksRequest = ''
		const fetcher = async (input: string | URL | Request) => {
			jwksRequest = String(input)
			return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'test', alg: 'EdDSA' }] }), {
				headers: { 'content-type': 'application/json' }
			})
		}
		const verifier = new IdentityVerifier({
			issuer: 'https://aven.id',
			jwksUrl: 'http://identity:3100/api/auth/jwks',
			fetch: fetcher as typeof fetch
		})
		const token = await new SignJWT({
			sid: 'session-1',
			email: 'user@example.test',
			email_verified: true,
			role: 'user',
			amr: ['passkey'],
			scope: 'openid profile email services:access'
		})
			.setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
			.setSubject('3f7b0f1e-7850-4902-a7b0-093f8604a0dd')
			.setIssuer('https://aven.id')
			.setAudience('aven-services')
			.setIssuedAt()
			.setExpirationTime('5m')
			.sign(privateKey)
		expect((await verifier.verify(token)).email).toBe('user@example.test')
		expect(jwksRequest).toBe('http://identity:3100/api/auth/jwks')
	})

	test('resolves authorization roles through the protected identity service boundary', async () => {
		const subjectId = '3f7b0f1e-7850-4902-a7b0-093f8604a0dd'
		let seen: Request | undefined
		const client = new IdentityProvisioningClient(
			'https://aven.id',
			's'.repeat(32),
			async (input, init) => {
				seen = new Request(input, init)
				return new Response(JSON.stringify({ roles: { [subjectId]: 'admin' } }), {
					headers: { 'content-type': 'application/json' }
				})
			}
		)
		expect(await client.roles([subjectId, subjectId])).toEqual(new Map([[subjectId, 'admin']]))
		expect(seen?.url).toBe('https://aven.id/internal/v1/authorizations/roles')
		expect(seen?.headers.get('authorization')).toBe(`Bearer ${'s'.repeat(32)}`)
		expect(await seen?.json()).toEqual({ subjectIds: [subjectId] })
	})
})
