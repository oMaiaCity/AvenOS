import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), '')))
		process.env[key] ??= value
	return { plugins: [sveltekit()] }
})
