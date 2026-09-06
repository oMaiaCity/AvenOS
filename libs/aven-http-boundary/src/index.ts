export { BoundarySignals } from './signals.js'

export class BodyLimitError extends Error {
	constructor(
		readonly status = 413,
		readonly code = 'REQUEST_BODY_TOO_LARGE'
	) {
		super('The request body does not satisfy the route limits.')
	}
}

/** Count actual bytes, including chunked input, before retaining them in a buffer. */
export async function readBoundedBytes(
	request: Pick<Request, 'headers' | 'body'>,
	limit: number,
	timeoutMs = 30_000
): Promise<Uint8Array<ArrayBuffer>> {
	if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
		throw new Error('Invalid request body budget.')
	if (
		request.headers.has('content-encoding') &&
		request.headers.get('content-encoding') !== 'identity'
	) {
		void request.body?.cancel().catch(() => {})
		throw new BodyLimitError(415, 'REQUEST_ENCODING_UNSUPPORTED')
	}
	const length = request.headers.get('content-length')
	if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
		void request.body?.cancel().catch(() => {})
		throw new BodyLimitError()
	}
	if (!request.body) return new Uint8Array()
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let size = 0
	let timer: ReturnType<typeof setTimeout> | undefined
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new BodyLimitError(408, 'REQUEST_BODY_TIMEOUT'))
			void reader.cancel().catch(() => {})
		}, timeoutMs)
	})
	try {
		for (;;) {
			const { done, value } = await Promise.race([reader.read(), deadline])
			if (done) break
			size += value.byteLength
			if (size > limit) throw new BodyLimitError()
			chunks.push(value)
		}
		const result = new Uint8Array(size)
		let offset = 0
		for (const chunk of chunks) {
			result.set(chunk, offset)
			offset += chunk.byteLength
		}
		return result
	} catch (error) {
		void reader.cancel().catch(() => {})
		throw error
	} finally {
		clearTimeout(timer)
		reader.releaseLock()
	}
}

export async function readBoundedText(request: Request, limit: number): Promise<string> {
	return new TextDecoder().decode(await readBoundedBytes(request, limit))
}
export async function readBoundedJson(request: Request, limit: number): Promise<unknown> {
	return JSON.parse(await readBoundedText(request, limit))
}
