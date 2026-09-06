import { Actor } from '@avenos/actors'
import { detectCsvStatement } from '../../csv'
import {
	artifact,
	type DocumentSource,
	failure,
	manifest,
	success,
	wholeArtifact
} from '../../shared'

export function createCsvStatementDetectorActor(): Actor {
	return new Actor(
		manifest(
			'csv-statement-detector',
			'CSV statement detection',
			'Checks a known CSV layout without admitting bookings for reconciliation.',
			'document_detect_csv_statement',
			['ceo.aven.docs.file(F)'],
			['ceo.aven.banking.csv_detection(F, D)']
		),
		{
			document_detect_csv_statement: async (payload) => {
				try {
					const detection = await detectCsvStatement(payload.source as unknown as DocumentSource)
					return success(
						{
							ok: true,
							procedureKey: 'client.detect-csv-statement',
							artifacts: [
								artifact(
									'detection',
									'banking.csv-statement-detection',
									{ ...detection },
									'detection'
								)
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'detection',
									outputLocator: wholeArtifact(),
									inputRole: 'source',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								}
							]
						},
						detection.reason
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
