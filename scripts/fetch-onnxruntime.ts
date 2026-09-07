#!/usr/bin/env bun
/**
 * Provision the exact Microsoft ONNX Runtime shared library used by `ort` rc.13.
 *
 * Tauri resources and the Rust loader use the native Linux `.so` filename.
 * On x64, `AVEN_SPEECH_GPU=auto` selects Microsoft's CUDA 12 build when all of
 * its CUDA/cuDNN dependencies are visible. `cuda` forces that build and `cpu`
 * forces the compact CPU build. ONNX Runtime itself still provides CPU fallback.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '1.28.0'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, 'app', 'src-tauri', 'resources', 'onnxruntime')
const bundledPath = path.join(outDir, 'libonnxruntime.so')

const distributions = {
	x64Cpu: {
		name: `onnxruntime-linux-x64-${VERSION}`,
		sha256: 'a3e1b79d7bb1bf09696ce675f49e4064e6c81f6202b8225624fff0e93f8d6407',
		machine: 62,
		variant: 'cpu'
	},
	x64Cuda: {
		name: `onnxruntime-linux-x64-gpu_cuda12-${VERSION}`,
		sha256: 'ea6bd2b65d7dfabbeb92c4af5dd8f12e5aed8601e544ad378d2f872275438b1a',
		machine: 62,
		variant: 'cuda'
	},
	arm64Cpu: {
		name: `onnxruntime-linux-aarch64-${VERSION}`,
		sha256: 'e15ff8b5d85afe6c144d97c6fd432254bf76a219daaf17658087d6ecb3e8f0bb',
		machine: 183,
		variant: 'cpu'
	}
} as const

type Distribution = (typeof distributions)[keyof typeof distributions]

const CUDA_LIBRARIES = [
	'libcudart.so.12',
	'libcublasLt.so.12',
	'libcublas.so.12',
	'libnvrtc.so.12',
	'libcurand.so.10',
	'libcufft.so.11',
	'libcudnn.so.9'
] as const

function cudaLibrariesAvailable(): { available: boolean; missing: string[] } {
	const nvidia = spawnSync('nvidia-smi', ['-L'], { encoding: 'utf8' })
	if (nvidia.status !== 0) return { available: false, missing: ['NVIDIA GPU/driver'] }

	const cache = spawnSync('ldconfig', ['-p'], { encoding: 'utf8' })
	let visible = cache.status === 0 ? cache.stdout : ''
	for (const directory of (process.env.LD_LIBRARY_PATH || '')
		.split(path.delimiter)
		.filter(Boolean)) {
		try {
			visible += `\n${fs.readdirSync(directory).join('\n')}`
		} catch {
			// An invalid search directory cannot make a CUDA installation usable.
		}
	}
	const missing = CUDA_LIBRARIES.filter((library) => !visible.includes(library))
	return { available: missing.length === 0, missing }
}

function selectedDistribution(): Distribution {
	if (process.arch === 'arm64') return distributions.arm64Cpu
	if (process.arch !== 'x64') {
		throw new Error(`onnxruntime provisioning unsupported on Linux ${process.arch}`)
	}

	const mode = (process.env.AVEN_SPEECH_GPU || 'auto').trim().toLowerCase()
	if (mode === 'cpu' || mode === 'off' || mode === '0') return distributions.x64Cpu
	if (mode === 'cuda') return distributions.x64Cuda
	if (mode !== 'auto') {
		console.warn(`[onnxruntime] unknown AVEN_SPEECH_GPU=${JSON.stringify(mode)}; using auto`)
	}

	const cuda = cudaLibrariesAvailable()
	if (cuda.available) return distributions.x64Cuda
	console.log(`[onnxruntime] CUDA unavailable (${cuda.missing.join(', ')}); using CPU runtime`)
	return distributions.x64Cpu
}

function isExpectedRuntime(file: string, machine: number): boolean {
	if (!fs.existsSync(file)) return false
	const bytes = fs.readFileSync(file)
	return (
		bytes.length > 20 &&
		bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
		bytes.readUInt16LE(18) === machine &&
		bytes.includes(Buffer.from(`VERS_${VERSION}`))
	)
}

function sha256(file: string): string {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export function ensureOnnxruntimeDylib(): string {
	if (process.platform !== 'linux') {
		throw new Error(`Linux ONNX Runtime provisioning requested on ${process.platform}`)
	}

	const dist = selectedDistribution()
	const providerPath = path.join(outDir, 'libonnxruntime_providers_cuda.so')
	const installedVariant = fs.existsSync(providerPath) ? 'cuda' : 'cpu'
	if (isExpectedRuntime(bundledPath, dist.machine) && installedVariant === dist.variant) {
		console.log(`[onnxruntime] using ${dist.variant.toUpperCase()} runtime ${VERSION}`)
		return bundledPath
	}

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aven-onnxruntime-'))
	const archive = path.join(tempDir, `${dist.name}.tgz`)
	const url = `https://github.com/microsoft/onnxruntime/releases/download/v${VERSION}/${dist.name}.tgz`

	try {
		console.log(`[onnxruntime] downloading ${url}`)
		const download = spawnSync(
			'curl',
			['-fsSL', '--retry', '3', '--connect-timeout', '10', '-o', archive, url],
			{ stdio: 'inherit' }
		)
		if (download.status !== 0) {
			throw new Error(`onnxruntime download failed (curl exit ${download.status})`)
		}
		const actualHash = sha256(archive)
		if (actualHash !== dist.sha256) {
			throw new Error(
				`onnxruntime archive checksum mismatch: expected ${dist.sha256}, got ${actualHash}`
			)
		}

		const extract = spawnSync('tar', ['-xzf', archive, '-C', tempDir], { stdio: 'inherit' })
		if (extract.status !== 0)
			throw new Error(`onnxruntime extract failed (tar exit ${extract.status})`)
		const sourceDir = path.join(tempDir, dist.name, 'lib')
		const source = path.join(sourceDir, 'libonnxruntime.so')
		if (!isExpectedRuntime(source, dist.machine)) {
			throw new Error(
				`downloaded archive did not contain the expected ONNX Runtime ${VERSION} ELF library`
			)
		}

		fs.mkdirSync(outDir, { recursive: true })
		for (const entry of fs.readdirSync(outDir)) {
			if (
				entry.startsWith('libonnxruntime') ||
				entry === 'ONNXRuntime-LICENSE' ||
				entry === 'ONNXRuntime-ThirdPartyNotices.txt'
			) {
				fs.rmSync(path.join(outDir, entry), { force: true })
			}
		}
		for (const entry of fs.readdirSync(sourceDir)) {
			if (!entry.startsWith('libonnxruntime_providers_') || !entry.endsWith('.so')) continue
			const sourceFile = path.join(sourceDir, entry)
			if (!fs.statSync(sourceFile).isFile()) continue
			const targetFile = path.join(outDir, entry)
			fs.copyFileSync(sourceFile, targetFile)
			fs.chmodSync(targetFile, 0o755)
		}
		fs.copyFileSync(source, bundledPath)
		fs.chmodSync(bundledPath, 0o755)
		fs.copyFileSync(
			path.join(tempDir, dist.name, 'LICENSE'),
			path.join(outDir, 'ONNXRuntime-LICENSE')
		)
		fs.copyFileSync(
			path.join(tempDir, dist.name, 'ThirdPartyNotices.txt'),
			path.join(outDir, 'ONNXRuntime-ThirdPartyNotices.txt')
		)
		console.log(`[onnxruntime] installed ${dist.variant.toUpperCase()} runtime -> ${bundledPath}`)
		return bundledPath
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true })
	}
}

if (import.meta.main) console.log(ensureOnnxruntimeDylib())
