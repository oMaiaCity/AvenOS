import { describe, expect, test, vi } from 'vitest'
import { HttpLlmGatewayClient } from '../src/http'

describe('HTTP LLM gateway client', () => {
	test('authenticates discovery and preserves repeated capability filters', async () => {
		const fetcher = vi.fn(async (request: Request) => {
			expect(request.headers.get('authorization')).toBe(`Bearer ${'s'.repeat(32)}`)
			expect(new URL(request.url).searchParams.getAll('capability')).toEqual([
				'vision',
				'structured-output'
			])
			return Response.json({
				models: [{ id: 'm', label: 'Model', capabilities: ['vision', 'structured-output'] }]
			})
		})
		const client = new HttpLlmGatewayClient({
			baseUrl: 'http://api/internal/v1/llm/',
			bearerToken: () => 's'.repeat(32),
			fetch: fetcher
		})
		expect(await client.discover(['vision', 'structured-output'])).toHaveLength(1)
	})

	test('posts completions and fails closed on transport errors', async () => {
		const request = {
			modelId: 'm',
			messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'x' }] }]
		}
		const good = new HttpLlmGatewayClient({
			baseUrl: 'http://api/internal/v1/llm',
			bearerToken: 's'.repeat(32),
			fetch: async (input) => {
				const received = input as Request
				expect(received.method).toBe('POST')
				expect(await received.json()).toEqual(request)
				return Response.json({
					output: { format: 'json', value: { ok: true } },
					receipt: { requestKey: 'r' }
				})
			}
		})
		expect((await good.complete(request)).output.format).toBe('json')

		const denied = new HttpLlmGatewayClient({
			baseUrl: 'http://api/internal/v1/llm',
			bearerToken: 'bad',
			fetch: async () => new Response('{}', { status: 401 })
		})
		await expect(denied.complete(request)).rejects.toThrow('status 401')
	})
})
