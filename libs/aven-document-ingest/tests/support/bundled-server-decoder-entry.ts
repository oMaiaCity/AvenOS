import { readFile } from 'node:fs/promises'
import { ServerDocumentDecoder } from '../../src/server'

const path = process.argv[2]
if (!path) throw new Error('PDF path argument required')
const bytes = new Uint8Array(await readFile(path))
const decoded = await new ServerDocumentDecoder().decode(
	{
		artifactId: '11111111-1111-4111-8111-111111111111',
		originalName: path.split('/').at(-1) ?? 'golden.pdf',
		declaredMediaType: 'application/pdf',
		base64: Buffer.from(bytes).toString('base64')
	},
	{ modelPageLimit: 15 }
)
console.log(
	JSON.stringify({
		outcome: decoded.outcome,
		pages: decoded.pages.length,
		runs: decoded.pages.reduce((sum, page) => sum + page.runs.length, 0),
		images: decoded.pages.map((page) => Buffer.from(page.image?.base64 ?? '', 'base64').length)
	})
)
