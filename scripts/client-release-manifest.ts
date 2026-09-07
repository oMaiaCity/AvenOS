#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { clientReleasePlan, verifyClientAssets } from './lib/client-release.js'

const plan = clientReleasePlan(
	process.env.GITHUB_REF ?? '',
	process.env.GITHUB_SHA ?? '',
	process.env.GITHUB_RUN_NUMBER ?? '',
	process.env.CLIENT_RELEASE_DATE ?? ''
)
const directory = path.resolve(import.meta.dir, '../dist/client-release')
const assets = verifyClientAssets(
	plan.version,
	Object.fromEntries(
		readdirSync(directory).map((name) => [name, readFileSync(path.join(directory, name))])
	)
)
writeFileSync(
	path.join(directory, 'client-release.json'),
	JSON.stringify(
		{
			...plan,
			assets,
			signing: {
				linux: 'Unsigned test packages',
				macos: 'Ad-hoc signed; not notarized',
				android: 'Debug signed; not a durable release identity'
			}
		},
		null,
		2
	) + '\n'
)
writeFileSync(
	path.join(directory, 'SHA256SUMS'),
	assets.map((asset) => `${asset.sha256}  ${asset.name}`).join('\n') + '\n'
)
