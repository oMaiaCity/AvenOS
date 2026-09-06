import { expect, test, vi } from 'vitest'
import { readPdfTextContent } from '../src/pdf-text'

test('collects text without ReadableStream async iteration and releases its reader', async () => {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue({
				items: [{ str: 'Invoice' }],
				styles: { a: { fontFamily: 'sans' } },
				lang: null
			})
			controller.enqueue({
				items: [{ str: '119.00' }],
				styles: { b: { fontFamily: 'serif' } },
				lang: 'en'
			})
			controller.close()
		}
	})
	Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined })
	const direct = vi.fn()
	const result = await readPdfTextContent({
		isPureXfa: false,
		streamTextContent: () => stream,
		getTextContent: direct
	})
	expect(result.items).toEqual([{ str: 'Invoice' }, { str: '119.00' }])
	expect(Object.keys(result.styles)).toEqual(['a', 'b'])
	expect(result.lang).toBe('en')
	expect(direct).not.toHaveBeenCalled()
	expect(stream.locked).toBe(false)
})

test('preserves XFA handling and propagates reader failures without holding the stream', async () => {
	const xfa = { items: [], styles: {}, lang: null }
	expect(
		await readPdfTextContent({
			isPureXfa: true,
			getTextContent: async () => xfa,
			streamTextContent: vi.fn()
		})
	).toBe(xfa)
	const stream = new ReadableStream({
		start(controller) {
			controller.error(new Error('decode failed'))
		}
	})
	await expect(
		readPdfTextContent({
			isPureXfa: false,
			getTextContent: vi.fn(),
			streamTextContent: () => stream
		})
	).rejects.toThrow('decode failed')
	expect(stream.locked).toBe(false)
})
