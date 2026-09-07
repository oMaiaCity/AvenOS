#!/usr/bin/env bun
/**
 * Regenerate EVERY app icon from one source image.
 *
 *   bun run icons                        # re-render from the generated source
 *   bun run icons ~/Downloads/logo.svg   # adopt a new logo (see the note below)
 *   bun run icons logo.jpg --ios-bg=#f8f6ef
 *
 * With no argument the source is `icons/app-icon-source.svg`, which is WRITTEN by
 * `bun run brand:generate` from `@myavenceo/aven-ceo`'s single `logo.svg`. That
 * is the whole chain: one mark in the package -> the badged source here -> every
 * platform icon below. Adopting a new logo therefore means replacing the mark in
 * the brand package, not passing a file here — a path argument is for trying one
 * out, and `brand:generate` will overwrite it on the next run.
 *
 * Accepts svg, png, jpg/jpeg, webp, avif, tiff and gif. Non-square inputs are
 * letterboxed (never cropped); an SVG input is also copied in as the vector SSOT.
 *
 * Outputs (all under app/):
 *   src-tauri/icons/app-icon-source.png       1024² badged source (alpha kept)
 *   src-tauri/icons/app-icon-source-1024.png  duplicate kept for older tooling
 *   src-tauri/icons/app-icon-source-ios.png   1024² opaque, full-bleed (iOS masks itself)
 *   src-tauri/icons/…                         via `tauri icon`: macOS/Windows/Linux/Android
 *   src-tauri/icons/ios/…                     re-done here, flattened (Apple rejects alpha)
 *   static/app-icon.png, static/favicon.png   in-app/browser copies
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp, { type SharpOptions } from 'sharp'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(repoRoot, 'app')
const tauriDir = path.join(appDir, 'src-tauri')
const iconsDir = path.join(tauriDir, 'icons')
const iosDir = path.join(iconsDir, 'ios')
const staticDir = path.join(appDir, 'static')
const xcassetsDir = path.join(tauriDir, 'gen/apple/Assets.xcassets/AppIcon.appiconset')
const androidBgXml = path.join(iconsDir, 'android/values/ic_launcher_background.xml')

const SOURCE_PNG = path.join(iconsDir, 'app-icon-source.png')
const SOURCE_SVG = path.join(iconsDir, 'app-icon-source.svg')
const SOURCE_IOS = path.join(iconsDir, 'app-icon-source-ios.png')

const SUPPORTED = new Set([
	'.svg',
	'.png',
	'.jpg',
	'.jpeg',
	'.webp',
	'.avif',
	'.tiff',
	'.tif',
	'.gif'
])

/** Matches app/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/Contents.json */
export const IOS_ICON_SIZES: Record<string, number> = {
	'AppIcon-20x20@1x.png': 20,
	'AppIcon-20x20@2x-1.png': 40,
	'AppIcon-20x20@2x.png': 40,
	'AppIcon-20x20@3x.png': 60,
	'AppIcon-29x29@1x.png': 29,
	'AppIcon-29x29@2x-1.png': 58,
	'AppIcon-29x29@2x.png': 58,
	'AppIcon-29x29@3x.png': 87,
	'AppIcon-40x40@1x.png': 40,
	'AppIcon-40x40@2x-1.png': 80,
	'AppIcon-40x40@2x.png': 80,
	'AppIcon-40x40@3x.png': 120,
	'AppIcon-60x60@2x.png': 120,
	'AppIcon-60x60@3x.png': 180,
	'AppIcon-76x76@1x.png': 76,
	'AppIcon-76x76@2x.png': 152,
	'AppIcon-83.5x83.5@2x.png': 167,
	'AppIcon-512@2x.png': 1024
}

/**
 * Rasterize any supported input to a square RGBA PNG. SVG is rendered at a density
 * that yields at least `size` px natively, so it is downsampled — never upscaled.
 */
export async function rasterizeSquare(input: string, size: number): Promise<Buffer> {
	const isSvg = path.extname(input).toLowerCase() === '.svg'
	let opts: SharpOptions = {}
	if (isSvg) {
		const intrinsic = await sharp(input).metadata()
		const longest = Math.max(intrinsic.width ?? size, intrinsic.height ?? size)
		opts = { density: Math.min(2400, Math.ceil((72 * size) / longest)) }
	}
	return sharp(input, opts)
		.resize(size, size, {
			fit: 'contain',
			kernel: 'lanczos3',
			background: { r: 0, g: 0, b: 0, alpha: 0 }
		})
		.png()
		.toBuffer()
}

/**
 * The colour to sit behind the icon where it is transparent. Sampled from the top-centre
 * pixel — for a badged icon that is the card itself, so flattening fills the rounded
 * corners seamlessly. Falls back to white when the source has no opaque background.
 */
export async function pickBackground(png: Buffer): Promise<string> {
	const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
	const x = Math.floor(info.width / 2)
	const i = x * info.channels // top row, centre column
	const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
	if (a === undefined || a < 250 || r === undefined || g === undefined || b === undefined) {
		return '#FFFFFF'
	}
	return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** iOS applies its own mask and rejects alpha → flatten to a full-bleed opaque square. */
export async function generateIosIcons(source: string, outDir: string, bg?: string): Promise<void> {
	const background = bg ?? (await pickBackground(readFileSync(source)))
	mkdirSync(outDir, { recursive: true })
	for (const [name, px] of Object.entries(IOS_ICON_SIZES)) {
		await sharp(source)
			.resize(px, px, { kernel: 'lanczos3' })
			.flatten({ background })
			.removeAlpha()
			.png()
			.toFile(path.join(outDir, name))
	}
	console.log(`[icons] ios → ${Object.keys(IOS_ICON_SIZES).length} sizes in ${outDir}`)
}

/** Xcode reads the generated project's asset catalogue, not icons/ios — keep them in step. */
export function syncIosXcassets(fromDir: string): void {
	if (!existsSync(xcassetsDir)) return
	for (const name of Object.keys(IOS_ICON_SIZES)) {
		const src = path.join(fromDir, name)
		if (existsSync(src)) copyFileSync(src, path.join(xcassetsDir, name))
	}
	console.log(`[icons] synced xcassets → ${xcassetsDir}`)
}

function runTauriIcon(source: string): void {
	const r = spawnSync('bun', ['--bun', 'x', 'tauri', 'icon', source, '-o', iconsDir], {
		cwd: appDir,
		stdio: 'inherit'
	})
	if (r.status !== 0) {
		console.error('[icons] `tauri icon` failed')
		process.exit(r.status ?? 1)
	}
}

/**
 * Rewrite `icon.icns` with its chunks in a stable order.
 *
 * `tauri icon` emits the same twelve chunks every run but in whatever order it
 * happened to iterate them, so two runs over an identical source produce two
 * different files — same length, same content, different byte order. That is
 * enough to make `git status` dirty forever and to defeat the "regenerating
 * changes nothing" guarantee the whole brand pipeline rests on.
 *
 * The format is just `icns` + total length followed by [type][length][data]
 * chunks, and readers look chunks up BY TYPE — order carries no meaning — so
 * sorting them is lossless and makes the output reproducible.
 */
function normalizeIcns(file: string): void {
	if (!existsSync(file)) return
	const buf = readFileSync(file)
	if (buf.toString('ascii', 0, 4) !== 'icns') return

	const chunks: Array<{ type: string; data: Buffer }> = []
	let offset = 8
	while (offset + 8 <= buf.length) {
		const type = buf.toString('ascii', offset, offset + 4)
		const length = buf.readUInt32BE(offset + 4)
		if (length < 8 || offset + length > buf.length) return // malformed — leave it alone
		chunks.push({ type, data: buf.subarray(offset, offset + length) })
		offset += length
	}

	chunks.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
	const body = Buffer.concat(chunks.map((c) => c.data))
	const header = Buffer.alloc(8)
	header.write('icns', 0, 'ascii')
	header.writeUInt32BE(body.length + 8, 4)
	writeFileSync(file, Buffer.concat([header, body]))
	console.log(`[icons] normalized ${chunks.length} icns chunks → reproducible`)
}

/** `tauri icon` guesses the adaptive-icon backdrop; use the icon's own background instead. */
function writeAndroidBackground(bg: string): void {
	if (!existsSync(androidBgXml)) return
	const xml = readFileSync(androidBgXml, 'utf8').replace(
		/(<color name="ic_launcher_background">)[^<]*(<\/color>)/,
		`$1${bg}$2`
	)
	writeFileSync(androidBgXml, xml, 'utf8')
	console.log(`[icons] android adaptive background → ${bg}`)
}

function resolveInput(arg: string | undefined): string {
	if (arg) {
		const input = path.resolve(arg)
		if (!existsSync(input)) {
			console.error(`[icons] input not found: ${input}`)
			process.exit(1)
		}
		const ext = path.extname(input).toLowerCase()
		if (!SUPPORTED.has(ext)) {
			console.error(`[icons] unsupported input "${ext}" — use one of ${[...SUPPORTED].join(', ')}`)
			process.exit(1)
		}
		return input
	}
	// No argument: the generated vector source, and ONLY that. Falling back to the
	// rasterised PNG used to look forgiving, but it silently re-rendered whatever
	// the last run happened to leave behind — which is exactly how the icon set
	// drifted away from the logo in the first place.
	if (existsSync(SOURCE_SVG)) return SOURCE_SVG
	console.error(`[icons] ${path.relative(repoRoot, SOURCE_SVG)} is missing.`)
	console.error(`[icons] run \`bun run brand:generate\` to write it from @myavenceo/aven-ceo.`)
	return process.exit(1)
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	if (args.includes('--help') || args.includes('-h')) {
		console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0])
		return
	}
	const bgFlag = args.find((a) => a.startsWith('--ios-bg='))?.slice('--ios-bg='.length)
	const input = resolveInput(args.find((a) => !a.startsWith('-')))
	console.log(`[icons] source: ${input}`)

	// An SVG input becomes the checked-in vector SSOT; raster inputs live on as the PNG.
	if (path.extname(input).toLowerCase() === '.svg' && path.resolve(input) !== SOURCE_SVG) {
		copyFileSync(input, SOURCE_SVG)
		console.log(`[icons] adopted vector source → ${SOURCE_SVG}`)
	}

	const badged = await rasterizeSquare(input, 1024)
	writeFileSync(SOURCE_PNG, badged)
	writeFileSync(path.join(iconsDir, 'app-icon-source-1024.png'), badged)

	const bg = bgFlag ?? (await pickBackground(badged))
	console.log(`[icons] background: ${bg}${bgFlag ? ' (--ios-bg)' : ' (sampled)'}`)
	writeFileSync(
		SOURCE_IOS,
		await sharp(badged).flatten({ background: bg }).removeAlpha().png().toBuffer()
	)

	// Desktop, Windows and Android in one pass; this also writes icons/ios, which we redo below.
	runTauriIcon(SOURCE_PNG)
	normalizeIcns(path.join(iconsDir, 'icon.icns'))
	writeAndroidBackground(bg)

	await generateIosIcons(SOURCE_IOS, iosDir, bg)
	syncIosXcassets(iosDir)

	writeFileSync(path.join(staticDir, 'app-icon.png'), badged)
	writeFileSync(path.join(staticDir, 'favicon.png'), await sharp(badged).resize(32, 32).toBuffer())
	console.log('[icons] static/app-icon.png + static/favicon.png')
	console.log('[icons] done')
}

if (import.meta.main) await main()
