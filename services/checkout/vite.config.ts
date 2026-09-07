import { fileURLToPath } from 'node:url'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	// Server-side code reads configuration from process.env everywhere (dev,
	// production, scripts, tests), so surface .env files there during dev too.
	for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), '')))
		process.env[key] ??= value
	const variant = 'production'
	const variantModules = new Map([
		[
			'virtual:aven-app-runtime',
			fileURLToPath(new URL(`./src/lib/app-runtime/runtime.${variant}.ts`, import.meta.url))
		],
		[
			'virtual:aven-build-chrome',
			fileURLToPath(new URL(`./src/lib/app-runtime/Chrome.${variant}.svelte`, import.meta.url))
		],
		[
			'virtual:aven-server-build-runtime',
			fileURLToPath(
				new URL(`./src/lib/server/build-runtime/runtime.${variant}.ts`, import.meta.url)
			)
		]
	])
	return {
		plugins: [
			{
				name: 'aven-build-variant',
				enforce: 'pre',
				resolveId(id) {
					return variantModules.get(id)
				}
			},
			sveltekit()
		]
	}
})
