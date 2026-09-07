#!/usr/bin/env bun
/**
 * Regenerate every derived brand file in avenOS from `@myavenceo/aven-ceo`.
 *
 *   bun run brand:generate
 *
 * The palette, the logo and the two icon primitives all live in the package.
 * This script only decides WHERE each generated file lands in this repo; the
 * generators themselves ship in the package, so the app, the id service and the
 * marketing site cannot emit different shapes from the same tokens.
 *
 * Pair with `bun run icons`, which rasterises `app-icon-source.svg` (written
 * here) into the platform icon sets. Everything written is committed: a clean
 * `git status` after running both IS the proof that nothing has drifted.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	appIconSvg,
	componentCss,
	elementCss,
	faviconSvg,
	themeCss
} from '@myavenceo/aven-ceo/generate'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The package's own copy of the mark — the one file every icon derives from.
 *
 * Resolved through the module graph rather than by joining a `node_modules`
 * path: bun installs workspace dependencies UNDER each workspace, so the
 * package lives in `app/node_modules` and `services/aven-api/node_modules`,
 * never at the repo root. Asking the resolver is also the only version that
 * keeps working if the store layout changes.
 */
const logo = readFileSync(
	fileURLToPath(import.meta.resolve('@myavenceo/aven-ceo/assets/logo.svg')),
	'utf8'
)

const favicon = faviconSvg(logo)

/**
 * `aven-logo.svg` is served by URL from three places (the app dashboard, the id
 * service, and the marketing site in the other repo), so each surface keeps its
 * own served copy. Emitting them here means an edit to a copy is reverted by the
 * next run instead of quietly becoming a fourth variant of the mark.
 */
const outputs: Array<[string, string]> = [
	['app/src/brand-theme.css', themeCss('app')],
	['app/src/brand-components.css', componentCss()],
	/* The browser services run no Tailwind, so both take the plain `:root`
	   variant and the same generated structural and element styles. Keeping
	   identity and checkout as separate outputs preserves the service boundary
	   while making visual drift mechanically detectable. */
	['services/identity/src/brand-theme.css', themeCss('plain')],
	['services/identity/src/brand-components.css', componentCss()],
	['services/identity/src/brand-elements.css', elementCss()],
	['services/checkout/src/brand-theme.css', themeCss('plain')],
	['services/checkout/src/brand-components.css', componentCss()],
	['services/checkout/src/brand-elements.css', elementCss()],
	['app/static/aven-logo.svg', logo],
	['app/static/favicon.svg', favicon],
	['services/identity/static/aven-logo.svg', logo],
	['services/identity/static/favicon.svg', favicon],
	['services/checkout/static/aven-logo.svg', logo],
	['services/checkout/static/favicon.svg', favicon],
	/* The seed `bun run icons` rasterises — the mark on its rounded brand plate. */
	['app/src-tauri/icons/app-icon-source.svg', appIconSvg(logo)]
]

let changed = 0
for (const [relative, contents] of outputs) {
	const file = path.join(repoRoot, relative)
	let previous: string | null = null
	try {
		previous = readFileSync(file, 'utf8')
	} catch {
		previous = null
	}
	if (previous === contents) continue
	writeFileSync(file, contents)
	changed += 1
	console.log(`  wrote ${relative}`)
}

console.log(changed === 0 ? 'brand: already in sync' : `brand: regenerated ${changed} file(s)`)
