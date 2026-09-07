<script lang="ts">
import { page } from '$app/state'
import { authClient } from '$lib/auth-client.js'

let busy = $state(false)
let approved = $state(false)
let message = $state('')
const session = authClient.useSession()
const code = $derived(page.url.searchParams.get('user_code') ?? '')
const displayCode = $derived(code.replaceAll('-', '').replace(/(.{4})(?=.)/g, '$1-'))
const authenticated = $derived(Boolean($session.data))
const heading = $derived(
	!code
		? 'This connection link is incomplete'
		: approved
			? 'Device connected'
			: authenticated
				? 'Authorize this device'
				: 'Sign in and connect avenOS'
)
const description = $derived(
	!code
		? 'Open the sign-in link from avenOS again to receive a new device code.'
		: approved
			? 'You can close this page and return to avenOS.'
			: authenticated
				? 'Confirm the connection to give the app access to your Aven account.'
				: 'Use your Aven account passkey. You will confirm the app in the next step.'
)
async function login() {
	busy = true
	const result = await authClient.signIn.passkey()
	if (result?.error) message = result.error.message ?? 'Sign-in failed.'
	busy = false
}
async function approve() {
	busy = true
	message = ''
	try {
		const cleanCode = code.replaceAll('-', '')
		const claim = await fetch(`/api/auth/device?user_code=${encodeURIComponent(cleanCode)}`, {
			credentials: 'same-origin'
		})
		if (!claim.ok) {
			const body = (await claim.json().catch(() => null)) as { error_description?: string } | null
			throw new Error(body?.error_description ?? 'Could not claim this device code.')
		}
		const response = await fetch('/api/auth/device/approve', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ userCode: cleanCode })
		})
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as {
				error_description?: string
			} | null
			throw new Error(body?.error_description ?? 'Device authorization failed.')
		}
		approved = true
	} catch (cause) {
		message = cause instanceof Error ? cause.message : 'Device authorization failed.'
	} finally {
		busy = false
	}
}
</script>
<svelte:head><title>Authorize device · aven.id</title></svelte:head>

<!--
  The `flow-card` actor. This screen is one of the three its description
  names — avenID device authorisation, portal.aven.ceo's name check and its
  passkey sign-in are the same shape, which is what made it an actor rather
  than a component here.

  The `device-flow__*` BEM island this replaces was that shape written once,
  by hand, in this file: a crest, an eyebrow, a heading, a description, a
  code to read aloud, an alert, an action and a line saying who you are
  talking to. Those are the actor's slots, one for one.
-->
<section
	class="flow-card {approved ? 'flow-card--status-success' : !code || message ? 'flow-card--status-error' : ''}"
	aria-live="polite"
>
	<div class="flow-card-crest">
		{#if approved}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="m5 12.5 4.25 4.25L19 7" />
			</svg>
		{:else if !code}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 8v5M12 17h.01" />
				<circle cx="12" cy="12" r="9" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<rect x="5" y="10" width="14" height="10" rx="2" />
				<path d="M8 10V7a4 4 0 0 1 8 0v3" />
			</svg>
		{/if}
	</div>

	<p class="flow-card-eyebrow">Secure app connection</p>
	<h1 class="flow-card-heading">{heading}</h1>
	<p class="flow-card-description">{description}</p>

	{#if displayCode}
		<!-- The code part IS the code: it carries `user-select: all` so one click
		     takes the whole thing, which a label inside it would join. The old
		     markup put "Code: ABCDEFGH" in there beside the formatted
		     "ABCD-EFGH" — the same code twice, and a copy that picked up both.
		     The label is a real <label>-ish line above it instead. -->
		<p class="text text--label" id="device-code-label">Device code</p>
		<div class="flow-card-code" aria-labelledby="device-code-label">{displayCode}</div>
	{/if}
	{#if message}
		<div class="flow-card-alert" role="alert">{message}</div>
	{/if}
	{#if !approved && authenticated}
		<div class="flow-card-actions">
			<button class="btn btn--primary" disabled={busy || !code} onclick={approve}>
				{busy ? 'Authorizing…' : 'Authorize'}
			</button>
		</div>
	{:else if !approved && code}
		<div class="flow-card-actions">
			<button class="btn btn--primary" disabled={busy} onclick={login}>
				{busy ? 'Opening passkeys…' : 'Continue with passkey'}
			</button>
		</div>
	{/if}

	<p class="flow-card-trust">Securely connected through aven.id</p>
</section>
