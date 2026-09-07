import { createHash, randomUUID } from 'node:crypto'
import {
	type ArtifactJson,
	ArtifactStoreClient,
	ArtifactStoreProblem,
	canonicalArtifactJsonText,
	clientRunIdentity
} from '@avenos/artifact-store'
import { CSV_DETECTOR_VERSION, detectCsvStatement, isCsvSource } from '@avenos/document-ingest/csv'
import { csvConfirmationIdentity } from '@avenos/document-ingest/csv-confirmation'
import type { ArtifactStoreConfig } from '../config.js'
import { AppError } from '../errors.js'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function sameJson(left: unknown, right: unknown): boolean {
	if (left === undefined || right === undefined) return false
	return (
		canonicalArtifactJsonText(left as ArtifactJson) ===
		canonicalArtifactJsonText(right as ArtifactJson)
	)
}

export const MAX_ARTIFACT_FILE_BYTES = 25 * 1024 * 1024

export interface PublishFileInput {
	userId: string
	databaseName: string
	scopeId: string
	routingGeneration?: number
	publicationId: string
	intentId: string
	observedAt: string
	originalName: string
	mediaType: string
	sha256: string
	length: number
	body: BodyInit
	sourceKind: 'desktop-drop' | 'client-actor-ingest'
	executionEnvironment?: 'local' | 'server'
}

export interface PublishedFile {
	publicationId: string
	intentId: string
	intentDeclarationArtifactId: string
	artifactId: string
	originalName: string
	mediaType: string
	sha256: string
	length: number
	scopeSequence: number
	replayed: boolean
}

export interface ClientRunArtifact {
	localKey: string
	typeKey: string
	typeVersion: number
	payload: ArtifactJson
	output: { role: string; ordinal: number }
	blob?: { mediaType: string; base64: string }
}

export interface ClientRunEvidence {
	ordinal: number
	outputLocalKey: string
	outputLocator: ArtifactJson
	inputRole: string
	inputOrdinal: number
	inputLocator: ArtifactJson
}

export interface PublishClientRunInput {
	userId: string
	databaseName: string
	scopeId: string
	routingGeneration?: number
	publicationId: string
	procedureKey: string
	procedureVersion: 'client-v1'
	inputs: Array<{ role: string; ordinal: number; artifactId: string }>
	parameters: ArtifactJson
	artifacts: ClientRunArtifact[]
	evidence: ClientRunEvidence[]
}

export interface PublishedClientRun {
	publicationId: string
	runId: string
	replayed: boolean
	scopeSequence: number
	artifacts: Array<{ localKey: string; artifactId: string }>
}

interface ClientProcedureDescriptor {
	actor: string
	deterministic?: boolean
	validate: (input: PublishClientRunInput) => void
}

interface ExpectedClientArtifact {
	localKey: string
	typeKey: string
	role: string
	ordinal: number
	blob: 'required' | 'forbidden'
	typeVersion?: number
}

function invalidClientContract(message: string): never {
	throw new AppError(400, 'CLIENT_PROCEDURE_CONTRACT_INVALID', message)
}

function clientRecord(value: ArtifactJson, label: string): Record<string, ArtifactJson> {
	if (value === null || Array.isArray(value) || typeof value !== 'object') {
		return invalidClientContract(`${label} must be an object.`)
	}
	return value as Record<string, ArtifactJson>
}

function expectInputs(
	input: PublishClientRunInput,
	expected: Record<string, { min: number; max: number }>
): void {
	const byRole = new Map<string, number[]>()
	for (const item of input.inputs) {
		if (!Object.hasOwn(expected, item.role)) {
			invalidClientContract(`${input.procedureKey} cannot consume input role ${item.role}.`)
		}
		const ordinals = byRole.get(item.role) ?? []
		ordinals.push(item.ordinal)
		byRole.set(item.role, ordinals)
	}
	for (const [role, bounds] of Object.entries(expected)) {
		const ordinals = (byRole.get(role) ?? []).sort((left, right) => left - right)
		if (ordinals.length < bounds.min || ordinals.length > bounds.max) {
			invalidClientContract(
				`${input.procedureKey} requires ${bounds.min}-${bounds.max} ${role} input(s).`
			)
		}
		if (ordinals.some((ordinal, index) => ordinal !== index)) {
			invalidClientContract(`${input.procedureKey} input ordinals for ${role} must be dense.`)
		}
	}
}

function expectParameters(input: PublishClientRunInput, page: boolean): void {
	const parameters = clientRecord(input.parameters, `${input.procedureKey} parameters`)
	const keys = Object.keys(parameters)
	if (!page) {
		if (keys.length !== 0) invalidClientContract(`${input.procedureKey} takes no parameters.`)
		return
	}
	const value = parameters.page
	if (
		keys.length !== 1 ||
		typeof value !== 'number' ||
		!Number.isInteger(value) ||
		value < 1 ||
		value > 63
	) {
		invalidClientContract(`${input.procedureKey} requires one page parameter in the range 1-63.`)
	}
}

function expectModelParameters(input: PublishClientRunInput, page: boolean): void {
	const parameters = clientRecord(input.parameters, `${input.procedureKey} parameters`)
	const keys = Object.keys(parameters).sort()
	const expected = page ? ['modelReceipt', 'page'] : ['modelReceipt']
	if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
		invalidClientContract(`${input.procedureKey} model parameters are invalid.`)
	}
	if (page) {
		const value = parameters.page
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 63) {
			invalidClientContract(`${input.procedureKey} page parameter is invalid.`)
		}
	}
	const receipt = clientRecord(
		parameters.modelReceipt ?? null,
		`${input.procedureKey} model receipt`
	)
	for (const field of ['model', 'profile', 'requestKey', 'promptDigest', 'implementationDigest']) {
		if (typeof receipt[field] !== 'string' || receipt[field].length < 1) {
			invalidClientContract(`${input.procedureKey} model receipt ${field} is invalid.`)
		}
	}
}

function expectArtifacts(input: PublishClientRunInput, expected: ExpectedClientArtifact[]): void {
	if (input.artifacts.length !== expected.length) {
		invalidClientContract(
			`${input.procedureKey} must publish exactly ${expected.length} artifact(s).`
		)
	}
	for (const slot of expected) {
		const artifact = input.artifacts.find((candidate) => candidate.localKey === slot.localKey)
		if (
			!artifact ||
			artifact.typeKey !== slot.typeKey ||
			artifact.typeVersion !== (slot.typeVersion ?? 1) ||
			artifact.output.role !== slot.role ||
			artifact.output.ordinal !== slot.ordinal ||
			(slot.blob === 'required') !== Boolean(artifact.blob)
		) {
			invalidClientContract(`${input.procedureKey} output ${slot.localKey} violates its contract.`)
		}
		if (
			artifact.blob &&
			!(
				(artifact.typeKey === 'docs.extracted-text' &&
					artifact.blob.mediaType === 'text/plain; charset=utf-8') ||
				(artifact.typeKey === 'core.file-inspection' &&
					artifact.blob.mediaType === 'application/json')
			)
		) {
			invalidClientContract(`${input.procedureKey} output ${slot.localKey} has an invalid blob.`)
		}
	}
}

function expectClassificationLevel(
	input: PublishClientRunInput,
	level: 'file' | 'page',
	mode: 'rule' | 'model' = 'rule'
): void {
	const classification = input.artifacts.find(
		(artifact) => artifact.typeKey === 'core.content-classification'
	)
	const payload = classification
		? clientRecord(classification.payload, 'classification payload')
		: undefined
	if (!payload || payload.subjectLevel !== level || payload.resolutionMode !== mode) {
		invalidClientContract(
			`${input.procedureKey} must publish a ${mode}-derived ${level}-level classification.`
		)
	}
}

function expectText(
	input: PublishClientRunInput,
	pageCount: number,
	method: 'native' | 'ocr' | 'either' = 'native'
): void {
	const text = input.artifacts.find((artifact) => artifact.typeKey === 'docs.extracted-text')
	const payload = text ? clientRecord(text.payload, 'native text payload') : undefined
	if (
		!payload ||
		(method !== 'either' && payload.method !== method) ||
		(method === 'either' && !['native', 'ocr'].includes(String(payload.method))) ||
		payload.pageCount !== pageCount
	) {
		invalidClientContract(
			`${input.procedureKey} must publish ${method} text for exactly ${pageCount} page(s).`
		)
	}
}

function validateCommonClientContract(input: PublishClientRunInput): void {
	const inputSlots = new Set<string>()
	for (const item of input.inputs) {
		const slot = `${item.role}:${item.ordinal}`
		if (inputSlots.has(slot)) invalidClientContract(`Duplicate client input slot ${slot}.`)
		inputSlots.add(slot)
	}
	const localKeys = new Set<string>()
	const outputSlots = new Set<string>()
	for (const artifact of input.artifacts) {
		if (localKeys.has(artifact.localKey)) {
			invalidClientContract(`Duplicate client output key ${artifact.localKey}.`)
		}
		localKeys.add(artifact.localKey)
		const slot = `${artifact.output.role}:${artifact.output.ordinal}`
		if (outputSlots.has(slot)) invalidClientContract(`Duplicate client output slot ${slot}.`)
		outputSlots.add(slot)
	}
	const evidenceOrdinals = new Set<number>()
	for (const evidence of input.evidence) {
		if (evidenceOrdinals.has(evidence.ordinal)) {
			invalidClientContract(`Duplicate client evidence ordinal ${evidence.ordinal}.`)
		}
		evidenceOrdinals.add(evidence.ordinal)
		if (!localKeys.has(evidence.outputLocalKey)) {
			invalidClientContract(`Evidence names unknown output ${evidence.outputLocalKey}.`)
		}
		if (!inputSlots.has(`${evidence.inputRole}:${evidence.inputOrdinal}`)) {
			invalidClientContract(
				`Evidence names unknown input ${evidence.inputRole}:${evidence.inputOrdinal}.`
			)
		}
	}
	const ordinals = [...evidenceOrdinals].sort((left, right) => left - right)
	if (ordinals.some((ordinal, index) => ordinal !== index)) {
		invalidClientContract('Client evidence ordinals must be dense.')
	}
}

const inspectionOutput: ExpectedClientArtifact = {
	localKey: 'inspection',
	typeKey: 'core.file-inspection',
	typeVersion: 2,
	role: 'inspection',
	ordinal: 0,
	blob: 'required'
}
const textOutput: ExpectedClientArtifact = {
	localKey: 'text',
	typeKey: 'docs.extracted-text',
	role: 'text',
	ordinal: 0,
	blob: 'required'
}
const layoutOutput: ExpectedClientArtifact = {
	localKey: 'layout',
	typeKey: 'docs.text-layout',
	role: 'layout',
	ordinal: 0,
	blob: 'forbidden'
}
const classificationOutput: ExpectedClientArtifact = {
	localKey: 'classification',
	typeKey: 'core.content-classification',
	role: 'classification',
	ordinal: 0,
	blob: 'forbidden'
}
const descriptionOutput: ExpectedClientArtifact = {
	localKey: 'description',
	typeKey: 'core.content-description',
	role: 'description',
	ordinal: 0,
	blob: 'forbidden'
}
const documentClassificationOutput: ExpectedClientArtifact = {
	localKey: 'classification',
	typeKey: 'core.document-classification',
	role: 'classification',
	ordinal: 0,
	blob: 'forbidden'
}
const invoiceOutput: ExpectedClientArtifact = {
	localKey: 'invoice',
	typeKey: 'bookkeeping.invoice-candidate',
	typeVersion: 2,
	role: 'candidate',
	ordinal: 0,
	blob: 'forbidden'
}
const invoiceDetailsOutput: ExpectedClientArtifact = {
	localKey: 'details',
	typeKey: 'bookkeeping.invoice-details',
	role: 'details',
	ordinal: 0,
	blob: 'forbidden',
	typeVersion: 2
}
const statementOutput: ExpectedClientArtifact = {
	localKey: 'statement',
	typeKey: 'banking.account-statement-candidate',
	role: 'candidate',
	ordinal: 0,
	blob: 'forbidden',
	typeVersion: 2
}
const invoiceValidationOutput: ExpectedClientArtifact = {
	localKey: 'validation',
	typeKey: 'bookkeeping.invoice-validation',
	role: 'validation',
	ordinal: 0,
	blob: 'forbidden'
}
const statementValidationOutput: ExpectedClientArtifact = {
	localKey: 'validation',
	typeKey: 'banking.statement-validation',
	role: 'validation',
	ordinal: 0,
	blob: 'forbidden'
}
const openItemOutput: ExpectedClientArtifact = {
	localKey: 'open-item',
	typeKey: 'bookkeeping.open-item',
	role: 'open-item',
	ordinal: 0,
	blob: 'forbidden'
}

const normalizedStatementOutput: ExpectedClientArtifact = {
	localKey: 'normalized-statement',
	typeKey: 'banking.statement',
	role: 'statement',
	ordinal: 0,
	blob: 'forbidden'
}

function statementBatchOffset(input: PublishClientRunInput): number {
	const parameters = clientRecord(input.parameters, `${input.procedureKey} parameters`)
	const offset = parameters.offset
	if (
		Object.keys(parameters).length !== 1 ||
		typeof offset !== 'number' ||
		!Number.isInteger(offset) ||
		offset < 0 ||
		offset > 127 ||
		offset % 64 !== 0
	) {
		invalidClientContract(`${input.procedureKey} requires an offset of 0 or 64.`)
	}
	return offset
}

function expectStatementTransactionBatch(input: PublishClientRunInput, offset: number): void {
	if (input.artifacts.length < 1 || input.artifacts.length > 64) {
		invalidClientContract('client.fanout-statement-transactions must publish 1-64 transactions.')
	}
	const transactions = [...input.artifacts].sort(
		(left, right) => left.output.ordinal - right.output.ordinal
	)
	for (const [ordinal, transaction] of transactions.entries()) {
		const localKey = `transaction-${String(offset + ordinal + 1).padStart(3, '0')}`
		const payload = clientRecord(transaction.payload, `${localKey} payload`)
		if (
			transaction.localKey !== localKey ||
			transaction.typeKey !== 'banking.transaction' ||
			transaction.typeVersion !== 1 ||
			transaction.output.role !== 'transaction' ||
			transaction.output.ordinal !== ordinal ||
			payload.sourceOrdinal !== offset + ordinal ||
			transaction.blob
		) {
			invalidClientContract(`client.fanout-statement-transactions output ${localKey} is invalid.`)
		}
	}
}

function expectReconciliationMatches(input: PublishClientRunInput): void {
	if (input.artifacts.length < 1 || input.artifacts.length > 64) {
		invalidClientContract('client.rank-invoice-transactions must publish 1-64 match candidates.')
	}
	const matches = [...input.artifacts].sort(
		(left, right) => left.output.ordinal - right.output.ordinal
	)
	for (const [ordinal, match] of matches.entries()) {
		const localKey = `match-${String(ordinal + 1).padStart(3, '0')}`
		const payload = clientRecord(match.payload, `${localKey} payload`)
		if (
			match.localKey !== localKey ||
			match.typeKey !== 'reconciliation.match-candidate' ||
			match.typeVersion !== 2 ||
			match.output.role !== 'match-candidate' ||
			match.output.ordinal !== ordinal ||
			payload.matcherVersion !== 'invoice-transaction-v2' ||
			!Number.isSafeInteger(payload.transactionInputOrdinal) ||
			!input.inputs.some(
				(item) => item.role === 'transaction' && item.ordinal === payload.transactionInputOrdinal
			) ||
			payload.rank !== ordinal + 1 ||
			match.blob
		) {
			invalidClientContract(`client.rank-invoice-transactions output ${localKey} is invalid.`)
		}
	}
}

const CLIENT_PROCEDURES: Record<string, ClientProcedureDescriptor> = {
	'client.detect-csv-statement': {
		actor: 'csv-statement-detector',
		validate: (input) => {
			expectInputs(input, { source: { min: 1, max: 1 } })
			expectParameters(input, false)
			expectArtifacts(input, [
				{
					localKey: 'detection',
					typeKey: 'banking.csv-statement-detection',
					role: 'detection',
					ordinal: 0,
					blob: 'forbidden'
				}
			])
		}
	},
	'client.confirm-csv-statement': {
		actor: 'csv-document-review',
		validate: (input) => {
			expectInputs(input, { source: { min: 1, max: 1 }, detection: { min: 1, max: 1 } })
			expectParameters(input, false)
			expectArtifacts(input, [
				{
					localKey: 'confirmation',
					typeKey: 'banking.csv-statement-confirmation',
					role: 'confirmation',
					ordinal: 0,
					blob: 'forbidden'
				}
			])
		}
	},
	'client.admit-csv-statement': {
		actor: 'csv-statement-admitter',
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				detection: { min: 1, max: 1 },
				confirmation: { min: 1, max: 1 }
			})
			expectParameters(input, false)
			expectArtifacts(input, [statementOutput])
		}
	},
	'client.review-reconciliation': {
		actor: 'reconciliation-review',
		validate: (input) => {
			expectInputs(input, {
				'match-candidate': { min: 1, max: 1 },
				'open-item': { min: 1, max: 1 },
				transaction: { min: 1, max: 1 }
			})
			expectParameters(input, false)
			expectArtifacts(input, [
				{
					localKey: 'decision',
					typeKey: 'reconciliation.decision',
					role: 'decision',
					ordinal: 0,
					blob: 'forbidden'
				}
			])
			const payload = clientRecord(input.artifacts[0]!.payload, 'reconciliation decision')
			if (
				!['accepted', 'rejected'].includes(String(payload.decision)) ||
				payload.relation !== 'supports-booking'
			)
				invalidClientContract('Invalid reconciliation decision.')
			for (const [field, role] of [
				['candidateArtifactId', 'match-candidate'],
				['openItemArtifactId', 'open-item'],
				['transactionArtifactId', 'transaction']
			]) {
				if (payload[field!] !== input.inputs.find((item) => item.role === role)?.artifactId)
					invalidClientContract('Decision identity differs from its production inputs.')
			}
		}
	},
	'client.inspect-file': {
		actor: 'document-inspector',
		validate: (input) => {
			expectInputs(input, { source: { min: 1, max: 1 } })
			expectParameters(input, false)
			expectArtifacts(input, [inspectionOutput])
		}
	},
	'client.decompose-pages': {
		actor: 'document-decomposer',
		validate: (input) => {
			expectInputs(input, { source: { min: 1, max: 1 }, inspection: { min: 1, max: 1 } })
			expectParameters(input, false)
			if (input.artifacts.length < 1 || input.artifacts.length > 63) {
				invalidClientContract('client.decompose-pages must publish 1-63 page artifacts.')
			}
			const pages = [...input.artifacts].sort(
				(left, right) => left.output.ordinal - right.output.ordinal
			)
			for (const [ordinal, page] of pages.entries()) {
				const localKey = `page-${String(ordinal + 1).padStart(3, '0')}`
				const payload = clientRecord(page.payload, `${localKey} payload`)
				if (
					page.localKey !== localKey ||
					page.typeKey !== 'docs.page' ||
					page.output.role !== 'page' ||
					page.output.ordinal !== ordinal ||
					page.blob ||
					payload.sourcePage !== ordinal + 1
				) {
					invalidClientContract(`client.decompose-pages output ${localKey} violates its contract.`)
				}
			}
		}
	},
	'client.extract-native-text': {
		actor: 'native-text-extractor',
		validate: (input) => {
			expectInputs(input, { source: { min: 1, max: 1 }, page: { min: 1, max: 1 } })
			expectParameters(input, true)
			expectArtifacts(input, [textOutput, layoutOutput])
			expectText(input, 1)
		}
	},
	'client.classify-page-signals': {
		actor: 'page-signal-classifier',
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				page: { min: 1, max: 1 },
				text: { min: 1, max: 1 }
			})
			expectParameters(input, true)
			expectArtifacts(input, [classificationOutput])
			expectClassificationLevel(input, 'page')
		}
	},
	'client.assemble-document-representation': {
		actor: 'document-assembler',
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				text: { min: 1, max: 63 },
				layout: { min: 1, max: 63 }
			})
			const texts = input.inputs.filter((item) => item.role === 'text').length
			const layouts = input.inputs.filter((item) => item.role === 'layout').length
			if (texts !== layouts) {
				invalidClientContract('client.assemble-document-representation requires paired inputs.')
			}
			expectParameters(input, false)
			expectArtifacts(input, [textOutput, layoutOutput])
			expectText(input, texts, 'either')
		}
	},
	'client.aggregate-content-classification': {
		actor: 'content-aggregator',
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				'page-classification': { min: 1, max: 63 },
				text: { min: 1, max: 1 },
				layout: { min: 1, max: 1 }
			})
			expectParameters(input, false)
			expectArtifacts(input, [classificationOutput])
			expectClassificationLevel(input, 'file')
		}
	},
	'client.analyze-page-model': {
		actor: 'visual-page-analyzer',
		deterministic: false,
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				page: { min: 1, max: 1 },
				text: { min: 1, max: 1 },
				layout: { min: 1, max: 1 }
			})
			expectModelParameters(input, true)
			expectArtifacts(input, [textOutput, layoutOutput, classificationOutput, descriptionOutput])
			expectText(input, 1, 'ocr')
			expectClassificationLevel(input, 'page', 'model')
		}
	},
	'client.classify-document-model': {
		actor: 'document-kind-classifier',
		deterministic: false,
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				text: { min: 1, max: 63 },
				layout: { min: 1, max: 63 }
			})
			expectModelParameters(input, false)
			expectArtifacts(input, [documentClassificationOutput])
			const payload = clientRecord(input.artifacts[0]?.payload ?? null, 'classification payload')
			if (payload.resolutionMode !== 'model') {
				invalidClientContract('client.classify-document-model must be model-derived.')
			}
		}
	},
	'client.extract-invoice-model': {
		actor: 'invoice-extractor',
		deterministic: false,
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				'document-classification': { min: 1, max: 1 },
				text: { min: 1, max: 63 },
				layout: { min: 1, max: 63 }
			})
			expectModelParameters(input, false)
			expectArtifacts(input, [invoiceOutput, invoiceDetailsOutput])
		}
	},
	'client.extract-statement-model': {
		actor: 'statement-extractor',
		deterministic: false,
		validate: (input) => {
			expectInputs(input, {
				source: { min: 1, max: 1 },
				'document-classification': { min: 1, max: 1 },
				text: { min: 1, max: 63 },
				layout: { min: 1, max: 63 }
			})
			expectModelParameters(input, false)
			expectArtifacts(input, [statementOutput])
		}
	},
	'client.validate-invoice': {
		actor: 'invoice-validator',
		validate: (input) => {
			expectInputs(input, { source: { min: 1, max: 1 }, candidate: { min: 1, max: 1 } })
			expectParameters(input, false)
			expectArtifacts(input, [invoiceValidationOutput])
		}
	},
	'client.validate-statement': {
		actor: 'statement-validator',
		validate: (input) => {
			expectInputs(input, { source: { min: 1, max: 1 }, candidate: { min: 1, max: 1 } })
			expectParameters(input, false)
			expectArtifacts(input, [statementValidationOutput])
		}
	},
	'client.normalize-invoice-open-item': {
		actor: 'open-item-normalizer',
		validate: (input) => {
			expectInputs(input, {
				candidate: { min: 1, max: 1 },
				details: { min: 1, max: 1 },
				validation: { min: 1, max: 1 }
			})
			expectParameters(input, false)
			expectArtifacts(input, [openItemOutput])
		}
	},
	'client.normalize-statement': {
		actor: 'statement-normalizer',
		validate: (input) => {
			expectInputs(input, {
				candidate: { min: 1, max: 1 },
				validation: { min: 1, max: 1 }
			})
			expectParameters(input, false)
			expectArtifacts(input, [normalizedStatementOutput])
		}
	},
	'client.fanout-statement-transactions': {
		actor: 'statement-transaction-fanout',
		validate: (input) => {
			expectInputs(input, {
				candidate: { min: 1, max: 1 },
				validation: { min: 1, max: 1 },
				statement: { min: 1, max: 1 }
			})
			const offset = statementBatchOffset(input)
			expectStatementTransactionBatch(input, offset)
		}
	},
	'client.rank-invoice-transactions': {
		actor: 'reconciliation-ranker',
		validate: (input) => {
			expectInputs(input, {
				'open-item': { min: 1, max: 1 },
				transaction: { min: 1, max: 64 }
			})
			expectParameters(input, false)
			expectReconciliationMatches(input)
		}
	}
}

export interface BrowsedArtifact {
	artifactId: string
	localKey: string
	publicationOrdinal: number
	typeKey: string
	typeVersion: number
	artifactSha256: string
	producerRunId: string | null
	output: ArtifactJson
	inputs: ArtifactLineageInput[]
	publicationId: string
	scopeSequence: number
	publicationKind: string
	runId: string | null
	committedAt: string
}

export interface ArtifactLineageInput {
	role: string
	ordinal: number
	artifactId: string
}

export type ArtifactLocator =
	| { kind: 'artifact-root' }
	| { kind: 'json-pointer'; pointer: string }
	| { kind: 'byte-range'; start: number; endExclusive: number }
	| { kind: 'page-region'; page: number; x: number; y: number; width: number; height: number }

export interface ArtifactEvidence {
	ordinal: number
	outputArtifactId: string
	outputLocator: ArtifactLocator
	inputRole: string
	inputOrdinal: number
	inputArtifactId: string
	inputLocator: ArtifactLocator
}

export interface ArtifactBrowseResult {
	storeEpoch: string
	artifacts: BrowsedArtifact[]
	truncated: boolean
}

function record(value: ArtifactJson, label: string): { readonly [key: string]: ArtifactJson } {
	if (value === null || Array.isArray(value) || typeof value !== 'object') {
		throw new AppError(502, 'ARTIFACT_STORE_INVALID_RESPONSE', `${label} was not an object.`)
	}
	return value as { readonly [key: string]: ArtifactJson }
}

function stringField(value: ArtifactJson, key: string, label: string): string {
	const field = record(value, label)[key]
	if (typeof field !== 'string') {
		throw new AppError(502, 'ARTIFACT_STORE_INVALID_RESPONSE', `${label}.${key} was invalid.`)
	}
	return field
}

function numberField(value: ArtifactJson, key: string, label: string): number {
	const field = record(value, label)[key]
	if (typeof field !== 'number') {
		throw new AppError(502, 'ARTIFACT_STORE_INVALID_RESPONSE', `${label}.${key} was invalid.`)
	}
	return field
}

function booleanField(value: ArtifactJson, key: string, label: string): boolean {
	const field = record(value, label)[key]
	if (typeof field !== 'boolean') {
		throw new AppError(502, 'ARTIFACT_STORE_INVALID_RESPONSE', `${label}.${key} was invalid.`)
	}
	return field
}

function lineageInputs(value: ArtifactJson | undefined): ArtifactLineageInput[] {
	if (value === undefined) return []
	if (!Array.isArray(value)) {
		throw new AppError(502, 'ARTIFACT_STORE_INVALID_RESPONSE', 'publication.inputs was invalid.')
	}
	return value.map((inputValue) => {
		const input = record(inputValue, 'run input')
		return {
			role: stringField(input, 'role', 'run input'),
			ordinal: numberField(input, 'ordinal', 'run input'),
			artifactId: stringField(input, 'artifactId', 'run input')
		}
	})
}

function locator(value: ArtifactJson | undefined, label: string): ArtifactLocator {
	const source = record(value ?? null, label)
	const kind = stringField(source, 'kind', label)
	if (kind === 'artifact-root') return { kind }
	if (kind === 'json-pointer') {
		return { kind, pointer: stringField(source, 'pointer', label) }
	}
	if (kind === 'byte-range') {
		return {
			kind,
			start: numberField(source, 'start', label),
			endExclusive: numberField(source, 'endExclusive', label)
		}
	}
	if (kind === 'page-region') {
		return {
			kind,
			page: numberField(source, 'page', label),
			x: numberField(source, 'x', label),
			y: numberField(source, 'y', label),
			width: numberField(source, 'width', label),
			height: numberField(source, 'height', label)
		}
	}
	throw new AppError(502, 'ARTIFACT_STORE_INVALID_RESPONSE', `${label}.kind was invalid.`)
}

function artifactEvidence(value: ArtifactJson | undefined): ArtifactEvidence[] {
	if (value === undefined) return []
	if (!Array.isArray(value)) {
		throw new AppError(502, 'ARTIFACT_STORE_INVALID_RESPONSE', 'supporting evidence was invalid.')
	}
	return value.map((evidenceValue) => {
		const evidence = record(evidenceValue, 'artifact evidence')
		return {
			ordinal: numberField(evidence, 'ordinal', 'artifact evidence'),
			outputArtifactId: stringField(evidence, 'outputArtifactId', 'artifact evidence'),
			outputLocator: locator(evidence.outputLocator, 'artifact evidence.outputLocator'),
			inputRole: stringField(evidence, 'inputRole', 'artifact evidence'),
			inputOrdinal: numberField(evidence, 'inputOrdinal', 'artifact evidence'),
			inputArtifactId: stringField(evidence, 'inputArtifactId', 'artifact evidence'),
			inputLocator: locator(evidence.inputLocator, 'artifact evidence.inputLocator')
		}
	})
}

async function inChunks<T>(values: T[], size: number, work: (value: T) => Promise<void>) {
	for (let offset = 0; offset < values.length; offset += size) {
		await Promise.all(values.slice(offset, offset + size).map(work))
	}
}

export class ArtifactFileService {
	readonly #baseUrl: string
	readonly #bearerToken: string
	readonly #fetch?: Fetch

	private constructor(baseUrl: string, bearerToken: string, fetch?: Fetch) {
		this.#baseUrl = baseUrl
		this.#bearerToken = bearerToken
		this.#fetch = fetch
	}

	static fromConfig(config: ArtifactStoreConfig, fetch?: Fetch): ArtifactFileService | null {
		if (!config.ARTIFACT_STORE_BASE_URL || !config.ARTIFACT_STORE_BEARER_TOKEN) {
			return null
		}
		return new ArtifactFileService(
			config.ARTIFACT_STORE_BASE_URL,
			config.ARTIFACT_STORE_BEARER_TOKEN,
			fetch
		)
	}

	#client(databaseName: string, scopeId: string, routingGeneration: number): ArtifactStoreClient {
		return new ArtifactStoreClient({
			baseUrl: this.#baseUrl,
			bearerToken: () => this.#bearerToken,
			requestHeaders: () => ({
				'x-aven-artifact-database': databaseName,
				'x-aven-environment': scopeId,
				'x-aven-routing-generation': String(routingGeneration)
			}),
			fetch: this.#fetch
		})
	}

	async artifact(
		databaseName: string,
		scopeId: string,
		artifactId: string,
		routingGeneration = 1
	): Promise<ArtifactJson> {
		return this.#client(databaseName, scopeId, routingGeneration).artifact(scopeId, artifactId)
	}

	async clientRun(
		databaseName: string,
		scopeId: string,
		publicationId: string,
		routingGeneration = 1
	) {
		return this.#client(databaseName, scopeId, routingGeneration).committedClientRun(
			scopeId,
			publicationId
		)
	}

	async queryArtifacts(
		databaseName: string,
		scopeId: string,
		query: { typeKey: string; snapshotSequence?: number; after?: string; limit?: number },
		routingGeneration = 1
	) {
		return this.#client(databaseName, scopeId, routingGeneration).queryArtifacts(scopeId, query)
	}

	async content(
		databaseName: string,
		scopeId: string,
		artifactId: string,
		routingGeneration = 1
	): Promise<Uint8Array> {
		return this.#client(databaseName, scopeId, routingGeneration).content(scopeId, artifactId)
	}

	async evidence(
		databaseName: string,
		scopeId: string,
		artifactId: string,
		routingGeneration = 1
	): Promise<ArtifactEvidence[]> {
		const resource = record(
			await this.#client(databaseName, scopeId, routingGeneration).supportingEvidence(
				scopeId,
				artifactId
			),
			'supporting evidence'
		)
		if (stringField(resource, 'artifactId', 'supporting evidence') !== artifactId) {
			throw new AppError(
				502,
				'ARTIFACT_STORE_INVALID_RESPONSE',
				'Supporting evidence named a different artifact.'
			)
		}
		return artifactEvidence(resource.evidence)
	}

	/**
	 * Debug-oriented scope browser. The store feed is forward-only, so walk it
	 * in large pages and retain a bounded tail of the newest artifacts.
	 */
	async browse(
		databaseName: string,
		scopeId: string,
		routingGeneration = 1
	): Promise<ArtifactBrowseResult> {
		try {
			return await this.#browse(databaseName, scopeId, routingGeneration)
		} catch (error) {
			if (error instanceof AppError) throw error
			if (error instanceof ArtifactStoreProblem) {
				throw new AppError(502, error.code, error.message)
			}
			throw new AppError(502, 'ARTIFACT_STORE_UNAVAILABLE', 'Artifact Store is unavailable.')
		}
	}

	async #browse(
		databaseName: string,
		scopeId: string,
		routingGeneration: number
	): Promise<ArtifactBrowseResult> {
		const client = this.#client(databaseName, scopeId, routingGeneration)
		const context = record(await client.context(), 'context')
		const storeEpoch = stringField(context, 'storeEpoch', 'context')
		const artifacts: BrowsedArtifact[] = []
		let afterSequence = 0
		let publicationsRead = 0
		let truncated = false
		const pageLimit = 1_000
		const maximumPublications = 10_000
		const maximumArtifacts = 2_000

		while (publicationsRead < maximumPublications) {
			const page = record(
				await client.feed(scopeId, storeEpoch, afterSequence, pageLimit),
				'publication feed'
			)
			const items = page.items
			if (!Array.isArray(items)) {
				throw new AppError(
					502,
					'ARTIFACT_STORE_INVALID_RESPONSE',
					'Artifact Store publication feed was invalid.'
				)
			}
			for (const itemValue of items) {
				const item = record(itemValue, 'publication')
				const published = item.artifacts
				if (!Array.isArray(published)) continue
				for (const artifactValue of published) {
					const artifact = record(artifactValue, 'feed artifact')
					artifacts.push({
						artifactId: stringField(artifact, 'artifactId', 'feed artifact'),
						localKey: stringField(artifact, 'localKey', 'feed artifact'),
						publicationOrdinal: numberField(artifact, 'publicationOrdinal', 'feed artifact'),
						typeKey: stringField(artifact, 'typeKey', 'feed artifact'),
						typeVersion: numberField(artifact, 'typeVersion', 'feed artifact'),
						artifactSha256: stringField(artifact, 'artifactSha256', 'feed artifact'),
						producerRunId:
							typeof artifact.producerRunId === 'string' ? artifact.producerRunId : null,
						output: artifact.output ?? null,
						inputs: [],
						publicationId: stringField(item, 'publicationId', 'publication'),
						scopeSequence: numberField(item, 'scopeSequence', 'publication'),
						publicationKind: stringField(item, 'kind', 'publication'),
						runId: typeof item.runId === 'string' ? item.runId : null,
						committedAt: stringField(item, 'committedAt', 'publication')
					})
				}
			}
			if (artifacts.length > maximumArtifacts) {
				artifacts.splice(0, artifacts.length - maximumArtifacts)
			}
			publicationsRead += items.length
			const next = page.nextAfterSequence
			if (typeof next !== 'number' || next <= afterSequence || items.length === 0) break
			afterSequence = next
			if (publicationsRead >= maximumPublications) truncated = true
		}

		const representativeByRun = new Map<string, BrowsedArtifact>()
		for (const artifact of artifacts) {
			if (artifact.producerRunId && !representativeByRun.has(artifact.producerRunId)) {
				representativeByRun.set(artifact.producerRunId, artifact)
			}
		}
		const inputsByRun = new Map<string, ArtifactLineageInput[]>()
		await inChunks([...representativeByRun.entries()], 16, async ([runId, artifact]) => {
			const resource = record(
				await client.producerInputs(scopeId, artifact.artifactId),
				'producer inputs'
			)
			if (
				stringField(resource, 'artifactId', 'producer inputs') !== artifact.artifactId ||
				stringField(resource, 'producerRunId', 'producer inputs') !== runId
			) {
				throw new AppError(
					502,
					'ARTIFACT_STORE_INVALID_RESPONSE',
					'Producer inputs named a different artifact or run.'
				)
			}
			inputsByRun.set(runId, lineageInputs(resource.inputs))
		})
		for (const artifact of artifacts) {
			artifact.inputs = artifact.producerRunId
				? (inputsByRun.get(artifact.producerRunId) ?? [])
				: []
		}

		return { storeEpoch, artifacts: artifacts.reverse(), truncated }
	}

	/**
	 * Narrow publication bridge for the document actors running in the trusted
	 * AvenOS client. The client owns processing; this adapter owns credentials,
	 * scope, actor attribution, output whitelists, blob claims, and canonical
	 * Artifact Store publication.
	 */
	async publishClientRun(input: PublishClientRunInput): Promise<PublishedClientRun> {
		try {
			const descriptor = CLIENT_PROCEDURES[input.procedureKey]
			if (!descriptor) {
				throw new AppError(400, 'CLIENT_PROCEDURE_INVALID', 'The client procedure is not allowed.')
			}
			validateCommonClientContract(input)
			descriptor.validate(input)
			const client = this.#client(input.databaseName, input.scopeId, input.routingGeneration ?? 1)
			if (
				[
					'client.detect-csv-statement',
					'client.confirm-csv-statement',
					'client.admit-csv-statement'
				].includes(input.procedureKey)
			) {
				const sourceId = input.inputs.find((i) => i.role === 'source')!.artifactId
				const sourceEnvelope = record(await client.artifact(input.scopeId, sourceId), 'CSV source')
				const sourcePayload = record(sourceEnvelope.payload ?? null, 'CSV source payload')
				const source = {
					artifactId: sourceId,
					originalName: String(sourcePayload.originalName ?? ''),
					declaredMediaType: String(sourcePayload.declaredMediaType ?? ''),
					base64: Buffer.from(await client.content(input.scopeId, sourceId)).toString('base64')
				}
				if (sourceEnvelope.typeKey !== 'core.file' || !isCsvSource(source))
					invalidClientContract('CSV procedure requires a committed CSV source.')
				const verified = await detectCsvStatement(source)
				if (input.procedureKey === 'client.detect-csv-statement') {
					if (!sameJson(input.artifacts[0]!.payload, verified))
						invalidClientContract('CSV detection differs from the committed source bytes.')
				} else {
					const detectionId = input.inputs.find((i) => i.role === 'detection')!.artifactId
					const detection = record(
						await client.artifact(input.scopeId, detectionId),
						'CSV detection'
					)
					if (
						!verified.eligible ||
						detection.typeKey !== 'banking.csv-statement-detection' ||
						detection.typeVersion !== 1 ||
						!sameJson(detection.payload, verified)
					)
						invalidClientContract('CSV detection is not eligible or differs from this source.')
					const expected = {
						sourceArtifactId: sourceId,
						sourceSha256: verified.sourceSha256,
						detectorVersion: CSV_DETECTOR_VERSION,
						detectionArtifactId: detectionId
					}
					const confirmationId = await csvConfirmationIdentity(sourceId, verified.sourceSha256)
					if (input.procedureKey === 'client.confirm-csv-statement') {
						const decision = record(input.artifacts[0]!.payload, 'CSV decision')
						if (
							input.publicationId !== confirmationId ||
							!['accepted', 'rejected'].includes(String(decision.decision)) ||
							!sameJson(decision, { ...expected, decision: decision.decision })
						)
							invalidClientContract('CSV confirmation differs from the exact detection revision.')
					} else {
						const confirmed = await client.committedClientRun(input.scopeId, confirmationId)
						if (
							confirmed?.procedureKey !== 'client.confirm-csv-statement' ||
							confirmed.procedureVersion !== 'client-v1' ||
							!sameJson(confirmed.artifacts[0]?.payload, { ...expected, decision: 'accepted' }) ||
							confirmed.receipt.artifacts[0]?.artifactId !==
								input.inputs.find((i) => i.role === 'confirmation')!.artifactId ||
							!sameJson(input.artifacts[0]!.payload, verified.statement)
						)
							invalidClientContract('CSV statement requires its exact stored human confirmation.')
					}
				}
			}
			if (
				input.procedureKey === 'client.extract-statement-model' ||
				input.procedureKey === 'client.extract-invoice-model'
			) {
				const sourceId = input.inputs.find((i) => i.role === 'source')!.artifactId
				const source = record(await client.artifact(input.scopeId, sourceId), 'financial source')
				const payload = record(source.payload ?? null, 'financial source payload')
				if (
					isCsvSource({
						originalName: String(payload.originalName ?? ''),
						declaredMediaType: String(payload.declaredMediaType ?? '')
					})
				)
					invalidClientContract('CSV finance extraction must use the human-confirmed CSV lane.')
			}
			if (input.procedureKey === 'client.review-reconciliation') {
				const candidateId = input.inputs.find((item) => item.role === 'match-candidate')!.artifactId
				const candidate = record(
					await client.artifact(input.scopeId, candidateId),
					'match candidate'
				)
				if (candidate.typeKey !== 'reconciliation.match-candidate')
					invalidClientContract('Review input is not a match candidate.')
				const payload = record(candidate.payload ?? null, 'match candidate payload')
				const producer = record(
					await client.producerInputs(input.scopeId, candidateId),
					'match candidate inputs'
				)
				const inputs = lineageInputs(producer.inputs)
				const invoiceId = inputs.find(
					(item) => item.role === 'open-item' && item.ordinal === 0
				)?.artifactId
				const transactionId = inputs.find(
					(item) => item.role === 'transaction' && item.ordinal === payload.transactionInputOrdinal
				)?.artifactId
				if (
					!invoiceId ||
					!transactionId ||
					invoiceId !== input.inputs.find((item) => item.role === 'open-item')!.artifactId ||
					transactionId !== input.inputs.find((item) => item.role === 'transaction')!.artifactId
				)
					invalidClientContract('Review artifacts do not match the ranked evidence.')
				const expectedId = await clientRunIdentity(
					JSON.stringify(['reconciliation-decision-v2', invoiceId, transactionId])
				)
				if (input.publicationId !== expectedId)
					invalidClientContract('Review publication must use its exact pair identity.')
			}
			const context = record(await client.context(), 'context')
			const storeEpoch = stringField(context, 'storeEpoch', 'context')
			const blobAuthorities: Record<string, ArtifactJson> = {}
			const artifacts: ArtifactJson[] = []
			let totalBlobBytes = 0
			for (const output of input.artifacts) {
				let blob: ArtifactJson = null
				if (output.blob) {
					const bytes = Buffer.from(output.blob.base64, 'base64')
					if (bytes.toString('base64') !== output.blob.base64) {
						throw new AppError(
							400,
							'CLIENT_BLOB_INVALID',
							'A client output blob was not canonical base64.'
						)
					}
					totalBlobBytes += bytes.length
					const maximumBlobBytes =
						input.procedureKey === 'client.inspect-file' ? MAX_ARTIFACT_FILE_BYTES : 4 * 1024 * 1024
					if (totalBlobBytes > maximumBlobBytes) {
						throw new AppError(
							413,
							'CLIENT_BLOB_TOO_LARGE',
							'Client run blobs exceed their procedure limit.'
						)
					}
					const sha256 = createHash('sha256').update(bytes).digest('hex')
					const claimId = randomUUID()
					await client.upload(
						input.scopeId,
						claimId,
						{
							sha256,
							length: bytes.length,
							declaredMediaType: output.blob.mediaType
						},
						bytes
					)
					blob = { sha256, length: bytes.length }
					blobAuthorities[output.localKey] = { kind: 'upload-claim', claimId }
				}
				artifacts.push({
					localKey: output.localKey,
					typeKey: output.typeKey,
					typeVersion: output.typeVersion,
					payload: output.payload,
					blob,
					references: [],
					output: output.output
				})
			}

			const publication = record(
				await client.publish(input.scopeId, input.publicationId, storeEpoch, {
					intent: {
						commandVersion: 1,
						publicationId: input.publicationId,
						scopeId: input.scopeId,
						kind: 'run',
						run: {
							procedureKey: input.procedureKey,
							procedureVersion: input.procedureVersion,
							initiator: { kind: 'user', id: `user:${input.userId}` },
							executor: { kind: 'agent', id: descriptor.actor },
							inputs: input.inputs,
							parameters: input.parameters,
							implementation: {
								adapter: 'avenos-client-actor',
								version: 'client-v1',
								deterministic: descriptor.deterministic !== false
							},
							receipt:
								descriptor.deterministic === false
									? {
											outcome: 'succeeded',
											model: clientRecord(input.parameters, 'model parameters').modelReceipt ?? null
										}
									: { outcome: 'succeeded' }
						},
						artifacts,
						evidence: input.evidence as unknown as ArtifactJson
					},
					blobAuthorities
				}),
				'publication'
			)
			const published = publication.artifacts
			if (!Array.isArray(published)) {
				throw new AppError(
					502,
					'ARTIFACT_STORE_INVALID_RESPONSE',
					'Artifact Store returned no client run outputs.'
				)
			}
			return {
				publicationId: stringField(publication, 'publicationId', 'publication'),
				runId: stringField(publication, 'runId', 'publication'),
				replayed: booleanField(publication, 'replayed', 'publication'),
				scopeSequence: numberField(publication, 'scopeSequence', 'publication'),
				artifacts: published.map((value) => ({
					localKey: stringField(value, 'localKey', 'published artifact'),
					artifactId: stringField(value, 'artifactId', 'published artifact')
				}))
			}
		} catch (error) {
			if (error instanceof AppError) throw error
			if (error instanceof ArtifactStoreProblem) {
				const status = error.status === 400 || error.status === 409 ? error.status : 502
				throw new AppError(status, error.code, error.message)
			}
			throw new AppError(502, 'ARTIFACT_STORE_UNAVAILABLE', 'Artifact Store is unavailable.')
		}
	}

	async publishFile(input: PublishFileInput): Promise<PublishedFile> {
		try {
			const client = this.#client(input.databaseName, input.scopeId, input.routingGeneration ?? 1)
			const context = await client.context()
			const storeEpoch = stringField(context, 'storeEpoch', 'context')
			const claimId = randomUUID()
			const upload = await client.uploadBody(
				input.scopeId,
				claimId,
				{
					sha256: input.sha256,
					length: input.length,
					declaredMediaType: input.mediaType
				},
				input.body
			)
			if (
				stringField(upload, 'sha256', 'upload') !== input.sha256 ||
				numberField(upload, 'length', 'upload') !== input.length
			) {
				throw new AppError(
					502,
					'ARTIFACT_STORE_INVALID_RESPONSE',
					'Artifact Store confirmed different upload bytes.'
				)
			}

			const publication = await client.publish(input.scopeId, input.publicationId, storeEpoch, {
				intent: {
					commandVersion: 1,
					publicationId: input.publicationId,
					scopeId: input.scopeId,
					kind: 'roots',
					rootActor: { kind: 'user', id: `user:${input.userId}` },
					artifacts: [
						{
							localKey: 'file',
							typeKey: 'core.file',
							typeVersion: 1,
							payload: {
								originalName: input.originalName,
								declaredMediaType: input.mediaType,
								sourceKind: input.sourceKind,
								...(input.executionEnvironment && {
									executionEnvironment: input.executionEnvironment
								})
							},
							blob: { sha256: input.sha256, length: input.length },
							references: [],
							output: null
						},
						{
							localKey: 'intent',
							typeKey: 'intent.declaration',
							typeVersion: 1,
							payload: {
								intentId: input.intentId,
								title: input.originalName,
								triggerKind: 'file-upload',
								observedAt: input.observedAt
							},
							blob: null,
							references: [],
							output: null
						}
					],
					evidence: []
				},
				blobAuthorities: { file: { kind: 'upload-claim', claimId } }
			})
			const artifacts = record(publication, 'publication').artifacts
			if (!Array.isArray(artifacts) || artifacts.length !== 2) {
				throw new AppError(
					502,
					'ARTIFACT_STORE_INVALID_RESPONSE',
					'Artifact Store did not return the file and intent declaration.'
				)
			}
			const artifact = artifacts[0] as ArtifactJson
			if (stringField(artifact, 'localKey', 'artifact') !== 'file') {
				throw new AppError(
					502,
					'ARTIFACT_STORE_INVALID_RESPONSE',
					'Artifact Store returned an unexpected local key.'
				)
			}
			const intentArtifact = artifacts[1] as ArtifactJson
			if (stringField(intentArtifact, 'localKey', 'intentArtifact') !== 'intent') {
				throw new AppError(
					502,
					'ARTIFACT_STORE_INVALID_RESPONSE',
					'Artifact Store returned an unexpected intent local key.'
				)
			}
			return {
				publicationId: stringField(publication, 'publicationId', 'publication'),
				intentId: input.intentId,
				intentDeclarationArtifactId: stringField(intentArtifact, 'artifactId', 'intentArtifact'),
				artifactId: stringField(artifact, 'artifactId', 'artifact'),
				originalName: input.originalName,
				mediaType: input.mediaType,
				sha256: input.sha256,
				length: input.length,
				scopeSequence: numberField(publication, 'scopeSequence', 'publication'),
				replayed: booleanField(publication, 'replayed', 'publication')
			}
		} catch (error) {
			if (error instanceof AppError) throw error
			if (error instanceof ArtifactStoreProblem) {
				const status = error.status === 409 ? 409 : error.status === 413 ? 413 : 502
				throw new AppError(status, error.code, error.message)
			}
			throw new AppError(502, 'ARTIFACT_STORE_UNAVAILABLE', 'Artifact Store is unavailable.')
		}
	}
}
