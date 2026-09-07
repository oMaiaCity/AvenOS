import assert from 'node:assert/strict'
import test from 'node:test'
import * as pulumi from '@pulumi/pulumi'

const resources = []

pulumi.runtime.setMocks(
	{
		newResource(args) {
			resources.push({ type: args.type, name: args.name, inputs: args.inputs })
			const state = { ...args.inputs }
			if (args.type === 'hcloud:index/server:Server') {
				state.ipv4Address = '192.0.2.20'
				state.ipv6Address = '2001:db8::20'
			}
			if (args.type === 'hcloud:index/volume:Volume') state.linuxDevice = `/dev/${args.name}`
			if (args.type === 'tls:index/privateKey:PrivateKey') {
				state.privateKeyOpenssh =
					'-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n'
				state.publicKeyOpenssh = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHost ${args.name}\n`
				state.privateKeyPem = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n'
				state.publicKeyPem = '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----\n'
			}
			if (args.type === 'random:index/randomPassword:RandomPassword') state.result = 'r'.repeat(64)
			if (args.type === 'random:index/randomBytes:RandomBytes') state.base64 = 'BwcHBwcHBwc='
			return { id: `${args.name}-id`, state }
		},
		call(args) {
			if (args.token === 'hcloud:index/getServerType:getServerType')
				return { ...args.inputs, architecture: 'x86', name: args.inputs.name }
			return args.inputs
		}
	},
	'aven-platform',
	'teardown',
	false
)

Object.assign(process.env, {
	PLATFORM_TEARDOWN: 'true',
	DEPLOYMENT_TARGET: 'platform',
	DEPLOYMENT_ENVIRONMENT: 'production',
	HETZNER_LOCATION: 'nbg1',
	HETZNER_SERVER_TYPE: 'cx23',
	HETZNER_SERVER_ARCHITECTURE: 'amd64',
	HETZNER_OS_IMAGE: 'ubuntu-24.04',
	SSH_ALLOWED_CIDRS: '192.0.2.4/32',
	HETZNER_COMPUTE_TOKEN: 'compute-token-for-tests-only',
	HETZNER_DNS_TOKEN: 'dns-token-for-tests-only-000'
})

const program = await import('../src/index.mjs')
await Promise.all([
	program.platformIpv4Address.promise(),
	program.platformIpv6Address.promise(),
	...program.dnsRecordIds.map((output) => output.promise())
])

test('disables provider deletion locks only in teardown mode', () => {
	const server = resources.find(({ type }) => type === 'hcloud:index/server:Server')
	const volume = resources.find(({ type }) => type === 'hcloud:index/volume:Volume')
	const records = resources.filter(({ type }) => type === 'hcloud:index/zoneRrset:ZoneRrset')
	assert.equal(server.inputs.deleteProtection, false)
	assert.equal(server.inputs.rebuildProtection, false)
	assert.equal(server.inputs.keepDisk, false)
	assert.equal(volume.inputs.deleteProtection, false)
	assert.equal(records.length, 6)
	for (const record of records) assert.equal(record.inputs.changeProtection, false)
})
