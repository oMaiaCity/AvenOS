export interface ApiError {
	code: string
	message: string
	details?: unknown
}

export type ProofOfWorkPurpose = 'secure-name'
export interface ProofOfWorkChallenge {
	id: string
	nonce: string
	purpose: ProofOfWorkPurpose
	difficultyBits: number
	expiresAt: number
}

export type BackendAvailability = 'available' | 'degraded' | 'unavailable'
export interface HealthStatus {
	overall: 'healthy' | 'degraded'
	capabilities: {
		authentication: boolean
		emailQueueing: boolean
		emailDelivery: 'available' | 'delayed'
		environmentProvisioning: 'available' | 'delayed'
	}
}

export type AccountRole = 'user' | 'admin'

export interface SessionUser {
	id: string
	name: string
	email: string
	emailVerified: boolean
	role: AccountRole
}

export interface MetaInfo {
	priceEur: number
	downloadUrl: string
}

export type NameUnavailableReason =
	| 'NAME_INVALID'
	| 'NAME_RESERVED'
	| 'NAME_TAKEN'
	| 'NAME_LOCKED'
	| 'NAME_HELD'
export interface NameAvailability {
	name: string
	available: boolean
	reason?: NameUnavailableReason
	priceEur: number
	reservationMinutes: number
}
// The checkout URL is deliberately absent: it is reachable only through the
// unique claim link emailed to the buyer, which confirms the address.
// expiresAt is the claim link's validity — the name itself is reserved only
// once that link is clicked, for reservationMinutes.
/**
 * What the funnel knows about a hold beyond name and email: which tier's CTA
 * sent them, how to address them, and what they want to build. All optional —
 * a hold is still valid without any of it.
 */
export interface HoldOrigin {
	tier?: string
	salutation?: string
	idea?: string
}

/**
 * A holder's place in the invite queue.
 *
 * Deliberately has no estimated date: invitations do not go out on a cadence,
 * so "you are up in ~3 weeks" would be invented. Position, who is ahead, and
 * when the last invites actually went out are all things we can know.
 */
export interface QueueEntry {
	position: number
	/** The reserved name. Public by design — it becomes `name.aven.ceo`. */
	name: string
	reservedAt: string
	/** Already invited and on board. */
	invited: boolean
	/** The holder looking at the page. */
	you?: boolean
}

export interface QueueStanding {
	name: string
	reservedAt: string
	position: number
	ahead: number
	total: number
	/** How many ahead of you have already been invited. */
	invited: number
	/** When the most recent invite went out, if any ever has. */
	lastInvitedAt: string | null
	/** The stretch of the list around you, with your own row flagged. */
	board: QueueEntry[]
	/** The newest names on the list — who just joined behind you. */
	latest: QueueEntry[]
}

export interface NameHoldResult {
	name: string
	expiresAt: string
	priceEur: number
	reservationMinutes: number
}
