import { BodyLimitError, readBoundedBytes } from '@avenos/http-boundary'
import { json } from '@sveltejs/kit'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { building } from '$app/environment'
import { namePasskeyRegistration, passkeyNameSchema } from '$lib/passkey-name.js'
import { enrollmentContext, setupAllowedPaths } from '$lib/server/enrollment.js'
import { ProofOfWorkError, protectedAuthPaths } from '$lib/server/proof-of-work.js'
import { runtime } from '$lib/server/runtime.js'

export const handle = async ({ event, resolve }) => {
	if (building) return resolve(event)
	if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
		try {
			const path = event.url.pathname
			const limit =
				path === '/api/passkeys' ||
				path === '/api/auth/passkey/update-passkey' ||
				path === '/internal/v1/accounts'
					? 4096
					: path === '/internal/v1/authorizations/roles'
						? 32768
						: path.startsWith('/api/auth/device/')
							? 16384
							: 128 * 1024
			const bytes = await readBoundedBytes(event.request, limit)
			event.request = new Request(event.request, { body: bytes })
		} catch (error) {
			if (error instanceof BodyLimitError)
				return json({ code: error.code }, { status: error.status })
			throw error
		}
	}
	const { auth, config, proofOfWork, database } = await runtime()
	const origin = event.request.headers.get('origin')
	const allowedOrigins = new Set([
		config.PUBLIC_BASE_URL,
		...config.TRUSTED_WEB_ORIGINS.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	])
	const normalizedPath = event.url.pathname.replace(/\/$/, '')
	const registrationName =
		event.request.method === 'GET' &&
		normalizedPath === '/api/auth/passkey/generate-register-options'
			? event.url.searchParams.get('name')
			: null
	if (registrationName !== null && !passkeyNameSchema.safeParse(registrationName).success)
		return json(
			{ code: 'INVALID_PASSKEY_NAME', message: 'Use 1–128 characters for the passkey name.' },
			{ status: 400 }
		)
	if (
		event.request.method === 'POST' &&
		['/api/auth/passkey/update-passkey', '/api/auth/passkey/verify-registration'].includes(
			normalizedPath
		)
	) {
		const body = await event.request
			.clone()
			.json()
			.catch(() => null)
		if (body?.name !== undefined && !passkeyNameSchema.safeParse(body.name).success)
			return json(
				{ code: 'INVALID_PASSKEY_NAME', message: 'Use 1–128 characters for the passkey name.' },
				{ status: 400 }
			)
	}
	const publicDeviceExchange =
		normalizedPath === '/api/auth/device/code' || normalizedPath === '/api/auth/device/token'
	if (
		event.url.pathname.startsWith('/api/') &&
		!publicDeviceExchange &&
		!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
		(!origin || !allowedOrigins.has(origin))
	)
		return json(
			{ code: 'ORIGIN_NOT_ALLOWED', message: 'The request origin is not allowed.' },
			{ status: 403 }
		)
	if (event.request.method === 'OPTIONS' && origin && allowedOrigins.has(origin)) {
		return new Response(null, {
			status: 204,
			headers: {
				'access-control-allow-origin': origin,
				'access-control-allow-credentials': 'true',
				'access-control-allow-methods': 'GET,POST,OPTIONS',
				'access-control-allow-headers': 'content-type,x-proof-of-work'
			}
		})
	}
	if (event.request.method === 'POST' && protectedAuthPaths.has(event.url.pathname)) {
		try {
			await proofOfWork.verifyAndConsume(event.request.headers.get('x-proof-of-work'))
		} catch (error) {
			if (error instanceof ProofOfWorkError)
				return json({ code: error.code, message: error.message }, { status: 403 })
			throw error
		}
	}
	if (event.url.pathname.startsWith('/api/')) {
		const session = await auth.api.getSession({ headers: event.request.headers })
		if (session) {
			const row = (
				await database.pool.query<{ setup_token_hash: string | null; pending: boolean }>(
					`SELECT s.setup_token_hash, EXISTS(SELECT 1 FROM setup_links l
				 WHERE l.user_id=s.user_id AND l.token_hash=s.setup_token_hash AND l.expires_at > now()) AS pending
				 FROM session s WHERE s.id=$1`,
					[session.session.id]
				)
			).rows[0]
			if (row?.setup_token_hash && (!row.pending || !setupAllowedPaths.has(normalizedPath)))
				return json({ code: 'PASSKEY_ENROLLMENT_REQUIRED' }, { status: 403 })
		}
	}
	let response = await enrollmentContext.run({}, () =>
		svelteKitHandler({ event, resolve, auth, building })
	)
	if (registrationName !== null && response.ok) {
		const options = await response.json()
		const headers = new Headers(response.headers)
		headers.delete('content-length')
		response = json(namePasskeyRegistration(options, registrationName), {
			status: response.status,
			headers
		})
	}
	response.headers.set('x-content-type-options', 'nosniff')
	response.headers.set('referrer-policy', 'no-referrer')
	response.headers.set('x-frame-options', 'DENY')
	if (event.url.pathname.startsWith('/api/')) response.headers.set('cache-control', 'no-store')
	if (origin && allowedOrigins.has(origin)) {
		response.headers.set('access-control-allow-origin', origin)
		response.headers.set('access-control-allow-credentials', 'true')
		response.headers.append('vary', 'Origin')
	}
	return response
}
