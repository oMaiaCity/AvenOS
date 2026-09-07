import assert from 'node:assert/strict'
import test from 'node:test'
import {
	adoptPlatformDns,
	desiredPlatformRecords,
	dnsProviderUrn,
	dnsReconciliationPlan,
	legacyCheckoutResources
} from '../src/adopt-dns.mjs'

const zoneResource = (name, type) => ({ id: `${name}/${type}`, name, type })
const trackedResource = (stack, resourceName, inputs) => ({
	type: 'hcloud:index/zoneRrset:ZoneRrset',
	urn: `urn:pulumi:${stack}::aven-platform::hcloud:index/zoneRrset:ZoneRrset::${resourceName}`,
	...(inputs ? { inputs } : {})
})

test('describes only the six records owned by each platform environment', () => {
	assert.deepEqual(
		desiredPlatformRecords('production').map(({ name, type }) => `${name}/${type}`),
		['api/A', 'api/AAAA', 'portal/A', 'portal/AAAA', '@/A', '@/AAAA']
	)
	assert.deepEqual(
		desiredPlatformRecords('next').map(({ name, type }) => `${name}/${type}`),
		['api.next/A', 'api.next/AAAA', 'portal.next/A', 'portal.next/AAAA', 'next/A', 'next/AAAA']
	)
	assert.throws(() => dnsProviderUrn('someone/another-project/production'))
})

test('adopts exact existing records and removes only conflicting CNAMEs in owned names', () => {
	const plan = dnsReconciliationPlan({
		environment: 'production',
		rrsets: [
			zoneResource('@', 'A'),
			zoneResource('portal', 'AAAA'),
			zoneResource('my', 'AAAA'),
			zoneResource('my', 'CNAME'),
			zoneResource('api', 'CNAME'),
			zoneResource('mail', 'CNAME'),
			zoneResource('@', 'MX')
		],
		stackResources: [trackedResource('production', 'platform-apex-a')]
	})
	assert.deepEqual(plan.imports, [
		{ resourceName: 'platform-portal-aaaa', id: 'aven.ceo/portal/AAAA' }
	])
	assert.deepEqual(plan.obsoleteCnames, [{ name: 'api', type: 'CNAME' }])
})

test('does nothing once all matching records are tracked', () => {
	const desired = desiredPlatformRecords('next')
	const plan = dnsReconciliationPlan({
		environment: 'next',
		rrsets: desired.map(({ name, type }) => zoneResource(name, type)),
		stackResources: desired.map(({ resourceName }) => trackedResource('next', resourceName))
	})
	assert.deepEqual(plan, { imports: [], obsoleteCnames: [] })
})

test('repairs the partial production checkpoint without claiming the existing my service', () => {
	const plan = dnsReconciliationPlan({
		environment: 'production',
		rrsets: [
			zoneResource('api', 'A'),
			zoneResource('api', 'AAAA'),
			zoneResource('my', 'A'),
			zoneResource('my', 'AAAA'),
			zoneResource('@', 'A'),
			zoneResource('@', 'AAAA')
		],
		stackResources: [
			trackedResource('production', 'platform-api-a'),
			trackedResource('production', 'platform-api-aaaa'),
			trackedResource('production', 'platform-apex-aaaa')
		]
	})
	assert.deepEqual(plan.imports, [{ resourceName: 'platform-apex-a', id: 'aven.ceo/@/A' }])
	assert.deepEqual(plan.obsoleteCnames, [])
})

test('identifies only the exact legacy checkout resources that must leave state', () => {
	const legacy = legacyCheckoutResources({
		environment: 'next',
		stackResources: [
			trackedResource('next', 'platform-checkout-a', {
				zone: 'aven.ceo',
				name: 'my.next',
				type: 'A'
			}),
			trackedResource('next', 'platform-checkout-aaaa', {
				zone: 'aven.ceo',
				name: 'my.next',
				type: 'AAAA'
			}),
			trackedResource('next', 'platform-checkout-a', {
				zone: 'another.example',
				name: 'my.next',
				type: 'A'
			}),
			trackedResource('next', 'not-the-checkout', {
				zone: 'aven.ceo',
				name: 'my.next',
				type: 'A'
			})
		]
	})
	assert.equal(legacy.length, 2)
})

test('prepares the explicit provider, removes conflicts, and imports unmanaged records', async () => {
	const commands = []
	const removed = []
	const output = []
	const provider = dnsProviderUrn('organization/aven-platform/production')
	let exported = 0
	await adoptPlatformDns({
		cwd: '/tmp/platform-test',
		environment: {
			DEPLOYMENT_ENVIRONMENT: 'production',
			PULUMI_STACK: 'organization/aven-platform/production',
			PULUMI_BACKEND_URL: 's3://state/example',
			HETZNER_DNS_TOKEN: 'test-token'
		},
		run(args) {
			commands.push(args)
			return { status: args[0] === 'stack' && args[1] === 'select' ? 1 : 0, stdout: '', stderr: '' }
		},
		read() {
			exported += 1
			return exported === 1 ? [] : [{ type: 'pulumi:providers:hcloud', urn: provider }]
		},
		async list() {
			return [
				zoneResource('@', 'A'),
				zoneResource('portal', 'AAAA'),
				zoneResource('my', 'AAAA'),
				zoneResource('api', 'CNAME')
			]
		},
		async remove(zone, name, type) {
			removed.push({ zone, name, type })
		},
		write(message) {
			output.push(message)
		}
	})

	assert.deepEqual(commands[0], ['login', 's3://state/example', '--non-interactive'])
	assert.deepEqual(commands[2].slice(0, 4), [
		'stack',
		'init',
		'organization/aven-platform/production',
		'--secrets-provider'
	])
	assert.ok(commands.some((args) => args[0] === 'up' && args.includes(provider)))
	assert.deepEqual(
		commands.filter((args) => args[0] === 'import').map((args) => args.slice(1, 4)),
		[
			['hcloud:index/zoneRrset:ZoneRrset', 'platform-portal-aaaa', 'aven.ceo/portal/AAAA'],
			['hcloud:index/zoneRrset:ZoneRrset', 'platform-apex-a', 'aven.ceo/@/A']
		]
	)
	assert.deepEqual(removed, [{ zone: 'aven.ceo', name: 'api', type: 'CNAME' }])
	assert.match(output.at(-1), /2 existing RRSet\(s\) adopted; 1 obsolete CNAME/)
})

test('releases legacy my records before preview without contacting Hetzner', async () => {
	const commands = []
	const output = []
	const provider = dnsProviderUrn('organization/aven-platform/next')
	const legacy = ['A', 'AAAA'].map((type) =>
		trackedResource('next', `platform-checkout-${type.toLowerCase()}`, {
			zone: 'aven.ceo',
			name: 'my.next',
			type
		})
	)
	let exported = 0
	await adoptPlatformDns({
		cwd: '/tmp/platform-test',
		environment: {
			DEPLOYMENT_ENVIRONMENT: 'next',
			PULUMI_STACK: 'organization/aven-platform/next',
			PULUMI_BACKEND_URL: 's3://state/example',
			DNS_RECONCILIATION_MODE: 'state-only'
		},
		run(args) {
			commands.push(args)
			return { status: 0, stdout: '', stderr: '' }
		},
		read() {
			exported += 1
			return exported === 1
				? [{ type: 'pulumi:providers:hcloud', urn: provider }, ...legacy]
				: [{ type: 'pulumi:providers:hcloud', urn: provider }]
		},
		async list() {
			throw new Error('state-only migration must not list provider records')
		},
		async remove() {
			throw new Error('state-only migration must not remove provider records')
		},
		write(message) {
			output.push(message)
		}
	})

	assert.deepEqual(
		commands.filter((args) => args[0] === 'state').map((args) => args.slice(0, 2)),
		[
			['state', 'remove'],
			['state', 'remove']
		]
	)
	assert.ok(
		commands.filter((args) => args[0] === 'state').every((args) => args.includes('--force'))
	)
	assert.equal(
		commands.some((args) => ['up', 'import'].includes(args[0])),
		false
	)
	assert.match(output.at(-1), /2 legacy RRSet\(s\) released without provider changes/)
})

test('rejects a target and stack mismatch before contacting either provider', async () => {
	const commands = []
	await assert.rejects(
		adoptPlatformDns({
			environment: {
				DEPLOYMENT_ENVIRONMENT: 'production',
				PULUMI_STACK: 'organization/aven-platform/next',
				PULUMI_BACKEND_URL: 's3://state/example',
				HETZNER_DNS_TOKEN: 'test-token'
			},
			run(args) {
				commands.push(args)
				return { status: 0 }
			}
		}),
		/does not match deployment target/
	)
	assert.deepEqual(commands, [])
})
