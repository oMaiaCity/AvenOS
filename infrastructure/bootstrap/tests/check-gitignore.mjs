import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const artifacts = [
	'avenos-bootstrap-record/unexpected-file',
	'local/bootstrap-input.json',
	'local/bootstrap-input.json.0123456789ab.next',
	'local/bootstrap.generated.json',
	'local/bootstrap.generated.json.0123456789ab.next',
	'local/credentials.csv',
	'local/credentials.csv.0123456789ab.next',
	'local/avenos-recovery.csv',
	'local/bootstrap-apply.log',
	'local/initial-rollout.log',
	'local/uninstall.log',
	'local/bootstrap-state-identity.json',
	'local/bootstrap.next.remote',
	'local/pulumi-state/stacks/aven-bootstrap.json',
	'local/uninstall-pulumi-state/stacks/aven-bootstrap.json',
	'local/uninstall-platform-next.json',
	'local/uninstall-bootstrap-next.json'
]
const result = spawnSync('git', ['check-ignore', '--no-index', ...artifacts], {
	cwd: repositoryRoot,
	encoding: 'utf8'
})
assert.equal(result.status, 0, result.stderr || result.error?.message)
const ignored = result.stdout.trim().split('\n')

assert.deepEqual(ignored, artifacts)
process.stdout.write(`Git ignores all ${artifacts.length} deployment bootstrap artifact shapes.\n`)
