import { createHash, createHmac } from 'node:crypto'
import { TARGETS, type Target } from './deployment-bootstrap.ts'

export interface S3CredentialStep {
	path: readonly string[]
	target: 'identity' | 'next' | 'production'
	description: string
	purpose: string
}

export const POLAR_API_KEY_SCOPES = [
	'organizations:read',
	'products:write',
	'benefits:write',
	'meters:write',
	'checkouts:write',
	'subscriptions:write',
	'customers:read',
	'orders:read',
	'webhooks:write'
] as const

export const S3_CREDENTIAL_STEPS: readonly S3CredentialStep[] = (
	['identity', 'next', 'production'] as const
).flatMap((target) => [
	{
		path: ['objectStorage', 'targets', target, 'bootstrapCredential'],
		target,
		description: `avenOS ${target} bootstrap administrator`,
		purpose: `Creates and repairs only the ${target} buckets; keep it offline afterwards.`
	},
	{
		path: ['objectStorage', 'targets', target, 'deploymentCredential'],
		target,
		description: `avenOS ${target} deployment`,
		purpose: `Writes only the ${target} state and backup buckets after policies are applied.`
	},
	{
		path: ['objectStorage', 'targets', target, 'observerCredential'],
		target,
		description: `avenOS ${target} observer`,
		purpose: `Reads only the ${target} state bucket for unattended operations.`
	}
])

export function actionableWizardProgress(
	steps: readonly { info?: boolean }[],
	index: number
): { current: number; total: number } | undefined {
	if (!Number.isSafeInteger(index) || index < 0 || index >= steps.length)
		throw new Error('Wizard step index is out of range.')
	if (steps[index]?.info) return undefined
	return {
		current: steps.slice(0, index + 1).filter((step) => !step.info).length,
		total: steps.filter((step) => !step.info).length
	}
}

export function savedWizardResumeIndex(
	steps: readonly {
		info?: boolean
		path: readonly string[]
		optional?: boolean
		companion?: { path: readonly string[]; optional?: boolean }
	}[],
	draft: Record<string, unknown>
): number {
	const firstActionable = steps.findIndex((step) => !step.info)
	let latestSaved = firstActionable < 0 ? 0 : firstActionable
	for (const [index, step] of steps.entries()) {
		if (step.info) continue
		const values = [
			valueAt(draft, step.path),
			step.companion && valueAt(draft, step.companion.path)
		]
		if (values.some((value) => value !== undefined && value !== null && String(value) !== ''))
			latestSaved = index
	}
	const firstMissing = steps.findIndex((step) => {
		if (step.info) return false
		const primary = valueAt(draft, step.path)
		if (!step.optional && (primary === undefined || primary === null || String(primary) === ''))
			return true
		if (!step.companion?.optional) {
			const companion = step.companion && valueAt(draft, step.companion.path)
			if (
				step.companion &&
				(companion === undefined || companion === null || String(companion) === '')
			)
				return true
		}
		return false
	})
	if (firstMissing >= 0 && firstMissing < latestSaved) return firstMissing
	return latestSaved
}

export function savedWizardVerificationIndexes(
	steps: readonly {
		info?: boolean
		path: readonly string[]
		optional?: boolean
		verify?: unknown
		companion?: { path: readonly string[]; optional?: boolean }
	}[],
	draft: Record<string, unknown>
): number[] {
	return steps.flatMap((step, index) => {
		if (step.info || !step.verify) return []
		const primary = valueAt(draft, step.path)
		const hasPrimary = primary !== undefined && primary !== null && String(primary) !== ''
		if (!hasPrimary) return []
		if (step.companion) {
			const companion = valueAt(draft, step.companion.path)
			const hasCompanion = companion !== undefined && companion !== null && String(companion) !== ''
			if (!hasCompanion && !step.companion.optional) return []
		}
		return [index]
	})
}

export function bootstrapFailureSummary(lines: readonly string[]): string | undefined {
	const errors = lines.filter((line) => line.startsWith('error:'))
	const error =
		[...errors]
			.reverse()
			.find(
				(line) =>
					!/^error:\s*(?:pulumi failed|update failed|script .* exited with code)\.?$/i.test(line)
			) ?? errors.at(-1)
	const details = [...lines].reverse().find((line) => line.startsWith('details:'))
	const summary = [error, details]
		.filter((line): line is string => Boolean(line))
		.map((line) => line.replace(/^(error|details):\s*/, '').replace(/^"|"[,]?$/g, ''))
		.join(' — ')
	return summary ? summary.slice(0, 600) : undefined
}

export function orderedDeploymentTargets(values: readonly string[]): Target[] {
	const selected = new Set(values)
	return TARGETS.filter((target) => selected.has(target))
}

export function workflowRunIdFromDispatchOutput(output: string): number | undefined {
	const match = output.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/actions\/runs\/(\d+)/)
	if (!match) return undefined
	const runId = Number(match[1])
	return Number.isSafeInteger(runId) && runId > 0 ? runId : undefined
}

export function unseenWorkflowRunId(
	runs: readonly { databaseId: number }[],
	knownRunIds: ReadonlySet<number>
): number | undefined {
	return runs.find(
		(run) =>
			Number.isSafeInteger(run.databaseId) && run.databaseId > 0 && !knownRunIds.has(run.databaseId)
	)?.databaseId
}

export interface GitHubWorkflowRun {
	status: string
	conclusion: string | null
	url: string
	jobs: Array<{
		name: string
		status: string
		conclusion: string | null
		steps?: Array<{ name: string; status: string; conclusion: string | null }>
	}>
}

export function workflowProgress(
	state: GitHubWorkflowRun,
	label: string
): { status: 'active' | 'complete'; current: number; total: number; detail: string } {
	const jobs = state.jobs ?? []
	const completed = jobs.filter((job) => job.status === 'completed').length
	const active = jobs.find((job) => job.status !== 'completed')
	const activeStep = active?.steps?.find((step) => step.status === 'in_progress')
	const succeeded = state.status === 'completed' && state.conclusion === 'success'
	return {
		status: succeeded ? 'complete' : 'active',
		current: Math.min(completed + 1, Math.max(jobs.length, 1)),
		total: Math.max(jobs.length, 1),
		detail: active
			? `${active.name}${activeStep ? ` — ${activeStep.name}` : ''}`
			: succeeded
				? `${label} complete`
				: state.status === 'completed'
					? `${label} failed`
					: 'Waiting for a GitHub runner'
	}
}

const ANSI_ESCAPE_PATTERN = new RegExp(
	`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]|\\^\\[\\[[0-?]*[ -/]*[@-~]`,
	'g'
)

function cleanWorkflowLogLine(line: string): string {
	return line
		.replace(ANSI_ESCAPE_PATTERN, '')
		.replace(/^.*?\t.*?\t\d{4}-\d{2}-\d{2}T[^\s]+\s*/, '')
		.replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s*/, '')
		.replace(/^::error(?:::[^:]*)?::/i, '')
		.trim()
}

export function workflowFailureSummary(log: string): string | undefined {
	const normalized = log.replace(ANSI_ESCAPE_PATTERN, '')
	const missingNativeLibrary = normalized.match(
		/The system library [`']([^`']+)[`'] required by crate [`']([^`']+)[`'] was not found\./i
	)
	if (missingNativeLibrary)
		return `Release runner is missing native library ${missingNativeLibrary[1]} required by ${missingNativeLibrary[2]}. Merge a workflow dependency fix, update this checkout to that commit, then resume the saved setup.`
	if (
		/browserType\.launch: Executable doesn't exist at .*chromium_headless_shell/is.test(
			normalized
		) ||
		/Looks like Playwright was just installed or updated[\s\S]*playwright install/i.test(normalized)
	)
		return 'Release runner is missing the lockfile-matched Playwright Chromium browser. Merge a workflow prerequisite fix, update this checkout to that commit, then resume the saved setup.'
	if (/install: target ['"].*\/ssh\/known_hosts['"]: No such file or directory/i.test(normalized))
		return 'Release deployment could not prepare its temporary SSH credentials. Merge the SSH staging fix, update this checkout to that commit, then resume the saved setup.'
	const conflicts = new Map<string, { name: string; type: string; required: Set<string> }>()
	const conflictPattern =
		/\(([^,\n()]+),\s*([A-Z][A-Z0-9]*)\) conflicts with \(([^,\n()]+),\s*([A-Z][A-Z0-9]*)\)/g
	for (const match of normalized.matchAll(conflictPattern)) {
		const existingName = match[1]?.trim()
		const existingType = match[2]?.trim()
		const requiredName = match[3]?.trim()
		const requiredType = match[4]?.trim()
		if (!existingName || !existingType || !requiredName || !requiredType) continue
		const key = `${existingName}\u0000${existingType}`
		const conflict = conflicts.get(key) ?? {
			name: existingName,
			type: existingType,
			required: new Set<string>()
		}
		conflict.required.add(
			existingName === requiredName ? requiredType : `${requiredName} ${requiredType}`
		)
		conflicts.set(key, conflict)
	}
	if (conflicts.size > 0) {
		const descriptions = [...conflicts.values()].map(
			(conflict) =>
				`${conflict.name} ${conflict.type} blocks ${[...conflict.required].sort().join(' and ')}`
		)
		const automatic = [...conflicts.values()].every(({ type }) => type === 'CNAME')
		return automatic
			? `Hetzner DNS conflict: ${descriptions.join('; ')}. Retry with the current setup; it removes only those obsolete CNAME record sets before applying the managed addresses.`
			: `Hetzner DNS conflict: ${descriptions.join('; ')}. Remove the obsolete conflicting record(s) in the aven.ceo zone, then retry.`
	}
	if (/RRSet\(s\) already exist\(s\).*uniqueness_error/is.test(normalized))
		return 'Hetzner DNS record sets already exist outside this Pulumi stack. Retry with the current setup; it adopts and updates the exact managed A and AAAA record sets automatically.'

	const useful = normalized
		.split(/\r?\n/)
		.map(cleanWorkflowLogLine)
		.filter(
			(line) =>
				/(?:^|\b)(?:error|failed|failure):?\b/i.test(line) &&
				!/^Error: Process completed with exit code \d+\.?$/i.test(line) &&
				!/^error: update failed$/i.test(line)
		)
		.filter((line, index, lines) => lines.indexOf(line) === index)
		.slice(-3)
	const summary = useful.join(' — ')
	return summary ? summary.slice(0, 900) : undefined
}

export function retryableGitHubCliFailure(message: string): boolean {
	return /timed out|timeout|temporar(?:y|ily)|connection (?:reset|refused)|TLS|HTTP (?:429|5\d\d)|502 Bad Gateway|503 Service Unavailable/i.test(
		message
	)
}

export async function retryTransientGitHubRead<T>(options: {
	read: () => Promise<T>
	deadlineAt: number
	onRetry?: (retry: { attempt: number; delayMs: number; message: string }) => void
	sleep?: (delayMs: number) => Promise<void>
}): Promise<T> {
	let attempt = 0
	for (;;) {
		try {
			return await options.read()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (!retryableGitHubCliFailure(message) || Date.now() >= options.deadlineAt) throw error
			attempt += 1
			const delayMs = Math.min(1_000 * 2 ** Math.min(attempt - 1, 4), 15_000)
			options.onRetry?.({ attempt, delayMs, message })
			await (options.sleep ?? ((delay) => Bun.sleep(delay)))(delayMs)
		}
	}
}

export function deploymentTargetSummary(targets: readonly Target[]): string {
	const descriptions: Record<Target, string> = {
		identity: 'shared aven.id identity host',
		next: 'next platform at *.next.aven.ceo',
		production: 'production platform at *.aven.ceo'
	}
	return targets.map((target) => `${target} — ${descriptions[target]}`).join('\n')
}

export function guidedBootstrapIntroduction(
	deploymentPrefix: string,
	targets: readonly Target[] = TARGETS
): string {
	const platformTargets = targets.filter((target) => target !== 'identity')
	const count = (amount: number, singular: string, plural = `${singular}s`) =>
		`${amount} ${amount === 1 ? singular : plural}`
	return `Generation: ${deploymentPrefix}
Selected targets: ${targets.join(', ')}
Have these ready before you start:
  - GitHub: gh authenticated as a repository administrator; 1 classic token with read:packages only
  - Hetzner Object Storage: ${count(targets.length, 'numeric project ID')} and permission to create ${count(targets.length * 3, 'S3 credential')}
  - Hetzner: ${count(targets.length, 'target-scoped Cloud write token')}${platformTargets.length ? `; the project ID that owns aven.ceo; and ${count(platformTargets.length, 'DNS write token')} from that project` : ''}
${platformTargets.length ? `  - Polar: ${count(platformTargets.length, 'organization ID')} for ${platformTargets.join(' and ')}, plus the listed billing API scopes\n  - SMTP: send-only URLs and From addresses for ${platformTargets.join(' and ')}; Reply-To is optional\n  - RedPill: 1 active, funded API key for the Phala-hosted model catalog\n` : ''}  - Settings: host, SSH, ACME email, and ${targets.includes('identity') ? 'identity volume' : ''}${targets.includes('identity') && platformTargets.length ? ' plus ' : ''}${platformTargets.length ? 'platform volume and download' : ''} defaults are offered
  - Optional: a second GitHub reviewer${targets.includes('production') ? ' and Android certificate fingerprints' : ''}
${targets.includes('identity') ? '  - United Domains: 1 writable aven.id DNS API key\n' : ''}`
}

export function rotatableWizardStepIndexes(
	steps: readonly { info?: boolean; secret?: boolean; companion?: { secret?: boolean } }[]
): number[] {
	return steps.flatMap((step, index) =>
		!step.info && (step.secret === true || step.companion?.secret === true) ? [index] : []
	)
}

export function guidedBootstrapRecoveryNotice(inputPath: string, credentialsPath: string): string {
	return `Created automatically: buckets, GitHub configuration, Polar webhooks, hosts, passwords, SSH keys, database credentials, and the first software deployment.

Every answer is saved immediately because Hetzner displays S3 secrets only once. These owner-only plaintext files contain the entered credentials:
  ${inputPath}
  ${credentialsPath}

Cancel or error asks whether to keep or delete them, with no default. Deletion prevents resume and can strand a partially applied bootstrap.
`
}

export function hetznerS3CredentialsUrl(projectId: string): string {
	if (!/^\d+$/.test(projectId))
		throw new Error('Hetzner Object Storage project ID must be numeric.')
	return `https://console.hetzner.com/projects/${projectId}/security/s3-credentials`
}

export function hetznerProjectTokensUrl(projectId: string): string {
	if (!/^\d+$/.test(projectId)) throw new Error('Hetzner project ID must be numeric.')
	return `https://console.hetzner.com/projects/${projectId}/security/tokens`
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

function hmac(key: string | Buffer, value: string): Buffer {
	return createHmac('sha256', key).update(value).digest()
}

type SignedS3RequestInput = {
	region: string
	accessKeyId: string
	secretAccessKey: string
	now?: Date
	lifecycleXml?: string
} & (
	| { method: 'GET'; bucket?: string; versions?: boolean }
	| { method: 'DELETE' | 'PUT'; bucket: string }
)

function signedS3Request(input: SignedS3RequestInput): {
	url: string
	headers: Record<string, string>
} {
	if (!/^[a-z0-9-]+$/.test(input.region)) throw new Error('Invalid Object Storage region.')
	if (!input.accessKeyId || !input.secretAccessKey)
		throw new Error('Both Object Storage credential values are required.')
	if (input.method !== 'GET' && !input.bucket)
		throw new Error('An Object Storage bucket name is required for this request.')
	if (input.bucket && !/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(input.bucket))
		throw new Error('Invalid Object Storage bucket name.')
	const host = `${input.region}.your-objectstorage.com`
	const path = input.bucket ? `/${input.bucket}` : '/'
	const query = input.lifecycleXml ? 'lifecycle=' :
		input.method === 'GET' && input.bucket
			? input.versions
				? 'max-keys=1000&versions='
				: 'list-type=2&max-keys=0'
			: ''
	const now = input.now ?? new Date()
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
	const date = amzDate.slice(0, 8)
	const payloadHash = sha256(input.lifecycleXml ?? '')
	const contentMd5 = input.lifecycleXml ? createHash('md5').update(input.lifecycleXml).digest('base64') : undefined
	const signedHeaders = `${contentMd5 ? 'content-md5;' : ''}host;x-amz-content-sha256;x-amz-date`
	const canonicalHeaders = `${contentMd5 ? `content-md5:${contentMd5}\n` : ''}host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
	const canonicalRequest = [
		input.method,
		path,
		query,
		canonicalHeaders,
		signedHeaders,
		payloadHash
	].join('\n')
	const scope = `${date}/${input.region}/s3/aws4_request`
	const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`
	const dateKey = hmac(`AWS4${input.secretAccessKey}`, date)
	const regionKey = hmac(dateKey, input.region)
	const serviceKey = hmac(regionKey, 's3')
	const signingKey = hmac(serviceKey, 'aws4_request')
	const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
	return {
		url: `https://${host}${path}${query ? `?${query}` : ''}`,
		headers: {
			...(contentMd5 ? { 'content-md5': contentMd5, 'content-type': 'application/xml' } : {}),
			Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate
		}
	}
}

// Only noncurrent versions expire; live Restic snapshots retain their own retention policy.
export const recoveryBucketLifecycleXml = '<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Rule><ID>aven-recovery-history</ID><Filter><Prefix></Prefix></Filter><Status>Enabled</Status><NoncurrentVersionExpiration><NoncurrentDays>90</NoncurrentDays></NoncurrentVersionExpiration><AbortIncompleteMultipartUpload><DaysAfterInitiation>7</DaysAfterInitiation></AbortIncompleteMultipartUpload></Rule></LifecycleConfiguration>'

export function signedS3LifecycleRequest(input: {
	region: string; accessKeyId: string; secretAccessKey: string; bucket: string; now?: Date
}) {
	return { ...signedS3Request({ ...input, method: 'PUT', lifecycleXml: recoveryBucketLifecycleXml }), body: recoveryBucketLifecycleXml }
}

export async function configureRecoveryBucketLifecycle(input: {
	region: string; accessKeyId: string; secretAccessKey: string; bucket: string
}) {
	const request = signedS3LifecycleRequest(input)
	const response = await fetch(request.url, { method: 'PUT', headers: request.headers,
		body: request.body, signal: AbortSignal.timeout(30_000) })
	await response.body?.cancel()
	if (!response.ok) throw new Error(`Recovery bucket lifecycle configuration failed (HTTP ${response.status}).`)
}

export function signedS3ListBucketsRequest(input: {
	region: string
	accessKeyId: string
	secretAccessKey: string
	now?: Date
}): { url: string; headers: Record<string, string> } {
	return signedS3Request({ ...input, method: 'GET' })
}

export async function validateS3ProjectCredential(
	input: {
		region: string
		accessKeyId: string
		secretAccessKey: string
	},
	fetcher: typeof fetch = fetch
): Promise<number> {
	const request = signedS3ListBucketsRequest(input)
	const response = await fetcher(request.url, {
		headers: request.headers,
		signal: AbortSignal.timeout(20_000)
	})
	const body = await response.text()
	if (!response.ok)
		throw new Error(
			`Object Storage returned HTTP ${response.status}${s3ErrorCode(body) ? ` (${s3ErrorCode(body)})` : ''}.`
		)
	if (!body.includes('<ListAllMyBucketsResult'))
		throw new Error('Object Storage returned an unexpected list-buckets response.')
	return (body.match(/<Bucket>/g) ?? []).length
}

export function signedS3ReadRequest(input: {
	region: string
	accessKeyId: string
	secretAccessKey: string
	bucket: string
	now?: Date
}): { url: string; headers: Record<string, string> } {
	return signedS3Request({ ...input, method: 'GET' })
}

export function signedS3VersionsRequest(input: {
	region: string
	accessKeyId: string
	secretAccessKey: string
	bucket: string
	now?: Date
}): { url: string; headers: Record<string, string> } {
	return signedS3Request({ ...input, method: 'GET', versions: true })
}

export function signedS3CreateBucketRequest(input: {
	region: string
	accessKeyId: string
	secretAccessKey: string
	bucket: string
	now?: Date
}): { url: string; headers: Record<string, string> } {
	return signedS3Request({ ...input, method: 'PUT' })
}

export function signedS3DeleteBucketRequest(input: {
	region: string
	accessKeyId: string
	secretAccessKey: string
	bucket: string
	now?: Date
}): { url: string; headers: Record<string, string> } {
	return signedS3Request({ ...input, method: 'DELETE' })
}

type ExactS3BucketRequest = {
	region: string
	accessKeyId: string
	secretAccessKey: string
	bucket: string
}

export async function exactS3BucketExists(
	input: ExactS3BucketRequest,
	fetcher: typeof fetch = fetch
): Promise<boolean> {
	const request = signedS3ReadRequest(input)
	const response = await fetcher(request.url, {
		headers: request.headers,
		signal: AbortSignal.timeout(20_000)
	})
	if (response.ok) return true
	if (response.status === 404) return false
	throw new Error(
		`Hetzner Object Storage returned HTTP ${response.status} while checking exact bucket ${input.bucket}.`
	)
}

export async function createExactS3Bucket(
	input: ExactS3BucketRequest,
	fetcher: typeof fetch = fetch
): Promise<void> {
	const request = signedS3CreateBucketRequest(input)
	const response = await fetcher(request.url, {
		method: 'PUT',
		headers: request.headers,
		signal: AbortSignal.timeout(20_000)
	})
	if (response.ok) return
	const code = s3ErrorCode(await response.text())
	if (
		response.status === 409 &&
		['BucketAlreadyExists', 'BucketAlreadyOwnedByYou'].includes(code ?? '')
	)
		return
	throw new Error(
		`Hetzner Object Storage rejected exact bucket ${input.bucket} with HTTP ${response.status}${code ? ` (${code})` : ''}.`
	)
}

export function s3ErrorCode(xml: string): string | undefined {
	return /<Code>([^<]+)<\/Code>/.exec(xml)?.[1]
}

export function valueAt(root: Record<string, unknown>, path: readonly string[]): unknown {
	let current: unknown = root
	for (const part of path) {
		if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
		current = (current as Record<string, unknown>)[part]
	}
	return current
}

export function setValueAt(
	root: Record<string, unknown>,
	path: readonly string[],
	value: unknown
): void {
	if (path.length === 0) throw new Error('A bootstrap input path cannot be empty.')
	let current = root
	for (const part of path.slice(0, -1)) {
		const next = current[part]
		if (!next || typeof next !== 'object' || Array.isArray(next)) current[part] = {}
		current = current[part] as Record<string, unknown>
	}
	current[path.at(-1) as string] = value
}

function stringValue(root: Record<string, unknown>, path: readonly string[]): string {
	const value = valueAt(root, path)
	return typeof value === 'string' ? value : ''
}

function csv(value: string): string {
	return `"${value.replaceAll('"', '""')}"`
}

export function guidedCredentialsCsv(
	draft: Record<string, unknown>,
	deploymentPrefix = 'pending'
): string {
	const rows: string[][] = []
	const add = (
		group: string,
		name: string,
		username: string,
		secret: string,
		url: string,
		notes: string
	) => {
		if (!username && !secret) return
		rows.push([`avenOS/${deploymentPrefix}/${group}`, name, username, secret, url, notes])
	}
	add(
		'shared',
		'avenOS GitHub Packages reader',
		'',
		stringValue(draft, ['githubPackagesReadToken']),
		'https://github.com/settings/tokens',
		'Classic GitHub token with read:packages only; CI uses it to install the cross-repository @myavenceo packages.'
	)
	for (const step of S3_CREDENTIAL_STEPS) {
		const projectId = stringValue(draft, ['objectStorage', 'targets', step.target, 'projectId'])
		const objectStorageUrl = projectId
			? hetznerS3CredentialsUrl(projectId)
			: 'https://console.hetzner.com/projects'
		add(
			step.target,
			step.description,
			stringValue(draft, [...step.path, 'accessKeyId']),
			stringValue(draft, [...step.path, 'secretAccessKey']),
			objectStorageUrl,
			`${step.purpose}${projectId ? ` Hetzner Object Storage project ${projectId}.` : ''}`
		)
	}
	for (const target of ['identity', 'next', 'production'] as const) {
		const projectId = stringValue(draft, ['objectStorage', 'targets', target, 'projectId'])
		add(
			target,
			`avenOS ${target} deployment (Hetzner Cloud token)`,
			'',
			stringValue(draft, ['providers', target, 'computeToken']),
			projectId ? hetznerProjectTokensUrl(projectId) : 'https://console.hetzner.com/projects',
			`Target-scoped Hetzner Cloud API token used to provision the ${target} host.`
		)
	}
	for (const target of ['next', 'production'] as const) {
		const projectId = stringValue(draft, ['providers', 'dnsProjectId'])
		add(
			target,
			`avenOS ${target} DNS deployment (Hetzner DNS token)`,
			'',
			stringValue(draft, ['providers', target, 'dnsToken']),
			projectId ? hetznerProjectTokensUrl(projectId) : 'https://console.hetzner.com/projects',
			`Writes the ${target} records in the shared aven.ceo DNS zone${projectId ? ` in Hetzner project ${projectId}` : ''}.`
		)
		add(
			target,
			`avenOS ${target} billing (Polar API key)`,
			stringValue(draft, ['providers', target, 'polarOrganizationId']),
			stringValue(draft, ['providers', target, 'polarApiKey']),
			target === 'next' ? 'https://sandbox.polar.sh' : 'https://polar.sh',
			`Reconciles products, benefits, meters, and webhooks and serves checkout, subscription, customer, and order operations in the Polar ${target} organization.`
		)
		add(
			target,
			`avenOS ${target} SMTP`,
			'',
			stringValue(draft, ['providers', target, 'smtpUrl']),
			'',
			`Send-only checkout mail transport for ${target}.`
		)
	}
	add(
		'shared',
		'avenOS chat bootstrap (RedPill API key)',
		'',
		stringValue(draft, ['providers', 'redpillApiKey']),
		'https://redpill.ai',
		'Server-side inference credential shared by next and production.'
	)
	const header = ['Group', 'Title', 'Username', 'Password', 'URL', 'Notes']
	return `${[header, ...rows].map((row) => row.map(csv).join(',')).join('\n')}\n`
}
