#!/usr/bin/env bun
import { readFileSync } from 'node:fs'
import { Polar } from '@polar-sh/sdk'
import nodemailer from 'nodemailer'
import {
	type BootstrapInput,
	selectedDeploymentTargets,
	validateBootstrapInput
} from './lib/deployment-bootstrap.js'
import { validateS3ProjectCredential } from './lib/deployment-bootstrap-guided.js'
import { fetchRedpillPhalaCatalog } from './lib/redpill-model-catalog.js'
import { verifyUnitedDomainsDnsAccess } from './lib/united-domains-dns.js'

const args = process.argv.slice(2)
const inputIndex = args.indexOf('--input')
if (inputIndex < 0 || !args[inputIndex + 1]) throw new Error('--input is required')
const input = JSON.parse(readFileSync(args[inputIndex + 1] as string, 'utf8')) as BootstrapInput
validateBootstrapInput(input)
const targets = selectedDeploymentTargets(input.deploymentTargets)

interface Check {
	label: string
	run: () => Promise<string>
}

async function responseJson(url: string, token: string): Promise<Record<string, unknown>> {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(20_000)
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return (await response.json()) as Record<string, unknown>
}

async function runGh(args: string[]): Promise<string> {
	let lastError = ''
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const child = Bun.spawn(['gh', ...args], { stdout: 'pipe', stderr: 'pipe' })
		const timeout = setTimeout(() => child.kill(), 30_000)
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text()
		])
		clearTimeout(timeout)
		if (exitCode === 0) return stdout.trim()
		lastError = stderr.trim() || `gh exited ${exitCode}`
		if (!/timeout|timed out|TLS|HTTP 429|HTTP 5\d\d/i.test(lastError) || attempt === 4) break
		await Bun.sleep(attempt * 1_000)
	}
	throw new Error(lastError)
}

async function verifyPackages(token: string): Promise<string> {
	for (const name of ['aven-ceo', 'aven-vibes']) {
		const response = await fetch(`https://npm.pkg.github.com/@myavenceo%2f${name}`, {
			headers: {
				Accept: 'application/vnd.npm.install-v1+json',
				Authorization: `Bearer ${token}`
			},
			signal: AbortSignal.timeout(20_000)
		})
		if (!response.ok) throw new Error(`@myavenceo/${name}: HTTP ${response.status}`)
	}
	return 'both private packages readable'
}

async function verifyPolar(target: 'next' | 'production'): Promise<string> {
	const provider = input.providers[target]
	const polar = new Polar({
		accessToken: provider.polarApiKey,
		server: target === 'next' ? 'sandbox' : 'production'
	})
	const [organization, benefits, meters, products, webhooks] = await Promise.all([
		polar.organizations.get({ id: provider.polarOrganizationId }),
		polar.benefits.list({ organizationId: provider.polarOrganizationId, limit: 1 }),
		polar.meters.list({ organizationId: provider.polarOrganizationId, limit: 1 }),
		polar.products.list({ organizationId: provider.polarOrganizationId, limit: 1 }),
		polar.webhooks.listWebhookEndpoints({ organizationId: provider.polarOrganizationId, limit: 1 })
	])
	for await (const _page of products) break
	for await (const _page of webhooks) break
	return `${organization.name} (${organization.id}); catalog and webhook reads allowed; ${benefits.result.pagination.totalCount} benefit(s), ${meters.result.pagination.totalCount} meter(s)`
}

async function verifySmtp(url: string): Promise<string> {
	const parsed = new URL(url)
	const transporter = nodemailer.createTransport(url, {
		connectionTimeout: 20_000,
		greetingTimeout: 20_000,
		socketTimeout: 20_000
	})
	await transporter.verify()
	transporter.close()
	return `authenticated ${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === 'smtps:' ? '465' : '587')}`
}

const checks: Check[] = [
	{
		label: 'GitHub login and repository administration',
		run: async () => {
			await runGh(['auth', 'status'])
			const user = await runGh(['api', 'user', '--jq', '.login'])
			const repo = JSON.parse(
				await runGh([
					'api',
					`repos/${input.repository}`,
					'--jq',
					'{name:.full_name,admin:.permissions.admin}'
				])
			) as { name?: string; admin?: boolean }
			if (!repo.admin) throw new Error(`${user} is not an administrator of ${input.repository}`)
			return `${user}; administrator of ${repo.name}`
		}
	},
	{
		label: 'GitHub Packages reader',
		run: () => verifyPackages(input.githubPackagesReadToken)
	}
]

for (const target of targets) {
	checks.push({
		label: `Hetzner ${target} Cloud token`,
		run: async () => {
			const result = await responseJson(
				'https://api.hetzner.cloud/v1/servers?per_page=1',
				input.providers[target].computeToken
			)
			const pagination = (
				result.meta as { pagination?: { total?: number; total_entries?: number } } | undefined
			)?.pagination
			const total = pagination?.total ?? pagination?.total_entries
			const visible = Array.isArray(result.servers) ? result.servers.length : undefined
			return `authenticated; ${total ?? visible ?? 'unknown'} server(s) visible`
		}
	})
	for (const role of [
		'bootstrapCredential',
		'deploymentCredential',
		'observerCredential'
	] as const) {
		checks.push({
			label: `Hetzner ${target} Object Storage ${role.replace('Credential', '')}`,
			run: async () => {
				const credential = input.objectStorage.targets[target][role]
				const buckets = await validateS3ProjectCredential({
					region: input.objectStorage.region,
					accessKeyId: credential.accessKeyId,
					secretAccessKey: credential.secretAccessKey
				})
				return `authenticated ${input.objectStorage.region}; ${buckets} bucket(s) visible`
			}
		})
	}
}

if (targets.includes('identity'))
	checks.push({
		label: 'United Domains aven.id DNS key',
		run: async () => {
			const zone = await verifyUnitedDomainsDnsAccess({
				apiKey: input.providers.identity.dnsApiKey
			})
			return `${zone.type} zone ${zone.name} (${zone.id}) is readable and writable`
		}
	})

for (const target of targets.filter(
	(target): target is 'next' | 'production' => target !== 'identity'
)) {
	checks.push(
		{
			label: `Hetzner ${target} aven.ceo DNS token`,
			run: async () => {
				const result = await responseJson(
					'https://api.hetzner.cloud/v1/zones/aven.ceo',
					input.providers[target].dnsToken
				)
				const zone = result.zone as { name?: string; id?: string | number } | undefined
				if (zone?.name !== 'aven.ceo') throw new Error('aven.ceo zone is not visible')
				return `zone ${zone.name} (${zone.id}) is readable`
			}
		},
		{ label: `Polar ${target} key`, run: () => verifyPolar(target) },
		{ label: `SMTP ${target} credential`, run: () => verifySmtp(input.providers[target].smtpUrl) }
	)
}

if (targets.some((target) => target !== 'identity'))
	checks.push({
		label: 'Redpill/Phala model key',
		run: async () => {
			const catalog = await fetchRedpillPhalaCatalog(fetch, input.providers.redpillApiKey)
			return `${catalog.length} Phala-hosted chat model(s) available`
		}
	})

const secrets = [
	input.githubPackagesReadToken,
	input.providers.identity.dnsApiKey,
	input.providers.redpillApiKey,
	...targets.flatMap((target) => [
		input.providers[target].computeToken,
		...Object.values(input.objectStorage.targets[target]).flatMap((value) =>
			typeof value === 'object' && value !== null
				? Object.values(value).filter((item): item is string => typeof item === 'string')
				: []
		),
		...(target === 'identity'
			? []
			: [
					input.providers[target].dnsToken,
					input.providers[target].polarApiKey,
					input.providers[target].smtpUrl
				])
	])
].filter((value): value is string => typeof value === 'string' && value.length > 3)
for (const target of targets.filter((target) => target !== 'identity')) {
	try {
		const smtp = new URL(input.providers[target].smtpUrl)
		for (const value of [smtp.username, smtp.password]) if (value.length > 3) secrets.push(value)
	} catch {
		// Input validation reports malformed SMTP URLs before the checks run.
	}
}
const redact = (message: string) =>
	secrets.reduce((result, secret) => result.replaceAll(secret, '[redacted]'), message)

let failures = 0
for (const [index, check] of checks.entries()) {
	process.stdout.write(`[${index + 1}/${checks.length}] ${check.label} … `)
	try {
		process.stdout.write(`${await check.run()}\n`)
	} catch (error) {
		failures += 1
		process.stdout.write(
			`FAILED: ${redact(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`
		)
	}
}
if (failures > 0) throw new Error(`${failures} of ${checks.length} credential checks failed.`)
process.stdout.write(`All ${checks.length} credential checks passed.\n`)
