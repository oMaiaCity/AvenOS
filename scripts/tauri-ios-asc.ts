#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
/**
 * TestFlight-only iOS pipeline: builds a signed App Store `.ipa` for Transporter upload.
 * Does not target the iOS Simulator — validate on physical devices via TestFlight only.
 *
 * Loads `<repo-root>/.env.apple.local`, syncs iOS entitlements template, then runs
 * `tauri ios build --export-method app-store-connect --target aarch64` from app.
 *
 * Signing modes (first match wins):
 * 1. **Manual CI** — `AVEN_IOS_APP_STORE_MOBILEPROVISION`, `APPLE_CERTS_P12`, `APPLE_CERTS_P12_PASSWORD`.
 *    Uses `--archive-only` then `xcodebuild -exportArchive` (Tauri export re-imports a placeholder cert).
 * 2. **Automatic CI** — `APPLE_API_ISSUER` + `APPLE_API_KEY` + `APPLE_API_KEY_PATH` (+ team).
 *
 * Optional env:
 *   AVEN_IOS_CF_BUNDLE_VERSION — CFBundleVersion for this upload (default "13")
 *   AVEN_OUTPUT_IPA — output path (default dist/ios-appstore/avenOS-<version>-build<N>.ipa)
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyAppleEnvLocal } from './apple-env'
import { generateIosIcons, syncIosXcassets } from './generate-app-icons.ts'
import {
	readRustToolchainChannel,
	rustToolchainShellExports,
	rustToolchainShellExportsPbx,
	rustupToolchainEnv
} from './rust-toolchain.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

applyAppleEnvLocal(repoRoot)

const appDir = path.join(repoRoot, 'app')
const tauriDir = path.join(appDir, 'src-tauri')
const genApple = path.join(tauriDir, 'gen/apple')
const AVEN_IOS_COMPILE_ENV = path.join(genApple, '.aven-ios-compile.env')
const entitlementsDest = path.join(genApple, 'aven-os-app_iOS/aven-os-app_iOS.entitlements')
const entitlementsSrc = path.join(tauriDir, 'ios-template/aven-os-app_iOS.entitlements')

const team = process.env.APPLE_DEVELOPMENT_TEAM?.trim()
if (!team) {
	console.error(
		'tauri-ios-asc: set APPLE_DEVELOPMENT_TEAM in .env.apple.local (or shell) — see scripts/apple-env.local.template'
	)
	process.exit(1)
}

if (!existsSync(genApple)) {
	console.error(
		'tauri-ios-asc: missing src-tauri/gen/apple — run from app: CI=true bunx tauri ios init --ci'
	)
	process.exit(1)
}

function readPackageVersion(): string {
	const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')) as {
		version?: string
	}
	return (pkg.version ?? '0.0.0').trim()
}

function mustFile(label: string, filePath: string | undefined): string {
	const p = filePath?.trim()
	if (!p) {
		console.error(`tauri-ios-asc: missing ${label}`)
		process.exit(1)
	}
	if (!existsSync(p)) {
		console.error(`tauri-ios-asc: ${label} not found: ${p}`)
		process.exit(1)
	}
	return p
}

function fileToBase64(filePath: string): string {
	return readFileSync(filePath).toString('base64')
}

function hasAutomaticCiSigning(): boolean {
	return Boolean(
		process.env.APPLE_API_ISSUER?.trim() &&
			process.env.APPLE_API_KEY?.trim() &&
			process.env.APPLE_API_KEY_PATH?.trim() &&
			existsSync(process.env.APPLE_API_KEY_PATH.trim())
	)
}

const BUNDLE_ID = 'ceo.aven.os'
const ARCHIVE_PATH = path.join(genApple, 'build/aven-os-app_iOS.xcarchive')

function readMobileProvisionName(profilePath: string): string {
	const r = spawnSync('security', ['cms', '-D', '-i', profilePath], { encoding: 'utf8' })
	if (r.status !== 0) {
		console.error('tauri-ios-asc: failed to decode mobileprovision')
		process.exit(1)
	}
	const nameMatch = r.stdout.match(/<key>Name<\/key>\s*<string>([^<]+)<\/string>/)
	if (!nameMatch?.[1]) {
		console.error('tauri-ios-asc: could not read profile Name from mobileprovision')
		process.exit(1)
	}
	return nameMatch[1]
}

/**
 * Tauri's `ios build --archive-only` (manual signing) leaves the archived .app UNSIGNED, and
 * `xcodebuild -exportArchive` then signs it from scratch with only what the provisioning
 * profile implies (application-identifier, team-identifier, beta-reports-active,
 * get-task-allow). `aven-os-app_iOS.entitlements` never reaches the binary — no
 * `com.apple.developer.associated-domains` (native passkeys fail with "not associated with
 * domain"), no `aps-environment`, no keychain groups. The macOS pipeline codesigns with
 * `--entitlements` explicitly, which is why Mac worked and iOS did not.
 *
 * Fix: sign the archived .app with the FULL entitlements before export. Export keeps the
 * archive's entitlements (validated against the profile) when re-signing.
 */
function fullEntitlementsPlist(): string {
	const template = readFileSync(entitlementsSrc, 'utf8').replace(
		/\$\(AppIdentifierPrefix\)/g,
		`${team}.`
	)
	const extra = `	<key>application-identifier</key>
	<string>${team}.${BUNDLE_ID}</string>
	<key>com.apple.developer.team-identifier</key>
	<string>${team}</string>
	<key>get-task-allow</key>
	<false/>
</dict>`
	if (!template.includes('</dict>')) {
		console.error(`tauri-ios-asc: ${entitlementsSrc} is not a plist dict`)
		process.exit(1)
	}
	return template.replace(/<\/dict>(?![\s\S]*<\/dict>)/, extra)
}

function signArchivedApp(archivedApp: string, profilePath: string, scratchDir: string): void {
	const entitlements = path.join(scratchDir, 'avenOS.full.entitlements')
	writeFileSync(entitlements, fullEntitlementsPlist(), 'utf8')
	const lint = spawnSync('plutil', ['-lint', entitlements], { stdio: 'inherit' })
	if (lint.status !== 0) {
		console.error('tauri-ios-asc: generated entitlements plist is invalid')
		process.exit(1)
	}
	copyFileSync(profilePath, path.join(archivedApp, 'embedded.mobileprovision'))
	const identity = process.env.AVEN_IOS_CODESIGN_IDENTITY?.trim() || 'Apple Distribution'
	console.log(
		'[tauri-ios-asc] codesign archived app identity=%s entitlements=%s',
		identity,
		entitlements
	)
	const r = spawnSync(
		'codesign',
		[
			'--force',
			'--sign',
			identity,
			'--entitlements',
			entitlements,
			'--timestamp=none',
			archivedApp
		],
		{ stdio: 'inherit' }
	)
	if (r.status !== 0) {
		console.error('tauri-ios-asc: codesign of the archived app failed')
		process.exit(r.status ?? 1)
	}
}

/** Entitlements the shipped iOS binary MUST carry — fail the release if any is missing. */
const REQUIRED_IPA_ENTITLEMENTS = [
	'com.apple.developer.associated-domains',
	'webcredentials:aven.id',
	'aps-environment'
]

function assertIpaEntitlements(ipa: string, scratchDir: string): void {
	const dir = path.join(scratchDir, 'ipa-verify')
	rmSync(dir, { recursive: true, force: true })
	mkdirSync(dir, { recursive: true })
	const unzip = spawnSync('unzip', ['-q', '-o', ipa, '-d', dir], { stdio: 'inherit' })
	if (unzip.status !== 0) {
		console.error('tauri-ios-asc: could not unzip the exported .ipa for verification')
		process.exit(1)
	}
	const app = path.join(dir, 'Payload', 'avenOS.app')
	const dump = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', app], {
		encoding: 'utf8'
	})
	const xml = dump.stdout ?? ''
	const missing = REQUIRED_IPA_ENTITLEMENTS.filter((needle) => !xml.includes(needle))
	if (dump.status !== 0 || missing.length > 0) {
		console.error(
			`tauri-ios-asc: exported .ipa is missing required entitlements: ${missing.join(', ') || '(codesign failed)'}\n${xml}`
		)
		process.exit(1)
	}
	const verify = spawnSync('codesign', ['--verify', '--strict', '--deep', app], {
		stdio: 'inherit'
	})
	if (verify.status !== 0) {
		console.error('tauri-ios-asc: codesign --verify failed on the exported .ipa')
		process.exit(1)
	}
	console.log(
		'[tauri-ios-asc] verified .ipa entitlements: %s',
		REQUIRED_IPA_ENTITLEMENTS.join(', ')
	)
	rmSync(dir, { recursive: true, force: true })
}

function exportArchiveManually(
	profileName: string,
	profilePath: string,
	exportDir: string
): string {
	if (!existsSync(ARCHIVE_PATH)) {
		console.error(`tauri-ios-asc: archive not found: ${ARCHIVE_PATH}`)
		process.exit(1)
	}
	mkdirSync(exportDir, { recursive: true })
	const exportOptions = path.join(exportDir, 'ExportOptions.plist')
	writeFileSync(
		exportOptions,
		`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>teamID</key>
	<string>${team}</string>
	<key>signingStyle</key>
	<string>manual</string>
	<key>signingCertificate</key>
	<string>Apple Distribution</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>${BUNDLE_ID}</key>
		<string>${profileName}</string>
	</dict>
</dict>
</plist>
`,
		'utf8'
	)

	// Apple rejects standalone dylibs in an app bundle (STATE_ERROR.VALIDATION_ERROR:
	// "binary file is not permitted … standalone executables or libraries"). We bundle the
	// on-device AI libs (onnxruntime, sherpa-onnx) as bare `.dylib` for desktop, but they are
	// the macOS binaries — they can't load on iOS anyway (on-device AI on iOS is not yet
	// wired). Strip them from the archived .app BEFORE export so the re-signed .ipa validates.
	const archivedApp = path.join(ARCHIVE_PATH, 'Products', 'Applications', 'avenOS.app')
	if (existsSync(archivedApp)) {
		// onnxruntime is loaded dynamically (`ort` load-dynamic = lazy dlopen) and the bundled
		// copy is the macOS binary — it can't load on iOS, so removing it is safe and the only
		// way past Apple's check.
		rmSync(path.join(archivedApp, 'assets', 'onnxruntime'), { recursive: true, force: true })
		console.log(
			'[tauri-ios-asc] stripped assets/onnxruntime (standalone dylib not permitted on iOS)'
		)
		// Diagnostic only: surface any OTHER stray standalone .dylib (it would also be rejected)
		// WITHOUT deleting — a linked lib must be repackaged as a framework, not silently dropped.
		const left = spawnSync('find', [archivedApp, '-type', 'f', '-name', '*.dylib'], {
			encoding: 'utf8'
		})
		const stray = (left.stdout ?? '').trim()
		if (stray) {
			console.warn(
				`[tauri-ios-asc] WARNING — other standalone .dylib still in bundle (will fail App Store validation):\n${stray}`
			)
		}
	}

	if (!existsSync(archivedApp)) {
		console.error(`tauri-ios-asc: archived app not found: ${archivedApp}`)
		process.exit(1)
	}
	signArchivedApp(archivedApp, profilePath, exportDir)

	console.log('[tauri-ios-asc] xcodebuild -exportArchive profile=%s', profileName)
	const r = spawnSync(
		'xcodebuild',
		[
			'-exportArchive',
			'-archivePath',
			ARCHIVE_PATH,
			'-exportPath',
			exportDir,
			'-exportOptionsPlist',
			exportOptions
		],
		{ stdio: 'inherit' }
	)
	if (r.status !== 0) {
		console.error('tauri-ios-asc: xcodebuild export failed')
		process.exit(r.status ?? 1)
	}
	const ipa = path.join(exportDir, 'avenOS.ipa')
	if (!existsSync(ipa)) {
		console.error('tauri-ios-asc: export finished but avenOS.ipa is missing')
		process.exit(1)
	}
	assertIpaEntitlements(ipa, exportDir)
	return ipa
}

function syncEntitlements() {
	mkdirSync(path.dirname(entitlementsDest), { recursive: true })
	copyFileSync(entitlementsSrc, entitlementsDest)
	console.log(`[tauri-ios-asc] synced entitlements → ${entitlementsDest}`)
}

/** Scale the icon source into ios/ sizes (avoids `tauri icon --ios-color` badge transform). */
async function generateIosIconsFromSource() {
	// iOS applies its own mask and rejects alpha → prefer the full-bleed square source.
	const iosSource = path.join(tauriDir, 'icons/app-icon-source-ios.png')
	const source = existsSync(iosSource)
		? iosSource
		: path.join(tauriDir, 'icons/app-icon-source.png')
	const iosIconsDir = path.join(tauriDir, 'icons/ios')
	if (!existsSync(source)) {
		console.error(
			'tauri-ios-asc: missing icons/app-icon-source.png — run `bun run icons <file.svg|png|jpg>`'
		)
		process.exit(1)
	}
	await generateIosIcons(source, iosIconsDir)
	syncIosXcassets(iosIconsDir)
}

/** Fail fast when Xcode has no eligible iphoneos destination (common after fresh Xcode install). */
function ensureIosDevicePlatform(workspace: string, scheme: string) {
	const r = spawnSync(
		'xcodebuild',
		['-showdestinations', '-workspace', workspace, '-scheme', scheme],
		{ encoding: 'utf8' }
	)
	const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
	if (!out.includes('is not installed')) return
	console.error(
		[
			'tauri-ios-asc: Xcode cannot build for physical iOS (iphoneos) yet.',
			'Install the matching iOS platform in Xcode → Settings → Platforms (Components).',
			'Then run: xcodebuild -runFirstLaunch -checkForNewerComponents',
			'Verify: xcodebuild -showdestinations -workspace app/src-tauri/gen/apple/aven-os-app.xcodeproj/project.xcworkspace -scheme aven-os-app_iOS'
		].join('\n')
	)
	process.exit(1)
}

function shellEscapeSingleQuoted(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`
}

function writeAvenIosCompileEnv() {
	mkdirSync(path.dirname(AVEN_IOS_COMPILE_ENV), { recursive: true })
	const channel = readRustToolchainChannel(repoRoot)
	// The iOS cargo compile (run inside xcodebuild) only sees env from THIS sourced
	// file — not the parent process — so anything `option_env!`-baked must be set
	// here. AVENOS_SERVER_WS_URL is read at compile time by app/src-tauri/src/jazz;
	// without it the iOS binary runs local-only and never dials the relay.
	const wsUrl = process.env.AVENOS_SERVER_WS_URL || 'wss://aven-ceo-bmrha.sprites.app/sync'
	const lines = [
		`export RUSTUP_TOOLCHAIN=${shellEscapeSingleQuoted(channel)}`,
		`export AVENOS_SERVER_WS_URL=${shellEscapeSingleQuoted(wsUrl)}`
	]

	const googleId = process.env.GOOGLE_CLIENT_ID?.trim()
	const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
	if (googleId) lines.push(`export GOOGLE_CLIENT_ID=${shellEscapeSingleQuoted(googleId)}`)
	if (googleSecret) {
		lines.push(`export GOOGLE_CLIENT_SECRET=${shellEscapeSingleQuoted(googleSecret)}`)
	}

	lines.push('')
	writeFileSync(AVEN_IOS_COMPILE_ENV, lines.join('\n'), 'utf8')
	console.log(
		'[tauri-ios-asc] wrote compile env → %s (AVENOS_SERVER_WS_URL=%s)',
		AVEN_IOS_COMPILE_ENV,
		wsUrl
	)
}

/** Legacy Xcode patches pinned Rust 1.88; upgrade whenever rust-toolchain.toml changes. */
const LEGACY_RUST_TOOLCHAIN_EXPORTS = [
	'export RUSTUP_TOOLCHAIN=1.88; export PATH="${HOME}/.cargo/bin:${PATH}"; ',
	'export RUSTUP_TOOLCHAIN=1.88; export PATH=\\"${HOME}/.cargo/bin:${PATH}\\"; '
] as const

function ensureRustToolchainReady(): void {
	const channel = readRustToolchainChannel(repoRoot)
	const list = spawnSync('rustup', ['toolchain', 'list', '-v'], { encoding: 'utf8' })
	const installed = list.stdout ?? ''
	if (!installed.includes(channel)) {
		console.log('[tauri-ios-asc] installing Rust toolchain %s…', channel)
		const inst = spawnSync('rustup', ['toolchain', 'install', channel], { stdio: 'inherit' })
		if (inst.status !== 0) {
			console.error('tauri-ios-asc: rustup toolchain install failed')
			process.exit(inst.status ?? 1)
		}
	}
	for (const target of ['aarch64-apple-ios', 'aarch64-apple-ios-sim']) {
		const add = spawnSync('rustup', ['target', 'add', target, '--toolchain', channel], {
			stdio: 'inherit'
		})
		if (add.status !== 0) {
			console.error('tauri-ios-asc: rustup target add %s failed', target)
			process.exit(add.status ?? 1)
		}
	}
	const v = spawnSync('rustc', ['--version'], {
		env: { ...process.env, RUSTUP_TOOLCHAIN: channel },
		encoding: 'utf8'
	})
	const line = (v.stdout || v.stderr || '').trim()
	const rustcMinor = channel.match(/^(\d+\.\d+)/)?.[1] ?? channel
	if (v.status !== 0 || !line.includes(rustcMinor)) {
		console.error(
			'tauri-ios-asc: rustc not available on toolchain %s — run: rustup toolchain install %s',
			channel,
			channel
		)
		process.exit(1)
	}
	console.log('[tauri-ios-asc] %s (RUSTUP_TOOLCHAIN=%s)', line, channel)
}

function patchXcodeRustScript() {
	const channel = readRustToolchainChannel(repoRoot)
	const projectYml = path.join(genApple, 'project.yml')
	const pbxproj = path.join(genApple, 'aven-os-app.xcodeproj/project.pbxproj')
	const badForceColor = '${CONFIGURATION:?} ${FORCE_COLOR} ${ARCHS:?}'
	const goodArchs = '${CONFIGURATION:?} ${ARCHS:?}'
	const compileEnvSource = 'set -a; source "${SRCROOT}/.aven-ios-compile.env"; set +a; '
	const compileEnvSourcePbx = 'set -a; source \\"${SRCROOT}/.aven-ios-compile.env\\"; set +a; '
	const rustExports = rustToolchainShellExports(repoRoot)
	const rustToolchain = `${compileEnvSource}${rustExports}`

	if (existsSync(projectYml)) {
		let yml = readFileSync(projectYml, 'utf8')
		let ymlChanged = false
		if (yml.includes(badForceColor)) {
			yml = yml.replaceAll(badForceColor, goodArchs)
			ymlChanged = true
		}
		const bareScript = '- script: bun tauri ios xcode-script'
		const patchedScript = `- script: ${rustToolchain}bun tauri ios xcode-script`
		if (yml.includes(bareScript)) {
			yml = yml.replace(bareScript, patchedScript)
			ymlChanged = true
		} else {
			for (const legacy of LEGACY_RUST_TOOLCHAIN_EXPORTS) {
				if (yml.includes(legacy)) {
					yml = yml.replaceAll(legacy, rustExports)
					ymlChanged = true
				}
			}
			if (yml.includes('RUSTUP_TOOLCHAIN=1.88')) {
				yml = yml.replaceAll('RUSTUP_TOOLCHAIN=1.88', `RUSTUP_TOOLCHAIN=${channel}`)
				ymlChanged = true
			}
		}
		if (ymlChanged) {
			writeFileSync(projectYml, yml, 'utf8')
			console.log('[tauri-ios-asc] patched project.yml (Rust build script env + arch args)')
		}
	}

	if (existsSync(pbxproj)) {
		let pbx = readFileSync(pbxproj, 'utf8')
		let changed = false
		const rustExportsPbx = rustToolchainShellExportsPbx(repoRoot)
		const rustEnv = `${compileEnvSourcePbx}${rustExportsPbx}`
		const brokenPbxCompileEnv = 'source "${SRCROOT}/.aven-ios-compile.env"'
		const fixedPbxCompileEnv = 'source \\"${SRCROOT}/.aven-ios-compile.env\\"'
		if (pbx.includes(brokenPbxCompileEnv)) {
			pbx = pbx.replaceAll(brokenPbxCompileEnv, fixedPbxCompileEnv)
			changed = true
		}
		if (
			pbx.includes('shellScript = "bun tauri ios xcode-script') &&
			!pbx.includes('.aven-ios-compile.env')
		) {
			pbx = pbx.replace(
				'shellScript = "bun tauri ios xcode-script',
				`shellScript = "${rustEnv}bun tauri ios xcode-script`
			)
			changed = true
		} else if (pbx.includes('RUSTUP_TOOLCHAIN=1.88')) {
			pbx = pbx.replaceAll('RUSTUP_TOOLCHAIN=1.88', `RUSTUP_TOOLCHAIN=${channel}`)
			changed = true
		}
		for (const legacy of LEGACY_RUST_TOOLCHAIN_EXPORTS) {
			const legacyPbx = legacy.replaceAll('"', '\\"')
			if (pbx.includes(legacyPbx)) {
				pbx = pbx.replaceAll(legacyPbx, rustExportsPbx)
				changed = true
			}
		}
		if (pbx.includes('--configuration ${CONFIGURATION:?} 0 ${ARCHS:?}')) {
			pbx = pbx.replaceAll(
				'--configuration ${CONFIGURATION:?} 0 ${ARCHS:?}',
				'--configuration ${CONFIGURATION:?} ${ARCHS:?}'
			)
			changed = true
		}
		if (pbx.includes('"\\".\\"",')) {
			pbx = pbx.replaceAll('\t\t\t\t\t"\\".\\"",\n', '')
			changed = true
		}
		if (changed) {
			writeFileSync(pbxproj, pbx, 'utf8')
			console.log(
				'[tauri-ios-asc] patched project.pbxproj (Rust build script + FRAMEWORK_SEARCH_PATHS)'
			)
		}
	}
}

/**
 * Link Apple SDK frameworks referenced by Rust static libraries into the final iOS app.
 * Cargo emits the correct framework link directives while building libapp.a, but those
 * directives do not propagate through Tauri's generated Xcode project to the final app
 * link. Keep this list explicit so newly introduced native dependencies cannot silently
 * rely on whichever frameworks happen to be present in the Tauri template.
 *
 * We patch BOTH project.yml (the xcodegen source, in case a regen happens) and the already
 * generated project.pbxproj (which `tauri ios build` consumes as-is, without regenerating).
 * The fixed 24-character IDs use only hexadecimal characters and are outside xcodegen's
 * random namespace for practical purposes. The patch is idempotent.
 */
function patchIosSdkFrameworks() {
	const frameworks = [
		{
			name: 'Accelerate',
			frameworkRef: 'ACCE0000000000000000FEF1',
			buildFile: 'ACCE0000000000000000B111'
		},
		{
			name: 'AVFAudio',
			frameworkRef: 'AFAF0000000000000000FEF2',
			buildFile: 'AFAF0000000000000000B112'
		},
		{
			name: 'AudioToolbox',
			frameworkRef: 'A0D10000000000000000FEF3',
			buildFile: 'A0D10000000000000000B113'
		}
	] as const

	const projectYml = path.join(genApple, 'project.yml')
	if (existsSync(projectYml)) {
		let yml = readFileSync(projectYml, 'utf8')
		const missing = frameworks.filter(({ name }) => !yml.includes(`${name}.framework`))
		if (missing.length > 0) {
			const anchor = '      - sdk: CoreGraphics.framework\n'
			if (!yml.includes(anchor)) {
				console.error(
					'tauri-ios-asc: CoreGraphics.framework anchor missing from project.yml; cannot link required iOS SDK frameworks. The cargo-mobile2 template may have changed; update patchIosSdkFrameworks().'
				)
				process.exit(1)
			}
			const additions = missing.map(({ name }) => `      - sdk: ${name}.framework\n`).join('')
			yml = yml.replace(anchor, `${additions}${anchor}`)
			writeFileSync(projectYml, yml, 'utf8')
			console.log(
				'[tauri-ios-asc] patched project.yml (linked %s)',
				missing.map(({ name }) => `${name}.framework`).join(', ')
			)
		}
	}

	const pbxproj = path.join(genApple, 'aven-os-app.xcodeproj/project.pbxproj')
	if (!existsSync(pbxproj)) return
	let pbx = readFileSync(pbxproj, 'utf8')
	const missing = frameworks.filter(({ name }) => !pbx.includes(`${name}.framework`))
	if (missing.length === 0) return

	const buildFileAnchor = '/* Begin PBXBuildFile section */\n'
	const fileReferenceAnchor = '/* Begin PBXFileReference section */\n'
	const frameworksPhaseAnchor =
		'isa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n'
	if (
		!pbx.includes(buildFileAnchor) ||
		!pbx.includes(fileReferenceAnchor) ||
		!pbx.includes(frameworksPhaseAnchor)
	) {
		console.error(
			'tauri-ios-asc: Xcode framework section anchor missing from project.pbxproj; cannot link required iOS SDK frameworks. The cargo-mobile2 template may have changed; update patchIosSdkFrameworks().'
		)
		process.exit(1)
	}

	pbx = pbx.replace(
		buildFileAnchor,
		`${buildFileAnchor}${missing
			.map(
				({ name, frameworkRef, buildFile }) =>
					`\t\t${buildFile} /* ${name}.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = ${frameworkRef} /* ${name}.framework */; };\n`
			)
			.join('')}`
	)
	pbx = pbx.replace(
		fileReferenceAnchor,
		`${fileReferenceAnchor}${missing
			.map(
				({ name, frameworkRef }) =>
					`\t\t${frameworkRef} /* ${name}.framework */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = ${name}.framework; path = System/Library/Frameworks/${name}.framework; sourceTree = SDKROOT; };\n`
			)
			.join('')}`
	)
	pbx = pbx.replace(
		frameworksPhaseAnchor,
		`${frameworksPhaseAnchor}${missing
			.map(({ name, buildFile }) => `\t\t\t\t${buildFile} /* ${name}.framework in Frameworks */,\n`)
			.join('')}`
	)
	writeFileSync(pbxproj, pbx, 'utf8')
	console.log(
		'[tauri-ios-asc] patched project.pbxproj (linked %s)',
		missing.map(({ name }) => `${name}.framework`).join(', ')
	)
}

/**
 * Ship a UNIVERSAL app (iPhone + iPad). cargo-mobile2's iOS template never sets
 * TARGETED_DEVICE_FAMILY, and Info.ios.plist doesn't set UIDeviceFamily — so the built
 * app's device family falls back to Xcode's implicit default, leaving iPad availability
 * to chance across Xcode / cargo-mobile2 versions. Pin it to "1,2" so the SAME signed
 * .ipa installs and runs on iPad from the same App Store record (an "iPad app" is just an
 * iOS app whose device family includes iPad — no separate binary, target, or pipeline).
 *
 * All modern iPads are arm64 + Metal, so the template's UIRequiredDeviceCapabilities:
 * [arm64, metal] and the statically-linked local-llama Metal path already satisfy iPad.
 *
 * Patch BOTH project.yml (the xcodegen source, in case of a regen) and the already
 * generated project.pbxproj (which `tauri ios build` consumes as-is). The pbxproj still
 * carries the cargo-mobile2 macOS target, so the SDKROOT discriminator scopes the setting
 * to the iOS configs only (macOS uses `SDKROOT = macosx;`). Idempotent.
 */
function patchTargetedDeviceFamily() {
	const FAMILY = '"1,2"'

	const projectYml = path.join(genApple, 'project.yml')
	if (existsSync(projectYml)) {
		let yml = readFileSync(projectYml, 'utf8')
		if (!yml.includes('TARGETED_DEVICE_FAMILY')) {
			// The template only emits ARCHS inside the iOS target's settings.base, so it's a
			// precise anchor for adding the device family to that same block.
			const m = yml.match(/^([ \t]*)ARCHS: /m)
			if (m) {
				const indent = m[1]
				yml = yml.replace(
					/^([ \t]*)ARCHS: /m,
					`${indent}TARGETED_DEVICE_FAMILY: ${FAMILY}\n${indent}ARCHS: `
				)
				writeFileSync(projectYml, yml, 'utf8')
				console.log(
					'[tauri-ios-asc] patched project.yml (TARGETED_DEVICE_FAMILY = 1,2 — universal iPhone/iPad)'
				)
			}
		}
	}

	const pbxproj = path.join(genApple, 'aven-os-app.xcodeproj/project.pbxproj')
	if (!existsSync(pbxproj)) return
	let pbx = readFileSync(pbxproj, 'utf8')
	if (pbx.includes('TARGETED_DEVICE_FAMILY')) return // already set (idempotent)
	if (!pbx.includes('SDKROOT = iphoneos;')) {
		// Anchor absent — fail loud rather than silently ship an iPhone-only build.
		console.error(
			'tauri-ios-asc: no `SDKROOT = iphoneos;` in project.pbxproj — cannot pin TARGETED_DEVICE_FAMILY (iPad support). The cargo-mobile2 template layout may have changed; update patchTargetedDeviceFamily().'
		)
		process.exit(1)
	}
	// Every iOS build config (Debug + Release) carries `SDKROOT = iphoneos;`; the macOS
	// target uses `macosx`, so replaceAll scopes the setting to the iPhone/iPad configs.
	pbx = pbx.replaceAll(
		'SDKROOT = iphoneos;',
		`SDKROOT = iphoneos;\n\t\t\t\tTARGETED_DEVICE_FAMILY = ${FAMILY};`
	)
	writeFileSync(pbxproj, pbx, 'utf8')
	console.log(
		'[tauri-ios-asc] patched project.pbxproj (TARGETED_DEVICE_FAMILY = 1,2 — universal iPhone/iPad)'
	)
}

function patchPodfile() {
	const podfile = path.join(genApple, 'Podfile')
	if (!existsSync(podfile)) return
	const src = readFileSync(podfile, 'utf8')
	if (!src.includes('aven-os-app_macOS')) return
	const next = src.replace(/\ntarget 'aven-os-app_macOS' do[\s\S]*?\nend\n?/, '\n')
	if (next !== src) {
		writeFileSync(podfile, next, 'utf8')
		console.log('[tauri-ios-asc] patched Podfile (removed macOS target)')
	}
	const pod = spawnSync('pod', ['install'], { cwd: genApple, stdio: 'inherit' })
	if (pod.status !== 0) {
		console.warn('[tauri-ios-asc] pod install failed (continuing — Podfile may have no pods)')
	}
}

function findIpa(): string | null {
	const candidates = [
		path.join(genApple, 'build/arm64/avenOS.ipa'),
		path.join(genApple, 'build/universal/avenOS.ipa'),
		path.join(genApple, 'build/avenOS.ipa')
	]
	for (const p of candidates) {
		if (existsSync(p)) return p
	}
	return null
}

function configureSigning(env: NodeJS.ProcessEnv): 'automatic' | 'manual' {
	const hasProfile = Boolean(process.env.AVEN_IOS_APP_STORE_MOBILEPROVISION?.trim())
	const hasP12 = Boolean(
		process.env.APPLE_CERTS_P12?.trim() && process.env.APPLE_CERTS_P12_PASSWORD?.trim()
	)

	if (hasProfile && hasP12) {
		const profilePath = mustFile(
			'AVEN_IOS_APP_STORE_MOBILEPROVISION',
			process.env.AVEN_IOS_APP_STORE_MOBILEPROVISION
		)
		const p12Path = mustFile('APPLE_CERTS_P12', process.env.APPLE_CERTS_P12)
		// biome-ignore lint/style/noNonNullAssertion: intentional crash when the secret is unset — same behavior as before, release scripts fail loud.
		const p12Password = process.env.APPLE_CERTS_P12_PASSWORD!.trim()
		env.IOS_MOBILE_PROVISION = fileToBase64(profilePath)
		env.IOS_CERTIFICATE = fileToBase64(p12Path)
		env.IOS_CERTIFICATE_PASSWORD = p12Password
		console.log('[tauri-ios-asc] signing=manual (p12 + mobileprovision from paths)')
		return 'manual'
	}

	if (hasAutomaticCiSigning()) {
		console.log('[tauri-ios-asc] signing=automatic (App Store Connect API key)')
		if (hasProfile) {
			console.warn(
				'[tauri-ios-asc] AVEN_IOS_APP_STORE_MOBILEPROVISION is set but manual p12 env is missing — automatic signing may fail if ASC has no cloud profile for ceo.aven.os. Export Apple Distribution .p12 and set APPLE_CERTS_P12 + APPLE_CERTS_P12_PASSWORD.'
			)
		}
		return 'automatic'
	}

	if (hasProfile) {
		console.error(
			'tauri-ios-asc: AVEN_IOS_APP_STORE_MOBILEPROVISION is set — also set APPLE_CERTS_P12 and APPLE_CERTS_P12_PASSWORD (Keychain → export Apple Distribution .p12), or configure APPLE_API_* for automatic signing.'
		)
		process.exit(1)
	}

	console.error(
		'tauri-ios-asc: configure manual signing (p12 + mobileprovision) or APPLE_API_* for automatic CI signing'
	)
	process.exit(1)
}

async function main() {
	const bundleVersion = process.env.AVEN_IOS_CF_BUNDLE_VERSION?.trim() || '13'
	const version = readPackageVersion()

	syncEntitlements()
	await generateIosIconsFromSource()
	// tauri.conf.json declares onnxruntime/libonnxruntime.dylib as a bundled resource, so
	// generate_context! requires the file to exist at build time. Fetch it (same as the mac
	// build); the standalone dylib is stripped from the archive later (Apple bans it on iOS).
	writeAvenIosCompileEnv()
	patchPodfile()
	ensureRustToolchainReady()
	patchXcodeRustScript()
	patchIosSdkFrameworks()
	patchTargetedDeviceFamily()

	const workspace = path.join(genApple, 'aven-os-app.xcodeproj/project.xcworkspace')
	ensureIosDevicePlatform(workspace, 'aven-os-app_iOS')

	mkdirSync(path.join(repoRoot, 'dist'), { recursive: true })
	const mergeDir = mkdtempSync(path.join(repoRoot, 'dist', 'ios-appstore-tmp-'))
	const mergePath = path.join(mergeDir, 'tauri.ios.merge.json')
	writeFileSync(
		mergePath,
		JSON.stringify(
			{
				build: { beforeBuildCommand: '' },
				bundle: { iOS: { bundleVersion } }
			},
			null,
			2
		),
		'utf8'
	)

	const tauriEnv = {
		...process.env,
		APPLE_DEVELOPMENT_TEAM: team,
		CI: 'true',
		// Bake the sync relay URL into the release binary (read at compile time via
		// `option_env!("AVENOS_SERVER_WS_URL")` in app/src-tauri/src/jazz). Override
		// by exporting AVENOS_SERVER_WS_URL; defaults to the hosted aven-ceo relay.
		AVENOS_SERVER_WS_URL:
			process.env.AVENOS_SERVER_WS_URL || 'wss://aven-ceo-bmrha.sprites.app/sync',
		...rustupToolchainEnv(repoRoot)
	}
	const signingMode = configureSigning(tauriEnv)

	console.log(
		'[tauri-ios-asc] team=%s build=%s mode=%s target=arm64-device',
		team,
		bundleVersion,
		signingMode
	)

	// Wipe the SvelteKit static output FIRST so the iOS build embeds a CONSISTENT asset set — a
	// stale `build/` (e.g. left by a prior mac/iOS run with different chunk hashes) otherwise makes
	// the bundler reference hashed chunks the fresh build didn't emit ("failed to read asset …").
	rmSync(path.join(appDir, 'build'), { recursive: true, force: true })

	const frontendBuild = spawnSync('bun', ['run', 'build'], {
		cwd: appDir,
		stdio: 'inherit',
		env: tauriEnv
	})
	if (frontendBuild.status !== 0) {
		console.error('tauri-ios-asc: frontend build failed')
		process.exit(frontendBuild.status ?? 1)
	}

	const tauriArgs = [
		'--bun',
		'tauri',
		'ios',
		'build',
		'--export-method',
		'app-store-connect',
		'--target',
		'aarch64',
		'--ci',
		'--config',
		mergePath
	]
	if (signingMode === 'manual') {
		tauriArgs.push('--archive-only')
	}
	// iOS feature set: STT + the on-device LLM (LFM2.5-1.2B GGUF via llama.cpp/Metal, statically
	// linked — no dylib). Tauri CLI 2.x has NO `--no-default-features` (only additive `-f/--features`),
	// so iOS-incompatible features (Tinfoil cloud client, TTS/embedding onnxruntime dylibs) MUST be
	// kept OUT of the crate `default` set (see app/src-tauri/Cargo.toml) — they can't be stripped here.

	const r = spawnSync('bunx', tauriArgs, { cwd: appDir, stdio: 'inherit', env: tauriEnv })
	if (r.status !== 0) {
		console.error('tauri-ios-asc: tauri ios build failed')
		process.exit(r.status ?? 1)
	}

	let ipaSrc: string | null
	if (signingMode === 'manual') {
		const profilePath = mustFile(
			'AVEN_IOS_APP_STORE_MOBILEPROVISION',
			process.env.AVEN_IOS_APP_STORE_MOBILEPROVISION
		)
		const profileName = readMobileProvisionName(profilePath)
		const exportDir = path.join(genApple, 'build/export-manual')
		ipaSrc = exportArchiveManually(profileName, profilePath, exportDir)
	} else {
		ipaSrc = findIpa()
	}
	if (!ipaSrc) {
		console.error(
			'tauri-ios-asc: could not find avenOS.ipa under gen/apple/build/ — check CLI output for the export path'
		)
		process.exit(1)
	}

	const distDir = path.join(repoRoot, 'dist', 'ios-appstore')
	mkdirSync(distDir, { recursive: true })
	const ipaOut =
		process.env.AVEN_OUTPUT_IPA?.trim() ||
		path.join(distDir, `avenOS-${version}-build${bundleVersion}.ipa`)
	copyFileSync(ipaSrc, ipaOut)

	try {
		rmSync(mergeDir, { recursive: true, force: true })
	} catch {
		// ignore cleanup errors (tmp lives under ignored dist area)
	}

	console.log(`[tauri-ios-asc] done → ${ipaOut}`)
	console.log(
		'[tauri-ios-asc] Upload preferred: bun run release:app:ios <N> — uses altool/App Store Connect API. Use Apple Transporter only as a GUI fallback if CLI upload fails.'
	)
}

void main().catch((e: unknown) => {
	console.error(e)
	process.exit(1)
})
