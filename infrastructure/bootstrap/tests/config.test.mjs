import assert from 'node:assert/strict'
import test from 'node:test'
import { loadBootstrapConfig } from '../src/config.mjs'

const env = {
	OBJECT_STORAGE_TARGET: 'next',
	OBJECT_STORAGE_BUCKET_PREFIX: 'avenos-example',
	OBJECT_STORAGE_PROJECT_ID: '12345',
	BOOTSTRAP_S3_ACCESS_KEY_ID: 'BOOTSTRAP123',
	BOOTSTRAP_S3_SECRET_ACCESS_KEY: 'secret',
	DEPLOYMENT_S3_ACCESS_KEY_ID: 'NEXTDEPLOY123',
	OBSERVER_S3_ACCESS_KEY_ID: 'NEXTOBSERVE1'
}

test('loads the isolated object-storage roles', () => {
	const config = loadBootstrapConfig(env)
	assert.equal(config.region, 'hel1')
	assert.equal(config.target, 'next')
	assert.equal(config.projectId, '12345')
	assert.equal(config.observerAccessKey, 'NEXTOBSERVE1')
})

test('rejects unsafe bucket prefixes and missing roles', () => {
	assert.throws(() => loadBootstrapConfig({ ...env, OBJECT_STORAGE_BUCKET_PREFIX: 'Not Global' }))
	assert.throws(() => loadBootstrapConfig({ ...env, OBSERVER_S3_ACCESS_KEY_ID: '' }))
	assert.throws(() => loadBootstrapConfig({ ...env, OBJECT_STORAGE_TARGET: 'shared' }))
})
