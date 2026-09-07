import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function withinDiskBudget(root: string, maxBytes: number, maxEntries: number) {
	const directories = [root]
	let bytes = 0
	let entries = 0
	while (directories.length) {
		const directory = directories.pop() as string
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (++entries > maxEntries) throw new Error('repository entry budget exceeded')
			const path = join(directory, entry.name)
			if (entry.isDirectory()) directories.push(path)
			else bytes += (await Bun.file(path).stat()).size
			if (bytes > maxBytes) throw new Error('repository disk budget exceeded')
		}
	}
}

export async function boundedCommand(args: string[], options: {
	timeoutMs?: number; maxOutputBytes?: number;
	disk?: { root: string; maxBytes: number; maxEntries: number }
} = {}): Promise<string> {
	const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe', detached: true,
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1',
			GIT_CONFIG_GLOBAL: '/dev/null' } })
	let failure: Error | undefined
	const stop = (error: Error) => {
		failure ??= error
		try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
	}
	const deadline = setTimeout(() => stop(new Error('repository command timed out')), options.timeoutMs ?? 120_000)
	let checking = false
	const diskCheck = setInterval(async () => {
		if (!options.disk || checking || failure) return
		checking = true
		try { await withinDiskBudget(options.disk.root, options.disk.maxBytes, options.disk.maxEntries) }
		catch { stop(new Error('repository disk budget exceeded')) }
		finally { checking = false }
	}, 250)
	const capture = async (stream: ReadableStream<Uint8Array>) => {
		let size = 0
		const chunks: Uint8Array[] = []
		for await (const chunk of stream) {
			size += chunk.byteLength
			if (size > (options.maxOutputBytes ?? 8 * 1024 * 1024)) {
				stop(new Error('repository command output budget exceeded'))
				break
			}
			chunks.push(chunk)
		}
		return Buffer.concat(chunks).toString('utf8')
	}
	try {
		const [code, stdout] = await Promise.all([child.exited, capture(child.stdout), capture(child.stderr)])
		if (failure) throw failure
		if (code !== 0) throw new Error(`repository command failed (exit ${code})`)
		if (options.disk) await withinDiskBudget(options.disk.root, options.disk.maxBytes, options.disk.maxEntries)
		return stdout
	} catch (error) {
		stop(new Error('repository command failed'))
		throw error
	} finally {
		clearTimeout(deadline)
		clearInterval(diskCheck)
	}
}

export function validateArtifactTree(listing: string, maxFiles: number, maxBytes: number) {
	let count = 0
	let bytes = 0
	for (const row of listing.split('\0').filter(Boolean)) {
		const match = /^(100644|100755) blob [0-9a-f]{40,64}\s+(\d+)\t(.+)$/.exec(row)
		if (!match) throw new Error('site artifacts must contain only regular files')
		const path = match[3]
		if (path.length > 1024 || path.split('/').length > 20 || path.split('/').some((part) => part === '..'))
			throw new Error('site artifact path exceeds its limit')
		bytes += Number(match[2])
		if (++count > maxFiles || bytes > maxBytes) throw new Error('site artifact exceeds its limit')
	}
	if (!count) throw new Error('site artifact is empty')
}
