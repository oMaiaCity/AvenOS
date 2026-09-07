import { expect, test } from '@playwright/test'

// Guard Samuel's 02c25272/cca2fff0 restoration using the actual built services,
// not copied fixture markup. The old collapsed rail passed all type checks.
test('portal and identity keep the shared flow-card layout on mobile and desktop', async ({
	page
}) => {
	for (const width of [375, 768, 1280]) {
		await page.setViewportSize({ width, height: 900 })
		for (const [origin, path] of [
			[process.env.E2E_CHECKOUT_BROWSER_ORIGIN, '/secure?name=layout-proof'],
			[process.env.E2E_CHECKOUT_BROWSER_ORIGIN, '/purchase/success?name=layout-proof'],
			[process.env.E2E_IDENTITY_BROWSER_ORIGIN, '/login']
		]) {
			if (!origin) throw new Error('Run through the local platform E2E harness.')
			await page.goto(`${origin}${path}`)
			const card = page.locator('.flow-card')
			await expect(card).toBeVisible()
			const box = await card.boundingBox()
			if (!box) throw new Error('The flow card has no visible bounds.')
			expect(box.width).toBeGreaterThan(260)
			expect(box.width).toBeLessThanOrEqual(512)
			if (width >= 768) expect(box.width).toBe(512)
			expect(box.x).toBeGreaterThanOrEqual(0)
			expect(box.x + box.width).toBeLessThanOrEqual(width)
			await expect(card.locator('.flow-card-crest')).toHaveCSS('width', '64px')
			expect(
				await card.locator('h1').evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
			).toBeGreaterThanOrEqual(28)
			await expect(page.locator('.site-footer-inner')).toHaveCSS('display', 'flex')
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
			for (const step of await card.locator('.step').all()) {
				expect((await step.boundingBox())?.width).toBeGreaterThan(20)
			}
			for (const input of await card.locator('input:visible').all()) {
				expect((await input.boundingBox())?.width).toBeGreaterThan(150)
			}
			await page.screenshot({
				path: test
					.info()
					.outputPath(
						`${new URL(origin).port}-${path.split('?')[0].replaceAll('/', '-')}-${width}.png`
					),
				fullPage: true
			})
		}
	}
})
