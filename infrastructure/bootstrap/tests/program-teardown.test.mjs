import assert from 'node:assert/strict'
import test from 'node:test'
import * as pulumi from '@pulumi/pulumi'

const resources = []

pulumi.runtime.setMocks(
	{
		newResource(args) {
			resources.push({ type: args.type, name: args.name, inputs: args.inputs })
			const state = { ...args.inputs }
			if (args.type === 'minio:index/s3Bucket:S3Bucket') state.bucket = args.inputs.bucket
			return { id: `${args.name}-id`, state }
		},
		call(args) {
			return args.inputs
		}
	},
	'aven-bootstrap',
	'teardown',
	false
)

Object.assign(process.env, {
	BOOTSTRAP_TEARDOWN: 'true',
	OBJECT_STORAGE_TARGET: 'next',
	OBJECT_STORAGE_BUCKET_PREFIX: 'avenos-0123456789',
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

test('enables version-aware bucket deletion only in teardown mode', () => {
	const buckets = resources.filter(({ type }) => type === 'minio:index/s3Bucket:S3Bucket')
	assert.equal(buckets.length, 2)
	for (const bucket of buckets) assert.equal(bucket.inputs.forceDestroy, true)
})
