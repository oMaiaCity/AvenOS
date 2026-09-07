import assert from 'node:assert/strict'
import test from 'node:test'
import * as pulumi from '@pulumi/pulumi'

const resources = []

pulumi.runtime.setMocks(
	{
		newResource(args) {
			resources.push({ type: args.type, name: args.name, id: args.id, inputs: args.inputs })
			return { id: args.id ?? `${args.name}-id`, state: { ...args.inputs } }
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
	OBSERVER_S3_ACCESS_KEY_ID: 'NEXTOBSERVE1',
	OBJECT_STORAGE_ADOPT_EXISTING_BUCKETS: 'state'
})

const program = await import('../src/index.mjs')
await Promise.all(Object.values(program.buckets).map((output) => output.promise()))
await pulumi.runtime.disconnect()

test('imports only the explicitly detected bucket and leaves normal creation unchanged', () => {
	const buckets = resources.filter(({ type }) => type === 'minio:index/s3Bucket:S3Bucket')
	assert.equal(
		buckets.find(({ name }) => name === 'next-state').id,
		'avenos-abc123-12345-next-state'
	)
	assert.equal(buckets.find(({ name }) => name === 'next-backup').id, '')
})
