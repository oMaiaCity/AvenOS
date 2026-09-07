import type { ExecutionEnvironment } from '@avenos/actors'
import { invoke } from '@tauri-apps/api/core'
import { chatActor } from '$lib/actors/chat.actor.svelte'
import { anonymousSpeakerFromPayload } from '$lib/chat/anonymous-speaker'
import { intents, type PersistentIntentDetail } from '$lib/intents/intents.svelte'
import {
	discoverIntentSources,
	type ProjectionArtifact
} from '$lib/intents/persistent-artifact-projection'
import { shell } from '$lib/intents/talk.svelte'
import {
	clientDocumentProcessingStatus,
	clientDocumentSourceExecutionEnvironment,
	processClientDocument
} from './client-document-processing'
import { type ArtifactProcessingLookup, isTerminalProcessing } from './processing'

/**
 * THE ONE DOOR EVERY FILE COMES THROUGH.
 *
 * A file becomes an intent, and the intent's skill flow is what turns it into
 * artifacts. There is no second way in: dropping a file on the window and
 * downloading an invoice from the billing pane both call `ingestFile()`, so
 * both get the same intent, the same processing watcher, the same lineage.
 *
 * They did not use to. The invoice was written straight into a local folder
 * and listed from a second, parallel "downloads" shelf that knew nothing about
 * intents, skills or provenance — two stores, one of which was a dead end. The
 * shelf is gone; this module is why nothing needs it.
 *
 * Everything here was lifted out of `dashboard/+page.svelte`, where it could
 * only ever be reached by the drop handler. Moving it to a module is what makes
 * "always through the flow" enforceable rather than a convention.
 */

const chat = chatActor.core

/** What `artifact_upload` hands back once the publication is committed. */
export interface UploadedArtifactReceipt {
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

/** One upload at a time — the composer shows a single upload's progress. */
let uploadInFlight = false
const processingWatchers = new Set<string>()

/** Default placement for the next process. Each upload freezes its own value. */
export const documentExecutionPreference = $state<{ environment: ExecutionEnvironment }>({
	environment: 'local'
})

export function ingestBusy(): boolean {
	return uploadInFlight
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function basename(path: string): string {
	return path.split(/[\\/]/).at(-1) || 'Dropped file'
}

function persistentTurns(detail: PersistentIntentDetail) {
	return detail.contributions.flatMap((entry) => {
		if ((entry.contributorKind !== 'human' && entry.contributorKind !== 'agent') || !entry.text)
			return []
		const anonymousSpeaker =
			entry.contributorKind === 'human' ? anonymousSpeakerFromPayload(entry.payload) : null
		return [
			{
				id: entry.id,
				role: entry.contributorKind === 'human' ? ('user' as const) : ('assistant' as const),
				content: entry.text,
				...(anonymousSpeaker ? { anonymousSpeaker } : {})
			}
		]
	})
}

export async function refreshIntent(intentId: string): Promise<PersistentIntentDetail | null> {
	try {
		const detail = await invoke<PersistentIntentDetail>('intent_get', { intentId })
		intents.applyPersistent(detail)
		chat.hydrate(detail.id, persistentTurns(detail))
		// Bring the persisted source file back into the chat's in-memory
		// registry: the processing watcher loops on `hasArtifact`, and the
		// model's artifact manifest reads through the same map. Without this
		// a restart left the file invisible to both.
		const source = detail.artifacts.find((artifact) => artifact.relation === 'source')
		if (source) {
			chat.adoptArtifact(
				source.artifactId,
				detail.title,
				undefined,
				undefined,
				detail.fileSkill?.presentation
					? { ...detail.fileSkill.presentation, availability: 'available' }
					: undefined
			)
		}
		return detail
	} catch {
		// Projection follows the immutable publication asynchronously. The
		// provisional intent stays present while the processing watcher retries.
		return null
	}
}

export async function loadPersistentIntents(): Promise<void> {
	const summaries = await invoke<Array<{ id: string }>>('intent_list')
	const details = await Promise.all(summaries.map((intent) => refreshIntent(intent.id)))
	try {
		const browse = await invoke<{ artifacts: ProjectionArtifact[] }>('artifact_store_list')
		const sources = await discoverIntentSources(browse.artifacts, (artifactId) =>
			invoke<{ payload?: Record<string, unknown> }>('artifact_get', { artifactId })
		)
		for (const detail of details) {
			if (
				!detail ||
				detail.sourceArtifactId ||
				detail.artifacts.some((a) => a.relation === 'source')
			)
				continue
			const source = sources.get(detail.id)
			if (!source) continue
			intents.attachFileSource(detail.id, source.artifactId, detail.title)
			chat.adoptArtifact(source.artifactId, detail.title)
		}
	} catch {
		// Intent conversations remain usable if Artifact Store is temporarily unavailable.
		// The next reload or a fresh processing watch will try the durable projection again.
	}
	for (const detail of details) {
		const source = detail
			? (detail.artifacts.find((artifact) => artifact.relation === 'source') ??
				intents.items
					.find((intent) => intent.id === detail.id)
					?.artifacts.find((artifact) => artifact.typeKey === 'core.file'))
			: undefined
		const executionEnvironment = source?.artifactId
			? await clientDocumentSourceExecutionEnvironment(source.artifactId)
			: null
		if (detail && source?.artifactId && executionEnvironment) {
			// Restoring history is not a new request to reconcile the entire account
			// using each historical document's placement. New imports and the review
			// tool explicitly start reconciliation against the current snapshot.
			void processClientDocument(
				source.artifactId,
				detail.title,
				undefined,
				executionEnvironment,
				false
			)
			void watchArtifactProcessing(source.artifactId, detail.id)
			continue
		}
		if (
			detail?.fileSkill &&
			detail.sourceArtifactId &&
			(!detail.fileSkill.presentation || !isTerminalProcessing(detail.fileSkill.presentation.state))
		) {
			void watchArtifactProcessing(detail.sourceArtifactId, detail.id)
		}
	}
}

export async function watchArtifactProcessing(
	artifactId: string,
	intentId?: string
): Promise<void> {
	if (processingWatchers.has(artifactId)) return
	processingWatchers.add(artifactId)
	let delay = 300
	let consecutiveFailures = 0
	try {
		while (chat.hasArtifact(artifactId)) {
			try {
				const local = clientDocumentProcessingStatus(artifactId)
				const lookup =
					local ??
					(await invoke<ArtifactProcessingLookup>('artifact_processing_status', {
						artifactId
					}))
				consecutiveFailures = 0
				if (lookup.pending || !lookup.presentation) {
					chat.markArtifactProcessingPending(artifactId)
					delay = Math.min(2_000, Math.round(delay * 1.5))
				} else {
					chat.updateArtifactProcessing(artifactId, lookup.presentation)
					const owner =
						intentId ??
						intents.items.find((intent) =>
							intent.artifacts.some((artifact) => artifact.artifactId === artifactId)
						)?.id
					if (owner && !local) await refreshIntent(owner)
					if (isTerminalProcessing(lookup.presentation.state)) return
					delay = 1_500
				}
			} catch (error) {
				consecutiveFailures += 1
				chat.markArtifactProcessingUnavailable(
					artifactId,
					error instanceof Error ? error.message : String(error)
				)
				delay = Math.min(30_000, 1_000 * 2 ** Math.min(consecutiveFailures, 5))
			}
			await wait(delay)
		}
	} finally {
		processingWatchers.delete(artifactId)
	}
}

/**
 * Take a file on disk into the store, as an intent.
 *
 * Brings the conversation forward first — whatever surface you were on, an
 * ingest is a thing you watch happen — then declares the intent, uploads, and
 * leaves a watcher running until the skill flow reaches a terminal state.
 *
 * Returns the receipt so a caller can follow the artifact it just created;
 * failures are reported through the chat and the intent, not thrown, because
 * every caller wants exactly that and none of them want a second error path.
 */
export async function ingestFile(
	path: string,
	executionEnvironment: ExecutionEnvironment = documentExecutionPreference.environment
): Promise<UploadedArtifactReceipt | null> {
	shell.tab = 'intents'
	shell.detail = true

	if (uploadInFlight) {
		chat.failure = 'Wait for the current file upload to finish.'
		return null
	}

	const uploadId = crypto.randomUUID()
	const publicationId = crypto.randomUUID()
	const intentId = crypto.randomUUID()
	const observedAt = new Date().toISOString()
	const name = basename(path)
	intents.beginFileIntent(intentId, name)
	chat.beginArtifactUpload(uploadId, publicationId, name)
	uploadInFlight = true
	try {
		await invoke('intent_create', {
			intent: {
				id: intentId,
				title: name,
				intentType: 'file',
				sourceLabel: 'Upload · File',
				deadline: null,
				routingSummary: `File upload: ${name}`
			}
		})
		const receipt = await invoke<UploadedArtifactReceipt>('artifact_upload', {
			uploadId,
			publicationId,
			intentId,
			observedAt,
			path,
			executionEnvironment
		})
		chat.commitArtifactUpload(uploadId, receipt)
		intents.attachFileSource(receipt.intentId, receipt.artifactId, receipt.originalName)
		await refreshIntent(receipt.intentId)
		void processClientDocument(
			receipt.artifactId,
			receipt.originalName,
			receipt.mediaType,
			executionEnvironment
		)
		void watchArtifactProcessing(receipt.artifactId, receipt.intentId)
		return receipt
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		chat.failArtifactUpload(uploadId, message)
		intents.failFileIntent(intentId, message)
		await wait(1_000)
		void loadPersistentIntents()
		return null
	} finally {
		uploadInFlight = false
	}
}

/** The window's drop handler: one regular file at a time, then the one door. */
export async function ingestDroppedFiles(paths: string[]): Promise<void> {
	shell.tab = 'intents'
	shell.detail = true
	if (paths.length !== 1) {
		chat.failure = 'Drop exactly one regular file at a time.'
		return
	}
	// Capture the choice before upload begins. Changing the selector while this
	// run is active affects only a future upload.
	await ingestFile(paths[0], documentExecutionPreference.environment)
}
