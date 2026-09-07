import { describe, expect, test } from 'vitest'
import { DOCUMENT_MODEL_SYSTEM_PROMPT, documentModelSchema, modelRequest } from '../src/model'

describe('invoice identifier interpretation contract', () => {
	test('distinguishes missing monetary values from explicit zero', () => {
		const request = modelRequest('extract-invoice', [], '')
		expect(request.prompt).toContain('Missing monetary values are null, NOT zero')
		expect(request.prompt).toContain('An explicitly printed zero tax remains 0')
		const schema = request.schema as {
			properties: {
				candidate: { properties: Record<string, { description: string; type: string[] }> }
			}
		}
		for (const key of ['netMinor', 'taxMinor', 'grossMinor']) {
			expect(schema.properties.candidate.properties[key]!.type).toContain('null')
			expect(schema.properties.candidate.properties[key]!.description).toContain('never 0')
		}
	})
	test('requires printed tax/VAT labels instead of inferring a type from the identifier prefix', () => {
		const request = modelRequest('extract-invoice', [], '')
		expect(request.prompt).toContain('Steuernummer, RFC or TIN')
		expect(request.prompt).toContain('USt-IdNr., VAT ID or VAT No.')
		expect(request.prompt).toContain('leave an absent VAT ID null')
	})
	test('specifies confidence units and exact executable document labels', () => {
		expect(DOCUMENT_MODEL_SYSTEM_PROMPT).toContain('9900 means 99 percent')
		const schema = documentModelSchema('classify-document') as {
			properties: { resolvedKind: { enum: string[] } }
		}
		expect(schema.properties.resolvedKind.enum).toContain('bank-statement')
		expect(schema.properties.resolvedKind.enum).not.toContain('account-statement')
	})
})
