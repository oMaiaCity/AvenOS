import { describe, expect, test } from 'vitest'
import {
	HttpRequestContractError,
	httpRequestDigest,
	parseHttpRequestArtifact
} from '../src/contracts'

describe('HTTP request artifact contract', () => {
	test('normalizes a bounded public GET without adding credentials', () => {
		const request = parseHttpRequestArtifact({
			method: 'GET',
			url: 'https://EXAMPLE.com:443/reports/august?format=pdf',
			headers: [
				{ name: 'Accept-Language', value: ' de ' },
				{ name: 'Accept', value: 'application/pdf' }
			],
			authentication: { mode: 'mapped-required', purpose: 'report-read' }
		})

		expect(request).toEqual({
			method: 'GET',
			url: 'https://example.com/reports/august?format=pdf',
			headers: [
				{ name: 'accept', value: 'application/pdf' },
				{ name: 'accept-language', value: 'de' }
			],
			authentication: { mode: 'mapped-required', purpose: 'report-read' },
			redirects: { mode: 'follow', maximumHops: 5 },
			freshness: 'revalidate'
		})
		expect(httpRequestDigest(request)).toMatch(/^[0-9a-f]{64}$/)
	})

	test.each([
		[{ method: 'POST', url: 'https://example.com' }, undefined],
		[
			{
				method: 'GET',
				url: 'https://example.com',
				headers: [{ name: 'authorization', value: 'Bearer secret' }]
			},
			'HTTP_REQUEST_HEADER_FORBIDDEN'
		],
		[{ method: 'GET', url: 'https://user:secret@example.com' }, 'HTTP_REQUEST_USERINFO_FORBIDDEN'],
		[{ method: 'GET', url: 'https://example.com/#fragment' }, 'HTTP_REQUEST_FRAGMENT_FORBIDDEN'],
		[{ method: 'GET', url: 'http://example.com/report' }, 'HTTP_REQUEST_INSECURE_ORIGIN_FORBIDDEN']
	])('rejects an unsafe retained request', (input, code) => {
		expect(() => parseHttpRequestArtifact(input)).toThrow()
		if (code) {
			try {
				parseHttpRequestArtifact(input)
			} catch (error) {
				expect(error).toBeInstanceOf(HttpRequestContractError)
				expect((error as HttpRequestContractError).code).toBe(code)
			}
		}
	})

	test('admits only an exact configured HTTP development origin', () => {
		expect(
			parseHttpRequestArtifact(
				{ method: 'HEAD', url: 'http://localhost:8080/health' },
				{ allowHttpOrigins: ['http://localhost:8080'] }
			).method
		).toBe('HEAD')
		expect(() =>
			parseHttpRequestArtifact(
				{ method: 'GET', url: 'http://localhost:8081/health' },
				{ allowHttpOrigins: ['http://localhost:8080'] }
			)
		).toThrow('HTTP_REQUEST_INSECURE_ORIGIN_FORBIDDEN')
	})
})
