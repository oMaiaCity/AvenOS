import { describe, expect, it } from 'vitest'
import { designerPages } from '../src/lib/app-runtime/designer-scenarios.js'
import { appRuntime } from '../src/lib/app-runtime/runtime.designer.js'
import { serverBuildRuntime } from '../src/lib/server/build-runtime/runtime.designer.js'

describe('designer build fixtures', () => {
	it('links to every UI route and gives every visible state a stable URL', () => {
		expect(designerPages.map(({ path }) => path)).toEqual([
			'/',
			'/secure',
			'/purchase/checkout',
			'/purchase/fake-checkout',
			'/purchase/success',
			'/purchase/expired'
		])
		for (const page of designerPages) {
			expect(page.scenarios.length).toBeGreaterThan(0)
			expect(new Set(page.scenarios.map(({ id }) => id)).size).toBe(page.scenarios.length)
			for (const state of page.scenarios) {
				const url = new URL(state.href, 'https://designer.aven.invalid')
				expect(url.pathname).toBe(page.path)
				expect(url.searchParams.get('scenario')).toBe(state.id)
			}
		}
	})

	it('serves typed application operations without a backend', async () => {
		await expect(appRuntime.names.check('aurora')).resolves.toMatchObject({
			name: 'aurora',
			available: true,
			priceEur: 25
		})
		await expect(appRuntime.names.hold('aurora', 'alex@example.com')).resolves.toMatchObject({
			name: 'aurora',
			priceEur: 25
		})
		await expect(appRuntime.meta()).resolves.toMatchObject({
			downloadUrl: ''
		})
	})

	it('selects checkout provider fixtures from the route scenario', async () => {
		const fake = await serverBuildRuntime.loadCheckout({
			url: new URL('https://designer.aven.invalid/purchase/checkout?scenario=fake-ready')
		} as never)
		const polar = await serverBuildRuntime.loadCheckout({
			url: new URL('https://designer.aven.invalid/purchase/checkout?scenario=polar-confirming')
		} as never)
		expect(fake).toMatchObject({ name: 'aurora', provider: 'fake', priceEur: 25 })
		expect(polar).toMatchObject({ name: 'aurora', provider: 'polar', priceEur: 25 })
	})
})
