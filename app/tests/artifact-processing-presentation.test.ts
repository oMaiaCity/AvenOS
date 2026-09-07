import { describe, expect, test } from 'bun:test'
import {
	type ArtifactProcessingView,
	artifactDescription,
	artifactMetadataHighlights,
	artifactProcessingProgress,
	artifactWarningText,
	isTerminalProcessing
} from '../src/lib/artifacts/processing'

function presentation(overrides: Partial<ArtifactProcessingView> = {}): ArtifactProcessingView {
	return {
		availability: 'available',
		caseId: 'case-1',
		state: 'active',
		projectionVersion: 'artifact-presentation-v3',
		preferredType: 'application/pdf',
		label: 'sample.pdf',
		summary: null,
		metadata: {},
		warnings: [],
		stages: [],
		...overrides
	}
}

describe('artifact processing presentation', () => {
	test('always chooses the latest authoritative description', () => {
		expect(artifactDescription('sample.pdf')).toBe('File')
		expect(artifactDescription('sample.pdf', presentation())).toBe('PDF document')
		expect(
			artifactDescription(
				'sample.pdf',
				presentation({ preferredType: 'credit-note', label: 'Credit note CN-42' })
			)
		).toBe('Credit note CN-42')
	})

	test('projects active, retrying, and terminal stages without inventing percentages', () => {
		const active = presentation({
			stages: [
				{ key: 'inspect', state: 'succeeded' },
				{ key: 'extract-invoice', state: 'running' },
				{ key: 'validate-invoice', state: 'pending' }
			]
		})
		expect(artifactProcessingProgress(active)).toEqual({
			label: 'Extracting invoice fields',
			completed: 1,
			total: 3
		})
		expect(
			artifactProcessingProgress(
				presentation({
					stages: [{ key: 'classify-document', state: 'retry_wait' }]
				})
			).label
		).toBe('Classifying document · retry scheduled')
		expect(artifactProcessingProgress(presentation({ state: 'needs_review' })).label).toBe(
			'Review needed'
		)
	})

	test('keeps warnings and useful metadata alongside the last valid projection', () => {
		const view = presentation({
			availability: 'unavailable',
			lookupError: 'Status is temporarily unavailable.',
			metadata: {
				supplier: 'ACME GmbH',
				invoiceNumber: 'INV-42',
				currency: 'EUR',
				grossMinor: 11900
			},
			warnings: [
				{ code: 'grounding-partial', message: 'Some fields are not grounded.', retryable: false }
			]
		})
		expect(artifactWarningText(view)).toContain('Some fields are not grounded.')
		expect(artifactWarningText(view)).toContain('Status is temporarily unavailable.')
		expect(artifactMetadataHighlights(view)).toEqual(
			expect.arrayContaining(['ACME GmbH', 'INV-42'])
		)
	})

	test('only stops polling for known terminal case states', () => {
		expect(isTerminalProcessing('active')).toBe(false)
		expect(isTerminalProcessing('succeeded')).toBe(true)
		expect(isTerminalProcessing('needs_review')).toBe(true)
		expect(isTerminalProcessing('failed')).toBe(true)
	})
})
