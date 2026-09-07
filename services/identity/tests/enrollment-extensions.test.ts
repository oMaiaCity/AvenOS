import { expect, test } from 'vitest'
import { registrationPrfEnabled } from '../src/lib/server/enrollment.js'

test('ordinary authenticators may omit extension results', () => {
	for (const value of [undefined, null, {}, { prf: {} }, { prf: { enabled: false } }])
		expect(registrationPrfEnabled(value)).toBe(false)
	expect(registrationPrfEnabled({ prf: { enabled: true } })).toBe(true)
	expect(registrationPrfEnabled({ prf: { enabled: 'true' } })).toBe(false)
})
