import assert from 'node:assert/strict'
import test from 'node:test'
import { bucketPolicy } from '../src/policy.mjs'

test('isolates a state bucket and keeps its observer read-only', () => {
	const policy = JSON.parse(
		bucketPolicy({
			bucket: 'avenos-example-next-state',
			projectId: '12345',
			bootstrapAccessKey: 'BOOTSTRAP123',
			deploymentAccessKey: 'NEXTDEPLOY123',
			observerAccessKey: 'NEXTOBSERVE1'
		})
	)
	assert.equal(policy.Statement.length, 2)
	assert.deepEqual(policy.Statement[0].NotPrincipal.AWS, [
		'arn:aws:iam:::user/p12345:BOOTSTRAP123',
		'arn:aws:iam:::user/p12345:NEXTDEPLOY123',
		'arn:aws:iam:::user/p12345:NEXTOBSERVE1'
	])
	assert.equal(policy.Statement[1].Effect, 'Deny')
	assert.ok(policy.Statement[1].NotAction.includes('s3:GetObjectVersion'))
})

test('does not grant an observer access to backup data', () => {
	const policy = JSON.parse(
		bucketPolicy({
			bucket: 'avenos-example-next-backup',
			projectId: '12345',
			bootstrapAccessKey: 'BOOTSTRAP123',
			deploymentAccessKey: 'NEXTDEPLOY123'
		})
	)
	assert.equal(policy.Statement.length, 1)
	assert.equal(policy.Statement[0].NotPrincipal.AWS.length, 2)
})
