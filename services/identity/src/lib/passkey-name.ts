import { z } from 'zod'

export const passkeyNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(128)
	.regex(/^[^\p{Cc}]+$/u)

// Password managers may show either WebAuthn label. Keep the chosen name in
// both before creation, without changing the user handle or ceremony settings.
export function namePasskeyRegistration<T extends { user: { name: string; displayName: string } }>(
	options: T,
	name: string
): T {
	const label = passkeyNameSchema.parse(name)
	return { ...options, user: { ...options.user, name: label, displayName: label } }
}

// A friendly suggestion, not device identification: synced credentials can be
// used elsewhere. No fingerprinting or permission prompt is needed for a label.
export function defaultPasskeyName(email: string, userAgent: string): string {
	const device = /Android/i.test(userAgent)
		? 'Android'
		: /iPhone/i.test(userAgent)
			? 'iPhone'
			: /iPad/i.test(userAgent)
				? 'iPad'
				: /Macintosh|Mac OS X/i.test(userAgent)
					? 'Mac'
					: /Windows/i.test(userAgent)
						? 'Windows'
						: /Linux/i.test(userAgent)
							? 'Linux'
							: 'device'
	const browser = /Edg\//i.test(userAgent)
		? 'Edge'
		: /Firefox|FxiOS/i.test(userAgent)
			? 'Firefox'
			: /Chrome|CriOS/i.test(userAgent)
				? 'Chrome'
				: /Safari/i.test(userAgent)
					? 'Safari'
					: ''
	const user =
		email
			.trim()
			.replace(/\p{Cc}/gu, '')
			.slice(0, 80) || 'account'
	return ['aven.id', user, device, browser].filter(Boolean).join('-')
}
