import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { avenUtilities } from '@myavenceo/aven-ceo/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// In a git worktree, `node_modules` is hoisted to the monorepo root (outside
// `repoRoot`), so Vite's default fs allow-list rejects SvelteKit's runtime.
// Resolve where deps actually live so this works from a worktree *or* the main
// checkout without hardcoding paths.
const require = createRequire(import.meta.url)
const workspaceRoot = path.resolve(require.resolve('vite/package.json'), '../../..')

// App release/build version (e.g. "26.6.22-next.4") baked into the bundle so the Profile UI can show
// the FULL version + build suffix — Tauri's getVersion() drops the `-next.N` because Apple's
// CFBundleShortVersionString must be a plain X.Y.Z. In CI the macOS/iOS App-Store step rewrites
// package.json to that stripped X.Y.Z BEFORE this build runs, so those jobs pass the full version via
// PUBLIC_APP_VERSION; fall back to package.json for local dev. board 0061.
const appVersion =
	process.env.PUBLIC_APP_VERSION?.trim() ||
	(require('./package.json') as { version: string }).version

/**
 * The per-developer env file (`AVENOS_APP_ENV_FILE=../.env.samuel`), merged
 * here because `bun --env-file=X x vite` does NOT hand the file to the vite it
 * spawns — only plain environment variables cross that boundary. Vite's own
 * `loadEnv` only reads `.env` / `.env.<mode>` / `.env.local`, so a personal
 * `.env.<name>` was never seen by the dev server. Same rule as below: the
 * process environment wins over the file.
 */
function loadPersonalEnv(): Record<string, string> {
	const file = process.env.AVENOS_APP_ENV_FILE
	if (!file) return {}
	const full = path.resolve(__dirname, file)
	if (!fs.existsSync(full)) return {}
	const out: Record<string, string> = {}
	for (const raw of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
		const line = raw.trim()
		if (line === '' || line.startsWith('#')) continue
		const eq = line.indexOf('=')
		if (eq < 1) continue
		const key = line
			.slice(0, eq)
			.trim()
			.replace(/^export\s+/, '')
		let value = line.slice(eq + 1).trim()
		if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
		out[key] = value
	}
	return out
}

export default defineConfig(({ mode }) => {
	const loaded = { ...loadPersonalEnv(), ...loadEnv(mode, repoRoot, '') }
	for (const key of Object.keys(loaded)) {
		if (process.env[key] === undefined) process.env[key] = loaded[key]
	}

	const host = process.env.TAURI_DEV_HOST
	// dev:app2x runs two Vite servers — separate cache dirs avoid .vite-temp races on restart.
	const devInstance = (process.env.AVENOS_DEV_INSTANCE ?? 'A').toLowerCase()
	const cacheDir = path.join(repoRoot, 'node_modules', `.vite-dev-${devInstance}`)

	const crossOriginIsolationHeaders = {
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Resource-Policy': 'same-origin'
	}

	return {
		// Bake the package.json version (incl. the -next.N build suffix) for the Profile "App version" row.
		define: { __APP_VERSION__: JSON.stringify(appVersion) },
		// App-local env only — repo-root `.env` is Tauri/P2P; loadEnv below still merges it at startup.
		envDir: __dirname,
		envPrefix: ['VITE_', 'PUBLIC_', 'TAURI_ENV_'],
		cacheDir,
		clearScreen: false,
		plugins: [avenUtilities({ content: ['src'] }), sveltekit()],
		preview: {
			headers: crossOriginIsolationHeaders
		},
		server: {
			host: host || '127.0.0.1',
			port: 1420,
			strictPort: true,
			hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
			watch: {
				ignored: [
					'**/src-tauri/**',
					'**/build/**',
					'**/.svelte-kit/**',
					// Relay/Tauri secrets — changing ../.env must not restart Vite (race on shared .vite-temp).
					path.join(repoRoot, '.env'),
					path.join(repoRoot, '.env.*')
				]
			},
			headers: crossOriginIsolationHeaders,
			fs: { allow: [repoRoot, workspaceRoot] }
		}
	}
})
