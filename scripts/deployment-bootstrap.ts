#!/usr/bin/env bun
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { observeMailProvider } from '../services/checkout/src/lib/server/email/provider-health.js'
import {
	assertPrivateFile,
	type BootstrapBucketKind,
	type BootstrapInput,
	bootstrapPulumiUpArgs,
	bootstrapStackReadyForMigration,
	deploymentConfigurationTargets,
	encodeBootstrapProgress,
	ensureBootstrapBucketExists,
	ensurePrivateDirectory,
	githubConfiguration,
	githubDeploymentBranches,
	githubEnvironmentProtection,
	githubEnvironmentVariableChanges,
	isRetryableGitHubError,
	loadOrCreateGeneratedSecrets,
	objectStorageBucketName,
	PULUMI_ORGANIZATION,
	pulumiStackIsListed,
	reconcileBootstrapBucketUpdate,
	recoveryCsv,
	removeSaltOnlyPulumiStackConfig,
	retryBootstrapStateBackendMigration,
	saveGeneratedSecrets,
	selectedDeploymentTargets,
	TARGETS,
	type Target,
	trackedBootstrapBucketKinds,
	validateBootstrapInput,
	writeRecoveryCsv
} from './lib/deployment-bootstrap.js'
import {
	configureRecoveryBucketLifecycle,
	createExactS3Bucket,
	exactS3BucketExists
} from './lib/deployment-bootstrap-guided.js'
import { ensurePolarCatalog } from './lib/polar-catalog.js'
import { ensurePolarWebhook } from './lib/polar-webhook.js'
import { fetchRedpillPhalaCatalog } from './lib/redpill-model-catalog.js'
import { releaseRules } from './lib/release-rules.js'

const root = resolve(import.meta.dir, '..')
const args = process.argv.slice(2)
const value = (name: string) => {
	const index = args.indexOf(name)
	if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`)
	return resolve(args[index + 1] as string)
}
const inputPath = value('--input')
const outputDirectory = value('--output')
const dryRun = args.includes('--dry-run')
const progressJson = args.includes('--progress-json')
const outputRelativeToRepository = relative(root, outputDirectory)
if (
	outputRelativeToRepository === '' ||
	(outputRelativeToRepository !== '..' &&
		!outputRelativeToRepository.startsWith(`..${sep}`) &&
		!isAbsolute(outputRelativeToRepository))
)
	throw new Error('The deployment bootstrap output must be outside the repository checkout.')

assertPrivateFile(inputPath)
const parsedInput: unknown = JSON.parse(readFileSync(inputPath, 'utf8'))
validateBootstrapInput(parsedInput)
const input: BootstrapInput = parsedInput
const selectedTargets = selectedDeploymentTargets(input.deploymentTargets)
const platformTargets = selectedTargets.filter(
	(target): target is 'next' | 'production' => target !== 'identity'
)
ensurePrivateDirectory(outputDirectory)

const generatedPath = resolve(outputDirectory, 'bootstrap.generated.json')
const recoveryPath = resolve(outputDirectory, 'avenos-recovery.csv')
const generated = loadOrCreateGeneratedSecrets(generatedPath)
const configurationTargets = deploymentConfigurationTargets(input, generated)
validateBootstrapInput(input, configurationTargets)

let catalog = [] as Awaited<ReturnType<typeof fetchRedpillPhalaCatalog>>

for (const target of platformTargets) {
	const provider = input.providers[target]
	const observation = await observeMailProvider(provider.smtpUrl, provider.smtpFrom)
	if (!observation.healthy)
		throw new Error(
			`${target} email capability is unavailable: ${observation.code}. SMTP login alone does not prove sending capacity; correct the provider setup before provisioning.`
		)
}

if (dryRun) {
	catalog =
		platformTargets.length > 0
			? await fetchRedpillPhalaCatalog(fetch, input.providers.redpillApiKey as string)
			: []
	const planned = {
		...generated,
		polarWebhooks: {
			...generated.polarWebhooks,
			...(platformTargets.includes('next') && {
				next: {
					id: 'pending',
					url: 'https://portal.next.aven.ceo/api/webhooks/polar',
					secret: 'pending'
				}
			}),
			...(platformTargets.includes('production') && {
				production: {
					id: 'pending',
					url: 'https://portal.aven.ceo/api/webhooks/polar',
					secret: 'pending'
				}
			})
		}
	}
	const github = githubConfiguration(input, planned)
	process.stdout.write(
		`Bootstrap plan is valid for ${selectedTargets.join(', ')}: ${selectedTargets.length * 2} buckets, ${platformTargets.length} Polar webhook(s), ${Object.keys(github).length} GitHub Environments, ${catalog.length} Phala models.\n`
	)
	process.exit(0)
}

const progressTotal =
	(platformTargets.length > 0 ? 1 : 0) +
	selectedTargets.length +
	platformTargets.length +
	1 +
	1 +
	configurationTargets.length * 2 +
	2
let completedProgress = 0
let activeProgress: { label: string; detail?: string } | undefined
function emitProgress(status: 'active' | 'complete', label: string, detail?: string): void {
	if (!progressJson) return
	process.stdout.write(
		encodeBootstrapProgress({
			status,
			current: completedProgress + 1,
			total: progressTotal,
			label,
			detail
		})
	)
}
function beginProgress(label: string, detail?: string): void {
	activeProgress = { label, detail }
	emitProgress('active', label, detail)
}
function updateProgress(detail: string): void {
	if (activeProgress) {
		activeProgress.detail = detail
		emitProgress('active', activeProgress.label, detail)
	}
}
function completeProgress(detail?: string): void {
	if (!activeProgress) return
	emitProgress('complete', activeProgress.label, detail ?? activeProgress.detail)
	completedProgress += 1
	activeProgress = undefined
}

if (platformTargets.length > 0) {
	beginProgress('Discover chat models', 'Reading the authenticated RedPill catalog.')
	catalog = await fetchRedpillPhalaCatalog(fetch, input.providers.redpillApiKey as string)
	completeProgress(`${catalog.length} Phala-hosted model(s) selected.`)
}

async function run(
	command: string,
	commandArgs: string[],
	options: { env?: Record<string, string>; stdin?: string; quiet?: boolean; capture?: boolean } = {}
) {
	const capture = options.quiet || options.capture
	const child = Bun.spawn([command, ...commandArgs], {
		cwd: root,
		env: { ...process.env, ...options.env },
		stdin: options.stdin === undefined ? 'ignore' : new Blob([options.stdin]),
		stdout: capture ? 'pipe' : 'inherit',
		stderr: capture ? 'pipe' : 'inherit'
	})
	const relay = async (
		stream: ReadableStream<Uint8Array>,
		destination: NodeJS.WriteStream
	): Promise<string> => {
		const reader = stream.getReader()
		const decoder = new TextDecoder()
		let result = ''
		for (;;) {
			const { value, done } = await reader.read()
			if (done) break
			const text = decoder.decode(value, { stream: true })
			result += text
			if (!options.quiet) destination.write(text)
		}
		const tail = decoder.decode()
		result += tail
		if (tail && !options.quiet) destination.write(tail)
		return result
	}
	const [exitCode, stdout, stderr] = capture
		? await Promise.all([
				child.exited,
				relay(child.stdout as ReadableStream<Uint8Array>, process.stdout),
				relay(child.stderr as ReadableStream<Uint8Array>, process.stderr)
			])
		: [await child.exited, '', '']
	if (exitCode !== 0) {
		const error = new Error(
			`${command} failed${stderr && options.quiet ? `: ${stderr.trim()}` : ''}`
		)
		Object.assign(error, { commandOutput: `${stdout}\n${stderr}` })
		throw error
	}
	return stdout.trim()
}

async function runGitHub(
	commandArgs: string[],
	options: { stdin?: string; quiet?: boolean; capture?: boolean } = {}
) {
	const attempts = 4
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await run('gh', commandArgs, options)
		} catch (error) {
			if (attempt === attempts || !isRetryableGitHubError(error)) throw error
			updateProgress(
				`GitHub did not answer; retrying the current request (${attempt + 1}/${attempts}).`
			)
			await Bun.sleep(attempt * 1_000)
		}
	}
	throw new Error('GitHub retry loop ended unexpectedly.')
}

const bootstrapCwd = resolve(root, 'infrastructure/bootstrap')
const localStateDirectory = resolve(outputDirectory, 'pulumi-state')
ensurePrivateDirectory(localStateDirectory)
const localBackend = `file://${localStateDirectory}`

async function existingBootstrapBucketKinds(
	expected: Record<BootstrapBucketKind, string>,
	storage: BootstrapInput['objectStorage']['targets'][Target]
): Promise<BootstrapBucketKind[]> {
	const checks = await Promise.all(
		(['state', 'backup'] as const).map(async (kind) => {
			const exists = await exactS3BucketExists({
				region: input.objectStorage.region,
				accessKeyId: storage.bootstrapCredential.accessKeyId,
				secretAccessKey: storage.bootstrapCredential.secretAccessKey,
				bucket: expected[kind]
			})
			return exists ? kind : undefined
		})
	)
	return checks.filter((kind): kind is BootstrapBucketKind => kind !== undefined)
}

async function openPulumiStack(
	stack: string,
	cwd: string,
	env: Record<string, string>
): Promise<void> {
	removeSaltOnlyPulumiStackConfig(cwd, stack)
	const listed = JSON.parse(
		await run('pulumi', ['stack', 'ls', '--json', '--cwd', cwd], { env, quiet: true })
	) as Array<{ name?: unknown }>
	const stackNames = listed.flatMap(({ name }) => (typeof name === 'string' ? [name] : []))
	if (pulumiStackIsListed(stackNames, stack)) {
		await run('pulumi', ['stack', 'select', stack, '--cwd', cwd], { env, quiet: true })
		return
	}
	await run('pulumi', ['stack', 'init', stack, '--cwd', cwd], { env, quiet: true })
}

for (const target of selectedTargets) {
	beginProgress(`Prepare ${target} storage`, `Opening the ${target} bootstrap stack.`)
	const storage = input.objectStorage.targets[target]
	const bootstrapEnvironment = {
		PULUMI_CONFIG_PASSPHRASE: generated.targets[target].bootstrapPulumiPassphrase,
		AWS_ACCESS_KEY_ID: storage.bootstrapCredential.accessKeyId,
		AWS_SECRET_ACCESS_KEY: storage.bootstrapCredential.secretAccessKey,
		AWS_REGION: input.objectStorage.region,
		AWS_DEFAULT_REGION: input.objectStorage.region,
		AWS_EC2_METADATA_DISABLED: 'true',
		OBJECT_STORAGE_TARGET: target,
		OBJECT_STORAGE_PROJECT_ID: storage.projectId,
		OBJECT_STORAGE_REGION: input.objectStorage.region,
		OBJECT_STORAGE_BUCKET_PREFIX: generated.deploymentPrefix,
		BOOTSTRAP_S3_ACCESS_KEY_ID: storage.bootstrapCredential.accessKeyId,
		BOOTSTRAP_S3_SECRET_ACCESS_KEY: storage.bootstrapCredential.secretAccessKey,
		DEPLOYMENT_S3_ACCESS_KEY_ID: storage.deploymentCredential.accessKeyId,
		OBSERVER_S3_ACCESS_KEY_ID: storage.observerCredential.accessKeyId
	}
	const stack = `${PULUMI_ORGANIZATION}/aven-bootstrap/${target}`
	const stateBucket = objectStorageBucketName(input, generated, target, 'state')
	const remoteBackend = `s3://${stateBucket}/avenos/bootstrap?endpoint=${input.objectStorage.region}.your-objectstorage.com&region=${input.objectStorage.region}&s3ForcePathStyle=true&awssdk=v2`
	const migratedMarker = resolve(outputDirectory, `bootstrap.${target}.remote`)

	if (!existsSync(migratedMarker)) {
		updateProgress(`Using owner-only local state while the ${target} buckets are created.`)
		await run('pulumi', ['login', localBackend], { env: bootstrapEnvironment })
		await openPulumiStack(stack, bootstrapCwd, bootstrapEnvironment)
		updateProgress(
			`Creating or reconciling the ${target} state and backup buckets and access policies.`
		)
		const expectedBuckets = {
			state: objectStorageBucketName(input, generated, target, 'state'),
			backup: objectStorageBucketName(input, generated, target, 'backup')
		}
		const confirmedBuckets: BootstrapBucketKind[] = []
		for (const kind of ['state', 'backup'] as const) {
			const bucket = expectedBuckets[kind]
			updateProgress(`Ensuring the exact private ${target} ${kind} bucket exists.`)
			await ensureBootstrapBucketExists({
				exists: () =>
					exactS3BucketExists({
						region: input.objectStorage.region,
						accessKeyId: storage.bootstrapCredential.accessKeyId,
						secretAccessKey: storage.bootstrapCredential.secretAccessKey,
						bucket
					}),
				create: () =>
					createExactS3Bucket({
						region: input.objectStorage.region,
						accessKeyId: storage.bootstrapCredential.accessKeyId,
						secretAccessKey: storage.bootstrapCredential.secretAccessKey,
						bucket
					}),
				onVisibilityWait: ({ retry, maxRetries, delayMs }) =>
					updateProgress(
						`Hetzner accepted the ${target} ${kind} bucket; waiting ${Math.ceil(delayMs / 1_000)}s for signed visibility (${retry}/${maxRetries}).`
					)
			})
			confirmedBuckets.push(kind)
		}
		updateProgress(
			`Importing both exact ${target} buckets into Pulumi and applying access policies.`
		)
		const localStack = JSON.parse(
			await run('pulumi', ['stack', 'export', '--stack', stack, '--cwd', bootstrapCwd], {
				env: bootstrapEnvironment,
				quiet: true
			})
		) as unknown
		if (bootstrapStackReadyForMigration(localStack as never, target)) {
			updateProgress(
				`Complete local ${target} bootstrap state found; resuming its remote migration without repeating the provider update.`
			)
		} else {
			await reconcileBootstrapBucketUpdate({
				target,
				expected: expectedBuckets,
				confirmedExisting: confirmedBuckets,
				inspect: async () => {
					const currentStack = JSON.parse(
						await run('pulumi', ['stack', 'export', '--stack', stack, '--cwd', bootstrapCwd], {
							env: bootstrapEnvironment,
							quiet: true
						})
					) as unknown
					return {
						existing: await existingBootstrapBucketKinds(expectedBuckets, storage),
						tracked: trackedBootstrapBucketKinds(currentStack as never, target)
					}
				},
				apply: async (bucketsToAdopt) => {
					await run('pulumi', bootstrapPulumiUpArgs(stack, bootstrapCwd), {
						env: {
							...bootstrapEnvironment,
							OBJECT_STORAGE_ADOPT_EXISTING_BUCKETS: bucketsToAdopt.join(',')
						},
						capture: true
					})
				},
				onAdopt: (bucketsToAdopt) =>
					updateProgress(
						`Adopting the exact existing, untracked ${target} ${bucketsToAdopt.join(' and ')} bucket, then continuing the same apply.`
					),
				onProviderVisibilityWait: ({ kinds, retry, maxRetries, delayMs }) =>
					updateProgress(
						`Hetzner confirms the ${target} ${kinds.join(' and ')} bucket, but the infrastructure provider cannot see it yet; retrying in ${Math.ceil(delayMs / 1_000)}s (${retry}/${maxRetries}).`
					)
			})
		}
		const exportPath = resolve(outputDirectory, `bootstrap-state-${target}.json`)
		await run(
			'pulumi',
			['stack', 'export', '--stack', stack, '--cwd', bootstrapCwd, '--file', exportPath],
			{ env: bootstrapEnvironment }
		)
		chmodSync(exportPath, 0o600)
		updateProgress(`Moving the ${target} bootstrap state into its private state bucket.`)
		await retryBootstrapStateBackendMigration({
			migrate: async () => {
				await run('pulumi', ['login', remoteBackend], { env: bootstrapEnvironment, capture: true })
				await openPulumiStack(stack, bootstrapCwd, bootstrapEnvironment)
				await run(
					'pulumi',
					['stack', 'import', '--stack', stack, '--cwd', bootstrapCwd, '--file', exportPath],
					{ env: bootstrapEnvironment, capture: true }
				)
			},
			onVisibilityWait: ({ retry, maxRetries, delayMs }) =>
				updateProgress(
					`The new ${target} state backend is not consistently visible yet; retrying its idempotent migration in ${Math.ceil(delayMs / 1_000)}s (${retry}/${maxRetries}).`
				)
		})
		writeFileSync(migratedMarker, `${remoteBackend}\n`, { mode: 0o600, flag: 'wx' })
	} else {
		updateProgress(`Remote ${target} bootstrap state found; reconciling it in place.`)
		await run('pulumi', ['login', remoteBackend], { env: bootstrapEnvironment })
		await run('pulumi', bootstrapPulumiUpArgs(stack, bootstrapCwd), {
			env: bootstrapEnvironment
		})
	}
	updateProgress(
		`Bounding noncurrent ${target} bucket versions to 90 days; live backup retention is unchanged.`
	)
	for (const kind of ['state', 'backup'] as const) {
		await configureRecoveryBucketLifecycle({
			region: input.objectStorage.region,
			...storage.bootstrapCredential,
			bucket: objectStorageBucketName(input, generated, target, kind)
		})
	}
	completeProgress(`${target} storage, version retention and role policies are reconciled.`)
}

generated.polarWebhooks ??= {}
for (const target of platformTargets) {
	beginProgress(
		`Configure ${target} billing`,
		`Reconciling the Polar webhook and published product manifest.`
	)
	const provider = input.providers[target]
	const endpoint = await ensurePolarWebhook({
		accessToken: provider.polarApiKey,
		organizationId: provider.polarOrganizationId,
		server: target === 'next' ? 'sandbox' : 'production',
		target
	})
	generated.polarWebhooks[target] = {
		id: endpoint.id,
		url: endpoint.url,
		secret: endpoint.secret
	}
	// Preserve the one-time signing secret before a later catalog call can fail.
	saveGeneratedSecrets(generatedPath, generated)
	updateProgress(`Applying the published pricing manifest to Polar ${target}.`)
	const catalogResult = await ensurePolarCatalog({
		accessToken: provider.polarApiKey,
		organizationId: provider.polarOrganizationId,
		server: target === 'next' ? 'sandbox' : 'production',
		publicBaseUrl: target === 'next' ? 'https://portal.next.aven.ceo' : 'https://portal.aven.ceo',
		webhookSecret: endpoint.secret
	})
	completeProgress(
		`${target} Polar webhook ${endpoint.id}, ${Object.keys(catalogResult.products).length} product(s), and ${Object.values(catalogResult.benefits).reduce((total, count) => total + count, 0)} product-benefit attachment(s) are configured.`
	)
}
saveGeneratedSecrets(generatedPath, generated)

beginProgress('Write recovery record', 'Collecting generated and provider-issued credentials.')
const expectedRecovery = recoveryCsv(input, generated)
if (!existsSync(recoveryPath)) writeRecoveryCsv(recoveryPath, expectedRecovery)
else {
	assertPrivateFile(recoveryPath)
	if (readFileSync(recoveryPath, 'utf8') !== expectedRecovery)
		throw new Error(
			`${recoveryPath} no longer matches provider state; move it aside after reconciling the password manager, then rerun.`
		)
}
completeProgress('The owner-only password-manager CSV is current.')

const github = githubConfiguration(input, generated)

beginProgress(
	'Configure package reader',
	'Storing the repository-level token used only for cross-repository npm downloads.'
)
await runGitHub(['secret', 'set', 'PACKAGE_READ_TOKEN', '--repo', input.repository], {
	stdin: input.githubPackagesReadToken,
	quiet: true
})
await runGitHub(
	['secret', 'set', 'PACKAGE_READ_TOKEN', '--repo', input.repository, '--app', 'dependabot'],
	{
		stdin: input.githubPackagesReadToken,
		quiet: true
	}
)
// Do not let any development workflow obtain a repository-wide ruleset bypass key.
const repositorySecretNames = await runGitHub(
	['secret', 'list', '--repo', input.repository, '--json', 'name', '--jq', '.[].name'],
	{ quiet: true }
)
if (repositorySecretNames.split('\n').includes('DEPLOY_KEY'))
	await runGitHub(['secret', 'delete', 'DEPLOY_KEY', '--repo', input.repository], { quiet: true })
const existingRules = JSON.parse(
	await runGitHub(['api', `repos/${input.repository}/rulesets`], { quiet: true })
)
for (const body of releaseRules()) {
	const existing = existingRules.find(
		(item: { name: string; id: number }) => item.name === body.name
	)
	await runGitHub(
		[
			'api',
			'--method',
			existing ? 'PUT' : 'POST',
			`repos/${input.repository}/rulesets${existing ? `/${existing.id}` : ''}`,
			'--input',
			'-'
		],
		{ stdin: JSON.stringify(body), quiet: true }
	)
}
// Preserve unrelated rules. The former shared rule keeps protecting main only;
// release branches now use mandatory PR/check rules with no deploy-key bypass.
const oldRule = existingRules.find(
	(item: { name: string; id: number }) => item.name === 'protect-deployments'
)
if (oldRule) {
	const rule = JSON.parse(
		await runGitHub(['api', `repos/${input.repository}/rulesets/${oldRule.id}`], { quiet: true })
	)
	if (
		rule.conditions?.ref_name?.include?.every((name: string) =>
			['refs/heads/main', 'refs/heads/next', 'refs/heads/prod'].includes(name)
		)
	) {
		await runGitHub(
			[
				'api',
				'--method',
				'PUT',
				`repos/${input.repository}/rulesets/${oldRule.id}`,
				'--input',
				'-'
			],
			{
				stdin: JSON.stringify({
					name: rule.name,
					target: rule.target,
					enforcement: rule.enforcement,
					conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
					bypass_actors: [],
					rules: rule.rules
				}),
				quiet: true
			}
		)
	}
}
completeProgress('The GitHub Packages read token is stored as an encrypted repository secret.')

beginProgress(
	'Protect repository credentials',
	'Enabling provider secret scanning, push protection, and dependency security alerts.'
)
const repositorySettings = JSON.parse(
	await runGitHub(['api', `repos/${input.repository}`], { quiet: true })
)
if (
	repositorySettings.private === false ||
	repositorySettings.security_and_analysis?.secret_scanning
) {
	await runGitHub(['api', '--method', 'PATCH', `repos/${input.repository}`, '--input', '-'], {
		stdin: JSON.stringify({
			security_and_analysis: {
				secret_scanning: { status: 'enabled' },
				secret_scanning_push_protection: { status: 'enabled' }
			}
		}),
		quiet: true
	})
} else {
	throw new Error(
		'This repository plan does not expose secret scanning. Enable the required GitHub protection before continuing; the local secret gate is not a provider push-protection substitute.'
	)
}
await runGitHub(['api', '--method', 'PUT', `repos/${input.repository}/vulnerability-alerts`], {
	quiet: true
})
await runGitHub(['api', '--method', 'PUT', `repos/${input.repository}/automated-security-fixes`], {
	quiet: true
})
completeProgress(
	'Secret scanning, push protection and automated dependency security updates are enabled.'
)

const reviewerId = input.reviewer
	? Number(await runGitHub(['api', `users/${input.reviewer}`, '--jq', '.id'], { quiet: true }))
	: undefined
if (reviewerId !== undefined && !Number.isSafeInteger(reviewerId))
	throw new Error(`Could not resolve GitHub reviewer ${input.reviewer}.`)

for (const [environment, settings] of Object.entries(github)) {
	beginProgress(`Configure ${environment}`, 'Applying protection rules, secrets, and variables.')
	const protectedDeployment = TARGETS.some(
		(target) => environment === `${generated.deploymentPrefix}-${target}`
	)
	const body = githubEnvironmentProtection(protectedDeployment, reviewerId)
	await runGitHub(
		[
			'api',
			'--method',
			'PUT',
			`repos/${input.repository}/environments/${environment}`,
			'--input',
			'-'
		],
		{ stdin: JSON.stringify(body), quiet: true }
	)
	const target = TARGETS.find(
		(candidate) =>
			environment === `${generated.deploymentPrefix}-${candidate}` ||
			environment === `${generated.deploymentPrefix}-${candidate}-operations`
	)
	if (!target) throw new Error('Unexpected deployment Environment name.')
	const allowedBranches = githubDeploymentBranches(target)
	const policies = JSON.parse(
		await runGitHub(
			['api', `repos/${input.repository}/environments/${environment}/deployment-branch-policies`],
			{ quiet: true }
		)
	)
	for (const policy of policies.branch_policies ?? []) {
		if (policy.type !== 'branch' || !allowedBranches.includes(policy.name))
			await runGitHub(
				[
					'api',
					'--method',
					'DELETE',
					`repos/${input.repository}/environments/${environment}/deployment-branch-policies/${policy.id}`
				],
				{ quiet: true }
			)
	}
	for (const branch of allowedBranches) {
		if (
			!(policies.branch_policies ?? []).some(
				(policy: { name: string; type: string }) =>
					policy.type === 'branch' && policy.name === branch
			)
		)
			await runGitHub(
				[
					'api',
					'--method',
					'POST',
					`repos/${input.repository}/environments/${environment}/deployment-branch-policies`,
					'--input',
					'-'
				],
				{ stdin: JSON.stringify({ name: branch, type: 'branch' }), quiet: true }
			)
	}
	for (const [name, secret] of Object.entries(settings.secrets)) {
		await runGitHub(['secret', 'set', name, '--repo', input.repository, '--env', environment], {
			stdin: secret,
			quiet: true
		})
	}
	const existingVariableNames = (
		await runGitHub(
			[
				'api',
				`repos/${input.repository}/environments/${environment}/variables`,
				'--paginate',
				'--jq',
				'.variables[].name'
			],
			{ quiet: true }
		)
	)
		.split('\n')
		.filter(Boolean)
	const variableChanges = githubEnvironmentVariableChanges(
		settings.variables,
		existingVariableNames
	)
	for (const [name, variable] of variableChanges.set) {
		const exists = existingVariableNames.includes(name)
		await runGitHub(
			[
				'api',
				'--method',
				exists ? 'PATCH' : 'POST',
				`repos/${input.repository}/environments/${environment}/variables${exists ? `/${name}` : ''}`,
				'--input',
				'-'
			],
			{ stdin: JSON.stringify({ name, value: variable }), quiet: true }
		)
	}
	for (const name of variableChanges.remove) {
		await runGitHub(
			[
				'api',
				'--method',
				'DELETE',
				`repos/${input.repository}/environments/${environment}/variables/${name}`
			],
			{ quiet: true }
		)
	}
	completeProgress(
		`${environment}: ${Object.keys(settings.secrets).length} secret(s) and ${variableChanges.set.length} variable(s) configured; ${Object.keys(settings.variables).length - variableChanges.set.length} empty value(s) kept absent.`
	)
}

beginProgress('Activate deployment namespace', 'Updating the repository-level environment prefix.')
const activatedTargets = configurationTargets
await runGitHub(
	[
		'variable',
		'set',
		'DEPLOYMENT_TARGETS_JSON',
		'--repo',
		input.repository,
		'--body',
		JSON.stringify(activatedTargets)
	],
	{ quiet: true }
)
updateProgress(
	`Configured target set: ${activatedTargets.join(', ')}. Switching the active namespace last.`
)
await runGitHub(
	[
		'variable',
		'set',
		'DEPLOYMENT_ENVIRONMENT_PREFIX',
		'--repo',
		input.repository,
		'--body',
		generated.deploymentPrefix
	],
	{ quiet: true }
)
generated.completedTargets = activatedTargets
saveGeneratedSecrets(generatedPath, generated)
completeProgress(`${generated.deploymentPrefix} now selects the configured GitHub Environments.`)

process.stdout.write(
	`Bootstrap complete for ${generated.deploymentPrefix} (${selectedTargets.join(', ')}): ${selectedTargets.length * 2} isolated buckets, ${platformTargets.length} Polar webhook(s), ${Object.keys(github).length} GitHub Environments, and ${catalog.length} Phala models configured. Import ${recoveryPath} into the company password manager, then remove the local bootstrap directory after verifying the remote stack and import.\n`
)
