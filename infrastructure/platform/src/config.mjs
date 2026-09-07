import { isIP } from 'node:net'
import { platformHostnames } from './dns.mjs'

function required(env, name) {
	const value = env[name]?.trim()
	if (!value) throw new Error(`${name} is required`)
	return value
}

function positiveInteger(env, name, fallback) {
	const value = env[name]?.toString().trim() || fallback.toString()
	if (!/^\d+$/.test(value) || Number(value) < 1)
		throw new Error(`${name} must be a positive integer`)
	return Number(value)
}

export function parseSshCidrs(value) {
	const cidrs = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
	if (!cidrs.length) throw new Error('SSH_ALLOWED_CIDRS must contain at least one CIDR')
	for (const cidr of cidrs) {
		const [address, prefix, ...rest] = cidr.split('/')
		const family = isIP(address)
		const numericPrefix = Number(prefix)
		if (rest.length || !family || !/^\d+$/.test(prefix ?? ''))
			throw new Error(`invalid SSH CIDR: ${cidr}`)
		if (
			(family === 4 && (numericPrefix < 0 || numericPrefix > 32)) ||
			(family === 6 && (numericPrefix < 0 || numericPrefix > 128))
		)
			throw new Error(`invalid SSH CIDR prefix: ${cidr}`)
	}
	return cidrs
}

export function isOpenSshPublicKey(value) {
	return /^(?:ssh-(?:ed25519|rsa)|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9._@+-]+)?$/.test(
		value
	)
}

export function normalizeOpenSshPublicKey(value) {
	const normalized = value.trim()
	if (!isOpenSshPublicKey(normalized)) throw new Error('invalid SSH public key')
	return normalized
}

export function loadPlatformConfig(env = process.env) {
	const target = required(env, 'DEPLOYMENT_TARGET')
	const environment = required(env, 'DEPLOYMENT_ENVIRONMENT')
	if (target !== 'identity' && target !== 'platform')
		throw new Error('DEPLOYMENT_TARGET must be identity or platform')
	if (
		target === 'identity'
			? environment !== 'identity'
			: !['next', 'production'].includes(environment)
	)
		throw new Error(
			'identity targets require identity; platform targets require next or production'
		)
	const architecture = required(env, 'HETZNER_SERVER_ARCHITECTURE')
	if (architecture !== 'amd64') throw new Error('published images require amd64')
	const volumeSize =
		target === 'identity'
			? positiveInteger(env, 'IDENTITY_VOLUME_SIZE_GB', 40)
			: positiveInteger(env, 'PLATFORM_VOLUME_SIZE_GB', 80)
	if ((target === 'identity' && volumeSize < 30) || (target === 'platform' && volumeSize < 40))
		throw new Error('identity volume must be >=30 GiB and platform volume >=40 GiB')
	return {
		target,
		environment,
		deployUser: 'aven-deploy',
		identityDeploymentId: 'aven-identity-v1',
		platformDeploymentId: `aven-platform-${environment}-v1`,
		identityHostname: 'aven.id',
		platformHostnames: target === 'platform' ? platformHostnames(environment) : undefined,
		platformDnsZone: 'aven.ceo',
		location: required(env, 'HETZNER_LOCATION'),
		serverType:
			target === 'identity'
				? env.IDENTITY_SERVER_TYPE?.trim() || required(env, 'HETZNER_SERVER_TYPE')
				: env.PLATFORM_SERVER_TYPE?.trim() || required(env, 'HETZNER_SERVER_TYPE'),
		architecture,
		osImage: required(env, 'HETZNER_OS_IMAGE'),
		volumeSize,
		sshAllowedCidrs: parseSshCidrs(env.SSH_ALLOWED_CIDRS?.trim() || '0.0.0.0/0,::/0')
	}
}

export function requireProviderToken(env, name) {
	const token = required(env, name)
	if (token.length < 20) throw new Error(`${name} is implausibly short`)
	return token
}
