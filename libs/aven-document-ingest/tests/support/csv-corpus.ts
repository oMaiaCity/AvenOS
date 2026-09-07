import { readFile } from 'node:fs/promises'
import type {
	ClientArtifactGateway,
	ClientRunPublication,
	CommittedClientRun
} from '@avenos/artifact-store'

export async function csvSource(
	id = 'nl-rabobank-official-layout',
	artifactId = '11111111-1111-4111-8111-111111111111'
) {
	const bytes = await readFile(
		new URL(`../../../../fixtures/golden/bank-csv/${id}.csv`, import.meta.url)
	)
	return {
		artifactId,
		originalName: `${id}.csv`,
		declaredMediaType: 'text/csv',
		base64: bytes.toString('base64')
	}
}

/** An immutable in-memory publication simulator, not database E2E evidence. */
export class CsvMemoryGateway implements ClientArtifactGateway {
	runs: ClientRunPublication[] = []
	committed = new Map<string, CommittedClientRun>()
	ordinal = 0
	failPublication = false
	uuid() {
		return `00000000-0000-4000-8000-${String(++this.ordinal).padStart(12, '0')}`
	}
	async publish(run: ClientRunPublication) {
		if (this.failPublication) throw new Error('simulated publication failure')
		const prior = this.committed.get(run.publicationId)
		if (prior) return { ...prior.receipt, replayed: true }
		this.runs.push(structuredClone(run))
		const receipt = {
			publicationId: run.publicationId,
			runId: this.uuid(),
			replayed: false,
			artifacts: run.artifacts.map((a) => ({ localKey: a.localKey, artifactId: this.uuid() }))
		}
		this.committed.set(run.publicationId, {
			receipt,
			...structuredClone({
				artifacts: run.artifacts,
				procedureKey: run.procedureKey,
				procedureVersion: run.procedureVersion,
				parameters: run.parameters
			})
		})
		return receipt
	}
	async lookup(id: string) {
		return structuredClone(this.committed.get(id) ?? null)
	}
}
