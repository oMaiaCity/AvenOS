import type { RequestEvent } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { proofOfWorkPurposes } from '$lib/server/proof-of-work.js'
import { rateLimit } from '$lib/server/rate-limit.js'
import { runtime } from '$lib/server/runtime.js'
import type { ProofOfWorkPurpose } from '$lib/types.js'

export const GET = async (event: RequestEvent) => {
	if (!rateLimit(`pow:${event.getClientAddress()}`, 30, 60_000))
		return json(
			{ code: 'RATE_LIMITED', message: 'Too many challenge requests. Retry shortly.' },
			{ status: 429 }
		)
	const purpose = event.url.searchParams.get('purpose') ?? ''
	if (!proofOfWorkPurposes.has(purpose as ProofOfWorkPurpose))
		return json(
			{
				code: 'PROOF_OF_WORK_PURPOSE_INVALID',
				message: 'Choose a supported proof-of-work purpose.'
			},
			{ status: 400 }
		)
	const { proofOfWork } = await runtime()
	return json(await proofOfWork.issue(purpose as ProofOfWorkPurpose), {
		headers: { 'Cache-Control': 'no-store' }
	})
}
