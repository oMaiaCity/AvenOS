import { Actor } from '@avenos/actors'
import type { StatementTransaction, ValidationStatus } from '../../reconciliation'
import { artifact, failure, manifest, object, success, wholeArtifact } from '../../shared'

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function money(value: unknown): number | null {
	return Number.isSafeInteger(value) ? Number(value) : null
}

function compact(value: string): string {
	return value
		.normalize('NFKC')
		.toUpperCase()
		.replace(/[^\p{L}\p{N}]+/gu, '')
}

function validationStatus(value: unknown): ValidationStatus {
	return value === 'consistent' ||
		value === 'inconsistent' ||
		value === 'incomplete' ||
		value === 'insufficient-coverage'
		? value
		: 'incomplete'
}

async function digest(value: string): Promise<string> {
	const bytes = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
	)
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function coverage(transactionCount: number): StatementTransaction['statementCoverage'] {
	if (transactionCount >= 128) return 'row-limit-reached'
	// PR #188 validates the extracted values, but it does not prove that the model
	// observed every source row. Only a closed connector capture or a later
	// source-coverage proof may upgrade this to `verified`.
	return 'unverified'
}

export interface NormalizedStatement {
	statement: Record<string, unknown>
	transactions: StatementTransaction[]
}

export async function normalizeStatement(
	candidate: Record<string, unknown>,
	validation: Record<string, unknown>
): Promise<NormalizedStatement> {
	if (!Array.isArray(candidate.transactions)) throw new Error('statement transactions are invalid')
	const accountIban = text(candidate.accountIban)
	const accountNumber = text(candidate.accountNumber)
	const institution =
		candidate.institution === null ? null : object(candidate.institution, 'statement institution')
	const derivedIdentity = [
		text(institution?.name),
		text(candidate.accountHolder),
		text(candidate.productName)
	]
		.filter(Boolean)
		.join('|')
	const accountRef = accountIban
		? `iban:${compact(accountIban)}`
		: accountNumber
			? `account:${await digest(JSON.stringify([compact(text(institution?.name) ?? ''), compact(text(institution?.city) ?? ''), compact(accountNumber)]))}`
			: `derived:${(await digest(derivedIdentity || String(candidate.summary))).slice(0, 32)}`
	const accountIdentityBasis = accountIban ? 'iban' : accountNumber ? 'account-number' : 'derived'
	const status = validationStatus(validation.status)
	const statementCoverage = coverage(candidate.transactions.length)
	const transactions: StatementTransaction[] = []
	for (const [sourceOrdinal, raw] of candidate.transactions.entries()) {
		const transaction = object(raw, 'statement transaction')
		const providerTransactionId = text(transaction.transactionId)
		const fingerprint = [
			accountRef,
			text(transaction.bookingDate) ?? '',
			String(money(transaction.amountMinor) ?? ''),
			text(candidate.currency)?.toUpperCase() ?? '',
			compact(text(transaction.counterpartyIban) ?? ''),
			text(transaction.counterpartyName) ?? '',
			text(transaction.description) ?? ''
		].join('|')
		const dedupBasis = providerTransactionId ? 'provider-id' : 'fingerprint'
		const dedupKey = providerTransactionId
			? `provider:${await digest(`${accountRef}\u0000${providerTransactionId.normalize('NFKC')}`)}`
			: `fingerprint:${await digest(fingerprint)}`
		transactions.push({
			dedupKey,
			dedupBasis,
			accountRef,
			providerTransactionId,
			bookingDate: text(transaction.bookingDate),
			valueDate: text(transaction.valueDate),
			title: text(transaction.title),
			amountMinor: money(transaction.amountMinor),
			currency: text(candidate.currency)?.toUpperCase() ?? null,
			counterpartyName: text(transaction.counterpartyName),
			counterpartyIban: text(transaction.counterpartyIban),
			description: text(transaction.description),
			originalAmountMinor: money(transaction.originalAmountMinor),
			originalCurrency: text(transaction.originalCurrency)?.toUpperCase() ?? null,
			exchangeRate: text(transaction.exchangeRate),
			fxSurchargeMinor: money(transaction.fxSurchargeMinor),
			foreignExchangeFeeBps: money(transaction.foreignExchangeFeeBps),
			balanceAfterMinor: money(transaction.balanceAfterMinor),
			sourceRow: money(transaction.sourceRow),
			sourceOrdinal,
			statementValidationStatus: status,
			statementCoverage
		})
	}

	return {
		statement: {
			statementKind: String(candidate.statementKind),
			accountRef,
			accountIdentityBasis,
			currency: text(candidate.currency)?.toUpperCase() ?? null,
			accountHolder: text(candidate.accountHolder),
			institutionName: text(institution?.name),
			periodStart: text(candidate.periodStart),
			periodEnd: text(candidate.periodEnd),
			openingBalanceMinor: money(candidate.openingBalanceMinor),
			closingBalanceMinor: money(candidate.closingBalanceMinor),
			transactionCount: transactions.length,
			validationStatus: status,
			coverage: statementCoverage,
			summary: String(candidate.summary)
		},
		transactions
	}
}

export function createStatementNormalizerActor(): Actor {
	return new Actor(
		manifest(
			'statement-normalizer',
			'Statement transaction normalizer',
			'Normalizes a validated statement into a canonical reconciliation source.',
			'document_normalize_statement',
			[
				'ceo.aven.bookkeeping.statement_candidate(F, S)',
				'ceo.aven.bookkeeping.statement_validation(S, V)'
			],
			['ceo.aven.banking.statement(S, N)']
		),
		{
			document_normalize_statement: async (payload) => {
				try {
					const normalized = await normalizeStatement(
						object(payload.candidate, 'statement candidate'),
						object(payload.validation, 'statement validation')
					)
					return success(
						{
							ok: true,
							procedureKey: 'client.normalize-statement',
							artifacts: [
								artifact(
									'normalized-statement',
									'banking.statement',
									normalized.statement,
									'statement'
								)
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'normalized-statement',
									outputLocator: wholeArtifact(),
									inputRole: 'candidate',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								},
								{
									ordinal: 1,
									outputLocalKey: 'normalized-statement',
									outputLocator: { kind: 'json-pointer', pointer: '/validationStatus' },
									inputRole: 'validation',
									inputOrdinal: 0,
									inputLocator: { kind: 'json-pointer', pointer: '/status' }
								}
							]
						},
						`Normalized a statement containing ${normalized.transactions.length} transaction(s).`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
