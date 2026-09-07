export interface PlannedSegment {
	index: number
	text: string
}

const SENTENCE_BOUNDARY = /[.!?:]\s/gu
const OPENING_CLAUSE = /[,;–—-]\s/gu
const MAX_SEGMENT_SCALARS = 512

/** Pure semantic text planner. It knows nothing about audio or devices. */
export class SpeechPlanner {
	#pending = ''
	#opened = false
	#nextIndex = 0

	feed(delta: string): PlannedSegment[] {
		this.#pending += delta
		let cut = lastBoundary(this.#pending, SENTENCE_BOUNDARY)
		if (cut < 0 && !this.#opened && [...this.#pending].length > 48) {
			cut = lastBoundary(this.#pending, OPENING_CLAUSE)
		}
		if (cut < 0) return []
		const complete = this.#pending.slice(0, cut)
		this.#pending = this.#pending.slice(cut)
		return this.#segments(complete)
	}

	flush(): PlannedSegment[] {
		const tail = this.#pending
		this.#pending = ''
		const segments = this.#segments(tail)
		this.#opened = false
		return segments
	}

	reset(): void {
		this.#pending = ''
		this.#opened = false
		this.#nextIndex = 0
	}

	#segments(text: string): PlannedSegment[] {
		const trimmed = text.trim()
		if (trimmed === '' || !/\p{L}/u.test(trimmed)) return []
		const scalars = [...trimmed]
		const result: PlannedSegment[] = []
		for (let offset = 0; offset < scalars.length; offset += MAX_SEGMENT_SCALARS) {
			const part = scalars
				.slice(offset, offset + MAX_SEGMENT_SCALARS)
				.join('')
				.trim()
			if (part === '') continue
			result.push({ index: this.#nextIndex++, text: part })
		}
		if (result.length > 0) this.#opened = true
		return result
	}
}

function lastBoundary(value: string, expression: RegExp): number {
	expression.lastIndex = 0
	let cut = -1
	for (const match of value.matchAll(expression)) cut = (match.index ?? 0) + match[0].length
	return cut
}
