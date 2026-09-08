import { expect, test } from 'bun:test'

interface Step {
	if?: string
	run?: string
	uses?: string
	'continue-on-error'?: boolean
}
interface Job {
	uses?: string
	needs?: string | string[]
	with?: Record<string, string>
	secrets?: Record<string, string>
	steps: Step[]
	environment?: string
	if?: string
	'continue-on-error'?: boolean
}
interface Workflow {
	permissions: Record<string, string>
	on: { workflow_call: { secrets: Record<string, unknown> } }
	jobs: Record<string, Job>
}
const workflow = async (name: string) =>
	Bun.YAML.parse(
		await Bun.file(new URL(`../../.github/workflows/${name}.yml`, import.meta.url)).text()
	) as Workflow

test('CI and release require the same full verification without deployment credentials', async () => {
	for (const name of ['platform-ci', 'platform-release']) {
		const caller = await workflow(name)
		expect(caller.jobs.verify.uses).toBe('./.github/workflows/platform-verification.yml')
		expect(Object.keys(caller.jobs.verify.secrets ?? {})).toEqual(['PACKAGE_READ_TOKEN'])
	}
	const ci = await workflow('platform-ci')
	expect(ci.jobs.gate.needs).toBe('verify')
	expect(ci.jobs.gate.if).toBe('always()')
	expect(ci.jobs.gate.steps[0].run).toBe('test "$RESULT" = success')
	const release = await workflow('platform-release')
	expect(release.jobs.publish.needs).toEqual(['build', 'verify'])
	expect(release.jobs.publish.if).toBeUndefined()
	expect(release.jobs.verify.needs).toBe('build')
	expect(release.jobs.verify.with?.manifest).toBe(`\${{ needs.build.outputs.manifest }}`)
	expect(release.jobs.build.if).toBe(
		"github.ref == 'refs/heads/next' && github.event_name == 'workflow_dispatch'"
	)
	expect(release.jobs.build.environment).toBeUndefined()
	const gate = await workflow('platform-verification')
	expect(gate.permissions).toEqual({ contents: 'read', packages: 'read' })
	expect(Object.keys(gate.on.workflow_call.secrets)).toEqual(['PACKAGE_READ_TOKEN'])
	const commands: string[] = []
	for (const job of Object.values(gate.jobs) as Job[]) {
		expect(job.environment).toBeUndefined()
		expect(job.if).toBeUndefined()
		expect(job['continue-on-error']).toBeUndefined()
		for (const step of job.steps) {
			expect(step['continue-on-error']).toBeUndefined()
			expect(step.if).toBeUndefined()
			if (step.run) commands.push(...step.run.trim().split('\n'))
		}
	}
	for (const required of [
		'bun run check:secrets',
		'bun audit',
		'bun run check:rust-advisories',
		'bun run test:identity',
		'bun run test:api',
		'bun run test:checkout',
		'bun run test:deploy',
		'bun run test:proxy-boundary',
		'bun run test:customer-movement',
		'bun run test:customer-runtime',
		'bun run test:release-archive',
		'bun run test:recovery',
		'xvfb-run --auto-servernum bun run test:e2e:platform'
	])
		expect(commands.filter((c) => c === required)).toHaveLength(1)
	const publication = release.jobs.build.steps
	const scan = publication.findIndex((step: Step) => step.run?.includes('scan-container-os.sh'))
	const manifest = publication.findIndex((step: Step) => step.uses === 'actions/upload-artifact@v4')
	expect(scan).toBeGreaterThan(-1)
	expect(scan).toBeLessThan(manifest)
	expect(publication[scan].run).toContain("jq -r '.images[]' release.json")
})

test('release publication consumes the tested candidate without another build', async () => {
	const release = await workflow('platform-release')
	const steps = release.jobs.publish.steps
	expect(steps.some((step) => step.run?.includes('. == $tested'))).toBe(true)
	for (const step of steps) {
		expect(step.if).toBeUndefined()
		expect(step['continue-on-error']).toBeUndefined()
		expect(step.uses ?? '').not.toContain('build-push')
	}
	const gate = await workflow('platform-verification')
	expect(
		gate.jobs.journey.steps.some((step) => step.run === 'bun scripts/configure-e2e-release.ts')
	).toBe(true)
})
