import { describe, expect, test } from 'bun:test'
import {
	discoverIntentSources,
	type ProjectionArtifact,
	preserveLiveFileProjection
} from '../src/lib/intents/persistent-artifact-projection'

const artifact = (
	artifactId: string,
	publicationId: string,
	localKey: string,
	typeKey: string,
	scopeSequence = 1,
	publicationOrdinal = 0
): ProjectionArtifact => ({
	artifactId,
	publicationId,
	localKey,
	typeKey,
	scopeSequence,
	publicationOrdinal
})

describe('persistent intent artifact projection', () => {
	test('reconstructs the source only from roots committed in the same publication', async () => {
		const artifacts = [
			artifact('file-a', 'publication-a', 'file', 'core.file'),
			artifact('intent-a', 'publication-a', 'intent', 'intent.declaration', 1, 1),
			artifact('file-b', 'publication-b', 'file', 'core.file', 2),
			artifact('intent-b', 'publication-b', 'intent', 'intent.declaration', 2, 1)
		]
		const payloads: Record<string, { payload: Record<string, unknown> }> = {
			'intent-a': { payload: { intentId: 'intent-one' } },
			'intent-b': { payload: { intentId: 'intent-two' } }
		}
		const result = await discoverIntentSources(artifacts, async (id) => payloads[id])
		expect(result.get('intent-one')).toEqual({ artifactId: 'file-a', typeKey: 'core.file' })
		expect(result.get('intent-two')).toEqual({ artifactId: 'file-b', typeKey: 'core.file' })
	})

	test('ignores malformed, unreadable, unrelated, and incomplete publications independently', async () => {
		const artifacts = [
			artifact('good-file', 'good', 'file', 'core.file'),
			artifact('good-intent', 'good', 'intent', 'intent.declaration', 1, 1),
			artifact('wrong-file', 'wrong', 'attachment', 'core.file'),
			artifact('wrong-intent', 'wrong', 'intent', 'intent.declaration', 2, 1),
			artifact('missing-source', 'missing', 'intent', 'intent.declaration', 3),
			artifact('unreadable', 'unreadable-publication', 'intent', 'intent.declaration', 4),
			artifact('not-a-declaration', 'other', 'intent', 'core.note', 5)
		]
		const result = await discoverIntentSources(artifacts, async (id) => {
			if (id === 'unreadable') throw new Error('gone')
			if (id === 'good-intent') return { payload: { intentId: 'good-intent-id' } }
			if (id === 'wrong-intent') return { payload: { intentId: 'wrong-intent-id' } }
			return { payload: { intentId: 42 } }
		})
		expect([...result]).toEqual([
			['good-intent-id', { artifactId: 'good-file', typeKey: 'core.file' }]
		])
	})

	test('chooses the newest valid source if an intent was declared more than once', async () => {
		const artifacts = [
			artifact('old-file', 'old', 'file', 'core.file', 1),
			artifact('old-intent', 'old', 'intent', 'intent.declaration', 1, 1),
			artifact('new-file', 'new', 'file', 'core.file', 9),
			artifact('new-intent', 'new', 'intent', 'intent.declaration', 9, 1)
		]
		const result = await discoverIntentSources(artifacts, async () => ({
			payload: { intentId: 'same-intent' }
		}))
		expect(result.get('same-intent')?.artifactId).toBe('new-file')
	})

	test('an empty conversation refresh cannot erase a newer live file projection', () => {
		const persisted = { type: 'file', status: 'working', artifacts: [], skills: [], title: 'x' }
		const live = {
			type: 'receipt',
			status: 'done',
			artifacts: [{ artifactId: 'source' }, { artifactId: 'invoice' }],
			skills: [{ skill: 'file', state: 'done' }],
			title: 'x'
		}
		expect(preserveLiveFileProjection(persisted, live, false)).toMatchObject({
			type: 'receipt',
			status: 'done',
			artifacts: live.artifacts,
			skills: live.skills
		})
		expect(preserveLiveFileProjection(persisted, live, true)).toBe(persisted)
		expect(preserveLiveFileProjection(persisted, undefined, false)).toBe(persisted)
	})
})
