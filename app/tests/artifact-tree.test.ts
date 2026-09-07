import { describe, expect, test } from 'bun:test'
import {
	artifactBranchIds,
	artifactTreeRows,
	type BrowsedArtifact
} from '../src/lib/artifacts/artifact-tree'

function artifact(
	artifactId: string,
	scopeSequence: number,
	inputs: BrowsedArtifact['inputs'] = []
): BrowsedArtifact {
	return {
		artifactId,
		localKey: artifactId,
		publicationOrdinal: 0,
		typeKey: `test.${artifactId}`,
		typeVersion: 1,
		artifactSha256: artifactId.padEnd(64, '0'),
		producerRunId: inputs.length ? `run-${artifactId}` : null,
		output: inputs.length ? { role: 'result', ordinal: 0 } : null,
		inputs,
		publicationId: `publication-${artifactId}`,
		scopeSequence,
		publicationKind: inputs.length ? 'run' : 'roots',
		runId: inputs.length ? `run-${artifactId}` : null,
		committedAt: `2026-08-25T12:00:0${scopeSequence}Z`
	}
}

const input = (artifactId: string, role = 'source', ordinal = 0) => ({
	role,
	ordinal,
	artifactId
})

describe('artifact lineage tree-grid', () => {
	test('uses the newest retained input as the visual parent without losing fan-in', () => {
		const artifacts = [
			artifact('result', 4, [input('root'), input('classification', 'context')]),
			artifact('classification', 3, [input('page')]),
			artifact('page', 2, [input('root')]),
			artifact('root', 1)
		]
		const rows = artifactTreeRows(artifacts)
		expect(rows.map((row) => [row.artifact.artifactId, row.depth])).toEqual([
			['root', 0],
			['page', 1],
			['classification', 2],
			['result', 3]
		])
		expect(rows.at(-1)).toMatchObject({
			primaryParentId: 'classification',
			parentCount: 2,
			missingParentCount: 0
		})
	})

	test('collapses branches and filtering restores matching ancestor paths', () => {
		const artifacts = [
			artifact('child', 2, [input('root')]),
			artifact('root', 1),
			artifact('unrelated', 3)
		]
		expect(
			artifactTreeRows(artifacts, new Set(['root'])).map((row) => row.artifact.artifactId)
		).toEqual(['unrelated', 'root'])
		expect(
			artifactTreeRows(artifacts, new Set(['root']), 'test.child').map(
				(row) => row.artifact.artifactId
			)
		).toEqual(['root', 'child'])
		expect(artifactBranchIds(artifacts)).toEqual(new Set(['root']))
	})

	test('surfaces inputs outside the bounded feed as missing parents', () => {
		const rows = artifactTreeRows([artifact('orphan', 8, [input('trimmed-root')])])
		expect(rows[0]).toMatchObject({ depth: 0, parentCount: 1, missingParentCount: 1 })
	})
})
