import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const listed = Bun.spawnSync({
	cmd: ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
	cwd: root,
	stdout: 'pipe',
	stderr: 'inherit'
})

if (listed.exitCode !== 0) process.exit(listed.exitCode)

const ignoredPrefixes = ['.claude/', '.cursor/', 'ARCHIVE/', 'libs/aven-board/board/']
const files = listed.stdout
	.toString()
	.trim()
	.split('\n')
	.filter(Boolean)
	.filter((file) => existsSync(resolve(root, file)))
	.filter((file) => !ignoredPrefixes.some((prefix) => file.startsWith(prefix)))
	.filter(
		(file) =>
			file === 'README.md' ||
			file === 'tools/README.md' ||
			file.startsWith('docs/') ||
			/^(?:infrastructure|libs|services)\/[^/]+\/README\.md$/.test(file)
	)

function headingSlug(heading: string): string {
	return heading
		.replace(/<[^>]+>/g, '')
		.replace(/[`*_~]/g, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.trim()
		.replace(/\s+/g, '-')
}

function anchorsFor(file: string): Set<string> {
	const anchors = new Set<string>()
	const duplicates = new Map<string, number>()
	const source = readFileSync(file, 'utf8')

	for (const match of source.matchAll(/<a\s+id=["']([^"']+)["'][^>]*>/gi)) {
		anchors.add(match[1])
	}

	for (const line of source.split('\n')) {
		const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
		if (!match) continue
		const base = headingSlug(match[2].replace(/\s+#+$/, ''))
		if (!base) continue
		const count = duplicates.get(base) ?? 0
		anchors.add(count === 0 ? base : `${base}-${count}`)
		duplicates.set(base, count + 1)
	}

	return anchors
}

const anchorCache = new Map<string, Set<string>>()
const failures: string[] = []

for (const relativeFile of files) {
	const file = resolve(root, relativeFile)
	const source = readFileSync(file, 'utf8')

	for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
		let target = match[1].trim()
		if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
		if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target) || target.startsWith('/')) continue
		if (target.includes(' ')) target = target.split(/\s+["']/)[0]

		const [rawPath, rawFragment] = target.split('#', 2)
		const targetPath = decodeURIComponent(rawPath || relativeFile)
		let resolved = resolve(dirname(file), targetPath)
		if (!existsSync(resolved) && !extname(resolved) && existsSync(`${resolved}.md`)) {
			resolved = `${resolved}.md`
		}

		if (!existsSync(resolved)) {
			failures.push(`${relativeFile}: missing link target ${target}`)
			continue
		}
		if (!rawFragment || statSync(resolved).isDirectory() || extname(resolved) !== '.md') continue

		const fragment = decodeURIComponent(rawFragment).toLowerCase()
		let anchors = anchorCache.get(resolved)
		if (!anchors) {
			anchors = anchorsFor(resolved)
			anchorCache.set(resolved, anchors)
		}
		if (!anchors.has(fragment)) {
			failures.push(`${relativeFile}: missing section #${fragment} in ${targetPath}`)
		}
	}
}

if (failures.length > 0) {
	console.error(`Documentation link check failed (${failures.length}):`)
	for (const failure of failures) console.error(`- ${failure}`)
	process.exit(1)
}

console.log(`Documentation links are valid across ${files.length} active Markdown files.`)
