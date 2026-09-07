import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { runtime } from '$lib/server/runtime.js'
import { constantTimeAnyBearer } from '$lib/server/tokens.js'

const requestSchema = z.object({ subjectIds: z.array(z.string().uuid()).max(500) })

export const POST = async ({ request }) => {
	const rt = await runtime()
	if (!constantTimeAnyBearer(request, rt.config.IDENTITY_PROVISIONING_SECRETS))
		return json({ code: 'UNAUTHORIZED' }, { status: 401 })
	try {
		const { subjectIds } = requestSchema.parse(await request.json())
		return json({ roles: await rt.authorizations.roles([...new Set(subjectIds)]) })
	} catch {
		return json(
			{ code: 'INVALID_AUTHORIZATION_REQUEST', message: 'The authorization request is invalid.' },
			{ status: 400 }
		)
	}
}
