import { type ClientArtifactGateway, clientRunIdentity } from '@avenos/artifact-store'
import { CSV_DETECTOR_VERSION, type CsvDetection } from './csv'

export interface CsvConfirmation {
	artifactId: string
	payload: {
		sourceArtifactId: string
		sourceSha256: string
		detectorVersion: string
		detectionArtifactId: string
		decision: 'accepted' | 'rejected'
	}
}

export function csvConfirmationIdentity(sourceArtifactId: string, sourceSha256: string) {
	return clientRunIdentity(
		JSON.stringify([
			CSV_DETECTOR_VERSION,
			'human-document-confirmation',
			sourceArtifactId,
			sourceSha256
		])
	)
}

export async function readCsvConfirmation(
	gateway: ClientArtifactGateway,
	sourceArtifactId: string,
	sourceSha256: string
): Promise<CsvConfirmation | null> {
	const id = await csvConfirmationIdentity(sourceArtifactId, sourceSha256)
	const run = await gateway.lookup?.(id)
	if (!run) return null
	const draft = run.artifacts[0],
		receipt = run.receipt.artifacts[0]
	if (
		run.procedureKey !== 'client.confirm-csv-statement' ||
		run.procedureVersion !== 'client-v1' ||
		run.receipt.publicationId !== id ||
		run.artifacts.length !== 1 ||
		run.receipt.artifacts.length !== 1 ||
		draft?.typeKey !== 'banking.csv-statement-confirmation' ||
		draft.typeVersion !== 1 ||
		draft.localKey !== 'confirmation' ||
		receipt?.localKey !== 'confirmation' ||
		draft.payload.sourceArtifactId !== sourceArtifactId ||
		draft.payload.sourceSha256 !== sourceSha256 ||
		draft.payload.detectorVersion !== CSV_DETECTOR_VERSION ||
		!['accepted', 'rejected'].includes(String(draft.payload.decision)) ||
		typeof draft.payload.detectionArtifactId !== 'string'
	)
		throw new Error('Stored CSV confirmation does not match this source revision.')
	return { artifactId: receipt.artifactId, payload: draft.payload as CsvConfirmation['payload'] }
}

/** Called by a physical human gate only. Not registered as an Actor/model tool. */
export async function confirmCsvStatement(
	gateway: ClientArtifactGateway,
	detectionArtifactId: string,
	detection: CsvDetection,
	decision: 'accepted' | 'rejected'
): Promise<string> {
	if (
		!detection.eligible ||
		!detection.statement ||
		detection.detectorVersion !== CSV_DETECTOR_VERSION
	)
		throw new Error('This CSV is not eligible for document-type confirmation.')
	const previous = await readCsvConfirmation(
		gateway,
		detection.sourceArtifactId,
		detection.sourceSha256
	)
	if (previous) {
		if (
			previous.payload.decision !== decision ||
			previous.payload.detectionArtifactId !== detectionArtifactId
		)
			throw new Error('This CSV detection already has a different immutable decision.')
		return previous.artifactId
	}
	const receipt = await gateway.publish({
		publicationId: await csvConfirmationIdentity(
			detection.sourceArtifactId,
			detection.sourceSha256
		),
		procedureKey: 'client.confirm-csv-statement',
		procedureVersion: 'client-v1',
		parameters: {},
		inputs: [
			{ role: 'source', ordinal: 0, artifactId: detection.sourceArtifactId },
			{ role: 'detection', ordinal: 0, artifactId: detectionArtifactId }
		],
		artifacts: [
			{
				localKey: 'confirmation',
				typeKey: 'banking.csv-statement-confirmation',
				typeVersion: 1,
				output: { role: 'confirmation', ordinal: 0 },
				payload: {
					sourceArtifactId: detection.sourceArtifactId,
					sourceSha256: detection.sourceSha256,
					detectorVersion: CSV_DETECTOR_VERSION,
					detectionArtifactId,
					decision
				}
			}
		],
		evidence: [
			{
				ordinal: 0,
				outputLocalKey: 'confirmation',
				outputLocator: { kind: 'artifact-root' },
				inputRole: 'detection',
				inputOrdinal: 0,
				inputLocator: { kind: 'artifact-root' }
			}
		]
	})
	const confirmed = receipt.artifacts.find((a) => a.localKey === 'confirmation')
	if (!confirmed) throw new Error('CSV confirmation publication returned no receipt.')
	return confirmed.artifactId
}
