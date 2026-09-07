<script lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core'
import { onMount } from 'svelte'

/**
 * Account — who is signed in, and which aven is theirs.
 *
 * The app never said whose session it was running under. On a machine with
 * more than one avenNAME that is a real question, and the honest answer needs
 * both halves: the person (name, mail) and the aven they reserved.
 *
 * Everything here is read-only. Changing a mail address or releasing a name
 * is an identity operation and belongs to the id service, not to a settings
 * pane that could quietly diverge from it.
 */

interface AuthUser {
	id: string
	name: string
	email: string
}

interface AuthStatus {
	authenticated: boolean
	user: AuthUser | null
}

let user = $state<AuthUser | null>(null)
let names = $state<string[]>([])
let signedIn = $state(false)
let failure = $state<string | null>(null)
let loading = $state(isTauri())

/** "Samuel Andert" → "Samuel". A greeting uses the first name, not the record. */
const firstName = $derived(user?.name?.trim().split(/\s+/)[0] ?? '')

onMount(async () => {
	if (!isTauri()) return
	try {
		const status = await invoke<AuthStatus>('auth_status')
		signedIn = status.authenticated
		user = status.user
		// Only ask for names once a session exists — without one the command
		// fails by design, and an error here would read as something broken.
		if (status.authenticated) names = await invoke<string[]>('auth_names')
	} catch (cause) {
		failure = cause instanceof Error ? cause.message : String(cause)
	} finally {
		loading = false
	}
})
</script>

<!--
  Settings screens are `surface` panels holding `row-list` rows and `avatar`.
  Every box here spelled the same five utilities by hand — a rounded border, a
  raised ground and a shadow — which is one `surface` with a variant.
-->
<section class="stack">
	<h2 class="text text--label">Account</h2>
	{#if !isTauri()}
		<p class="surface surface--sunken text text--meta">
			Die Anmeldung gibt es nur in der App — im Browser ist keine Sitzung zu zeigen.
		</p>
	{:else if loading}
		<p class="surface surface--sunken text text--meta">Deine Sitzung wird gelesen …</p>
	{:else if !signedIn}
		<p class="surface surface--sunken text text--meta">Du bist gerade nicht angemeldet.</p>
	{:else}
		<div class="surface surface--raised stack">
			<div class="cluster">
				<!-- Initials rather than an avatar: we have no picture, and a generic
				     silhouette says less than the two letters of an actual name. -->
				<span class="avatar">
					<span class="avatar-initials">
						{(user?.name || user?.email || '?').slice(0, 2).toUpperCase()}
					</span>
				</span>
				<div class="stack">
					<p class="text text--title">{user?.name || 'Ohne Namen'}</p>
					<p class="text text--meta">{user?.email}</p>
				</div>
			</div>
			<!-- Label-and-value pairs are `setting-row`, not `row-list` rows with an
			     empty lead column: row-list's grid is `auto 1fr auto` and wants a
			     real fixed leading item. -->
			{#if firstName}
				<div class="setting-row">
					<span class="setting-row-copy"><p class="setting-row-label">Vorname</p></span>
					<span class="setting-row-control">{firstName}</span>
				</div>
			{/if}
			<div class="setting-row">
				<span class="setting-row-copy"><p class="setting-row-label">E-Mail</p></span>
				<span class="setting-row-control">{user?.email}</span>
			</div>
			<div class="setting-row">
				<span class="setting-row-copy"><p class="setting-row-label">Konto-ID</p></span>
				<span class="setting-row-control text text--mono-meta">{user?.id}</span>
			</div>
		</div>
		<div class="surface surface--raised stack">
			<p class="text text--eyebrow">{names.length > 1 ? 'Deine Aven' : 'Dein Aven'}</p>
			{#if names.length}
				<ul class="stack">
					{#each names as name (name)}
						<li class="text text--mono-meta">{name}.aven.ceo</li>
					{/each}
				</ul>
			{:else}
				<p class="text text--meta">Für dieses Konto ist noch kein Name reserviert.</p>
			{/if}
		</div>
	{/if}
	{#if failure}
		<p class="flow-card-alert">{failure}</p>
	{/if}
</section>
