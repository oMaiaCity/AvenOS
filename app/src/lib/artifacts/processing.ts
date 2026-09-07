import type { ArtifactProcessingState, ArtifactProcessingView } from '@avenos/artifact-store'

export type {
	ArtifactProcessingAvailability,
	ArtifactProcessingLookup,
	ArtifactProcessingPresentation,
	ArtifactProcessingStage,
	ArtifactProcessingState,
	ArtifactProcessingView,
	ArtifactProcessingWarning,
	DerivedArtifact
} from '@avenos/artifact-store'

const TYPE_LABELS: Record<string, string> = {
	file: 'File',
	'application/pdf': 'PDF document',
	'image/jpeg': 'JPEG image',
	'image/png': 'PNG image',
	image: 'Image',
	photo: 'Photograph',
	document: 'Document',
	invoice: 'Invoice',
	receipt: 'Receipt',
	'credit-note': 'Credit note',
	'self-issued-receipt': 'Self-issued receipt',
	'order-confirmation': 'Order confirmation',
	offer: 'Offer',
	reminder: 'Reminder',
	mandate: 'Mandate',
	'monthly-statement': 'Account statement',
	'transaction-overview': 'Transaction overview',
	'balance-certificate': 'Balance certificate',
	'payment-receipt': 'Payment receipt',
	'bank-statement': 'Account statement'
}

const STAGE_LABELS: Array<[prefix: string, label: string]> = [
	['inspect', 'Inspecting file'],
	['decompose-pages', 'Splitting into pages'],
	['extract-native-page-', 'Reading embedded text'],
	['analyze-page-', 'Understanding pages'],
	['classify-page-', 'Classifying pages'],
	['represent-page-', 'Representing pages'],
	['assemble-document', 'Assembling document'],
	['assemble-text', 'Assembling document text'],
	['aggregate-content', 'Combining page results'],
	['classify-content-', 'Understanding content'],
	['classify-document', 'Classifying document'],
	['extract-invoice', 'Extracting invoice fields'],
	['validate-invoice', 'Checking invoice values'],
	['normalize-invoice-open-item', 'Preparing invoice reconciliation'],
	['extract-statement', 'Extracting statement entries'],
	['validate-statement', 'Checking statement values'],
	['normalize-statement', 'Preparing statement reconciliation'],
	['fanout-statement-transactions-', 'Saving statement transactions'],
	['rank-invoice-transactions', 'Ranking reconciliation candidates']
]

const ACTIVE_STAGE_STATES = new Set(['running', 'publishing'])
const WAITING_STAGE_STATES = new Set(['queued', 'retry_wait', 'pending'])
const COMPLETED_STAGE_STATES = new Set([
	'succeeded',
	'failed',
	'skipped',
	'needs_review',
	'unsupported'
])

export function artifactTypeLabel(type: string): string {
	const known = TYPE_LABELS[type]
	if (known) return known
	const tail = type.includes('/') ? type.slice(type.lastIndexOf('/') + 1) : type
	const readable = tail.replaceAll(/[._-]+/g, ' ').trim()
	return readable === '' ? 'File' : readable[0].toUpperCase() + readable.slice(1)
}

export function artifactDescription(
	originalName: string,
	presentation?: ArtifactProcessingView
): string {
	if (!presentation) return 'File'
	const label = presentation.label.trim()
	if (label !== '' && label !== originalName) return label
	return artifactTypeLabel(presentation.preferredType)
}

export function isTerminalProcessing(state: ArtifactProcessingState): boolean {
	return state === 'succeeded' || state === 'needs_review' || state === 'failed'
}

export function artifactProcessingStageLabel(key: string): string {
	const label =
		STAGE_LABELS.find(([prefix]) => key === prefix || key.startsWith(prefix))?.[1] ??
		artifactTypeLabel(key)
	const page = key.match(/page-(\d+)$/)?.[1]
	return page ? `${label} · Page ${Number(page)}` : label
}

export interface ArtifactProcessingProgress {
	label: string
	completed: number
	total: number
}

export function artifactProcessingProgress(
	presentation?: ArtifactProcessingView
): ArtifactProcessingProgress {
	if (!presentation || presentation.availability === 'discovering') {
		return { label: 'Waiting for processing', completed: 0, total: 0 }
	}
	if (presentation.availability === 'unavailable') {
		return { label: 'Processing status unavailable · retrying', completed: 0, total: 0 }
	}
	const stages = presentation.stages
	const completed = stages.filter((stage) => COMPLETED_STAGE_STATES.has(stage.state)).length
	const current =
		stages.find((stage) => ACTIVE_STAGE_STATES.has(stage.state)) ??
		stages.find((stage) => WAITING_STAGE_STATES.has(stage.state))
	if (presentation.state === 'succeeded') {
		return { label: 'Processing complete', completed, total: stages.length }
	}
	if (presentation.state === 'needs_review') {
		return { label: 'Review needed', completed, total: stages.length }
	}
	if (presentation.state === 'failed') {
		return { label: 'Processing failed', completed, total: stages.length }
	}
	return {
		label: current
			? current.state === 'retry_wait'
				? `${artifactProcessingStageLabel(current.key)} · retry scheduled`
				: artifactProcessingStageLabel(current.key)
			: 'Processing',
		completed,
		total: stages.length
	}
}

export function artifactWarningText(presentation?: ArtifactProcessingView): string {
	if (!presentation) return ''
	const messages = presentation.warnings.map((warning) => warning.message)
	if (presentation.lookupError) messages.push(presentation.lookupError)
	return [...new Set(messages)].join('\n')
}

function stringMetadata(metadata: Record<string, unknown>, key: string): string | null {
	const value = metadata[key]
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function moneyMetadata(metadata: Record<string, unknown>, key: string): string | null {
	const minor = metadata[key]
	const currency = stringMetadata(metadata, 'currency')
	if (typeof minor !== 'number' || !Number.isSafeInteger(minor) || !currency) return null
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100)
	} catch {
		return `${(minor / 100).toFixed(2)} ${currency}`
	}
}

export function artifactMetadataHighlights(presentation?: ArtifactProcessingView): string[] {
	if (!presentation) return []
	const metadata = presentation.metadata
	const candidates = [
		stringMetadata(metadata, 'supplier'),
		stringMetadata(metadata, 'invoiceNumber'),
		moneyMetadata(metadata, 'grossMinor'),
		stringMetadata(metadata, 'accountHolder'),
		stringMetadata(metadata, 'periodStart') && stringMetadata(metadata, 'periodEnd')
			? `${stringMetadata(metadata, 'periodStart')} – ${stringMetadata(metadata, 'periodEnd')}`
			: null,
		moneyMetadata(metadata, 'closingBalanceMinor')
	]
	return [...new Set(candidates.filter((value): value is string => value !== null))].slice(0, 3)
}
