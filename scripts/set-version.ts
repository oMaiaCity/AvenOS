#!/usr/bin/env bun
/**
 * Stamp ONE unified version across the whole monorepo so every package/crate/release
 * reports the same version. Rewrites version fields in:
 *   - every workspace package.json (app, libs/*, docs — NOT ARCHIVE/* or root)
 *   - every first-party Cargo.toml `[package].version` (libs/**, app/src-tauri)
 *   - **internal** crate dependency requirements inside those Cargo.toml (so e.g.
 *     external workspace deps keep their own versions — only our packages are stamped
 *     like tokio are untouched). Without this, bumping a crate past `^0.0.1` breaks
 *     cargo resolution for any sibling that pins it.
 *   - every first-party package entry in the corresponding Cargo.lock files. Cargo
 *     otherwise rejects the release commit under `--locked` because the manifests and
 *     checked-in lockfiles describe different versions.
 *   - app/src-tauri/tauri.conf.json
 *
 * Idempotent and surgical: touches only version-bearing lines.
 *
 *   bun ./scripts/set-version.ts 26.6.1-next.1
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function setJsonVersion(rel: string, version: string): boolean {
	const file = path.join(repoRoot, rel)
	let raw: string
	try {
		raw = readFileSync(file, 'utf8')
	} catch {
		return false
	}
	const next = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`)
	if (next === raw) return false
	writeFileSync(file, next)
	return true
}

/** The crate name declared under this Cargo.toml's `[package]` table, if any. */
function cargoPackageName(rel: string): string | null {
	const file = path.join(repoRoot, rel)
	let raw: string
	try {
		raw = readFileSync(file, 'utf8')
	} catch {
		return null
	}
	let inPackage = false
	for (const line of raw.split('\n')) {
		const t = line.trim()
		if (t.startsWith('[')) inPackage = t === '[package]'
		if (inPackage) {
			const m = t.match(/^name\s*=\s*"([^"]+)"/)
			if (m) return m[1]
		}
	}
	return null
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Rewrite an internal crate dep's version on a single line, if present. */
function rewriteDepLine(line: string, internal: Set<string>, version: string): string {
	for (const n of internal) {
		const esc = escapeRe(n)
		const table = new RegExp(`^(\\s*${esc}\\s*=\\s*\\{[^}]*\\bversion\\s*=\\s*")[^"]*(")`)
		if (table.test(line)) return line.replace(table, `$1${version}$2`)
		const bare = new RegExp(`^(\\s*${esc}\\s*=\\s*")[^"]*(")`)
		if (bare.test(line)) return line.replace(bare, `$1${version}$2`)
	}
	return line
}

/** Set `[package].version` and stamp internal dep requirements; leave external deps alone. */
function setCargo(rel: string, version: string, internal: Set<string>): boolean {
	const file = path.join(repoRoot, rel)
	let raw: string
	try {
		raw = readFileSync(file, 'utf8')
	} catch {
		return false
	}
	const lines = raw.split('\n')
	let inPackage = false
	let pkgDone = false
	let changed = false
	for (let i = 0; i < lines.length; i++) {
		const t = lines[i].trim()
		if (t.startsWith('[')) inPackage = t === '[package]'
		if (inPackage && !pkgDone && /^version\s*=/.test(t)) {
			const next = lines[i].replace(/version\s*=\s*"[^"]*"/, `version = "${version}"`)
			if (next !== lines[i]) changed = true
			lines[i] = next
			pkgDone = true
			continue
		}
		const next = rewriteDepLine(lines[i], internal, version)
		if (next !== lines[i]) {
			lines[i] = next
			changed = true
		}
	}
	if (!changed) return false
	writeFileSync(file, lines.join('\n'))
	return true
}

/** Keep checked-in lockfiles aligned with the first-party manifests stamped above. */
function setCargoLock(rel: string, version: string, internal: Set<string>): boolean {
	const file = path.join(repoRoot, rel)
	let raw: string
	try {
		raw = readFileSync(file, 'utf8')
	} catch {
		return false
	}
	let next = raw
	for (const name of internal) {
		const packageEntry = new RegExp(
			`(\\[\\[package\\]\\]\\nname = "${escapeRe(name)}"\\nversion = ")[^"]*(")`,
			'g'
		)
		next = next.replace(packageEntry, `$1${version}$2`)
	}
	if (next === raw) return false
	writeFileSync(file, next)
	return true
}

function scan(pattern: string): string[] {
	const glob = new Bun.Glob(pattern)
	const out: string[] = []
	for (const rel of glob.scanSync({ cwd: repoRoot })) {
		if (rel.includes('node_modules') || rel.includes('/target/') || rel.startsWith('ARCHIVE/'))
			continue
		out.push(rel)
	}
	return out.sort()
}

function main(): void {
	const version = process.argv[2]?.trim()
	if (!version || !semver.valid(version)) {
		console.error(`set-version: pass a valid semver version (got "${version ?? ''}").`)
		process.exit(1)
	}

	const jsonTargets = [
		...scan('app/package.json'),
		...scan('libs/*/package.json'),
		...scan('docs/package.json')
	]
	const cargoTargets = [...scan('libs/**/Cargo.toml'), ...scan('app/src-tauri/Cargo.toml')]
	const cargoLockTargets = [...scan('libs/**/Cargo.lock'), ...scan('app/src-tauri/Cargo.lock')]

	const internal = new Set<string>()
	for (const rel of cargoTargets) {
		const name = cargoPackageName(rel)
		if (name) internal.add(name)
	}

	let count = 0
	for (const rel of jsonTargets) if (setJsonVersion(rel, version)) count++
	for (const rel of cargoTargets) if (setCargo(rel, version, internal)) count++
	for (const rel of cargoLockTargets) if (setCargoLock(rel, version, internal)) count++
	if (setJsonVersion('app/src-tauri/tauri.conf.json', version)) count++

	console.log(
		`set-version: stamped ${version} across ${count} files (${internal.size} internal crates unified)`
	)
}

main()
