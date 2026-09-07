import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import corpus from './cases.json'

// Explicit command only. Ordinary tests never download documents or call providers.
const directory =
	process.env.AVEN_PUBLIC_DOCUMENT_DIR ?? new URL('./files', import.meta.url).pathname
await mkdir(directory, { recursive: true })
for (const spec of corpus.documents) {
	const target = join(directory, `${spec.id}.pdf`)
	let bytes = await readFile(target).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'ENOENT') throw error
		return null
	})
	const cached = bytes !== null
	if (!bytes) {
		const response = await fetch(spec.url, { signal: AbortSignal.timeout(30_000) })
		if (!response.ok || !response.body) throw new Error(`${spec.id}: HTTP ${response.status}`)
		const reader = response.body.getReader(),
			chunks: Uint8Array[] = []
		let length = 0
		try {
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				length += value.length
				if (length > 16_000_000) throw new Error(`${spec.id}: download exceeds 16 MB`)
				chunks.push(value)
			}
		} finally {
			await reader.cancel()
		}
		bytes = Buffer.concat(chunks)
	}
	if (createHash('sha256').update(bytes).digest('hex') !== spec.sha256)
		throw new Error(`${spec.id}: checksum changed; inspect the source before updating the manifest`)
	if (!cached) await writeFile(target, bytes, { flag: 'wx' })
	console.info(`${spec.id}: verified ${bytes.length} bytes${cached ? ' (cached)' : ''}`)
}
