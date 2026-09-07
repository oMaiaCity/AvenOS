#!/usr/bin/env bun
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const androidProject = path.join(repoRoot, 'app/src-tauri/gen/android')

function fail(message: string): never {
	console.error(`[android] ${message}`)
	process.exit(1)
}

function resolveJavaHome(): string {
	const candidates = [
		process.env.JAVA_HOME,
		'/usr/lib/jvm/java-17-openjdk-amd64',
		'/opt/android-studio/jbr',
		'/usr/local/android-studio/jbr'
	].filter((candidate): candidate is string => Boolean(candidate))
	const javaHome = candidates.find((candidate) => existsSync(path.join(candidate, 'bin/javac')))
	return (
		javaHome ??
		fail('A full JDK is required. Install JDK 17 or set JAVA_HOME to one with bin/javac.')
	)
}

function resolveAndroidSdk(): string {
	const candidates = [
		process.env.ANDROID_HOME,
		process.env.ANDROID_SDK_ROOT,
		process.env.HOME ? path.join(process.env.HOME, 'Android/Sdk') : undefined
	].filter((candidate): candidate is string => Boolean(candidate))
	const sdk = candidates.find((candidate) => existsSync(path.join(candidate, 'platform-tools')))
	return sdk ?? fail('Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT.')
}

function resolveNdkHome(sdk: string): string {
	if (process.env.NDK_HOME && existsSync(process.env.NDK_HOME)) return process.env.NDK_HOME
	const ndkRoot = path.join(sdk, 'ndk')
	if (!existsSync(ndkRoot))
		fail('Android NDK not found. Install it with Android Studio SDK Manager.')
	const versions = readdirSync(ndkRoot)
		.filter((entry) => existsSync(path.join(ndkRoot, entry, 'source.properties')))
		.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
	return versions[0]
		? path.join(ndkRoot, versions[0])
		: fail('Android NDK has no installed versions.')
}

function resolveRustBin(): string {
	const configuredCargo = process.env.CARGO
	if (configuredCargo && existsSync(configuredCargo)) return path.dirname(configuredCargo)
	const rustupRoot =
		process.env.RUSTUP_HOME ?? (process.env.HOME ? path.join(process.env.HOME, '.rustup') : '')
	const toolchainsRoot = path.join(rustupRoot, 'toolchains')
	if (!existsSync(toolchainsRoot)) fail('Rust toolchains not found. Install Rust 1.93 or newer.')
	const toolchains = readdirSync(toolchainsRoot)
		.filter((entry) => /^\d+(?:\.\d+)+-/.test(entry))
		.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
	const bin = toolchains
		.map((toolchain) => path.join(toolchainsRoot, toolchain, 'bin'))
		.find(
			(candidate) =>
				existsSync(path.join(candidate, 'cargo')) && existsSync(path.join(candidate, 'rustc'))
		)
	return bin ?? fail('No complete numeric Rust toolchain found. Install Rust 1.93 or newer.')
}

function artifacts(root: string, extension: string): string[] {
	if (!existsSync(root)) return []
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(root, entry.name)
		return entry.isDirectory()
			? artifacts(entryPath, extension)
			: entryPath.endsWith(extension)
				? [entryPath]
				: []
	})
}

function clearDesktopOnnxruntimeAssets(): void {
	const directory = path.join(androidProject, 'app/src/main/assets/onnxruntime')
	if (!existsSync(directory)) return
	for (const entry of readdirSync(directory)) {
		if (entry === '.gitignore' || entry === 'README.md') continue
		rmSync(path.join(directory, entry), { recursive: true, force: true })
	}
}

if (!existsSync(androidProject)) {
	fail('Android project is missing. Run `CI=true bun --cwd app x tauri android init --ci`.')
}

const mode = process.argv.includes('--dev') ? 'dev' : 'build'
const release = process.argv.includes('--release')
const bundle = process.argv.includes('--aab') ? 'aab' : 'apk'
const targetArgument = process.argv.find((argument) => argument.startsWith('--target='))
const target = targetArgument?.slice('--target='.length) || 'aarch64'
const sdk = resolveAndroidSdk()
const rustBin = resolveRustBin()
const env = {
	...process.env,
	PATH: `${rustBin}:${process.env.PATH ?? ''}`,
	CARGO: path.join(rustBin, 'cargo'),
	RUSTC: path.join(rustBin, 'rustc'),
	JAVA_HOME: resolveJavaHome(),
	ANDROID_HOME: sdk,
	ANDROID_SDK_ROOT: sdk,
	NDK_HOME: resolveNdkHome(sdk)
}

// Android links ONNX Runtime into the Rust library. Tauri does not prune assets
// copied by older configurations, so remove only stale desktop runtime copies.
clearDesktopOnnxruntimeAssets()

if (mode === 'dev') {
	const command = ['bun', '--bun', 'x', 'tauri', 'android', 'dev']
	const device = process.env.ANDROID_DEVICE?.trim()
	if (device) command.push(device)
	command.push('--target', target)
	const child = Bun.spawn(command, {
		cwd: path.join(repoRoot, 'app'),
		env,
		stdout: 'inherit',
		stderr: 'inherit',
		stdin: 'inherit'
	})
	process.exit(await child.exited)
}

if (release && !existsSync(path.join(androidProject, 'keystore.properties'))) {
	console.warn('[android] No keystore.properties found; the release artifact will be unsigned.')
}

const outputRoot = path.join(androidProject, 'app/build/outputs')
rmSync(outputRoot, { recursive: true, force: true })

const command = [
	'bun',
	'--bun',
	'x',
	'tauri',
	'android',
	'build',
	`--${bundle}`,
	'--target',
	target
]
if (!release) command.push('--debug')

console.log(
	`[android] Building ${release ? 'release' : 'debug'} ${bundle.toUpperCase()} for ${target}.`
)
const child = Bun.spawn(command, {
	cwd: path.join(repoRoot, 'app'),
	env,
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit'
})
const exitCode = await child.exited
if (exitCode !== 0) process.exit(exitCode)

const extension = `.${bundle}`
const candidates = artifacts(outputRoot, extension).sort(
	(left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs
)
const artifact =
	candidates[0] ?? fail(`Build succeeded but no ${extension} was found under ${outputRoot}.`)
const appPackage = (await Bun.file(path.join(repoRoot, 'app/package.json')).json()) as {
	version: string
}
const destinationDirectory = path.join(repoRoot, 'dist/android')
mkdirSync(destinationDirectory, { recursive: true })
const signing = release ? 'release' : 'debug'
const destination = path.join(
	destinationDirectory,
	`avenOS-${appPackage.version}-${signing}-${target}.${bundle}`
)
copyFileSync(artifact, destination)
console.log(`[android] Artifact: ${destination}`)
