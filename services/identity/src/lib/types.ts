export interface PasskeySummary {
	id: string
	name: string | null
	device_type: string
	backed_up: boolean
	prf_enabled: boolean
	created_at: string
}

export interface ProofChallenge {
	id: string
	nonce: string
	purpose: 'sign-in'
	difficultyBits: number
	expiresAt: number
}
