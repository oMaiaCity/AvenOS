import { type ArtifactJson, canonicalArtifactJson, parseArtifactJson } from './canonical'
import type { ClientArtifactDraft, CommittedClientRun } from './client-runs'

export type ArtifactStoreFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface ArtifactStoreClientOptions {
	readonly baseUrl: string
	readonly bearerToken: () => string | Promise<string>
	readonly requestHeaders?: () => HeadersInit | Promise<HeadersInit>
	readonly fetch?: ArtifactStoreFetch
}

export interface UploadDeclaration {
	readonly sha256: string
	readonly length: number
	readonly declaredMediaType: string
}

export interface PublicationSubmission {
	readonly intent: ArtifactJson
	readonly blobAuthorities: ArtifactJson
}

export class ArtifactStoreProblem extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message)
	}
}

export class ArtifactStoreClient {
	readonly #baseUrl: string
	readonly #bearerToken: ArtifactStoreClientOptions['bearerToken']
	readonly #requestHeaders?: ArtifactStoreClientOptions['requestHeaders']
	readonly #fetch: ArtifactStoreFetch

	constructor(options: ArtifactStoreClientOptions) {
		this.#baseUrl = options.baseUrl.replace(/\/$/, '')
		this.#bearerToken = options.bearerToken
		this.#requestHeaders = options.requestHeaders
		this.#fetch = options.fetch ?? globalThis.fetch
	}

	context(): Promise<ArtifactJson> {
		return this.#json('/v1/context')
	}

	type(typeKey: string, version: number): Promise<ArtifactJson> {
		return this.#json(`/v1/types/${encodeURIComponent(typeKey)}/versions/${version}`)
	}

	async upload(
		scopeId: string,
		claimId: string,
		declaration: UploadDeclaration,
		bytes: Uint8Array
	): Promise<ArtifactJson> {
		return this.uploadBody(scopeId, claimId, declaration, Uint8Array.from(bytes).buffer)
	}

	/**
	 * Stream a declared blob without forcing an application proxy to buffer a
	 * second complete copy. The store remains authoritative for hash and length
	 * verification.
	 */
	async uploadBody(
		scopeId: string,
		claimId: string,
		declaration: UploadDeclaration,
		body: BodyInit
	): Promise<ArtifactJson> {
		return this.#json(`/v1/scopes/${scopeId}/uploads/${claimId}`, {
			method: 'PUT',
			headers: {
				'content-type': declaration.declaredMediaType,
				'content-length': String(declaration.length),
				'x-expected-sha256': declaration.sha256
			},
			body
		})
	}

	publish(
		scopeId: string,
		publicationId: string,
		storeEpoch: string,
		submission: PublicationSubmission
	): Promise<ArtifactJson> {
		return this.#json(`/v1/scopes/${scopeId}/publications/${publicationId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				'if-artifact-store-epoch': storeEpoch
			},
			body: Uint8Array.from(canonicalArtifactJson(submission as unknown as ArtifactJson)).buffer
		})
	}

	artifact(scopeId: string, artifactId: string): Promise<ArtifactJson> {
		return this.#json(`/v1/scopes/${scopeId}/artifacts/${artifactId}`)
	}

	async publication(scopeId: string, publicationId: string): Promise<ArtifactJson> {
		try {
			return await this.#json(`/v1/scopes/${scopeId}/publications/${publicationId}`)
		} catch (error) {
			if (
				error instanceof ArtifactStoreProblem &&
				error.status === 404 &&
				error.code === 'RESOURCE_UNAVAILABLE'
			)
				return null
			throw error
		}
	}

	queryArtifacts(
		scopeId: string,
		query: { typeKey: string; snapshotSequence?: number; after?: string; limit?: number }
	): Promise<ArtifactJson> {
		const parameters = new URLSearchParams({ typeKey: query.typeKey })
		if (query.snapshotSequence !== undefined)
			parameters.set('snapshotSequence', String(query.snapshotSequence))
		if (query.after) parameters.set('after', query.after)
		if (query.limit !== undefined) parameters.set('limit', String(query.limit))
		return this.#json(`/v1/scopes/${scopeId}/artifacts?${parameters}`)
	}

	/** Materialize immutable outputs through the same scoped API on either execution host. */
	async committedClientRun(
		scopeId: string,
		publicationId: string
	): Promise<CommittedClientRun | null> {
		const publication = await this.publication(scopeId, publicationId)
		if (publication === null) return null
		const details = artifactObject(publication)
		const item = artifactObject(details.publication ?? null)
		const run = artifactObject(details.run ?? null)
		if (typeof run.procedureKey !== 'string' || typeof run.procedureVersion !== 'string')
			throw new Error('missing committed procedure identity')
		if (
			item.publicationId !== publicationId ||
			item.scopeId !== scopeId ||
			typeof item.runId !== 'string' ||
			!Array.isArray(item.artifacts)
		)
			throw new Error('invalid committed production receipt')
		const artifacts: ClientArtifactDraft[] = []
		const outputs: CommittedClientRun['receipt']['artifacts'] = []
		const seenIds = new Set<string>()
		const seenKeys = new Set<string>()
		for (const entry of item.artifacts) {
			const reference = artifactObject(entry)
			if (typeof reference.artifactId !== 'string' || typeof reference.localKey !== 'string')
				throw new Error('invalid committed output reference')
			if (seenIds.has(reference.artifactId) || seenKeys.has(reference.localKey))
				throw new Error('duplicate committed output reference')
			seenIds.add(reference.artifactId)
			seenKeys.add(reference.localKey)
			const envelope = artifactObject(await this.artifact(scopeId, reference.artifactId))
			const output = artifactObject(reference.output ?? null)
			const envelopeOutput = artifactObject(envelope.output ?? null)
			if (
				envelope.artifactId !== reference.artifactId ||
				envelope.scopeId !== scopeId ||
				envelope.publicationId !== publicationId ||
				envelope.producerRunId !== item.runId ||
				typeof envelope.typeKey !== 'string' ||
				typeof envelope.typeVersion !== 'number' ||
				!Number.isInteger(envelope.typeVersion) ||
				envelope.typeVersion < 1 ||
				typeof output.role !== 'string' ||
				typeof output.ordinal !== 'number' ||
				!Number.isInteger(output.ordinal) ||
				output.ordinal < 0 ||
				envelopeOutput.role !== output.role ||
				envelopeOutput.ordinal !== output.ordinal
			)
				throw new Error('invalid committed output contract')
			const draft: ClientArtifactDraft = {
				localKey: reference.localKey,
				typeKey: envelope.typeKey,
				typeVersion: envelope.typeVersion,
				payload: artifactObject(envelope.payload ?? null),
				output: { role: output.role, ordinal: output.ordinal }
			}
			if (envelope.blob) {
				const blob = artifactObject(envelope.blob)
				const bytes = await this.content(scopeId, reference.artifactId)
				const hash = [
					...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
				]
					.map((byte) => byte.toString(16).padStart(2, '0'))
					.join('')
				if (blob.length !== bytes.length || blob.sha256 !== hash)
					throw new Error('committed output blob does not match its envelope')
				let binary = ''
				for (let offset = 0; offset < bytes.length; offset += 8192)
					binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
				draft.blob = { mediaType: 'application/octet-stream', base64: btoa(binary) }
			}
			artifacts.push(draft)
			outputs.push({ localKey: reference.localKey, artifactId: reference.artifactId })
		}
		return {
			receipt: { publicationId, runId: item.runId, replayed: true, artifacts: outputs },
			artifacts,
			procedureKey: run.procedureKey,
			procedureVersion: run.procedureVersion,
			parameters: artifactObject(run.parameters ?? null)
		}
	}

	producerInputs(scopeId: string, artifactId: string): Promise<ArtifactJson> {
		return this.#json(`/v1/scopes/${scopeId}/artifacts/${artifactId}/producer-inputs`)
	}

	supportingEvidence(scopeId: string, artifactId: string): Promise<ArtifactJson> {
		return this.#json(`/v1/scopes/${scopeId}/artifacts/${artifactId}/supporting-evidence`)
	}

	async content(scopeId: string, artifactId: string): Promise<Uint8Array> {
		const response = await this.#request(`/v1/scopes/${scopeId}/artifacts/${artifactId}/content`)
		return new Uint8Array(await response.arrayBuffer())
	}

	feed(scopeId: string, storeEpoch: string, afterSequence = 0, limit = 100): Promise<ArtifactJson> {
		const query = new URLSearchParams({
			storeEpoch,
			afterSequence: String(afterSequence),
			limit: String(limit)
		})
		return this.#json(`/v1/scopes/${scopeId}/publications?${query}`)
	}

	async #json(path: string, init?: RequestInit): Promise<ArtifactJson> {
		const response = await this.#request(path, init)
		return parseArtifactJson(new Uint8Array(await response.arrayBuffer()), true)
	}

	async #request(path: string, init: RequestInit = {}): Promise<Response> {
		const token = await this.#bearerToken()
		const headers = new Headers(await this.#requestHeaders?.())
		for (const [name, value] of new Headers(init.headers)) headers.set(name, value)
		headers.set('authorization', `Bearer ${token}`)
		const requestInit: RequestInit & { duplex?: 'half' } = { ...init, headers }
		if (init.body instanceof ReadableStream) requestInit.duplex = 'half'
		const response = await this.#fetch(`${this.#baseUrl}${path}`, requestInit)
		if (response.ok) return response
		let code = 'UNKNOWN'
		let detail = `Artifact Store request failed with HTTP ${response.status}`
		try {
			const problem = (await response.json()) as { code?: string; detail?: string }
			code = problem.code ?? code
			detail = problem.detail ?? detail
		} catch {
			// The status and generic detail remain safe when a proxy returned non-JSON.
		}
		throw new ArtifactStoreProblem(response.status, code, detail)
	}
}

function artifactObject(value: ArtifactJson): Record<string, ArtifactJson> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('invalid Artifact Store object')
	return value as Record<string, ArtifactJson>
}
