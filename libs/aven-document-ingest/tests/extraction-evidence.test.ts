import { describe, expect, test } from 'vitest'
import { type ExtractedPage, textGroundedExtractionEvidence } from '../src/shared'

const page: ExtractedPage = {
	page: 1,
	text: 'Receipt La Estrella Transit T-2026-00015-V 11/08/2026',
	method: 'native',
	complete: true,
	spans: [
		{ start: 0, endExclusive: 7, page: 1, x: 10, y: 20, width: 80, height: 20 },
		{ start: 8, endExclusive: 19, page: 1, x: 100, y: 20, width: 120, height: 20 },
		{ start: 20, endExclusive: 27, page: 1, x: 225, y: 20, width: 80, height: 20 },
		{ start: 28, endExclusive: 42, page: 1, x: 10, y: 60, width: 170, height: 20 },
		{ start: 43, endExclusive: 53, page: 1, x: 190, y: 60, width: 100, height: 20 }
	]
}

describe('deterministic extraction evidence', () => {
	test('grounds exact output strings in retained source spans', () => {
		const evidence = textGroundedExtractionEvidence([page], {
			details: {
				outputLocalKey: 'details',
				value: {
					supplier: { name: 'La Estrella Transit' },
					invoiceNumber: 'T-2026-00015-V'
				}
			}
		})

		expect(evidence).toEqual([
			expect.objectContaining({
				ordinal: 0,
				outputLocalKey: 'details',
				outputLocator: { kind: 'json-pointer', pointer: '/supplier/name' },
				inputLocator: {
					kind: 'page-region',
					page: 1,
					x: 100,
					y: 20,
					width: 205,
					height: 20
				}
			}),
			expect.objectContaining({
				ordinal: 1,
				outputLocator: { kind: 'json-pointer', pointer: '/invoiceNumber' }
			})
		])
	})

	test('does not invent provenance for normalized or calculated values', () => {
		const evidence = textGroundedExtractionEvidence([page], {
			details: {
				outputLocalKey: 'details',
				value: { issueDate: '2026-08-11', grossMinor: 63_360 }
			}
		})

		expect(evidence).toEqual([])
	})
})
