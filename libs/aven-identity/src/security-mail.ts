import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

// A purpose-separated relay credential, independent for each platform environment.
// No additional operator credential or SMTP access is given to identity.
export function securityMailToken(provisioningSecret: string): string {
	return createHmac('sha256', provisioningSecret)
		.update('aven.identity.security-mail.v1')
		.digest('base64url')
}
export function acceptsSecurityMail(request: Request, provisioningSecret: string): boolean {
	const actual = Buffer.from(request.headers.get('authorization') ?? '')
	const expected = Buffer.from(`Bearer ${securityMailToken(provisioningSecret)}`)
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export const securityMailSchema = z
	.object({
		id: z.string().uuid(),
		email: z.email().max(320),
		kind: z.enum(['setup-used', 'first-passkey', 'setup-replaced']),
		setupToken: z
			.string()
			.regex(/^[A-Za-z0-9_-]{43}$/)
			.optional()
	})
	.strict()
	.superRefine((value, ctx) => {
		if ((value.kind === 'setup-replaced') !== Boolean(value.setupToken))
			ctx.addIssue({ code: 'custom', message: 'Only replacement mail contains a setup token.' })
	})
