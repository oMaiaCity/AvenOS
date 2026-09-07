<script lang="ts">
import '../app.css'
import { legalHref } from '@myavenceo/aven-ceo'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { authClient } from '$lib/auth-client.js'

let { children } = $props()
const session = authClient.useSession()
const legal = $derived(
	(
		[
			['impressum', 'Impressum'],
			['datenschutz', 'Datenschutz'],
			['social-media', 'Social-Media-Datenschutz'],
			['widerruf', 'Widerrufsrecht']
		] as const
	).map(([slug, label]) => ({ label, href: legalHref(slug, { hostname: page.url.hostname }) }))
)
async function signOut() {
	await authClient.signOut()
	await goto('/login')
}
</script>

<!--
  The shell: a navbar, the routed body, a footer. This file stays Svelte
  because it IS the app shell and the routing seam — but its chrome is the
  `navbar`, `logo` and `site-footer` actors rather than three hand-named
  classes (`site`, `brand`, `link`) that restated them.
-->
<header class="navbar">
	<div class="navbar-bar">
		<a href="/" class="navbar-brand logo logo--inline">
			<span class="logo-wordmark">
				<span class="logo-word-aven">aven</span><span class="logo-word-ceo">CEO</span>
			</span>
		</a>
		<nav class="navbar-links">
			{#if $session.data}
				<a class="nav-link" href="/dashboard">Account</a>
				<button class="btn btn--ghost" onclick={signOut}>Sign out</button>
			{:else}
				<a class="nav-link" href="/login">Sign in</a>
			{/if}
		</nav>
	</div>
</header>

<main class="section">{@render children()}</main>

<footer class="site-footer site-footer--ground-page site-footer--layout-inline">
	<div class="site-footer-inner">
		{#each legal as item (item.href)}
			<a class="site-footer-link" href={item.href} target="_blank" rel="noopener noreferrer">
				{item.label}
			</a>
		{/each}
	</div>
</footer>
