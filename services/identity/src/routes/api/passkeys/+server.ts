import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { sessionUser, unauthorized } from '$lib/server/http.js'
import { runtime } from '$lib/server/runtime.js'

const finalizeSchema = z.object({
	credentialId: z.string().min(1).optional(),
	prfEnabled: z.boolean()
})
export const GET = async (event) => {
	const user = await sessionUser(event)
	if (!user) return unauthorized()
	const rt = await runtime()
	return json({
		passkeys: await rt.passkeys.list(user.id),
		requirePrf: rt.config.REQUIRE_PASSKEY_PRF
	})
}
export const POST = async (event) => {
	const user = await sessionUser(event)
	if (!user) return unauthorized()
	try {
		const input = finalizeSchema.parse(await event.request.json())
		await (await runtime()).passkeys.finalize(user.id, input.credentialId, input.prfEnabled)
		return json({ enrolled: true })
	} catch (error) {
		return json(
			{
				code: 'PASSKEY_FINALIZATION_FAILED',
				message: error instanceof Error ? error.message : 'Could not finalize passkey registration.'
			},
			{ status: 409 }
		)
	}
}
