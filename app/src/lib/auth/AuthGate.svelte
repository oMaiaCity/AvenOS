<script lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { onMount, type Snippet } from 'svelte'
import { goto } from '$app/navigation'

interface BeginAuthorization {
	verificationUriComplete: string
	userCode: string
	expiresIn: number
	interval: number
}

interface PollAuthorization {
	status: 'pending' | 'authenticated'
}

interface AuthStatus {
	authenticated: boolean
}

interface BeginPasskeyAuthentication {
	available: boolean
	command: string
	rpId: string
	challenge: number[]
}

interface NativePasskeyAssertion {
	id: string
	raw_id: string
	client_data_json: string
	authenticator_data: string
	signature: string
	user_handle: string
}

const { children }: { children: Snippet } = $props()
let ready = $state(!isTauri())
let busy = $state(isTauri())
let message = $state('Sichere Anmeldung wird vorbereitet …')
let verificationUrl = $state('')
let userCode = $state('')
let pollTimer: ReturnType<typeof setTimeout> | undefined
let mounted = false
const e2e = import.meta.env.VITE_AVEN_E2E === 'true'

async function openInBrowser() {
	if (!verificationUrl) return
	await openUrl(verificationUrl)
	message = 'Schließe die sichere Anmeldung im Browser ab. avenOS kann geöffnet bleiben.'
}

async function finish() {
	if (pollTimer) clearTimeout(pollTimer)
	ready = true
	busy = false
	const search = e2e && window.location.pathname === '/dashboard' ? window.location.search : ''
	await goto(`/dashboard${search}`, { replaceState: true })
}

function schedulePoll(interval: number) {
	pollTimer = setTimeout(async () => {
		if (!mounted) return
		try {
			const result = await invoke<PollAuthorization>('auth_poll')
			if (result.status === 'authenticated') {
				await finish()
				return
			}
			schedulePoll(interval)
		} catch (cause) {
			busy = false
			message = cause instanceof Error ? cause.message : String(cause)
		}
	}, interval * 1000)
}

async function beginWeb() {
	busy = true
	message = 'Browser-Anmeldung wird vorbereitet …'
	verificationUrl = ''
	userCode = ''
	if (pollTimer) clearTimeout(pollTimer)
	try {
		const authorization = await invoke<BeginAuthorization>('auth_begin')
		verificationUrl = authorization.verificationUriComplete
		userCode = authorization.userCode.replace(/(.{4})(?=.)/g, '$1-')
		if (e2e) message = 'Schließe die sichere Anmeldung im Browser ab. avenOS kann geöffnet bleiben.'
		else await openInBrowser()
		schedulePoll(Math.max(authorization.interval, 1))
	} catch (cause) {
		busy = false
		message = cause instanceof Error ? cause.message : String(cause)
	}
}

async function begin() {
	busy = true
	message = 'Dein Aven-Passkey wird gesucht …'
	try {
		const request = await invoke<BeginPasskeyAuthentication>('auth_passkey_begin')
		if (!request.available) {
			await beginWeb()
			return
		}
		message = 'Verwende deinen systemverwalteten Aven-Passkey, um fortzufahren.'
		const assertion = await invoke<NativePasskeyAssertion>(request.command, {
			domain: request.rpId,
			challenge: request.challenge,
			salt: []
		})
		await invoke<AuthStatus>('auth_passkey_finish', { assertion })
		await finish()
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause)
		if (detail.includes('NATIVE_PASSKEY_UNAVAILABLE')) {
			await beginWeb()
			return
		}
		busy = false
		message = detail.startsWith('PASSKEY_DOMAIN_NOT_ASSOCIATED:')
			? 'iOS hat die Passkey-Domain aven.id für diese App noch nicht bestätigt. Das ist kein Fehler deines Passkeys – versuche es erneut oder melde dich vorerst im Browser an.'
			: detail
	}
}

onMount(() => {
	mounted = true
	if (!isTauri()) return
	void (async () => {
		try {
			const status = await invoke<AuthStatus>('auth_status')
			if (status.authenticated) await finish()
			else await begin()
		} catch (cause) {
			busy = false
			message = cause instanceof Error ? cause.message : String(cause)
		}
	})()
	return () => {
		mounted = false
		if (pollTimer) clearTimeout(pollTimer)
	}
})
</script>

{#if ready}
	{@render children()}
{:else}
	<main class="fixed inset-0 overflow-hidden bg-surface-sunken text-foreground">
		<div
			class="-right-32 -top-40 pointer-events-none absolute size-[34rem] rounded-full bg-progress/15 blur-3xl"
		></div>
		<div
			class="-bottom-48 -left-32 pointer-events-none absolute size-[32rem] rounded-full bg-info/15 blur-3xl"
		></div>

		<header class="absolute inset-x-0 top-0 flex items-center justify-between px-8 py-7">
			<p class="avenos-wordmark !text-[length:var(--fs-display)] text-primary">
				<span class="wm-aven">aven</span><span class="wm-os">OS</span>
			</p>
			<div class="flex items-center gap-2 text-foreground/50 text-xs">
				<svg
					viewBox="0 0 24 24"
					class="size-3.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
				>
					<rect x="5" y="10" width="14" height="10" rx="2" />
					<path d="M8 10V7a4 4 0 0 1 8 0v3" />
				</svg>
				<span>aven.id</span>
			</div>
		</header>

		<div class="relative grid min-h-dvh place-items-center px-6 py-24">
			<!-- The `flow-card` actor. This is the fourth screen of its shape in the
			     estate: avenID's device authorisation, portal.aven.ceo's name check and
			     its passkey sign-in are the three its description names, and the
			     desktop app's own sign-in gate is the same crest / eyebrow /
			     heading / description / code / actions card. -->
			<section class="flow-card" aria-live="polite">
				<div class="flow-card-crest">
					{#if busy}
						<svg viewBox="0 0 24 24" width="1.75rem" height="1.75rem" fill="none" class="animate-spin">
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="1.8" />
							<path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" width="1.75rem" height="1.75rem" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6">
							<path d="M14.5 5.5a4.5 4.5 0 1 0-3.2 7.7L14 16h2v2h2v2h3v-3l-6.3-6.3" />
							<circle cx="10" cy="10" r=".7" fill="currentColor" stroke="none" />
						</svg>
					{/if}
				</div>

				<p class="flow-card-eyebrow">
					{verificationUrl ? 'Browser-Anmeldung' : 'Sicherer Zugang'}
				</p>
				<h1 class="flow-card-heading">
					{verificationUrl ? 'Im Browser fortfahren' : 'Willkommen bei avenOS'}
				</h1>
				<p class="flow-card-description">{message}</p>

				{#if userCode}
					<p class="text text--label">Gerätecode</p>
					<div class="flow-card-code">{userCode}</div>
				{/if}

				<div class="flow-card-actions stack">
					{#if verificationUrl}
						<button class="btn btn--primary" type="button" onclick={openInBrowser}>
							Sichere Anmeldung öffnen
						</button>
					{/if}
					{#if !busy}
						<button class="btn btn--secondary" type="button" onclick={begin}>
							Erneut versuchen
						</button>
						{#if !verificationUrl}
							<button class="btn btn--ghost" type="button" onclick={beginWeb}>
								Stattdessen im Browser anmelden
							</button>
						{/if}
					{/if}
				</div>

				<p class="flow-card-trust">
					Passkey und Sitzung bleiben durch dein Gerät geschützt
				</p>
			</section>
		</div>
	</main>
{/if}
