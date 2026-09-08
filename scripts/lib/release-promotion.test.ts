import { expect, test } from 'bun:test'
import { type PromotionTarget, preparePromotion, type Run } from './release-promotion.js'

const source = '1'.repeat(40)
const target = '2'.repeat(40)
const candidate = '3'.repeat(40)
const sourceTree = 'a'.repeat(40)
const previousTree = 'b'.repeat(40)

function fixture(
	options: {
		to?: PromotionTarget
		existing?: boolean
		mismatch?: boolean
		missingParent?: boolean
		already?: boolean
		sameTree?: boolean
		conflict?: boolean
	} = {}
) {
	const to = options.to ?? 'next'
	const from = to === 'next' ? 'main' : 'next'
	const branch = `codex/promote-${to}-${source.slice(0, 12)}-${target.slice(0, 12)}`
	const calls: string[][] = []
	const run: Run = async (args) => {
		calls.push(args)
		const path = args.find((arg) => arg.startsWith('repos/')) ?? ''
		let value: unknown
		if (args[1] === 'api') {
			if (path.endsWith(`/git/ref/heads/${from}`)) value = { object: { sha: source } }
			else if (path.endsWith(`/git/ref/heads/${to}`)) value = { object: { sha: target } }
			else if (path.endsWith(`/git/ref/heads/${branch}`)) value = { object: { sha: candidate } }
			else if (path.endsWith(`/git/commits/${source}`)) value = { tree: { sha: sourceTree } }
			else if (path.endsWith(`/git/commits/${target}`))
				value = { tree: { sha: options.already || options.sameTree ? sourceTree : previousTree } }
			else if (path.endsWith(`/git/commits/${candidate}`))
				value = { tree: { sha: options.mismatch ? previousTree : sourceTree } }
			else if (path.includes('/git/matching-refs/'))
				value = options.existing ? [{ ref: `refs/heads/${branch}` }] : []
			else if (path.endsWith('/git/refs')) value = {}
			else if (path.endsWith('/merges')) {
				if (options.conflict) throw new Error('merge conflict')
				return '' // GitHub returns no body when the prepared branch already contains the source.
			} else if (path.endsWith(`/compare/${source}...${target}`))
				value = { status: options.already ? 'ahead' : 'diverged' }
			else if (path.includes('/compare/'))
				value = { status: options.missingParent ? 'diverged' : 'ahead' }
			else throw new Error(`Unexpected API request: ${path}`)
		} else if (args[1] === 'pr' && args[2] === 'list')
			value = options.existing ? [{ number: 42 }] : []
		else if (args[1] === 'pr' && args[2] === 'create')
			return 'https://github.com/example/platform/pull/42'
		else throw new Error('Unexpected command')
		return JSON.stringify(value)
	}
	return { run, calls, branch }
}

for (const to of ['next', 'prod'] as const) {
	test(`${to} promotion retains target ancestry and selects the exact source tree`, async () => {
		const f = fixture({ to })
		const result = await preparePromotion(f.run, 'example/platform', to)
		expect(result).toMatchObject({
			sourceSha: source,
			targetSha: target,
			candidateSha: candidate,
			pr: 42,
			branch: f.branch,
			alreadyPromoted: false
		})
		const creation = f.calls.find((args) => args.includes('repos/example/platform/git/refs'))
		expect(creation).toContain(`sha=${target}`)
		expect(creation).toContain(`ref=refs/heads/${f.branch}`)
		const merge = f.calls.find((args) => args.includes('repos/example/platform/merges'))
		expect(merge).toContain(`base=${f.branch}`)
		expect(merge).toContain(`head=${source}`)
		expect(f.calls.find((args) => args[1] === 'pr' && args[2] === 'create')).toContain(f.branch)
		expect(f.calls.flat()).not.toContain('--force')
		expect(f.calls.flat()).not.toContain('--admin')
	})
}

test('retry reuses the prepared branch and open promotion PR', async () => {
	const f = fixture({ existing: true })
	expect(await preparePromotion(f.run, 'example/platform', 'next')).toMatchObject({ pr: 42 })
	expect(f.calls.some((args) => args.includes('repos/example/platform/git/refs'))).toBe(false)
	expect(f.calls.some((args) => args[1] === 'pr' && args[2] === 'create')).toBe(false)
})

for (const rejection of [{ mismatch: true }, { missingParent: true }, { conflict: true }]) {
	test(`rejects an unreviewable promotion ${JSON.stringify(rejection)}`, async () => {
		const f = fixture(rejection)
		await expect(preparePromotion(f.run, 'example/platform', 'next')).rejects.toThrow()
		expect(f.calls.some((args) => args[1] === 'pr')).toBe(false)
	})
}

test('an already promoted source does not create another branch or PR', async () => {
	const f = fixture({ already: true })
	expect(await preparePromotion(f.run, 'example/platform', 'next')).toMatchObject({
		alreadyPromoted: true,
		sourceSha: source,
		targetSha: target
	})
	expect(f.calls.flat()).not.toContain('POST')
	expect(f.calls.some((args) => args[1] === 'pr')).toBe(false)
})

test('matching content still promotes a source whose ancestry is not retained', async () => {
	const f = fixture({ sameTree: true })
	expect(await preparePromotion(f.run, 'example/platform', 'next')).toMatchObject({
		alreadyPromoted: false,
		candidateSha: candidate
	})
	expect(f.calls.flat()).toContain('POST')
})

test('invalid target and commit identity fail before any branch mutation', async () => {
	const f = fixture()
	await expect(
		preparePromotion(f.run, 'example/platform', 'identity' as PromotionTarget)
	).rejects.toThrow('Unsupported')
	expect(f.calls).toHaveLength(0)
	const invalid: Run = async (args) => {
		if (args.some((arg) => arg.endsWith('/git/ref/heads/main')))
			return JSON.stringify({ object: { sha: 'main' } })
		return f.run(args)
	}
	await expect(preparePromotion(invalid, 'example/platform', 'next')).rejects.toThrow('identity')
	expect(f.calls).toHaveLength(0)
})
