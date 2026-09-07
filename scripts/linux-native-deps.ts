#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'

const REQUIRED_PKG_CONFIG_PACKAGES = [
	'alsa',
	'dbus-1',
	'gtk+-3.0',
	'librsvg-2.0',
	'libsoup-3.0',
	'webkit2gtk-4.1'
]

function hasCommand(command: string): boolean {
	const result = spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' })
	return result.status === 0
}

function missingPkgConfigPackages(): string[] {
	if (!hasCommand('pkg-config')) return ['pkg-config']

	return REQUIRED_PKG_CONFIG_PACKAGES.filter((pkg) => {
		const result = spawnSync('pkg-config', ['--exists', pkg], { stdio: 'ignore' })
		return result.status !== 0
	})
}

function installHint(): string {
	if (hasCommand('apt')) {
		return [
			'sudo apt update',
			'sudo apt install -y \\',
			'  pkg-config \\',
			'  libasound2-dev \\',
			'  libdbus-1-dev \\',
			'  libgtk-3-dev \\',
			'  librsvg2-dev \\',
			'  libsoup-3.0-dev \\',
			'  libwebkit2gtk-4.1-dev \\',
			'  libayatana-appindicator3-dev \\',
			'  build-essential \\',
			'  curl \\',
			'  wget \\',
			'  file \\',
			'  libssl-dev'
		].join('\n')
	}

	if (hasCommand('dnf')) {
		return [
			'sudo dnf install \\',
			'  pkgconf-pkg-config \\',
			'  alsa-lib-devel \\',
			'  dbus-devel \\',
			'  gtk3-devel \\',
			'  librsvg2-devel \\',
			'  libsoup3-devel \\',
			'  webkit2gtk4.1-devel \\',
			'  libappindicator-gtk3-devel \\',
			'  openssl-devel \\',
			'  curl \\',
			'  wget \\',
			'  file \\',
			'  gcc-c++'
		].join('\n')
	}

	return 'Install the Linux WebKitGTK / GTK / DBus development packages for your distro, then retry.'
}

export function ensureLinuxNativeDeps(taskLabel: string) {
	if (process.platform !== 'linux') return

	const missing = missingPkgConfigPackages()
	if (missing.length === 0) return

	console.error(`\n${taskLabel}: missing required Linux native build dependencies.`)
	console.error(`Missing pkg-config packages/tools: ${missing.join(', ')}`)
	console.error('\nInstall the prerequisites and retry:\n')
	console.error(installHint())
	console.error('')
	process.exit(1)
}
