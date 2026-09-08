import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	assertDeploymentAuthority,
	assertInitialDeployment,
	assertNextReleaseCommit,
	assertRunProvenance,
	sameRelease,
	validateReleaseManifest
} from './lib/platform-release.js'

const env = process.env
assertDeploymentAuthority(env.GITHUB_REF ?? '', env.DEPLOYMENT_TARGET ?? '')
assertInitialDeployment(
	env.DEPLOYMENT_TARGET ?? '',
	env.INITIAL_INSTALLATION === 'true',
	env.RECOVER_FROM_BACKUP === 'true'
)
if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
	throw new Error('Deployment requires an explicit dispatch.')
if (env.GITHUB_ACTOR?.endsWith('[bot]'))
	throw new Error('Production deployment requires an operator dispatch, not an automation bot.')
if (!/^avenos-[a-f0-9]{10}$/.test(env.DEPLOYMENT_ENVIRONMENT_PREFIX ?? ''))
	throw new Error('No active generation.')
const requested =
	env.DEPLOYMENT_TARGET === 'all' ? ['identity', 'next', 'production'] : [env.DEPLOYMENT_TARGET]
const prepared = JSON.parse(env.DEPLOYMENT_TARGETS_JSON ?? '[]')
if (!Array.isArray(prepared) || !requested.every((target) => prepared.includes(target)))
	throw new Error('Target is not prepared.')
if (env.DEPLOYMENT_TARGET === 'all' && env.RECOVER_FROM_BACKUP === 'true')
	throw new Error('Bulk recovery is not supported.')
const repository = env.GITHUB_REPOSITORY ?? ''
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository.')
const releaseRunId = env.RELEASE_RUN_ID ?? ''
if (!/^[1-9][0-9]{0,15}$/.test(releaseRunId))
	throw new Error('Choose a successful numeric release run ID, not a Git ref.')
async function run(args: string[]) {
	const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
	const deadline = setTimeout(() => child.kill(), 60_000)
	try {
		const [code, output] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text()
		])
		if (code !== 0) throw new Error(`${args[0]} could not verify release provenance.`)
		return output.trim()
	} finally {
		clearTimeout(deadline)
	}
}
const directory = mkdtempSync(join(tmpdir(), 'aven-release-'))
try {
	const metadata = JSON.parse(
		await run(['gh', 'api', `repos/${repository}/actions/runs/${releaseRunId}`])
	)
	assertRunProvenance(metadata, repository, 'platform-release.yml', ['next'])
	await run([
		'gh',
		'run',
		'download',
		releaseRunId,
		'--repo',
		repository,
		'--name',
		'aven-release',
		'--dir',
		directory
	])
	const manifest = validateReleaseManifest(
		JSON.parse(readFileSync(join(directory, 'release.json'), 'utf8'))
	)
	if (manifest.runId !== Number(releaseRunId) || manifest.sha !== metadata.head_sha)
		throw new Error('Manifest and workflow run disagree.')
	// The protected workflow may deploy an earlier supported release, but never unrelated source.
	await run(['git', 'merge-base', '--is-ancestor', manifest.sha, env.GITHUB_SHA ?? ''])
	assertNextReleaseCommit(
		env.GITHUB_REF ?? '',
		env.DEPLOYMENT_TARGET ?? '',
		manifest.sha,
		env.GITHUB_SHA ?? ''
	)
	if (env.DEPLOYMENT_TARGET === 'production') {
		const proofId = env.NEXT_PROOF_RUN_ID ?? ''
		if (!/^[1-9][0-9]{0,15}$/.test(proofId))
			throw new Error('Production requires the successful run ID that tested these images in next.')
		const proofRun = JSON.parse(
			await run(['gh', 'api', `repos/${repository}/actions/runs/${proofId}`])
		)
		assertRunProvenance(proofRun, repository, 'platform-deploy.yml', ['next', 'prod'])
		await run([
			'gh',
			'run',
			'download',
			proofId,
			'--repo',
			repository,
			'--name',
			'aven-next-proof',
			'--dir',
			directory
		])
		const proof = validateReleaseManifest(
			JSON.parse(readFileSync(join(directory, 'next-proof.json'), 'utf8'))
		)
		if (!sameRelease(manifest, proof))
			throw new Error('Next did not verify these exact image digests.')
	}
	if (!env.GITHUB_OUTPUT) throw new Error('GitHub output channel is missing.')
	appendFileSync(env.GITHUB_OUTPUT, `manifest=${JSON.stringify(manifest)}\n`)
	console.info(
		`Verified immutable release ${manifest.sha.slice(0, 12)} from run ${manifest.runId}; no image rebuild.`
	)
} finally {
	rmSync(directory, { recursive: true, force: true })
}
