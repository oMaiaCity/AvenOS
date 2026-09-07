import { describe, expect, it } from 'vitest'
import { renderEmail } from '../src/lib/server/email/templates.js'

describe('email copy', () => {
	it('renders branded security notices without adding a setup credential', () => {
		const email = renderEmail('identity.security', {
			message: 'Your first passkey was registered.',
			accessUrl: 'https://aven.id/dashboard',
			baseUrl: 'https://portal.aven.ceo'
		})
		expect(email.subject).toBe('Your aven.id account security')
		expect(email.text).toContain('Your first passkey was registered.')
		expect(email.html).not.toContain('AVENEMAILTOKEN')
		expect(email.text).not.toContain('token=')
	})
	it('renders compiled checkout and setup templates', () => {
		const checkout = renderEmail('name.purchase-link', {
			name: 'alice',
			claimUrl: 'https://id.example/checkout?a=1&b=2',
			expiresAt: 'Thursday',
			baseUrl: 'https://id.example'
		})
		expect(checkout.subject).toBe('Checkout link for alice')
		expect(checkout.text).toContain('Continue to checkout')
		expect(checkout.text).toContain('https://id.example/checkout?a=1&b=2')
		expect(checkout.text).toContain('This link expires Thursday.')
		expect(checkout.html).toContain('Continue to checkout')
		expect(checkout.html).toContain('https://id.example/checkout?a=1&amp;b=2')
		expect(checkout.html).toContain('https://id.example/email/aven-logo.png')
		expect(checkout.html).toContain('style=')
		expect(checkout.html).not.toContain('@maizzle/')
		expect(checkout.html).not.toContain('AVENEMAILTOKEN')

		const login = renderEmail('name.purchased', {
			name: 'alice',
			accessUrl: 'https://id.example/setup',
			baseUrl: 'https://id.example'
		})
		expect(login.subject).toBe('Login for alice')
		expect(login.text).toContain('Create your passkey')
		expect(login.text).toContain('https://id.example/setup')
		expect(login.text).toContain(
			'This link works for seven days, or until your first passkey is created.'
		)
		expect(login.html).toContain('Create passkey')
	})

	it('uses the no-access state when no setup URL is available', () => {
		const email = renderEmail('name.purchased', {
			name: 'alice',
			accessUrl: '',
			baseUrl: 'https://id.example'
		})
		expect(email.subject).toBe('Login for alice')
		expect(email.text).toContain('Your purchase is complete.')
		expect(email.text).not.toContain('Create your passkey')
		expect(email.html).not.toContain('Create passkey')
		expect(email.html).not.toContain('AVENEMAILTOKEN')
	})

	it('escapes HTML data and prevents subject header injection', () => {
		const email = renderEmail('name.purchase-link', {
			name: '<alice>\r\nBcc: attacker@example.com',
			claimUrl: 'https://id.example/checkout?value=<unsafe>',
			expiresAt: '<Thursday>',
			baseUrl: 'https://id.example'
		})
		expect(email.subject).toBe('Checkout link for <alice> Bcc: attacker@example.com')
		expect(email.html).toContain('&lt;alice&gt;')
		expect(email.html).toContain('value=&lt;unsafe&gt;')
		expect(email.html).toContain('&lt;Thursday&gt;')
	})
})
