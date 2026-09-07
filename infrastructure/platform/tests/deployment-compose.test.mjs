import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'

const readCompose = (name) =>
	parse(
		readFileSync(new URL(`../../../deploy/${name}/docker-compose.yml`, import.meta.url), 'utf8')
	)

test('backup and restore keep database access while receiving explicit outbound access', () => {
	const identity = readCompose('identity')
	assert.equal(identity.networks['identity-private'].internal, true)
	assert.deepEqual(identity.services.backup.networks, ['identity-private', 'identity-egress'])
	assert.deepEqual(identity.services.restore.networks, ['identity-private', 'identity-egress'])
	assert.deepEqual(Object.keys(identity.services.backup.depends_on), ['migrate'])

	const platform = readCompose('platform')
	assert.equal(platform.networks['platform-private'].internal, true)
	assert.deepEqual(platform.services.backup.networks, ['platform-private', 'platform-egress'])
	assert.deepEqual(platform.services.restore.networks, ['platform-private', 'platform-egress'])
	assert.deepEqual(Object.keys(platform.services.backup.depends_on).sort(), [
		'api-migrate',
		'checkout-migrate'
	])
})

test('fresh backup readiness fits inside the host deployment deadline', () => {
	for (const name of ['identity', 'platform']) {
		const health = readCompose(name).services.backup.healthcheck
		assert.equal(health.interval, '15s')
		assert.equal(health.start_period, '3m')
		assert.equal(health.retries, 4)
	}
})

test('checkout workers receive only their function-specific database roles', () => {
	const platform = readCompose('platform')
	for (const name of ['email-worker', 'platform-event-worker']) {
		const environment = platform.services[name].environment
		assert.equal(environment.WEBHOOK_DATABASE_URL, undefined)
		assert.notEqual(environment.DATABASE_URL, platform.services.checkout.environment.DATABASE_URL)
	}
})

test('operational SSH tools offer only their Pulumi-generated identity', () => {
	for (const path of ['../../../tools/stack-observe/run.sh', '../../../tools/db-tunnel/open.sh']) {
		const source = readFileSync(new URL(path, import.meta.url), 'utf8')
		assert.match(source, /-o IdentitiesOnly=yes/)
	}
})
