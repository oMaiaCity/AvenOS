import { createRemoteJWKSet, customFetch, type JWTPayload, jwtVerify } from 'jose'
import { z } from 'zod'

const claimsSchema = z.object({
	sub: z.string().uuid(),
	sid: z.string().min(1),
	email: z.email(),
	email_verified: z.literal(true),
	role: z.enum(['user', 'admin']),
	amr: z.array(z.enum(['passkey', 'bootstrap'])).min(1),
	scope: z.string(),
	iss: z.string(),
	aud: z.union([z.string(), z.array(z.string())]),
	exp: z.number(),
	iat: z.number().optional()
})

export type IdentityClaims = z.infer<typeof claimsSchema>
export interface IdentityVerifierOptions {
	issuer: string
	audience?: string
	jwksUrl?: string
	fetch?: typeof fetch
}

export class IdentityVerifier {
	readonly issuer: string
	readonly audience: string
	private readonly keys: ReturnType<typeof createRemoteJWKSet>

	constructor(options: IdentityVerifierOptions) {
		this.issuer = options.issuer.replace(/\/$/, '')
		this.audience = options.audience ?? 'aven-services'
		this.keys = createRemoteJWKSet(
			new URL(options.jwksUrl ?? `${this.issuer}/api/auth/jwks`),
			options.fetch ? { [customFetch]: options.fetch } : undefined
		)
	}

	async verify(token: string): Promise<IdentityClaims> {
		const { payload } = await jwtVerify(token, this.keys, {
			issuer: this.issuer,
			audience: this.audience,
			algorithms: ['EdDSA'],
			requiredClaims: ['sub', 'sid', 'email', 'email_verified', 'role', 'scope', 'exp']
		})
		return claimsSchema.parse(payload)
	}
}

export function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization')
	return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

export async function requireIdentity(
	request: Request,
	verifier: Pick<IdentityVerifier, 'verify'>
): Promise<IdentityClaims> {
	const token = bearerToken(request)
	if (!token) throw new IdentityAuthenticationError('Bearer access token required.')
	try {
		const claims = await verifier.verify(token)
		if (!claims.scope.split(/\s+/).includes('services:access') || !claims.amr.includes('passkey'))
			throw new Error('authorization scope missing')
		return claims
	} catch {
		throw new IdentityAuthenticationError('Access token is invalid or expired.')
	}
}

export class IdentityAuthenticationError extends Error {}

export interface ProvisionedAccount {
	account: { id: string; name: string; email: string; role: 'user' | 'admin' }
	setupUrl: string | null
}

export class IdentityProvisioningClient {
	constructor(
		private readonly baseUrl: string,
		private readonly secret: string,
		private readonly fetcher: typeof fetch = fetch
	) {}
	async provisionVerifiedAccount(email: string, source: string): Promise<ProvisionedAccount> {
		const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}/internal/v1/accounts`, {
			method: 'POST',
			headers: { authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
			body: JSON.stringify({ email, source })
		})
		if (!response.ok) throw new Error(`Identity provisioning failed (${response.status}).`)
		return response.json() as Promise<ProvisionedAccount>
	}

	async roles(subjectIds: string[]): Promise<Map<string, 'user' | 'admin'>> {
		if (subjectIds.length === 0) return new Map()
		const response = await this.fetcher(
			`${this.baseUrl.replace(/\/$/, '')}/internal/v1/authorizations/roles`,
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${this.secret}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ subjectIds: [...new Set(subjectIds)] })
			}
		)
		if (!response.ok) throw new Error(`Identity authorization lookup failed (${response.status}).`)
		const body = (await response.json()) as { roles: Record<string, 'user' | 'admin'> }
		return new Map(Object.entries(body.roles))
	}
}

export function identitySubject(payload: JWTPayload): string | null {
	return typeof payload.sub === 'string' ? payload.sub : null
}
