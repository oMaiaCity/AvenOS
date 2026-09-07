import assert from 'node:assert/strict'
import test from 'node:test'
import {
	activePrefixAllowsRepositoryCleanup,
	bootstrapBucketUrns,
	bootstrapStateContainsNoUnexpectedBuckets,
	bootstrapStorageTeardownPlan,
	bootstrapTeardownStackName,
	githubEnvironmentNames,
	guidedUninstallArguments,
	localPulumiLockPid,
	localResetPaths,
	ownedPolarCatalogResources,
	platformProtectionTargetUrns,
	uninstallConfirmation,
	uninstallFailureSummary,
	uninstallSummary,
	uninstallTargets
} from '../../../scripts/lib/deployment-uninstall.ts'

test('removes a generation in reverse dependency order', () => {
	assert.deepEqual(
		uninstallTargets(
			{ deploymentTargets: ['identity', 'next', 'production'] },
			{ completedTargets: ['identity', 'next', 'production'] }
		),
		['production', 'next', 'identity']
	)
	assert.equal(uninstallConfirmation('avenos-0123456789'), 'uninstall avenos-0123456789')
	assert.throws(() => uninstallConfirmation('avenos-current'), /Invalid deployment namespace/)
})

test('recognizes only a lock owned by a process on this host', () => {
	const error =
		'the stack is currently locked: created by operator@aven-host (pid 39443) at 2026-09-03T15:16:11+02:00'
	assert.equal(localPulumiLockPid(error, 'aven-host'), 39443)
	assert.equal(localPulumiLockPid(error, 'other-host'), undefined)
	assert.equal(localPulumiLockPid('the stack is currently locked', 'aven-host'), undefined)
})

test('passes the typed generation confirmation to the uninstall engine', () => {
	assert.deepEqual(
		guidedUninstallArguments(
			'/repo/scripts/deployment-uninstall.ts',
			'/private/bootstrap-input.json',
			'/private/output',
			'avenos-0123456789'
		),
		[
			'/repo/scripts/deployment-uninstall.ts',
			'--input',
			'/private/bootstrap-input.json',
			'--output',
			'/private/output',
			'--confirmed-generation',
			'avenos-0123456789',
			'--progress-json'
		]
	)
})

test('reports the provider error instead of Bun stack trailer noise', () => {
	assert.equal(
		uninstallFailureSummary([
			'error: Refusing provider changes without --confirmed-generation avenos-0123456789.',
			'      at /repo/scripts/deployment-uninstall.ts:67:12',
			'Bun v1.3.13 (Linux x64)'
		]),
		'Refusing provider changes without --confirmed-generation avenos-0123456789.'
	)
})

test('names only the saved generation GitHub Environments', () => {
	assert.deepEqual(githubEnvironmentNames('avenos-0123456789', ['production', 'identity']), [
		'avenos-0123456789-production',
		'avenos-0123456789-production-operations',
		'avenos-0123456789-identity',
		'avenos-0123456789-identity-operations'
	])
	assert.equal(activePrefixAllowsRepositoryCleanup('avenos-0123456789', 'avenos-0123456789'), true)
	assert.equal(activePrefixAllowsRepositoryCleanup('avenos-aaaaaaaaaa', 'avenos-0123456789'), false)
	assert.match(
		uninstallSummary('avenos-0123456789', ['identity'], ['avenos-0123456789-identity']),
		/Provider-issued credentials are not revoked automatically/
	)
})

test('targets only platform provider resources whose deletion locks need changing', () => {
	const stack = {
		deployment: {
			resources: [
				{ type: 'pulumi:pulumi:Stack', urn: 'stack' },
				{ type: 'hcloud:index/server:Server', urn: 'server' },
				{ type: 'hcloud:index/volume:Volume', urn: 'volume' },
				{ type: 'hcloud:index/zoneRrset:ZoneRrset', urn: 'dns' },
				{ type: 'hcloud:index/firewall:Firewall', urn: 'firewall' },
				{ type: 'minio:index/s3Bucket:S3Bucket', urn: 'bucket' }
			]
		}
	}
	assert.deepEqual(platformProtectionTargetUrns(stack), ['server', 'volume', 'dns'])
})

test('uses a dedicated local teardown stack with exact target bucket URNs', () => {
	const stack = bootstrapTeardownStackName('production')
	assert.equal(stack, 'organization/aven-bootstrap/uninstall-production')
	assert.deepEqual(bootstrapBucketUrns(stack, 'production', ['state', 'backup']), [
		'urn:pulumi:uninstall-production::aven-bootstrap::minio:index/s3Bucket:S3Bucket::production-state',
		'urn:pulumi:uninstall-production::aven-bootstrap::minio:index/s3Bucket:S3Bucket::production-backup'
	])
})

test('plans teardown from exact provider reality for every partial lifecycle state', () => {
	const subsets = [[], ['state'], ['backup'], ['state', 'backup']]
	for (const existing of subsets) {
		for (const tracked of subsets) {
			const plan = bootstrapStorageTeardownPlan(existing, tracked)
			assert.deepEqual(plan.remove, existing)
			assert.deepEqual(
				plan.adopt,
				existing.filter((kind) => !tracked.includes(kind))
			)
		}
	}
})

test('allows an empty teardown checkpoint but rejects every foreign physical bucket', () => {
	const expected = [
		'avenos-0123456789-123-production-state',
		'avenos-0123456789-123-production-backup'
	]
	assert.equal(
		bootstrapStateContainsNoUnexpectedBuckets({ deployment: { resources: [] } }, expected),
		true
	)
	assert.equal(
		bootstrapStateContainsNoUnexpectedBuckets(
			{
				deployment: {
					resources: [
						{
							type: 'minio:index/s3Bucket:S3Bucket',
							id: expected[0],
							outputs: { bucket: expected[0] }
						}
					]
				}
			},
			expected
		),
		true
	)
	assert.equal(
		bootstrapStateContainsNoUnexpectedBuckets(
			{
				deployment: {
					resources: [
						{
							type: 'minio:index/s3Bucket:S3Bucket',
							id: 'foreign',
							outputs: { bucket: 'foreign' }
						}
					]
				}
			},
			expected
		),
		false
	)
})

test('selects only the exact SSOT Polar catalog', () => {
	assert.deepEqual(
		ownedPolarCatalogResources({
			products: [
				{ id: 'ours', metadata: { tier: 'aven-ceo' } },
				{ id: 'other', metadata: { tier: 'consulting' } }
			],
			benefits: [
				{ id: 'ours-benefit', metadata: { source: 'ssot', key: 'skill:write' } },
				{ id: 'other-benefit', metadata: { source: 'manual', key: 'skill:write' } }
			],
			meters: [
				{ id: 'ours-meter', name: 'mind-credits', metadata: { source: 'ssot' } },
				{ id: 'other-meter', name: 'mind-credits', metadata: { source: 'manual' } }
			]
		}),
		{
			productIds: ['ours'],
			benefitIds: ['ours-benefit'],
			meterIds: ['ours-meter']
		}
	)
})

test('preserves the reusable input outside the generated reset set', () => {
	const paths = localResetPaths('/private/bootstrap', ['next'])
	assert.equal(paths.includes('/private/bootstrap/bootstrap-input.json'), false)
	assert.equal(paths.includes('/private/bootstrap/bootstrap.generated.json'), true)
	assert.equal(paths.includes('/private/bootstrap/uninstall-pulumi-state'), true)
	assert.equal(paths.includes('/private/bootstrap/uninstall-platform-next.json'), true)
})
