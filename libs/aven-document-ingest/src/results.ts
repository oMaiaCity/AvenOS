import type { DocumentActorResult, ExtractedPage, PageClassification } from './shared'

export function parseDocumentActorResult(record: string): DocumentActorResult {
	const parsed = JSON.parse(record) as DocumentActorResult | { ok: false; error: string }
	if (!parsed.ok) throw new Error(parsed.error)
	return parsed
}

export function extractedPageFrom(result: DocumentActorResult, page: number): ExtractedPage {
	const textArtifact = result.artifacts.find(
		(artifact) => artifact.typeKey === 'docs.extracted-text'
	)
	const layoutArtifact = result.artifacts.find(
		(artifact) => artifact.typeKey === 'docs.text-layout'
	)
	if (!textArtifact?.blob || !layoutArtifact)
		throw new Error('native text actor omitted its outputs')
	const binary = atob(textArtifact.blob.base64)
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
	return {
		page,
		text: new TextDecoder().decode(bytes),
		method: textArtifact.payload.method === 'ocr' ? 'ocr' : 'native',
		spans: layoutArtifact.payload.spans as ExtractedPage['spans'],
		complete: Boolean(textArtifact.payload.complete)
	}
}

export function pageClassificationFrom(
	result: DocumentActorResult,
	page: number
): PageClassification {
	const output = result.artifacts.find(
		(artifact) => artifact.typeKey === 'core.content-classification'
	)
	if (!output) throw new Error('page classifier omitted its output')
	return {
		page,
		primaryKind: String(output.payload.primaryKind),
		facets: output.payload.facets as string[],
		complete: Boolean(output.payload.complete)
	}
}
