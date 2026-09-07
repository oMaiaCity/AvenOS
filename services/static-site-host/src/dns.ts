import { createHash } from 'node:crypto'
import * as dns from 'node:dns/promises'

export interface DnsResolver {
	resolveTxt(hostname: string): Promise<string[][]>
	resolve4(hostname: string): Promise<string[]>
	resolve6(hostname: string): Promise<string[]>
}

function missing(error: unknown): boolean {
	return ['ENODATA', 'ENOTFOUND', 'ESERVFAIL'].includes((error as { code?: string }).code ?? '')
}

async function optional<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await operation()
	} catch (error) {
		if (missing(error)) return fallback
		throw error
	}
}

export async function verifyDns(
	hostname: string,
	tokenHash: string,
	allowedIpv4: Set<string>,
	allowedIpv6: Set<string>,
	verificationMode: 'txt' | 'operator' = 'txt',
	resolver: DnsResolver = dns
): Promise<{ ok: boolean; reason?: string }> {
	if (verificationMode === 'txt') {
		const records = await optional(() => resolver.resolveTxt(`_aven-site.${hostname}`), [])
		const verified = records.some(
			(parts) => createHash('sha256').update(parts.join('')).digest('hex') === tokenHash
		)
		if (!verified) return { ok: false, reason: 'TXT ownership verification is missing or invalid' }
	}
	const ipv4 = await optional(() => resolver.resolve4(hostname), [])
	if (!ipv4.length || ipv4.some((address) => !allowedIpv4.has(address)))
		return { ok: false, reason: 'A records must point only to this hosting service' }
	const ipv6 = await optional(() => resolver.resolve6(hostname), [])
	if (ipv6.some((address) => !allowedIpv6.has(address)))
		return { ok: false, reason: 'AAAA records must point only to this hosting service' }
	return { ok: true }
}
