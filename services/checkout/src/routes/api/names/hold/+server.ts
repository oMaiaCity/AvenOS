import { api, readJson } from '$lib/server/api.js'
import { AppError } from '$lib/server/errors.js'
import { ProofOfWorkError } from '$lib/server/proof-of-work.js'
import { rateLimit } from '$lib/server/rate-limit.js'
import { secureNameSchema } from '$lib/validation.js'

export const POST = api(async (event, rt) => {
	if (!rateLimit(`names-hold:${event.getClientAddress()}`, 10, 3_600_000))
		throw new AppError(429, 'RATE_LIMITED', 'Too many hold attempts. Retry later.')
	try {
		await rt.proofOfWork.verifyAndConsume(
			'secure-name',
			event.request.headers.get('x-proof-of-work') ?? undefined
		)
	} catch (error) {
		if (error instanceof ProofOfWorkError) throw new AppError(403, error.code, error.message)
		throw error
	}
	const input = secureNameSchema.parse(await readJson(event))
	const hold = await rt.names.secure(input.name, input.email, {
		tier: input.tier,
		salutation: input.salutation,
		idea: input.idea
	})
	return { status: 201, body: { hold } }
})
