<script lang="ts">
import { goto } from '$app/navigation'
import { authClient } from '$lib/auth-client.js'

const session = authClient.useSession()
$effect(() => {
	if ($session.data) void goto('/dashboard')
})
</script>
<svelte:head><title>Aven Identity</title></svelte:head>
<section class="flow-card">
	<div class="flow-card-crest">
		<img src="/aven-logo.svg" alt="" width="56" height="56">
	</div>
	<h1 class="flow-card-heading">One small, secure identity.</h1>
	<p class="flow-card-description">
		Passkey-only sign-in and short-lived authorization for Aven services.
	</p>
	<div class="flow-card-actions">
		<a class="btn btn--primary" href="/login">Sign in</a>
	</div>
</section>
