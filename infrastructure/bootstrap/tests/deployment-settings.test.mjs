import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
	BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS,
	bootstrapPulumiUpArgs,
	bootstrapStackReadyForMigration,
	collidingBootstrapBucketKinds,
	deploymentConfigurationTargets,
	encodeBootstrapProgress,
	ensureBootstrapBucketExists,
	ensurePrivateDirectory,
	generateBootstrapSecrets,
	githubConfiguration,
	githubEnvironmentProtection,
	githubEnvironmentVariableChanges,
	isRetryableBootstrapStateBackendError,
	isRetryableGitHubError,
	parseBootstrapProgress,
	providerCreatedBootstrapBucketKinds,
	providerMissingImportedBootstrapBucketKinds,
	pulumiStackConfigFileName,
	pulumiStackIsListed,
	reconcileBootstrapBucketUpdate,
	recoveryCsv,
	removeSaltOnlyPulumiStackConfig,
	retryBootstrapStateBackendMigration,
	trackedBootstrapBucketKinds,
	validateBootstrapInput,
	writeRecoveryCsv
} from '../../../scripts/lib/deployment-bootstrap.ts'

test('reconciles empty GitHub variables by removing only stale values', () => {
	assert.deepEqual(
		githubEnvironmentVariableChanges(
			{
				SMTP_FROM: 'avenOS <hello@example.com>',
				SMTP_REPLY_TO: '',
				ANDROID_APP_CERT_SHA256_FINGERPRINTS: ''
			},
			['SMTP_REPLY_TO', 'UNRELATED_VARIABLE']
		),
		{
			set: [['SMTP_FROM', 'avenOS <hello@example.com>']],
			remove: ['SMTP_REPLY_TO']
		}
	)
})

test('retries only transient GitHub failures', () => {
	for (const commandOutput of [
		'dial tcp 140.82.121.5:443: i/o timeout',
		'TLS handshake timeout',
		'HTTP 429: rate limited',
		'HTTP 503: unavailable'
	]) {
		assert.equal(isRetryableGitHubError({ commandOutput }), true)
	}
	for (const commandOutput of [
		'HTTP 401: Bad credentials',
		'HTTP 403: Resource not accessible',
		'HTTP 422: Invalid request',
		'not found'
	]) {
		assert.equal(isRetryableGitHubError({ commandOutput }), false)
	}
})

test('adopts only deterministic buckets reported by an interrupted bootstrap update', () => {
	const expected = {
		state: 'avenos-0123456789-1234567-next-state',
		backup: 'avenos-0123456789-1234567-next-backup'
	}
	assert.deepEqual(
		collidingBootstrapBucketKinds(
			'[FATAL] bucket already exists! (avenos-0123456789-1234567-next-state)',
			expected
		),
		['state']
	)
	assert.deepEqual(
		collidingBootstrapBucketKinds(
			'[FATAL] bucket already exists! (someone-elses-bucket)',
			expected
		),
		[]
	)
})

test('recognizes the provider nil-state defect only for an exact bootstrap bucket URN', () => {
	const output = `error: expected non-nil error with nil state during Create of
urn:pulumi:production::aven-bootstrap::minio:index/s3Bucket:S3Bucket::production-state`
	assert.deepEqual(providerCreatedBootstrapBucketKinds(output, 'production'), ['state'])
	assert.deepEqual(providerCreatedBootstrapBucketKinds(output, 'next'), [])
	assert.deepEqual(
		providerCreatedBootstrapBucketKinds(
			'expected non-nil error with nil state during Create of urn:pulumi:production::other-project::minio:index/s3Bucket:S3Bucket::production-state',
			'production'
		),
		[]
	)
})

test('recognizes delayed import visibility only for exact expected bucket names', () => {
	const expected = {
		state: 'avenos-0123456789-1234567-identity-state',
		backup: 'avenos-0123456789-1234567-identity-backup'
	}
	assert.deepEqual(
		providerMissingImportedBootstrapBucketKinds(
			"= minio:index:S3Bucket identity-state import error: Preview failed: resource 'avenos-0123456789-1234567-identity-state' does not exist",
			expected
		),
		['state']
	)
	assert.deepEqual(
		providerMissingImportedBootstrapBucketKinds(
			"= minio:index:S3Bucket identity-state importing (0s) error: resource 'avenos-0123456789-1234567-identity-state' does not exist",
			expected
		),
		['state']
	)
	assert.deepEqual(
		providerMissingImportedBootstrapBucketKinds(
			"= minio:index:S3Bucket identity-state **importing failed** error: resource 'avenos-0123456789-1234567-identity-state' does not exist",
			expected
		),
		['state']
	)
	assert.deepEqual(
		providerMissingImportedBootstrapBucketKinds(
			"Preview failed: resource 'avenos-0123456789-1234567-identity-state' does not exist",
			expected
		),
		[]
	)
	assert.deepEqual(
		providerMissingImportedBootstrapBucketKinds(
			"import error: Preview failed: resource 'someone-elses-bucket' does not exist",
			expected
		),
		[]
	)
})

test('creates an absent exact bucket once and waits for signed visibility', async () => {
	let checks = 0
	let creates = 0
	const waits = []
	assert.equal(
		await ensureBootstrapBucketExists({
			exists: async () => {
				checks += 1
				return checks >= 4
			},
			create: async () => {
				creates += 1
			},
			onVisibilityWait: (event) => waits.push(event),
			sleep: async (delayMs) => waits.push({ slept: delayMs })
		}),
		'created'
	)
	assert.equal(creates, 1)
	assert.equal(checks, 4)
	assert.deepEqual(waits, [
		{ retry: 1, maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length, delayMs: 2_000 },
		{ slept: 2_000 },
		{ retry: 2, maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length, delayMs: 4_000 },
		{ slept: 4_000 }
	])
})

test('does not create an exact bucket that already exists', async () => {
	assert.equal(
		await ensureBootstrapBucketExists({
			exists: async () => true,
			create: async () => assert.fail('an existing bucket must not be created again')
		}),
		'existing'
	)
})

test('fails after a bounded bucket visibility wait', async () => {
	let checks = 0
	let waits = 0
	await assert.rejects(
		ensureBootstrapBucketExists({
			exists: async () => {
				checks += 1
				return false
			},
			create: async () => {},
			sleep: async () => {
				waits += 1
			}
		}),
		/did not become visible/
	)
	assert.equal(checks, BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length + 2)
	assert.equal(waits, BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length)
})

test('retries an idempotent state-backend migration only for transient missing-bucket reads', async () => {
	let attempts = 0
	const waits = []
	assert.equal(
		await retryBootstrapStateBackendMigration({
			migrate: async () => {
				attempts += 1
				if (attempts < 3) {
					const error = new Error('pulumi failed')
					error.commandOutput =
						'could not create stack: could not list bucket: operation error S3: ListObjectsV2, code=NotFound, NoSuchBucket'
					throw error
				}
				return 'migrated'
			},
			onVisibilityWait: (event) => waits.push(event),
			sleep: async (delayMs) => waits.push({ slept: delayMs })
		}),
		'migrated'
	)
	assert.equal(attempts, 3)
	assert.deepEqual(waits, [
		{ retry: 1, maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length, delayMs: 2_000 },
		{ slept: 2_000 },
		{ retry: 2, maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length, delayMs: 4_000 },
		{ slept: 4_000 }
	])
})

test('skips a repeated provider update only for a complete settled local bootstrap stack', () => {
	const resource = (type, name, extra = {}) => ({
		type,
		urn: `urn:pulumi:production::aven-bootstrap::${type}::${name}`,
		...extra
	})
	const resources = [
		resource('pulumi:pulumi:Stack', 'aven-bootstrap-production'),
		resource('pulumi:providers:minio', 'hetzner-object-storage'),
		resource('minio:index/s3Bucket:S3Bucket', 'production-state'),
		resource('minio:index/s3Bucket:S3Bucket', 'production-backup'),
		resource('minio:index/s3BucketVersioning:S3BucketVersioning', 'production-state-versioning'),
		resource('minio:index/s3BucketVersioning:S3BucketVersioning', 'production-backup-versioning'),
		resource('minio:index/s3BucketPolicy:S3BucketPolicy', 'production-state-policy'),
		resource('minio:index/s3BucketPolicy:S3BucketPolicy', 'production-backup-policy')
	]
	assert.equal(bootstrapStackReadyForMigration({ deployment: { resources } }, 'production'), true)
	for (const missing of resources.slice(1)) {
		assert.equal(
			bootstrapStackReadyForMigration(
				{ deployment: { resources: resources.filter((candidate) => candidate !== missing) } },
				'production'
			),
			false
		)
	}
	assert.equal(
		bootstrapStackReadyForMigration(
			{ deployment: { resources, pending_operations: [{}] } },
			'production'
		),
		false
	)
	assert.equal(
		bootstrapStackReadyForMigration(
			{
				deployment: {
					resources: resources.map((candidate) =>
						candidate.type === 'minio:index/s3Bucket:S3Bucket'
							? { ...candidate, initErrors: ['incomplete'] }
							: candidate
					)
				}
			},
			'production'
		),
		false
	)
})

test('does not reinterpret state-backend permission or passphrase failures as visibility lag', async () => {
	for (const original of [
		Object.assign(new Error('pulumi failed'), { commandOutput: 'AccessDenied' }),
		Object.assign(new Error('incorrect passphrase'), { commandOutput: 'incorrect passphrase' }),
		Object.assign(new Error('missing object'), { commandOutput: 'NoSuchBucket' })
	]) {
		assert.equal(isRetryableBootstrapStateBackendError(original), false)
		let attempts = 0
		await assert.rejects(
			retryBootstrapStateBackendMigration({
				migrate: async () => {
					attempts += 1
					throw original
				},
				sleep: async () => assert.fail('non-visibility failures must not wait')
			}),
			(error) => error === original
		)
		assert.equal(attempts, 1)
	}
})

test('bounds state-backend visibility retries and preserves the original error', async () => {
	let attempts = 0
	let waits = 0
	const original = Object.assign(new Error('pulumi failed'), {
		commandOutput: 'could not list stacks: operation error S3: ListObjectsV2, NoSuchBucket'
	})
	await assert.rejects(
		retryBootstrapStateBackendMigration({
			migrate: async () => {
				attempts += 1
				throw original
			},
			sleep: async () => {
				waits += 1
			}
		}),
		(error) => error === original
	)
	assert.equal(attempts, BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length + 1)
	assert.equal(waits, BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length)
})

test('imports both pre-created buckets on the first Pulumi update', async () => {
	const calls = []
	await reconcileBootstrapBucketUpdate({
		target: 'next',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		inspect: async () => ({ existing: ['state', 'backup'], tracked: [] }),
		apply: async (adopt) => calls.push([...adopt])
	})
	assert.deepEqual(calls, [['state', 'backup']])
})

test('retries the full import when only one pre-created bucket lags in the provider', async () => {
	const calls = []
	let first = true
	await reconcileBootstrapBucketUpdate({
		target: 'next',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		inspect: async () => ({ existing: ['state', 'backup'], tracked: [] }),
		apply: async (adopt) => {
			calls.push([...adopt])
			if (first) {
				first = false
				const error = new Error('state import visibility is delayed')
				error.commandOutput =
					"= minio:index:S3Bucket next-state import error: Preview failed: resource 'expected-state' does not exist"
				throw error
			}
		},
		sleep: async () => {}
	})
	assert.deepEqual(calls, [
		['state', 'backup'],
		['state', 'backup']
	])
})

test('retries when preview sees the bucket but update-time import visibility is delayed', async () => {
	const calls = []
	let first = true
	await reconcileBootstrapBucketUpdate({
		target: 'next',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		confirmedExisting: ['state', 'backup'],
		inspect: async () => ({ existing: ['state', 'backup'], tracked: [] }),
		apply: async (adopt) => {
			calls.push([...adopt])
			if (first) {
				first = false
				const error = new Error('update-time import visibility is delayed')
				error.commandOutput =
					"= minio:index:S3Bucket next-state importing (0s) error: resource 'expected-state' does not exist"
				throw error
			}
		},
		sleep: async () => {}
	})
	assert.deepEqual(calls, [
		['state', 'backup'],
		['state', 'backup']
	])
})

test('keeps both exact pre-created buckets in the import when signed visibility briefly flaps', async () => {
	const calls = []
	let inspections = 0
	let first = true
	await reconcileBootstrapBucketUpdate({
		target: 'next',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		confirmedExisting: ['state', 'backup'],
		inspect: async () => {
			inspections += 1
			return {
				existing: inspections === 1 ? ['backup'] : [],
				tracked: []
			}
		},
		apply: async (adopt) => {
			calls.push([...adopt])
			if (first) {
				first = false
				const error = new Error('backup import visibility is delayed')
				error.commandOutput =
					"= minio:index:S3Bucket next-backup import error: Preview failed: resource 'expected-backup' does not exist"
				throw error
			}
		},
		sleep: async () => {}
	})
	assert.deepEqual(calls, [
		['state', 'backup'],
		['state', 'backup']
	])
})

test('converges after either bucket is created without entering the failed checkpoint', async () => {
	for (const orphan of ['state', 'backup']) {
		const physical = new Set()
		const tracked = new Set()
		const calls = []
		let first = true
		await reconcileBootstrapBucketUpdate({
			target: 'production',
			expected: {
				state: 'avenos-0123456789-123-production-state',
				backup: 'avenos-0123456789-123-production-backup'
			},
			inspect: async () => ({ existing: [...physical], tracked: [...tracked] }),
			apply: async (adopt) => {
				calls.push([...adopt])
				for (const kind of adopt) tracked.add(kind)
				if (first) {
					first = false
					physical.add(orphan)
					const error = new Error('provider lost create state')
					error.commandOutput = `expected non-nil error with nil state during Create of urn:pulumi:production::aven-bootstrap::minio:index/s3Bucket:S3Bucket::production-${orphan}`
					throw error
				}
				for (const kind of ['state', 'backup']) {
					physical.add(kind)
					tracked.add(kind)
				}
			}
		})
		assert.deepEqual(calls, [[], [orphan]])
		assert.deepEqual([...physical].sort(), ['backup', 'state'])
		assert.deepEqual([...tracked].sort(), ['backup', 'state'])
	}
})

test('adopts every exact untracked bucket left by an interrupted process', async () => {
	const calls = []
	const tracked = new Set(['backup'])
	await reconcileBootstrapBucketUpdate({
		target: 'identity',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		inspect: async () => ({ existing: ['state', 'backup'], tracked: [...tracked] }),
		apply: async (adopt) => {
			calls.push([...adopt])
			for (const kind of adopt) tracked.add(kind)
		}
	})
	assert.deepEqual(calls, [['state']])
})

test('waits for provider visibility when signed reads still prove an exact bucket exists', async () => {
	const calls = []
	const waits = []
	const tracked = new Set()
	let failures = 2
	await reconcileBootstrapBucketUpdate({
		target: 'identity',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		inspect: async () => ({ existing: ['state'], tracked: [...tracked] }),
		apply: async (adopt) => {
			calls.push([...adopt])
			if (failures > 0) {
				failures -= 1
				const error = new Error('provider visibility is delayed')
				error.commandOutput =
					"= minio:index:S3Bucket identity-state import error: Preview failed: resource 'expected-state' does not exist"
				throw error
			}
			tracked.add('state')
		},
		onProviderVisibilityWait: (event) => waits.push(event),
		sleep: async (delayMs) => waits.push({ slept: delayMs })
	})
	assert.deepEqual(calls, [['state'], ['state'], ['state']])
	assert.deepEqual(waits, [
		{
			kinds: ['state'],
			retry: 1,
			maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length,
			delayMs: 2_000
		},
		{ slept: 2_000 },
		{
			kinds: ['state'],
			retry: 2,
			maxRetries: BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length,
			delayMs: 4_000
		},
		{ slept: 4_000 }
	])
})

test('converges when both serialized creates require delayed adoption', async () => {
	const calls = []
	const physical = new Set()
	const tracked = new Set()
	const invisibleOnce = new Set(['state', 'backup'])
	await reconcileBootstrapBucketUpdate({
		target: 'production',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		inspect: async () => ({ existing: [...physical], tracked: [...tracked] }),
		apply: async (adopt) => {
			calls.push([...adopt])
			if (adopt.length === 0) {
				physical.add('state')
				const error = new Error('state create lost its result')
				error.commandOutput =
					'expected non-nil error with nil state during Create of urn:pulumi:production::aven-bootstrap::minio:index/s3Bucket:S3Bucket::production-state'
				throw error
			}
			const kind = adopt[0]
			if (invisibleOnce.delete(kind)) {
				const error = new Error(`${kind} import visibility is delayed`)
				error.commandOutput = `= minio:index:S3Bucket production-${kind} import error: Preview failed: resource 'expected-${kind}' does not exist`
				throw error
			}
			tracked.add(kind)
			if (kind === 'state') {
				physical.add('backup')
				const error = new Error('backup create lost its result')
				error.commandOutput =
					'expected non-nil error with nil state during Create of urn:pulumi:production::aven-bootstrap::minio:index/s3Bucket:S3Bucket::production-backup'
				throw error
			}
		},
		sleep: async () => {}
	})
	assert.deepEqual(calls, [[], ['state'], ['state'], ['backup'], ['backup']])
	assert.deepEqual([...physical].sort(), ['backup', 'state'])
	assert.deepEqual([...tracked].sort(), ['backup', 'state'])
})

test('reimports the full batch when a failed update rolls an earlier import back', async () => {
	const calls = []
	const physical = new Set()
	const tracked = new Set()
	let update = 0
	await reconcileBootstrapBucketUpdate({
		target: 'next',
		expected: { state: 'expected-state', backup: 'expected-backup' },
		inspect: async () => ({ existing: [...physical], tracked: [...tracked] }),
		apply: async (adopt) => {
			calls.push([...adopt])
			update += 1
			if (update === 1) {
				physical.add('backup')
				const error = new Error('backup create lost its result')
				error.commandOutput =
					'expected non-nil error with nil state during Create of urn:pulumi:next::aven-bootstrap::minio:index/s3Bucket:S3Bucket::next-backup'
				throw error
			}
			if (update === 2) {
				assert.deepEqual(adopt, ['backup'])
				physical.add('state')
				// Pulumi rolls the backup import out of its checkpoint when this update fails.
				tracked.clear()
				const error = new Error('state create lost its result')
				error.commandOutput =
					'expected non-nil error with nil state during Create of urn:pulumi:next::aven-bootstrap::minio:index/s3Bucket:S3Bucket::next-state'
				throw error
			}
			for (const kind of adopt) tracked.add(kind)
		}
	})
	assert.deepEqual(calls, [[], ['backup'], ['state', 'backup']])
	assert.deepEqual([...tracked].sort(), ['backup', 'state'])
})

test('stops after the bounded provider-visibility window', async () => {
	let calls = 0
	let waits = 0
	const original = new Error('provider visibility never converged')
	original.commandOutput =
		"= minio:index:S3Bucket identity-state import error: Preview failed: resource 'expected-state' does not exist"
	await assert.rejects(
		reconcileBootstrapBucketUpdate({
			target: 'identity',
			expected: { state: 'expected-state', backup: 'expected-backup' },
			inspect: async () => ({ existing: ['state'], tracked: [] }),
			apply: async () => {
				calls += 1
				throw original
			},
			sleep: async () => {
				waits += 1
			}
		}),
		(error) => error === original
	)
	assert.equal(calls, BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length + 1)
	assert.equal(waits, BOOTSTRAP_BUCKET_VISIBILITY_RETRY_DELAYS_MS.length)
})

test('does not retry when the independent signed read no longer finds the import target', async () => {
	let calls = 0
	let inspections = 0
	const original = new Error('provider cannot find an absent bucket')
	original.commandOutput =
		"= minio:index:S3Bucket identity-state import error: Preview failed: resource 'expected-state' does not exist"
	await assert.rejects(
		reconcileBootstrapBucketUpdate({
			target: 'identity',
			expected: { state: 'expected-state', backup: 'expected-backup' },
			inspect: async () => {
				inspections += 1
				return { existing: inspections === 1 ? ['state'] : [], tracked: [] }
			},
			apply: async () => {
				calls += 1
				throw original
			},
			sleep: async () => assert.fail('an absent bucket must not enter the visibility wait')
		}),
		(error) => error === original
	)
	assert.equal(calls, 1)
})

test('derives exact adoption from every physical and checkpoint subset', async () => {
	const subsets = [[], ['state'], ['backup'], ['state', 'backup']]
	for (const existing of subsets) {
		for (const tracked of subsets) {
			const calls = []
			await reconcileBootstrapBucketUpdate({
				target: 'identity',
				expected: { state: 'expected-state', backup: 'expected-backup' },
				inspect: async () => ({ existing, tracked }),
				apply: async (adopt) => calls.push([...adopt])
			})
			assert.deepEqual(calls, [existing.filter((kind) => !tracked.includes(kind))])
		}
	}
})

test('does not loop when adoption itself cannot establish ownership', async () => {
	let calls = 0
	const original = new Error('import failed')
	await assert.rejects(
		reconcileBootstrapBucketUpdate({
			target: 'next',
			expected: { state: 'expected-state', backup: 'expected-backup' },
			inspect: async () => ({ existing: ['state'], tracked: [] }),
			apply: async () => {
				calls += 1
				throw original
			}
		}),
		(error) => error === original
	)
	assert.equal(calls, 1)
})

test('bounds retries even when a broken provider reports an already tracked create', async () => {
	let calls = 0
	const original = new Error('impossible repeated create')
	original.commandOutput =
		'expected non-nil error with nil state during Create of urn:pulumi:next::aven-bootstrap::minio:index/s3Bucket:S3Bucket::next-state'
	await assert.rejects(
		reconcileBootstrapBucketUpdate({
			target: 'next',
			expected: { state: 'expected-state', backup: 'expected-backup' },
			inspect: async () => ({ existing: ['state'], tracked: ['state'] }),
			apply: async () => {
				calls += 1
				throw original
			}
		}),
		(error) => error === original
	)
	assert.equal(calls, 3)
})

test('does not reinterpret an unrelated provider failure as owned storage', async () => {
	let calls = 0
	const original = new Error('permission denied')
	await assert.rejects(
		reconcileBootstrapBucketUpdate({
			target: 'next',
			expected: { state: 'expected-state', backup: 'expected-backup' },
			inspect: async () => ({ existing: [], tracked: [] }),
			apply: async () => {
				calls += 1
				throw original
			}
		}),
		(error) => error === original
	)
	assert.equal(calls, 1)
})

test('finds only target buckets already tracked in an interrupted bootstrap stack', () => {
	assert.deepEqual(
		trackedBootstrapBucketKinds(
			{
				deployment: {
					resources: [
						{
							type: 'minio:index/s3Bucket:S3Bucket',
							urn: 'urn:pulumi:identity::aven-bootstrap::minio:index/s3Bucket:S3Bucket::identity-backup'
						},
						{
							type: 'minio:index/s3Bucket:S3Bucket',
							urn: 'urn:pulumi:identity::aven-bootstrap::minio:index/s3Bucket:S3Bucket::next-state'
						}
					]
				}
			},
			'identity'
		),
		['backup']
	)
})

test('serializes bootstrap storage mutations through Pulumi', () => {
	assert.deepEqual(
		bootstrapPulumiUpArgs('organization/aven-bootstrap/identity', '/repo/bootstrap'),
		[
			'up',
			'--yes',
			'--parallel',
			'1',
			'--stack',
			'organization/aven-bootstrap/identity',
			'--cwd',
			'/repo/bootstrap'
		]
	)
})

test('matches Pulumi DIY and fully qualified stack names', () => {
	assert.equal(pulumiStackIsListed(['production'], 'organization/aven-bootstrap/production'), true)
	assert.equal(
		pulumiStackIsListed(
			['organization/aven-bootstrap/production'],
			'organization/aven-bootstrap/production'
		),
		true
	)
	assert.equal(pulumiStackIsListed(['next'], 'organization/aven-bootstrap/production'), false)
})

test('removes only a salt-only config before changing Pulumi backends', () => {
	const directory = mkdtempSync(join(tmpdir(), 'aven-bootstrap-stack-config-test-'))
	const stack = 'organization/aven-bootstrap/identity'
	const path = join(directory, pulumiStackConfigFileName(stack))
	writeFileSync(path, 'encryptionsalt: v1:old-generation\n')
	assert.equal(removeSaltOnlyPulumiStackConfig(directory, stack), true)
	assert.equal(existsSync(path), false)
	assert.equal(removeSaltOnlyPulumiStackConfig(directory, stack), false)
})

test('preserves a stale Pulumi config when it contains operator settings', () => {
	const directory = mkdtempSync(join(tmpdir(), 'aven-bootstrap-stack-config-test-'))
	const stack = 'organization/aven-bootstrap/identity'
	const path = join(directory, pulumiStackConfigFileName(stack))
	writeFileSync(path, 'encryptionsalt: v1:old-generation\nconfig:\n  example: retained\n')
	assert.throws(
		() => removeSaltOnlyPulumiStackConfig(directory, stack),
		/contains Pulumi settings; refusing to remove it automatically/
	)
	assert.equal(existsSync(path), true)
})

test('round-trips machine-readable bootstrap progress without accepting ordinary output', () => {
	const event = {
		status: 'active',
		current: 2,
		total: 9,
		label: 'Prepare next storage',
		detail: 'Reconciling bucket policies.'
	}
	assert.deepEqual(parseBootstrapProgress(encodeBootstrapProgress(event).trim()), event)
	assert.equal(parseBootstrapProgress('pulumi: updating resources'), undefined)
	assert.throws(
		() =>
			parseBootstrapProgress(
				'::avenos-bootstrap-progress::{"status":"active","current":0,"total":1,"label":"bad"}'
			),
		/invalid progress event/
	)
	assert.throws(
		() =>
			parseBootstrapProgress(
				'::avenos-bootstrap-progress::{"status":"active","current":1,"total":1,"label":"bad","detail":4}'
			),
		/invalid progress event/
	)
})

test('creates the local Pulumi backend as an owner-only directory', () => {
	const parent = mkdtempSync(join(tmpdir(), 'aven-bootstrap-directory-test-'))
	const directory = join(parent, 'pulumi-state')
	ensurePrivateDirectory(directory)
	assert.equal(statSync(directory).mode & 0o777, 0o700)

	chmodSync(directory, 0o755)
	assert.throws(() => ensurePrivateDirectory(directory), /must be owner-only/)
})

const credential = (name) => ({ accessKeyId: `${name}ACCESS1`, secretAccessKey: `${name}-secret` })
const input = {
	deploymentTargets: ['identity', 'next', 'production'],
	repository: 'MyAvenCEO/avenOS',
	githubPackagesReadToken: 'github-packages-read-token',
	reviewer: 'operator',
	objectStorage: {
		region: 'hel1',
		targets: Object.fromEntries(
			['identity', 'next', 'production'].map((target, index) => [
				target,
				{
					projectId: String(12345 + index),
					bootstrapCredential: credential(`${target}BOOT`),
					deploymentCredential: credential(`${target}DEPLOY`),
					observerCredential: credential(`${target}READ`)
				}
			])
		)
	},
	defaults: {
		hetznerLocation: 'hel1',
		hetznerServerType: 'cpx32',
		hetznerOsImage: 'ubuntu-24.04',
		identityVolumeSizeGb: 40,
		platformVolumeSizeGb: 80,
		sshAllowedCidrs: '192.0.2.1/32',
		acmeEmail: 'ops@example.test',
		downloadUrl: 'https://example.test/download'
	},
	providers: {
		dnsProjectId: '4567890',
		identity: { computeToken: 'identity-compute-token', dnsApiKey: 'prefix.secret' },
		next: {
			computeToken: 'next-compute-token',
			dnsToken: 'next-dns',
			polarApiKey: 'next-polar',
			polarOrganizationId: 'next-org',
			smtpUrl: 'smtp://next',
			smtpFrom: 'next@example.test'
		},
		production: {
			computeToken: 'prod-compute-token',
			dnsToken: 'prod-dns',
			polarApiKey: 'prod-polar',
			polarOrganizationId: 'prod-org',
			smtpUrl: 'smtp://prod',
			smtpFrom: 'prod@example.test'
		},
		redpillApiKey: 'redpill-secret-key'
	}
}

test('validates the complete provider input before changing anything', () => {
	assert.doesNotThrow(() => validateBootstrapInput(input))
	const { reviewer: _reviewer, ...soloInput } = input
	assert.doesNotThrow(() => validateBootstrapInput(soloInput))
	assert.throws(() => validateBootstrapInput({ ...input, reviewer: '' }), /reviewer is required/)
	assert.throws(
		() => validateBootstrapInput({ ...input, githubPackagesReadToken: '' }),
		/githubPackagesReadToken is required/
	)
	assert.throws(
		() =>
			validateBootstrapInput({
				...input,
				providers: { ...input.providers, redpillApiKey: '' }
			}),
		/providers.redpillApiKey/
	)
	assert.throws(
		() =>
			validateBootstrapInput({
				...input,
				providers: { ...input.providers, redpillApiKey: 'PASTE_REDPILL_API_KEY' }
			}),
		/template placeholder/
	)
	assert.throws(
		() =>
			validateBootstrapInput({
				...input,
				providers: { ...input.providers, dnsProjectId: 'not-a-project' }
			}),
		/providers.dnsProjectId must be numeric/
	)
	assert.throws(
		() =>
			validateBootstrapInput({
				...input,
				objectStorage: {
					...input.objectStorage,
					targets: {
						...input.objectStorage.targets,
						next: {
							...input.objectStorage.targets.next,
							projectId: input.objectStorage.targets.identity.projectId
						}
					}
				}
			}),
		/different Hetzner project/
	)
})

test('uses solo operation by default and enables review when requested', () => {
	assert.deepEqual(githubEnvironmentProtection(true), {
		wait_timer: 0,
		prevent_self_review: false,
		reviewers: [],
		deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
	})
	assert.deepEqual(githubEnvironmentProtection(true, 42), {
		wait_timer: 0,
		prevent_self_review: true,
		reviewers: [{ type: 'User', id: 42 }],
		deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
	})
	assert.deepEqual(githubEnvironmentProtection(false, 42).reviewers, [])
})

test('builds all deployment and operations environment settings', () => {
	const generated = generateBootstrapSecrets()
	assert.equal(
		new Set(Object.values(generated.targets).map((target) => target.bootstrapPulumiPassphrase))
			.size,
		3
	)
	generated.polarWebhooks = {
		next: {
			id: 'next-hook',
			url: 'https://portal.next.aven.ceo/api/webhooks/polar',
			secret: 'next-secret'
		},
		production: {
			id: 'prod-hook',
			url: 'https://portal.aven.ceo/api/webhooks/polar',
			secret: 'prod-secret'
		}
	}
	const settings = githubConfiguration(input, generated)
	const prefix = generated.deploymentPrefix
	assert.deepEqual(
		Object.keys(settings).sort(),
		[
			`${prefix}-identity`,
			`${prefix}-identity-operations`,
			`${prefix}-next`,
			`${prefix}-next-operations`,
			`${prefix}-production`,
			`${prefix}-production-operations`
		].sort()
	)
	assert.equal(
		settings[`${prefix}-next`].variables.PULUMI_STATE_S3_BUCKET,
		`${prefix}-12346-next-state`
	)
	assert.equal(
		settings[`${prefix}-next`].secrets.BACKUP_S3_ACCESS_KEY_ID,
		settings[`${prefix}-next`].secrets.PULUMI_STATE_S3_ACCESS_KEY_ID
	)
	assert.equal(
		settings[`${prefix}-next-operations`].secrets.PULUMI_STATE_S3_ACCESS_KEY_ID,
		input.objectStorage.targets.next.observerCredential.accessKeyId
	)
	assert.equal(
		settings[`${prefix}-identity`].secrets.NEXT_STATE_S3_ACCESS_KEY_ID,
		input.objectStorage.targets.next.observerCredential.accessKeyId
	)
	assert.equal(
		settings[`${prefix}-production`].secrets.LLM_GATEWAY_CREDENTIALS_JSON,
		JSON.stringify({ redpill: 'redpill-secret-key' })
	)
})

test('validates and configures only the selected deployment targets', () => {
	const nextOnly = {
		deploymentTargets: ['next'],
		repository: input.repository,
		githubPackagesReadToken: input.githubPackagesReadToken,
		objectStorage: {
			region: input.objectStorage.region,
			targets: { next: input.objectStorage.targets.next }
		},
		defaults: {
			hetznerLocation: input.defaults.hetznerLocation,
			hetznerServerType: input.defaults.hetznerServerType,
			hetznerOsImage: input.defaults.hetznerOsImage,
			platformVolumeSizeGb: input.defaults.platformVolumeSizeGb,
			sshAllowedCidrs: input.defaults.sshAllowedCidrs,
			acmeEmail: input.defaults.acmeEmail,
			downloadUrl: input.defaults.downloadUrl
		},
		providers: {
			dnsProjectId: input.providers.dnsProjectId,
			next: input.providers.next,
			redpillApiKey: input.providers.redpillApiKey
		}
	}
	assert.doesNotThrow(() => validateBootstrapInput(nextOnly))
	const generated = generateBootstrapSecrets()
	generated.polarWebhooks = {
		next: {
			id: 'next-hook',
			url: 'https://portal.next.aven.ceo/api/webhooks/polar',
			secret: 'next-secret'
		}
	}
	const settings = githubConfiguration(nextOnly, generated)
	assert.deepEqual(Object.keys(settings).sort(), [
		`${generated.deploymentPrefix}-next`,
		`${generated.deploymentPrefix}-next-operations`
	])
	assert.equal(
		settings[`${generated.deploymentPrefix}-next`].variables.PLATFORM_VOLUME_SIZE_GB,
		'80'
	)
	assert.equal(
		settings[`${generated.deploymentPrefix}-next`].variables.IDENTITY_VOLUME_SIZE_GB,
		undefined
	)
	assert.throws(
		() => validateBootstrapInput({ ...nextOnly, deploymentTargets: [] }),
		/select at least one/
	)
})

test('supports every non-empty combination without configuring an unselected target', () => {
	const combinations = [
		['identity'],
		['next'],
		['production'],
		['identity', 'next'],
		['identity', 'production'],
		['next', 'production'],
		['identity', 'next', 'production']
	]
	for (const deploymentTargets of combinations) {
		const platformTargets = deploymentTargets.filter((target) => target !== 'identity')
		const selectedInput = {
			deploymentTargets,
			repository: input.repository,
			githubPackagesReadToken: input.githubPackagesReadToken,
			objectStorage: {
				region: input.objectStorage.region,
				targets: Object.fromEntries(
					deploymentTargets.map((target) => [target, input.objectStorage.targets[target]])
				)
			},
			defaults: {
				hetznerLocation: input.defaults.hetznerLocation,
				hetznerServerType: input.defaults.hetznerServerType,
				hetznerOsImage: input.defaults.hetznerOsImage,
				sshAllowedCidrs: input.defaults.sshAllowedCidrs,
				acmeEmail: input.defaults.acmeEmail,
				...(deploymentTargets.includes('identity') && {
					identityVolumeSizeGb: input.defaults.identityVolumeSizeGb
				}),
				...(platformTargets.length > 0 && {
					platformVolumeSizeGb: input.defaults.platformVolumeSizeGb,
					downloadUrl: input.defaults.downloadUrl
				})
			},
			providers: {
				...Object.fromEntries(deploymentTargets.map((target) => [target, input.providers[target]])),
				...(platformTargets.length > 0 && {
					dnsProjectId: input.providers.dnsProjectId,
					redpillApiKey: input.providers.redpillApiKey
				})
			}
		}
		assert.doesNotThrow(() => validateBootstrapInput(selectedInput))
		const generated = generateBootstrapSecrets()
		generated.polarWebhooks = Object.fromEntries(
			platformTargets.map((target) => [
				target,
				{
					id: `${target}-hook`,
					url:
						target === 'next'
							? 'https://portal.next.aven.ceo/api/webhooks/polar'
							: 'https://portal.aven.ceo/api/webhooks/polar',
					secret: `${target}-secret`
				}
			])
		)
		const settings = githubConfiguration(selectedInput, generated)
		assert.deepEqual(
			Object.keys(settings).sort(),
			deploymentTargets
				.flatMap((target) => [
					`${generated.deploymentPrefix}-${target}`,
					`${generated.deploymentPrefix}-${target}-operations`
				])
				.sort()
		)
		const csv = recoveryCsv(selectedInput, generated)
		for (const target of ['identity', 'next', 'production']) {
			const matcher = new RegExp(`avenOS ${target} bootstrap administrator`)
			if (deploymentTargets.includes(target)) assert.match(csv, matcher)
			else assert.doesNotMatch(csv, matcher)
		}
	}
})

test('refreshes completed environments when a later target adds shared state references', () => {
	const generated = generateBootstrapSecrets()
	generated.completedTargets = ['identity']
	generated.polarWebhooks = {
		next: {
			id: 'next-hook',
			url: 'https://portal.next.aven.ceo/api/webhooks/polar',
			secret: 'next-secret'
		}
	}
	const stagedInput = { ...input, deploymentTargets: ['next'] }
	const configurationTargets = deploymentConfigurationTargets(stagedInput, generated)
	assert.deepEqual(configurationTargets, ['identity', 'next'])
	assert.doesNotThrow(() => validateBootstrapInput(stagedInput, configurationTargets))
	const settings = githubConfiguration(stagedInput, generated)
	assert.deepEqual(Object.keys(settings).sort(), [
		`${generated.deploymentPrefix}-identity`,
		`${generated.deploymentPrefix}-identity-operations`,
		`${generated.deploymentPrefix}-next`,
		`${generated.deploymentPrefix}-next-operations`
	])
	assert.equal(
		settings[`${generated.deploymentPrefix}-identity`].secrets.NEXT_STATE_S3_ACCESS_KEY_ID,
		input.objectStorage.targets.next.observerCredential.accessKeyId
	)
})

test('writes password-manager recovery material owner-only', () => {
	const directory = mkdtempSync(join(tmpdir(), 'aven-bootstrap-test-'))
	chmodSync(directory, 0o700)
	const path = join(directory, 'recovery.csv')
	const generated = generateBootstrapSecrets()
	generated.polarWebhooks = {
		next: {
			id: 'next-hook',
			url: 'https://portal.next.aven.ceo/api/webhooks/polar',
			secret: 'next-secret'
		},
		production: {
			id: 'prod-hook',
			url: 'https://portal.aven.ceo/api/webhooks/polar',
			secret: 'prod-secret'
		}
	}
	writeRecoveryCsv(path, recoveryCsv(input, generated))
	assert.equal(statSync(path).mode & 0o777, 0o600)
	const contents = readFileSync(path, 'utf8')
	assert.match(contents, /"Group","Title","Username","Password","URL","Notes"/)
	assert.match(contents, new RegExp(`avenOS/${generated.deploymentPrefix}/next`))
	assert.match(contents, /avenOS next Restic password/)
	assert.match(contents, /avenOS identity bootstrap administrator/)
	assert.match(contents, /avenOS next bootstrap administrator/)
	assert.match(contents, /avenOS production bootstrap administrator/)
	assert.match(contents, /avenOS production billing \(Polar API key\)/)
	assert.match(contents, /serves checkout, subscription, customer, and order operations/)
	assert.match(contents, /projects\/12345\/security\/s3-credentials/)
	assert.match(contents, /projects\/4567890\/security\/tokens/)
	assert.match(contents, /shared aven\.ceo DNS zone in Hetzner project 4567890/)
	assert.match(contents, /avenOS RedPill API key/)
	assert.match(contents, /avenOS GitHub Packages reader/)
	assert.match(contents, /avenOS identity recovery storage/)
	assert.match(contents, /identity-state/)
	assert.match(contents, /identity-backup/)
	assert.doesNotMatch(contents, /aven\.id apex A record/)
	assert.throws(() => writeRecoveryCsv(path, contents), /refusing to overwrite/)
})

test('adds the resumable initial rollout and automated DNS evidence to the password-manager CSV', () => {
	const generated = generateBootstrapSecrets()
	generated.polarWebhooks = {
		next: {
			id: 'next-hook',
			url: 'https://portal.next.aven.ceo/api/webhooks/polar',
			secret: 'next-secret'
		},
		production: {
			id: 'prod-hook',
			url: 'https://portal.aven.ceo/api/webhooks/polar',
			secret: 'prod-secret'
		}
	}
	generated.initialRollout = {
		ref: '0123456789abcdef0123456789abcdef01234567',
		targets: ['identity', 'next', 'production'],
		infrastructurePreviewRunId: 101,
		infrastructureApplyRunId: 102,
		identityDns: { ipv4: '192.0.2.10', ipv6: '2001:db8::10', verified: false }
	}

	const pendingContents = recoveryCsv(input, generated)
	assert.match(pendingContents, /aven\.id apex A record/)
	assert.match(pendingContents, /aven\.id apex AAAA record/)
	assert.match(pendingContents, /192\.0\.2\.10/)
	assert.match(pendingContents, /2001:db8::10/)
	assert.match(pendingContents, /Type A, apex name @, TTL 300/)
	assert.match(pendingContents, /will publish and verify it through United Domains/)
	assert.match(pendingContents, /actions\/runs\/101/)
	assert.match(pendingContents, /actions\/runs\/102/)
	assert.doesNotMatch(pendingContents, /actions\/runs\/103/)

	generated.initialRollout.identityDns.verified = true
	generated.initialRollout.deployRunId = 103
	generated.initialRollout.verifiedAt = '2026-08-30T12:00:00.000Z'
	const completedContents = recoveryCsv(input, generated)
	assert.match(completedContents, /published this value through United Domains/)
	assert.match(completedContents, /actions\/runs\/103/)
	assert.match(completedContents, /commit\/0123456789abcdef0123456789abcdef01234567/)
	assert.match(completedContents, /Public installation verified at 2026-08-30T12:00:00\.000Z/)
	assert.match(completedContents, /https:\/\/api\.next\.aven\.ceo/)
	assert.match(completedContents, /https:\/\/portal\.aven\.ceo/)
	assert.match(completedContents, /settings\/environments/)
})
