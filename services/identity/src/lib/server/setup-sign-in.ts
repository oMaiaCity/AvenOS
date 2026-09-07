import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { z } from 'zod'
import { SETUP_SESSION_SECONDS } from './enrollment.js'

export function setupSignIn(
	verify: (token: string) => Promise<{ userId: string; tokenHash: string } | null>
): BetterAuthPlugin {
	return {
		id: 'setup-sign-in',
		endpoints: {
			signInSetupToken: createAuthEndpoint(
				'/sign-in/setup-token',
				{
					method: 'GET',
					query: z.object({ token: z.string().min(32).max(256) })
				},
				async (ctx) => {
					const verified = await verify(ctx.query.token)
					const user = verified
						? await ctx.context.internalAdapter.findUserById(verified.userId)
						: null
					if (!user || !verified)
						throw new APIError('UNAUTHORIZED', { message: 'This setup link is unavailable.' })
					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						false,
						{
							setupTokenHash: verified.tokenHash,
							expiresAt: new Date(Date.now() + SETUP_SESSION_SECONDS * 1000)
						},
						true
					)
					if (!session)
						throw new APIError('UNAUTHORIZED', { message: 'Could not create a session.' })
					await setSessionCookie(ctx, { session, user })
					throw ctx.redirect('/dashboard')
				}
			)
		},
		rateLimit: [{ pathMatcher: (path) => path === '/sign-in/setup-token', window: 60, max: 20 }]
	}
}
