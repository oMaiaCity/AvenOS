import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'
import { membershipAllows } from './authorization.js'
import { componentRefSchema } from './manifest.js'
import { databaseNameSchema, environmentIdSchema } from './roles.js'

export const tenantGrantClaimsSchema = z
	.object({
		iss: z.string().url(),
		aud: componentRefSchema,
		sub: z.uuid(),
		sid: z.string().min(1).max(256),
		role: z.enum(['user', 'admin']),
		membershipRole: z.enum(['owner', 'admin', 'member']),
		environmentId: environmentIdSchema,
		databaseName: databaseNameSchema,
		routingGeneration: z.number().int().positive(),
		componentRef: componentRefSchema,
		actions: z.array(z.string().regex(/^[a-z][a-z0-9:-]{0,80}$/)).min(1),
		iat: z.number().int().positive(),
		exp: z.number().int().positive()
	})
	.strict()

export type TenantGrantClaims = z.infer<typeof tenantGrantClaimsSchema>
export type TenantGrantKey = Awaited<ReturnType<typeof importPKCS8>>

export async function importTenantGrantPrivateKey(pem: string): Promise<TenantGrantKey> {
	return importPKCS8(pem.replaceAll('\\n', '\n'), 'EdDSA')
}

export async function importTenantGrantPublicKey(pem: string): Promise<TenantGrantKey> {
	return importSPKI(pem.replaceAll('\\n', '\n'), 'EdDSA')
}

export async function signTenantGrant(
	claims: Omit<TenantGrantClaims, 'iat' | 'exp'>,
	privateKey: TenantGrantKey,
	ttlSeconds = 60,
	nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
	if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 60)
		throw new Error('tenant grant TTL must be between 1 and 60 seconds')
	const validated = tenantGrantClaimsSchema.parse({
		...claims,
		iat: nowSeconds,
		exp: nowSeconds + ttlSeconds
	})
	if (!membershipAllows(validated.membershipRole, validated.componentRef, validated.actions))
		throw new Error('customer membership does not authorize these actions')
	return new SignJWT({
		sid: validated.sid,
		role: validated.role,
		membershipRole: validated.membershipRole,
		environmentId: validated.environmentId,
		databaseName: validated.databaseName,
		routingGeneration: validated.routingGeneration,
		componentRef: validated.componentRef,
		actions: validated.actions
	})
		.setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
		.setIssuer(validated.iss)
		.setAudience(validated.aud)
		.setSubject(validated.sub)
		.setIssuedAt(validated.iat)
		.setExpirationTime(validated.exp)
		.sign(privateKey)
}

export async function verifyTenantGrant(
	token: string,
	publicKey: TenantGrantKey,
	input: { issuer: string; audience: string; action: string }
): Promise<TenantGrantClaims> {
	const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
		issuer: input.issuer,
		audience: input.audience,
		algorithms: ['EdDSA'],
		maxTokenAge: '60s',
		clockTolerance: 2
	})
	if (protectedHeader.typ !== 'JWT') throw new Error('invalid tenant grant type')
	const claims = tenantGrantClaimsSchema.parse(payload)
	if (claims.componentRef !== input.audience || !claims.actions.includes(input.action) ||
		!membershipAllows(claims.membershipRole, claims.componentRef, claims.actions))
		throw new Error('tenant grant does not authorize this action')
	return claims
}
