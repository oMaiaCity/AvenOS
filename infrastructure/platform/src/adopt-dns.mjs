import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformHostnames, platformRecordSpecs } from './dns.mjs'

const HETZNER_API = 'https://api.hetzner.cloud/v1'
const RESOURCE_TYPE = 'hcloud:index/zoneRrset:ZoneRrset'
const PROJECT_NAME = 'aven-platform'

function requiredEnvironment(name, environment = process.env) {
	const value = environment[name]?.trim()
	if (!value) throw new Error(`${name} is required for DNS adoption`)
	return value
}

function logicalName(urn) {
	return urn.split('::').at(-1)
}

export function desiredPlatformRecords(environment) {
	return platformRecordSpecs({
		zone: 'aven.ceo',
		hostnames: platformHostnames(environment),
		ipv4: '0.0.0.0',
		ipv6: '::'
	}).map(({ resourceName, zone, name, type }) => ({ resourceName, zone, name, type }))
}

export function legacyCheckoutResources({ environment, stackResources }) {
	const legacyName = environment === 'next' ? 'my.next' : environment === 'production' ? 'my' : null
	if (!legacyName) throw new Error(`legacy DNS ownership cannot be checked for ${environment}`)
	const expectedTypes = new Map([
		['platform-checkout-a', 'A'],
		['platform-checkout-aaaa', 'AAAA']
	])
	return stackResources.filter((resource) => {
		const expectedType = expectedTypes.get(logicalName(resource.urn))
		return (
			resource.type === RESOURCE_TYPE &&
			expectedType !== undefined &&
			resource.inputs?.zone === 'aven.ceo' &&
			resource.inputs?.name === legacyName &&
			resource.inputs?.type === expectedType
		)
	})
}

export function dnsReconciliationPlan({ environment, rrsets, stackResources }) {
	const desired = desiredPlatformRecords(environment)
	const managedNames = new Set(desired.map(({ name }) => name))
	const tracked = new Set(
		stackResources.filter(({ type }) => type === RESOURCE_TYPE).map(({ urn }) => logicalName(urn))
	)
	const byIdentity = new Map(rrsets.map((rrset) => [`${rrset.name}\u0000${rrset.type}`, rrset]))

	return {
		imports: desired
			.filter(({ resourceName }) => !tracked.has(resourceName))
			.filter(({ name, type }) => byIdentity.has(`${name}\u0000${type}`))
			.map(({ resourceName, zone, name, type }) => ({
				resourceName,
				id: `${zone}/${name}/${type}`
			})),
		obsoleteCnames: rrsets
			.filter(({ name, type }) => managedNames.has(name) && type === 'CNAME')
			.map(({ name, type }) => ({ name, type }))
	}
}

function runPulumi(args, { cwd, environment = process.env, allowFailure = false } = {}) {
	const result = spawnSync('pulumi', args, {
		cwd,
		env: environment,
		encoding: 'utf8',
		stdio: allowFailure ? ['ignore', 'pipe', 'pipe'] : 'inherit'
	})
	if (result.error) throw result.error
	if (result.status !== 0 && !allowFailure)
		throw new Error(`pulumi ${args[0]} failed with exit code ${result.status}`)
	return result
}

export function dnsProviderUrn(stackName) {
	const match = /^organization\/aven-platform\/(next|production)$/.exec(stackName)
	const stack = match?.[1]
	if (!stack) throw new Error(`invalid platform Pulumi stack name ${stackName}`)
	return `urn:pulumi:${stack}::${PROJECT_NAME}::pulumi:providers:hcloud::platform-dns-provider`
}

async function hetznerRequest(path, token, init = {}) {
	const response = await fetch(`${HETZNER_API}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${token}`, ...init.headers },
		signal: AbortSignal.timeout(30_000)
	})
	if (!response.ok) {
		const body = await response.text()
		throw new Error(
			`Hetzner DNS returned HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`
		)
	}
	return response.status === 204 ? undefined : response.json()
}

async function listRrsets(zone, token) {
	const rrsets = []
	let page = 1
	for (;;) {
		const payload = await hetznerRequest(
			`/zones/${encodeURIComponent(zone)}/rrsets?page=${page}&per_page=50`,
			token
		)
		if (!Array.isArray(payload?.rrsets)) throw new Error('Hetzner DNS returned no RRSet list')
		rrsets.push(...payload.rrsets)
		const lastPage = payload.meta?.pagination?.last_page
		if (!Number.isInteger(lastPage) || page >= lastPage) return rrsets
		page += 1
	}
}

async function deleteRrset(zone, name, type, token) {
	await hetznerRequest(
		`/zones/${encodeURIComponent(zone)}/rrsets/${encodeURIComponent(name)}/${encodeURIComponent(type)}`,
		token,
		{ method: 'DELETE' }
	)
}

function readStack(cwd, stack, environment) {
	const result = runPulumi(
		['stack', 'export', '--stack', stack, '--show-secrets=false', '--non-interactive'],
		{ cwd, environment, allowFailure: true }
	)
	if (result.status !== 0)
		throw new Error(`could not export Pulumi stack ${stack}: ${result.stderr.trim()}`)
	const deployment = JSON.parse(result.stdout)
	return deployment.deployment?.resources ?? []
}

export async function adoptPlatformDns({
	cwd = fileURLToPath(new URL('..', import.meta.url)),
	environment = process.env,
	run = runPulumi,
	list = listRrsets,
	remove = deleteRrset,
	read = readStack,
	write = (message) => process.stdout.write(`${message}\n`)
} = {}) {
	const target = requiredEnvironment('DEPLOYMENT_ENVIRONMENT', environment)
	const stack = requiredEnvironment('PULUMI_STACK', environment)
	const backend = requiredEnvironment('PULUMI_BACKEND_URL', environment)
	const mode = environment.DNS_RECONCILIATION_MODE?.trim() || 'full'
	if (!['next', 'production'].includes(target))
		throw new Error(`DNS adoption cannot run for target ${target}`)
	if (stack !== `organization/aven-platform/${target}`)
		throw new Error(`Pulumi stack ${stack} does not match deployment target ${target}`)
	if (!['state-only', 'full'].includes(mode))
		throw new Error(`DNS_RECONCILIATION_MODE must be state-only or full`)
	const providerUrn = dnsProviderUrn(stack)

	run(['login', backend, '--non-interactive'], { cwd, environment })
	const selected = run(['stack', 'select', stack, '--non-interactive'], {
		cwd,
		environment,
		allowFailure: true
	})
	if (selected.status !== 0)
		run(['stack', 'init', stack, '--secrets-provider', 'passphrase', '--non-interactive'], {
			cwd,
			environment
		})

	let resources = read(cwd, stack, environment)
	const legacyResources = legacyCheckoutResources({
		environment: target,
		stackResources: resources
	})
	for (const resource of legacyResources) {
		write(
			`Releasing legacy ${resource.inputs.name} ${resource.inputs.type} from Pulumi ownership; the DNS record is kept unchanged.`
		)
		run(
			['state', 'remove', resource.urn, '--stack', stack, '--force', '--yes', '--non-interactive'],
			{ cwd, environment }
		)
	}
	if (legacyResources.length) {
		resources = read(cwd, stack, environment)
		if (legacyCheckoutResources({ environment: target, stackResources: resources }).length)
			throw new Error(`Pulumi retained legacy ${target} checkout DNS ownership`)
	}
	if (mode === 'state-only') {
		write(
			legacyResources.length
				? `DNS state migration complete: ${legacyResources.length} legacy RRSet(s) released without provider changes.`
				: 'DNS state migration complete: no legacy ownership remains.'
		)
		return
	}
	const token = requiredEnvironment('HETZNER_DNS_TOKEN', environment)
	if (!resources.some(({ urn }) => urn === providerUrn)) {
		write(`Preparing the ${target} DNS provider in Pulumi state.`)
		run(
			[
				'up',
				'--stack',
				stack,
				'--target',
				providerUrn,
				'--yes',
				'--skip-preview',
				'--non-interactive',
				'--suppress-outputs'
			],
			{ cwd, environment }
		)
		resources = read(cwd, stack, environment)
	}
	if (!resources.some(({ urn }) => urn === providerUrn))
		throw new Error(`Pulumi did not persist the ${target} DNS provider`)

	const rrsets = await list('aven.ceo', token)
	const plan = dnsReconciliationPlan({ environment: target, rrsets, stackResources: resources })
	for (const { resourceName, id } of plan.imports) {
		write(`Adopting existing aven.ceo RRSet ${id.slice('aven.ceo/'.length)}.`)
		run(
			[
				'import',
				RESOURCE_TYPE,
				resourceName,
				id,
				'--provider',
				`dns=${providerUrn}`,
				'--stack',
				stack,
				'--yes',
				'--skip-preview',
				'--generate-code=false',
				'--protect=true',
				'--non-interactive',
				'--suppress-outputs'
			],
			{ cwd, environment }
		)
	}
	for (const { name, type } of plan.obsoleteCnames) {
		write(`Removing obsolete aven.ceo RRSet ${name} ${type}.`)
		await remove('aven.ceo', name, type, token)
	}
	write(
		legacyResources.length || plan.imports.length || plan.obsoleteCnames.length
			? `DNS adoption complete: ${legacyResources.length} legacy RRSet(s) released without deletion; ${plan.imports.length} existing RRSet(s) adopted; ${plan.obsoleteCnames.length} obsolete CNAME RRSet(s) removed.`
			: 'DNS adoption complete: no unmanaged records block this stack.'
	)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
	await adoptPlatformDns().catch((error) => {
		process.stderr.write(
			`DNS adoption failed: ${error instanceof Error ? error.message : String(error)}\n`
		)
		process.exitCode = 1
	})
