import type {
	DocumentModelGateway,
	DocumentModelRequest,
	DocumentModelStatus
} from '@avenos/document-ingest/model'

export class GoldenInvoiceModel implements DocumentModelGateway {
	readonly requests: DocumentModelRequest[] = []
	constructor(private readonly kind: 'invoice' | 'bank-statement' = 'invoice') {}

	async status(): Promise<DocumentModelStatus> {
		return { available: true, maxPages: 15, modelId: 'golden-vision', modelLabel: 'Golden Vision' }
	}

	async complete(request: DocumentModelRequest) {
		this.requests.push(structuredClone(request))
		const receipt = {
			model: 'golden-vision',
			modelLabel: 'Golden Vision',
			profile: 'deterministic-golden',
			requestKey: `golden-${request.procedure}-${request.images[0]?.page ?? 0}`,
			promptDigest: 'golden-prompt',
			implementationDigest: 'golden-implementation'
		}
		if (request.procedure === 'analyze-page') {
			return {
				receipt,
				structured: {
					text: 'Rechnung DE-2025-00001\nNetto 100,00 EUR\nMwSt 19,00 EUR\nGesamt 119,00 EUR',
					language: 'de',
					complete: true,
					blocks: [{ text: 'Rechnung DE-2025-00001', x: 1000, y: 1000, width: 3000, height: 500 }],
					primaryKind: 'document',
					facets: ['raster-text', 'table'],
					confidenceBps: 9900,
					reason: 'The page visibly contains an invoice.',
					summary: 'German invoice DE-2025-00001.',
					topics: ['invoice']
				}
			}
		}
		if (request.procedure === 'classify-document') {
			return {
				receipt,
				structured: {
					rawKind: this.kind,
					resolvedKind: this.kind,
					family: this.kind === 'invoice' ? 'invoice-family' : 'statement-family',
					confidenceBps: 9900,
					reason: `The rendered page visibly contains a ${this.kind}.`,
					resolutionMode: 'model',
					alternatives: []
				}
			}
		}
		if (request.procedure === 'extract-statement') {
			return {
				receipt,
				structured: {
					candidate: {
						statementKind: 'monthly-statement',
						currency: 'EUR',
						accountHolder: 'Aven Test GmbH',
						accountHolderAddress: null,
						accountHolderDetails: null,
						institution: { name: 'Aven Test Bank', city: 'Berlin' },
						accountIban: 'DE02120300000000202051',
						accountBic: null,
						accountNumber: null,
						productName: 'Current account',
						openingBalanceMinor: 20_000,
						closingBalanceMinor: 8_100,
						periodStart: '2025-01-01',
						periodEnd: '2025-01-31',
						transactions: [
							{
								transactionId: 'TX-1',
								bookingDate: '2025-01-20',
								valueDate: '2025-01-20',
								title: 'SEPA transfer',
								amountMinor: -11_900,
								counterpartyName: 'Landwirtschaftliche Genossenschaft eG',
								counterpartyIban: null,
								description: 'DE-2025-00001',
								originalAmountMinor: null,
								originalCurrency: null,
								exchangeRate: null,
								fxSurchargeMinor: null,
								foreignExchangeFeeBps: null,
								balanceAfterMinor: 8_100,
								sourceRow: 1
							}
						],
						notes: null,
						summary: 'January account statement with one transaction.'
					},
					evidence: []
				}
			}
		}
		return {
			receipt,
			structured: {
				candidate: {
					supplier: 'Landwirtschaftliche Genossenschaft eG',
					invoiceNumber: 'DE-2025-00001',
					currency: 'EUR',
					netMinor: 10_000,
					taxMinor: 1_900,
					grossMinor: 11_900,
					dueDate: '2025-02-15',
					summary: 'Invoice DE-2025-00001 for EUR 119.00.'
				},
				details: {
					documentKind: 'invoice',
					category: 'goods',
					issueDate: '2025-01-16',
					customerNumber: null,
					orderNumber: null,
					supplier: {
						name: 'Landwirtschaftliche Genossenschaft eG',
						vatId: null,
						taxNumber: null,
						address: null,
						street: null,
						postalCode: null,
						city: null,
						country: 'Germany',
						email: null,
						phone: null,
						website: null,
						contactName: null,
						bankingAccounts: []
					},
					buyer: null,
					lineItems: [],
					taxBreakdown: [],
					payment: null,
					payments: [],
					referenceEntries: []
				},
				evidence: []
			}
		}
	}
}
