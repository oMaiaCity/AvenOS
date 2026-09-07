import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const audit = process.env.CARGO_AUDIT_BIN ?? 'cargo-audit'
async function run(args: string[]) {
	const child = Bun.spawn(args, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
	const timer = setTimeout(() => child.kill(), 180_000)
	try {
		const [code, text] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text()
		])
		return { code, text: text.trim() }
	} finally {
		clearTimeout(timer)
	}
}
if (!(await run([audit, '--version'])).text.includes('0.22.2'))
	throw new Error('Install cargo-audit 0.22.2 with --locked before this check.')
const inventory = await run([
	'git',
	'ls-files',
	'--',
	'app/**/Cargo.lock',
	'libs/**/Cargo.lock',
	'services/**/Cargo.lock'
])
if (inventory.code || !inventory.text) throw new Error('Cannot inventory supported Rust lockfiles.')
type Finding = { advisory: { id: string }; package: { name: string; version: string } }
let failures = 0
let first = true
for (const file of inventory.text.split('\n')) {
	const result = await run([
		audit,
		'audit',
		'--file',
		file,
		'--json',
		...(first ? [] : ['--no-fetch'])
	])
	first = false
	const report = JSON.parse(result.text)
	if (![0, 1].includes(result.code) || !Array.isArray(report.vulnerabilities?.list))
		throw new Error(`Could not audit ${file}.`)
	for (const finding of report.vulnerabilities.list as Finding[]) {
		// Cargo locks SQLx's optional MySQL graph even though this PostgreSQL-only service
		// never builds it. Re-prove absence across every target/feature on each audit.
		if (
			file === 'services/artifact-store/Cargo.lock' &&
			finding.advisory.id === 'RUSTSEC-2023-0071' &&
			finding.package.name === 'rsa'
		) {
			const graph = await run([
				'cargo',
				'tree',
				'--locked',
				'--manifest-path',
				file.replace(/Cargo.lock$/, 'Cargo.toml'),
				'--target',
				'all',
				'--all-features',
				'-i',
				`rsa@${finding.package.version}`,
				'--prefix',
				'none',
				'--format',
				'{p}'
			])
			if (graph.code === 0 && graph.text === '') {
				console.info(
					`${file}: ${finding.advisory.id} is confined to an unbuilt optional dependency; all-target feature graph checked.`
				)
				continue
			}
		}
		failures++
		console.error(
			`${file}: ${finding.advisory.id} ${finding.package.name}@${finding.package.version}`
		)
	}
	for (const [kind, findings] of Object.entries(report.warnings ?? {}) as [string, Finding[]][])
		for (const finding of findings)
			console.warn(
				`${file}: ${kind}: ${finding.advisory.id} ${finding.package.name}@${finding.package.version}`
			)
	console.info(`${file}: checked ${report.lockfile['dependency-count']} locked dependencies.`)
}
if (failures) throw new Error(`${failures} applicable Rust vulnerability finding(s).`)
