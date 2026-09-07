<script lang="ts">
import { onMount } from 'svelte'
import { goto } from '$app/navigation'
import { authClient } from '$lib/auth-client.js'
import type { PasskeySummary } from '$lib/types.js'

const session = authClient.useSession()
let passkeys = $state<PasskeySummary[]>([])
let requirePrf = $state(false)
let busy = $state(false)
let error = $state('')
let notice = $state('')
async function resendSetup() {
	busy = true
	error = ''
	try {
		const response = await fetch('/api/setup/resend', {
			method: 'POST',
			credentials: 'same-origin'
		})
		if (!response.ok)
			throw new Error('Could not send a replacement link. Wait one minute and try again.')
		notice =
			'A replacement link is queued for your email. Open it to continue; the previous link and setup sessions are now invalid.'
	} catch (cause) {
		error = cause instanceof Error ? cause.message : 'Could not replace the link.'
	} finally {
		busy = false
	}
}
async function load() {
	const response = await fetch('/api/passkeys', { credentials: 'same-origin' })
	if (response.status === 401) {
		await goto('/login')
		return
	}
	if (!response.ok) throw new Error('Could not load passkeys.')
	const result = (await response.json()) as { passkeys: PasskeySummary[]; requirePrf: boolean }
	passkeys = result.passkeys
	requirePrf = result.requirePrf
}
onMount(() => {
	void load().catch((cause) => {
		error = cause instanceof Error ? cause.message : 'Could not load passkeys.'
	})
})
async function addPasskey() {
	busy = true
	error = ''
	try {
		const result = await authClient.passkey.addPasskey({
			name: `Passkey ${passkeys.length + 1}`,
			returnWebAuthnResponse: true,
			...(requirePrf ? { extensions: { prf: {} } as never } : {})
		})
		if (result?.error) throw new Error(result.error.message ?? 'Passkey registration failed.')
		if (!passkeys.length) {
			// Enrollment revokes every setup session. Authenticate the new passkey before ordinary access.
			const signedIn = await authClient.signIn.passkey()
			if (signedIn?.error) throw new Error('Passkey saved. Sign in with it to continue.')
		}
		const extension = ('webauthn' in result ? result.webauthn.clientExtensionResults : undefined) as
			| { prf?: { enabled?: boolean } }
			| undefined
		const response = await fetch('/api/passkeys', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				credentialId: result.data?.credentialID,
				prfEnabled: extension?.prf?.enabled === true
			})
		})
		if (!response.ok)
			throw new Error(
				((await response.json()) as { message?: string }).message ??
					'Could not finalize passkey registration.'
			)
		await load()
	} catch (cause) {
		error = cause instanceof Error ? cause.message : 'Passkey registration failed.'
	} finally {
		busy = false
	}
}
</script>
<svelte:head><title>Your account · aven.id</title></svelte:head>
<section class="flow-card">
	<div class="flow-card-crest">
		<img src="/aven-logo.svg" alt="" width="56" height="56">
	</div>
	<h1 class="flow-card-heading">Your account</h1>
	<p class="flow-card-description">{$session.data?.user.email ?? 'Loading…'}</p>

	<p class="text text--label">Passkeys</p>
	{#if notice}
		<p role="status">{notice}</p>
	{/if}
	{#if error}
		<div class="flow-card-alert" role="alert">{error}</div>
	{/if}
	{#if passkeys.length}
		<!-- `row-list`: a fixed lead column, a name that shrinks, something on the
		     trailing edge. That is what the hand-rolled `.passkeys` list was. -->
		<ul class="row-list row-list--style-panel row-list--density-roomy" aria-label="Passkeys">
			{#each passkeys as passkey (passkey.id)}
				<li class="row-list-row">
					<span class="row-list-lead" aria-hidden="true">
						<svg
							viewBox="0 0 24 24"
							width="1em"
							height="1em"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m5 12.5 4.25 4.25L19 7" />
						</svg>
					</span>
					<span class="row-list-name">
						{passkey.name || 'Passkey'}{passkey.backed_up ? ' — synced' : ''}
					</span>
					<span class="row-list-meta">{new Date(passkey.created_at).toLocaleDateString()}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="empty-state">
			<p class="empty-state-title">No passkey yet</p>
			<p class="empty-state-body">Add one and this device can sign you in without a password.</p>
		</div>
	{/if}
	<div class="flow-card-actions">
		<button class="btn btn--primary" disabled={busy || Boolean(notice)} onclick={addPasskey}>
			{busy ? 'Adding…' : passkeys.length ? 'Add another passkey' : 'Add passkey'}
		</button>
		{#if !passkeys.length && !notice}
			<button class="btn" disabled={busy} onclick={resendSetup}>
				Email a replacement setup link
			</button>
		{/if}
	</div>
</section>
