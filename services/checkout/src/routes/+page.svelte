<script lang="ts">
import { appRuntime } from 'virtual:aven-app-runtime'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { greetingFor, tierFrom } from '$lib/tiers.js'
import type { NameAvailability } from '$lib/types.js'

const initial = appRuntime.initial.nameSearch(page.url)
let name = $state(initial.name)
let busy = $state(initial.busy)
let result = $state<NameAvailability | null>(initial.result)
let error = $state(initial.error)

/**
 * What the server will actually look up. Typing "Maia Andert!" asks about
 * `maia-andert`, so the field shows one thing and the check is honest about
 * the other — and the line under the input shows which.
 */
const slug = $derived(
	name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32)
)

/**
 * Availability answers while you type, not after you press something.
 *
 * Three things keep that from hammering the endpoint, which allows 30 checks
 * a minute per IP: a 400ms debounce, a guard that skips a slug we already
 * answered, and a sequence number so a slow early reply cannot overwrite a
 * newer one. `settled` starts at whatever the runtime handed us, so a
 * designer scenario is not immediately re-checked out from under itself.
 */
let settled = $state(initial.result ? initial.name : '')
let sequence = 0

$effect(() => {
	const candidate = slug
	if (candidate.length < 3) {
		result = null
		error = ''
		busy = false
		return
	}
	if (candidate === settled) return

	busy = true
	error = ''
	const ticket = ++sequence
	const timer = setTimeout(async () => {
		try {
			const answer = await appRuntime.names.check(candidate)
			if (ticket !== sequence) return
			result = answer
			settled = candidate
		} catch (cause) {
			if (ticket !== sequence) return
			result = null
			error = cause instanceof Error ? cause.message : 'Prüfung fehlgeschlagen.'
		} finally {
			if (ticket === sequence) busy = false
		}
	}, 400)

	return () => clearTimeout(timer)
})

// The tier rides along the whole way: it is how we know which button sent
// someone here, and it is what the hold records.
const tier = $derived(tierFrom(page.url))
const greeting = $derived(greetingFor(tier))

function continueToCheckout() {
	if (!result?.available) return
	const query = new URLSearchParams({ name: result.name })
	if (tier) query.set('tier', tier)
	void goto(`/secure?${query}`)
}
</script>

<svelte:head><title>avenNAME sichern · avenCEO</title></svelte:head>
<section class="flow-card">
	<div class="flow-card-crest">
		<img src="/aven-logo.svg" alt="" width="56" height="56">
	</div>
	<h1 class="flow-card-heading">Sichere dir deinen avenNAME</h1>
	{#if greeting}
		<p class="text text--label">Warteliste · {greeting.name}</p>
		<p class="flow-card-description">{greeting.lead}</p>
	{:else}
		<p class="flow-card-description">
			Wie eine Domain — aber für deinen Aven. Jeden Namen gibt es genau einmal.
		</p>
	{/if}

	<!-- No check button: the answer arrives while you type. Enter goes straight
	     on when the name is free, so the keyboard path still works. -->
	<form
		class="stack"
		onsubmit={(event) => {
			event.preventDefault()
			continueToCheckout()
		}}
	>
		<span class="field field--shape-affixed">
			<label class="field-label" for="claim-name">Dein Name</label>
			<span class="field-shell">
				<input
					class="field-control"
					id="claim-name"
					bind:value={name}
					maxlength="32"
					autocomplete="off"
					autocapitalize="none"
					spellcheck="false"
					placeholder="maia"
				>
				<span class="field-suffix">.aven.ceo</span>
			</span>
			<!-- One line that always holds the answer, so nothing jumps as it changes.
			     The verdict is an ICON plus words, never a bare tick or cross: a
			     dingbat is a font-dependent glyph and reads as decoration. -->
			{#if slug.length === 0}
				<span class="field-hint">Wie eine Domain — dein Name, einmalig vergeben.</span>
			{:else if slug.length < 3}
				<span class="field-hint">Noch {3 - slug.length} Zeichen …</span>
			{:else if busy}
				<span class="field-hint" aria-live="polite">{slug}.aven.ceo wird geprüft …</span>
			{:else if error}
				<span class="field-error" aria-live="polite">{error}</span>
			{:else if result?.available}
				<span class="field-hint" aria-live="polite">
					<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.25 4.25L19 7" /></svg>
					{result.name}.aven.ceo ist frei
				</span>
			{:else if result}
				<span class="field-error" aria-live="polite">
					<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
					{result.name}.aven.ceo ist schon vergeben
				</span>
			{:else}
				<span class="field-hint">{slug}.aven.ceo</span>
			{/if}
		</span>

		{#if result?.available}
			<p class="flow-card-description">{result.priceEur} € einmalig, zzgl. USt.</p>
			<div class="flow-card-actions">
				<button class="btn btn--primary" type="submit">Weiter</button>
			</div>
		{/if}
	</form>
</section>
