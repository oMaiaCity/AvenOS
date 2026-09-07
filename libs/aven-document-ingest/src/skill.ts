import type { SolverFact, SolverInvocation, SolverOperation } from '@avenos/actors'
import type {
	ClientArtifactDraft,
	ClientRunInput,
	PublishedClientArtifact
} from '@avenos/artifact-store'
import type { DocumentActors } from './actors/registry'
import { isCsvSource } from './csv'
import type { CsvConfirmation } from './csv-confirmation'
import { extractedPageFrom, pageClassificationFrom } from './results'
import {
	type DecodedDocument,
	type DecodedPage,
	type DocumentActorResult,
	type DocumentSource,
	documentArtifactInputRole
} from './shared'

export interface MaterializedDocumentArtifact extends PublishedClientArtifact {
	typeKey: string
	typeVersion: number
	payload: Record<string, unknown>
	blob?: ClientArtifactDraft['blob']
}

export interface DocumentStepOutcome {
	result: DocumentActorResult
	artifacts: MaterializedDocumentArtifact[]
	stageKey: string
}

interface DocumentFactValue extends Partial<DocumentStepOutcome> {
	document?: DecodedDocument
	page?: DecodedPage
	members?: string[]
	offset?: number
}

export interface DocumentStepDefinition {
	key: string
	method: string
	payload: Record<string, unknown>
	inputs: ClientRunInput[]
	parameters?: Record<string, unknown>
	maximumAttempts?: number
}

/** One operation's binding and projection. Neither function may invoke another operation. */
export interface DocumentSkillOperation extends SolverOperation {
	prepare(invocation: SolverInvocation): DocumentStepDefinition
	project(outcome: DocumentStepOutcome, invocation: SolverInvocation): SolverFact[]
	projectFailure?(invocation: SolverInvocation): SolverFact[]
}

const predicate = (name: string, ...args: string[]) => `ceo.aven.${name}(${args.join(', ')})`
export const documentAtom = (id: string) => `a_${id}`
const input = (artifactId: string, role: string, ordinal = 0): ClientRunInput => ({
	artifactId,
	role,
	ordinal
})
const value = (fact: SolverFact | undefined): DocumentFactValue => {
	if (!fact || !fact.value || typeof fact.value !== 'object')
		throw new Error('missing document fact value')
	return fact.value as DocumentFactValue
}
const outcome = (fact: SolverFact | undefined): DocumentStepOutcome => {
	const item = value(fact)
	if (!item.artifacts || !item.result || !item.stageKey)
		throw new Error('missing committed document result')
	return item as DocumentStepOutcome
}
const artifact = (result: DocumentStepOutcome, typeKey: string): MaterializedDocumentArtifact => {
	const found = result.artifacts.find((item) => item.typeKey === typeKey)
	if (!found) throw new Error(`Actor omitted ${typeKey}`)
	return found
}
const artifactsAsInputs = (artifacts: MaterializedDocumentArtifact[]): ClientRunInput[] => {
	const counts = new Map<string, number>()
	return artifacts.map((artifact) => {
		const role = documentArtifactInputRole(artifact.typeKey, artifact.payload)
		const ordinal = counts.get(role) ?? 0
		counts.set(role, ordinal + 1)
		return input(artifact.artifactId, role, ordinal)
	})
}
const gathered = (invocation: SolverInvocation, name: string) =>
	(invocation.gathers[name] ?? []).map(outcome)
const suffix = (page: DecodedPage) => String(page.page).padStart(3, '0')
const pageOf = (fact: SolverFact | undefined) => {
	const page = value(fact).page
	if (!page) throw new Error('missing materialized page')
	return page
}
const facts = (invocation: SolverInvocation, entries: Array<[string, unknown]>): SolverFact[] =>
	entries.map(([predicate, value], index) => ({
		id: `${invocation.id}:${index}`,
		predicate,
		value
	}))

/**
 * The document skill contributes contracts, payload bindings and committed-result
 * projections. Scheduling, joins, collection closure and replay belong to the solver.
 */
export function createDocumentSkillOperations(options: {
	source: DocumentSource
	actors: DocumentActors
	modelPageLimit: number
}): DocumentSkillOperation[] {
	const { source, actors, modelPageLimit } = options
	const F = documentAtom(source.artifactId)
	const sourceInput = input(source.artifactId, 'source')
	const csv = isCsvSource(source)
	const definitions: DocumentSkillOperation[] = []
	const add = (
		definition: Omit<DocumentSkillOperation, 'actor' | 'idempotency' | 'mode'> &
			Partial<Pick<DocumentSkillOperation, 'mode'>>
	): void => {
		const owner = actors.all.find((actor) => actor.handles(definition.method))
		if (!owner) throw new Error(`No installed Actor implements ${definition.method}`)
		definitions.push({
			actor: owner.manifest.id,
			idempotency: definition.mode === 'observe' ? 'idempotent' : 'pure',
			mode: 'transform',
			...definition,
			// A source input must be part of the solver binding, not an invisible
			// closure dependency. Appending preserves declared collection indexes.
			requires:
				definition.id === 'docs.inspect.v2'
					? definition.requires
					: [...definition.requires, predicate('docs.file', 'F')]
		})
	}
	if (csv) {
		add({
			id: 'banking.detect-csv.v1',
			method: 'document_detect_csv_statement',
			requires: [predicate('docs.file', 'F')],
			produces: [predicate('banking.csv_detected', 'F', 'D')],
			prepare: () => ({
				key: 'detect-csv-statement',
				method: 'document_detect_csv_statement',
				payload: { source },
				inputs: [sourceInput]
			}),
			project: (result, invocation) => {
				const d = artifact(result, 'banking.csv-statement-detection')
				return d.payload.eligible === true
					? facts(invocation, [
							[predicate('banking.csv_detected', F, documentAtom(d.artifactId)), result]
						])
					: []
			}
		})
		add({
			id: 'banking.admit-csv.v1',
			method: 'document_admit_csv_statement',
			requires: [
				predicate('banking.csv_detected', 'F', 'D'),
				predicate('banking.csv_confirmed', 'F', 'D', 'C')
			],
			produces: [predicate('bookkeeping.statement', 'F', 'B', 'I')],
			prepare: (invocation) => {
				const d = artifact(outcome(invocation.inputs[0]), 'banking.csv-statement-detection')
				const c = invocation.inputs[1]!.value as CsvConfirmation
				return {
					key: 'admit-csv-statement',
					method: 'document_admit_csv_statement',
					payload: {
						detection: d.payload,
						detectionArtifactId: d.artifactId,
						confirmation: c.payload
					},
					inputs: [
						sourceInput,
						input(d.artifactId, 'detection'),
						input(c.artifactId, 'confirmation')
					]
				}
			},
			project: (result, invocation) =>
				facts(invocation, [
					[
						predicate(
							'bookkeeping.statement',
							F,
							documentAtom(invocation.id),
							documentAtom(artifact(result, 'banking.account-statement-candidate').artifactId)
						),
						result
					]
				])
		})
	}
	add({
		id: 'docs.inspect.v2',
		method: 'document_inspect',
		mode: 'observe',
		requires: [predicate('docs.file', 'F')],
		produces: [
			predicate('docs.inspection', 'F', 'I', 'Status'),
			predicate('docs.readable', 'F', 'I', 'Vision')
		],
		prepare: () => ({
			key: 'inspect',
			method: 'document_inspect',
			payload: { source, modelPageLimit },
			inputs: [sourceInput]
		}),
		project: (result, invocation) => {
			const document = result.result.document
			if (!document) throw new Error('inspector omitted decoded document')
			const I = documentAtom(artifact(result, 'core.file-inspection').artifactId)
			const observation = { ...result, document }
			const entries: Array<[string, unknown]> = [
				[predicate('docs.inspection', F, I, document.outcome), observation]
			]
			if (document.outcome === 'ok')
				entries.push([
					predicate(
						'docs.readable',
						F,
						I,
						actors.analyzePage &&
							actors.classifyDocument &&
							modelPageLimit >= document.pages.length &&
							document.pages.length > 0 &&
							document.pages.every((page) => page.image)
							? 'enabled'
							: 'disabled'
					),
					observation
				])
			return facts(invocation, entries)
		}
	})
	add({
		id: 'docs.decompose.v2',
		method: 'document_decompose',
		requires: [predicate('docs.readable', 'F', 'I', 'Vision')],
		produces: [
			predicate('docs.pages', 'F', 'C', 'Vision'),
			predicate('docs.page', 'F', 'P', 'Vision')
		],
		prepare: (invocation) => ({
			key: 'decompose-pages',
			method: 'document_decompose',
			payload: { document: value(invocation.inputs[0]).document },
			inputs: [
				sourceInput,
				input(
					artifact(outcome(invocation.inputs[0]), 'core.file-inspection').artifactId,
					'inspection'
				)
			]
		}),
		project: (result, invocation) => {
			const document = value(invocation.inputs[0]).document!
			const pages = result.artifacts.filter((item) => item.typeKey === 'docs.page')
			const vision = invocation.bindings.Vision!
			return facts(invocation, [
				[
					predicate('docs.pages', F, documentAtom(invocation.id), vision),
					{ ...result, members: pages.map((page) => documentAtom(page.artifactId)) }
				],
				...pages.map((item): [string, unknown] => [
					predicate('docs.page', F, documentAtom(item.artifactId), vision),
					{
						...result,
						artifacts: [item],
						page: document.pages.find((page) => page.page === item.payload.sourcePage)
					}
				])
			])
		}
	})
	add({
		id: 'docs.native.v2',
		method: 'document_extract_native_text',
		requires: [predicate('docs.page', 'F', 'P', 'Vision')],
		produces: [predicate('docs.native', 'F', 'P', 'N', 'Vision')],
		prepare: (invocation) => {
			const page = pageOf(invocation.inputs[0])
			return {
				key: `extract-native-page-${suffix(page)}`,
				method: 'document_extract_native_text',
				payload: { page },
				inputs: [
					sourceInput,
					input(artifact(outcome(invocation.inputs[0]), 'docs.page').artifactId, 'page')
				],
				parameters: { page: page.page }
			}
		},
		project: (result, invocation) =>
			facts(invocation, [
				[
					predicate(
						'docs.native',
						F,
						invocation.bindings.P!,
						documentAtom(invocation.id),
						invocation.bindings.Vision!
					),
					{ ...result, page: pageOf(invocation.inputs[0]) }
				]
			])
	})
	for (const fallback of [false, true]) {
		add({
			id: `docs.classify-signals.${fallback ? 'fallback' : 'native'}.v2`,
			method: 'document_classify_page',
			cost: 2,
			requires: [
				predicate('docs.page', 'F', 'P', fallback ? 'enabled' : 'disabled'),
				predicate('docs.native', 'F', 'P', 'N', fallback ? 'enabled' : 'disabled'),
				...(fallback ? [predicate('docs.analysis_failed', 'F', 'P', 'N')] : [])
			],
			produces: [
				predicate('docs.representation', 'F', 'P', 'R'),
				predicate('docs.page_class', 'F', 'P', 'C')
			],
			prepare: (invocation) => {
				const page = pageOf(invocation.inputs[0])
				const native = outcome(invocation.inputs[1])
				return {
					key: `classify-page-${fallback ? 'independent-' : ''}${suffix(page)}`,
					method: 'document_classify_page',
					payload: {
						page,
						extracted: extractedPageFrom(native.result, page.page),
						mediaType: source.declaredMediaType
					},
					inputs: [
						sourceInput,
						input(artifact(outcome(invocation.inputs[0]), 'docs.page').artifactId, 'page'),
						input(artifact(native, 'docs.extracted-text').artifactId, 'text')
					],
					parameters: { page: page.page }
				}
			},
			project: (result, invocation) =>
				facts(invocation, [
					[
						predicate(
							'docs.representation',
							F,
							invocation.bindings.P!,
							documentAtom(invocation.id)
						),
						outcome(invocation.inputs[1])
					],
					[
						predicate('docs.page_class', F, invocation.bindings.P!, documentAtom(invocation.id)),
						{ ...result, page: pageOf(invocation.inputs[0]) }
					]
				])
		})
	}
	if (actors.analyzePage)
		add({
			id: 'docs.analyze.v2',
			method: 'document_analyze_page',
			mode: 'observe',
			requires: [
				predicate('docs.page', 'F', 'P', 'enabled'),
				predicate('docs.native', 'F', 'P', 'N', 'enabled')
			],
			produces: [
				predicate('docs.representation', 'F', 'P', 'R'),
				predicate('docs.page_class', 'F', 'P', 'C')
			],
			failureProduces: [predicate('docs.analysis_failed', 'F', 'P', 'N')],
			prepare: (invocation) => {
				const page = pageOf(invocation.inputs[0])
				const native = outcome(invocation.inputs[1])
				return {
					key: `analyze-page-${suffix(page)}`,
					method: 'document_analyze_page',
					payload: { page, extracted: extractedPageFrom(native.result, page.page) },
					inputs: [
						sourceInput,
						input(artifact(outcome(invocation.inputs[0]), 'docs.page').artifactId, 'page'),
						...artifactsAsInputs(native.artifacts)
					],
					parameters: { page: page.page },
					maximumAttempts: 3
				}
			},
			project: (result, invocation) =>
				facts(invocation, [
					[
						predicate(
							'docs.representation',
							F,
							invocation.bindings.P!,
							documentAtom(invocation.id)
						),
						{ ...result, page: pageOf(invocation.inputs[0]) }
					],
					[
						predicate('docs.page_class', F, invocation.bindings.P!, documentAtom(invocation.id)),
						{ ...result, page: pageOf(invocation.inputs[0]) }
					]
				]),
			projectFailure: (invocation) =>
				facts(invocation, [
					[predicate('docs.analysis_failed', F, invocation.bindings.P!, invocation.bindings.N!), {}]
				])
		})
	const nativeGather = {
		name: 'native',
		collection: 1,
		member: 'P',
		predicate: predicate('docs.native', 'F', 'P', 'N', 'enabled')
	}
	if (actors.classifyDocument && !csv)
		add({
			id: 'docs.classify-kind.v2',
			method: 'document_classify_kind',
			mode: 'observe',
			requires: [
				predicate('docs.readable', 'F', 'I', 'enabled'),
				predicate('docs.pages', 'F', 'C', 'enabled')
			],
			gathers: [nativeGather],
			produces: [predicate('docs.kind', 'F', 'K', 'Family')],
			prepare: (invocation) => {
				const native = gathered(invocation, 'native')
				return {
					key: 'classify-document',
					method: 'document_classify_kind',
					payload: {
						document: value(invocation.inputs[0]).document,
						pages: native.map((item, index) =>
							extractedPageFrom(item.result, pageOf(invocation.gathers.native?.[index]).page)
						)
					},
					inputs: [sourceInput, ...artifactsAsInputs(native.flatMap((item) => item.artifacts))],
					maximumAttempts: 3
				}
			},
			project: (result, invocation) =>
				facts(invocation, [
					[
						predicate(
							'docs.kind',
							F,
							documentAtom(invocation.id),
							String(artifact(result, 'core.document-classification').payload.family)
						),
						result
					]
				])
		})
	add({
		id: 'docs.assemble.v2',
		method: 'document_assemble',
		cost: 3,
		requires: [predicate('docs.pages', 'F', 'C', 'Vision')],
		gathers: [
			{
				name: 'representations',
				collection: 0,
				member: 'P',
				predicate: predicate('docs.representation', 'F', 'P', 'R')
			}
		],
		produces: [predicate('docs.document_representation', 'F', 'R')],
		prepare: (invocation) => {
			const representations = gathered(invocation, 'representations')
			return {
				key: 'assemble-document',
				method: 'document_assemble',
				payload: {
					pages: representations.map((item, index) =>
						extractedPageFrom(item.result, pageOf(invocation.gathers.representations?.[index]).page)
					)
				},
				inputs: [
					sourceInput,
					...artifactsAsInputs(
						representations.flatMap((item) =>
							item.artifacts.filter((artifact) =>
								['docs.extracted-text', 'docs.text-layout'].includes(artifact.typeKey)
							)
						)
					)
				]
			}
		},
		project: (result, invocation) =>
			facts(invocation, [
				[predicate('docs.document_representation', F, documentAtom(invocation.id)), result]
			])
	})
	add({
		id: 'docs.aggregate.v2',
		method: 'document_aggregate_content',
		requires: [
			predicate('docs.pages', 'F', 'C', 'Vision'),
			predicate('docs.document_representation', 'F', 'R')
		],
		gathers: [
			{
				name: 'classifications',
				collection: 0,
				member: 'P',
				predicate: predicate('docs.page_class', 'F', 'P', 'K')
			}
		],
		produces: [predicate('docs.content', 'F', 'A')],
		prepare: (invocation) => {
			const classifications = gathered(invocation, 'classifications')
			return {
				key: 'aggregate-content',
				method: 'document_aggregate_content',
				payload: {
					pages: classifications.map((item, index) =>
						pageClassificationFrom(
							item.result,
							pageOf(invocation.gathers.classifications?.[index]).page
						)
					)
				},
				inputs: [
					sourceInput,
					...classifications.map((item, index) =>
						input(
							artifact(item, 'core.content-classification').artifactId,
							'page-classification',
							index
						)
					),
					...artifactsAsInputs(outcome(invocation.inputs[1]).artifacts)
				]
			}
		},
		project: (result, invocation) =>
			facts(invocation, [[predicate('docs.content', F, documentAtom(invocation.id)), result]])
	})
	for (const invoice of [true, false]) {
		const family = invoice ? 'invoice' : 'statement'
		const candidateType = invoice
			? 'bookkeeping.invoice-candidate'
			: 'banking.account-statement-candidate'
		const validationType = invoice
			? 'bookkeeping.invoice-validation'
			: 'banking.statement-validation'
		if (!csv && (invoice ? actors.extractInvoice : actors.extractStatement))
			add({
				id: `finance.extract-${family}.v3`,
				method: `document_extract_${family}`,
				mode: 'observe',
				requires: [
					predicate('docs.readable', 'F', 'Inspection', 'enabled'),
					predicate('docs.pages', 'F', 'C', 'enabled'),
					predicate('docs.kind', 'F', 'K', `${family}-family`)
				],
				gathers: [
					{
						name: 'representations',
						collection: 1,
						member: 'P',
						predicate: predicate('docs.representation', 'F', 'P', 'R')
					}
				],
				produces: [
					predicate(`bookkeeping.${family}`, 'F', 'B', 'I'),
					...(invoice ? [predicate('bookkeeping.invoice_details', 'F', 'B', 'D')] : [])
				],
				prepare: (invocation) => {
					const representations = gathered(invocation, 'representations')
					const classification = artifact(
						outcome(invocation.inputs[2]),
						'core.document-classification'
					)
					return {
						key: `extract-${family}`,
						method: `document_extract_${family}`,
						payload: {
							document: value(invocation.inputs[0]).document,
							pages: representations.map((item, index) =>
								extractedPageFrom(
									item.result,
									pageOf(invocation.gathers.representations?.[index]).page
								)
							),
							expectedKind: classification.payload.resolvedKind
						},
						inputs: [
							sourceInput,
							input(classification.artifactId, 'document-classification'),
							...artifactsAsInputs(
								representations
									.flatMap((item) => item.artifacts)
									.filter((item) =>
										['docs.extracted-text', 'docs.text-layout'].includes(item.typeKey)
									)
							)
						],
						maximumAttempts: 3
					}
				},
				project: (result, invocation) =>
					facts(invocation, [
						[
							predicate(
								`bookkeeping.${family}`,
								F,
								documentAtom(invocation.id),
								documentAtom(artifact(result, candidateType).artifactId)
							),
							result
						],
						...(invoice
							? [
									[
										predicate(
											'bookkeeping.invoice_details',
											F,
											documentAtom(invocation.id),
											documentAtom(artifact(result, 'bookkeeping.invoice-details').artifactId)
										),
										result
									] as [string, unknown]
								]
							: [])
					])
			})
		add({
			id: `finance.validate-${family}.v2`,
			method: `document_validate_${family}`,
			requires: [predicate(`bookkeeping.${family}`, 'F', 'B', 'I')],
			produces: [predicate(`bookkeeping.${family}_validation`, 'F', 'I', 'V')],
			prepare: (invocation) => {
				const candidate = artifact(outcome(invocation.inputs[0]), candidateType)
				return {
					key: `validate-${family}`,
					method: `document_validate_${family}`,
					payload: { candidate: candidate.payload },
					inputs: [sourceInput, input(candidate.artifactId, 'candidate')]
				}
			},
			project: (result, invocation) =>
				facts(invocation, [
					[
						predicate(
							`bookkeeping.${family}_validation`,
							F,
							invocation.bindings.I!,
							documentAtom(artifact(result, validationType).artifactId)
						),
						result
					]
				])
		})
	}
	add({
		id: 'finance.normalize-invoice.v2',
		method: 'document_normalize_open_item',
		requires: [
			predicate('bookkeeping.invoice', 'F', 'B', 'I'),
			predicate('bookkeeping.invoice_details', 'F', 'B', 'D'),
			predicate('bookkeeping.invoice_validation', 'F', 'I', 'V')
		],
		produces: [predicate('bookkeeping.open_item', 'F', 'I', 'O')],
		prepare: (invocation) => {
			const candidate = artifact(outcome(invocation.inputs[0]), 'bookkeeping.invoice-candidate')
			const details = artifact(outcome(invocation.inputs[1]), 'bookkeeping.invoice-details')
			const validation = artifact(outcome(invocation.inputs[2]), 'bookkeeping.invoice-validation')
			return {
				key: 'normalize-invoice-open-item',
				method: 'document_normalize_open_item',
				payload: {
					candidate: candidate.payload,
					details: details.payload,
					validation: validation.payload
				},
				inputs: [
					input(candidate.artifactId, 'candidate'),
					input(details.artifactId, 'details'),
					input(validation.artifactId, 'validation')
				]
			}
		},
		project: (result, invocation) =>
			facts(invocation, [
				[
					predicate(
						'bookkeeping.open_item',
						F,
						invocation.bindings.I!,
						documentAtom(artifact(result, 'bookkeeping.open-item').artifactId)
					),
					result
				]
			])
	})
	add({
		id: 'finance.normalize-statement.v2',
		method: 'document_normalize_statement',
		requires: [
			predicate('bookkeeping.statement', 'F', 'B', 'I'),
			predicate('bookkeeping.statement_validation', 'F', 'I', 'V')
		],
		produces: [
			predicate('banking.statement', 'F', 'I', 'S'),
			predicate('banking.transaction_batch', 'F', 'I', 'Offset')
		],
		prepare: (invocation) => {
			const candidate = artifact(
				outcome(invocation.inputs[0]),
				'banking.account-statement-candidate'
			)
			const validation = artifact(outcome(invocation.inputs[1]), 'banking.statement-validation')
			return {
				key: 'normalize-statement',
				method: 'document_normalize_statement',
				payload: { candidate: candidate.payload, validation: validation.payload },
				inputs: [
					input(candidate.artifactId, 'candidate'),
					input(validation.artifactId, 'validation')
				]
			}
		},
		project: (result, invocation) => {
			const candidate = artifact(
				outcome(invocation.inputs[0]),
				'banking.account-statement-candidate'
			)
			if (!Array.isArray(candidate.payload.transactions))
				throw new Error('invalid statement transactions')
			const entries: Array<[string, unknown]> = [
				[
					predicate(
						'banking.statement',
						F,
						invocation.bindings.I!,
						documentAtom(artifact(result, 'banking.statement').artifactId)
					),
					result
				]
			]
			for (let offset = 0; offset < candidate.payload.transactions.length; offset += 64)
				entries.push([
					predicate('banking.transaction_batch', F, invocation.bindings.I!, `offset_${offset}`),
					{ offset }
				])
			return facts(invocation, entries)
		}
	})
	add({
		id: 'finance.fanout-transactions.v2',
		method: 'document_fanout_statement_transactions',
		requires: [
			predicate('bookkeeping.statement', 'F', 'B', 'I'),
			predicate('bookkeeping.statement_validation', 'F', 'I', 'V'),
			predicate('banking.statement', 'F', 'I', 'S'),
			predicate('banking.transaction_batch', 'F', 'I', 'Offset')
		],
		produces: [predicate('banking.transaction', 'F', 'S', 'T')],
		prepare: (invocation) => {
			const candidate = artifact(
				outcome(invocation.inputs[0]),
				'banking.account-statement-candidate'
			)
			const validation = artifact(outcome(invocation.inputs[1]), 'banking.statement-validation')
			const statement = artifact(outcome(invocation.inputs[2]), 'banking.statement')
			const offset = value(invocation.inputs[3]).offset!
			return {
				key: `fanout-statement-transactions-${String(offset / 64 + 1).padStart(3, '0')}`,
				method: 'document_fanout_statement_transactions',
				payload: { candidate: candidate.payload, validation: validation.payload, offset },
				inputs: [
					input(candidate.artifactId, 'candidate'),
					input(validation.artifactId, 'validation'),
					input(statement.artifactId, 'statement')
				],
				parameters: { offset }
			}
		},
		project: (result, invocation) =>
			facts(
				invocation,
				result.artifacts.map((item) => [
					predicate(
						'banking.transaction',
						F,
						invocation.bindings.S!,
						documentAtom(item.artifactId)
					),
					{ ...result, artifacts: [item] }
				])
			)
	})
	return definitions
}
