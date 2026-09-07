import { describe, expect, test } from 'bun:test'
import {
	artifactManifest,
	formatBytes,
	MAX_MANIFEST_ENTRIES,
	processingStateLabel,
	resolveArtifact
} from '../src/lib/intents/artifact-manifest'

/**
 * The model's artifact awareness: a bounded manifest in the system context,
 * plus the resolver the artifact_detail tool uses. The contract under test is
 * "the model always knows what files are in the conversation, and never more
 * than one line per file" — so the caps and the fallbacks are the subject.
 */

const FILE = {
	artifactId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
	title: 'rechnung-01.pdf',
	typeKey: 'core.file'
}

describe('formatBytes', () => {
	test('human sizes, no more precision than the unit carries', () => {
		expect(formatBytes(0)).toBe('')
		expect(formatBytes(-5)).toBe('')
		expect(formatBytes(512)).toBe('512 B')
		expect(formatBytes(2048)).toBe('2 KB')
		expect(formatBytes(2_097_152)).toBe('2 MB')
	})
})

describe('processingStateLabel', () => {
	test('maps every processor state to a word the model can speak', () => {
		expect(processingStateLabel('active')).toBe('processing')
		expect(processingStateLabel('succeeded')).toBe('processing complete')
		expect(processingStateLabel('needs_review')).toBe('processing finished with a warning')
		expect(processingStateLabel('failed')).toBe('processing failed')
		expect(processingStateLabel(undefined)).toBe('waiting for processing')
	})
})

describe('artifactManifest', () => {
	test('no artifacts, no block — an empty conversation costs the model nothing', () => {
		expect(artifactManifest([])).toBe('')
	})

	test('one line per artifact: name, kind, size, state, and at most one summary', () => {
		const text = artifactManifest(
			[{ ...FILE, state: 'succeeded', summary: 'Invoice from ACME, total 1.234,56 EUR' }],
			(id) =>
				id === FILE.artifactId
					? {
							length: 120_000,
							mediaType: 'application/pdf',
							label: 'PDF document',
							state: 'succeeded',
							summary: 'Invoice from ACME, total 1.234,56 EUR'
						}
					: undefined
		)
		const lines = text.split('\n')
		expect(lines[0]).toBe('ARTIFACTS in this conversation right now:')
		expect(lines).toHaveLength(2)
		expect(lines[1]).toContain('rechnung-01.pdf')
		expect(lines[1]).toContain('PDF document')
		expect(lines[1]).toContain('processing complete')
		expect(lines[1]).toContain('Invoice from ACME, total 1.234,56 EUR')
	})

	test('the kind falls back from the live label to the persisted one to the type key', () => {
		const withPersistedLabel = artifactManifest([{ ...FILE, label: 'Invoice' }])
		expect(withPersistedLabel).toContain('(Invoice)')
		const bare = artifactManifest([FILE])
		expect(bare).toContain('(Core file)')
	})

	test('the live view wins over the persisted one when both are known', () => {
		const text = artifactManifest(
			[{ ...FILE, state: 'succeeded', summary: 'stale summary' }],
			(id) => (id === FILE.artifactId ? { state: 'active' } : undefined)
		)
		expect(text).toContain('processing')
		expect(text).not.toContain('stale summary')
	})

	test('without a live view the persisted state and summary stand in (the restart path)', () => {
		const text = artifactManifest([
			{ ...FILE, state: 'succeeded', summary: 'Invoice from ACME, total 1.234,56 EUR' }
		])
		expect(text).toContain('processing complete')
		expect(text).toContain('Invoice from ACME, total 1.234,56 EUR')
	})

	test('an artifact with no state anywhere falls back to its note, then to attached', () => {
		const withNote = artifactManifest([{ ...FILE, note: 'Uploading…' }])
		expect(withNote).toContain('Uploading…')
		const bare = artifactManifest([{ title: 'x.docx', typeKey: 'core.file' }])
		expect(bare).toContain('attached')
	})

	test('summaries are cut to the bound, never left to grow the context', () => {
		const long = 'x'.repeat(500)
		const text = artifactManifest([{ ...FILE, state: 'succeeded', summary: long }], () => ({
			state: 'succeeded',
			summary: long
		}))
		const line = text.split('\n')[1]
		expect(line.length).toBeLessThan(long.length)
		expect(line.endsWith('…')).toBe(true)
	})

	test('the line count is capped: beyond the bound the rest is counted, not listed', () => {
		const entries = Array.from({ length: MAX_MANIFEST_ENTRIES + 5 }, (_, i) => ({
			artifactId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
			title: `file-${i}.pdf`,
			typeKey: 'core.file'
		}))
		const text = artifactManifest(entries)
		const lines = text.split('\n')
		// header + capped entries + the overflow line
		expect(lines).toHaveLength(MAX_MANIFEST_ENTRIES + 2)
		expect(lines[lines.length - 1]).toBe('…and 5 more')
	})
})

describe('resolveArtifact', () => {
	const artifacts = [
		{ artifactId: 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE', title: 'rechnung-01.pdf' },
		{ title: 'Notizen.txt' }
	]

	test('exact id first, case-insensitive', () => {
		expect(resolveArtifact(artifacts, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')?.title).toBe(
			'rechnung-01.pdf'
		)
	})

	test('then exact title, then a case-insensitive part of the title', () => {
		expect(resolveArtifact(artifacts, 'Notizen.txt')?.artifactId).toBeUndefined()
		expect(resolveArtifact(artifacts, 'notizen')?.title).toBe('Notizen.txt')
		expect(resolveArtifact(artifacts, 'RECHNUNG')?.title).toBe('rechnung-01.pdf')
	})

	test('no match, no invention — the model is told, not handed a guess', () => {
		expect(resolveArtifact(artifacts, 'garbage')).toBeUndefined()
		expect(resolveArtifact(artifacts, '  ')).toBeUndefined()
	})
})
