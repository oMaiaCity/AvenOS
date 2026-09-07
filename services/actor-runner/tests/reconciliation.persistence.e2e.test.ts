import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PlanRunSecurityContext } from '@avenos/actors'
import { ArtifactStoreClient, type ClientRunPublication } from '@avenos/artifact-store'
import { createDocumentActors } from '@avenos/document-ingest/actors'
import { documentPlanRunCommand, documentRunStartRequest } from '@avenos/document-ingest/execution'
import {
	decideReconciliation,
	type ReconciliationArtifact,
	type ReconciliationArtifactPage,
	type ReconciliationGateway,
	type ReconciliationResult,
	reconcileInvoices,
	reconciliationRunCommand
} from '@avenos/document-ingest/reconciliation-flow'
import { DocumentProcessingRuntime } from '@avenos/document-ingest/runtime'
import {
	createDocumentSkillExecutor,
	createReconciliationSkillExecutor
} from '@avenos/document-ingest/server'
import { describe, expect, test } from 'vitest'
import { BrowserDocumentDecoder } from '../../../app/src/lib/artifacts/browser-document-decoder.js'
import { ArtifactFileService } from '../../aven-api/src/lib/server/artifacts/service.js'
import { MemoryPlanRunner } from '../src/memory-runner.js'
import { GoldenInvoiceModel } from './support/golden-document-model.js'

const baseUrl = process.env.TEST_ARTIFACT_STORE_BASE_URL
const bearerToken = process.env.TEST_ARTIFACT_STORE_BEARER_TOKEN
const scopeId = process.env.TEST_ARTIFACT_STORE_SCOPE_ID
const configured = Boolean(baseUrl && bearerToken && scopeId)

;(configured ? describe : describe.skip)('real-store solver reconciliation', () => {
	test('imports invoice and statement in both hosts, ranks exact evidence, records review and restarts without model calls', async () => {
		if (!baseUrl || !bearerToken || !scopeId)
			throw new Error('real Artifact Store configuration required')
		const client = new ArtifactStoreClient({ baseUrl, bearerToken: () => bearerToken })
		const service = ArtifactFileService.fromConfig({
			ARTIFACT_STORE_BASE_URL: baseUrl,
			ARTIFACT_STORE_BEARER_TOKEN: bearerToken
		})!
		const userId = randomUUID()
		const security: PlanRunSecurityContext = {
			principal: {
				subjectId: userId,
				kind: 'user',
				assurance: ['passkey'],
				sessionId: randomUUID()
			},
			access: { tenantId: scopeId },
			establishedBy: 'real-store-conformance',
			authorizedAt: new Date().toISOString()
		}
		const gateway: ReconciliationGateway = {
			publish: (run: ClientRunPublication) => {
				if (run.procedureVersion !== 'client-v1')
					throw new Error('local publication version required')
				return service.publishClientRun(
					JSON.parse(
						JSON.stringify({
							...run,
							procedureVersion: 'client-v1',
							userId,
							scopeId,
							databaseName: 'aven_artifact_conformance'
						})
					) as Parameters<ArtifactFileService['publishClientRun']>[0]
				)
			},
			lookup: (id) => client.committedClientRun(scopeId, id),
			artifact: async (id) =>
				(await client.artifact(scopeId, id)) as unknown as ReconciliationArtifact,
			// Deliberately force pagination even for this small fixture.
			query: async (query) =>
				(await client.queryArtifacts(scopeId, {
					...query,
					limit: 1
				})) as unknown as ReconciliationArtifactPage
		}
		const bytes = new Uint8Array(
			await readFile(
				new URL(
					'../../../fixtures/artifacts/0001_DE_agri_coop_de-2025-00001-k.jpg',
					import.meta.url
				)
			)
		)
		const storeEpoch = ((await client.context()) as { storeEpoch: string }).storeEpoch
		const publishSource = async (name: string) => {
			const publicationId = randomUUID()
			const claimId = randomUUID()
			const sha256 = createHash('sha256').update(bytes).digest('hex')
			await client.upload(
				scopeId,
				claimId,
				{ sha256, length: bytes.length, declaredMediaType: 'image/jpeg' },
				bytes
			)
			const receipt = (await client.publish(scopeId, publicationId, storeEpoch, {
				intent: {
					commandVersion: 1,
					publicationId,
					scopeId,
					kind: 'roots',
					rootActor: { kind: 'user', id: `user:${userId}` },
					artifacts: [
						{
							localKey: 'source',
							typeKey: 'core.file',
							typeVersion: 1,
							payload: {
								originalName: name,
								declaredMediaType: 'image/jpeg',
								sourceKind: 'client-actor-ingest',
								executionEnvironment: 'local'
							},
							blob: { sha256, length: bytes.length },
							references: [],
							output: null
						}
					],
					evidence: []
				},
				blobAuthorities: { source: { kind: 'upload-claim', claimId } }
			})) as { artifacts: { artifactId: string }[] }
			return {
				artifactId: receipt.artifacts[0]!.artifactId,
				originalName: name,
				declaredMediaType: 'image/jpeg',
				base64: Buffer.from(bytes).toString('base64')
			}
		}
		const route = { client, scopeId, userId }
		const payloads: Record<string, unknown> = {}
		let localInvoiceId = ''
		const transactionIds: string[] = []
		for (const kind of ['invoice', 'bank-statement'] as const) {
			const source = await publishSource(`${kind}-${randomUUID()}.jpg`)
			const localModel = new GoldenInvoiceModel(kind)
			const runtime = () =>
				new DocumentProcessingRuntime(
					createDocumentActors(new BrowserDocumentDecoder(), localModel),
					gateway,
					() => localModel.status()
				)
			const local = await runtime().start(source)
			expect(local.state, local.summary ?? undefined).toBe('succeeded')
			expect(local.metadata.planner).toBe('general-observation-solver')
			const count = localModel.requests.length
			const recovered = await runtime().start(source)
			expect(recovered.derivedArtifacts).toEqual(local.derivedArtifacts)
			expect(recovered.stages.every((stage) => stage.attemptCount === 0)).toBe(true)
			expect(localModel.requests).toHaveLength(count)
			const typeKey = kind === 'invoice' ? 'bookkeeping.open-item' : 'banking.transaction'
			const localOutput = local.derivedArtifacts.find((artifact) => artifact.typeKey === typeKey)!
			if (kind === 'invoice') localInvoiceId = localOutput.artifactId
			else transactionIds.push(localOutput.artifactId)
			payloads[typeKey] = (await gateway.artifact(localOutput.artifactId)).payload
			const remoteModel = new GoldenInvoiceModel(kind)
			const runner = new MemoryPlanRunner(
				createDocumentSkillExecutor({ model: remoteModel, artifactsFor: () => route })
			)
			const handle = await runner.start({
				...documentPlanRunCommand(documentRunStartRequest(source, 'server')),
				security
			})
			const remote = await terminal(runner, handle.runId)
			expect(remote.state, remote.failure?.message).toBe('succeeded')
			const remoteOutput = remote.checkpoints.at(-1)?.output?.presentation as typeof local
			const remoteArtifact = remoteOutput.derivedArtifacts.find(
				(artifact) => artifact.typeKey === typeKey
			)!
			expect((await gateway.artifact(remoteArtifact.artifactId)).payload).toEqual(payloads[typeKey])
			if (kind === 'bank-statement') transactionIds.push(remoteArtifact.artifactId)
			expect(remoteModel.requests).toEqual(localModel.requests)
		}
		const local = await reconcileInvoices(gateway, { openItemArtifactId: localInvoiceId })
		expect(local.reviews).toHaveLength(1)
		const review = local.reviews[0]!
		expect(review.candidate.amountDistanceMinor).toBe(0)
		expect(review.candidate.blockers).toContain('statement-coverage-unverified')
		const rankInputs = (await client.producerInputs(scopeId, review.candidateArtifactId)) as {
			inputs: { role: string; ordinal: number; artifactId: string }[]
		}
		expect(rankInputs.inputs).toContainEqual({
			role: 'transaction',
			ordinal: review.candidate.transactionInputOrdinal,
			artifactId: review.transactionArtifactId
		})
		const runner = new MemoryPlanRunner(
			createReconciliationSkillExecutor({ artifactsFor: () => route })
		)
		const remoteHandle = await runner.start({
			...reconciliationRunCommand(localInvoiceId),
			security
		})
		const remote = await terminal(runner, remoteHandle.runId)
		expect(remote.state, remote.failure?.message).toBe('succeeded')
		const remoteResult = remote.checkpoints.at(-1)?.output?.result as ReconciliationResult
		expect(remoteResult.reviews.map((item) => item.candidate)).toEqual(
			local.reviews.map((item) => item.candidate)
		)
		// Even an existing, semantically identical row is not this candidate's exact
		// evidence occurrence. This must reach and be rejected by the facade check.
		const wrongTransaction = transactionIds.find((id) => id !== review.transactionArtifactId)!
		await expect(
			decideReconciliation(
				gateway,
				{ ...review, transactionArtifactId: wrongTransaction },
				'accepted'
			)
		).rejects.toThrow('Review artifacts do not match the ranked evidence.')
		const decisionId = await decideReconciliation(gateway, review, 'accepted')
		expect(await decideReconciliation(gateway, review, 'accepted')).toBe(decisionId)
		expect((await gateway.artifact(decisionId)).payload).toMatchObject({
			decision: 'accepted',
			openItemArtifactId: localInvoiceId,
			transactionArtifactId: review.transactionArtifactId
		})
		expect(
			(await reconcileInvoices(gateway, { openItemArtifactId: localInvoiceId })).reviews
		).toEqual([])
		await expect(
			client.queryArtifacts(randomUUID(), { typeKey: 'bookkeeping.open-item' })
		).rejects.toThrow()
	}, 90_000)
})

async function terminal(runner: MemoryPlanRunner, runId: string) {
	const deadline = Date.now() + 60_000
	while (Date.now() < deadline) {
		const record = await runner.status(runId)
		if (record && ['succeeded', 'failed', 'cancelled'].includes(record.state)) return record
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error('real-store run did not finish')
}
