import {
	type Canvas,
	createCanvas,
	DOMMatrix,
	ImageData,
	Path2D,
	type SKRSContext2D
} from '@napi-rs/canvas'

// This module must be evaluated before pdf.js. In a Bun bundle pdf.js's own
// createRequire(import.meta.url) can resolve a second @napi-rs/canvas instance
// from the build host. A Path2D from that instance is rejected by the canvas
// context embedded in the service bundle. Installing the DOM primitives from
// the exact canvas instance used for rendering keeps native object identity
// coherent in source, bundle, and container executions.
const canvasGlobal = globalThis as unknown as Record<string, unknown>
canvasGlobal.DOMMatrix ??= DOMMatrix
canvasGlobal.ImageData ??= ImageData
canvasGlobal.Path2D ??= Path2D

export { createCanvas }

interface CanvasAndContext {
	canvas: Canvas | null
	context: SKRSContext2D | null
}

/** Keeps every scratch canvas inside the same bundled native module instance. */
export class ServerPdfCanvasFactory {
	constructor(_options: { enableHWA?: boolean } = {}) {}

	create(width: number, height: number): CanvasAndContext {
		if (width <= 0 || height <= 0) throw new Error('Invalid canvas size')
		const canvas = createCanvas(width, height)
		return { canvas, context: canvas.getContext('2d') }
	}

	reset(target: CanvasAndContext, width: number, height: number): void {
		if (!target.canvas) throw new Error('Canvas is not specified')
		if (width <= 0 || height <= 0) throw new Error('Invalid canvas size')
		target.canvas.width = width
		target.canvas.height = height
	}

	destroy(target: CanvasAndContext): void {
		if (!target.canvas) throw new Error('Canvas is not specified')
		target.canvas.width = 0
		target.canvas.height = 0
		target.canvas = null
		target.context = null
	}
}
