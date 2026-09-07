export const releaseImages = {
	DATABASE_IMAGE: 'aven-database',
	PROXY_IMAGE: 'aven-proxy',
	IDENTITY_IMAGE: 'aven-identity',
	API_IMAGE: 'aven-api',
	CHECKOUT_IMAGE: 'aven-checkout',
	STATIC_SITE_HOST_IMAGE: 'aven-static-site-host',
	PLATFORM_PROVISIONER_IMAGE: 'aven-platform-provisioner',
	INTENT_SERVICE_IMAGE: 'aven-intent-service',
	ACTOR_RUNNER_IMAGE: 'aven-actor-runner',
	ARTIFACT_STORE_IMAGE: 'aven-artifact-store',
	OPERATIONS_IMAGE: 'aven-operations'
} as const
export interface ReleaseManifest {
	version: 1
	sha: string
	runId: number
	images: Record<keyof typeof releaseImages, string>
}
export function validateReleaseManifest(value: unknown): ReleaseManifest {
	if (!value || typeof value !== 'object') throw new Error('Missing release manifest.')
	const v = value as ReleaseManifest
	if (
		Object.keys(v).sort().join(',') !== 'images,runId,sha,version' ||
		v.version !== 1 ||
		!Number.isSafeInteger(v.runId) ||
		v.runId <= 0 ||
		!/^[a-f0-9]{40}$/.test(v.sha)
	)
		throw new Error('Invalid release provenance.')
	if (
		!v.images ||
		Object.keys(v.images).sort().join(',') !== Object.keys(releaseImages).sort().join(',')
	)
		throw new Error('Release must contain exactly the expected service images.')
	for (const [key, image] of Object.entries(releaseImages)) {
		if (
			!new RegExp(`^ghcr\\.io/myavenceo/${image}@sha256:[a-f0-9]{64}$`).test(
				v.images[key as keyof typeof releaseImages]
			)
		)
			throw new Error(`Invalid immutable image for ${key}.`)
	}
	return v
}
export function assertDeploymentAuthority(ref: string, target: string) {
	if (!['all', 'identity', 'next', 'production'].includes(target))
		throw new Error('Unknown deployment target.')
	if (ref !== 'refs/heads/prod' && !(ref === 'refs/heads/next' && target === 'next'))
		throw new Error(
			'Next may deploy only next. Identity and production require protected prod; main has no deployment authority.'
		)
}

export function assertNextReleaseCommit(
	ref: string,
	target: string,
	releaseSha: string,
	workflowSha: string
) {
	// Next's own workflow tests the current candidate. Protected prod may restore or
	// roll back an earlier, separately verified manifest into next without rebuilding it.
	if (target === 'next' && ref === 'refs/heads/next' && releaseSha !== workflowSha)
		throw new Error('Next deploys its exact current release commit.')
}
export function assertRunProvenance(
	run: {
		conclusion?: string
		head_branch?: string
		head_sha?: string
		event?: string
		path?: string
		head_repository?: { full_name?: string }
	},
	repository: string,
	workflow: string,
	branches: string[]
) {
	if (
		run.conclusion !== 'success' ||
		run.event !== 'workflow_dispatch' ||
		!branches.includes(run.head_branch ?? '') ||
		run.path !== `.github/workflows/${workflow}` ||
		run.head_repository?.full_name?.toLowerCase() !== repository.toLowerCase() ||
		!/^[a-f0-9]{40}$/.test(run.head_sha ?? '')
	)
		throw new Error('Run is not a successful protected-branch release from this repository.')
}

export function sameRelease(a: ReleaseManifest, b: ReleaseManifest): boolean {
	return (
		a.sha === b.sha &&
		a.runId === b.runId &&
		Object.keys(releaseImages).every(
			(key) =>
				a.images[key as keyof typeof releaseImages] === b.images[key as keyof typeof releaseImages]
		)
	)
}
