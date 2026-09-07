import { Actor } from '@avenos/actors'
import { artifact, failure, manifest, object, success, wholeArtifact } from '../../shared'
import { normalizeStatement } from '../statement-normalizer'

export function createStatementTransactionFanoutActor(): Actor {
	return new Actor(
		manifest(
			'statement-transaction-fanout',
			'Statement transaction fan-out',
			'Publishes one bounded batch of statement rows as first-class transactions.',
			'document_fanout_statement_transactions',
			[
				'ceo.aven.bookkeeping.statement_candidate(F, S)',
				'ceo.aven.bookkeeping.statement_validation(S, V)',
				'ceo.aven.banking.statement(S, N)'
			],
			['ceo.aven.banking.transaction(N, T)']
		),
		{
			document_fanout_statement_transactions: async (payload) => {
				try {
					const offset = payload.offset
					if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 127) {
						throw new Error('statement transaction offset is invalid')
					}
					const normalized = await normalizeStatement(
						object(payload.candidate, 'statement candidate'),
						object(payload.validation, 'statement validation')
					)
					const batch = normalized.transactions.slice(Number(offset), Number(offset) + 64)
					if (batch.length === 0) throw new Error('statement transaction batch is empty')
					return success(
						{
							ok: true,
							procedureKey: 'client.fanout-statement-transactions',
							artifacts: batch.map((transaction, ordinal) => {
								const sourceOrdinal = Number(offset) + ordinal
								return artifact(
									`transaction-${String(sourceOrdinal + 1).padStart(3, '0')}`,
									'banking.transaction',
									{ ...transaction },
									'transaction',
									ordinal
								)
							}),
							evidence: batch.map((_, ordinal) => {
								const sourceOrdinal = Number(offset) + ordinal
								return {
									ordinal,
									outputLocalKey: `transaction-${String(sourceOrdinal + 1).padStart(3, '0')}`,
									outputLocator: wholeArtifact(),
									inputRole: 'candidate',
									inputOrdinal: 0,
									inputLocator: {
										kind: 'json-pointer' as const,
										pointer: `/transactions/${sourceOrdinal}`
									}
								}
							})
						},
						`Published statement transactions ${Number(offset) + 1}-${Number(offset) + batch.length}.`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
