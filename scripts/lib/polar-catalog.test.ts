import { describe, expect, test } from 'bun:test'
import { ensurePolarCatalog } from './polar-catalog.js'

describe('Polar product manifest bootstrap', () => {
	test('applies every manifest product before its benefits', async () => {
		const calls: Array<[string, unknown?]> = []
		const result = await ensurePolarCatalog(
			{
				accessToken: 'unused-in-injected-test',
				organizationId: 'org-test',
				server: 'sandbox',
				publicBaseUrl: 'https://portal.next.aven.ceo',
				webhookSecret: 'unused-in-injected-test'
			},
			{
				async ensureProducts(seeds) {
					calls.push(['products', seeds])
					return Object.fromEntries(seeds.map((seed) => [seed.tier, `product-${seed.tier}`]))
				},
				async ensureBenefits() {
					calls.push(['benefits'])
					return { 'aven-name': 1, 'aven-ceo': 3 }
				}
			}
		)

		const seeds = calls[0]?.[1]
		expect(Array.isArray(seeds)).toBe(true)
		if (!Array.isArray(seeds)) throw new Error('expected product seeds')
		expect(seeds.map((seed) => seed.tier)).toEqual(['aven-name', 'aven-ceo'])
		expect(seeds[0]?.interval).toBeNull()
		expect(seeds[1]?.interval).toBe('week')
		expect(calls[1]?.[0]).toBe('benefits')
		expect(result).toEqual({
			products: { 'aven-name': 'product-aven-name', 'aven-ceo': 'product-aven-ceo' },
			benefits: { 'aven-name': 1, 'aven-ceo': 3 }
		})
	})
})
