#!/usr/bin/env bun
import { chmodSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { Polar } from '@polar-sh/sdk'
import {
	assertPrivateFile,
	type BootstrapBucketKind,
	type BootstrapInput,
	encodeBootstrapProgress,
	ensurePrivateDirectory,
	isRetryableGitHubError,
	loadOrCreateGeneratedSecrets,
	objectStorageBucketName,
	pulumiStackIsListed,
	removeSaltOnlyPulumiStackConfig,
	selectedDeploymentTargets,
	type Target,
	trackedBootstrapBucketKinds,
	validateBootstrapInput
} from './lib/deployment-bootstrap.js'
import { signedS3ReadRequest } from './lib/deployment-bootstrap-guided.js'
import {
	activePrefixAllowsRepositoryCleanup,
	bootstrapBucketUrns,
	bootstrapStateContainsNoUnexpectedBuckets,
	bootstrapStorageTeardownPlan,
	bootstrapTeardownStackName,
	githubEnvironmentNames,
	localPulumiLockPid,
	ownedPolarCatalogResources,
	platformProtectionTargetUrns,
	platformStackName,
	uninstallSummary,
	uninstallTargets
} from './lib/deployment-uninstall.js'
import { removeUnitedDomainsIdentityDns } from './lib/united-domains-dns.js'

const root = resolve(import.meta.dir, '..')
const args = process.argv.slice(2)
const argument = (name: string) => {
	const index = args.indexOf(name)
	if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`)
	return resolve(args[index + 1] as string)
}
const inputPath = argument('--input')
const outputDirectory = argument('--output')
const dryRun = args.includes('--dry-run')
const progressJson = args.includes('--progress-json')
const outputRelativeToRepository = relative(root, outputDirectory)
if (
	outputRelativeToRepository === '' ||
	(outputRelativeToRepository !== '..' &&
		!outputRelativeToRepository.startsWith(`..${sep}`) &&
		!isAbsolute(outputRelativeToRepository))
)
	throw new Error('The deployment uninstall record must be outside the repository checkout.')

assertPrivateFile(inputPath)
const parsedInput: unknown = JSON.parse(readFileSync(inputPath, 'utf8'))
validateBootstrapInput(parsedInput)
const input: BootstrapInput = parsedInput
ensurePrivateDirectory(outputDirectory)
const generatedPath = resolve(outputDirectory, 'bootstrap.generated.json')
assertPrivateFile(generatedPath)
const generated = loadOrCreateGeneratedSecrets(generatedPath)
const targets = uninstallTargets(input, generated)
validateBootstrapInput(input, targets)
const environments = githubEnvironmentNames(generated.deploymentPrefix, targets)
const confirmedGenerationIndex = args.indexOf('--confirmed-generation')
if (
	!dryRun &&
	(confirmedGenerationIndex < 0 ||
		args[confirmedGenerationIndex + 1] !== generated.deploymentPrefix)
)
	throw new Error(
		`Refusing provider changes without --confirmed-generation ${generated.deploymentPrefix}. Use the guided setup menu so the operator sees and types the full destructive confirmation.`
	)

if (dryRun) {
	process.stdout.write(`${uninstallSummary(generated.deploymentPrefix, targets, environments)}\n`)
	process.exit(0)
}

const platformCwd = resolve(root, 'infrastructure/platform')
const bootstrapCwd = resolve(root, 'infrastructure/bootstrap')
const localTeardownState = resolve(outputDirectory, 'uninstall-pulumi-state')
ensurePrivateDirectory(localTeardownState)
const localTeardownBackend = `file://${localTeardownState}`
const platformTargets = targets.filter(
	(target): target is 'next' | 'production' => target !== 'identity'
)
const progressTotal =
	targets.length +
	platformTargets.length +
	1 +
	targets.length +
	(targets.includes('identity') ? 1 : 0)
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
	if (!activeProgress) return
	activeProgress.detail = detail
	emitProgress('active', activeProgress.label, detail)
}

function completeProgress(detail?: string): void {
	if (!activeProgress) return
	emitProgress('complete', activeProgress.label, detail ?? activeProgress.detail)
	completedProgress += 1
	activeProgress = undefined
}

interface RunOptions {
	env?: Record<string, string>
	stdin?: string
	quiet?: boolean
	capture?: boolean
}

async function run(
	command: string,
	commandArgs: string[],
	options: RunOptions = {}
): Promise<string> {
	const capture = options.quiet || options.capture
	const child = Bun.spawn([command, ...commandArgs], {
		cwd: root,
		env: { ...process.env, ...options.env },
		stdin: options.stdin === undefined ? 'ignore' : new Blob([options.stdin]),
		stdout: capture ? 'pipe' : 'inherit',
		stderr: capture ? 'pipe' : 'inherit'
	})
	const started = Date.now()
	const detail = activeProgress?.detail ?? 'Waiting for the provider operation.'
	const heartbeat = setInterval(() => {
		if (activeProgress)
			emitProgress(
				'active',
				activeProgress.label,
				`${detail} ${command} is still running (${Math.floor((Date.now() - started) / 1000)}s).`
			)
	}, 15_000)
	heartbeat.unref()
	const [exitCode, stdout, stderr] = capture
		? await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text()
			]).finally(() => clearInterval(heartbeat))
		: [await child.exited.finally(() => clearInterval(heartbeat)), '', '']
	if (capture && !options.quiet) {
		if (stdout) process.stdout.write(stdout)
		if (stderr) process.stderr.write(stderr)
	}
	if (exitCode !== 0) {
		const error = new Error(`${command} failed${stderr.trim() ? `: ${stderr.trim()}` : ''}`)
		Object.assign(error, { commandOutput: `${stdout}\n${stderr}` })
		throw error
	}
	return stdout.trim()
}

async function runGitHub(commandArgs: string[], options: RunOptions = {}): Promise<string> {
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		try {
			return await run('gh', commandArgs, options)
		} catch (error) {
			if (attempt === 4 || !isRetryableGitHubError(error)) throw error
			updateProgress(`GitHub did not answer; retrying (${attempt + 1}/4).`)
			await Bun.sleep(attempt * 1_000)
		}
	}
	throw new Error('GitHub retry loop ended unexpectedly.')
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return !(
			error instanceof Error &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code === 'ESRCH'
		)
	}
}

async function runPulumiWithStaleLocalLockRecovery(
	commandArgs: string[],
	options: RunOptions,
	stack: string,
	cwd: string
): Promise<string> {
	try {
		return await run('pulumi', commandArgs, options)
	} catch (error) {
		const output =
			error instanceof Error && 'commandOutput' in error
				? String((error as { commandOutput?: unknown }).commandOutput)
				: String(error)
		const pid = localPulumiLockPid(output, hostname())
		if (!pid || processExists(pid)) throw error
		updateProgress(`Removing stale local Pulumi lock from stopped process ${pid}, then retrying.`)
		await run('pulumi', ['cancel', '--yes', '--stack', stack, '--cwd', cwd], {
			env: options.env,
			quiet: true
		})
		return run('pulumi', commandArgs, options)
	}
}

async function repositoryVariables(): Promise<Map<string, string>> {
	const variables = await runGitHub(
		[
			'api',
			`repos/${input.repository}/actions/variables`,
			'--paginate',
			'--jq',
			'.variables[] | [.name, .value] | @tsv'
		],
		{ quiet: true }
	)
	return new Map(
		variables
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [name, ...value] = line.split('\t')
				return [name as string, value.join('\t')] as const
			})
	)
}

async function assertSafeGitHubTeardown(): Promise<void> {
	const activePrefix = (await repositoryVariables()).get('DEPLOYMENT_ENVIRONMENT_PREFIX')
	if (
		activePrefix &&
		!activePrefixAllowsRepositoryCleanup(activePrefix, generated.deploymentPrefix)
	)
		throw new Error(
			`GitHub currently selects ${activePrefix}, not ${generated.deploymentPrefix}. Refusing to uninstall a generation while another one is active.`
		)
	const activeRuns: Array<{ id: number; name: string; url: string }> = []
	for (const status of ['in_progress', 'queued', 'waiting']) {
		const output = await runGitHub(
			[
				'api',
				`repos/${input.repository}/actions/runs?status=${status}&per_page=100`,
				'--jq',
				'.workflow_runs[] | [.id, .name, .html_url] | @tsv'
			],
			{ quiet: true }
		)
		for (const line of output.split('\n').filter(Boolean)) {
			const [id, name, url] = line.split('\t')
			if (
				!name ||
				!['platform-infrastructure', 'platform-deploy', 'platform-operations'].includes(name)
			)
				continue
			activeRuns.push({ id: Number(id), name, url: url as string })
		}
	}
	if (activeRuns.length > 0)
		throw new Error(
			`A platform workflow is still active (${activeRuns.map((run) => `${run.name} ${run.url}`).join(', ')}). Wait for it to finish or cancel it, then retry.`
		)
}

async function assertSafePolarTeardown(): Promise<void> {
	for (const target of platformTargets) {
		const provider = input.providers[target]
		const polar = new Polar({
			accessToken: provider.polarApiKey,
			server: target === 'next' ? 'sandbox' : 'production'
		})
		const products = await polar.products.list({ limit: 100, isArchived: false })
		const owned = ownedPolarCatalogResources({
			products: products.result.items,
			benefits: [],
			meters: []
		})
		if (owned.productIds.length === 0) continue
		const subscriptions = await polar.subscriptions.list({
			productId: owned.productIds,
			active: true,
			limit: 100
		})
		if (subscriptions.result.items.length > 0)
			throw new Error(
				`Polar ${target} still has ${subscriptions.result.items.length} active subscription(s) on the avenOS catalog. They would continue billing after product archival. Cancel or revoke them in Polar, confirm the customer and retention consequences, then retry the uninstall.`
			)
	}
}

function platformEnvironment(target: Target): Record<string, string> {
	return {
		PULUMI_CONFIG_PASSPHRASE: generated.targets[target].pulumiPassphrase,
		AWS_ACCESS_KEY_ID: input.objectStorage.targets[target].deploymentCredential.accessKeyId,
		AWS_SECRET_ACCESS_KEY: input.objectStorage.targets[target].deploymentCredential.secretAccessKey,
		AWS_REGION: input.objectStorage.region,
		AWS_DEFAULT_REGION: input.objectStorage.region,
		AWS_EC2_METADATA_DISABLED: 'true',
		PULUMI_SKIP_UPDATE_CHECK: 'true',
		PLATFORM_TEARDOWN: 'true',
		DEPLOYMENT_TARGET: target === 'identity' ? 'identity' : 'platform',
		DEPLOYMENT_ENVIRONMENT: target,
		HETZNER_COMPUTE_TOKEN: input.providers[target].computeToken,
		HETZNER_DNS_TOKEN: target === 'identity' ? '' : input.providers[target].dnsToken,
		HETZNER_LOCATION: input.defaults.hetznerLocation,
		HETZNER_SERVER_TYPE: input.defaults.hetznerServerType,
		HETZNER_SERVER_ARCHITECTURE: 'amd64',
		HETZNER_OS_IMAGE: input.defaults.hetznerOsImage,
		IDENTITY_SERVER_TYPE: input.defaults.hetznerServerType,
		PLATFORM_SERVER_TYPE: input.defaults.hetznerServerType,
		IDENTITY_VOLUME_SIZE_GB: String(input.defaults.identityVolumeSizeGb ?? 30),
		PLATFORM_VOLUME_SIZE_GB: String(input.defaults.platformVolumeSizeGb ?? 40),
		SSH_ALLOWED_CIDRS: input.defaults.sshAllowedCidrs
	}
}

function bootstrapEnvironment(target: Target): Record<string, string> {
	const storage = input.objectStorage.targets[target]
	return {
		PULUMI_CONFIG_PASSPHRASE: generated.targets[target].bootstrapPulumiPassphrase,
		AWS_ACCESS_KEY_ID: storage.bootstrapCredential.accessKeyId,
		AWS_SECRET_ACCESS_KEY: storage.bootstrapCredential.secretAccessKey,
		AWS_REGION: input.objectStorage.region,
		AWS_DEFAULT_REGION: input.objectStorage.region,
		AWS_EC2_METADATA_DISABLED: 'true',
		PULUMI_SKIP_UPDATE_CHECK: 'true',
		BOOTSTRAP_TEARDOWN: 'true',
		OBJECT_STORAGE_TARGET: target,
		OBJECT_STORAGE_PROJECT_ID: storage.projectId,
		OBJECT_STORAGE_REGION: input.objectStorage.region,
		OBJECT_STORAGE_BUCKET_PREFIX: generated.deploymentPrefix,
		BOOTSTRAP_S3_ACCESS_KEY_ID: storage.bootstrapCredential.accessKeyId,
		BOOTSTRAP_S3_SECRET_ACCESS_KEY: storage.bootstrapCredential.secretAccessKey,
		DEPLOYMENT_S3_ACCESS_KEY_ID: storage.deploymentCredential.accessKeyId,
		OBSERVER_S3_ACCESS_KEY_ID: storage.observerCredential.accessKeyId
	}
}

function backend(target: Target, purpose: 'platform' | 'bootstrap'): string {
	const stateBucket = objectStorageBucketName(input, generated, target, 'state')
	return `s3://${stateBucket}/avenos/${purpose}?endpoint=${input.objectStorage.region}.your-objectstorage.com&region=${input.objectStorage.region}&s3ForcePathStyle=true&awssdk=v2`
}

async function stackNames(cwd: string, env: Record<string, string>): Promise<string[]> {
	const output = await run('pulumi', ['stack', 'ls', '--json', '--cwd', cwd], {
		env,
		quiet: true
	})
	const listed = JSON.parse(output) as Array<{ name?: unknown }>
	return listed.flatMap((stack) => (typeof stack.name === 'string' ? [stack.name] : []))
}

async function exportStack(
	stack: string,
	cwd: string,
	env: Record<string, string>,
	path: string
): Promise<unknown> {
	await run('pulumi', ['stack', 'export', '--stack', stack, '--cwd', cwd, '--file', path], {
		env,
		quiet: true
	})
	chmodSync(path, 0o600)
	return JSON.parse(readFileSync(path, 'utf8'))
}

async function destroyPlatform(target: Target): Promise<void> {
	beginProgress(`Remove ${target} infrastructure`, 'Opening the exact saved platform stack.')
	if (!(await bucketExists(target, 'state'))) {
		completeProgress(`${target} state is already absent; its platform stack cannot still exist.`)
		return
	}
	const env = platformEnvironment(target)
	await run('pulumi', ['login', backend(target, 'platform')], { env, quiet: true })
	const stack = platformStackName(target)
	if (!pulumiStackIsListed(await stackNames(platformCwd, env), stack)) {
		completeProgress(`${target} platform stack is already absent.`)
		return
	}
	const exportPath = resolve(outputDirectory, `uninstall-platform-${target}.json`)
	const deployment = await exportStack(stack, platformCwd, env, exportPath)
	const targetsToUnlock = platformProtectionTargetUrns(deployment as never)
	if (targetsToUnlock.length > 0) {
		updateProgress(`Removing provider deletion locks from ${targetsToUnlock.length} resource(s).`)
		await runPulumiWithStaleLocalLockRecovery(
			[
				'up',
				'--yes',
				'--refresh',
				'--stack',
				stack,
				'--cwd',
				platformCwd,
				...targetsToUnlock.flatMap((urn) => ['--target', urn])
			],
			{ env, capture: true },
			stack,
			platformCwd
		)
	}
	updateProgress('Removing Pulumi protections, then destroying only this stack.')
	await runPulumiWithStaleLocalLockRecovery(
		['state', 'unprotect', '--all', '--yes', '--stack', stack, '--cwd', platformCwd],
		{
			env,
			quiet: true
		},
		stack,
		platformCwd
	)
	await runPulumiWithStaleLocalLockRecovery(
		['destroy', '--yes', '--stack', stack, '--cwd', platformCwd],
		{ env, capture: true },
		stack,
		platformCwd
	)
	updateProgress('Resource deletion finished; removing saved Pulumi stack history.')
	await run('pulumi', ['stack', 'rm', stack, '--yes', '--remove-backups', '--cwd', platformCwd], {
		env,
		quiet: true
	})
	completeProgress(`${target} infrastructure and managed DNS are removed.`)
}

async function removePolar(target: 'next' | 'production'): Promise<void> {
	beginProgress(`Remove ${target} billing integration`, 'Finding only the SSOT Polar resources.')
	const provider = input.providers[target]
	const polar = new Polar({
		accessToken: provider.polarApiKey,
		server: target === 'next' ? 'sandbox' : 'production'
	})
	const [products, benefits, meters, webhookPages] = await Promise.all([
		polar.products.list({ limit: 100, isArchived: false }),
		polar.benefits.list({ limit: 100 }),
		polar.meters.list({ limit: 100, isArchived: false }),
		polar.webhooks.listWebhookEndpoints({
			organizationId: provider.polarOrganizationId,
			limit: 100
		})
	])
	const owned = ownedPolarCatalogResources({
		products: products.result.items,
		benefits: benefits.result.items,
		meters: meters.result.items
	})
	for (const id of owned.productIds) {
		await polar.products.updateBenefits({ id, productBenefitsUpdate: { benefits: [] } })
		await polar.products.update({ id, productUpdate: { isArchived: true } })
	}
	for (const id of owned.benefitIds) await polar.benefits.delete({ id })
	for (const id of owned.meterIds)
		await polar.meters.update({ id, meterUpdate: { isArchived: true } })
	const expectedWebhook = generated.polarWebhooks?.[target]
	if (expectedWebhook) {
		let matching: { id: string; url: string } | undefined
		for await (const page of webhookPages) {
			matching = page.result.items.find((endpoint) => endpoint.id === expectedWebhook.id)
			if (matching) break
		}
		if (matching && matching.url !== expectedWebhook.url)
			throw new Error(
				`Polar webhook ${expectedWebhook.id} no longer has the saved ${target} URL; refusing to delete it.`
			)
		if (matching) await polar.webhooks.deleteWebhookEndpoint({ id: matching.id })
	}
	completeProgress(
		`${target}: ${owned.productIds.length} product(s) and ${owned.meterIds.length} meter(s) archived; ${owned.benefitIds.length} benefit(s) and the saved webhook removed.`
	)
}

async function removeIdentityDns(): Promise<void> {
	beginProgress('Remove identity DNS', 'Removing only this generation’s saved aven.id addresses.')
	const expected = generated.initialRollout?.identityDns
	if (!expected) {
		completeProgress('No saved identity addresses exist; aven.id DNS was left unchanged.')
		return
	}
	const removed = await removeUnitedDomainsIdentityDns({
		apiKey: input.providers.identity.dnsApiKey,
		ipv4: expected.ipv4,
		ipv6: expected.ipv6
	})
	completeProgress(`${removed} saved-generation aven.id address record(s) removed.`)
}

async function removeGitHub(): Promise<void> {
	beginProgress('Remove GitHub deployment configuration', 'Checking the active generation guard.')
	const variableMap = await repositoryVariables()
	const activePrefix = variableMap.get('DEPLOYMENT_ENVIRONMENT_PREFIX')
	if (
		activePrefix &&
		!activePrefixAllowsRepositoryCleanup(activePrefix, generated.deploymentPrefix)
	)
		throw new Error(
			`GitHub currently selects ${activePrefix}, not ${generated.deploymentPrefix}. Refusing to change shared repository deployment settings; make the saved generation active or remove its Environments manually after review.`
		)
	const existingEnvironments = new Set(
		(
			await runGitHub(
				[
					'api',
					`repos/${input.repository}/environments`,
					'--paginate',
					'--jq',
					'.environments[].name'
				],
				{ quiet: true }
			)
		)
			.split('\n')
			.filter(Boolean)
	)
	for (const environment of environments) {
		if (!existingEnvironments.has(environment)) continue
		updateProgress(`Deleting GitHub Environment ${environment}.`)
		await runGitHub(
			['api', '--method', 'DELETE', `repos/${input.repository}/environments/${environment}`],
			{ quiet: true }
		)
	}
	if (activePrefix === generated.deploymentPrefix) {
		if (variableMap.has('DEPLOYMENT_TARGETS_JSON'))
			await runGitHub(
				[
					'api',
					'--method',
					'DELETE',
					`repos/${input.repository}/actions/variables/DEPLOYMENT_TARGETS_JSON`
				],
				{ quiet: true }
			)
		// The active prefix is the commit marker for repository cleanup. Remove it
		// last so a retry can finish any preceding generation-owned changes.
		await runGitHub(
			[
				'api',
				'--method',
				'DELETE',
				`repos/${input.repository}/actions/variables/DEPLOYMENT_ENVIRONMENT_PREFIX`
			],
			{ quiet: true }
		)
	}
	completeProgress(
		`${environments.length} generation-specific GitHub Environment name(s) are absent; shared deployment selection removed when this was the active generation.`
	)
}

async function bucketExists(target: Target, kind: 'state' | 'backup'): Promise<boolean> {
	const storage = input.objectStorage.targets[target]
	const request = signedS3ReadRequest({
		region: input.objectStorage.region,
		accessKeyId: storage.bootstrapCredential.accessKeyId,
		secretAccessKey: storage.bootstrapCredential.secretAccessKey,
		bucket: objectStorageBucketName(input, generated, target, kind)
	})
	const response = await fetch(request.url, {
		headers: request.headers,
		signal: AbortSignal.timeout(20_000)
	})
	if (response.ok) return true
	if (response.status === 404) return false
	throw new Error(
		`Hetzner Object Storage returned HTTP ${response.status} for the ${target} ${kind} bucket.`
	)
}

async function existingBucketKinds(target: Target): Promise<BootstrapBucketKind[]> {
	const checks = await Promise.all(
		(['state', 'backup'] as const).map(async (kind) =>
			(await bucketExists(target, kind)) ? kind : undefined
		)
	)
	return checks.filter((kind): kind is BootstrapBucketKind => kind !== undefined)
}

async function verifyBucketsAbsent(target: Target): Promise<void> {
	for (let attempt = 1; attempt <= 5; attempt += 1) {
		const remaining = await existingBucketKinds(target)
		if (remaining.length === 0) return
		if (attempt < 5) await Bun.sleep(attempt * 500)
		else
			throw new Error(
				`${target} teardown returned successfully, but the exact ${remaining.join(' and ')} bucket still exists.`
			)
	}
}

async function removeStorage(target: Target): Promise<void> {
	beginProgress(
		`Remove ${target} recovery storage`,
		'Reconstructing minimal ownership of the exact saved-generation buckets.'
	)
	const env = bootstrapEnvironment(target)
	const stack = bootstrapTeardownStackName(target)
	const expectedBuckets = (['state', 'backup'] as const).map((kind) =>
		objectStorageBucketName(input, generated, target, kind)
	)
	await run('pulumi', ['login', localTeardownBackend], { env, quiet: true })
	removeSaltOnlyPulumiStackConfig(bootstrapCwd, stack)
	const localStacks = await stackNames(bootstrapCwd, env)
	const initiallyExisting = await existingBucketKinds(target)
	if (initiallyExisting.length === 0) {
		if (pulumiStackIsListed(localStacks, stack))
			await run(
				'pulumi',
				['stack', 'rm', stack, '--yes', '--force', '--remove-backups', '--cwd', bootstrapCwd],
				{ env, quiet: true }
			)
		completeProgress(`${target} state and backup buckets are already absent.`)
		return
	}
	if (!pulumiStackIsListed(localStacks, stack)) {
		await run('pulumi', ['stack', 'init', stack, '--cwd', bootstrapCwd], { env, quiet: true })
	} else
		await run('pulumi', ['stack', 'select', stack, '--cwd', bootstrapCwd], { env, quiet: true })

	const exportPath = resolve(outputDirectory, `uninstall-bootstrap-${target}.json`)
	let deployment = await exportStack(stack, bootstrapCwd, env, exportPath)
	if (!bootstrapStateContainsNoUnexpectedBuckets(deployment as never, expectedBuckets))
		throw new Error(
			`${target} local teardown state contains a bucket outside this generation; refusing to continue.`
		)
	let tracked = trackedBootstrapBucketKinds(deployment as never, target)
	const plan = bootstrapStorageTeardownPlan(initiallyExisting, tracked)
	if (plan.adopt.length > 0) {
		updateProgress(`Adopting the exact existing ${plan.adopt.join(' and ')} bucket for deletion.`)
		await run(
			'pulumi',
			[
				'up',
				'--yes',
				'--parallel',
				'1',
				'--stack',
				stack,
				'--cwd',
				bootstrapCwd,
				...bootstrapBucketUrns(stack, target, plan.adopt).flatMap((urn) => ['--target', urn])
			],
			{
				env: { ...env, OBJECT_STORAGE_ADOPT_EXISTING_BUCKETS: plan.adopt.join(',') },
				capture: true
			}
		)
	}
	deployment = await exportStack(stack, bootstrapCwd, env, exportPath)
	if (!bootstrapStateContainsNoUnexpectedBuckets(deployment as never, expectedBuckets))
		throw new Error(
			`${target} local teardown state contains a bucket outside this generation; refusing to continue.`
		)
	tracked = trackedBootstrapBucketKinds(deployment as never, target)
	if (plan.remove.some((kind) => !tracked.includes(kind)))
		throw new Error(
			`${target} teardown could not establish ownership of every exact existing bucket.`
		)
	const bucketTargets = bootstrapBucketUrns(stack, target, plan.remove)
	updateProgress('Enabling version-aware deletion on the exact state and backup buckets.')
	await run(
		'pulumi',
		[
			'up',
			'--yes',
			'--parallel',
			'1',
			'--stack',
			stack,
			'--cwd',
			bootstrapCwd,
			...bucketTargets.flatMap((urn) => ['--target', urn])
		],
		{ env, capture: true }
	)
	updateProgress('Deleting all versions and backups, then verifying provider absence.')
	await run(
		'pulumi',
		['state', 'unprotect', '--all', '--yes', '--stack', stack, '--cwd', bootstrapCwd],
		{
			env,
			quiet: true
		}
	)
	await run(
		'pulumi',
		[
			'destroy',
			'--yes',
			'--parallel',
			'1',
			'--stack',
			stack,
			'--cwd',
			bootstrapCwd,
			...bucketTargets.flatMap((urn) => ['--target', urn])
		],
		{ env, capture: true }
	)
	await verifyBucketsAbsent(target)
	await run(
		'pulumi',
		['stack', 'rm', stack, '--yes', '--force', '--remove-backups', '--cwd', bootstrapCwd],
		{ env, quiet: true }
	)
	completeProgress(`${target} Pulumi state and Restic backup buckets are removed.`)
}

selectedDeploymentTargets(targets)
await assertSafeGitHubTeardown()
await assertSafePolarTeardown()
for (const target of targets) await destroyPlatform(target)
if (targets.includes('identity')) await removeIdentityDns()
for (const target of platformTargets) await removePolar(target)
await removeGitHub()
for (const target of targets) await removeStorage(target)

process.stdout.write(
	`Uninstall complete for ${generated.deploymentPrefix}. Provider-issued credentials were left unchanged.\n`
)
