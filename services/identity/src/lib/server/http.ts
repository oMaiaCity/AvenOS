import { json, type RequestEvent } from '@sveltejs/kit'
import { runtime } from './runtime.js'

export async function sessionUser(event: RequestEvent) {
	const { auth } = await runtime()
	const session = await auth.api.getSession({ headers: event.request.headers })
	return session?.user.emailVerified ? session.user : null
}

export const unauthorized = () =>
	json({ code: 'AUTHENTICATION_REQUIRED', message: 'Sign in is required.' }, { status: 401 })
