import { BodyLimitError, readBoundedBytes, readBoundedText } from '@avenos/http-boundary'
import { describe, expect, test, vi } from 'vitest'

const request = (body: ReadableStream<Uint8Array>, headers?: HeadersInit) =>
	new Request('http://localhost/input', {
		method: 'POST',
		body,
		headers,
		duplex: 'half'
	} as RequestInit)

describe('request body boundary', () => {
	test('accepts the byte ceiling and preserves exact webhook bytes', async () => {
		const bytes = new TextEncoder().encode('{"value":"é"}\r\n')
		const input = new Request('http://localhost/input', { method: 'POST', body: bytes })
		expect(await readBoundedBytes(input, bytes.length)).toEqual(bytes)
	})
	test('counts actual chunked bytes and cancels before retaining excess', async () => {
		const cancel = vi.fn()
		const input = request(
			new ReadableStream({
				pull(controller) {
					controller.enqueue(new Uint8Array(16))
				},
				cancel
			})
		)
		await expect(readBoundedBytes(input, 31)).rejects.toBeInstanceOf(BodyLimitError)
		expect(cancel).toHaveBeenCalledOnce()
	})
	test('rejects a declared oversize without reading the body', async () => {
		const cancel = vi.fn()
		const input = request(new ReadableStream({ cancel }), { 'content-length': '33' })
		await expect(readBoundedBytes(input, 32)).rejects.toBeInstanceOf(BodyLimitError)
		expect(cancel).toHaveBeenCalledOnce()
	})
	test('a dishonest smaller content-length cannot bypass the actual byte ceiling', async () => {
		const input = request(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array(33))
					controller.close()
				}
			}),
			{ 'content-length': '1' }
		)
		await expect(readBoundedBytes(input, 32)).rejects.toBeInstanceOf(BodyLimitError)
	})
	test('a stalled body has a deadline and is cancelled', async () => {
		const cancel = vi.fn()
		await expect(
			readBoundedBytes(request(new ReadableStream({ cancel })), 32, 10)
		).rejects.toMatchObject({ status: 408, code: 'REQUEST_BODY_TIMEOUT' })
		expect(cancel).toHaveBeenCalledOnce()
	})
	test('rejects encoded bodies without expanding or buffering them', async () => {
		await expect(
			readBoundedBytes(request(new ReadableStream(), { 'content-encoding': 'gzip' }), 32)
		).rejects.toMatchObject({ status: 415, code: 'REQUEST_ENCODING_UNSUPPORTED' })
	})
	test('empty input remains empty', async () => {
		expect(await readBoundedText(new Request('http://localhost/'), 32)).toBe('')
	})
})
