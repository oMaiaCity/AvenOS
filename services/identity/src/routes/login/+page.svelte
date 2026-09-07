<script lang="ts">
import { goto } from '$app/navigation'
import { authClient } from '$lib/auth-client.js'

let busy = $state(false)
let message = $state('')
async function login() {
	busy = true
	message = ''
	try {
		const result = await authClient.signIn.passkey()
		if (result?.error) throw new Error(result.error.message ?? 'Sign-in failed.')
		await goto('/dashboard')
	} catch (error) {
		message = error instanceof Error ? error.message : 'Sign-in failed.'
	} finally {
		busy = false
	}
}
</script>
<svelte:head><title>Sign in · aven.id</title></svelte:head>
<section class="flow-card">
	<div class="flow-card-crest">
		<img src="/aven-logo.svg" alt="" width="56" height="56">
	</div>
	<h1 class="flow-card-heading">Sign in</h1>
	<p class="flow-card-description">Use a passkey registered to your Aven account.</p>
	{#if message}
		<div class="flow-card-alert" role="alert">{message}</div>
	{/if}
	<div class="flow-card-actions">
		<button class="btn btn--primary" disabled={busy} onclick={login}>
			{busy ? 'Opening passkeys…' : 'Continue with passkey'}
		</button>
	</div>
</section>
