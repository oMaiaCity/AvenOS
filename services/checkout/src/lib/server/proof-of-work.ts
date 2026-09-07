import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type pg from 'pg'
import type { ProofOfWorkChallenge, ProofOfWorkPurpose } from '$lib/types.js'
import { withTransaction } from './db.js'

export const proofOfWorkPurposes = new Set<ProofOfWorkPurpose>(['secure-name'])

export class ProofOfWorkError extends Error {
	constructor(
		public readonly code: string,
		message: string
	) {
		super(message)
	}
}

export function hasLeadingZeroBits(digest: Uint8Array, bits: number): boolean {
	const completeBytes = Math.floor(bits / 8)
	for (let index = 0; index < completeBytes; index += 1) if (digest[index] !== 0) return false
	const remainingBits = bits % 8
	return (
		remainingBits === 0 || ((digest[completeBytes] ?? 255) & (0xff << (8 - remainingBits))) === 0
	)
}

export function proofDigest(
	id: string,
	nonce: string,
	purpose: ProofOfWorkPurpose,
	counter: number
): Buffer {
	return createHash('sha256').update(`${id}:${nonce}:${purpose}:${counter}`, 'utf8').digest()
}

interface ChallengeRow {
	id: string
	nonce: string
	purpose: string
	difficulty_bits: number
	expires_at: number
	used_at: number | null
}

export class ProofOfWorkService {
	constructor(
		private readonly pool: pg.Pool,
		private readonly difficultyBits: number,
		private readonly ttlSeconds: number
	) {}

	async issue(purpose: ProofOfWorkPurpose, now = Date.now()): Promise<ProofOfWorkChallenge> {
		await this.pool.query(
			'DELETE FROM proof_of_work_challenges WHERE expires_at < $1 OR (used_at IS NOT NULL AND used_at < $2)',
			[now, now - this.ttlSeconds * 1_000]
		)
		const challenge: ProofOfWorkChallenge = {
			id: randomUUID(),
			nonce: randomBytes(32).toString('base64url'),
			purpose,
			difficultyBits: this.difficultyBits,
			expiresAt: now + this.ttlSeconds * 1_000
		}
		await this.pool.query(
			'INSERT INTO proof_of_work_challenges(id,nonce,purpose,difficulty_bits,expires_at,used_at,created_at) VALUES($1,$2,$3,$4,$5,NULL,$6)',
			[
				challenge.id,
				challenge.nonce,
				challenge.purpose,
				challenge.difficultyBits,
				challenge.expiresAt,
				now
			]
		)
		return challenge
	}

	async verifyAndConsume(
		purpose: ProofOfWorkPurpose,
		proof: string | undefined,
		now = Date.now()
	): Promise<void> {
		if (!proof)
			throw new ProofOfWorkError(
				'PROOF_OF_WORK_REQUIRED',
				'Complete the local proof-of-work challenge and retry.'
			)
		const separator = proof.lastIndexOf('.')
		const id = separator > 0 ? proof.slice(0, separator) : ''
		const counterText = separator > 0 ? proof.slice(separator + 1) : ''
		if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d{1,16}$/.test(counterText))
			throw new ProofOfWorkError(
				'PROOF_OF_WORK_INVALID',
				'The proof-of-work response is malformed.'
			)
		const counter = Number(counterText)
		if (!Number.isSafeInteger(counter) || counter < 0)
			throw new ProofOfWorkError('PROOF_OF_WORK_INVALID', 'The proof-of-work counter is invalid.')

		await withTransaction(this.pool, async (client) => {
			const row = (
				await client.query<ChallengeRow>(
					'SELECT id,nonce,purpose,difficulty_bits,expires_at,used_at FROM proof_of_work_challenges WHERE id=$1 FOR UPDATE',
					[id]
				)
			).rows[0]
			if (!row || row.purpose !== purpose)
				throw new ProofOfWorkError(
					'PROOF_OF_WORK_INVALID',
					'The proof-of-work challenge is invalid for this operation.'
				)
			if (row.used_at !== null)
				throw new ProofOfWorkError(
					'PROOF_OF_WORK_USED',
					'The proof-of-work challenge has already been used. Retry to create a new challenge.'
				)
			if (row.expires_at < now)
				throw new ProofOfWorkError(
					'PROOF_OF_WORK_EXPIRED',
					'The proof-of-work challenge expired. Retry to create a new challenge.'
				)
			if (
				!hasLeadingZeroBits(proofDigest(row.id, row.nonce, purpose, counter), row.difficulty_bits)
			)
				throw new ProofOfWorkError(
					'PROOF_OF_WORK_INVALID',
					'The proof-of-work response does not satisfy the challenge.'
				)
			const result = await client.query(
				'UPDATE proof_of_work_challenges SET used_at=$1 WHERE id=$2 AND used_at IS NULL',
				[now, id]
			)
			if (result.rowCount !== 1)
				throw new ProofOfWorkError(
					'PROOF_OF_WORK_USED',
					'The proof-of-work challenge has already been used. Retry to create a new challenge.'
				)
		})
	}
}
