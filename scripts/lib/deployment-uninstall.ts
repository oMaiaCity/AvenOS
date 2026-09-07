import { join } from 'node:path'
import {
	BOOTSTRAP_BUCKET_KINDS,
	type BootstrapBucketKind,
	type BootstrapInput,
	deploymentConfigurationTargets,
	type GeneratedSecrets,
	PULUMI_ORGANIZATION,
	type Target
} from './deployment-bootstrap.ts'

export const PLATFORM_PROTECTION_RESOURCE_TYPES = new Set([
	'hcloud:index/server:Server',
	'hcloud:index/volume:Volume',
	'hcloud:index/zoneRrset:ZoneRrset'
])

export const BOOTSTRAP_BUCKET_RESOURCE_TYPE = 'minio:index/s3Bucket:S3Bucket'

export function uninstallConfirmation(deploymentPrefix: string): string {
	if (!/^avenos-[0-9a-f]{10}$/.test(deploymentPrefix))
		throw new Error('Invalid deployment namespace.')
	return `uninstall ${deploymentPrefix}`
}

export function guidedUninstallArguments(
	scriptPath: string,
	inputPath: string,
	outputDirectory: string,
	deploymentPrefix: string
): string[] {
	uninstallConfirmation(deploymentPrefix)
	return [
		scriptPath,
		'--input',
		inputPath,
		'--output',
		outputDirectory,
		'--confirmed-generation',
		deploymentPrefix,
		'--progress-json'
	]
}

export function uninstallFailureSummary(lines: readonly string[]): string | undefined {
	const providerError = [...lines]
		.reverse()
		.find((line) => /^error:\s*/i.test(line) && !/^error:\s*script .* exited with code/i.test(line))
	if (providerError) return providerError.replace(/^error:\s*/i, '').slice(0, 800)

	const useful = lines.filter(
		(line) =>
			line.length > 0 &&
			!/^\s*at\s+/i.test(line) &&
			!/^bun v\d/i.test(line) &&
			!/^\s*[\^~]+\s*$/.test(line) &&
			!/^error:\s*script .* exited with code/i.test(line)
	)
	return useful.length > 0 ? useful.slice(-2).join(' — ').slice(0, 800) : undefined
}

export function localPulumiLockPid(message: string, currentHostname: string): number | undefined {
	const match = message.match(/created by [^\s@]+@([^\s]+) \(pid (\d+)\)/)
	if (!match || match[1] !== currentHostname) return undefined
	const pid = Number(match[2])
	return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

export function uninstallTargets(
	input: Pick<BootstrapInput, 'deploymentTargets'>,
	generated: Pick<GeneratedSecrets, 'completedTargets'>
): Target[] {
	return [...deploymentConfigurationTargets(input, generated)].reverse()
}

export function githubEnvironmentNames(prefix: string, targets: readonly Target[]): string[] {
	return targets.flatMap((target) => [`${prefix}-${target}`, `${prefix}-${target}-operations`])
}

export function platformStackName(target: Target): string {
	return `${PULUMI_ORGANIZATION}/aven-platform/${target}`
}

export function bootstrapTeardownStackName(target: Target): string {
	return `${PULUMI_ORGANIZATION}/aven-bootstrap/uninstall-${target}`
}

export function bootstrapBucketUrns(
	stack: string,
	target: Target,
	kinds: readonly BootstrapBucketKind[]
): string[] {
	const stackName = stack.split('/').at(-1)
	return kinds.map(
		(kind) =>
			`urn:pulumi:${stackName}::aven-bootstrap::minio:index/s3Bucket:S3Bucket::${target}-${kind}`
	)
}

export function bootstrapStorageTeardownPlan(
	existing: readonly BootstrapBucketKind[],
	tracked: readonly BootstrapBucketKind[]
): { adopt: BootstrapBucketKind[]; remove: BootstrapBucketKind[] } {
	const existingSet = new Set(existing)
	const trackedSet = new Set(tracked)
	return {
		adopt: BOOTSTRAP_BUCKET_KINDS.filter((kind) => existingSet.has(kind) && !trackedSet.has(kind)),
		remove: BOOTSTRAP_BUCKET_KINDS.filter((kind) => existingSet.has(kind))
	}
}

interface PulumiDeploymentExport {
	deployment?: { resources?: Array<{ type?: unknown; urn?: unknown }> }
}

export function resourceUrnsByType(
	stack: PulumiDeploymentExport,
	types: ReadonlySet<string>
): string[] {
	return (stack.deployment?.resources ?? []).flatMap((resource) =>
		types.has(String(resource.type)) && typeof resource.urn === 'string' ? [resource.urn] : []
	)
}

export function platformProtectionTargetUrns(stack: PulumiDeploymentExport): string[] {
	return resourceUrnsByType(stack, PLATFORM_PROTECTION_RESOURCE_TYPES)
}

interface PulumiBucketDeploymentExport extends PulumiDeploymentExport {
	deployment?: {
		resources?: Array<{
			type?: unknown
			id?: unknown
			inputs?: { bucket?: unknown }
			outputs?: { bucket?: unknown }
		}>
	}
}

export function bootstrapStateContainsNoUnexpectedBuckets(
	stack: PulumiBucketDeploymentExport,
	expectedNames: readonly string[]
): boolean {
	const allowed = new Set(expectedNames)
	return (stack.deployment?.resources ?? [])
		.filter((resource) => resource.type === BOOTSTRAP_BUCKET_RESOURCE_TYPE)
		.every((bucket) => {
			const physicalName = bucket.outputs?.bucket ?? bucket.inputs?.bucket ?? bucket.id
			return typeof physicalName === 'string' && allowed.has(physicalName)
		})
}

export function localResetPaths(outputDirectory: string, targets: readonly Target[]): string[] {
	return [
		join(outputDirectory, 'credentials.csv'),
		join(outputDirectory, 'avenos-recovery.csv'),
		join(outputDirectory, 'bootstrap.generated.json'),
		join(outputDirectory, 'bootstrap-apply.log'),
		join(outputDirectory, 'initial-rollout.log'),
		join(outputDirectory, 'uninstall.log'),
		join(outputDirectory, 'pulumi-state'),
		join(outputDirectory, 'uninstall-pulumi-state'),
		...targets.flatMap((target) => [
			join(outputDirectory, `bootstrap-state-${target}.json`),
			join(outputDirectory, `bootstrap.${target}.remote`),
			join(outputDirectory, `uninstall-platform-${target}.json`),
			join(outputDirectory, `uninstall-bootstrap-${target}.json`)
		])
	]
}

export function uninstallSummary(
	prefix: string,
	targets: readonly Target[],
	environments: readonly string[]
): string {
	const platformTargets = targets.filter((target) => target !== 'identity')
	return `Generation ${prefix} will be removed in this order:
  1. Hetzner hosts, volumes, firewalls, SSH registrations, generated keys, secrets, and managed aven.ceo DNS for ${targets.join(', ')}
  2. The saved generation's aven.id A and AAAA records${targets.includes('identity') ? '' : ' (not selected)'}
  3. Polar webhook endpoints and SSOT billing catalog for ${platformTargets.join(', ') || 'no platform target'} (products and meters are archived when Polar retains them)
  4. GitHub Environments ${environments.join(', ')} and this generation's repository deployment selection
  5. Restic backup and Pulumi state buckets, last

Provider-issued credentials are not revoked automatically. Existing Polar financial history remains subject to Polar retention.`
}

export function activePrefixAllowsRepositoryCleanup(
	activePrefix: string | undefined,
	requestedPrefix: string
): boolean {
	return activePrefix === requestedPrefix
}

export function ownedPolarCatalogResources(input: {
	products: readonly { id: string; metadata?: Record<string, unknown> | null }[]
	benefits: readonly { id: string; metadata?: Record<string, unknown> | null }[]
	meters: readonly { id: string; name?: string; metadata?: Record<string, unknown> | null }[]
}): { productIds: string[]; benefitIds: string[]; meterIds: string[] } {
	const tiers = new Set(['aven-name', 'aven-ceo'])
	return {
		productIds: input.products.flatMap((product) =>
			tiers.has(String(product.metadata?.tier)) ? [product.id] : []
		),
		benefitIds: input.benefits.flatMap((benefit) =>
			benefit.metadata?.source === 'ssot' && typeof benefit.metadata?.key === 'string'
				? [benefit.id]
				: []
		),
		meterIds: input.meters.flatMap((meter) =>
			meter.name === 'mind-credits' && meter.metadata?.source === 'ssot' ? [meter.id] : []
		)
	}
}
