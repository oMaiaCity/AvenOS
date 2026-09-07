<script lang="ts">
import { page } from '$app/state'
import { designerPages, pageFor } from '$lib/app-runtime/designer-scenarios.js'

const selectedPage = $derived(pageFor(page.url.pathname))
const selectedScenario = $derived(
	selectedPage?.scenarios.find((item) => item.id === page.url.searchParams.get('scenario')) ??
		selectedPage?.scenarios[0]
)

function withSession(href: string): string {
	const target = new URL(href, page.url.origin)
	const session = page.url.searchParams.get('session')
	if (session) target.searchParams.set('session', session)
	return `${target.pathname}${target.search}`
}

function firstScenarioHref(item: (typeof designerPages)[number] | undefined): string {
	const href = item?.scenarios[0]?.href
	return href ? withSession(href) : ''
}

function setSession(value: string) {
	const target = new URL(page.url)
	if (value) target.searchParams.set('session', value)
	else target.searchParams.delete('session')
	window.location.assign(`${target.pathname}${target.search}`)
}

function navigate(href: string) {
	window.location.assign(href)
}
</script>

<!--
  Designer-preview chrome, behind the `designer` build variant. It is not
  product, so it says so — but it is not exempt from the system either: the
  bar is a `surface`, each control is a `field` with a select, and the mock
  marker is a `badge`. The 61-line <style> block this replaces styled a
  floating bar and a pill by hand.
-->
<div id="designer-menu" class="surface surface--variant-lift cluster">
	<p class="text text--label">Designer preview</p>

	<span class="field field--size-sm field--control-select">
		<label class="field-label" for="designer-page">Page</label>
		<span class="field-shell">
			<select
				class="field-control"
				id="designer-page"
				value={firstScenarioHref(selectedPage)}
				onchange={(event) => navigate((event.currentTarget as HTMLSelectElement).value)}
			>
				{#each designerPages as item (item.label)}
					<option value={firstScenarioHref(item)}>{item.label}</option>
				{/each}
			</select>
		</span>
	</span>

	<span class="field field--size-sm field--control-select">
		<label class="field-label" for="designer-state">State</label>
		<span class="field-shell">
			<select
				class="field-control"
				id="designer-state"
				value={selectedScenario ? withSession(selectedScenario.href) : ''}
				onchange={(event) => navigate((event.currentTarget as HTMLSelectElement).value)}
			>
				{#each selectedPage?.scenarios ?? [] as item (item.href)}
					<option value={withSession(item.href)}>{item.label}</option>
				{/each}
			</select>
		</span>
	</span>

	<span class="field field--size-sm field--control-select">
		<label class="field-label" for="designer-session">Session</label>
		<span class="field-shell">
			<select
				class="field-control"
				id="designer-session"
				value={page.url.searchParams.get('session') ?? ''}
				onchange={(event) => setSession((event.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">Page default</option>
				<option value="anonymous">Anonymous</option>
				<option value="authenticated">Authenticated</option>
			</select>
		</span>
	</span>

	<span class="badge badge--tone-warning">Mock data</span>
</div>

<style>
/*
 * One rule, and it is placement: this bar floats above the page it is
 * previewing. Everything else — ground, radius, shadow, the controls — comes
 * from the actors. A bespoke class name would become a utility-scanner
 * candidate, so this is an id.
 */
:global(#designer-menu) {
	position: fixed;
	inset-block-end: var(--space-loose);
	inset-inline: var(--space-loose);
	z-index: 40;
	justify-content: center;
	align-items: end;
}
</style>
