import { describe, expect, test } from 'vitest'
import { catalogDigest, loadCatalog } from '../src/catalog.js'

describe('static customer component catalog', () => {
	test('pins migrations and least-privilege function roles', async () => {
		const catalog = await loadCatalog()
		expect(catalogDigest(catalog)).toMatch(/^[0-9a-f]{64}$/)
		expect([...catalog.keys()].sort()).toEqual([
			'ceo.aven:component:data:artifacts@1',
			'ceo.aven:component:data:intents@1',
			'os.aven:component:actors:run-repository@1'
		])
		const actors = catalog.get('os.aven:component:actors:run-repository@1')
		expect(actors?.grants['os.aven:db-role:actors:api@1']?.tables).toEqual([
			{ name: 'runs', privileges: ['SELECT', 'INSERT', 'UPDATE'] }
		])
		expect(actors?.grants['os.aven:db-role:actors:worker@1']?.tables).toEqual([
			{ name: 'runs', privileges: ['SELECT', 'UPDATE'] }
		])
	})
})
