<script lang="ts">
import { legalHref, websiteOrigin } from '@myavenceo/aven-ceo'
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { settings, VOICES, type Voice } from '$lib/settings.svelte'
import { voiceController } from '$lib/voice/controller.svelte'
import Account from './Account.svelte'
import Billing from './Billing.svelte'
import Hosting from './Hosting.svelte'

/**
 * Settings — today, one decision: which voice speaks.
 *
 * Ten Supertonic voices, M1–M5 and F1–F5. Selecting applies from the very
 * next spoken sentence (the speaker reads the setting per synthesis call);
 * the play button says a sample sentence in that voice, since a voice can
 * only be chosen by ear.
 */

/** Settings has categories now — one surface per concern, chosen on the left. */
const CATEGORIES = [
	{ id: 'account' as const, label: 'Konto' },
	{ id: 'billing' as const, label: 'Abrechnung' },
	{ id: 'hosting' as const, label: 'Hosting' },
	{ id: 'general' as const, label: 'Models' },
	{ id: 'voice' as const, label: 'Stimme' }
]
// Account opens first: before anything is configured, the question is whose
// app this is.
let category = $state<'account' | 'billing' | 'hosting' | 'general' | 'voice'>('account')

/** The voice currently sounding a preview, if any. */
let playing = $state<Voice | null>(null)
let failure = $state<string | null>(null)

const SAMPLE = 'Hallo, ich bin deine Stimme. Milch und Brot stehen auf der Liste.'

// The website's legal pages: the app has no hostname to derive an
// environment from, so dev pairs with the local website and every build
// with next — flipped to prod in ONE place (the brand lib) when aven.ceo
// goes live. AGB has no brand slug yet; its German URL is spelled here.
const legalEnv = import.meta.env.DEV ? ('local' as const) : ('next' as const)
const LEGAL_LINKS = [
	{ label: 'Impressum', href: legalHref('impressum', { env: legalEnv }) },
	{ label: 'Datenschutz', href: legalHref('datenschutz', { env: legalEnv }) },
	{ label: 'Social-Media-Datenschutz', href: legalHref('social-media', { env: legalEnv }) },
	{ label: 'Widerrufsrecht', href: legalHref('widerruf', { env: legalEnv }) },
	{ label: 'AGB', href: `${websiteOrigin(legalEnv)}/de/agb/` }
]

/** In Tauri the system browser opens it; in plain dev the anchor does. */
async function openLegal(event: MouseEvent, href: string) {
	if (!isTauri()) return
	event.preventDefault()
	await openUrl(href)
}

async function preview(voice: Voice) {
	if (playing) return
	playing = voice
	failure = null
	try {
		await voiceController.previewSpeech(SAMPLE, voice)
	} catch (err) {
		failure = err instanceof Error ? err.message : String(err)
	} finally {
		playing = null
	}
}
</script>

<svelte:head>
	<title>Settings · avenOS</title>
</svelte:head>

<!-- The page is full width; its CONTENT is not. Settings used to run edge to
     edge because the palette page wanted every column it could get. That page
     is gone, and a settings form stretched across a 27-inch display reads as a
     mistake — four words on a row, and two feet of gap after them. -->
<main class="flex min-h-0 min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
	<header class="flex flex-col items-center gap-1.5">
		<!-- The same quiet route stamp the dashboard wears. No Back link: the rail
		     is one exclusive group, so the gear (or any other entry) leaves. -->
		<p class="text text--eyebrow-quiet">Settings</p>
	</header>

	<!-- Phones: the categories become a row above the content instead of a
	     column beside it. -->
	<div class="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
		<!-- The categories: one concern per surface. -->
		<nav class="flex shrink-0 flex-row flex-wrap gap-1 lg:w-44 lg:flex-col">
			{#each CATEGORIES as c (c.id)}
				<button
					type="button"
					onclick={() => {
						category = c.id
					}}
					class="rounded-xl text-left text-sm transition-colors {category === c.id
						? 'border border-foreground/8 bg-surface-raised font-medium'
						: 'opacity-60 hover:opacity-100'}"
				>
					{c.label}
				</button>
			{/each}

			<!-- The legal pages, owed from everywhere the product speaks — tiny,
			     below the concerns, never competing with them. -->
			<div class="mt-4 hidden border-t border-foreground/8 pt-3 lg:block">
				<p
					class="px-3 text-[length:var(--fs-nano)] font-semibold uppercase tracking-[var(--tracking-wider)] opacity-35"
				>
					Rechtliches
				</p>
				<ul class="mt-1.5 space-y-0.5">
					{#each LEGAL_LINKS as link (link.href)}
						<li>
							<a
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								onclick={(event) => openLegal(event, link.href)}
								class="block px-3 py-0.5 text-[length:var(--fs-nano)] leading-relaxed text-foreground/35 transition-colors hover:text-foreground/80"
							>
								{link.label}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</nav>

		<div
			class="mx-auto flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col gap-6 overflow-y-auto pb-4"
		>
			{#if category === 'account'}
				<Account />
			{:else if category === 'billing'}
				<Billing />
			{:else if category === 'hosting'}
				<Hosting />
			{:else if category === 'voice'}
				<section class="flex min-h-0 flex-col gap-3">
					<div class="flex items-baseline justify-between">
						<h2 class="text-sm">Voice</h2>
						<span class="text-xs opacity-40">applies from the next sentence</span>
					</div>

					{#if !isTauri()}
						<p
							class="surface surface--raised text-xs opacity-60"
						>
							The voice only runs in the app — there is nothing to hear in the browser.
						</p>
					{/if}

					<ul class="min-h-0 flex-1 space-y-1 overflow-y-auto">
						{#each VOICES as voice (voice)}
							<li
								class="group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm shadow-[0_1px_3px_rgba(30,41,59,0.05)] transition-colors {settings.voice ===
							voice
								? 'border-primary bg-surface-raised'
								: 'border-foreground/8 bg-surface-raised'}"
							>
								<button
									type="button"
									onclick={() => {
									settings.voice = voice
								}}
									class="flex flex-1 items-center gap-3 text-left"
								>
									<!-- Radio dot, drawn rather than native, so it matches the list. -->
									<span
										class="flex size-4 shrink-0 items-center justify-center rounded-full border {settings.voice ===
									voice
										? 'border-primary'
										: 'border-border'}"
									>
										{#if settings.voice === voice}
											<span class="size-2 rounded-full bg-primary"></span>
										{/if}
									</span>
									<span class="flex-1">
										{voice.startsWith('M') ? 'Male' : 'Female'}
										{voice.slice(1)}
										<span class="pl-1 font-mono text-xs opacity-40">{voice}</span>
									</span>
								</button>

								{#if isTauri()}
									<button
										type="button"
										onclick={() => preview(voice)}
										disabled={playing !== null}
										title="Play"
										aria-label="Play voice {voice}"
										class="shrink-0 rounded-full border border-border p-2 transition-colors hover:bg-primary/8 disabled:opacity-30"
									>
										{#if playing === voice}
											<!-- sounding: a small filled square, same as stop elsewhere -->
											<svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor">
												<rect x="7" y="7" width="10" height="10" rx="1.5" />
											</svg>
										{:else}
											<!-- play -->
											<svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor">
												<path d="M8 5.5v13l11-6.5z" />
											</svg>
										{/if}
									</button>
								{/if}
							</li>
						{/each}
					</ul>

					{#if failure}
						<p
							class="rounded-xl border border-error/25 bg-error-surface text-xs text-error-ink"
						>
							{failure}
						</p>
					{/if}
				</section>
			{:else}
				<!-- The brain, named here rather than in the app chrome: which model answers
			     is configuration, not something to stare at all day. -->
				<section class="flex flex-col gap-3">
					<h2 class="text-sm">Model</h2>
					<p
						class="surface surface--raised font-mono text-xs opacity-70"
					>
						deepseek/deepseek-v4-flash-0731 · RedPill TEE
					</p>
				</section>
			{/if}
		</div>
	</div>
</main>
