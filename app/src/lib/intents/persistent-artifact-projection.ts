export interface ProjectionArtifact {
	artifactId: string
	localKey: string
	typeKey: string
	publicationId: string
	scopeSequence: number
	publicationOrdinal: number
}

export interface IntentSourceArtifact {
	artifactId: string
	typeKey: 'core.file'
}

interface ArtifactEnvelope {
	payload?: Record<string, unknown>
}

interface FileProjection {
	type: string
	status: string
	artifacts: unknown[]
	skills: unknown[]
}

/**
 * Intent Service currently owns conversation state, while the immutable
 * intent-to-file association lives in Artifact Store. An upload commits the
 * `intent.declaration` and `core.file` roots in one publication. Reconstruct
 * that association without inventing a second mutable copy of it.
 */
export async function discoverIntentSources(
	artifacts: readonly ProjectionArtifact[],
	loadEnvelope: (artifactId: string) => Promise<ArtifactEnvelope>
): Promise<Map<string, IntentSourceArtifact>> {
	const byPublication = new Map<string, ProjectionArtifact[]>()
	for (const artifact of artifacts) {
		const members = byPublication.get(artifact.publicationId) ?? []
		members.push(artifact)
		byPublication.set(artifact.publicationId, members)
	}

	const declarations = artifacts.filter(
		(artifact) => artifact.typeKey === 'intent.declaration' && artifact.localKey === 'intent'
	)
	const candidates = await Promise.all(
		declarations.map(async (declaration) => {
			try {
				const envelope = await loadEnvelope(declaration.artifactId)
				const intentId = envelope.payload?.intentId
				if (typeof intentId !== 'string' || intentId.trim() === '') return null
				const source = byPublication
					.get(declaration.publicationId)
					?.find((artifact) => artifact.typeKey === 'core.file' && artifact.localKey === 'file')
				if (!source) return null
				return { intentId, source }
			} catch {
				// One unreadable historical declaration must not hide every other intent.
				return null
			}
		})
	)

	const newestFirst = candidates
		.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
		.sort(
			(left, right) =>
				right.source.scopeSequence - left.source.scopeSequence ||
				right.source.publicationOrdinal - left.source.publicationOrdinal ||
				right.source.artifactId.localeCompare(left.source.artifactId)
		)
	const result = new Map<string, IntentSourceArtifact>()
	for (const candidate of newestFirst) {
		if (result.has(candidate.intentId)) continue
		result.set(candidate.intentId, {
			artifactId: candidate.source.artifactId,
			typeKey: 'core.file'
		})
	}
	return result
}

/**
 * A plain Intent Service refresh can legitimately have no artifact projection.
 * In that case it must not erase a newer live file-skill projection assembled
 * from Artifact Store publications and processing events.
 */
export function preserveLiveFileProjection<T extends FileProjection>(
	persisted: T,
	live: T | undefined,
	persistedHasProjection: boolean
): T {
	if (persistedHasProjection || !live || live.artifacts.length === 0) return persisted
	return {
		...persisted,
		type: live.type,
		status: live.status,
		artifacts: live.artifacts,
		skills: live.skills
	}
}
