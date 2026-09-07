import { Actor } from '@avenos/actors'
import type { PageClassification } from '../../shared'
import { artifact, failure, manifest, success, wholeArtifact } from '../../shared'

export function createContentAggregatorActor(): Actor {
	return new Actor(
		manifest(
			'content-aggregator',
			'Content aggregator',
			'Combines every page classification without inventing missing knowledge.',
			'document_aggregate_content',
			['ceo.aven.docs.content_classification(P, C)', 'ceo.aven.docs.document_text(F, T)'],
			['ceo.aven.docs.content_classification(F, C)']
		),
		{
			document_aggregate_content: (payload) => {
				try {
					const pages = payload.pages as unknown as PageClassification[]
					const kinds = pages.map((page) => page.primaryKind)
					const primaryKind = kinds.includes('document')
						? 'document'
						: kinds.length > 0 && kinds.every((kind) => kind === 'image')
							? 'image'
							: 'unknown'
					const complete = pages.length > 0 && pages.every((page) => page.complete)
					const facets = [...new Set(pages.flatMap((page) => page.facets))].sort()
					return success(
						{
							ok: true,
							procedureKey: 'client.aggregate-content-classification',
							artifacts: [
								artifact(
									'classification',
									'core.content-classification',
									{
										subjectLevel: 'file',
										primaryKind,
										facets,
										confidenceBps: complete ? 10_000 : 0,
										reason: 'Deterministic client aggregation preserved every page outcome.',
										resolutionMode: 'rule',
										complete
									},
									'classification'
								)
							],
							evidence: [
								{
									ordinal: 0,
									outputLocalKey: 'classification',
									outputLocator: wholeArtifact(),
									inputRole: 'source',
									inputOrdinal: 0,
									inputLocator: wholeArtifact()
								}
							]
						},
						`Aggregated ${pages.length} page classification(s).`
					)
				} catch (error) {
					return failure(error)
				}
			}
		}
	)
}
