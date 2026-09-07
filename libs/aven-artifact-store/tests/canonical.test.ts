import { describe, expect, test } from 'bun:test'
import { ArtifactJsonError, canonicalArtifactJsonText, parseArtifactJson } from '../src/canonical'

interface FixtureFile {
	valid: Array<{ name: string; input: string; canonical: string }>
	invalid: Array<{ name: string; input: string; category: string }>
}

const fixtures = (await Bun.file(
	new URL(
		'../../../services/artifact-store/conformance/fixtures/canonical-json/artifact-json-v1.json',
		import.meta.url
	)
).json()) as FixtureFile

describe('artifact-json-v1', () => {
	test('sorts keys while preserving decomposed Unicode', () => {
		const value = parseArtifactJson('{"z":1,"a":"e\\u0301","nested":{"b":2,"a":1}}', true)
		expect(canonicalArtifactJsonText(value)).toBe('{"a":"é","nested":{"a":1,"b":2},"z":1}')
	})

	test('rejects duplicates before ordinary object parsing', () => {
		expect(() => parseArtifactJson('{"a":1,"a":2}', true)).toThrow(ArtifactJsonError)
	})

	test.each(['1.0', '1e3', '9007199254740992', '-9007199254740992'])(
		'rejects out-of-profile number %s',
		(input) => expect(() => parseArtifactJson(input)).toThrow(ArtifactJsonError)
	)

	test('uses scalar-value key ordering rather than UTF-16 ordering', () => {
		const value = parseArtifactJson('{"𐀀":1,"￿":2}', true)
		expect(canonicalArtifactJsonText(value)).toBe('{"￿":2,"𐀀":1}')
	})

	for (const fixture of fixtures.valid) {
		test(`shared valid vector: ${fixture.name}`, () => {
			expect(canonicalArtifactJsonText(parseArtifactJson(fixture.input))).toBe(fixture.canonical)
		})
	}

	for (const fixture of fixtures.invalid) {
		test(`shared invalid vector: ${fixture.name}`, () => {
			expect(() => parseArtifactJson(fixture.input)).toThrow(ArtifactJsonError)
		})
	}
})
