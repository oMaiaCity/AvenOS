<script lang="ts">
import { appRuntime } from 'virtual:aven-app-runtime'
import { onMount } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import type { PageData } from './$types.js'

let { data }: { data: PageData } = $props()
const initial = appRuntime.initial.checkout(page.url)
let checkoutState = $state(initial.state)
let paymentError = $state(initial.error)
/** When Polar's embed never loads, the same checkout continues as a plain
 * redirect — the URL was minted server-side either way. */
let embedFailed = $state(false)
/** If the embed hasn't reported `loaded`, this is how long we wait before
 * offering the redirect instead. */
const EMBED_READY_TIMEOUT_MS = 8000
/** The only origins the checkout iframe may message from — replicated from
 * the official Polar embed lib (dist/embed.js): prod + sandbox, exact match. */
const POLAR_ORIGINS = ['https://polar.sh', 'https://sandbox.polar.sh']
/** The embed lib's own permissions policy for its iframe, verbatim. */
const POLAR_EMBED_ALLOW = `payment 'self' ${POLAR_ORIGINS.join(' ')}; publickey-credentials-get 'self' ${POLAR_ORIGINS.join(' ')};`

/** The embed-flavored checkout URL our INLINE iframe renders (no fullscreen
 * overlay) — the exact params the official lib appends, theme hard-coded
 * light to match the page. */
let embedUrl = $state('')
/** Bumped to remount a fresh iframe after the checkout reports `close`. */
let embedNonce = $state(0)
let checkoutFrame = $state<HTMLIFrameElement | null>(null)
let fallbackTimer: ReturnType<typeof setTimeout> | undefined

const fakeParams = (() => {
	if (data.provider !== 'fake') return null
	const url = new URL(data.checkoutUrl)
	return {
		checkoutId: url.searchParams.get('checkoutId') ?? '',
		holdId: url.searchParams.get('holdId') ?? '',
		name: url.searchParams.get('name') ?? '',
		email: url.searchParams.get('email') ?? '',
		successUrl: url.searchParams.get('successUrl') ?? ''
	}
})()

async function payFake() {
	if (!fakeParams) return
	checkoutState = 'paying'
	paymentError = ''
	try {
		const result = await appRuntime.billing.pay(fakeParams)
		await goto(result.redirect)
	} catch (error) {
		paymentError = error instanceof Error ? error.message : 'Payment failed.'
		checkoutState = 'ready'
	}
}

/** Render Polar's checkout INLINE in this page's container: our own iframe
 * speaking the embed's postMessage protocol. The iframe callback is UX-only
 * — fulfilment still comes exclusively from the verified webhook. */
function launchEmbed() {
	embedFailed = false
	checkoutState = 'loading'
	const url = new URL(data.checkoutUrl)
	url.searchParams.set('embed', 'true')
	url.searchParams.set('embed_origin', window.location.origin)
	url.searchParams.set('theme', 'light')
	embedUrl = url.toString()
	if (fallbackTimer) clearTimeout(fallbackTimer)
	fallbackTimer = setTimeout(() => {
		// No `loaded` from the iframe: offer the plain redirect instead.
		if (checkoutState === 'loading') {
			embedUrl = ''
			embedFailed = true
			checkoutState = 'ready'
		}
	}, EMBED_READY_TIMEOUT_MS)
}

/** The embed's message channel, replicated: only Polar's exact origins,
 * only from OUR iframe's window, only POLAR_CHECKOUT envelopes. */
function onCheckoutMessage(event: MessageEvent) {
	if (!embedUrl) return
	if (!POLAR_ORIGINS.includes(event.origin)) return
	if (!checkoutFrame || event.source !== checkoutFrame.contentWindow) return
	const message = event.data as { type?: string; event?: string; successURL?: string } | null
	if (message?.type !== 'POLAR_CHECKOUT') return
	switch (message.event) {
		case 'loaded':
			if (fallbackTimer) clearTimeout(fallbackTimer)
			if (checkoutState === 'loading') checkoutState = 'ready'
			break
		case 'confirmed':
			checkoutState = 'confirming'
			break
		case 'success': {
			checkoutState = 'confirming'
			// Only follow our own minted success URL, and follow it ourselves.
			const target = new URL(message.successURL ?? '', window.location.origin)
			if (target.origin === window.location.origin && target.pathname === '/purchase/success') {
				window.location.assign(target.toString())
			}
			break
		}
		case 'close':
			// Closed without paying: remount a fresh frame, the page stays.
			if (checkoutState !== 'confirming') {
				embedNonce += 1
				checkoutState = 'ready'
			}
			break
	}
}

onMount(() => {
	if (data.provider === 'fake') {
		if (checkoutState === 'loading') checkoutState = 'ready'
		return
	}
	// Designer scenarios seed a non-loading state — render it without an embed.
	if (initial.state === 'loading') launchEmbed()
	return () => {
		if (fallbackTimer) clearTimeout(fallbackTimer)
	}
})
</script>

<svelte:window onmessage={onCheckoutMessage} />
<svelte:head><title>Checkout</title></svelte:head>

<!--
  The `payment-frame` actor. Its own description is this screen: the iframe's
  inside belongs to somebody else and cannot be styled, so the only thing this
  system controls is the FRAME around it — the height it reserves, what shows
  while it loads, and what shows when it does not.

  That is exactly what the deleted 63-line <style> block was doing, spelled as
  seven local classes (checkout-page, checkout-container, checkout-frame,
  checkout-state, checkout-link, mock-checkout, polar-checkout).
-->
<section class="section">
	<div class="section-inner stack stack-center">
		<!-- Which name is being paid for — the one fact the Polar embed cannot show. -->
		<p class="text text--label">Du sicherst</p>
		<p class="text text--digits">{data.name}.aven.ceo</p>

		<div class="payment-frame payment-frame--height-tall">
			{#if fakeParams}
				<div class="payment-frame-stage stack stack-center">
					<h2 class="text text--title">{data.name}</h2>
					{#if paymentError}
						<div class="flow-card-alert">{paymentError}</div>
					{/if}
					<button class="btn btn--primary" disabled={checkoutState === "paying"} onclick={payFake}>
						{checkoutState === "paying" ? "Processing" : "Pay"}
					</button>
				</div>
			{:else if embedFailed}
				<!-- The embed never loaded: same checkout, plain redirect. -->
				<div class="payment-frame-fallback">
					<a class="btn btn--primary" href={data.checkoutUrl}>Zum Checkout</a>
				</div>
			{:else if embedUrl}
				{#if checkoutState === "loading" || checkoutState === "confirming"}
					<p class="payment-frame-state" aria-live="polite">
						{checkoutState === "confirming" ? "Confirming" : "Loading"}
					</p>
				{/if}
				{#key embedNonce}
					<iframe
						bind:this={checkoutFrame}
						src={embedUrl}
						title="Checkout"
						allow={POLAR_EMBED_ALLOW}
						class="payment-frame-stage"
					></iframe>
				{/key}
			{:else}
				<!-- Designer-seeded states render without a live frame. -->
				<p class="payment-frame-state" aria-live="polite">
					{checkoutState === "confirming"
						? "Confirming"
						: checkoutState === "ready"
							? "Ready"
							: "Loading"}
				</p>
				{#if checkoutState === "ready"}
					<div class="payment-frame-fallback">
						<button class="btn btn--primary" type="button" onclick={launchEmbed}>
							Checkout öffnen
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</section>
