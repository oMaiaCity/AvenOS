import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { solveChallenge } from '../src/lib/proof-of-work.js'
import {
	hasLeadingZeroBits,
	ProofOfWorkError,
	ProofOfWorkService,
	proofDigest
} from '../src/lib/server/proof-of-work.js'
import { sha256 } from '../src/lib/sha256.js'
import { createTestDatabase, type TestDatabase } from './helpers.js'

async function solve(service: ProofOfWorkService): Promise<{ id: string; proof: string }> {
	const challenge = await service.issue('secure-name')
	for (let counter = 0; counter < 1_000_000; counter += 1) {
		if (
			hasLeadingZeroBits(
				proofDigest(challenge.id, challenge.nonce, 'secure-name', counter),
				challenge.difficultyBits
			)
		) {
			return { id: challenge.id, proof: `${challenge.id}.${counter}` }
		}
	}
	throw new Error('unsolvable')
}

describe('proof of work', () => {
	let database: TestDatabase
	beforeAll(async () => {
		database = await createTestDatabase()
	})
	afterAll(async () => {
		await database.teardown()
	})

	const service = () => new ProofOfWorkService(database.pool, 8, 300)

	it('accepts a valid solved challenge exactly once', async () => {
		const s = service()
		const { proof } = await solve(s)
		await expect(s.verifyAndConsume('secure-name', proof)).resolves.toBeUndefined()
		await expect(s.verifyAndConsume('secure-name', proof)).rejects.toThrow(ProofOfWorkError)
	})

	it('rejects a missing or malformed proof', async () => {
		const s = service()
		await expect(s.verifyAndConsume('secure-name', undefined)).rejects.toThrow(
			'Complete the local proof-of-work'
		)
		await expect(s.verifyAndConsume('secure-name', 'nonsense')).rejects.toThrow(ProofOfWorkError)
	})

	it('rejects an unsolved counter', async () => {
		const s = service()
		const challenge = await s.issue('secure-name')
		let wrong = 0
		while (
			hasLeadingZeroBits(
				proofDigest(challenge.id, challenge.nonce, 'secure-name', wrong),
				challenge.difficultyBits
			)
		)
			wrong += 1
		await expect(s.verifyAndConsume('secure-name', `${challenge.id}.${wrong}`)).rejects.toThrow(
			'does not satisfy'
		)
	})

	it('rejects an expired challenge', async () => {
		const s = service()
		const { proof } = await solve(s)
		await expect(s.verifyAndConsume('secure-name', proof, Date.now() + 301_000)).rejects.toThrow(
			'expired'
		)
	})

	// The browser solver uses its own synchronous SHA-256 — it must agree with
	// node:crypto bit for bit, including multi-block and empty inputs.
	it('client sha256 matches node:crypto', () => {
		for (const length of [0, 1, 31, 55, 56, 63, 64, 65, 100, 127, 128, 200]) {
			const input = new Uint8Array(randomBytes(length))
			expect(Buffer.from(sha256(input)).toString('hex')).toBe(
				createHash('sha256').update(input).digest('hex')
			)
		}
	})

	it('the client solver produces a proof the server accepts', async () => {
		const s = service()
		const challenge = await s.issue('secure-name')
		const counter = await solveChallenge(challenge)
		await expect(
			s.verifyAndConsume('secure-name', `${challenge.id}.${counter}`)
		).resolves.toBeUndefined()
	})
})
