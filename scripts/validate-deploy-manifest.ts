import { validateReleaseManifest } from './lib/platform-release.js'

try {
	const manifest = validateReleaseManifest(JSON.parse(process.env.RELEASE_MANIFEST ?? 'null'))
	if (manifest.sha !== process.env.DEPLOYED_REF_SHA)
		throw new Error('Deployment revision and verified manifest differ.')
	for (const [key, image] of Object.entries(manifest.images))
		if (process.env[key] !== image)
			throw new Error('Deployment image and verified manifest differ.')
	console.info(JSON.stringify(manifest))
} catch {
	console.error(
		'A verified release manifest matching the deployment revision and every image is required.'
	)
	process.exitCode = 1
}
