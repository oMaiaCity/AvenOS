import { type PlanId, planOrder } from '@myavenceo/aven-ceo/pricing'
import { z } from 'zod'

// The single email validator. Zod's default z.email() is ASCII-only and
// rejects valid internationalized addresses (jürgen@gmx.de); the unicode
// pattern accepts them. NFC normalization keeps composed/decomposed forms
// matching the same account.
export const emailAddress = z
	.email({ pattern: z.regexes.unicodeEmail })
	.refine((value) => (value.split('@').pop() ?? '').includes('.'), {
		message: 'Enter a full email address.'
	})
	.transform((value) => value.trim().toLowerCase().normalize('NFC'))

// Purchasable names: 3–32 chars, lowercase letters/digits, internal hyphens.
export const namePattern = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/
export const reservedNames = new Set([
	'admin',
	'administrator',
	'api',
	'app',
	'aven',
	'billing',
	'dashboard',
	'help',
	'id',
	'login',
	'logout',
	'mail',
	'name',
	'names',
	'official',
	'pay',
	'payment',
	'root',
	'security',
	'signup',
	'smtp',
	'staff',
	'status',
	'support',
	'system',
	'tasks',
	'test',
	'webmail',
	'www'
])

export function normalizeName(value: string): string {
	return value.trim().toLowerCase()
}
export function validateName(value: string): 'NAME_INVALID' | 'NAME_RESERVED' | null {
	if (!namePattern.test(value)) return 'NAME_INVALID'
	return reservedNames.has(value) ? 'NAME_RESERVED' : null
}

export const secureNameSchema = z.object({
	name: z.string().trim().toLowerCase().min(3).max(32),
	email: emailAddress,
	// Optional customer context, bounded so free text cannot become unbounded storage.
	// Only current canonical plan identifiers from the pricing SSOT are accepted.
	tier: z
		.string()
		.refine(
			(value): value is PlanId => (planOrder as readonly string[]).includes(value),
			'Unknown tier.'
		)
		.optional(),
	salutation: z.string().trim().max(120).optional(),
	idea: z.string().trim().max(2000).optional()
})

export function sanitizeError(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value)
	return message
		.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED]')
		.replace(/(token|secret|password|key|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
		.slice(0, 500)
}
