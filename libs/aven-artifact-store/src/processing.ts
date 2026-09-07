export type ArtifactProcessingAvailability = 'discovering' | 'available' | 'unavailable'

export type ArtifactProcessingState = 'active' | 'succeeded' | 'needs_review' | 'failed'

export interface ArtifactProcessingWarning {
	code: string
	message: string
	retryable: boolean
}

export interface ArtifactProcessingStage {
	key: string
	state: string
	dependsOn?: string[]
	procedureKey?: string
	attemptCount?: number
	lastError?: string
	terminalCode?: string | null
}

export interface DerivedArtifact {
	artifactId: string
	typeKey: string
	typeVersion: number
	stageKey: string
}

export interface ArtifactProcessingPresentation {
	caseId: string
	state: ArtifactProcessingState
	projectionVersion: string
	preferredType: string
	label: string
	summary: string | null
	metadata: Record<string, unknown>
	warnings: ArtifactProcessingWarning[]
	stages: ArtifactProcessingStage[]
	derivedArtifacts: DerivedArtifact[]
}

export interface ArtifactProcessingLookup {
	pending: boolean
	presentation: ArtifactProcessingPresentation | null
}

export interface ArtifactProcessingView extends ArtifactProcessingPresentation {
	availability: ArtifactProcessingAvailability
	lookupError?: string
}
