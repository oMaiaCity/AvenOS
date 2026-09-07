// Name-registry module: availability, purchase requests and short
// reservations, and webhook-driven grant/revoke. Depends on the
// PaymentProvider and Notifier boundaries only.
//
// Policy: requesting a name does NOT reserve it — several people may request
// the same name and each gets a claim email. The name is reserved (for
// NAME_RESERVATION_TTL_MINUTES, default 5) only when a claim link is clicked,
// i.e. once the email is confirmed. ONE name per account for now — additional
// names will be sold through the app; the web flow refuses a second purchase
// before payment is reachable. Refunds revoke AND lock the name.
import { randomUUID } from 'node:crypto'
import type { ProvisionedAccount } from '@avenos/aven-identity'
import type pg from 'pg'
import type { HoldOrigin, NameAvailability, NameHoldResult } from '$lib/types.js'
import { normalizeName, validateName } from '$lib/validation.js'
import { writeAudit } from '../audit.js'
import type { PaymentEvent, PaymentProvider } from '../billing/provider.js'
import type { NameServiceConfig } from '../config.js'
import { isBearerToken, randomToken, sha256Hex } from '../crypto.js'
import { type Queryable, withTransaction } from '../db.js'
import { AppError } from '../errors.js'
import type { Notifier } from '../notifications.js'

export type AccountProvisioner = (email: string, source: string) => Promise<ProvisionedAccount>

// Injected from the approval-queue module: follow-up work triggered by a
// completed purchase (e.g. provisioning the customer database), enqueued in
// the same transaction as the grant.
export type GrantFollowUp = (
	client: pg.PoolClient,
	input: { userId: string; name: string }
) => Promise<void>
// Same shape for the other direction: a refund or dispute hands the name back
// and must take the tenant's access with it.
export type RevokeFollowUp = GrantFollowUp

interface HoldRow {
	id: string
	name: string
	email: string
	success_token_hash: string
	checkout_id: string | null
	checkout_url: string | null
	email_confirmed_at: Date | null
	reserved_until: Date | null
	expires_at: Date
}

export class NameService {
	constructor(
		private pool: pg.Pool,
		private config: NameServiceConfig,
		private notifier: Notifier,
		private payments: PaymentProvider,
		private provisionAccount: AccountProvisioner,
		private onGranted?: GrantFollowUp,
		private onRevoked?: RevokeFollowUp
	) {}

	private baseAvailability(name: string): NameAvailability {
		return {
			name,
			available: true,
			priceEur: this.config.NAME_PRICE_EUR,
			reservationMinutes: this.config.NAME_RESERVATION_TTL_MINUTES
		}
	}

	async availability(raw: string): Promise<NameAvailability> {
		const name = normalizeName(raw)
		const result = this.baseAvailability(name)
		const invalid = validateName(name)
		if (invalid) return { ...result, available: false, reason: invalid }
		await this.pool.query('DELETE FROM name_holds WHERE name=$1 AND expires_at < now()', [name])
		const owned = (await this.pool.query('SELECT status FROM names WHERE name=$1', [name]))
			.rows[0] as { status: string } | undefined
		if (owned)
			return {
				...result,
				available: false,
				reason: owned.status === 'owned' ? 'NAME_TAKEN' : 'NAME_LOCKED'
			}
		// Only an ACTIVE reservation blocks; unconfirmed requests never do.
		const reserved = (
			await this.pool.query('SELECT 1 FROM name_holds WHERE name=$1 AND reserved_until >= now()', [
				name
			])
		).rows[0]
		if (reserved) return { ...result, available: false, reason: 'NAME_HELD' }
		return result
	}

	private claimUrl(token: string): string {
		const url = new URL('/purchase/checkout', this.config.PUBLIC_BASE_URL)
		url.searchParams.set('token', token)
		return url.toString()
	}

	// The success URL carries a one-time purchase token so the buyer lands
	// signed-in on the dashboard right after paying — no inbox round-trip.
	private mintSuccessUrl(name: string): { token: string; hash: string; url: string } {
		const token = randomToken(32)
		const url = new URL('/purchase/success', this.config.PUBLIC_BASE_URL)
		url.searchParams.set('name', name)
		url.searchParams.set('pt', token)
		return { token, hash: sha256Hex(token), url: url.toString() }
	}

	// Serializes reservation decisions per name (rows are per-request, so row
	// locks alone cannot arbitrate competing claims).
	private async lockName(client: pg.PoolClient, name: string): Promise<void> {
		await client.query("SELECT pg_advisory_xact_lock(hashtext('name:' || $1))", [name])
	}

	// One name per account (for now): true when the email already owns one.
	private async emailOwnsName(connection: Queryable, email: string): Promise<boolean> {
		const customer = (
			await connection.query<{ subject_id: string }>(
				'SELECT subject_id FROM checkout_customers WHERE lower(email)=lower($1)',
				[email]
			)
		).rows[0]
		if (!customer) return false
		return Boolean(
			(
				await connection.query(
					"SELECT 1 FROM names WHERE owner_user_id=$1 AND status='owned' LIMIT 1",
					[customer.subject_id]
				)
			).rows[0]
		)
	}

	// Registers a purchase request and emails the unique claim link. Nothing is
	// reserved yet — the click is both the email confirmation and the start of
	// the short reservation window. Re-requesting rotates the token (the latest
	// email wins).
	async secure(raw: string, email: string, origin: HoldOrigin = {}): Promise<NameHoldResult> {
		const name = normalizeName(raw)
		const check = await this.availability(name)
		if (!check.available && check.reason !== 'NAME_HELD')
			throw new AppError(409, check.reason ?? 'NAME_UNAVAILABLE', 'That name is not available.')
		if (await this.emailOwnsName(this.pool, email))
			throw new AppError(409, 'NAME_LIMIT_REACHED', 'This email already owns a name.')
		// An active reservation by someone else doesn't forbid requesting: if
		// they don't pay, the window lapses and this claim link still works.

		const token = randomToken(32)
		const result: NameHoldResult = {
			name,
			expiresAt: '',
			priceEur: this.config.NAME_PRICE_EUR,
			reservationMinutes: this.config.NAME_RESERVATION_TTL_MINUTES
		}
		return withTransaction(this.pool, async (client) => {
			// Serialize per name so two simultaneous requests from the same email
			// rotate one row instead of racing update-then-insert into duplicates.
			await this.lockName(client, name)
			const rotated = (
				await client.query(
					`UPDATE name_holds SET claim_token_hash=$1,
					   tier = COALESCE(NULLIF($4, ''), tier),
					   salutation = COALESCE(NULLIF($5, ''), salutation),
					   idea = COALESCE(NULLIF($6, ''), idea)
					 WHERE name=$2 AND lower(email)=lower($3) AND expires_at >= now() RETURNING expires_at`,
					[
						sha256Hex(token),
						name,
						email,
						origin.tier ?? '',
						origin.salutation ?? '',
						origin.idea ?? ''
					]
				)
			).rows[0] as { expires_at: Date } | undefined
			let expiresAt = rotated?.expires_at
			if (!expiresAt) {
				expiresAt = new Date(Date.now() + this.config.NAME_HOLD_TTL_HOURS * 3_600_000)
				const holdId = randomUUID()
				await client.query(
					`INSERT INTO name_holds (id,name,email,claim_token_hash,created_at,expires_at,tier,salutation,idea)
					 VALUES ($1,$2,$3,$4,now(),$5,$6,$7,$8)`,
					[
						holdId,
						name,
						email,
						sha256Hex(token),
						expiresAt,
						origin.tier ?? '',
						origin.salutation ?? '',
						origin.idea ?? ''
					]
				)
				await writeAudit(client, {
					eventType: 'name.requested',
					metadata: { name, holdId, tier: origin.tier ?? '' }
				})
			}
			await this.notifier.namePurchaseLink(client, {
				email,
				name,
				claimUrl: this.claimUrl(token),
				expiresAt: expiresAt.toISOString()
			})
			return { ...result, expiresAt: expiresAt.toISOString() }
		})
	}

	// Resolves an emailed claim link: confirms the email, RESERVES the name for
	// the short window, lazily creates the checkout, and hands back its URL.
	// Re-clicking extends the window and returns the same checkout.
	async claim(token: string): Promise<{ name: string; checkoutUrl: string }> {
		if (!isBearerToken(token))
			throw new AppError(400, 'CLAIM_TOKEN_INVALID', 'The claim link is malformed.')
		const hold = (
			await this.pool.query(
				'SELECT id,name,email,checkout_id,checkout_url,email_confirmed_at,reserved_until,expires_at,success_token_hash FROM name_holds WHERE claim_token_hash=$1 AND expires_at >= now()',
				[sha256Hex(token)]
			)
		).rows[0] as HoldRow | undefined
		if (!hold) throw new AppError(410, 'CLAIM_LINK_EXPIRED', 'This claim link is no longer valid.')

		let checkout =
			hold.checkout_id && hold.checkout_url
				? { checkoutId: hold.checkout_id, checkoutUrl: hold.checkout_url }
				: null
		let successHash = ''
		if (!checkout) {
			const success = this.mintSuccessUrl(hold.name)
			successHash = success.hash
			checkout = await this.payments.createCheckout({
				name: hold.name,
				email: hold.email,
				holdId: hold.id,
				successUrl: success.url,
				// The names funnel is German-first — the checkout chrome follows.
				locale: 'de'
			})
		}

		return withTransaction(this.pool, async (client) => {
			await this.lockName(client, hold.name)
			const owned = (await client.query('SELECT 1 FROM names WHERE name=$1', [hold.name])).rows[0]
			if (owned)
				throw new AppError(410, 'NAME_UNAVAILABLE', 'This name has been purchased in the meantime.')
			// One name per account: refuse before payment is reachable.
			if (await this.emailOwnsName(client, hold.email))
				throw new AppError(410, 'NAME_LIMIT_REACHED', 'This email already owns a name.')
			const otherReservation = (
				await client.query(
					'SELECT 1 FROM name_holds WHERE name=$1 AND id<>$2 AND reserved_until >= now()',
					[hold.name, hold.id]
				)
			).rows[0]
			if (otherReservation)
				throw new AppError(
					410,
					'NAME_HELD',
					'Someone else is completing a purchase for this name right now.'
				)

			const updated = (
				await client.query(
					`UPDATE name_holds SET checkout_id=COALESCE(checkout_id,$1), checkout_url=COALESCE(checkout_url,$2),
           success_token_hash=COALESCE(NULLIF(success_token_hash,''), NULLIF($4,''), ''),
           email_confirmed_at=COALESCE(email_confirmed_at, now()),
           reserved_until=now() + make_interval(mins => $5)
         WHERE id=$3 AND expires_at >= now() RETURNING checkout_url`,
					[
						checkout.checkoutId,
						checkout.checkoutUrl,
						hold.id,
						successHash,
						this.config.NAME_RESERVATION_TTL_MINUTES
					]
				)
			).rows[0] as { checkout_url: string } | undefined
			if (!updated)
				throw new AppError(410, 'CLAIM_LINK_EXPIRED', 'This claim link is no longer valid.')
			if (!hold.email_confirmed_at)
				await writeAudit(client, {
					eventType: 'name.email_confirmed',
					metadata: { name: hold.name, holdId: hold.id }
				})
			await writeAudit(client, {
				eventType: 'name.reserved',
				metadata: {
					name: hold.name,
					holdId: hold.id,
					minutes: this.config.NAME_RESERVATION_TTL_MINUTES
				}
			})
			return { name: hold.name, checkoutUrl: updated.checkout_url }
		})
	}

	// checkout.completed. Idempotent: replays and duplicate deliveries no-op.
	// A reservation that lapsed before the webhook still grants if the name is
	// free — the customer paid. If the name was bought by someone else in the
	// meantime, the conflict is audited for support/refund follow-up.
	async grantFromEvent(event: PaymentEvent): Promise<{ granted: boolean }> {
		const name = normalizeName(String(event.metadata.name ?? ''))
		if (!name)
			throw new AppError(
				400,
				'WEBHOOK_PAYLOAD_INVALID',
				'The payment event carries no name metadata.'
			)
		if (!event.id)
			throw new AppError(400, 'WEBHOOK_PAYLOAD_INVALID', 'The payment event carries no id.')
		return withTransaction(this.pool, async (client) => {
			const recorded = await client.query(
				`INSERT INTO payment_events(id,event_type,checkout_id,payload,processed_at)
         VALUES($1,$2,$3,$4,now()) ON CONFLICT(id) DO NOTHING RETURNING id`,
				[event.id, event.type, event.checkoutId, JSON.stringify({ orderId: event.orderId, name })]
			)
			if (recorded.rowCount !== 1) return { granted: false }
			await this.lockName(client, name)
			const existing = (
				await client.query('SELECT status, checkout_id FROM names WHERE name=$1', [name])
			).rows[0] as { status: string; checkout_id: string | null } | undefined
			const hold = (
				await client.query(
					'SELECT * FROM name_holds WHERE id=$1 OR name=$2 ORDER BY (id=$1) DESC LIMIT 1',
					[String(event.metadata.holdId ?? ''), name]
				)
			).rows[0] as HoldRow | undefined
			if (existing) {
				// Same checkout id → a webhook replay/duplicate delivery, not a
				// conflict; only a DIFFERENT paid checkout losing the race is one.
				if (existing.checkout_id !== event.checkoutId) {
					await writeAudit(client, {
						eventType: 'name.purchase_conflict',
						metadata: {
							name,
							eventId: event.id,
							checkoutId: event.checkoutId,
							email: event.email ?? hold?.email ?? null
						}
					})
				}
				return { granted: false }
			}
			const email = (event.email ?? hold?.email ?? '').toLowerCase()
			if (!email)
				throw new AppError(
					400,
					'WEBHOOK_PAYLOAD_INVALID',
					'The payment event carries no customer email.'
				)

			// Account creation happens exactly here: the buyer proved control of
			// the inbox by completing the emailed checkout.
			const provisioned = await this.provisionAccount(email, 'name-purchase')
			const user = provisioned.account
			await client.query(
				`INSERT INTO checkout_customers(subject_id,email,created_at,updated_at) VALUES($1,$2,now(),now())
				 ON CONFLICT(subject_id) DO UPDATE SET email=EXCLUDED.email,updated_at=now()`,
				[user.id, user.email]
			)

			await client.query(
				"INSERT INTO names (name,owner_user_id,status,checkout_id,order_id,price_paid_eur,purchased_at,created_at,updated_at) VALUES ($1,$2,'owned',$3,$4,$5,now(),now(),now())",
				[name, user.id, event.checkoutId, event.orderId, event.amountEur]
			)
			await client.query('DELETE FROM name_holds WHERE name=$1', [name])
			await writeAudit(client, {
				eventType: 'name.purchased',
				targetUserId: user.id,
				metadata: { name, eventId: event.id, checkoutId: event.checkoutId }
			})
			// Follow-up work (customer database provisioning) rides the grant
			// transaction as a durable job — failures there retry independently
			// and never affect the purchase itself.
			if (this.onGranted) await this.onGranted(client, { userId: user.id, name })
			await this.notifier.namePurchased(client, {
				name,
				ownerEmail: email,
				accessUrl: provisioned.setupUrl ?? undefined
			})
			return { granted: true }
		})
	}

	// refund.created / dispute.created: the owner loses the name and it stays
	// locked after a refund or dispute.
	async revokeFromEvent(event: PaymentEvent): Promise<{ revoked: boolean }> {
		const metadataName = normalizeName(String(event.metadata.name ?? ''))
		if (!event.id)
			throw new AppError(400, 'WEBHOOK_PAYLOAD_INVALID', 'The payment event carries no id.')
		return withTransaction(this.pool, async (client) => {
			const recorded = await client.query(
				`INSERT INTO payment_events(id,event_type,checkout_id,payload,processed_at)
         VALUES($1,$2,$3,$4,now()) ON CONFLICT(id) DO NOTHING RETURNING id`,
				[
					event.id,
					event.type,
					event.checkoutId,
					JSON.stringify({ orderId: event.orderId, name: metadataName || null })
				]
			)
			if (recorded.rowCount !== 1) return { revoked: false }
			const row = (
				await client.query(
					"SELECT name, owner_user_id FROM names WHERE status='owned' AND (name=$1 OR ($2::text IS NOT NULL AND checkout_id=$2) OR ($3::text IS NOT NULL AND order_id=$3)) FOR UPDATE",
					[metadataName || null, event.checkoutId, event.orderId]
				)
			).rows[0] as { name: string; owner_user_id: string } | undefined
			if (!row) return { revoked: false }
			await this.lockName(client, row.name)
			await client.query(
				"UPDATE names SET status='revoked', revoked_at=now(), revoke_reason=$1, updated_at=now() WHERE name=$2",
				[event.type, row.name]
			)
			await writeAudit(client, {
				eventType: 'name.revoked',
				targetUserId: row.owner_user_id,
				metadata: { name: row.name, eventId: event.id, reason: event.type }
			})
			// Enqueued inside the same transaction as the revocation, so a suspended
			// name and a suspended tenant can never disagree.
			if (this.onRevoked)
				await this.onRevoked(client, { userId: row.owner_user_id, name: row.name })
			return { revoked: true }
		})
	}

	async listForUser(userId: string) {
		return (
			await this.pool.query(
				"SELECT name,status,purchased_at FROM names WHERE owner_user_id=$1 AND status='owned' ORDER BY purchased_at DESC",
				[userId]
			)
		).rows
	}

	async ownsAny(userId: string): Promise<boolean> {
		return Boolean(
			(
				await this.pool.query(
					"SELECT 1 FROM names WHERE owner_user_id=$1 AND status='owned' LIMIT 1",
					[userId]
				)
			).rows[0]
		)
	}
}
