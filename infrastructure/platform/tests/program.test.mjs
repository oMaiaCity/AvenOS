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
				state.ipv4Address = args.name === 'identity-server' ? '192.0.2.10' : '192.0.2.20'
				state.ipv6Address = args.name === 'identity-server' ? '2001:db8::10' : '2001:db8::20'
			}
			if (args.type === 'hcloud:index/volume:Volume')
				state.linuxDevice = `/dev/disk/by-id/${args.name}`
			if (args.type === 'tls:index/privateKey:PrivateKey') {
				state.privateKeyOpenssh =
					'-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n'
				state.publicKeyOpenssh = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHost ${args.name}\n`
				state.privateKeyPem = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n'
				state.publicKeyPem = '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----\n'
			}
			if (args.type === 'random:index/randomPassword:RandomPassword') state.result = 'r'.repeat(64)
			if (args.type === 'random:index/randomBytes:RandomBytes')
				state.base64 = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
			return { id: `${args.name}-id`, state }
		},
		call(args) {
			if (args.token === 'hcloud:index/getServerType:getServerType')
				return { ...args.inputs, architecture: 'x86', name: args.inputs.name }
			return args.inputs
		}
	},
	'aven-platform',
	'identity',
	false
)

Object.assign(process.env, {
	DEPLOYMENT_TARGET: 'identity',
	DEPLOYMENT_ENVIRONMENT: 'identity',
	HETZNER_LOCATION: 'nbg1',
	HETZNER_SERVER_TYPE: 'cx23',
	HETZNER_SERVER_ARCHITECTURE: 'amd64',
	HETZNER_OS_IMAGE: 'ubuntu-24.04',
	SSH_ALLOWED_CIDRS: '0.0.0.0/0,::/0',
	HETZNER_COMPUTE_TOKEN: 'compute-token-for-tests-only',
	HETZNER_DNS_TOKEN: ''
})

const program = await import('../src/index.mjs')
await Promise.all([program.identityIpv4Address.promise(), program.identityDnsRecords.promise()])

test('creates a replaceable identity host around one protected data volume', () => {
	assert.deepEqual(
		resources
			.filter(({ type }) => type === 'hcloud:index/server:Server')
			.map(({ name }) => name)
			.sort(),
		['identity-server']
	)
	assert.equal(resources.filter(({ type }) => type === 'hcloud:index/firewall:Firewall').length, 1)
	assert.equal(resources.filter(({ type }) => type === 'hcloud:index/volume:Volume').length, 1)
	assert.equal(resources.filter(({ type }) => type === 'tls:index/privateKey:PrivateKey').length, 5)
	assert.equal(resources.filter(({ type }) => type === 'hcloud:index/sshKey:SshKey').length, 1)
	const server = resources.find(({ type }) => type === 'hcloud:index/server:Server')
	const volume = resources.find(({ type }) => type === 'hcloud:index/volume:Volume')
	assert.equal(server.inputs.deleteProtection, false)
	assert.equal(server.inputs.rebuildProtection, false)
	assert.equal(server.inputs.keepDisk, false)
	assert.equal(volume.inputs.deleteProtection, true)
	assert.equal(
		resources.filter(({ type }) => type === 'hcloud:index/zoneRrset:ZoneRrset').length,
		0
	)
	assert.equal(
		resources.some(({ name }) => name === 'platform-identity-provisioning-secret'),
		false
	)
})

test('allows key-only SSH administration from dynamic IPv4 and IPv6 addresses', () => {
	const firewalls = resources.filter(({ type }) => type === 'hcloud:index/firewall:Firewall')
	for (const firewall of firewalls) {
		const ssh = firewall.inputs.rules.find((rule) => rule.port === '22')
		assert.deepEqual(ssh.sourceIps, ['0.0.0.0/0', '::/0'])
	}
	const identity = resources.find(({ name }) => name === 'identity-server')
	const userData = identity.inputs.userData.value ?? identity.inputs.userData
	assert.match(userData, /name: aven-admin/)
	assert.match(userData, /AllowUsers aven-admin/)
	assert.match(userData, /PasswordAuthentication no/)
})

test('returns exact aven.id records for the external DNS provider', async () => {
	assert.deepEqual(await program.identityDnsRecords.promise(), [
		{ hostname: 'aven.id', name: '@', type: 'A', value: '192.0.2.10', ttl: 300 },
		{ hostname: 'aven.id', name: '@', type: 'AAAA', value: '2001:db8::10', ttl: 300 }
	])
})

test('keeps the identity bootstrap root isolated', () => {
	const identity = resources.find(({ name }) => name === 'identity-server')
	const identityUserData = identity.inputs.userData.value ?? identity.inputs.userData
	assert.match(identityUserData, /\/opt\/aven\/identity/)
	assert.doesNotMatch(identityUserData, /\/opt\/aven\/platform/)
	assert.doesNotMatch(
		JSON.stringify(identity.inputs),
		/BETTER_AUTH|POSTGRES_PASSWORD|POLAR_API_KEY|SMTP_URL/
	)
})

test('normalizes provider-shaped deploy keys only inside cloud-init', () => {
	const registeredKey = resources.find(({ name }) => name === 'identity-deploy-key-registration')
	const identity = resources.find(({ name }) => name === 'identity-server')
	const userData = identity.inputs.userData.value ?? identity.inputs.userData
	assert.equal(registeredKey.inputs.publicKey.endsWith('\n'), true)
	assert.match(userData, /ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHost identity-deploy-key\n/)
	assert.doesNotMatch(userData, /identity-deploy-key\n\s*\n/)
})
