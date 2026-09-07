import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: '.',
	testMatch: 'platform.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 180_000,
	expect: { timeout: 15_000 },
	reporter: [['line']],
	use: {
		headless: true,
		trace: 'retain-on-failure'
	}
})
