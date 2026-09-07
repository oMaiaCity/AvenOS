import { createHash } from 'node:crypto'

export const clientPlatforms = ['linux-x64', 'macos-arm64', 'android-arm64'] as const
export type ClientPlatform = (typeof clientPlatforms)[number]

export function clientReleasePlan(ref: string, sha: string, run: string, date: string) {
	if (!['refs/heads/next', 'refs/heads/prod'].includes(ref))
		throw new Error('Client releases must run from protected next or prod.')
	if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('An immutable source commit is required.')
	if (!/^[1-9]\d{0,8}$/.test(run)) throw new Error('Invalid release run number.')
	if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
		throw new Error('Invalid release date.')
	const target = ref === 'refs/heads/prod' ? 'production' : 'next'
	const [year, month, day] = date.split('-').map(Number)
	const version = `${year - 2000}.${month}.${day}-${target}.${run}`
	return {
		version,
		source: sha,
		ref,
		target,
		tag: `client-v${version}`,
		// Keep these builds unmistakably prerelease until durable Android signing
		// and Developer ID notarization have been configured and verified.
		prerelease: true,
		apiOrigin: target === 'production' ? 'https://api.aven.ceo' : 'https://api.next.aven.ceo',
		identityOrigin: 'https://aven.id',
		androidVersionCode: 30_000_000 + Number(run)
	}
}

export function clientAssetNames(version: string): string[] {
	if (!/^\d+\.\d+\.\d+-(?:next|production)\.[1-9]\d*$/.test(version))
		throw new Error('Invalid client version.')
	return [
		`avenOS-${version}-linux-x64.deb`,
		`avenOS-${version}-linux-x64.AppImage`,
		`avenOS-${version}-macos-arm64.dmg`,
		`avenOS-${version}-android-arm64-debug.apk`
	]
}

export function verifyClientAssets(version: string, files: Record<string, Uint8Array>) {
	const expected = clientAssetNames(version)
	if (Object.keys(files).sort().join('\n') !== [...expected].sort().join('\n'))
		throw new Error('Exactly the Linux DEB/AppImage, macOS DMG, and Android APK are required.')
	return expected.map((name) => {
		const bytes = Buffer.from(files[name])
		const valid = name.endsWith('.deb')
			? bytes.subarray(0, 8).toString() === '!<arch>\n'
			: name.endsWith('.AppImage')
				? bytes.subarray(0, 4).equals(Buffer.from([0x7f, 69, 76, 70])) &&
					bytes.subarray(8, 11).equals(Buffer.from([65, 73, 2]))
				: name.endsWith('.dmg')
					? bytes.subarray(-512, -508).toString() === 'koly'
					: bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
		if (bytes.length < 1024 || !valid) throw new Error(`Not a valid installer: ${name}`)
		return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
	})
}
