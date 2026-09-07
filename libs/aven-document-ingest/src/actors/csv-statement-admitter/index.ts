import { Actor } from '@avenos/actors'
import { artifact, failure, manifest, object, success, wholeArtifact } from '../../shared'

export function createCsvStatementAdmitterActor(): Actor {
	return new Actor(
		manifest(
			'csv-statement-admitter',
			'Confirmed CSV statement',
			'Admits only an exact detection revision with a stored human document-type confirmation.',
			'document_admit_csv_statement',
			['ceo.aven.banking.csv_detection(F, D)', 'ceo.aven.banking.csv_confirmation(D, C)'],
			['ceo.aven.bookkeeping.statement_candidate(F, S)']
		),
		{
			document_admit_csv_statement: (payload) => {
				try {
					const d = object(payload.detection, 'CSV detection'),
						c = object(payload.confirmation, 'CSV confirmation')
					if (
						d.eligible !== true ||
						c.decision !== 'accepted' ||
						c.detectionArtifactId !== payload.detectionArtifactId ||
						['sourceArtifactId', 'sourceSha256', 'detectorVersion'].some((key) => d[key] !== c[key])
					)
						throw new Error('CSV requires an accepted human confirmation of this exact detection.')
					return success(
						{
							ok: true,
							procedureKey: 'client.admit-csv-statement',
							artifacts: [
								artifact(
									'statement',
									'banking.account-statement-candidate',
									object(d.statement, 'detected statement'),
									'candidate'
								)
							],
							evidence: ['detection', 'confirmation'].map((role, ordinal) => ({
								ordinal,
								outputLocalKey: 'statement',
								outputLocator: wholeArtifact(),
								inputRole: role,
								inputOrdinal: 0,
								inputLocator: wholeArtifact()
							}))
						},
						'Human-confirmed CSV admitted for statement validation.'
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
