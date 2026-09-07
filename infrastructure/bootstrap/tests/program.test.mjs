import assert from 'node:assert/strict'
import test from 'node:test'
import * as pulumi from '@pulumi/pulumi'

const resources = []

pulumi.runtime.setMocks(
	{
		newResource(args) {
			resources.push({ type: args.type, name: args.name, inputs: args.inputs })
			const state = { ...args.inputs }
			if (args.type === 'minio:index/s3Bucket:S3Bucket') {
				state.bucket = args.inputs.bucket
				state.bucketDomainName = `${args.inputs.bucket}.hel1.your-objectstorage.com`
			}
			return { id: `${args.name}-id`, state }
		},
		call(args) {
			return args.inputs
		}
	},
	'aven-bootstrap',
	'foundation',
	false
)

Object.assign(process.env, {
	OBJECT_STORAGE_TARGET: 'next',
	OBJECT_STORAGE_BUCKET_PREFIX: 'avenos-abc123',
	OBJECT_STORAGE_PROJECT_ID: '12345',
	OBJECT_STORAGE_REGION: 'hel1',
	BOOTSTRAP_S3_ACCESS_KEY_ID: 'BOOTSTRAP123',
	BOOTSTRAP_S3_SECRET_ACCESS_KEY: 'bootstrap-secret',
	DEPLOYMENT_S3_ACCESS_KEY_ID: 'NEXTDEPLOY123',
	OBSERVER_S3_ACCESS_KEY_ID: 'NEXTOBSERVE1'
})

const program = await import('../src/index.mjs')
await Promise.all(Object.values(program.buckets).map((output) => output.promise()))
await pulumi.runtime.disconnect()

test('creates one target pair of private non-destructive buckets', () => {
	const buckets = resources.filter(({ type }) => type === 'minio:index/s3Bucket:S3Bucket')
	assert.equal(buckets.length, 2)
	assert.deepEqual(buckets.map((bucket) => bucket.inputs.bucket).sort(), [
		'avenos-abc123-12345-next-backup',
		'avenos-abc123-12345-next-state'
	])
	for (const bucket of buckets) {
		assert.equal(bucket.inputs.acl, 'private')
		assert.equal(bucket.inputs.forceDestroy, false)
		assert.equal(bucket.inputs.objectLocking, false)
	}
})

test('versions state and backup and applies a policy to every bucket', () => {
	assert.equal(
		resources.filter(({ type }) => type === 'minio:index/s3BucketVersioning:S3BucketVersioning')
			.length,
		2,
		JSON.stringify([...new Set(resources.map(({ type }) => type))])
	)
	const policies = resources.filter(
		({ type }) => type === 'minio:index/s3BucketPolicy:S3BucketPolicy'
	)
	assert.equal(policies.length, 2)
	for (const policy of policies) {
		assert.match(policy.inputs.policy, /DenyEveryCredentialOutsideThisTarget/)
	}
})
