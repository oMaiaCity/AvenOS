<script lang="ts">
import { appRuntime } from 'virtual:aven-app-runtime'
import { goto } from '$app/navigation'
import { page } from '$app/state'

const initial = appRuntime.initial.payment(page.url)
let loading = $state(initial.busy)
let error = $state(initial.error)
const params = $derived({
	checkoutId: page.url.searchParams.get('checkoutId') ?? '',
	holdId: page.url.searchParams.get('holdId') ?? '',
	name: page.url.searchParams.get('name') ?? '',
	email: page.url.searchParams.get('email') ?? '',
	successUrl: page.url.searchParams.get('successUrl') ?? ''
})

async function pay() {
	loading = true
	error = ''
	try {
		const result = await appRuntime.billing.pay(params)
		void goto(result.redirect)
	} catch (e) {
		error = e instanceof Error ? e.message : 'Payment failed.'
	} finally {
		loading = false
	}
}
</script>

<svelte:head><title>Checkout</title></svelte:head>

<!-- The same `flow-card` as every other step of this funnel. -->
<section class="flow-card">
	<div class="flow-card-crest">
		<img src="/aven-logo.svg" alt="" width="56" height="56">
	</div>
	<h1 class="flow-card-heading">Checkout</h1>
	<div class="flow-card-code">
		<span class="flow-card-code-label">Kauf für</span>
		<strong class="flow-card-code-value">{params.name}</strong>
	</div>
	<p class="flow-card-description">{params.email}</p>
	{#if error}
		<div class="flow-card-alert">{error}</div>
	{/if}
	<div class="flow-card-actions">
		<button class="btn btn--primary" disabled={loading || !params.holdId} onclick={pay}>
			{loading ? "Processing" : "Pay"}
		</button>
	</div>
</section>
