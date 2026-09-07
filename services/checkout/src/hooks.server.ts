import { serverBuildRuntime } from 'virtual:aven-server-build-runtime'
import { BodyLimitError, readBoundedBytes } from '@avenos/http-boundary'
import type { Handle } from '@sveltejs/kit'
import { isCheckoutPath } from '$lib/server/surface.js'

export const handle: Handle = async (event) => {
	if (!isCheckoutPath(event.event.url.pathname)) return new Response('Not found', { status: 404 })
	if (!['GET', 'HEAD', 'OPTIONS'].includes(event.event.request.method)) {
		const path = event.event.url.pathname
		const limit =
			path === '/api/webhooks/polar'
				? 1024 * 1024
				: path.startsWith('/api/billing/') && path !== '/api/billing/fake-pay'
					? 8192
					: 16384
		try {
			const body = await readBoundedBytes(event.event.request, limit)
			event.event.request = new Request(event.event.request, { body })
		} catch (error) {
			if (error instanceof BodyLimitError)
				return Response.json({ code: error.code }, { status: error.status })
			throw error
		}
	}
	return serverBuildRuntime.handle(event)
}
