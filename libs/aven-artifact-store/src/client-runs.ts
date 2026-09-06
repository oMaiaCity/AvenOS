/** One immutable artifact draft emitted by a client-side actor procedure. */
export interface ClientArtifactDraft {
	localKey: string
	typeKey: string
	typeVersion: number
	payload: Record<string, unknown>
	output: { role: string; ordinal: number }
	blob?: { mediaType: string; base64: string }
}

export type ArtifactLocator =
	| { kind: 'artifact-root' }
	| { kind: 'json-pointer'; pointer: string }
	| { kind: 'byte-range'; start: number; endExclusive: number }
	| { kind: 'page-region'; page: number; x: number; y: number; width: number; height: number }

export interface ClientEvidence {
	ordinal: number
	outputLocalKey: string
	outputLocator: ArtifactLocator
	inputRole: string
	inputOrdinal: number
	inputLocator: ArtifactLocator
}

export interface ClientRunInput {
	role: string
	ordinal: number
	artifactId: string
}

export interface ClientRunPublication {
	publicationId: string
	procedureKey: string
	procedureVersion: 'client-v1' | 'server-v1'
	inputs: ClientRunInput[]
	parameters: Record<string, unknown>
	artifacts: ClientArtifactDraft[]
	evidence: ClientEvidence[]
}

export interface PublishedClientArtifact {
	localKey: string
	artifactId: string
}

export interface PublishedClientRun {
	publicationId: string
	runId: string
	replayed: boolean
	artifacts: PublishedClientArtifact[]
}

export interface ClientArtifactGateway {
	publish(run: ClientRunPublication): Promise<PublishedClientRun>
	/** Read committed outputs before invoking an Actor after restart. */
	lookup?(publicationId: string): Promise<CommittedClientRun | null>
}

/** Portable UUIDv8 identity for a publication's canonical application key. */
export async function clientRunIdentity(seed: string): Promise<string> {
	const bytes = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
	).slice(0, 16)
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface CommittedClientRun {
	receipt: PublishedClientRun
	artifacts: ClientArtifactDraft[]
	procedureKey: string
	procedureVersion: string
	parameters: Record<string, unknown>
}

export interface ClientPublicationRetryPolicy {
	delaysMs: readonly number[]
	shouldRetry(error: unknown): boolean
}

const wait = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds))

/**
 * Serializes publications through one client and optionally retries transient
 * transport failures. Artifact publication remains idempotent because every
 * run carries its stable publicationId.
 */
export class QueuedClientArtifactGateway implements ClientArtifactGateway {
	#tail: Promise<void> = Promise.resolve()

	constructor(
		private readonly delegate: ClientArtifactGateway,
		private readonly retry?: ClientPublicationRetryPolicy
	) {}

	publish(run: ClientRunPublication): Promise<PublishedClientRun> {
		const publication = this.#tail.then(() => this.publishWithRetry(run))
		this.#tail = publication.then(
			() => undefined,
			() => undefined
		)
		return publication
	}

	lookup(publicationId: string): Promise<CommittedClientRun | null> {
		return this.delegate.lookup?.(publicationId) ?? Promise.resolve(null)
	}

	private async publishWithRetry(run: ClientRunPublication): Promise<PublishedClientRun> {
		for (let attempt = 0; ; attempt += 1) {
			try {
				return await this.delegate.publish(run)
			} catch (error) {
				const delay = this.retry?.delaysMs[attempt]
				if (delay === undefined || !this.retry?.shouldRetry(error)) throw error
				await wait(delay)
			}
		}
	}
}
