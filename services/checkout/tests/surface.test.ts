import { describe, expect, test } from 'vitest'
import { isCheckoutPath } from '../src/lib/server/surface.js'

describe('checkout public surface', () => {
	test.each([
		'/',
		'/secure',
		'/purchase/checkout',
		'/purchase/success',
		'/api/names/check',
		'/api/pow/challenge',
		'/api/billing/subscribe',
		'/api/webhooks/polar',
		'/api/health/ready'
	])('allows %s', (pathname) => expect(isCheckoutPath(pathname)).toBe(true))

	test.each([
		'/login',
		'/api/auth/sign-in',
		'/api/passkeys',
		'/api/pow/challenge/extra',
		'/api/pow/challenge-forged',
		'/api/webhooks/polar/extra',
		'/api/webhooks/polar-forged',
		'/api/artifacts',
		'/api/intents',
		'/api/llm/models',
		'/api/sites',
		'/internal/v1/static-sites/bindings',
		'/dashboard',
		'/sites'
	])('denies %s', (pathname) => expect(isCheckoutPath(pathname)).toBe(false))
})
