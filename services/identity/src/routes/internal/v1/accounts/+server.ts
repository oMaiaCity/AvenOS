import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { runtime } from '$lib/server/runtime.js'
import { constantTimeAnyBearer, constantTimeBearer } from '$lib/server/tokens.js'

const requestSchema = z.object({
	email: z.email(),
	source: z.string().min(1).max(80),
	resend: z.boolean().optional()
})
export const POST = async ({ request }) => {
	const rt = await runtime()
	if (!constantTimeAnyBearer(request, rt.config.IDENTITY_PROVISIONING_SECRETS))
		return json({ code: 'UNAUTHORIZED' }, { status: 401 })
	try {
		const input = requestSchema.parse(await request.json())
		const account = await rt.accounts.provisionVerified(input.email)
		const index = rt.config.IDENTITY_PROVISIONING_SECRETS.findIndex((secret) =>
			constantTimeBearer(request, secret)
		)
		const channel = rt.config.IDENTITY_MAIL_ORIGINS[index]
		if (channel)
			await rt.database.pool.query('UPDATE "user" SET notification_channel=$1 WHERE id=$2', [
				channel,
				account.id
			])
		const setupToken = await rt.passkeys.issueSetupLink(
			account.id,
			input.resend
				? {
						origins: rt.config.IDENTITY_MAIL_ORIGINS,
						encryptionSecret: rt.config.BETTER_AUTH_SECRET
					}
				: undefined
		)
		if (input.resend) return json({ account, setupUrl: null, emailQueued: Boolean(setupToken) })
		const setupUrl = setupToken
			? new URL(
					`/api/auth/sign-in/setup-token?token=${encodeURIComponent(setupToken)}`,
					rt.config.PUBLIC_BASE_URL
				).href
			: null
		return json({ account, setupUrl }, { status: 200 })
	} catch (error) {
		rt.logger.warn({ err: error }, 'account provisioning rejected')
		return json(
			{ code: 'INVALID_ACCOUNT_PROVISIONING_REQUEST', message: 'The account request is invalid.' },
			{ status: 400 }
		)
	}
}
