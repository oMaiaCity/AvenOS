import { createHmac } from 'node:crypto'
import { z } from 'zod'

export const environmentIdSchema = z.uuid()
export const databaseNameSchema = z.string().regex(/^cust_[0-9a-f]{32}$/)
export const roleSuffixSchema = z.string().regex(/^[a-z][a-z0-9_]{1,20}$/)
export const qualifiedRoleKindSchema = z
	.string()
	.regex(/^[a-z][a-z0-9-]{0,30}\.aven:db-role:[a-z][a-z0-9-]{0,30}:[a-z][a-z0-9-]{0,30}@1$/)

export function environmentHex(environmentId: string): string {
	return environmentIdSchema.parse(environmentId).replaceAll('-', '')
}

export function databaseNameForEnvironment(environmentId: string): string {
	return databaseNameSchema.parse(`cust_${environmentHex(environmentId)}`)
}

export function databaseRoleName(environmentId: string, suffix: string): string {
	const name = `c_${environmentHex(environmentId)}_${roleSuffixSchema.parse(suffix)}`
	if (Buffer.byteLength(name) > 63) throw new Error('derived PostgreSQL role exceeds 63 bytes')
	return name
}

export function deriveDatabasePassword(input: {
	root: string
	environmentId: string
	routingGeneration: number
	roleKind: string
}): string {
	if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.root))
		throw new Error('database credential root must be base64url and at least 256 bits')
	if (!Number.isSafeInteger(input.routingGeneration) || input.routingGeneration < 1)
		throw new Error('routing generation must be a positive safe integer')
	const roleKind = qualifiedRoleKindSchema.parse(input.roleKind)
	const message = [
		'aven/postgres-role/v1',
		environmentIdSchema.parse(input.environmentId),
		String(input.routingGeneration),
		roleKind
	].join('\0')
	return createHmac('sha256', Buffer.from(input.root, 'base64url'))
		.update(message, 'utf8')
		.digest('base64url')
}

export function quoteIdentifier(identifier: string): string {
	if (!/^[a-z][a-z0-9_]{0,62}$/.test(identifier))
		throw new Error(`unsafe PostgreSQL identifier: ${identifier}`)
	return `"${identifier}"`
}
