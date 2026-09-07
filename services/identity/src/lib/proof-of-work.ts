import type { ProofChallenge } from './types.js'

function leadingZeroBits(bytes: Uint8Array, bits: number): boolean {
	const complete = Math.floor(bits / 8)
	for (let index = 0; index < complete; index += 1) if (bytes[index] !== 0) return false
	const remaining = bits % 8
	return remaining === 0 || ((bytes[complete] ?? 255) & (0xff << (8 - remaining))) === 0
}

export async function proofHeader(): Promise<Record<string, string>> {
	const response = await fetch('/api/pow/challenge', { credentials: 'same-origin' })
	if (!response.ok) throw new Error('Could not obtain a sign-in challenge.')
	const challenge = (await response.json()) as ProofChallenge
	const encoder = new TextEncoder()
	for (let counter = 0; counter < Number.MAX_SAFE_INTEGER; counter += 1) {
		const digest = new Uint8Array(
			await crypto.subtle.digest(
				'SHA-256',
				encoder.encode(`${challenge.id}:${challenge.nonce}:${challenge.purpose}:${counter}`)
			)
		)
		if (leadingZeroBits(digest, challenge.difficultyBits))
			return { 'x-proof-of-work': `${challenge.id}.${counter}` }
	}
	throw new Error('Could not solve the sign-in challenge.')
}
