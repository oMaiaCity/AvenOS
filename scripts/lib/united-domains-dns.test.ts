import { expect, test } from 'bun:test'
import {
	reconcileUnitedDomainsIdentityDns,
	removeUnitedDomainsIdentityDns,
	verifyUnitedDomainsDnsAccess
} from './united-domains-dns'

const baseUrl = 'https://dns.example.test/dns'
const zone = { id: 'zone-1', name: 'aven.id', type: 'NATIVE' }
const json = (value: unknown, status = 200) => Response.json(value, { status })

function record(id: string, type: 'A' | 'AAAA', content: string) {
	return { id, name: 'aven.id', rootName: 'aven.id', type, content, ttl: 300, disabled: false }
}

test('validates that the credential can read the writable aven.id zone', async () => {
	const requests: Request[] = []
	const fetch = async (input: string | URL | Request, init?: RequestInit) => {
		const request = new Request(input, init)
		requests.push(request)
		if (request.url.endsWith('/v1/zones')) return json([zone])
		return json({ ...zone, records: [] })
	}
	await expect(
		verifyUnitedDomainsDnsAccess({ apiKey: 'prefix.secret', baseUrl, fetch })
	).resolves.toEqual(zone)
	expect(requests).toHaveLength(3)
	expect(requests.every((request) => request.headers.get('X-API-Key') === 'prefix.secret')).toBe(
		true
	)
})

test('atomically replaces apex A and AAAA records and verifies the provider result', async () => {
	let patchBody: unknown
	const fetch = async (input: string | URL | Request, init?: RequestInit) => {
		const request = new Request(input, init)
		if (request.url.endsWith('/v1/zones')) return json([zone])
		if (request.method === 'PATCH') {
			patchBody = await request.json()
			return new Response(null, { status: 200 })
		}
		return json({
			...zone,
			records: request.url.includes('recordType=AAAA')
				? [record('aaaa', 'AAAA', '2001:db8::10')]
				: [record('a', 'A', '192.0.2.10')]
		})
	}
	await reconcileUnitedDomainsIdentityDns({
		apiKey: 'prefix.secret',
		baseUrl,
		fetch,
		ipv4: '192.0.2.10',
		ipv6: '2001:db8::10'
	})
	expect(patchBody).toEqual([
		{ name: 'aven.id', type: 'A', content: '192.0.2.10', ttl: 300, prio: 0, disabled: false },
		{
			name: 'aven.id',
			type: 'AAAA',
			content: '2001:db8::10',
			ttl: 300,
			prio: 0,
			disabled: false
		}
	])
})

test('uninstall deletes only the saved generation addresses', async () => {
	const deleted: string[] = []
	const fetch = async (input: string | URL | Request, init?: RequestInit) => {
		const request = new Request(input, init)
		if (request.url.endsWith('/v1/zones')) return json([zone])
		if (request.method === 'DELETE') {
			deleted.push(request.url)
			return new Response(null, { status: 204 })
		}
		return json({
			...zone,
			records: request.url.includes('recordType=AAAA')
				? [record('old-aaaa', 'AAAA', '2001:db8:0:0:0:0:0:10')]
				: [record('old-a', 'A', '192.0.2.10'), record('other-a', 'A', '192.0.2.99')]
		})
	}
	await expect(
		removeUnitedDomainsIdentityDns({
			apiKey: 'prefix.secret',
			baseUrl,
			fetch,
			ipv4: '192.0.2.10',
			ipv6: '2001:db8::10'
		})
	).resolves.toBe(2)
	expect(deleted).toEqual([
		`${baseUrl}/v1/zones/zone-1/records/old-a`,
		`${baseUrl}/v1/zones/zone-1/records/old-aaaa`
	])
})
