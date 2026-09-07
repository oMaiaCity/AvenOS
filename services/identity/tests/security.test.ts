import { describe, expect, test } from 'vitest'
import { accessTokenExpiration, androidPasskeyOrigins } from '../src/lib/server/auth.js'
import { identityConfigSchema } from '../src/lib/server/config.js'
import { constantTimeAnyBearer, constantTimeBearer } from '../src/lib/server/tokens.js'

const base = {
	PUBLIC_BASE_URL: 'https://aven.id',
	WEBAUTHN_RP_ID: 'aven.id',
	DATABASE_URL: 'postgres://identity_auth:test@db/identity',
	ACCOUNTS_DATABASE_URL: 'postgres://identity_accounts:test@db/identity',
	AUTHORIZATION_DATABASE_URL: 'postgres://identity_authorization:test@db/identity',
	BETTER_AUTH_SECRET: 'b'.repeat(32),
	IDENTITY_PROVISIONING_SECRETS: `${'p'.repeat(32)},${'q'.repeat(32)}`
}

describe('identity security invariants', () => {
	test('binds the WebAuthn RP ID to the public hostname', () => {
		expect(() => identityConfigSchema.parse({ ...base, WEBAUTHN_RP_ID: 'aven.ceo' })).toThrow(
			/public hostname/
		)
	})

	test('requires HTTPS in production', () => {
		expect(() =>
			identityConfigSchema.parse({
				...base,
				NODE_ENV: 'production',
				PUBLIC_BASE_URL: 'http://aven.id'
			})
		).toThrow(/HTTPS/)
	})

	test('requires separate function roles in production', () => {
		expect(() =>
			identityConfigSchema.parse({
				...base,
				NODE_ENV: 'production',
				AUTHORIZATION_DATABASE_URL: base.DATABASE_URL
			})
		).toThrow(/distinct database users/)
	})

	test('derives Android app origins from certificate fingerprints', () => {
		expect(androidPasskeyOrigins(['00:00'])).toEqual(['android:apk-key-hash:AAA'])
	})

	test('expresses token TTL as a relative JWT duration', () => {
		expect(accessTokenExpiration(300)).toBe('300s')
	})

	test('accepts only the exact internal provisioning secret', () => {
		expect(
			constantTimeBearer(
				new Request('https://aven.id', { headers: { authorization: `Bearer ${'p'.repeat(32)}` } }),
				'p'.repeat(32)
			)
		).toBe(true)
		expect(
			constantTimeBearer(
				new Request('https://aven.id', { headers: { authorization: `Bearer ${'x'.repeat(32)}` } }),
				'p'.repeat(32)
			)
		).toBe(false)
	})

	test('accepts either isolated platform provisioning secret', () => {
		const request = (secret: string) =>
			new Request('https://aven.id', { headers: { authorization: `Bearer ${secret}` } })
		expect(constantTimeAnyBearer(request('p'.repeat(32)), ['p'.repeat(32), 'q'.repeat(32)])).toBe(
			true
		)
		expect(constantTimeAnyBearer(request('q'.repeat(32)), ['p'.repeat(32), 'q'.repeat(32)])).toBe(
			true
		)
		expect(constantTimeAnyBearer(request('x'.repeat(32)), ['p'.repeat(32), 'q'.repeat(32)])).toBe(
			false
		)
	})

	test('requires distinct provisioning credentials for the platform environments', () => {
		expect(() =>
			identityConfigSchema.parse({
				...base,
				IDENTITY_PROVISIONING_SECRETS: `${'p'.repeat(32)},${'p'.repeat(32)}`
			})
		).toThrow(/duplicate secrets/)
	})
})
