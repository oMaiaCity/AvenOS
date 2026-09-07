import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPlatformConfig, normalizeOpenSshPublicKey, parseSshCidrs } from '../src/config.mjs'

const base = {
	DEPLOYMENT_TARGET: 'identity',
	DEPLOYMENT_ENVIRONMENT: 'identity',
	HETZNER_LOCATION: 'nbg1',
	HETZNER_SERVER_TYPE: 'cx23',
	HETZNER_SERVER_ARCHITECTURE: 'amd64',
	HETZNER_OS_IMAGE: 'ubuntu-24.04',
	SSH_ALLOWED_CIDRS: '192.0.2.4/32'
}

test('defines the shared identity foundation', () => {
	const config = loadPlatformConfig(base)
	assert.equal(config.target, 'identity')
	assert.equal(config.identityHostname, 'aven.id')
	assert.equal(config.volumeSize, 40)
})

test('treats absent GitHub optional variables as defaults', () => {
	const config = loadPlatformConfig({
		...base,
		IDENTITY_VOLUME_SIZE_GB: '',
		PLATFORM_VOLUME_SIZE_GB: '',
		SSH_ALLOWED_CIDRS: ''
	})
	assert.equal(config.volumeSize, 40)
	assert.deepEqual(config.sshAllowedCidrs, ['0.0.0.0/0', '::/0'])
})

test('derives exact next and production origins', () => {
	const next = loadPlatformConfig({
		...base,
		DEPLOYMENT_TARGET: 'platform',
		DEPLOYMENT_ENVIRONMENT: 'next'
	})
	assert.deepEqual(next.platformHostnames, {
		apex: 'next.aven.ceo',
		api: 'api.next.aven.ceo',
		checkout: 'portal.next.aven.ceo'
	})
	assert.equal(next.platformDeploymentId, 'aven-platform-next-v1')
	const production = loadPlatformConfig({
		...base,
		DEPLOYMENT_TARGET: 'platform',
		DEPLOYMENT_ENVIRONMENT: 'production'
	})
	assert.deepEqual(production.platformHostnames, {
		apex: 'aven.ceo',
		api: 'api.aven.ceo',
		checkout: 'portal.aven.ceo'
	})
	assert.equal(production.platformDeploymentId, 'aven-platform-production-v1')
})

test('rejects invalid target and environment combinations', () => {
	assert.throws(() =>
		loadPlatformConfig({ ...base, DEPLOYMENT_TARGET: 'identity', DEPLOYMENT_ENVIRONMENT: 'next' })
	)
	assert.throws(() =>
		loadPlatformConfig({
			...base,
			DEPLOYMENT_TARGET: 'platform',
			DEPLOYMENT_ENVIRONMENT: 'identity'
		})
	)
})

test('validates exact SSH CIDRs', () => {
	assert.deepEqual(parseSshCidrs('192.0.2.1/32,2001:db8::1/128'), [
		'192.0.2.1/32',
		'2001:db8::1/128'
	])
	assert.throws(() => parseSshCidrs('192.0.2.1/33'))
})

test('normalizes the trailing newline returned by the TLS provider', () => {
	assert.equal(
		normalizeOpenSshPublicKey('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIProvider\n'),
		'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIProvider'
	)
	assert.throws(() => normalizeOpenSshPublicKey('not-a-key\n'))
})
