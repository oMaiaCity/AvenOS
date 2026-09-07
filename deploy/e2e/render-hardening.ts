import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Exercise production isolation in E2E without duplicating a drifting policy table.
const keys = [
	'init',
	'read_only',
	'cap_drop',
	'cap_add',
	'pids_limit',
	'mem_limit',
	'cpus',
	'ulimits',
	'tmpfs',
	'security_opt'
]
const root = resolve(import.meta.dir, '../..')
const composition = (name: string) =>
	(
		Bun.YAML.parse(readFileSync(resolve(root, `deploy/${name}/docker-compose.yml`), 'utf8')) as {
			services: Record<string, Record<string, unknown>>
		}
	).services
const identity = composition('identity')
const platform = composition('platform')
const e2e = composition('e2e')
const services: Record<string, Record<string, unknown>> = {}
for (const name of Object.keys(e2e)) {
	const source =
		name === 'identity'
			? identity.identity
			: name.startsWith('identity-')
				? identity[name.slice('identity-'.length)]
				: name.startsWith('platform-database')
					? platform[name.slice('platform-'.length)]
					: platform[name]
	if (source) {
		services[name] = Object.fromEntries(
			keys.filter((key) => key in source).map((key) => [key, source[key]])
		)
		if (name === 'identity-database' || name === 'platform-database')
			services[name].command = source.command
	}
}
if (!process.argv[2]) throw new Error('Output file is required')
writeFileSync(process.argv[2], JSON.stringify({ services }), { mode: 0o600 })
