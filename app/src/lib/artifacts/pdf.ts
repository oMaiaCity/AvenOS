import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

/**
 * The one pdf.js seam: artifacts render as OUR canvases — no iframe, no
 * WKWebView PDF chrome, no toolbar. Vite serves the worker same-origin
 * (adapter-static emits it as an asset; CSP worker-src 'self' allows it).
 *
 * LEGACY build on purpose: the modern bundles call the still-unshipped
 * Map.getOrInsertComputed proposal — in BOTH the display API and the worker
 * script, where a main-thread polyfill cannot reach — and WKWebView throws.
 * The legacy build carries its own polyfills on either side of the worker
 * boundary.
 */

// Belt and suspenders for the main thread (WKWebView lacks the
// Map.getOrInsertComputed / getOrInsert proposal pdf.js relies on).
const proto = Map.prototype as unknown as Record<string, unknown>
if (typeof proto.getOrInsertComputed !== 'function') {
	proto.getOrInsertComputed = function (
		this: Map<unknown, unknown>,
		key: unknown,
		compute: (k: unknown) => unknown
	) {
		if (!this.has(key)) this.set(key, compute(key))
		return this.get(key)
	}
}
if (typeof proto.getOrInsert !== 'function') {
	proto.getOrInsert = function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
		if (!this.has(key)) this.set(key, value)
		return this.get(key)
	}
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy, PDFPageProxy }

/** One stored artifact's bytes, from the base64 the Rust side hands over. */
export function base64ToBytes(encoded: string): Uint8Array {
	const raw = atob(encoded)
	const bytes = new Uint8Array(raw.length)
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
	return bytes
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
	// pdf.js transfers the buffer to its worker — hand it a copy so the
	// caller's bytes stay usable.
	return pdfjs.getDocument({ data: bytes.slice() }).promise
}

/** Open a PDF for bounded one-shot processing and retain ownership of its worker. */
export async function loadOwnedPdf(bytes: Uint8Array): Promise<{
	document: PDFDocumentProxy
	destroy: () => Promise<void>
}> {
	const task = pdfjs.getDocument({ data: bytes.slice() })
	try {
		return {
			document: await task.promise,
			destroy: () => task.destroy()
		}
	} catch (error) {
		await task.destroy().catch(() => undefined)
		throw error
	}
}

/** Render one page into a canvas sized to `width` CSS pixels — crisp on
 * retina: the backing store scales with the device pixel ratio. */
export async function renderPageToCanvas(
	page: PDFPageProxy,
	canvas: HTMLCanvasElement,
	width: number
): Promise<void> {
	const dpr = window.devicePixelRatio || 1
	const base = page.getViewport({ scale: 1 })
	const viewport = page.getViewport({ scale: (width / base.width) * dpr })
	canvas.width = Math.ceil(viewport.width)
	canvas.height = Math.ceil(viewport.height)
	canvas.style.width = `${width}px`
	canvas.style.height = `${viewport.height / dpr}px`
	const context = canvas.getContext('2d')
	if (!context) return
	await page.render({ canvas, canvasContext: context, viewport }).promise
}
