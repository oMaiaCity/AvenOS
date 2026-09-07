import { bigint, index, integer, pgTable, text } from 'drizzle-orm/pg-core'

export const proofOfWorkChallenges = pgTable(
	'proof_of_work_challenges',
	{
		id: text('id').primaryKey(),
		nonce: text('nonce').notNull(),
		purpose: text('purpose').notNull(),
		difficultyBits: integer('difficulty_bits').notNull(),
		expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
		usedAt: bigint('used_at', { mode: 'number' }),
		createdAt: bigint('created_at', { mode: 'number' }).notNull()
	},
	(table) => [index('proof_of_work_challenges_expiry_idx').on(table.expiresAt)]
)
