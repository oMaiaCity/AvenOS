<script lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core'
import { onMount } from 'svelte'

interface Site {
	id: string
	hostname: string
	repository: string
	sourceBranch: string
	deploymentBranch: string
	status: 'awaiting_dns' | 'syncing' | 'active' | 'dns_invalid' | 'failed'
	activeArtifactRevision: string | null
	lastError: string | null
	lastSyncedAt: string | null
	systemManaged: boolean
}

interface Draft {
	hostname: string
	repository: string
	sourceBranch: string
	deploymentBranch: string
}

interface DnsInstructions {
	txtName: string
	txtValue: string
	hostname: string
	ipv4: string | null
	ipv6: string[]
}

const emptyDraft = (): Draft => ({
	hostname: '',
	repository: '',
	sourceBranch: 'main',
	deploymentBranch: 'deploy/main'
})

let sites = $state<Site[]>([])
let draft = $state<Draft>(emptyDraft())
let editing = $state<string | null>(null)
let dns = $state<DnsInstructions | null>(null)
let loading = $state(isTauri())
let saving = $state(false)
let failure = $state<string | null>(null)

async function refresh() {
	const result = await invoke<{ sites?: Site[] }>('hosting_list')
	sites = Array.isArray(result.sites) ? result.sites : []
}

onMount(async () => {
	if (!isTauri()) return
	try {
		await refresh()
	} catch (cause) {
		failure = cause instanceof Error ? cause.message : String(cause)
	} finally {
		loading = false
	}
})

function edit(site: Site) {
	editing = site.id
	dns = null
	failure = null
	draft = {
		hostname: site.hostname,
		repository: site.repository,
		sourceBranch: site.sourceBranch,
		deploymentBranch: site.deploymentBranch
	}
}

function reset() {
	editing = null
	dns = null
	draft = emptyDraft()
}

async function save(event: SubmitEvent) {
	event.preventDefault()
	saving = true
	failure = null
	dns = null
	try {
		const result = editing
			? await invoke<{ site: Site; dns: DnsInstructions }>('hosting_update', {
					siteId: editing,
					input: draft
				})
			: await invoke<{ site: Site; dns: DnsInstructions }>('hosting_create', { input: draft })
		dns = result.dns
		editing = null
		draft = emptyDraft()
		await refresh()
	} catch (cause) {
		failure = cause instanceof Error ? cause.message : String(cause)
	} finally {
		saving = false
	}
}

async function remove(site: Site) {
	if (site.systemManaged || !confirm(`Hosting für ${site.hostname} wirklich entfernen?`)) return
	saving = true
	failure = null
	try {
		await invoke('hosting_remove', { siteId: site.id })
		if (editing === site.id) reset()
		await refresh()
	} catch (cause) {
		failure = cause instanceof Error ? cause.message : String(cause)
	} finally {
		saving = false
	}
}

const statusLabel: Record<Site['status'], string> = {
	awaiting_dns: 'DNS ausstehend',
	syncing: 'wird synchronisiert',
	active: 'aktiv',
	dns_invalid: 'DNS ungültig',
	failed: 'fehlgeschlagen'
}
</script>

<section class="flex flex-col gap-5">
	<div class="flex flex-col gap-1">
		<h2 class="text-sm">Static Hosting</h2>
		<p class="text-xs leading-relaxed opacity-55">
			Eine Domain zeigt auf genau einen öffentlichen GitHub-Build. Anmeldung und Berechtigungen
			kommen ausschließlich von aven.id.
		</p>
	</div>

	{#if !isTauri()}
		<p
			class="surface surface--raised text-xs opacity-60"
		>
			Hosting wird nur in der installierten aven.ceo App verwaltet.
		</p>
	{:else if loading}
		<p class="text-xs opacity-50">Sites werden geladen …</p>
	{:else}
		{#if sites.length}
			<ul class="flex flex-col gap-2">
				{#each sites as site (site.id)}
					<li
						class="flex flex-col gap-3 surface surface--raised"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="truncate font-mono text-sm">{site.hostname}</p>
								<p class="truncate text-xs opacity-45">
									{site.repository}
									· {site.deploymentBranch}
								</p>
							</div>
							<span
								class="shrink-0 rounded-full border border-foreground/8 text-[length:var(--fs-nano)] opacity-60"
							>
								{statusLabel[site.status]}
							</span>
						</div>
						{#if site.lastError}
							<p class="text-xs text-error-ink">{site.lastError}</p>
						{/if}
						{#if site.systemManaged}
							<p class="text-xs opacity-45">Von der aven.ceo Infrastruktur verwaltet.</p>
						{:else}
							<div class="flex gap-2">
								<button
									type="button"
									disabled={saving}
									onclick={() => edit(site)}
									class="rounded-lg border border-foreground/10 text-xs hover:bg-primary/8 disabled:opacity-40"
								>
									Bearbeiten
								</button>
								<button
									type="button"
									disabled={saving}
									onclick={() => remove(site)}
									class="rounded-lg border border-error/20 px-3 py-1.5 text-xs text-error-ink hover:bg-error-surface disabled:opacity-40"
								>
									Entfernen
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<form
			onsubmit={save}
			class="flex flex-col gap-3 surface surface--raised"
		>
			<div class="flex items-center justify-between gap-3">
				<p class="text-sm">{editing ? 'Site bearbeiten' : 'Site hinzufügen'}</p>
				{#if editing}
					<button type="button" onclick={reset} class="text-xs opacity-50 hover:opacity-100">
						Abbrechen
					</button>
				{/if}
			</div>
			<label class="flex flex-col gap-1 text-xs">
				<span class="opacity-50">Domain</span>
				<input
					required
					bind:value={draft.hostname}
					placeholder="www.example.com"
					class="rounded-lg border border-foreground/10 bg-transparent px-3 py-2 outline-none focus:border-primary"
				>
			</label>
			<label class="flex flex-col gap-1 text-xs">
				<span class="opacity-50">GitHub Repository</span>
				<input
					required
					bind:value={draft.repository}
					placeholder="owner/repository"
					class="rounded-lg border border-foreground/10 bg-transparent px-3 py-2 outline-none focus:border-primary"
				>
			</label>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="flex flex-col gap-1 text-xs">
					<span class="opacity-50">Quellbranch</span>
					<input
						required
						bind:value={draft.sourceBranch}
						class="rounded-lg border border-foreground/10 bg-transparent px-3 py-2 font-mono outline-none focus:border-primary"
					>
				</label>
				<label class="flex flex-col gap-1 text-xs">
					<span class="opacity-50">Deployment-Branch</span>
					<input
						required
						bind:value={draft.deploymentBranch}
						class="rounded-lg border border-foreground/10 bg-transparent px-3 py-2 font-mono outline-none focus:border-primary"
					>
				</label>
			</div>
			<button
				type="submit"
				disabled={saving}
				class="self-start rounded-lg bg-primary text-xs text-white disabled:opacity-40"
			>
				{saving ? 'Wird gespeichert …' : editing ? 'Änderung speichern' : 'Site hinzufügen'}
			</button>
		</form>

		{#if dns}
			<div
				class="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 text-xs"
			>
				<p class="font-medium">DNS jetzt einrichten</p>
				<p>TXT <code>{dns.txtName}</code> = <code>{dns.txtValue}</code></p>
				{#if dns.ipv4}
					<p>A <code>{dns.hostname}</code> = <code>{dns.ipv4}</code></p>
				{/if}
				{#each dns.ipv6 as address (address)}
					<p>AAAA <code>{dns.hostname}</code> = <code>{address}</code></p>
				{/each}
				<p class="opacity-50">Der TXT-Wert wird nur einmal angezeigt.</p>
			</div>
		{/if}
	{/if}

	{#if failure}
		<p class="rounded-xl border border-error/25 bg-error-surface px-4 py-3 text-xs text-error-ink">
			{failure}
		</p>
	{/if}
</section>
