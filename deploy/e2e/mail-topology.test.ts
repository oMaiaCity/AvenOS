import { expect, test } from 'bun:test'

test('production SMTP credentials belong only to the email worker, not checkout HTTP', async () => {
	const compose = Bun.YAML.parse(
		await Bun.file(new URL('../platform/docker-compose.yml', import.meta.url)).text()
	)
	expect(compose.services.checkout.environment.SMTP_URL).toBeUndefined()
	expect(compose.services.checkout.environment.SMTP_FROM).toBeUndefined()
	expect(compose.services['email-worker'].environment.SMTP_URL).toBe('${SMTP_URL:?required}')
	expect(compose.services['email-worker'].environment.SMTP_FROM).toBe('${SMTP_FROM:?required}')
})

test('identity mail channels point at the actual E2E checkout listener', async () => {
	const compose = Bun.YAML.parse(
		await Bun.file(new URL('./docker-compose.yml', import.meta.url)).text()
	) as {
		services: Record<string, { environment: Record<string, string> }>
	}
	const identity = compose.services['identity-migrate']?.environment
	if (!identity?.IDENTITY_MAIL_ORIGINS) throw new Error('The E2E mail channels must be configured')
	const channels = identity.IDENTITY_MAIL_ORIGINS.split(',')
	expect(channels.length).toBeGreaterThan(0)
	expect(channels.length).toBe(identity.IDENTITY_PROVISIONING_SECRETS.split(',').length)
	for (const value of channels) {
		const origin = new URL(value)
		expect(origin.hostname).toBe('checkout')
		expect(origin.port).toBe(String(compose.services.checkout?.environment.PORT))
	}
})
