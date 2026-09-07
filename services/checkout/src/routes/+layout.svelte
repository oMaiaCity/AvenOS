<script lang="ts">
import '../app.css'
import { legalHref } from '@myavenceo/aven-ceo'
import { page } from '$app/state'

let { children } = $props()
const legal = $derived(
	(
		[
			['impressum', 'Impressum'],
			['datenschutz', 'Datenschutz'],
			['widerruf', 'Widerrufsrecht']
		] as const
	).map(([slug, label]) => ({ label, href: legalHref(slug, { hostname: page.url.hostname }) }))
)
</script>
<!--
  The shell: navbar, routed body, footer. Svelte because it IS the shell and
  the routing seam — its chrome is the navbar, logo and site-footer actors.
-->
<header class="navbar">
	<div class="navbar-bar">
		<a href="/" class="navbar-brand logo logo--inline">
			<span class="logo-wordmark">
				<span class="logo-word-aven">aven</span><span class="logo-word-ceo">CEO</span>
			</span>
		</a>
		<nav class="navbar-links">
			<a class="nav-link" href="https://aven.id/login">Account</a>
		</nav>
	</div>
</header>

<main class="section">{@render children()}</main>

<footer class="site-footer site-footer--ground-page">
	<div class="site-footer-inner">
		<div class="site-footer-groups">
			<div class="site-footer-group">
				<p class="site-footer-group-title">Legal</p>
				{#each legal as item (item.href)}
					<a class="site-footer-link" href={item.href} target="_blank" rel="noopener noreferrer">
						{item.label}
					</a>
				{/each}
			</div>
		</div>
	</div>
</footer>
