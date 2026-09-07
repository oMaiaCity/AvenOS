import { json } from '@sveltejs/kit'
import { sessionUser, unauthorized } from '$lib/server/http.js'
import { runtime } from '$lib/server/runtime.js'

export const POST = async (event) => {
	const user = await sessionUser(event)
	if (!user) return unauthorized()
	const rt = await runtime()
	try {
		const token = await rt.passkeys.issueSetupLink(user.id, {
			origins: rt.config.IDENTITY_MAIL_ORIGINS,
			encryptionSecret: rt.config.BETTER_AUTH_SECRET
		})
		if (!token) return json({ code: 'PASSKEY_ALREADY_REGISTERED' }, { status: 409 })
		return json({ emailQueued: true })
	} catch {
		return json(
			{
				code: 'SETUP_MAIL_UNAVAILABLE',
				message: 'Could not replace the setup link. Wait one minute and try again.'
			},
			{ status: 409 }
		)
	}
}
