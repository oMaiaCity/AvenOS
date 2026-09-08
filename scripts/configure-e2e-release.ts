import { appendFile } from 'node:fs/promises'
import { validateReleaseManifest } from './lib/platform-release.js'

const input = process.env.RELEASE_TEST_MANIFEST
if (input) {
	const manifest = validateReleaseManifest(JSON.parse(input))
	if (manifest.sha !== process.env.GITHUB_SHA || !process.env.GITHUB_ENV)
		throw new Error('The release journey must test its exact source revision.')
	const values = Object.entries(manifest.images).map(([name, image]) => `E2E_${name}=${image}`)
	await appendFile(process.env.GITHUB_ENV, `${values.join('\n')}\nE2E_SKIP_IMAGE_BUILD=true\n`)
}
