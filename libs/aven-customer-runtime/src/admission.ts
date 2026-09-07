import { timingSafeEqual } from 'node:crypto'
import {
	type TenantGrantClaims,
	type TenantGrantKey,
	verifyTenantGrant
} from '@avenos/aven-customer-contracts'
import {
	IdentityAuthenticationError,
	type IdentityClaims,
	type IdentityVerifier
} from '@avenos/aven-identity'

export class CustomerAdmissionError extends Error {}

function equalSecret(actual: string, expected: string): boolean {
	const left = Buffer.from(actual)
	const right = Buffer.from(expected)
	return left.length === right.length && timingSafeEqual(left, right)
}

export async function admitCustomerRequest(
	request: Request,
	input: {
		serviceToken: string
		identityVerifier: Pick<IdentityVerifier, 'verify'>
		tenantGrantPublicKey: TenantGrantKey
		tenantGrantIssuer: string
		componentRef: string
		requiredAction: string
	}
): Promise<{ identity: IdentityClaims; identityToken: string; tenant: TenantGrantClaims }> {
	const serviceBearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
	if (!equalSecret(serviceBearer, input.serviceToken)) throw new CustomerAdmissionError()
	const identityToken = request.headers.get('x-aven-identity-token') ?? ''
	const tenantToken = request.headers.get('x-aven-tenant-grant') ?? ''
	try {
		const [identity, tenant] = await Promise.all([
			input.identityVerifier.verify(identityToken),
			verifyTenantGrant(tenantToken, input.tenantGrantPublicKey, {
				issuer: input.tenantGrantIssuer,
				audience: input.componentRef,
				action: input.requiredAction
			})
		])
		if (
			!identity.scope.split(/\s+/).includes('services:access') ||
			!identity.amr.includes('passkey') ||
			request.headers.get('x-aven-subject') !== identity.sub ||
			request.headers.get('x-aven-role') !== identity.role ||
			request.headers.get('x-aven-session') !== identity.sid ||
			tenant.sub !== identity.sub ||
			tenant.sid !== identity.sid ||
			tenant.role !== identity.role
		)
			throw new Error('identity and tenant grant binding mismatch')
		return { identity, identityToken, tenant }
	} catch (error) {
		if (error instanceof IdentityAuthenticationError) throw new CustomerAdmissionError()
		throw new CustomerAdmissionError()
	}
}
