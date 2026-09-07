import { timingSafeEqual } from 'node:crypto'
import { IdentityAuthenticationError, requireIdentity } from '@avenos/aven-identity'
import { isRedirect, json, type RequestEvent, type RequestHandler } from '@sveltejs/kit'
import { ZodError } from 'zod'
import type { SessionUser } from '$lib/types.js'
import { AppError } from './errors.js'
import { type Runtime, runtime } from './runtime.js'

// Wraps an API handler so AppError and ZodError map to structured JSON error
// responses, mirroring the express error handler in the original system.
export function api(
	handler: (
		event: RequestEvent,
		rt: Runtime
	) => Promise<{ body: unknown; status?: number } | Response>
): RequestHandler {
	return async (event) => {
		const rt = await runtime()
		try {
			const result = await handler(event, rt)
			if (result instanceof Response) return result
			return json(result.body, { status: result.status ?? 200 })
		} catch (error) {
			// A handler that navigates (redirect(...)) throws a control-flow signal,
			// not a failure — let SvelteKit have it.
			if (isRedirect(error)) throw error
			if (error instanceof AppError)
				return json(
					{
						code: error.code,
						message: error.message,
						...(error.details === undefined ? {} : { details: error.details })
					},
					{ status: error.status }
				)
			if (error instanceof ZodError)
				return json(
					{ code: 'VALIDATION_ERROR', message: 'The request was invalid.', details: error.issues },
					{ status: 400 }
				)
			rt.logger.error({ err: error }, 'unhandled api error')
			return json(
				{ code: 'INTERNAL_ERROR', message: 'The service could not complete the request.' },
				{ status: 500 }
			)
		}
	}
}

export async function requireUser(event: RequestEvent): Promise<SessionUser> {
	const rt = await runtime()
	try {
		let request = event.request
		const forwardedToken = request.headers.get('x-aven-identity-token')
		if (forwardedToken) {
			const actual = Buffer.from(request.headers.get('authorization') ?? '')
			const expected = Buffer.from(`Bearer ${rt.config.FACADE_BEARER_TOKEN ?? ''}`)
			if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
				throw new IdentityAuthenticationError('The facade credential is invalid.')
			const headers = new Headers(request.headers)
			headers.set('authorization', `Bearer ${forwardedToken}`)
			headers.delete('x-aven-identity-token')
			request = new Request(request, { headers })
		}
		const identity = await requireIdentity(request, rt.identityVerifier)
		return {
			id: identity.sub,
			name: identity.email.split('@')[0] ?? identity.email,
			email: identity.email,
			emailVerified: true,
			role: identity.role
		}
	} catch (error) {
		if (error instanceof IdentityAuthenticationError)
			throw new AppError(
				401,
				'AUTHENTICATION_REQUIRED',
				'A valid aven.id access token is required.'
			)
		throw error
	}
}

export async function readJson(event: RequestEvent): Promise<unknown> {
	try {
		return await event.request.json()
	} catch {
		throw new AppError(400, 'VALIDATION_ERROR', 'The request body must be JSON.')
	}
}
