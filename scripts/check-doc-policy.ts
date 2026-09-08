import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const failures: string[] = []

const authoritative = [
	'docs/writing.md',
	'docs/product-model.md',
	'docs/customer-database-system-map.md',
	'docs/operations/README.md',
	'docs/operations/access-and-secrets.md',
	'docs/operations/backup-and-recovery.md',
	'docs/operations/build-and-test.md',
	'docs/operations/deployment.md',
	'docs/operations/initial-provisioning.md',
	'docs/operations/incident-response.md',
	'docs/operations/local-stack.md',
	'docs/operations/maintenance.md',
	'docs/operations/security-controls.md',
	'docs/operations/startup-and-readiness.md',
	'docs/operations/workstation-setup.md'
]

for (const file of authoritative) {
	if (!existsSync(resolve(root, file))) {
		failures.push(`missing authoritative document ${file}`)
		continue
	}
	if (!/^Status: authoritative(?:\s|$)/m.test(read(file))) {
		failures.push(`${file} must declare Status: authoritative`)
	}
}

const removedRunbooks = [
	'CUSTOMER-DATA-PLANE-ARCHITECTURE.md',
	'deploy/local/README.md',
	'docs/customer-platform-getting-started.md',
	'docs/full-stack-e2e-proof.md',
	'docs/infrastructure-getting-started.md',
	'docs/operations-lifecycle-and-disaster-recovery.md',
	'scripts/README.md'
]
for (const file of removedRunbooks) {
	if (existsSync(resolve(root, file))) failures.push(`superseded runbook returned: ${file}`)
}

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
const commandDocs = ['README.md', ...authoritative]
for (const file of commandDocs) {
	const source = read(file)
	for (const match of source.matchAll(/\bbun run ([a-zA-Z0-9:_-]+)/g)) {
		const script = match[1]
		if (script.startsWith('-')) continue
		if (!(script in packageJson.scripts)) {
			failures.push(`${file} documents missing root package script: ${script}`)
		}
	}
}

const platformWorkflows = [
	'.github/workflows/platform-infrastructure.yml',
	'.github/workflows/platform-deploy.yml',
	'.github/workflows/platform-deploy-target.yml',
	'.github/workflows/platform-release.yml',
	'.github/workflows/platform-operations.yml',
	'.github/workflows/platform-observe.yml'
]
const workflowSource = platformWorkflows.map(read).join('\n')
const accessGuide = read('docs/operations/access-and-secrets.md')
const settings = new Set<string>()
for (const match of workflowSource.matchAll(/\b(?:secrets|vars)\.([A-Z][A-Z0-9_]*)/g)) {
	settings.add(match[1])
}

const deploymentGuide = read('docs/operations/deployment.md')
for (const required of [
	'organization/aven-platform/identity',
	'organization/aven-platform/next',
	'organization/aven-platform/production',
	'api.next.aven.ceo',
	'portal.next.aven.ceo',
	'next.aven.ceo',
	'api.aven.ceo',
	'portal.aven.ceo',
	'aven.ceo',
	'aven.id'
]) {
	if (!deploymentGuide.includes(required))
		failures.push(`deployment guide must document environment contract ${required}`)
}
for (const stale of [
	'Production is not an independent deployment target',
	'Production is not yet an isolated supported deployment target',
	'an independently supported production target',
	'current production limitation'
]) {
	for (const file of ['README.md', ...authoritative]) {
		if (read(file).includes(stale))
			failures.push(`${file} contains stale deployment claim: ${stale}`)
	}
}
for (const setting of [...settings].sort()) {
	if (!accessGuide.includes(`\`${setting}\``)) {
		failures.push(`access guide does not document workflow setting ${setting}`)
	}
}

const rootAgents = read('AGENTS.md')
for (const required of [
	'docs/writing.md',
	'docs/product-model.md',
	'docs/operations/',
	'bun run check:docs'
]) {
	if (!rootAgents.includes(required)) failures.push(`AGENTS.md must reference ${required}`)
}

const rootReadme = read('README.md')
for (const required of [
	'docs/product-model.md',
	'docs/operations/README.md',
	'docs/operations/workstation-setup.md',
	'docs/operations/local-stack.md',
	'docs/operations/build-and-test.md',
	'docs/operations/deployment.md',
	'docs/operations/initial-provisioning.md',
	'docs/operations/maintenance.md',
	'docs/operations/backup-and-recovery.md',
	'docs/operations/incident-response.md',
	'docs/writing.md'
]) {
	if (!rootReadme.includes(required)) failures.push(`README.md must link ${required}`)
}

const documentationWorkflow = read('.github/workflows/docs-ci.yml')
for (const required of [
	"'**/*.md'",
	'package.json',
	'scripts/check-doc-links.ts',
	'scripts/check-doc-policy.ts',
	'.github/workflows/docs-ci.yml'
]) {
	if (!documentationWorkflow.includes(required)) {
		failures.push(`documentation workflow must watch ${required}`)
	}
}

for (const workflow of [
	'.github/workflows/docs-ci.yml',
	'.github/workflows/platform-ci.yml',
	'.github/workflows/platform-release.yml'
]) {
	const source = read(workflow)
	const sharedGate =
		source.includes('uses: ./.github/workflows/platform-verification.yml') &&
		read('.github/workflows/platform-verification.yml').includes('bun run check:docs')
	if (!source.includes('bun run check:docs') && !sharedGate) {
		failures.push(`${workflow} must run the documentation gate`)
	}
}

if (failures.length > 0) {
	console.error(`Documentation policy check failed (${failures.length}):`)
	for (const failure of failures) console.error(`- ${failure}`)
	process.exit(1)
}

console.log(
	`Documentation policy is consistent: ${authoritative.length} authorities, ${settings.size} workflow settings.`
)
