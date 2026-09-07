import { acceptsSecurityMail, securityMailSchema } from '@avenos/aven-identity/security-mail'
import { json } from '@sveltejs/kit'
import { enqueueSystemEmail } from '$lib/server/email/queue.js'
import { runtime } from '$lib/server/runtime.js'

export const POST = async ({ request }) => {
	const rt = await runtime()
	if (!acceptsSecurityMail(request, rt.config.IDENTITY_PROVISIONING_SECRET))
		return json({ code: 'UNAUTHORIZED' }, { status: 401 })
	const parsed = securityMailSchema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return json({ code: 'INVALID_SECURITY_MAIL' }, { status: 400 })
	const input = parsed.data
	const access = new URL(
		input.kind === 'setup-replaced' ? '/api/auth/sign-in/setup-token' : '/dashboard',
		rt.config.IDENTITY_ISSUER
	)
	if (input.setupToken) access.searchParams.set('token', input.setupToken)
	const message = {
		'setup-used':
			'Your account setup link was opened. You can use the same link on another device until it expires or you register your first passkey.',
		'first-passkey':
			'Your first passkey was registered. All setup links and setup sessions are now invalid.',
		'setup-replaced':
			'You requested a replacement setup link. This link works for seven days or until your first passkey is registered. Your previous link and setup sessions are now invalid.'
	}[input.kind]
	await enqueueSystemEmail(rt.queueSettings, rt.database.pool, {
		template: 'identity.security',
		to: input.email,
		data: { message, accessUrl: access.href, baseUrl: rt.config.PUBLIC_BASE_URL },
		idempotencyKey: `identity-security:${input.id}`,
		priority: 10
	})
	return json({ queued: true }, { status: 202 })
}
