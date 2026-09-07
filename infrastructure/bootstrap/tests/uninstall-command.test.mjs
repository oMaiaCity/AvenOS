import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test('validates and prints an exact uninstall plan without contacting providers', () => {
	const output = mkdtempSync(join(tmpdir(), 'avenos-uninstall-dry-run-'))
	const inputPath = join(output, 'bootstrap-input.json')
	writeFileSync(
		inputPath,
		JSON.stringify({
			deploymentTargets: ['identity'],
			repository: 'MyAvenCEO/avenOS',
			githubPackagesReadToken: 'packages-token',
			objectStorage: {
				region: 'hel1',
				targets: {
					identity: {
						projectId: '12345',
						bootstrapCredential: { accessKeyId: 'bootstrap', secretAccessKey: 'secret' },
						deploymentCredential: { accessKeyId: 'deployment', secretAccessKey: 'secret' },
						observerCredential: { accessKeyId: 'observer', secretAccessKey: 'secret' }
					}
				}
			},
			defaults: {
				hetznerLocation: 'hel1',
				hetznerServerType: 'cpx32',
				hetznerOsImage: 'ubuntu-24.04',
				identityVolumeSizeGb: 40,
				sshAllowedCidrs: '192.0.2.1/32',
				acmeEmail: 'ops@example.test'
			},
			providers: {
				identity: { computeToken: 'compute-token', dnsApiKey: 'prefix.secret' }
			}
		}),
		{ mode: 0o600 }
	)
	writeFileSync(
		join(output, 'bootstrap.generated.json'),
		JSON.stringify({
			deploymentPrefix: 'avenos-0123456789',
			completedTargets: ['identity'],
			targets: Object.fromEntries(
				['identity', 'next', 'production'].map((target) => [
					target,
					{
						bootstrapPulumiPassphrase: `${target}-bootstrap-passphrase`,
						pulumiPassphrase: `${target}-platform-passphrase`,
						resticPassword: `${target}-restic-password`
					}
				])
			)
		}),
		{ mode: 0o600 }
	)
	const result = spawnSync(
		'bun',
		[
			resolve(root, 'scripts/deployment-uninstall.ts'),
			'--input',
			inputPath,
			'--output',
			output,
			'--dry-run'
		],
		{ cwd: root, encoding: 'utf8' }
	)
	assert.equal(result.status, 0, result.stderr)
	assert.match(result.stdout, /Generation avenos-0123456789 will be removed/)
	assert.match(result.stdout, /GitHub Environments avenos-0123456789-identity/)
	assert.match(result.stdout, /backup and Pulumi state buckets, last/)
	const unconfirmed = spawnSync(
		'bun',
		[resolve(root, 'scripts/deployment-uninstall.ts'), '--input', inputPath, '--output', output],
		{ cwd: root, encoding: 'utf8' }
	)
	assert.notEqual(unconfirmed.status, 0)
	assert.match(unconfirmed.stderr, /Refusing provider changes without --confirmed-generation/)
})
