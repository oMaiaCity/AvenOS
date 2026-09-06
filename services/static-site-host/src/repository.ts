import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { type DirectoryBinding, validateBinding } from './binding.js'
import type { SiteHostConfig } from './config.js'
import { boundedCommand, validateArtifactTree } from './bounded-command.js'

export { type DirectoryBinding, validateBinding } from './binding.js'

async function inspectTree(root: string, maxFiles: number, maxBytes: number) {
	let files = 0
	let bytes = 0
	const pending = [root]
	while (pending.length) {
		const directory = pending.pop() as string
		for await (const entry of new Bun.Glob('*').scan({
			cwd: directory,
			dot: true,
			onlyFiles: false
		})) {
			const path = join(directory, entry)
			const info = await lstat(path)
			if (info.isSymbolicLink()) throw new Error('site artifacts must not contain symbolic links')
			if (info.isDirectory()) pending.push(path)
			else if (info.isFile()) {
				files += 1
				bytes += info.size
				if (files > maxFiles || bytes > maxBytes) throw new Error('site artifact exceeds its limit')
			}
		}
	}
}

export async function materialize(
	binding: DirectoryBinding,
	config: SiteHostConfig
): Promise<{ root: string; artifactRevision: string; sourceRevision: string }> {
	validateBinding(binding)
	await mkdir(join(config.dataRoot, 'repositories'), { recursive: true })
	const repository = await mkdtemp(join(config.dataRoot, 'repositories', 'fetch-'))
	const deadline = Date.now() + 180_000
	const command = async (args: string[]) => {
		if (Date.now() >= deadline) throw new Error('repository synchronization timed out')
		return (await boundedCommand([args[0], '-c', 'protocol.version=2',
			'-c', 'protocol.file.allow=never', '-c', 'core.hooksPath=/dev/null',
			'-c', 'http.lowSpeedLimit=1024', '-c', 'http.lowSpeedTime=30',
			'-c', 'fetch.fsckObjects=true', ...args.slice(1)], {
			timeoutMs: Math.min(120_000, deadline - Date.now()),
			disk: { root: repository, maxBytes: config.maxBytes * 2, maxEntries: config.maxFiles * 3 + 1000 }
		})).trim()
	}
	try {
	await command(['git', 'init', '--bare', repository])
	await command(['git', '--git-dir', repository, 'remote', 'add', 'origin', binding.clone_url])
	await command([
		'git',
		'--git-dir',
		repository,
		'fetch',
		'--force',
		'--depth=1',
		'--no-tags',
		'origin',
		`+${binding.source_ref}:refs/aven/source`,
		`+${binding.artifact_ref}:refs/aven/artifact`
	])
	const sourceRevision = await command([
		'git',
		'--git-dir',
		repository,
		'rev-parse',
		'refs/aven/source'
	])
	const artifactRevision = await command([
		'git',
		'--git-dir',
		repository,
		'rev-parse',
		'refs/aven/artifact'
	])
	const bindingRoot = join(config.dataRoot, 'bindings', binding.id)
	const tree = await command(['git', '--git-dir', repository, 'ls-tree', '-r', '-l', '-z',
		'refs/aven/artifact', '--', binding.artifact_path])
	validateArtifactTree(tree, config.maxFiles, config.maxBytes)
	const release = join(bindingRoot, 'releases', artifactRevision)
	if (!(await stat(release).catch(() => null))) {
		const staging = join(bindingRoot, `.staging-${crypto.randomUUID()}`)
		await mkdir(staging, { recursive: true })
		try {
			await command([
				'git',
				'--git-dir',
				repository,
				`--work-tree=${staging}`,
				'checkout',
				'-f',
				'refs/aven/artifact',
				'--',
				binding.artifact_path
			])
			const root = join(staging, binding.artifact_path)
			if (!(await stat(join(root, 'index.html')).catch(() => null)))
				throw new Error('deployment artifact has no dist/index.html')
			const marker = (await readFile(join(root, '.source-revision'), 'utf8')).trim()
			if (marker !== sourceRevision)
				throw new Error('deployment artifact was not built from the configured source branch head')
			await inspectTree(root, config.maxFiles, config.maxBytes)
			await mkdir(join(bindingRoot, 'releases'), { recursive: true })
			await rename(root, release)
		} finally {
			await rm(staging, { recursive: true, force: true })
		}
	}
	const next = join(bindingRoot, `.current-${crypto.randomUUID()}`)
	await symlink(join('releases', artifactRevision), next)
	await rename(next, join(bindingRoot, 'current'))
	const releasesRoot = join(bindingRoot, 'releases')
	const oldReleases = await Promise.all(
		(await readdir(releasesRoot))
			.filter((entry) => entry !== artifactRevision)
			.map(async (entry) => ({ entry, mtime: (await stat(join(releasesRoot, entry))).mtimeMs }))
	)
	oldReleases.sort((left, right) => right.mtime - left.mtime)
	for (const obsolete of oldReleases.slice(1))
		await rm(join(releasesRoot, obsolete.entry), { recursive: true, force: true })
	return { root: release, artifactRevision, sourceRevision }
	} finally {
		await rm(repository, { recursive: true, force: true })
	}
}
