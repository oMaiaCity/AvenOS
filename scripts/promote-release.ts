#!/usr/bin/env bun
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
			throw new Error(`${args[0]} failed; the existing promotion PR remains available for retry.`)
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
const head = JSON.parse(await run(['gh', 'api', `repos/${repository}/git/ref/heads/${from}`]))
	.object.sha
if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Invalid release candidate.')
const existing = JSON.parse(
	await run([
		'gh',
		'pr',
		'list',
		'--repo',
		repository,
		'--base',
		to,
		'--head',
		from,
		'--state',
		'open',
		'--json',
		'number'
	])
)
const pr =
	existing[0]?.number ??
	Number(
		new URL(
			await run([
				'gh',
				'pr',
				'create',
				'--repo',
				repository,
				'--base',
				to,
				'--head',
				from,
				'--title',
				`Promote ${from} to ${to}`,
				'--body',
				`Operator-requested release promotion. Candidate: ${head}. Required checks and resolved review threads must pass; no branch-rule bypass is used.`
			])
		).pathname
			.split('/')
			.at(-1)
	)
console.info(
	`Review https://github.com/${repository}/pull/${pr}. Wait for its mandatory checks before merging.`
)
// Merge is intentionally a separate explicit operator action after reviewing the PR.
// The installer can resume after promotion; it does not silently approve its own code.
console.info(
	`After reviewing, merge with: gh pr merge ${pr} --repo ${repository} --merge --match-head-commit ${head}`
)
