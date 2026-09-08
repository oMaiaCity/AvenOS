import { chmod, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { RuntimeDirectory } from '../src/customers/runtime-directory.js'

const directories: string[] = []
afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const route = (id: string) => ({
	id,
	artifactStoreBaseUrl: `http://${id}-artifacts:8087`,
	artifactStoreBearerToken: 's'.repeat(40),
	targets: [
		{
			segment: 'intents',
			baseUrl: `http://${id}-intents:3010`,
			targetPrefix: '/api/intents',
			bearerToken: 's'.repeat(40),
			componentRef: 'ceo.aven:component:data:intents@1',
			readAction: 'intents:read',
			writeAction: 'intents:write',
			roles: ['user', 'admin']
		}
	]
})

test('atomic publication adds a runtime without restarting; invalid current routes fail closed', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-routes-'))
	directories.push(directory)
	const path = join(directory, 'routes.json')
	const registry = new RuntimeDirectory({
		CUSTOMER_RUNTIMES_FILE: path,
		CUSTOMER_RUNTIMES_JSON: []
	})
	await expect(registry.read()).rejects.toMatchObject({ status: 503 })
	await writeFile(path, JSON.stringify([route('primary')]), { mode: 0o600 })
	expect((await registry.read()).map((r) => r.id)).toEqual(['primary'])
	await writeFile(`${path}.next`, JSON.stringify([route('primary'), route('green')]), {
		mode: 0o600
	})
	await rename(`${path}.next`, path)
	expect((await registry.read()).map((r) => r.id)).toEqual(['primary', 'green'])
	for (const contents of [
		'{',
		JSON.stringify([route('primary'), route('primary')]),
		'x'.repeat(262145)
	]) {
		await writeFile(path, contents)
		await expect(registry.read()).rejects.toMatchObject({ status: 503 })
	}
	await writeFile(path, JSON.stringify([route('green')]))
	expect((await registry.read()).map((r) => r.id)).toEqual(['green'])
	await chmod(path, 0o666)
	await expect(registry.read()).rejects.toMatchObject({ status: 503 })
	await chmod(path, 0o600)
	await rename(path, `${path}.target`)
	await symlink(`${path}.target`, path)
	await expect(registry.read()).rejects.toMatchObject({ status: 503 })
})
