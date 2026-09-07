import { expect, test } from 'vitest'
import {
	defaultPasskeyName,
	namePasskeyRegistration,
	passkeyNameSchema
} from '../src/lib/passkey-name.js'

test.each([
	['Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537', 'Linux-Chrome'],
	['Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18 Safari/605', 'Mac-Safari'],
	['Mozilla/5.0 (iPhone; CPU iPhone OS) CriOS/140 Safari/605', 'iPhone-Chrome'],
	['Mozilla/5.0 (Linux; Android 15) Chrome/140 Safari/537', 'Android-Chrome'],
	['Mozilla/5.0 (Windows NT 10.0) Chrome/140 Safari/537 Edg/140', 'Windows-Edge'],
	['Mozilla/5.0 (iPad; CPU OS) FxiOS/140 Safari/605', 'iPad-Firefox'],
	['', 'device']
])('suggests service-account-device without identifying hardware: %s', (agent, device) => {
	expect(defaultPasskeyName('daniel@example.test', agent)).toBe(
		`aven.id-daniel@example.test-${device}`
	)
})

test('names are editable Unicode labels, trimmed and bounded', () => {
	expect(passkeyNameSchema.parse('  Büroschlüssel 🔑  ')).toBe('Büroschlüssel 🔑')
	for (const name of ['', '   ', 'x'.repeat(129), 'one\ntwo', 'hidden\u0000'])
		expect(passkeyNameSchema.safeParse(name).success).toBe(false)
	expect(
		passkeyNameSchema.safeParse(defaultPasskeyName('x'.repeat(300), 'Windows Chrome/140')).success
	).toBe(true)
})

test('creation labels match the chosen name without altering the ceremony or account handle', () => {
	const options = {
		user: { id: 'opaque-user-handle', name: 'account@example.test', displayName: 'Account' },
		challenge: 'unchanged-challenge',
		rp: { id: 'aven.id', name: 'aven.id' },
		authenticatorSelection: { userVerification: 'required', residentKey: 'required' },
		excludeCredentials: [{ id: 'existing-passkey', type: 'public-key' }],
		extensions: { prf: {} }
	}
	const named = namePasskeyRegistration(options, '  aven.id-account-My phone  ')
	expect(named.user).toEqual({
		id: options.user.id,
		name: 'aven.id-account-My phone',
		displayName: 'aven.id-account-My phone'
	})
	expect({ ...named, user: options.user }).toEqual(options)
	expect(options.user.name).toBe('account@example.test')
	expect(() => namePasskeyRegistration(options, '')).toThrow()
})
