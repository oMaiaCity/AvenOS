import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: '.',
	testMatch: 'polar-sandbox.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 300_000,
	expect: { timeout: 20_000 },
	reporter: [['line']],
	use: {
		headless: true,
		trace: 'retain-on-failure'
	}
})
