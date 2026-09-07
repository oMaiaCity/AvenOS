import type { Actor } from '@avenos/actors'
import type { DocumentModelGateway } from '../model'
import type { DocumentDecoder } from '../shared'
import { createContentAggregatorActor } from './content-aggregator'
import { createCsvStatementAdmitterActor } from './csv-statement-admitter'
import { createCsvStatementDetectorActor } from './csv-statement-detector'
import { createDocumentAssemblerActor } from './document-assembler'
import { createDocumentDecomposerActor } from './document-decomposer'
import { createDocumentInspectorActor } from './document-inspector'
import { createDocumentKindClassifierActor } from './document-kind-classifier'
import { createInvoiceExtractorActor } from './invoice-extractor'
import { createInvoiceValidatorActor } from './invoice-validator'
import { createNativeTextExtractorActor } from './native-text-extractor'
import { createOpenItemNormalizerActor } from './open-item-normalizer'
import { createPageSignalClassifierActor } from './page-signal-classifier'
import { createReconciliationRankerActor } from './reconciliation-ranker'
import { createStatementExtractorActor } from './statement-extractor'
import { createStatementNormalizerActor } from './statement-normalizer'
import { createStatementTransactionFanoutActor } from './statement-transaction-fanout'
import { createStatementValidatorActor } from './statement-validator'
import { createVisualPageAnalyzerActor } from './visual-page-analyzer'

export interface DocumentActors {
	inspect: Actor
	decompose: Actor
	extractText: Actor
	classifyPage: Actor
	assemble: Actor
	aggregate: Actor
	analyzePage?: Actor
	classifyDocument?: Actor
	extractInvoice?: Actor
	extractStatement?: Actor
	validateInvoice: Actor
	validateStatement: Actor
	normalizeOpenItem: Actor
	normalizeStatement: Actor
	fanoutStatementTransactions: Actor
	rankReconciliation: Actor
	all: Actor[]
}

/** Compose the built-in actor registry; each actor implementation owns one directory. */
export function createDocumentActors(
	decoder: DocumentDecoder,
	model?: DocumentModelGateway
): DocumentActors {
	const inspect = createDocumentInspectorActor(decoder)
	const csvDetector = createCsvStatementDetectorActor()
	const csvAdmitter = createCsvStatementAdmitterActor()
	const decompose = createDocumentDecomposerActor()
	const extractText = createNativeTextExtractorActor()
	const classifyPage = createPageSignalClassifierActor()
	const assemble = createDocumentAssemblerActor()
	const aggregate = createContentAggregatorActor()
	const analyzePage = model ? createVisualPageAnalyzerActor(model) : undefined
	const classifyDocument = model ? createDocumentKindClassifierActor(model) : undefined
	const extractInvoice = model ? createInvoiceExtractorActor(model) : undefined
	const extractStatement = model ? createStatementExtractorActor(model) : undefined
	const validateInvoice = createInvoiceValidatorActor()
	const validateStatement = createStatementValidatorActor()
	const normalizeOpenItem = createOpenItemNormalizerActor()
	const normalizeStatement = createStatementNormalizerActor()
	const fanoutStatementTransactions = createStatementTransactionFanoutActor()
	const rankReconciliation = createReconciliationRankerActor()
	const optionalModelActors = [
		analyzePage,
		classifyDocument,
		extractInvoice,
		extractStatement
	].filter((actor): actor is Actor => Boolean(actor))
	return {
		inspect,
		decompose,
		extractText,
		classifyPage,
		assemble,
		aggregate,
		analyzePage,
		classifyDocument,
		extractInvoice,
		extractStatement,
		validateInvoice,
		validateStatement,
		normalizeOpenItem,
		normalizeStatement,
		fanoutStatementTransactions,
		rankReconciliation,
		all: [
			csvDetector,
			csvAdmitter,
			inspect,
			decompose,
			extractText,
			classifyPage,
			assemble,
			aggregate,
			...optionalModelActors,
			validateInvoice,
			validateStatement,
			normalizeOpenItem,
			normalizeStatement,
			fanoutStatementTransactions,
			rankReconciliation
		]
	}
}
