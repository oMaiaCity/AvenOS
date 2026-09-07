import { createCounterHasher } from '$lib/sha256.js'
import type { ApiError, ProofOfWorkChallenge, ProofOfWorkPurpose } from '$lib/types.js'

export function hasLeadingZeroBits(digest: Uint8Array, bits: number): boolean {
	const completeBytes = Math.floor(bits / 8)
	for (let index = 0; index < completeBytes; index += 1) if (digest[index] !== 0) return false
	const remainingBits = bits % 8
	return (
		remainingBits === 0 || ((digest[completeBytes] ?? 255) & (0xff << (8 - remainingBits))) === 0
	)
}

async function getChallenge(purpose: ProofOfWorkPurpose): Promise<ProofOfWorkChallenge> {
	const response = await fetch(`/api/pow/challenge?purpose=${encodeURIComponent(purpose)}`, {
		cache: 'no-store'
	})
	if (!response.ok) {
		const body = (await response.json().catch(() => ({
			message: 'Could not create a local proof-of-work challenge.'
		}))) as Partial<ApiError>
		throw new Error(body.message ?? 'Could not create a local proof-of-work challenge.')
	}
	const challenge = (await response.json()) as ProofOfWorkChallenge
	if (
		challenge.purpose !== purpose ||
		!Number.isInteger(challenge.difficultyBits) ||
		challenge.difficultyBits < 1
	)
		throw new Error('The server returned an invalid proof-of-work challenge.')
	return challenge
}

// Solves synchronously in chunks, yielding to the event loop between chunks
// so the UI stays responsive. The message prefix is encoded once and the
// counter digits are written into a reused buffer.
export async function solveChallenge(
	challenge: ProofOfWorkChallenge,
	deadline = () => Date.now() < challenge.expiresAt
): Promise<number> {
	const hash = createCounterHasher(
		new TextEncoder().encode(`${challenge.id}:${challenge.nonce}:${challenge.purpose}:`)
	)
	const chunkSize = 50_000
	let counter = 0
	while (deadline()) {
		for (const end = counter + chunkSize; counter < end; counter += 1) {
			if (hasLeadingZeroBits(hash(String(counter)), challenge.difficultyBits)) return counter
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
	}
	throw new Error('The local proof-of-work challenge expired. Please retry.')
}

export async function createProofOfWorkHeader(
	purpose: ProofOfWorkPurpose
): Promise<Record<string, string>> {
	const challenge = await getChallenge(purpose)
	const counter = await solveChallenge(challenge)
	return { 'x-proof-of-work': `${challenge.id}.${counter}` }
}
