<script lang="ts">
import { page } from '$app/state'

const name = $derived(page.url.searchParams.get('name') ?? '')
</script>

<svelte:head><title>Payment complete</title></svelte:head>

<!-- The `flow-card` actor, in its success state: crest, heading, description,
     the subject of the screen as a code, and the trust line. The step rail
     shows both stages complete. -->
<section class="flow-card flow-card--status-success">
	<div class="flow-card-crest">
		<img src="/aven-logo.svg" alt="" width="56" height="56">
	</div>
	<h1 class="flow-card-heading">Zahlung abgeschlossen</h1>
	<p class="flow-card-description">Danke — der Kauf ist bei uns angekommen.</p>
	{#if name}
		<p class="text text--label">Gekaufter Name</p>
		<div class="flow-card-code">{name}</div>
	{/if}
	<div class="steps" aria-hidden="true">
		<span class="step" aria-selected="true"></span>
		<span class="step" aria-selected="true"></span>
	</div>
	<p class="flow-card-trust">
		Sieh in deinem Postfach nach — aven.id sendet dir den sicheren Link zu deinem neuen Konto.
	</p>
</section>
