import { createHash } from 'node:crypto'
import type pg from 'pg'
import { describe, expect, test, vi } from 'vitest'
import { hasLeadingZeroBits, ProofOfWorkService } from '../src/lib/server/proof-of-work.js'

const now = 2_000_000_000_000
const secret = 'unit-test-only-proof-signing-key-32-bytes'
const challengeService = () => {
	const used = new Set<string>()
	const query = vi.fn(async (_sql: string, values: unknown[]) => {
		const id = String(values[0])
		if (used.has(id)) return { rows: [], rowCount: 0 }
		used.add(id)
		return { rows: [{ id }], rowCount: 1 }
	})
	return { service: new ProofOfWorkService({ query } as unknown as pg.Pool, 8, 300, secret), query }
}
async function solved(service: ProofOfWorkService, issuedAt = now) {
	const challenge = await service.issue(issuedAt)
	for (let counter = 0; ; counter++) {
		const hash = createHash('sha256')
			.update(`${challenge.id}:${challenge.nonce}:${challenge.purpose}:${counter}`)
			.digest()
		if (hasLeadingZeroBits(hash, challenge.difficultyBits)) return `${challenge.id}.${counter}`
	}
}

describe('stateless identity proofs', () => {
	test('one million unused challenges perform no database calls', async () => {
		const { service, query } = challengeService()
		for (let i = 0; i < 1_000_000; i++) await service.issue(now)
		expect(query).not.toHaveBeenCalled()
	}, 60_000)
	test('persists only a fixed-size digest after successful verification', async () => {
		const { service, query } = challengeService()
		await service.verifyAndConsume(await solved(service), now)
		expect(query).toHaveBeenCalledOnce()
		expect(query.mock.calls[0][1]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/), now + 300_000])
	})
	test('one successful redemption across concurrent callers', async () => {
		const { service } = challengeService()
		const proof = await solved(service)
		const results = await Promise.allSettled(
			Array.from({ length: 100 }, () => service.verifyAndConsume(proof, now))
		)
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
	})
	test('expiry is exclusive and rejection writes nothing', async () => {
		const { service, query } = challengeService()
		await expect(service.verifyAndConsume(await solved(service), now + 300_000)).rejects.toThrow()
		expect(query).not.toHaveBeenCalled()
	})
	test('daily key rollover accepts a pending challenge only inside its lifetime', async () => {
		const { service } = challengeService()
		const boundary = Math.ceil(now / 86_400_000) * 86_400_000
		const proof = await solved(service, boundary - 1000)
		await expect(service.verifyAndConsume(proof, boundary + 1000)).resolves.toBeUndefined()
		await expect(service.verifyAndConsume(proof, boundary + 300_000)).rejects.toThrow()
	})
	test('rejects other signing roots, altered payloads, future issuance and oversized inputs before storage', async () => {
		const { service, query } = challengeService()
		const other = new ProofOfWorkService(
			{ query } as unknown as pg.Pool,
			8,
			300,
			'another-test-only-signing-root-key-32'
		)
		const proof = await solved(service)
		await expect(other.verifyAndConsume(proof, now)).rejects.toThrow()
		await expect(service.verifyAndConsume(`A${proof.slice(1)}`, now)).rejects.toThrow()
		await expect(service.verifyAndConsume(await solved(service, now + 1), now)).rejects.toThrow()
		await expect(service.verifyAndConsume('x'.repeat(1025), now)).rejects.toThrow()
		expect(query).not.toHaveBeenCalled()
	})
	test('cleanup has an expiry cutoff, fixed batch and skip-locked selection', async () => {
		const { service, query } = challengeService()
		await service.cleanup(now)
		expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2 FOR UPDATE SKIP LOCKED'), [
			now,
			1000
		])
	})
})
