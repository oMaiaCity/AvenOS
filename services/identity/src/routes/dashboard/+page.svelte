<script lang="ts">
import { onMount } from 'svelte'
import { goto } from '$app/navigation'
import { authClient } from '$lib/auth-client.js'
import { defaultPasskeyName, passkeyNameSchema } from '$lib/passkey-name.js'
import type { PasskeySummary } from '$lib/types.js'

const session = authClient.useSession()
let passkeys = $state<PasskeySummary[]>([])
let requirePrf = $state(false)
let busy = $state(false)
let error = $state('')
let notice = $state('')
let newName = $state('')
let nameSuggested = $state(false)
let editingId = $state<string | null>(null)
let editedName = $state('')
let saving = $state(false)
$effect(() => {
	if ($session.data?.user.email && !nameSuggested) {
		newName = defaultPasskeyName($session.data.user.email, navigator.userAgent)
		nameSuggested = true
	}
})

async function renamePasskey(event: SubmitEvent) {
	event.preventDefault()
	const parsed = passkeyNameSchema.safeParse(editedName)
	if (!editingId || !parsed.success) return
	saving = true
	error = ''
	try {
		// Reuse the identity plugin's authenticated, ownership-checked endpoint.
		const result = await authClient.passkey.updatePasskey({ id: editingId, name: parsed.data })
		if (result.error) throw new Error(result.error.message ?? 'Could not rename the passkey.')
		await load()
		editingId = null
	} catch (cause) {
		error = cause instanceof Error ? cause.message : 'Could not rename the passkey.'
	} finally {
		saving = false
	}
}
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
	const parsed = passkeyNameSchema.safeParse(newName)
	if (!parsed.success) {
		error = 'Give your passkey a name between 1 and 128 characters.'
		return
	}
	busy = true
	error = ''
	try {
		const result = await authClient.passkey.addPasskey({
			name: parsed.data,
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
					<div>
						<div class="row-list-name">
							{passkey.name || 'Passkey'}{passkey.backed_up ? ' — synced' : ''}
						</div>
						<div class="row-list-meta">{new Date(passkey.created_at).toLocaleDateString()}</div>
					</div>
					<button
						class="btn row-list-action"
						disabled={busy || saving}
						aria-label={`Rename ${passkey.name || 'Passkey'}`}
						onclick={() => { editingId = passkey.id; editedName = passkey.name || '' }}
					>
						Rename
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="empty-state">
			<p class="empty-state-title">No passkey yet</p>
			<p class="empty-state-body">Add one and this device can sign you in without a password.</p>
		</div>
	{/if}
	{#if editingId}
		<form class="field" onsubmit={renamePasskey} aria-label="Rename passkey">
			<label class="field-label" for="rename-passkey">Passkey name</label>
			<div class="field-shell">
				<input
					class="field-control"
					id="rename-passkey"
					bind:value={editedName}
					required
					maxlength="128"
					disabled={saving}
				>
			</div>
			<div class="flow-card-actions">
				<button
					class="btn btn--primary"
					type="submit"
					disabled={saving || !passkeyNameSchema.safeParse(editedName).success}
				>
					{saving ? 'Saving…' : 'Save name'}
				</button>
				<button class="btn" type="button" disabled={saving} onclick={() => { editingId = null }}>
					Cancel
				</button>
			</div>
		</form>
	{/if}
	<div class="field">
		<label class="field-label" for="new-passkey-name">Name for your new passkey</label>
		<div class="field-shell">
			<input
				class="field-control"
				id="new-passkey-name"
				bind:value={newName}
				oninput={() => { nameSuggested = true }}
				maxlength="128"
				disabled={busy || saving}
			>
		</div>
		<p class="field-hint">
			Choose the name before continuing. We send it to your phone or password manager when you
			create the passkey. Renaming it here afterward only changes this account list.
		</p>
	</div>
	<div class="flow-card-actions">
		<button
			class="btn btn--primary"
			disabled={busy || saving || Boolean(notice) || !passkeyNameSchema.safeParse(newName).success}
			onclick={addPasskey}
		>
			{busy ? 'Adding…' : passkeys.length ? 'Add another passkey' : 'Add passkey'}
		</button>
		{#if !passkeys.length && !notice}
			<button class="btn" disabled={busy} onclick={resendSetup}>
				Email a replacement setup link
			</button>
		{/if}
	</div>
</section>
