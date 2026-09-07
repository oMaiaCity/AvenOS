import assert from 'node:assert/strict'
import test from 'node:test'
import { manualIdentityRecordSpecs, platformRecordSpecs } from '../src/dns.mjs'

test('identity returns the external-provider records without managing them', () => {
	assert.deepEqual(
		manualIdentityRecordSpecs({
			hostname: 'aven.id',
			ipv4: '192.0.2.10',
			ipv6: '2001:db8::10'
		}),
		[
			{ hostname: 'aven.id', name: '@', type: 'A', value: '192.0.2.10', ttl: 300 },
			{ hostname: 'aven.id', name: '@', type: 'AAAA', value: '2001:db8::10', ttl: 300 }
		]
	)
	assert.throws(() =>
		manualIdentityRecordSpecs({ hostname: 'identity.aven.ceo', ipv4: 'x', ipv6: 'y' })
	)
})

test('platform creates all next records on the next subdomain', () => {
	const records = platformRecordSpecs({
		zone: 'aven.ceo',
		hostnames: {
			apex: 'next.aven.ceo',
			api: 'api.next.aven.ceo',
			checkout: 'portal.next.aven.ceo'
		},
		ipv4: '192.0.2.20',
		ipv6: '2001:db8::20'
	})
	assert.deepEqual(
		records.map(({ name }) => name),
		['api.next', 'api.next', 'portal.next', 'portal.next', 'next', 'next']
	)
})

test('platform creates all production records on the apex', () => {
	const records = platformRecordSpecs({
		zone: 'aven.ceo',
		hostnames: { apex: 'aven.ceo', api: 'api.aven.ceo', checkout: 'portal.aven.ceo' },
		ipv4: '192.0.2.20',
		ipv6: '2001:db8::20'
	})
	assert.deepEqual(
		records.map(({ name }) => name),
		['api', 'api', 'portal', 'portal', '@', '@']
	)
})
