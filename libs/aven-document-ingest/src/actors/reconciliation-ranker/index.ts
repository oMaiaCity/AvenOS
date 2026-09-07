import { Actor } from '@avenos/actors'
import {
	type OpenItem,
	rankInvoiceTransactions,
	type StatementTransaction
} from '../../reconciliation'
import { artifact, failure, manifest, object, success, wholeArtifact } from '../../shared'

export function createReconciliationRankerActor(): Actor {
	return new Actor(
		manifest(
			'reconciliation-ranker',
			'Invoice transaction ranker',
			'Ranks canonical bank transactions for one invoice open item with explainable evidence.',
			'reconciliation_rank_invoice_transactions',
			['ceo.aven.bookkeeping.open_item(I, O)', 'ceo.aven.banking.transaction(S, T)'],
			['ceo.aven.reconciliation.match_candidate(O, T, M)']
		),
		{
			reconciliation_rank_invoice_transactions: (payload) => {
				try {
					const openItem = object(payload.openItem, 'open item') as unknown as OpenItem
					if (!Array.isArray(payload.transactions)) {
						throw new Error('reconciliation transactions are invalid')
					}
					if (payload.transactions.length < 1 || payload.transactions.length > 64) {
						throw new Error('reconciliation requires 1-64 transaction candidates')
					}
					const transactions = payload.transactions.map(
						(value) =>
							object(value, 'reconciliation transaction') as unknown as StatementTransaction
					)
					const ranked = rankInvoiceTransactions(openItem, transactions)
					const artifacts = ranked.map((candidate, ordinal) =>
						artifact(
							`match-${String(ordinal + 1).padStart(3, '0')}`,
							'reconciliation.match-candidate',
							{ ...candidate },
							'match-candidate',
							ordinal
						)
					)
					return success(
						{
							ok: true,
							procedureKey: 'client.rank-invoice-transactions',
							artifacts,
							evidence: ranked.flatMap((candidate, ordinal) => {
								const inputOrdinal = candidate.transactionInputOrdinal
								if (inputOrdinal === undefined) {
									throw new Error('ranked transaction is not present in the actor inputs')
								}
								const outputLocalKey = `match-${String(ordinal + 1).padStart(3, '0')}`
								return [
									{
										ordinal: ordinal * 2,
										outputLocalKey,
										outputLocator: wholeArtifact(),
										inputRole: 'open-item',
										inputOrdinal: 0,
										inputLocator: wholeArtifact()
									},
									{
										ordinal: ordinal * 2 + 1,
										outputLocalKey,
										outputLocator: {
											kind: 'json-pointer' as const,
											pointer: '/transactionDedupKey'
										},
										inputRole: 'transaction',
										inputOrdinal,
										inputLocator: { kind: 'json-pointer' as const, pointer: '/dedupKey' }
									}
								]
							})
						},
						`Ranked ${ranked.length} transaction candidate(s).`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
