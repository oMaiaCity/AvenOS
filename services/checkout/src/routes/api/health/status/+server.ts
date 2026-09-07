import { json } from '@sveltejs/kit'
import { workerFreshness } from '$lib/server/ops.js'
import { runtime } from '$lib/server/runtime.js'

export const GET = async () => {
	const { database, config, payments } = await runtime()
	const heartbeats = await workerFreshness(database.pool)
	const emailSeen = heartbeats.get('email-worker')
	const emailAlive = Boolean(
		emailSeen && Date.now() - emailSeen.getTime() <= config.EMAIL_WORKER_STALE_SECONDS * 1000
	)
	return json({
		overall: emailAlive ? 'healthy' : 'degraded',
		service: 'checkout',
		capabilities: {
			identityVerification: true,
			payments: payments.kind,
			emailDelivery: emailAlive ? 'available' : 'delayed'
		}
	})
}
