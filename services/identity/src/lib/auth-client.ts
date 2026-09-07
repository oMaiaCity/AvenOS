import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/svelte'
import { proofHeader } from './proof-of-work.js'

async function protectedFetch(
	input: string | URL | Request,
	init?: RequestInit
): Promise<Response> {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
	const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
	if (method === 'POST' && url.includes('/passkey/verify-authentication')) {
		const headers = new Headers(init?.headers)
		for (const [name, value] of Object.entries(await proofHeader())) headers.set(name, value)
		init = { ...init, headers }
	}
	return fetch(input, init)
}

export const authClient = createAuthClient({
	fetchOptions: { customFetchImpl: protectedFetch },
	plugins: [passkeyClient()]
})
