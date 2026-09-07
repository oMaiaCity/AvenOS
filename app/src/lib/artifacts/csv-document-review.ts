import type { MessageBus } from '@avenos/actors'
import type { ArtifactProcessingPresentation, ClientArtifactGateway } from '@avenos/artifact-store'
import type { CsvDetection } from '@avenos/document-ingest/csv'
import { confirmCsvStatement, readCsvConfirmation } from '@avenos/document-ingest/csv-confirmation'

/** True means stop this import here. Confirmation resumes a new observed run. */
export async function holdCsvDocumentReview(options: {
	presentation: ArtifactProcessingPresentation
	publications: ClientArtifactGateway
	bus: MessageBus
	resume: (confirmationArtifactId: string, fromHuman: boolean) => Promise<void>
}): Promise<boolean> {
	const { presentation, publications, bus, resume } = options
	const detection = presentation.metadata.csvDetection as unknown as CsvDetection | undefined
	const detectionId = presentation.metadata.csvDetectionArtifactId
	if (!detection || typeof detectionId !== 'string' || !detection.eligible || !detection.statement)
		return true
	const previous = await readCsvConfirmation(
		publications,
		detection.sourceArtifactId,
		detection.sourceSha256
	)
	if (previous) {
		if (
			previous.payload.detectionArtifactId !== detectionId ||
			previous.payload.decision !== 'accepted'
		)
			return true
		if (
			presentation.derivedArtifacts.some((a) => a.typeKey === 'banking.account-statement-candidate')
		)
			return false
		await resume(previous.artifactId, false)
		return true
	}
	const rows = detection.statement.transactions as Array<Record<string, unknown>>
	bus.holdAction(
		{
			id: `csv-document:${detectionId}`,
			actor: 'csv-document-review',
			method: 'csv_document_review',
			label: 'Confirm this CSV is an account statement',
			detail:
				'Confirm document detection only. Invoice-to-booking relationships require a separate review.',
			preview: {
				kind: 'csv-document-detection',
				layout: 'compare',
				title: 'Is this CSV an account statement for your account?',
				sides: [
					{
						heading: presentation.label,
						lines: [
							detection.profile ?? '',
							String(detection.statement.accountIban),
							`${rows.length} booked rows · ${detection.statement.currency}`,
							'Original file remains available in this Intent.'
						]
					},
					{
						heading: 'Detected bookings — not yet admitted',
						lines: rows
							.slice(0, 3)
							.map(
								(r) =>
									`${r.bookingDate}: ${Number(r.amountMinor) / 100} ${detection.statement!.currency} · ${r.counterpartyName} · ${r.description}`
							)
							.concat([
								'This confirms the document type, not its authenticity or any invoice match.'
							])
					}
				]
			}
		},
		{
			confirm: async () => {
				const id = await confirmCsvStatement(publications, detectionId, detection, 'accepted')
				await resume(id, true)
				return {
					record: JSON.stringify({ ok: true, confirmationArtifactId: id }),
					wire: 'CSV document type confirmed. Invoice matching remains a separate decision.'
				}
			},
			reject: async () => {
				await confirmCsvStatement(publications, detectionId, detection, 'rejected')
			}
		}
	)
	return true
}
