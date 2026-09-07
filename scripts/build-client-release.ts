#!/usr/bin/env bun
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type ClientPlatform, clientAssetNames, clientPlatforms } from './lib/client-release.js'

const root = path.resolve(import.meta.dir, '..')
const platform = process.argv[2] as ClientPlatform
const version = process.env.CLIENT_RELEASE_VERSION ?? ''
const files = clientAssetNames(version)
if (!clientPlatforms.includes(platform))
	throw new Error('Choose linux-x64, macos-arm64, or android-arm64.')
if (
	(platform === 'macos-arm64' && (process.platform !== 'darwin' || process.arch !== 'arm64')) ||
	(platform !== 'macos-arm64' && (process.platform !== 'linux' || process.arch !== 'x64'))
)
	throw new Error('Build on the matching native runner (Android uses a Linux x64 build host).')
const apiOrigin = process.env.AVEN_API_BASE_URL
if (!['https://api.aven.ceo', 'https://api.next.aven.ceo'].includes(apiOrigin ?? ''))
	throw new Error('Select a deployed API origin.')
const androidVersionCode = Number(process.env.CLIENT_ANDROID_VERSION_CODE)
if (
	!Number.isSafeInteger(androidVersionCode) ||
	androidVersionCode < 30_000_001 ||
	androidVersionCode > 2_100_000_000
)
	throw new Error('A monotonic Android version code is required.')
const stage = mkdtempSync(path.join(tmpdir(), 'aven-client-release-'))
const output = path.join(root, 'dist/client-release')
// Never read developer dotenv files or embed a local test configuration.
const env = {
	...process.env,
	AVENOS_CLIENT_RELEASE_BUILD: 'true',
	AVENOS_APP_ENV_FILE: path.join(stage, 'empty.env'),
	AVEN_IDENTITY_BASE_URL: 'https://aven.id',
	AVEN_PASSKEY_ORIGIN: 'https://aven.id',
	AVEN_PASSKEY_RP_ID: 'aven.id',
	PUBLIC_APP_VERSION: version,
	VITE_AVEN_E2E: 'false',
	AVEN_SPEECH_GPU: 'cpu',
	APPIMAGE_EXTRACT_AND_RUN: '1',
	CHOKIDAR_USEPOLLING: 'true'
}
writeFileSync(env.AVENOS_APP_ENV_FILE, '', { mode: 0o600 })
async function run(args: string[], cwd = root) {
	const child = Bun.spawn(args, { cwd, env, stdout: 'inherit', stderr: 'inherit', stdin: 'ignore' })
	if (await child.exited) throw new Error(`${args[0]} failed while building ${platform}.`)
}
function find(directory: string, extension: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const name = path.join(directory, entry.name)
		return entry.isDirectory()
			? find(name, extension)
			: entry.isFile() && name.endsWith(extension)
				? [name]
				: []
	})
}
try {
	const config = path.join(stage, 'tauri.release.json')
	writeFileSync(
		config,
		JSON.stringify({
			version,
			bundle: {
				...(platform !== 'linux-x64' ? { resources: null } : {}),
				android: { versionCode: androidVersionCode },
				macOS: {
					signingIdentity: '-',
					// Keep Mac bundle metadata in dotted-version form, not Android's integer namespace.
					bundleVersion:
						platform === 'macos-arm64' ? version.split('-')[0] : String(androidVersionCode)
				}
			}
		}),
		{ mode: 0o600 }
	)
	if (platform === 'linux-x64') await run(['bun', 'scripts/fetch-onnxruntime.ts'])
	const app = path.join(root, 'app')
	const target = platform === 'linux-x64' ? 'x86_64-unknown-linux-gnu' : 'aarch64-apple-darwin'
	// A fresh output tree prevents a successful build from collecting stale installers.
	const buildOutput =
		platform === 'android-arm64'
			? path.join(app, 'src-tauri/gen/android/app/build/outputs')
			: path.resolve(root, 'target/rust', target, 'release/bundle')
	// All targets are fixed build-output paths; no user-supplied directory is deleted.
	if (platform === 'android-arm64') rmSync(buildOutput, { recursive: true, force: true })
	else if (!process.env.CARGO_TARGET_DIR) rmSync(buildOutput, { recursive: true, force: true })
	else throw new Error('Unset CARGO_TARGET_DIR for a reproducible release output path.')
	if (platform === 'android-arm64') {
		await run(
			[
				'bun',
				'--bun',
				'x',
				'tauri',
				'android',
				'build',
				'--ci',
				'--debug',
				'--apk',
				'--target',
				'aarch64',
				'--config',
				config,
				'--',
				'--locked'
			],
			app
		)
	} else {
		await run(
			[
				'bun',
				'--bun',
				'x',
				'tauri',
				'build',
				'--ci',
				'--target',
				target,
				'--bundles',
				platform === 'linux-x64' ? 'deb,appimage' : 'dmg',
				'--config',
				config,
				'--',
				'--locked'
			],
			app
		)
	}
	mkdirSync(output, { recursive: true })
	const selected =
		platform === 'linux-x64' ? files.slice(0, 2) : [files[platform === 'macos-arm64' ? 2 : 3]]
	for (const filename of selected) {
		const candidates = find(buildOutput, path.extname(filename))
		if (candidates.length !== 1)
			throw new Error(
				`Expected one fresh ${path.extname(filename)} installer; got ${candidates.length}.`
			)
		copyFileSync(candidates[0], path.join(output, filename))
	}
} finally {
	rmSync(stage, { recursive: true, force: true })
}
