import type { DocumentSource } from './shared'

export const CSV_DETECTOR_VERSION = 'csv-statement-v1'
export const CSV_MAX_BYTES = 1_000_000
export const CSV_MAX_RECORDS = 129

/** The same bounded byte decoding is used for display and statement recognition. */
export function decodeCsvText(bytes: Uint8Array): string {
	if (bytes.length > CSV_MAX_BYTES) throw new Error('CSV exceeds the 1 MB detection limit.')
	let text: string
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	} catch {
		text = new TextDecoder('windows-1252', { fatal: true }).decode(bytes)
	}
	if (
		[...text].some((c) => {
			const code = c.charCodeAt(0)
			return (code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159)
		})
	)
		throw new Error('CSV contains unsupported control characters.')
	return text
}

export function isCsvSource(source: Pick<DocumentSource, 'originalName' | 'declaredMediaType'>) {
	return (
		/\.csv$/i.test(source.originalName) ||
		['text/csv', 'application/csv'].includes(
			source.declaredMediaType.split(';')[0]!.trim().toLowerCase()
		)
	)
}

/** Lossless, bounded record parser. Malformed quotes never produce partial rows. */
export function parseCsv(text: string, delimiter: ',' | ';'): string[][] {
	if (text.length > CSV_MAX_BYTES || text.includes('\0'))
		throw new Error('CSV exceeds limits or contains NUL.')
	const rows: string[][] = []
	let row: string[] = [],
		cell = '',
		quoted = false,
		closed = false
	const field = () => {
		row.push(cell)
		cell = ''
		closed = false
		if (row.length > 64) throw new Error('CSV exceeds 64 columns.')
	}
	const record = () => {
		field()
		rows.push(row)
		row = []
		if (rows.length > CSV_MAX_RECORDS)
			throw new Error('CSV exceeds 128 transaction records; no partial import.')
	}
	text = text.replace(/^\uFEFF/, '')
	for (let i = 0; i < text.length; i++) {
		const c = text[i]!
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"'
				i++
			} else if (c === '"') {
				quoted = false
				closed = true
			} else cell += c
		} else if (c === delimiter) field()
		else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++
			record()
		} else if (c === '"' && cell === '' && !closed) quoted = true
		else {
			if (closed || c === '"') throw new Error('Malformed CSV quoting.')
			cell += c
		}
	}
	if (quoted) throw new Error('Unterminated CSV field.')
	if (row.length || cell.length || closed) record()
	return rows
}

const RABO = [
	'IBAN/BBAN',
	'Ccy',
	'BIC',
	'Seq No',
	'Date',
	'Value Date',
	'Amount',
	'Bal After Bkng',
	'Counterpty IBAN/BBAN',
	'Name Counterpty',
	'Name Ultimate Pty',
	'Name Initiating Pty',
	'Counterpty BIC',
	'Code',
	'Batch ID',
	'Transaction Reference',
	'Mandate Reference',
	'Collector ID',
	'Payment Reference',
	'Description-1',
	'Description-2',
	'Description-3',
	'Reasoncode',
	'Instr Amt',
	'Instr Ccy',
	'Rate'
]
const HASPA = [
	'Auftragskonto',
	'Buchungstag',
	'Valutadatum',
	'Buchungstext',
	'Verwendungszweck',
	'Glaeubiger ID',
	'Mandatsreferenz',
	'Kundenreferenz (End-to-End)',
	'Sammlerreferenz',
	'Lastschrift Ursprungsbetrag',
	'Auslagenersatz Ruecklastschrift',
	'Beguenstigter/Zahlungspflichtiger',
	'Kontonummer/IBAN',
	'BIC (SWIFT-Code)',
	'Betrag',
	'Waehrung',
	'Info'
]

function minor(value: string): number {
	// These admitted profiles use decimal comma and EUR. No locale guessing,
	// implicit zero, float rounding, grouping separators or currency conversion.
	if (!/^[+-]?\d{1,13},\d{2}$/.test(value)) throw new Error('Ambiguous or missing monetary value.')
	const n = Number(value.replace(',', ''))
	if (!Number.isSafeInteger(n)) throw new Error('Amount exceeds exact integer range.')
	return n
}

function date(value: string, german: boolean): string {
	if (german) {
		if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value))
			throw new Error('Date requires an explicit four-digit year.')
		value = value.slice(6) + '-' + value.slice(3, 5) + '-' + value.slice(0, 2)
	}
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString().slice(0, 10) !== value
	)
		throw new Error('Invalid or ambiguous date.')
	return value
}

function iban(value: string): boolean {
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false
	let remainder = 0
	for (const c of value.slice(4) + value.slice(0, 4)) {
		for (const digit of /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)
			remainder = (remainder * 10 + Number(digit)) % 97
	}
	return remainder === 1
}

export interface CsvDetection {
	sourceArtifactId: string
	sourceSha256: string
	detectorVersion: string
	eligible: boolean
	profile: string | null
	reason: string
	statement: Record<string, unknown> | null
}

export async function csvSourceDigest(source: DocumentSource): Promise<string> {
	const bytes = Uint8Array.from(atob(source.base64), (c) => c.charCodeAt(0))
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

/** Recognizes reviewed wire formats, never proves origin or financial authenticity. */
export async function detectCsvStatement(source: DocumentSource): Promise<CsvDetection> {
	const result: CsvDetection = {
		sourceArtifactId: source.artifactId,
		sourceSha256: await csvSourceDigest(source),
		detectorVersion: CSV_DETECTOR_VERSION,
		eligible: false,
		profile: null,
		reason: 'Unrecognized CSV statement format.',
		statement: null
	}
	try {
		const bytes = Uint8Array.from(atob(source.base64), (c) => c.charCodeAt(0))
		const text = decodeCsvText(bytes)
		// Exact header and row widths. No fuzzy header aliases or positional guesses.
		const matched = [
			{ headers: RABO, delimiter: ',' as const, profile: 'rabobank-csv-en-v1.2' },
			{ headers: HASPA, delimiter: ';' as const, profile: 'haspa-csv-camt-v1' }
		].flatMap((p) => {
			try {
				const rows = parseCsv(text, p.delimiter)
				return JSON.stringify(rows[0]) === JSON.stringify(p.headers) ? [{ ...p, rows }] : []
			} catch {
				return []
			}
		})
		if (matched.length !== 1) return result
		const p = matched[0]!,
			german = p.delimiter === ';'
		result.profile = p.profile
		if (p.rows.length < 2)
			throw new Error('No transaction rows; document cannot be confirmed for reconciliation.')
		if (p.rows.some((r) => r.length !== p.headers.length))
			throw new Error('CSV row width differs from its header.')
		const account = p.rows[1]![0]!
		if (!iban(account)) throw new Error('Missing or invalid own-account IBAN.')
		const ids = new Set<string>()
		const transactions = p.rows.slice(1).map((r, index) => {
			if (r[0] !== account || r[german ? 15 : 1] !== 'EUR')
				throw new Error('Only one explicit EUR account is admitted per file.')
			if (german && r[16] !== 'Umsatz gebucht')
				throw new Error('CSV contains a non-booked or unknown transaction status.')
			if (german ? Boolean(r[9] || r[10]) : Boolean(r[22] || r[23] || r[24] || r[25]))
				throw new Error('Reversal, original amount or FX fields require an unsupported mapping.')
			const transactionId = german ? null : r[3]!
			if (!german) {
				if (!/^\d{18}$/.test(transactionId!) || ids.has(transactionId!))
					throw new Error('Missing or repeated bank sequence number.')
				ids.add(transactionId!)
			}
			const otherIban = r[german ? 12 : 8]!
			if (otherIban && !iban(otherIban))
				throw new Error('Counterparty account needs an unsupported identifier mapping.')
			const description = german ? r[4]! : [r[18], r[19], r[20], r[21]].filter(Boolean).join('\n')
			const name = r[german ? 11 : 9]!
			if (!description || !name || description.length > 4000 || name.length > 512)
				throw new Error('Missing or excessive counterparty or payment description.')
			return {
				transactionId,
				bookingDate: date(r[german ? 1 : 4]!, german),
				valueDate: date(r[german ? 2 : 5]!, german),
				title: r[german ? 3 : 13] || null,
				amountMinor: minor(r[german ? 14 : 6]!),
				counterpartyName: name,
				counterpartyIban: otherIban || null,
				description,
				originalAmountMinor: null,
				originalCurrency: null,
				exchangeRate: null,
				fxSurchargeMinor: null,
				foreignExchangeFeeBps: null,
				balanceAfterMinor: german ? null : minor(r[7]!),
				sourceRow: index + 2
			}
		})
		if (!german)
			for (let i = 1; i < transactions.length; i++) {
				const before = transactions[i - 1]!,
					row = transactions[i]!
				if (
					before.bookingDate > row.bookingDate ||
					before.balanceAfterMinor! + row.amountMinor !== row.balanceAfterMinor
				)
					throw new Error('Statement order or running balance does not reconcile.')
			}
		// A first balance is not evidence of a stated opening balance or full period.
		result.statement = {
			statementKind: 'transaction-overview',
			currency: 'EUR',
			accountHolder: null,
			accountHolderAddress: null,
			accountHolderDetails: null,
			institution: null,
			accountIban: account,
			accountBic: null,
			accountNumber: null,
			productName: null,
			openingBalanceMinor: null,
			closingBalanceMinor: null,
			periodStart: null,
			periodEnd: null,
			transactions,
			notes: 'CSV export; full-period completeness and bank authenticity are not established.',
			summary: `${transactions.length} CSV bookings. Document-type confirmation required before reconciliation.`
		}
		result.eligible = true
		result.reason =
			'Known CSV layout and every row passed strict checks. A human must still confirm the document type.'
	} catch (error) {
		result.reason = error instanceof Error ? error.message : String(error)
	}
	return result
}
