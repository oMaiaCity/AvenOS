import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type pg from 'pg'

export type ProofPurpose = 'sign-in'
export const protectedAuthPaths = new Set(['/api/auth/passkey/verify-authentication'])
const GENERATION_MS = 86_400_000
export const MAX_PROOF_TTL_SECONDS = 3_600
export const REDEMPTION_CLEANUP_BATCH = 1_000
export class ProofOfWorkError extends Error {
	constructor(
		public code: string,
		message: string
	) {
		super(message)
	}
}
const digest = (id: string, nonce: string, purpose: string, counter: number) =>
	createHash('sha256').update(`${id}:${nonce}:${purpose}:${counter}`).digest()
const invalid = () =>
	new ProofOfWorkError('PROOF_OF_WORK_INVALID', 'The proof is invalid or expired.')
export function hasLeadingZeroBits(value: Uint8Array, bits: number): boolean {
	const bytes = Math.floor(bits / 8)
	for (let index = 0; index < bytes; index += 1) if (value[index] !== 0) return false
	const remaining = bits % 8
	return remaining === 0 || ((value[bytes] ?? 255) & (0xff << (8 - remaining))) === 0
}
export class ProofOfWorkService {
	private metrics = {
		issued: 0,
		accepted: 0,
		rejected: 0,
		invalidSignatures: 0,
		expired: 0,
		replays: 0,
		cleanupDeleted: 0,
		verificationMilliseconds: 0
	}
	snapshot() {
		return { ...this.metrics }
	}
	constructor(
		private pool: pg.Pool,
		private difficulty: number,
		private ttlSeconds: number,
		private secret: string
	) {
		if (
			secret.length < 32 ||
			!Number.isInteger(difficulty) ||
			difficulty < 8 ||
			difficulty > 28 ||
			!Number.isInteger(ttlSeconds) ||
			ttlSeconds < 1 ||
			ttlSeconds > MAX_PROOF_TTL_SECONDS
		)
			throw new Error('Invalid proof-of-work configuration')
	}
	private signature(payload: string, generation: number): Buffer {
		const key = createHmac('sha256', this.secret)
			.update(`aven.identity.proof-of-work.v1:${generation}`)
			.digest()
		return createHmac('sha256', key).update(payload).digest()
	}
	async issue(now = Date.now()) {
		this.metrics.issued++
		const nonce = randomBytes(32).toString('base64url')
		const expiresAt = now + this.ttlSeconds * 1000
		const generation = Math.floor(now / GENERATION_MS)
		const payload = Buffer.from(
			JSON.stringify([1, generation, 'sign-in', this.difficulty, now, expiresAt, nonce])
		).toString('base64url')
		// The signed ID is opaque to clients; the existing digest/counter protocol is unchanged.
		return {
			id: `${payload}.${this.signature(payload, generation).toString('base64url')}`,
			nonce,
			purpose: 'sign-in' as const,
			difficultyBits: this.difficulty,
			expiresAt
		}
	}
	async verifyAndConsume(proof: string | null, now = Date.now()): Promise<void> {
		const started = performance.now()
		try {
			await this.consume(proof, now)
			this.metrics.accepted++
		} catch (error) {
			this.metrics.rejected++
			throw error
		} finally {
			this.metrics.verificationMilliseconds += performance.now() - started
		}
	}
	private async consume(proof: string | null, now: number): Promise<void> {
		if (!proof)
			throw new ProofOfWorkError('PROOF_OF_WORK_REQUIRED', 'Complete the proof-of-work challenge.')
		if (proof.length > 1024) throw invalid()
		const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})\.(0|[1-9][0-9]{0,15})$/.exec(proof)
		if (!match) throw invalid()
		const [, payload, signature, counterText] = match
		let fields: unknown
		try {
			fields = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
		} catch {
			throw invalid()
		}
		if (!Array.isArray(fields) || fields.length !== 7) throw invalid()
		const [version, generation, purpose, difficulty, issuedAt, expiresAt, nonce] = fields
		const currentGeneration = Math.floor(now / GENERATION_MS)
		if (
			version !== 1 ||
			!Number.isSafeInteger(generation) ||
			(generation !== currentGeneration && generation !== currentGeneration - 1)
		)
			throw invalid()
		const expectedSignature = this.signature(payload, generation)
		const suppliedSignature = Buffer.from(signature, 'base64url')
		if (
			suppliedSignature.toString('base64url') !== signature ||
			suppliedSignature.length !== expectedSignature.length ||
			!timingSafeEqual(suppliedSignature, expectedSignature)
		) {
			this.metrics.invalidSignatures++
			throw invalid()
		}
		if (Number.isSafeInteger(expiresAt) && expiresAt <= now) {
			this.metrics.expired++
			throw invalid()
		}
		if (
			purpose !== 'sign-in' ||
			difficulty !== this.difficulty ||
			!Number.isSafeInteger(issuedAt) ||
			!Number.isSafeInteger(expiresAt) ||
			Math.floor(issuedAt / GENERATION_MS) !== generation ||
			issuedAt > now ||
			expiresAt <= now ||
			expiresAt <= issuedAt ||
			expiresAt - issuedAt > MAX_PROOF_TTL_SECONDS * 1000 ||
			typeof nonce !== 'string' ||
			!/^[A-Za-z0-9_-]{43}$/.test(nonce)
		)
			throw invalid()
		const counter = Number(counterText)
		const id = `${payload}.${signature}`
		if (
			!Number.isSafeInteger(counter) ||
			!hasLeadingZeroBits(digest(id, nonce, purpose, counter), difficulty)
		)
			throw invalid()
		// Only solved, authenticated challenges create a row. Concurrent redemption has one winner.
		const result = await this.pool.query(
			'INSERT INTO proof_of_work_redemptions(id,expires_at) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
			[createHash('sha256').update(id).digest('hex'), expiresAt]
		)
		if (!result.rows.length) {
			this.metrics.replays++
			throw invalid()
		}
	}
	async cleanup(now = Date.now()): Promise<number> {
		const result = await this.pool.query(
			`DELETE FROM proof_of_work_redemptions WHERE id IN (
			 SELECT id FROM proof_of_work_redemptions WHERE expires_at <= $1
			 ORDER BY expires_at LIMIT $2 FOR UPDATE SKIP LOCKED
			)`,
			[now, REDEMPTION_CLEANUP_BATCH]
		)
		const deleted = result.rowCount ?? 0
		this.metrics.cleanupDeleted += deleted
		return deleted
	}
}
