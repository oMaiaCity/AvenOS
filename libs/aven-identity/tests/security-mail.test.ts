import { expect, test } from 'vitest'
import { acceptsSecurityMail, securityMailSchema, securityMailToken } from '../src/security-mail.js'

test('mail relay credentials are purpose- and environment-separated', () => {
	const next = 'fixture-next-provisioning-32-bytes',
		prod = 'fixture-prod-provisioning-32-bytes'
	const request = (value: string) =>
		new Request('https://portal.example.test/internal/v1/identity-mail', {
			headers: { authorization: `Bearer ${value}` }
		})
	expect(acceptsSecurityMail(request(securityMailToken(next)), next)).toBe(true)
	expect(acceptsSecurityMail(request(securityMailToken(next)), prod)).toBe(false)
	expect(acceptsSecurityMail(request(next), next)).toBe(false)
	expect(acceptsSecurityMail(request(''), next)).toBe(false)
})
test('relay accepts fixed events, not arbitrary mail contents or destinations', () => {
	const event = { id: crypto.randomUUID(), email: 'fixture@example.test', kind: 'first-passkey' }
	expect(securityMailSchema.safeParse(event).success).toBe(true)
	for (const extra of [
		{ html: 'untrusted' },
		{ url: 'https://untrusted.example' },
		{ setupToken: 'a'.repeat(43) }
	])
		expect(securityMailSchema.safeParse({ ...event, ...extra }).success).toBe(false)
	expect(securityMailSchema.safeParse({ ...event, kind: 'setup-replaced' }).success).toBe(false)
	expect(
		securityMailSchema.safeParse({ ...event, kind: 'setup-replaced', setupToken: 'a'.repeat(43) })
			.success
	).toBe(true)
})
