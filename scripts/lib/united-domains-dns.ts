import { isIP } from 'node:net'

const DEFAULT_BASE_URL = 'https://dnsapi.united-domains.de/dns'

export interface UnitedDomainsZone {
	id: string
	name: string
	type: string
}

export interface UnitedDomainsRecord {
	id: string
	name: string
	type: string
	content: string
	ttl: number
	disabled: boolean
}

interface ClientOptions {
	apiKey: string
	baseUrl?: string
	fetch?: typeof globalThis.fetch
}

function canonicalAddress(value: string): string {
	return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value
}

function client(options: ClientOptions) {
	const apiKey = options.apiKey.trim()
	if (!/^[^.\s]+\.[^.\s]+$/.test(apiKey))
		throw new Error('The United Domains API key must contain its public prefix and secret.')
	const fetcher = options.fetch ?? globalThis.fetch
	const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
	return async <T>(path: string, init: RequestInit = {}): Promise<T> => {
		const response = await fetcher(`${baseUrl}${path}`, {
			...init,
			headers: {
				Accept: 'application/json',
				'X-API-Key': apiKey,
				...(init.body ? { 'Content-Type': 'application/json' } : {}),
				...init.headers
			},
			signal: init.signal ?? AbortSignal.timeout(20_000)
		})
		if (!response.ok) {
			let detail = ''
			try {
				const body = (await response.json()) as unknown
				const errors = Array.isArray(body) ? body : [body]
				detail = errors
					.flatMap((entry) =>
						typeof entry === 'object' &&
						entry !== null &&
						typeof (entry as { message?: unknown }).message === 'string'
							? [(entry as { message: string }).message]
							: []
					)
					.join('; ')
			} catch {}
			throw new Error(
				`United Domains DNS API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}.`
			)
		}
		if (response.status === 204 || response.headers.get('content-length') === '0')
			return undefined as T
		const text = await response.text()
		return (text ? JSON.parse(text) : undefined) as T
	}
}

function validZone(value: unknown): value is UnitedDomainsZone {
	if (!value || typeof value !== 'object') return false
	const zone = value as Record<string, unknown>
	return (
		typeof zone.id === 'string' && typeof zone.name === 'string' && typeof zone.type === 'string'
	)
}

function validRecord(value: unknown): value is UnitedDomainsRecord {
	if (!value || typeof value !== 'object') return false
	const record = value as Record<string, unknown>
	return (
		typeof record.id === 'string' &&
		typeof record.name === 'string' &&
		typeof record.type === 'string' &&
		typeof record.content === 'string' &&
		typeof record.ttl === 'number' &&
		typeof record.disabled === 'boolean'
	)
}

export async function unitedDomainsZone(
	options: ClientOptions,
	zoneName = 'aven.id'
): Promise<UnitedDomainsZone> {
	const request = client(options)
	const zones = await request<unknown>('/v1/zones')
	if (!Array.isArray(zones)) throw new Error('United Domains returned an invalid zone list.')
	const zone = zones.filter(validZone).find((candidate) => candidate.name === zoneName)
	if (!zone) throw new Error(`The United Domains API key cannot access ${zoneName}.`)
	if (zone.type !== 'NATIVE') throw new Error(`${zoneName} is not a writable native DNS zone.`)
	return zone
}

async function addressRecords(options: ClientOptions, zone: UnitedDomainsZone) {
	const request = client(options)
	const records = await Promise.all(
		(['A', 'AAAA'] as const).map(async (recordType) => {
			const query = new URLSearchParams({ recordName: zone.name, recordType })
			const result = await request<unknown>(`/v1/zones/${encodeURIComponent(zone.id)}?${query}`)
			if (
				!result ||
				typeof result !== 'object' ||
				!Array.isArray((result as { records?: unknown }).records)
			)
				throw new Error(`United Domains returned invalid ${recordType} records for ${zone.name}.`)
			return (result as { records: unknown[] }).records.filter(validRecord)
		})
	)
	return records.flat()
}

export async function verifyUnitedDomainsDnsAccess(
	options: ClientOptions
): Promise<UnitedDomainsZone> {
	const zone = await unitedDomainsZone(options)
	await addressRecords(options, zone)
	return zone
}

export async function reconcileUnitedDomainsIdentityDns(
	options: ClientOptions & { ipv4: string; ipv6: string }
): Promise<void> {
	if (isIP(options.ipv4) !== 4 || isIP(options.ipv6) !== 6)
		throw new Error('Identity DNS requires one valid IPv4 and one valid IPv6 address.')
	const zone = await unitedDomainsZone(options)
	const request = client(options)
	await request(`/v1/zones/${encodeURIComponent(zone.id)}`, {
		method: 'PATCH',
		body: JSON.stringify([
			{ name: zone.name, type: 'A', content: options.ipv4, ttl: 300, prio: 0, disabled: false },
			{ name: zone.name, type: 'AAAA', content: options.ipv6, ttl: 300, prio: 0, disabled: false }
		])
	})
	const records = (await addressRecords(options, zone)).filter((record) => !record.disabled)
	const ipv4 = records.filter((record) => record.type === 'A').map((record) => record.content)
	const ipv6 = records.filter((record) => record.type === 'AAAA').map((record) => record.content)
	if (
		ipv4.length !== 1 ||
		canonicalAddress(ipv4[0] as string) !== canonicalAddress(options.ipv4) ||
		ipv6.length !== 1 ||
		canonicalAddress(ipv6[0] as string) !== canonicalAddress(options.ipv6)
	)
		throw new Error(
			'United Domains accepted the update but did not return the exact identity records.'
		)
}

export async function removeUnitedDomainsIdentityDns(
	options: ClientOptions & { ipv4?: string; ipv6?: string }
): Promise<number> {
	const zone = await unitedDomainsZone(options)
	const request = client(options)
	const records = await addressRecords(options, zone)
	const matching = records.filter(
		(record) =>
			record.name === zone.name &&
			((record.type === 'A' &&
				canonicalAddress(record.content) === canonicalAddress(options.ipv4 ?? '')) ||
				(record.type === 'AAAA' &&
					canonicalAddress(record.content) === canonicalAddress(options.ipv6 ?? '')))
	)
	for (const record of matching)
		await request(
			`/v1/zones/${encodeURIComponent(zone.id)}/records/${encodeURIComponent(record.id)}`,
			{
				method: 'DELETE'
			}
		)
	return matching.length
}
