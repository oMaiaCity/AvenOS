export type ArtifactJson =
	| null
	| boolean
	| number
	| string
	| readonly ArtifactJson[]
	| { readonly [key: string]: ArtifactJson }

const MAX_SAFE_INTEGER = 9_007_199_254_740_991n

export class ArtifactJsonError extends Error {}

/** Parse before JSON.parse can erase duplicate keys or exact number tokens. */
export function parseArtifactJson(bytes: Uint8Array | string, requireObject = false): ArtifactJson {
	const source =
		typeof bytes === 'string' ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	const parser = new Parser(source)
	const value = parser.parse()
	if (requireObject && (value === null || Array.isArray(value) || typeof value !== 'object')) {
		throw new ArtifactJsonError('a top-level protocol or schema document must be an object')
	}
	return value
}

export function canonicalArtifactJson(value: ArtifactJson): Uint8Array {
	return new TextEncoder().encode(canonicalArtifactJsonText(value))
}

export function canonicalArtifactJsonText(value: ArtifactJson): string {
	if (value === null) return 'null'
	if (typeof value === 'boolean') return value ? 'true' : 'false'
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value)) {
			throw new ArtifactJsonError('Artifact JSON numbers must be signed safe integers')
		}
		return String(value)
	}
	if (typeof value === 'string') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalArtifactJsonText).join(',')}]`
	const entries = Object.entries(value).sort(([left], [right]) => compareScalarStrings(left, right))
	return `{${entries
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalArtifactJsonText(item)}`)
		.join(',')}}`
}

function compareScalarStrings(left: string, right: string): number {
	const leftPoints = Array.from(left, (value) => value.codePointAt(0) as number)
	const rightPoints = Array.from(right, (value) => value.codePointAt(0) as number)
	for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
		const difference = (leftPoints[index] as number) - (rightPoints[index] as number)
		if (difference !== 0) return difference
	}
	return leftPoints.length - rightPoints.length
}

class Parser {
	#index = 0

	constructor(private readonly source: string) {}

	parse(): ArtifactJson {
		this.#whitespace()
		const value = this.#value()
		this.#whitespace()
		if (this.#index !== this.source.length) this.#fail('trailing content')
		return value
	}

	#value(): ArtifactJson {
		const character = this.source[this.#index]
		if (character === '{') return this.#object()
		if (character === '[') return this.#array()
		if (character === '"') return this.#string()
		if (character === 't') return this.#literal('true', true)
		if (character === 'f') return this.#literal('false', false)
		if (character === 'n') return this.#literal('null', null)
		if (character === '-' || (character !== undefined && character >= '0' && character <= '9')) {
			return this.#integer()
		}
		return this.#fail('expected a JSON value')
	}

	#object(): ArtifactJson {
		this.#index += 1
		this.#whitespace()
		const result: Record<string, ArtifactJson> = Object.create(null) as Record<string, ArtifactJson>
		const keys = new Set<string>()
		if (this.source[this.#index] === '}') {
			this.#index += 1
			return result
		}
		while (true) {
			if (this.source[this.#index] !== '"') this.#fail('object key must be a string')
			const key = this.#string()
			if (keys.has(key)) this.#fail(`duplicate object key ${JSON.stringify(key)}`)
			keys.add(key)
			this.#whitespace()
			this.#expect(':')
			this.#whitespace()
			result[key] = this.#value()
			this.#whitespace()
			const separator = this.source[this.#index]
			this.#index += 1
			if (separator === '}') return result
			if (separator !== ',') this.#fail("expected ',' or '}'")
			this.#whitespace()
		}
	}

	#array(): ArtifactJson[] {
		this.#index += 1
		this.#whitespace()
		const result: ArtifactJson[] = []
		if (this.source[this.#index] === ']') {
			this.#index += 1
			return result
		}
		while (true) {
			result.push(this.#value())
			this.#whitespace()
			const separator = this.source[this.#index]
			this.#index += 1
			if (separator === ']') return result
			if (separator !== ',') this.#fail("expected ',' or ']'")
			this.#whitespace()
		}
	}

	#string(): string {
		const start = this.#index
		this.#index += 1
		let escaped = false
		while (this.#index < this.source.length) {
			const character = this.source[this.#index] as string
			this.#index += 1
			if (!escaped && character === '"') {
				const token = this.source.slice(start, this.#index)
				try {
					return JSON.parse(token) as string
				} catch {
					return this.#fail('invalid JSON string')
				}
			}
			if (!escaped && character.charCodeAt(0) < 0x20) this.#fail('unescaped control character')
			if (!escaped && character === '\\') escaped = true
			else escaped = false
		}
		return this.#fail('unterminated string')
	}

	#integer(): number {
		const rest = this.source.slice(this.#index)
		const match = /^-?(?:0|[1-9][0-9]*)/.exec(rest)
		if (!match) return this.#fail('invalid number')
		this.#index += match[0].length
		const next = this.source[this.#index]
		if (next === '.' || next === 'e' || next === 'E') {
			this.#fail('fractional and exponent numbers are not allowed')
		}
		if (next !== undefined && !/[\s,\]}]/.test(next)) this.#fail('invalid number suffix')
		const exact = BigInt(match[0])
		if (exact < -MAX_SAFE_INTEGER || exact > MAX_SAFE_INTEGER) {
			this.#fail('integer is outside the Artifact JSON safe range')
		}
		return Number(exact)
	}

	#literal<T extends boolean | null>(token: string, value: T): T {
		if (!this.source.startsWith(token, this.#index)) this.#fail(`expected ${token}`)
		this.#index += token.length
		return value
	}

	#expect(character: string): void {
		if (this.source[this.#index] !== character) this.#fail(`expected '${character}'`)
		this.#index += 1
	}

	#whitespace(): void {
		while (/\s/.test(this.source[this.#index] ?? '') && this.#index < this.source.length) {
			this.#index += 1
		}
	}

	#fail(message: string): never {
		throw new ArtifactJsonError(`${message} at character ${this.#index}`)
	}
}
