const ACCESS_KEY = /^[A-Z0-9]{8,64}$/
const BUCKET_PREFIX = /^[a-z0-9][a-z0-9-]{4,42}[a-z0-9]$/
const TARGETS = ['identity', 'next', 'production']

function required(env, name) {
	const value = env[name]?.trim()
	if (!value) throw new Error(`${name} is required`)
	return value
}

function accessKey(env, name) {
	const value = required(env, name)
	if (!ACCESS_KEY.test(value)) throw new Error(`${name} is not a valid Hetzner S3 access key`)
	return value
}

export function loadBootstrapConfig(env = process.env) {
	const target = required(env, 'OBJECT_STORAGE_TARGET')
	if (!TARGETS.includes(target))
		throw new Error('OBJECT_STORAGE_TARGET must be identity, next, or production')
	const prefix = required(env, 'OBJECT_STORAGE_BUCKET_PREFIX')
	if (!BUCKET_PREFIX.test(prefix))
		throw new Error(
			'OBJECT_STORAGE_BUCKET_PREFIX must be 6-44 lowercase letters, digits, or hyphens'
		)
	const region = env.OBJECT_STORAGE_REGION?.trim() || 'hel1'
	if (!['fsn1', 'nbg1', 'hel1'].includes(region))
		throw new Error('OBJECT_STORAGE_REGION must be fsn1, nbg1, or hel1')
	const projectId = required(env, 'OBJECT_STORAGE_PROJECT_ID')
	if (!/^\d+$/.test(projectId)) throw new Error('OBJECT_STORAGE_PROJECT_ID must be numeric')
	return {
		target,
		prefix,
		region,
		projectId,
		bootstrapAccessKey: accessKey(env, 'BOOTSTRAP_S3_ACCESS_KEY_ID'),
		bootstrapSecretKey: required(env, 'BOOTSTRAP_S3_SECRET_ACCESS_KEY'),
		deploymentAccessKey: accessKey(env, 'DEPLOYMENT_S3_ACCESS_KEY_ID'),
		observerAccessKey: accessKey(env, 'OBSERVER_S3_ACCESS_KEY_ID')
	}
}
