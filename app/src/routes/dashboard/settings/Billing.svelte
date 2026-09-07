<script lang="ts">
import { canBuyMore, euro, PLANS, type Plan, priceSuffix } from '@myavenceo/aven-ceo/pricing'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { onDestroy, onMount } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { ingestFile } from '$lib/artifacts/ingest.svelte'

/**
 * Abrechnung — the member's whole Polar relationship, entirely in our brand.
 *
 * Nothing here leaves the pane: the checkout runs INLINE as our own iframe
 * inside the checkout card (no fullscreen overlay — we speak the embed's
 * URL-param + postMessage protocol ourselves, hard-coded light theme),
 * orders are the provider's real orders, and
 * the subscription lifecycle — book, cancel, resume a scheduled cancel — is
 * all native. Polar is the merchant of record; each paid order's official
 * invoice PDF is downloaded into local app storage and opened on the
 * Artefakte shelf (deep-linked, preselected) — never a separate window.
 *
 * Everything routes through the id service with the session token (the
 * Polar key never reaches this binary), and every call acts on the
 * session's OWN records — the pane never handles a customer, subscription
 * or checkout id. The webhook is the only writer of state: after an action
 * the pane shows a pending note IN THE CARD it belongs to and polls until
 * the event lands; action errors land in the same card. The page-level
 * banner is only for load errors that belong to no card.
 *
 * There is ONE subscription to manage here: avenCEO, one per account. The
 * pane no longer knows that by heart — it reads the recurring, bookable
 * plans out of the pricing SSOT, and asks `canBuyMore` whether a booking
 * button belongs on the card. avenME was consolidated into avenCEO and is
 * gone; when several avenCEO subscriptions become sellable, the SSOT's
 * `maxPerAccount` is the only thing that changes.
 *
 * avenNAME (wire key `avenid`) is the one-off the names funnel owns — it
 * shows up here as an ORDER, never as a card. avenCOOP is not a Polar
 * product at all; that relationship is handled individually.
 */

interface Standing {
	tier: string
	status: string
	priceEurCents: number
	currentPeriodEnd: string | null
	cancelAtPeriodEnd: boolean
	pauseAtPeriodEnd: boolean
}

interface Order {
	id: string
	createdAt: string
	productId: string
	tier: string | null
	subTotalCents: number
	taxCents: number
	discountCents: number
	amountPaidCents: number
	currency: string
	status: string
	invoiceGenerated: boolean
}

/** The plans this pane books: recurring and self-serve. Derived, not
 * listed — avenNAME is `billing: 'once'` (the funnel's), avenCOOP is
 * `applyOnly` (a conversation), and what is left is avenCEO. A new
 * subscription tier in the SSOT appears here with no edit. */
const TIER_PLANS: Plan[] = PLANS.filter((p) => p.billing === 'monthly' && !p.applyOnly)
/**
 * ALPHA: we only sell avenNAME. The subscription half of this pane — the
 * "Deine Produkte" cards and the inline checkout they open — is switched off
 * rather than removed: the markup below is commented out, and this flag keeps
 * the checkout block (which contains its own HTML comments, so it cannot be
 * legally wrapped in one) inert. Flip to `true` and un-comment the block under
 * "Deine Produkte" to open avenCEO back up. Orders are untouched — a paid
 * avenNAME still appears under "Meine Bestellungen".
 */
const SUBSCRIPTIONS_ENABLED = false
/** A subscription in one of these states is over — the tier is bookable
 * again. Mirrors the server's ENDED_STATUSES, Polar vocabulary. */
const ENDED = ['canceled', 'expired', 'incomplete_expired', 'unpaid', 'revoked']
/** If the embed hasn't reported `loaded`, this is how long we wait before
 * falling back to the dedicated in-app window. */
const EMBED_READY_TIMEOUT_MS = 8000
/** The only origins the checkout iframe may message from — replicated from
 * the official Polar embed lib (dist/embed.js): prod + sandbox, exact match. */
const POLAR_ORIGINS = ['https://polar.sh', 'https://sandbox.polar.sh']
/** The embed lib's own permissions policy for its iframe, verbatim. */
const POLAR_EMBED_ALLOW = `payment 'self' ${POLAR_ORIGINS.join(' ')}; publickey-credentials-get 'self' ${POLAR_ORIGINS.join(' ')};`

let subscriptions = $state<Standing[]>([])
let orders = $state<Order[]>([])
let loading = $state(true)
let busy = $state('')
/** The webhook watch, reported INSIDE the tier card it belongs to. */
let pending = $state<{ tier: string; note: string } | null>(null)
/** Page-level failures only — a load that belongs to no card. */
let failure = $state<string | null>(null)
/** An action's failure, rendered inside the tier card that asked. */
let cardFailure = $state<{ tier: string; message: string } | null>(null)
/** An invoice failure, rendered inside the order row that asked. */
let invoiceFailure = $state<{ orderId: string; message: string } | null>(null)
/** Which action is asking "wirklich?" — one confirm at a time. */
let confirming = $state<`cancel:${string}` | null>(null)
// Which card's benefit list is unfolded — collapsed by default.
let benefitsOpen = $state<string | null>(null)
/** Which order row is expanded into its in-app rendered detail. */
let openOrder = $state<string | null>(null)
/** The inline checkout, when one is running: `url` is the embed-flavored
 * checkout URL our iframe renders, `fallbackUrl` the plain one for the
 * dedicated-window fallback. Fixtures leave `url` empty. */
let checkout = $state<{ tier: string; url: string; fallbackUrl: string } | null>(null)
/** Set once the iframe posts `loaded` — disarms the window fallback. */
let embedLoaded = $state(false)
/** Our own inline iframe — the only window we accept messages from. */
let checkoutFrame = $state<HTMLIFrameElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | undefined
let embedTimer: ReturnType<typeof setTimeout> | undefined

// In the browser the pane renders from fixtures so every state is stylable
// without a paid account: ?billing=none|active|paused|cancel|checkout.
// (`both` is gone with avenME — there is one subscription to be in a state.)
const fixtureScenario = $derived(page.url.searchParams.get('billing') ?? 'active')

function fixtures(scenario: string): { subscriptions: Standing[]; orders: Order[] } {
	const paidOrders: Order[] = [
		{
			id: 'ord_demo_2',
			createdAt: '2026-08-14T09:12:00.000Z',
			productId: 'prod_6ALajlETScD2v0dv10n618',
			tier: 'aven-ceo',
			subTotalCents: 31681,
			taxCents: 6019,
			discountCents: 0,
			amountPaidCents: 37700,
			currency: 'EUR',
			status: 'paid',
			invoiceGenerated: true
		},
		{
			id: 'ord_demo_1',
			createdAt: '2026-07-02T15:40:00.000Z',
			productId: 'prod_3FJqTxDvcsUaj4YPo7lfDm',
			tier: 'aven-name',
			subTotalCents: 2101,
			taxCents: 399,
			discountCents: 0,
			amountPaidCents: 2500,
			currency: 'EUR',
			status: 'paid',
			invoiceGenerated: false
		}
	]
	const ceo: Standing = {
		tier: 'aven-ceo',
		status: scenario === 'paused' ? 'paused' : 'active',
		priceEurCents: 37700,
		currentPeriodEnd: '2026-09-14T09:12:00.000Z',
		cancelAtPeriodEnd: scenario === 'cancel',
		pauseAtPeriodEnd: scenario === 'paused'
	}
	if (scenario === 'none') return { subscriptions: [], orders: [] }
	// Mid-checkout: avenNAME is already bought, avenCEO is not yet.
	if (scenario === 'checkout') return { subscriptions: [], orders: paidOrders.slice(1) }
	return { subscriptions: [ceo], orders: paidOrders }
}

/** The plan an order bought — matched by the SSOT tier the server reads
 * from the product's metadata. */
function planOfOrder(order: Order): Plan | null {
	return PLANS.find((p) => p.id === order.tier) ?? null
}

async function refresh() {
	if (!isTauri()) {
		const fixture = fixtures(fixtureScenario)
		subscriptions = fixture.subscriptions
		orders = fixture.orders
		if (fixtureScenario === 'checkout' && !checkout)
			checkout = { tier: 'aven-ceo', url: '', fallbackUrl: '' }
		return
	}
	// Defensive against foreign shapes (an older server, an error body): a
	// missing array must degrade to "nothing", never crash the pane.
	const me = await invoke<{ subscriptions?: Standing[] }>('billing_me')
	subscriptions = Array.isArray(me?.subscriptions) ? me.subscriptions : []
	// Orders exist without a subscription — the one-off avenNAME is an order
	// too, resolved via the session's own email.
	const history = await invoke<{ orders?: Order[] }>('billing_orders')
	orders = Array.isArray(history?.orders) ? history.orders : []
}

/** After an action: watch for the webhook to land, then stop announcing.
 * While a checkout runs, the checkout status is polled alongside — the
 * webhook stays the only state writer, the poll only reads. The note (and
 * any failure) reports into the tier's own card. */
function watch(tier: string, until: (subs: Standing[]) => boolean, note: string) {
	pending = { tier, note }
	if (pollTimer) clearInterval(pollTimer)
	pollTimer = setInterval(async () => {
		try {
			await refresh()
			if (checkout && isTauri()) {
				const latest = await invoke<{ checkout: { status: string } | null }>('billing_checkout')
				const status = latest.checkout?.status
				if (status === 'failed' || status === 'expired') {
					cardFailure = {
						tier,
						message:
							status === 'failed'
								? 'Die Zahlung ist fehlgeschlagen — bitte versuche es noch einmal.'
								: 'Der Checkout ist abgelaufen — bitte starte ihn neu.'
					}
					pending = null
					closeCheckout()
					if (pollTimer) clearInterval(pollTimer)
					return
				}
			}
			if (until(subscriptions)) {
				pending = null
				closeCheckout()
				if (pollTimer) clearInterval(pollTimer)
			}
		} catch {
			// keep polling; transient failures resolve themselves
		}
	}, 5000)
}

async function act(tier: string, label: string, run: () => Promise<void>) {
	busy = label
	cardFailure = null
	confirming = null
	try {
		await run()
	} catch (cause) {
		cardFailure = { tier, message: cause instanceof Error ? cause.message : String(cause) }
		pending = null
	} finally {
		busy = ''
	}
}

function standingOf(subs: Standing[], tier: string): Standing | null {
	return subs.find((s) => s.tier === tier) ?? null
}

/** How many subscriptions of a tier are standing — mirrors the server's own
 * count, so both sides weigh the same number against the SSOT's limit. */
function liveCountOf(subs: Standing[], tier: string): number {
	return subs.filter((s) => s.tier === tier && !ENDED.includes(s.status)).length
}

/** The embed flavor of a checkout URL — the exact params the official lib
 * appends (embed, embed_origin, theme). Theme is HARD-CODED light: a brand
 * decision, the checkout card is light in every app theme. */
function embedUrlOf(checkoutUrl: string): string {
	const url = new URL(checkoutUrl)
	url.searchParams.set('embed', 'true')
	url.searchParams.set('embed_origin', window.location.origin)
	url.searchParams.set('theme', 'light')
	return url.toString()
}

/** Start a checkout INLINE: our own iframe inside the checkout card speaks
 * the embed's postMessage protocol. The url came from the id service; the
 * pane only adds the embed params. */
async function subscribe(tier: string) {
	await act(tier, `subscribe:${tier}`, async () => {
		const result = await invoke<{ checkoutUrl: string }>('billing_subscribe', {
			tier,
			// Our own origin, so Polar accepts this page as the embedding frame.
			embedOrigin: window.location.origin,
			// The checkout speaks the member's language (the app is German).
			locale: 'de'
		})
		embedLoaded = false
		checkout = { tier, url: embedUrlOf(result.checkoutUrl), fallbackUrl: result.checkoutUrl }
		armEmbedFallback(result.checkoutUrl)
		watch(
			tier,
			(subs) => {
				const s = standingOf(subs, tier)
				return s !== null && !ENDED.includes(s.status)
			},
			'Sobald die Zahlung bestätigt ist, erscheint dein Plan hier.'
		)
	})
}

/** The embed's message channel, replicated: only Polar's exact origins,
 * only from OUR iframe's window, only POLAR_CHECKOUT envelopes. */
function onCheckoutMessage(event: MessageEvent) {
	if (!checkout) return
	if (!POLAR_ORIGINS.includes(event.origin)) return
	if (!checkoutFrame || event.source !== checkoutFrame.contentWindow) return
	const message = event.data as { type?: string; event?: string } | null
	if (message?.type !== 'POLAR_CHECKOUT') return
	switch (message.event) {
		case 'loaded':
			embedLoaded = true
			if (embedTimer) clearTimeout(embedTimer)
			break
		case 'confirmed':
		case 'success':
			// Never follow the embed's redirect; the webhook poll is the truth.
			pending = { tier: checkout.tier, note: 'Zahlung bestätigt — dein Plan erscheint gleich.' }
			break
		case 'close':
			closeCheckout()
			break
	}
}

$effect(() => {
	if (!checkout) return
	window.addEventListener('message', onCheckoutMessage)
	return () => window.removeEventListener('message', onCheckoutMessage)
})

function armEmbedFallback(url: string) {
	if (embedTimer) clearTimeout(embedTimer)
	embedTimer = setTimeout(async () => {
		// No `loaded` from the iframe: the provider refused the frame (or the
		// network is slow). Same checkout, dedicated avenOS window — never
		// the system browser. Polling keeps running either way.
		if (checkout && !embedLoaded && isTauri()) {
			const tier = checkout.tier
			checkout = null
			try {
				await invoke('billing_checkout_window', { url })
				pending = {
					tier,
					note: 'Der Checkout läuft in einem eigenen avenOS‑Fenster weiter — dein Plan erscheint hier, sobald die Zahlung bestätigt ist.'
				}
			} catch (cause) {
				cardFailure = { tier, message: cause instanceof Error ? cause.message : String(cause) }
			}
		}
	}, EMBED_READY_TIMEOUT_MS)
}

function closeCheckout() {
	if (embedTimer) clearTimeout(embedTimer)
	embedLoaded = false
	checkout = null
}

async function cancel(tier: string) {
	await act(tier, `cancel:${tier}`, async () => {
		await invoke('billing_cancel', { tier, immediate: false })
		watch(
			tier,
			(subs) => {
				const s = standingOf(subs, tier)
				return s?.cancelAtPeriodEnd === true || ENDED.includes(s?.status ?? '')
			},
			'Kündigung angestoßen — gleich steht hier dein Enddatum.'
		)
	})
}

/** Pausieren — schedules a pause at period end; billing stops, the plan
 * stays. Polar guards the preconditions (no scheduled cancel, no end date). */
async function pause(tier: string) {
	await act(tier, `pause:${tier}`, async () => {
		await invoke('billing_pause', { tier })
		watch(
			tier,
			(subs) => {
				const s = standingOf(subs, tier)
				return s?.pauseAtPeriodEnd === true || s?.status === 'paused'
			},
			'Pause angestoßen — dein Plan pausiert zum Ende des Zeitraums.'
		)
	})
}

/** Fortsetzen — lifts a (geplante) Pause oder eine geplante Kündigung. */
async function resume(tier: string) {
	await act(tier, `resume:${tier}`, async () => {
		await invoke('billing_resume', { tier })
		watch(
			tier,
			(subs) => {
				const s = standingOf(subs, tier)
				return s?.status === 'active' && !s.cancelAtPeriodEnd && !s.pauseAtPeriodEnd
			},
			'Fortsetzung angestoßen — dein Plan läuft gleich wieder.'
		)
	})
}

/** Polar may still be rendering the PDF on first ask — retry this often,
 * this far apart, while the row button keeps its busy state. */
const INVOICE_RETRIES = 5
const INVOICE_RETRY_PAUSE_MS = 3000

/** The official invoice PDF for one paid order: the id service asks Polar
 * (generating the document on first ask — that can take up to ~30s), the
 * PDF lands in local app storage, and the Artefakte shelf opens with it
 * preselected. */
async function downloadInvoice(order: Order) {
	if (!isTauri()) return
	busy = `invoice:${order.id}`
	invoiceFailure = null
	try {
		let attempt = 0
		let result: { fileName: string; path: string }
		for (;;) {
			try {
				result = await invoke<{ fileName: string; path: string }>('billing_invoice_download', {
					orderId: order.id
				})
				break
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : String(cause)
				const stillGenerating =
					message.includes('still being generated') || message.includes('BILLING_INVOICE_PENDING')
				if (!stillGenerating || attempt >= INVOICE_RETRIES) throw cause
				attempt += 1
				await new Promise((resolve) => setTimeout(resolve, INVOICE_RETRY_PAUSE_MS))
			}
		}
		// The invoice goes in the SAME door as a dropped file: one ingest, one
		// intent, one skill flow. It used to be written to a local shelf that
		// sat outside all of that — a second store with no lineage, no
		// processing, and nothing to navigate to. `ingestFile` leaves the shell
		// on the conversation, where the ingest is watched as it happens.
		await goto('/dashboard')
		await ingestFile(result.path)
	} catch (cause) {
		invoiceFailure = {
			orderId: order.id,
			message: cause instanceof Error ? cause.message : String(cause)
		}
	} finally {
		busy = ''
	}
}

const cents = (value: number) => (value / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })

const dateOf = (iso: string) =>
	new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })

/** Polar's subscription vocabulary, in our words. */
const STATUS_LABEL: Record<string, string> = {
	active: 'Aktiv',
	trialing: 'Testphase',
	paused: 'Pausiert',
	past_due: 'Zahlung überfällig',
	canceled: 'Gekündigt',
	unpaid: 'Unbezahlt',
	incomplete: 'In Bearbeitung',
	incomplete_expired: 'Abgelaufen',
	expired: 'Abgelaufen',
	revoked: 'Beendet'
}

const ORDER_STATUS: Record<string, string> = {
	paid: 'Bezahlt',
	pending: 'Ausstehend',
	refunded: 'Erstattet',
	partially_refunded: 'Teilweise erstattet'
}

onMount(async () => {
	try {
		await refresh()
	} catch (cause) {
		failure = cause instanceof Error ? cause.message : String(cause)
	} finally {
		loading = false
	}
})

onDestroy(() => {
	if (pollTimer) clearInterval(pollTimer)
	if (embedTimer) clearTimeout(embedTimer)
})
</script>

{#snippet planCard(p: Plan)}
	{@const s = standingOf(subscriptions, p.id)}
	{@const isLive = s !== null && !ENDED.includes(s.status)}
	<!-- Whether a booking button belongs here at all. The SSOT decides how
	     many of one product an account may hold; the pane only counts what
	     it has. Today that is 1, so a live avenCEO hides the button — the
	     same answer the id service gives, from the same rule. -->
	{@const bookable = canBuyMore(p.id, liveCountOf(subscriptions, p.id))}
	<article
		class="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border px-4 py-4 shadow-[0_1px_3px_rgba(30,41,59,0.05)] {isLive
			? 'border-primary bg-surface-raised'
			: 'border-foreground/8 bg-surface-raised'}"
	>
		<div class="flex items-baseline justify-between gap-2">
			<h3 class="text-sm font-medium">{p.name}</h3>
			{#if isLive && s}
				<span
					class="rounded-full px-2 py-0.5 text-[length:var(--fs-micro)] font-medium uppercase tracking-[var(--tracking-wider)] {s.cancelAtPeriodEnd ||
					['paused', 'past_due', 'unpaid', 'incomplete'].includes(s.status)
						? 'bg-warning/15 text-warning-ink'
						: 'bg-success/15 text-success-ink'}"
				>
					{s.cancelAtPeriodEnd
						? 'Endet bald'
						: s.pauseAtPeriodEnd
							? 'Pausiert bald'
							: (STATUS_LABEL[s.status] ?? s.status)}
				</span>
			{/if}
		</div>
		<p class="text-xs opacity-60">{p.role}</p>
		<p class="text-lg font-semibold">
			{isLive && s ? cents(s.priceEurCents) : euro(p.eurPrice)}
			€<span class="pl-1 text-xs font-normal opacity-50">{priceSuffix(p)}</span>
		</p>
		<!-- The FULL benefit list, straight from the SSOT — the same titles the
		     website prints and the seeder pushes to Polar, plus the included
		     Aven Worker Minutes. Collapsed by default; a click unfolds it. -->
		<button
			type="button"
			onclick={() => (benefitsOpen = benefitsOpen === p.id ? null : p.id)}
			class="self-start text-sm font-medium text-primary transition-opacity hover:opacity-70"
		>
			{benefitsOpen === p.id
				? 'Leistungen ausblenden'
				: `Alle Leistungen anzeigen (${p.features.length + (p.runtime ? 1 : 0)})`}
		</button>
		{#if benefitsOpen === p.id}
			<ul class="flex flex-col gap-1.5 text-sm opacity-80">
				{#if p.runtime}
					<li class="flex gap-2">
						<span class="opacity-50">·</span>
						<!-- MIND credits, not hours. `hoursPerDay` was the runtime shape
						     before the 0.9.0 SSOT; the app kept compiling against it only
						     because the lockfile pinned aven-ceo 0.8.1 here while every
						     other surface had moved on. The wording matches the website's
						     `mindWeekly` / `mindOnce`, which is the point of a shared
						     price list. -->
						<span>
							{p.runtime.per === 'week'
								? `${p.runtime.mindCredits} MIND Credits pro Woche inklusive`
								: `${p.runtime.mindCredits} MIND Credits — für Early-Bird-Tests`}
						</span>
					</li>
				{/if}
				{#each p.features as feature, index (index)}
					<li class="flex gap-2">
						<span class="opacity-50">·</span>
						<span>{feature.title}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if isLive && s?.currentPeriodEnd}
			<p class="text-xs opacity-60">
				{s.cancelAtPeriodEnd
					? `Endet am ${dateOf(s.currentPeriodEnd)} — bis dahin läuft alles weiter.`
					: s.pauseAtPeriodEnd
						? `Pausiert ab ${dateOf(s.currentPeriodEnd)} — bis dahin läuft alles weiter.`
						: `Verlängert sich am ${dateOf(s.currentPeriodEnd)}.`}
			</p>
		{/if}
		<!-- Buchen / Kündigen / Fortsetzen — each product entirely on its
		     own; both can stand at once. Progress and errors live HERE, in
		     the card the action belongs to. -->
		<div class="mt-auto flex flex-col gap-2 pt-2">
			{#if !isLive && bookable}
				<button
					type="button"
					onclick={() => subscribe(p.id)}
					disabled={busy !== ''}
					class="w-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
				>
					{busy === `subscribe:${p.id}` ? 'Buchung startet …' : 'Jetzt buchen'}
				</button>
			{:else if !isLive}
				<!-- Held as many as the plan allows, but none of them standing:
				     the limit is reached by a subscription in some other state,
				     so booking would be refused rather than merely unavailable. -->
				<p class="text-xs opacity-60">
					Du hast {p.name} bereits gebucht — mehr als eines gibt es pro Konto nicht.
				</p>
			{:else if s?.cancelAtPeriodEnd || s?.pauseAtPeriodEnd || s?.status === 'paused'}
				<button
					type="button"
					onclick={() => resume(p.id)}
					disabled={busy !== ''}
					class="w-full rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/8 disabled:opacity-40"
				>
					{busy === `resume:${p.id}` ? 'Wird fortgesetzt …' : 'Fortsetzen'}
				</button>
			{:else if confirming === `cancel:${p.id}`}
				<div class="flex flex-col gap-2">
					<p class="text-xs opacity-70">
						Dein Plan endet zum Ablauf des bezahlten Zeitraums{s?.currentPeriodEnd
							? ` am ${dateOf(s.currentPeriodEnd)}`
							: ''}. Bis dahin ändert sich nichts.
					</p>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => cancel(p.id)}
							disabled={busy !== ''}
							class="rounded-full bg-error px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
						>
							{busy === `cancel:${p.id}` ? 'Wird gekündigt …' : 'Kündigung bestätigen'}
						</button>
						<button
							type="button"
							onclick={() => (confirming = null)}
							class="rounded-full border border-border px-4 py-2 text-sm"
						>
							Abbrechen
						</button>
					</div>
				</div>
			{:else}
				<!-- Outline in the brand terracotta (--color-terracotta, aliased
				     as `error`): transparent ground, terracotta border + label. -->
				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => pause(p.id)}
						disabled={busy !== ''}
						class="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/8 disabled:opacity-40"
					>
						{busy === `pause:${p.id}` ? 'Wird pausiert …' : 'Pausieren'}
					</button>
					<!-- Outline in the brand terracotta (--color-terracotta, aliased
					     as `error`): transparent ground, terracotta border + label. -->
					<button
						type="button"
						onclick={() => (confirming = `cancel:${p.id}`)}
						disabled={busy !== ''}
						class="rounded-full border border-error bg-transparent text-sm font-medium text-error-ink transition-colors hover:bg-error/8 disabled:opacity-40"
					>
						Kündigen
					</button>
				</div>
			{/if}
			{#if pending?.tier === p.id}
				<p class="text-xs opacity-60">{pending.note}</p>
			{/if}
			{#if cardFailure?.tier === p.id}
				<p class="text-xs text-error-ink">{cardFailure.message}</p>
			{/if}
		</div>
	</article>
{/snippet}

<section class="flex flex-col gap-4">
	<h2 class="text-sm">Abrechnung</h2>

	{#if loading}
		<p
			class="surface surface--raised text-xs opacity-50"
		>
			Deine Abrechnung wird geladen …
		</p>
	{:else}
		{#if SUBSCRIPTIONS_ENABLED && checkout}
			<!-- Inline checkout: OUR iframe, right here in the card — no
			     fullscreen overlay, hard-coded light, Polar's embed protocol
			     spoken directly. -->
			<div
				class="flex flex-col gap-2 surface surface--raised"
			>
				<div class="flex items-baseline justify-between gap-2">
					<p class="text text--eyebrow-quiet">
						Checkout · {TIER_PLANS.find((p) => p.id === checkout?.tier)?.name ?? checkout.tier}
					</p>
					<button
						type="button"
						onclick={closeCheckout}
						class="text-xs opacity-50 transition-opacity hover:opacity-100"
					>
						Abbrechen
					</button>
				</div>
				{#if checkout.url}
					<iframe
						bind:this={checkoutFrame}
						src={checkout.url}
						title="Checkout"
						allow={POLAR_EMBED_ALLOW}
						class="min-h-[640px] w-full rounded-xl border-0 bg-white"
					></iframe>
				{:else}
					<!-- Browser fixture: the card without a live provider frame. -->
					<div
						class="flex min-h-[640px] w-full items-center justify-center rounded-xl bg-white/25 text-xs opacity-40"
					>
						Checkout‑Vorschau
					</div>
				{/if}
				<p class="text-xs opacity-60">
					Sobald die Zahlung bestätigt ist, erscheint dein Plan hier.
				</p>
				<p class="text-[length:var(--fs-eyebrow)] opacity-40">
					Sichere Zahlung über Polar, unseren Zahlungsabwickler. Die offizielle Rechnung findest du
					anschließend unter „Meine Bestellungen“.
				</p>
			</div>
		{/if}

		<!-- ALPHA: subscriptions are off — we only sell avenNAME, so the
		     avenCEO product cards (and the booking button on them) are hidden.
		     Commented out, not deleted: restore by removing the comment
		     wrapper below and setting SUBSCRIPTIONS_ENABLED to true.

		     Zwei unabhängige Produkte, aus demselben SSOT wie die Website —
		     settings und Website können sich beim Preis nicht widersprechen. -->
		<!--
		<div class="flex flex-col gap-2">
			<p class="text text--eyebrow-quiet">Deine Produkte</p>
			<div class="flex flex-col gap-3 sm:flex-row">
				{#each TIER_PLANS as p (p.id)}
					{@render planCard(p)}
				{/each}
			</div>
		</div>
		-->

		<!-- Meine Bestellungen: each order expands into its in-app detail from
		     real order data; the official Polar invoice PDF is one click away. -->
		<div class="flex flex-col gap-2">
			<p class="text text--eyebrow-quiet">Meine Bestellungen</p>
			{#if orders.length}
				<ul
					class="flex flex-col divide-y divide-foreground/8 surface surface--raised"
				>
					{#each orders as order (order.id)}
						{@const plan = planOfOrder(order)}
						<li class="flex flex-col">
							<button
								type="button"
								onclick={() => (openOrder = openOrder === order.id ? null : order.id)}
								class="flex items-center justify-between gap-3 px-4 py-2.5 text-left text-xs transition-colors hover:bg-primary/8"
							>
								<span class="opacity-60">{dateOf(order.createdAt)}</span>
								<span class="flex-1 font-medium">{plan?.name ?? 'Bestellung'}</span>
								<span class="font-medium">
									{cents(order.amountPaidCents)}
									{order.currency === 'EUR' ? '€' : order.currency}
								</span>
								<span class="opacity-50">{ORDER_STATUS[order.status] ?? order.status}</span>
								<span class="opacity-30">{openOrder === order.id ? '▴' : '▾'}</span>
							</button>
							{#if openOrder === order.id}
								<div
									class="flex flex-col gap-1.5 border-t border-foreground/8 bg-primary/[0.02] px-4 py-3 text-xs"
								>
									<div class="flex justify-between gap-4">
										<span class="opacity-40">Netto</span>
										<span>{cents(order.subTotalCents)} €</span>
									</div>
									{#if order.discountCents > 0}
										<div class="flex justify-between gap-4">
											<span class="opacity-40">Rabatt</span>
											<span>−{cents(order.discountCents)} €</span>
										</div>
									{/if}
									<div class="flex justify-between gap-4">
										<span class="opacity-40">USt.</span>
										<span>{cents(order.taxCents)} €</span>
									</div>
									<div class="flex justify-between gap-4 font-medium">
										<span class="opacity-40">Bezahlt</span>
										<span>{cents(order.amountPaidCents)} €</span>
									</div>
									<div class="flex justify-between gap-4">
										<span class="opacity-40">Bestell‑Nr.</span>
										<span class="font-mono opacity-60">{order.id}</span>
									</div>
									{#if order.status === 'paid'}
										<div class="pt-1">
											<button
												type="button"
												onclick={() => downloadInvoice(order)}
												disabled={busy !== ''}
												class="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary/8 disabled:opacity-40"
											>
												{busy === `invoice:${order.id}`
													? 'Rechnung wird erstellt …'
													: 'Rechnung herunterladen'}
											</button>
										</div>
									{/if}
									{#if busy === `invoice:${order.id}`}
										<!-- Generating can take up to ~30s — say what is happening,
										     right where it happens. -->
										<p class="flex items-center gap-2 pt-1 text-xs opacity-60">
											<span
												class="size-3 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
											></span>
											Rechnung wird erstellt und direkt in deinen Dokumentenspeicher geladen …
										</p>
									{/if}
									{#if invoiceFailure?.orderId === order.id}
										<p class="text-xs text-error-ink">{invoiceFailure.message}</p>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p
					class="surface surface--raised text-xs opacity-50"
				>
					Noch keine Bestellungen — sobald du etwas buchst, steht sie hier.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Page-level banner: ONLY for load failures that belong to no card. -->
	{#if failure}
		<p class="rounded-xl border border-error/25 bg-error-surface text-xs text-error-ink">
			{failure}
		</p>
	{/if}
</section>
