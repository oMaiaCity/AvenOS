import { Actor } from '@avenos/actors'
import { artifact, failure, manifest, object, success, wholeArtifact } from '../../shared'

export function createStatementValidatorActor(): Actor {
	return new Actor(
		manifest(
			'statement-validator',
			'Statement validator',
			'Runs the statement-core-v1 balance, period, and payment-receipt checks.',
			'document_validate_statement',
			['ceo.aven.bookkeeping.statement_candidate(F, S)'],
			['ceo.aven.bookkeeping.statement_validation(S, V)']
		),
		{
			document_validate_statement: (payload) => {
				try {
					const candidate = object(payload.candidate, 'statement candidate')
					if (!Array.isArray(candidate.transactions)) {
						throw new Error('statement transactions are invalid')
					}
					const transactions = candidate.transactions.map((item) =>
						object(item, 'statement transaction')
					)
					const amounts = transactions.map((transaction) => transaction.amountMinor)
					const allAmounts = amounts.every((amount) => typeof amount === 'number')
					const balance =
						typeof candidate.openingBalanceMinor === 'number' &&
						typeof candidate.closingBalanceMinor === 'number' &&
						allAmounts
							? candidate.openingBalanceMinor +
									amounts.reduce<number>((sum, amount) => sum + Number(amount), 0) ===
								candidate.closingBalanceMinor
								? 'PASS'
								: 'FAIL'
							: 'UNKNOWN'
					const period =
						typeof candidate.periodStart === 'string' && typeof candidate.periodEnd === 'string'
							? candidate.periodStart <= candidate.periodEnd
								? 'PASS'
								: 'FAIL'
							: 'UNKNOWN'
					const receipt =
						candidate.statementKind === 'payment-receipt'
							? transactions.length === 1 &&
								typeof transactions[0]?.amountMinor === 'number' &&
								transactions[0].amountMinor < 0
								? 'PASS'
								: 'FAIL'
							: 'UNKNOWN'
					const outcomes = [balance, period, receipt]
					const status = outcomes.includes('FAIL')
						? 'inconsistent'
						: outcomes.every((outcome) => outcome === 'UNKNOWN')
							? 'incomplete'
							: 'consistent'
					const validation = {
						rulesetVersion: 'statement-core-v1',
						status,
						coverageBps: Math.floor(
							(outcomes.filter((outcome) => outcome !== 'UNKNOWN').length * 10_000) /
								outcomes.length
						),
						checks: [
							{
								ruleId: 'statement.opening-plus-transactions-equals-closing',
								outcome: balance,
								severity: 'hard',
								paths: ['/openingBalanceMinor', '/transactions', '/closingBalanceMinor'],
								message:
									'Opening balance plus transaction amounts should equal closing balance when all operands are printed.'
							},
							{
								ruleId: 'statement.period-ordered',
								outcome: period,
								severity: 'hard',
								paths: ['/periodStart', '/periodEnd'],
								message: 'Statement period start must not be after period end.'
							},
							{
								ruleId: 'statement.payment-receipt-shape',
								outcome: receipt,
								severity: 'soft',
								paths: ['/statementKind', '/transactions'],
								message: 'A payment receipt should contain exactly one outgoing transaction.'
							}
						]
					}
					return success(
						{
							ok: true,
							procedureKey: 'client.validate-statement',
							artifacts: [
								artifact('validation', 'banking.statement-validation', validation, 'validation')
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'validation',
									outputLocator: wholeArtifact(),
									inputRole: 'candidate',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								}
							]
						},
						`Statement validation is ${status}.`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
