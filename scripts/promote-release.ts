#!/usr/bin/env bun
import { preparePromotion } from './lib/release-promotion.js'

// Deliberately uses the operator's gh login, never a repository-wide bypass key.
// GitHub enforces both administrator update authority and the mandatory PR gate.
const to = process.argv[2]
const from = to === 'next' ? 'main' : to === 'prod' ? 'next' : undefined
if (!from) throw new Error('Usage: bun scripts/promote-release.ts next|prod')
async function run(args: string[]) {
	const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'inherit', stdin: 'inherit' })
	const timer = setTimeout(() => child.kill(), 60_000)
	try {
		const output = await new Response(child.stdout).text()
		if (await child.exited)
			throw new Error(
				`${args[0]} failed; prepared branches and existing PRs are retained for retry.`
			)
		return output.trim()
	} finally {
		clearTimeout(timer)
	}
}
const repository = await run([
	'gh',
	'repo',
	'view',
	'--json',
	'nameWithOwner',
	'--jq',
	'.nameWithOwner'
])
const promotion = await preparePromotion(run, repository, to as 'next' | 'prod')
if (promotion.alreadyPromoted) {
	console.info(
		`${promotion.to} already contains selected ${promotion.from} commit ${promotion.sourceSha} with the same source tree.`
	)
} else {
	console.info(
		`Selected ${promotion.from} commit ${promotion.sourceSha}. Review https://github.com/${repository}/pull/${promotion.pr}. Wait for its mandatory checks before merging.`
	)
	// The operator approves the exact prepared head; branch protections still own the merge.
	console.info(
		`After reviewing, merge with: gh pr merge ${promotion.pr} --repo ${repository} --merge --match-head-commit ${promotion.candidateSha}`
	)
}
