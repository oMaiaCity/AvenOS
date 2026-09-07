import { Actor } from '@avenos/actors'
import { artifact, failure, manifest, object, success, wholeArtifact } from '../../shared'

export function createInvoiceValidatorActor(): Actor {
	return new Actor(
		manifest(
			'invoice-validator',
			'Invoice validator',
			'Runs the invoice-core-v1 arithmetic and identity checks.',
			'document_validate_invoice',
			['ceo.aven.bookkeeping.invoice_candidate(F, I)'],
			['ceo.aven.bookkeeping.invoice_validation(I, V)']
		),
		{
			document_validate_invoice: (payload) => {
				try {
					const candidate = object(payload.candidate, 'invoice candidate')
					const net = candidate.netMinor
					const tax = candidate.taxMinor
					const gross = candidate.grossMinor
					const arithmetic =
						typeof net === 'number' &&
						typeof tax === 'number' &&
						typeof gross === 'number' &&
						Math.abs(net + tax - gross) <= 2
							? 'PASS'
							: 'UNKNOWN'
					const identity =
						typeof candidate.supplier === 'string' &&
						candidate.supplier.trim() !== '' &&
						typeof candidate.invoiceNumber === 'string' &&
						candidate.invoiceNumber.trim() !== ''
							? 'PASS'
							: 'FAIL'
					const outcomes = [arithmetic, identity]
					const status = outcomes.includes('FAIL')
						? 'inconsistent'
						: outcomes.includes('UNKNOWN')
							? 'insufficient-coverage'
							: 'consistent'
					const validation = {
						rulesetVersion: 'invoice-core-v1',
						status,
						coverageBps: outcomes.filter((outcome) => outcome !== 'UNKNOWN').length * 5000,
						checks: [
							{
								ruleId: 'invoice.net-plus-tax-equals-gross',
								outcome: arithmetic,
								severity: 'hard',
								paths: ['/netMinor', '/taxMinor', '/grossMinor'],
								message: 'Net plus tax agrees with gross, or requires explicit adjustment coverage.'
							},
							{
								ruleId: 'invoice.identity-present',
								outcome: identity,
								severity: 'hard',
								paths: ['/supplier', '/invoiceNumber'],
								message: 'Supplier and invoice number must both be present.'
							}
						]
					}
					return success(
						{
							ok: true,
							procedureKey: 'client.validate-invoice',
							artifacts: [
								artifact('validation', 'bookkeeping.invoice-validation', validation, 'validation')
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
						`Invoice validation is ${status}.`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
