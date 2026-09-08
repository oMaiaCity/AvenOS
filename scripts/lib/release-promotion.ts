export type PromotionTarget = 'next' | 'prod'
export type Run = (args: string[]) => Promise<string>

const sha = (value: unknown): string => {
	if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value))
		throw new Error('Invalid release commit identity.')
	return value
}

export async function preparePromotion(run: Run, repository: string, to: PromotionTarget) {
	if (to !== 'next' && to !== 'prod') throw new Error('Unsupported promotion target.')
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
		throw new Error('Invalid promotion repository.')
	const from = to === 'next' ? 'main' : 'next'
	const api = `repos/${repository}`
	const json = async (args: string[]) => JSON.parse(await run(['gh', ...args]))
	const sourceSha = sha((await json(['api', `${api}/git/ref/heads/${from}`])).object.sha)
	const targetSha = sha((await json(['api', `${api}/git/ref/heads/${to}`])).object.sha)
	const sourceTree = sha((await json(['api', `${api}/git/commits/${sourceSha}`])).tree.sha)
	const targetTree = sha((await json(['api', `${api}/git/commits/${targetSha}`])).tree.sha)
	const contains = async (ancestor: string, descendant: string) => {
		const result = await json(['api', `${api}/compare/${ancestor}...${descendant}`])
		return result.status === 'ahead' || result.status === 'identical'
	}
	if (sourceTree === targetTree && (await contains(sourceSha, targetSha)))
		return { from, to, sourceSha, targetSha, alreadyPromoted: true as const }

	// Release branches accumulate merge ancestry that main intentionally does not.
	// Prepare off the exact target without checking out or rewriting the operator's branch.
	const branch = `codex/promote-${to}-${sourceSha.slice(0, 12)}-${targetSha.slice(0, 12)}`
	const reference = `refs/heads/${branch}`
	const matches = await json(['api', `${api}/git/matching-refs/heads/${branch}`])
	if (!Array.isArray(matches)) throw new Error('Invalid promotion branch inventory.')
	if (!matches.some((entry: { ref: string }) => entry.ref === reference))
		await run([
			'gh',
			'api',
			'--method',
			'POST',
			`${api}/git/refs`,
			'-f',
			`ref=${reference}`,
			'-f',
			`sha=${targetSha}`
		])
	await run([
		'gh',
		'api',
		'--method',
		'POST',
		`${api}/merges`,
		'-f',
		`base=${branch}`,
		'-f',
		`head=${sourceSha}`,
		'-f',
		`commit_message=chore(release): prepare ${from} to ${to} promotion`
	])
	const candidateSha = sha((await json(['api', `${api}/git/ref/heads/${branch}`])).object.sha)
	const candidateTree = sha((await json(['api', `${api}/git/commits/${candidateSha}`])).tree.sha)
	if (
		candidateTree !== sourceTree ||
		!(await contains(sourceSha, candidateSha)) ||
		!(await contains(targetSha, candidateSha))
	)
		throw new Error(
			'Promotion does not exactly match the selected source and target ancestry. Reconcile release-only changes into the source before retrying; no promotion PR was opened.'
		)
	const existing = await json([
		'pr',
		'list',
		'--repo',
		repository,
		'--base',
		to,
		'--head',
		branch,
		'--state',
		'open',
		'--json',
		'number'
	])
	if (!Array.isArray(existing)) throw new Error('Invalid promotion PR inventory.')
	let pr = existing[0]?.number as number | undefined
	if (!pr) {
		const url = await run([
			'gh',
			'pr',
			'create',
			'--repo',
			repository,
			'--base',
			to,
			'--head',
			branch,
			'--title',
			`Promote ${from} to ${to}`,
			'--body',
			`Operator-requested promotion of ${from} commit ${sourceSha}, prepared against ${to} commit ${targetSha}. The candidate retains both ancestries and exactly matches the selected source tree. Required checks and resolved review threads must pass; no branch-rule bypass is used.`
		])
		pr = Number(new URL(url).pathname.split('/').at(-1))
	}
	if (typeof pr !== 'number' || !Number.isSafeInteger(pr) || pr <= 0)
		throw new Error('Invalid promotion PR identity.')
	return {
		from,
		to,
		sourceSha,
		targetSha,
		candidateSha,
		branch,
		pr,
		alreadyPromoted: false as const
	}
}
