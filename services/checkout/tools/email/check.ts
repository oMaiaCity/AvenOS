import { readFile } from 'node:fs/promises'
import { generatedTemplatePath, generatedTemplateSource } from './compiler.js'

const [expected, actual] = await Promise.all([
	generatedTemplateSource(),
	readFile(generatedTemplatePath, 'utf8').catch(() => '')
])

if (actual !== expected) {
	console.error('Compiled email templates are stale. Run: bun run email:compile')
	process.exitCode = 1
} else {
	console.info('Compiled email templates are current.')
}
