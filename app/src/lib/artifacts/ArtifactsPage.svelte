<script lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core'
import { onMount } from 'svelte'
import ArtifactCard from './ArtifactCard.svelte'
import ArtifactContentViewer from './ArtifactContentViewer.svelte'
import ArtifactSemanticViewer from './ArtifactSemanticViewer.svelte'
import {
	artifactBranchIds,
	artifactRoots,
	artifactSubtree,
	artifactTreeRows,
	type BrowsedArtifact
} from './artifact-tree'
import type { ArtifactEvidence, EvidenceResource } from './artifact-view'
import { artifactTypeLabel } from './processing'

/**
 * THE ARTIFACT STORE — the only place files live.
 *
 * There used to be two: this, and a "local downloads" shelf that listed a
 * folder on disk. The shelf held whatever the billing pane had written there,
 * knew nothing about intents, skills, provenance or processing, and could not
 * be navigated into — a dead end that happened to render a PDF. It is gone,
 * along with the two Tauri commands that existed only to read it; the invoice
 * now enters through the same ingest as a dropped file.
 *
 * The layout is a 50/50: every uploaded file as a tile on the left, and on the
 * right either the file itself at full size (the default — you almost always
 * want to look at the document) or its lineage, scoped to that one file.
 */

interface BrowseResult {
	storeEpoch: string
	artifacts: BrowsedArtifact[]
	truncated: boolean
}

interface ArtifactContent {
	mediaType: string
	base64: string
}

const FIXTURE_ID = '33333333-3333-4333-8333-333333333333'
const FIXTURE_CHILD_ID = '55555555-5555-4555-8555-555555555555'
/** Which uploaded file the grid has selected — the subject of the whole pane. */
let rootId = $state<string | null>(null)
/** The document, or where it came from. The document, by default. */
let pane = $state<'file' | 'lineage'>('file')
let result = $state<BrowseResult | null>(null)
let loading = $state(true)
let failure = $state<string | null>(null)
let query = $state('')
let selectedId = $state<string | null>(null)
let envelope = $state<Record<string, unknown> | null>(null)
let envelopeLoading = $state(false)
let envelopeFailure = $state<string | null>(null)
let content = $state<ArtifactContent | null>(null)
let contentLoading = $state(false)
let contentFailure = $state<string | null>(null)
let evidence = $state<ArtifactEvidence[]>([])
let evidenceLoading = $state(false)
let evidenceFailure = $state<string | null>(null)
let activeEvidence = $state<ArtifactEvidence | null>(null)
let sourceContent = $state<ArtifactContent | null>(null)
let sourceLoading = $state(false)
let sourceFailure = $state<string | null>(null)
let viewMode = $state<'view' | 'raw'>('view')
let collapsedIds = $state<Set<string>>(new Set())

/**
 * Envelope facts for the tiles — name, media type, size — keyed by artifact id.
 *
 * The browse response carries lineage, not payloads, so a tile would otherwise
 * have nothing to show but a type key. Fetched once per root after a refresh
 * rather than per tile, so opening the surface is one burst of small reads and
 * scrolling costs nothing.
 */
interface RootFacts {
	mediaType: string
	title: string
	badge: string
	sizeBytes: number | null
}
let rootFacts = $state<Record<string, RootFacts>>({})

function factsFor(artifact: BrowsedArtifact): RootFacts {
	return (
		rootFacts[artifact.artifactId] ?? {
			mediaType: '',
			title: artifactTypeLabel(artifact.typeKey),
			badge: 'DATEI',
			sizeBytes: null
		}
	)
}

/** `rechnung-ord_abc123.pdf` reads as `Rechnung abc123` — the shelf's touch, kept. */
function prettyName(fileName: string): string {
	const stem = fileName.replace(/\.[^.]+$/, '')
	const invoice = stem.match(/^rechnung-(.+)$/)
	if (invoice) return `Rechnung ${invoice[1].replace(/^ord_/, '').slice(0, 8)}`
	return stem
}

function badgeFor(mediaType: string, fileName: string): string {
	const dot = fileName.lastIndexOf('.')
	if (dot > 0) return fileName.slice(dot + 1).toUpperCase()
	if (mediaType.includes('/')) return mediaType.split('/')[1].toUpperCase()
	return 'DATEI'
}

async function loadRootFacts(artifacts: readonly BrowsedArtifact[]): Promise<void> {
	if (!isTauri()) return
	const entries = await Promise.all(
		artifacts.map(async (artifact) => {
			try {
				const loaded = await invoke<Record<string, unknown>>('artifact_get', {
					artifactId: artifact.artifactId
				})
				const payload = (loaded.payload ?? {}) as Record<string, unknown>
				const blob = (loaded.blob ?? null) as { length?: number } | null
				const fileName =
					typeof payload.originalName === 'string' ? payload.originalName : artifact.localKey
				const mediaType =
					typeof payload.declaredMediaType === 'string' ? payload.declaredMediaType : ''
				return [
					artifact.artifactId,
					{
						mediaType,
						title: prettyName(fileName),
						badge: badgeFor(mediaType, fileName),
						sizeBytes: typeof blob?.length === 'number' ? blob.length : null
					}
				] as const
			} catch {
				return null
			}
		})
	)
	const next: Record<string, RootFacts> = {}
	for (const entry of entries) if (entry) next[entry[0]] = entry[1]
	rootFacts = next
}

/** Pick a file: it becomes the subject of both panes, lineage included. */
async function selectRoot(artifactId: string): Promise<void> {
	rootId = artifactId
	collapsedIds = new Set()
	await selectArtifact(artifactId)
}

/** The uploaded documents: roots that actually carry bytes worth showing. */
const roots = $derived(artifactRoots(result?.artifacts ?? []))
const rootArtifact = $derived(roots.find((artifact) => artifact.artifactId === rootId) ?? null)
/** Lineage is scoped to the selected file — not every artifact in the store. */
const subtree = $derived(artifactSubtree(result?.artifacts ?? [], rootId))
const treeRows = $derived(artifactTreeRows(subtree, collapsedIds, query))
const branchCount = $derived(artifactBranchIds(subtree).size)
const selected = $derived(result?.artifacts.find((artifact) => artifact.artifactId === selectedId))
const envelopeJson = $derived(envelope ? JSON.stringify(envelope, null, 2) : '')

/** What the tile and the header call a file, read off its envelope payload. */
function payloadOf(artifact: BrowsedArtifact | null): Record<string, unknown> {
	if (!artifact || artifact.artifactId !== selectedId) return {}
	const payload = envelope?.payload
	return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function toggleBranch(artifactId: string): void {
	const next = new Set(collapsedIds)
	if (next.has(artifactId)) next.delete(artifactId)
	else next.add(artifactId)
	collapsedIds = next
}

function collapseAll(): void {
	collapsedIds = artifactBranchIds(result?.artifacts ?? [])
}

function expandAll(): void {
	collapsedIds = new Set()
}

function outputLabel(output: unknown): string {
	if (!output || typeof output !== 'object') return '—'
	const binding = output as { role?: unknown; ordinal?: unknown }
	if (typeof binding.role !== 'string') return '—'
	return `${binding.role}:${typeof binding.ordinal === 'number' ? binding.ordinal : 0}`
}

function shortId(value: string | null): string {
	return value ? value.slice(0, 8) : '—'
}

async function refresh(): Promise<void> {
	loading = true
	failure = null
	try {
		if (isTauri()) {
			const loaded = await invoke<BrowseResult>('artifact_store_list')
			result = {
				...loaded,
				// Keep the client usable during a rolling API deployment from the
				// original flat browser response to the lineage-aware response.
				artifacts: loaded.artifacts.map((artifact) => ({
					...artifact,
					inputs: Array.isArray(artifact.inputs) ? artifact.inputs : []
				}))
			}
		} else {
			result = {
				storeEpoch: 'browser-fixture',
				truncated: false,
				artifacts: [
					{
						artifactId: FIXTURE_ID,
						localKey: 'file',
						publicationOrdinal: 0,
						typeKey: 'core.file',
						typeVersion: 1,
						artifactSha256: 'fixture',
						producerRunId: null,
						output: null,
						inputs: [],
						publicationId: '22222222-2222-4222-8222-222222222222',
						scopeSequence: 1,
						publicationKind: 'roots',
						runId: null,
						committedAt: '2026-08-25T12:00:00Z'
					},
					{
						artifactId: FIXTURE_CHILD_ID,
						localKey: 'description',
						publicationOrdinal: 0,
						typeKey: 'core.content-description',
						typeVersion: 1,
						artifactSha256: 'fixture-child',
						producerRunId: '66666666-6666-4666-8666-666666666666',
						output: { role: 'description', ordinal: 0 },
						inputs: [{ role: 'source', ordinal: 0, artifactId: FIXTURE_ID }],
						publicationId: '77777777-7777-4777-8777-777777777777',
						scopeSequence: 2,
						publicationKind: 'run',
						runId: '66666666-6666-4666-8666-666666666666',
						committedAt: '2026-08-25T12:00:02Z'
					}
				]
			}
		}
		// Tiles first — the grid is what you look at, so it should not wait on
		// the selection round-trip.
		const nextRoots = artifactRoots(result.artifacts)
		void loadRootFacts(nextRoots)
		if (!rootId || !nextRoots.some((artifact) => artifact.artifactId === rootId)) {
			const first = nextRoots[0]?.artifactId ?? null
			if (first) await selectRoot(first)
			else await selectArtifact(null)
		}
	} catch (cause) {
		failure = cause instanceof Error ? cause.message : String(cause)
	} finally {
		loading = false
	}
}

async function selectArtifact(artifactId: string | null): Promise<void> {
	selectedId = artifactId
	envelope = null
	content = null
	contentFailure = null
	evidence = []
	evidenceFailure = null
	activeEvidence = null
	sourceContent = null
	sourceFailure = null
	viewMode = 'view'
	if (!artifactId) return
	envelopeLoading = true
	evidenceLoading = true
	envelopeFailure = null
	try {
		const [loaded, evidenceResource] = await Promise.all([
			isTauri()
				? invoke<Record<string, unknown>>('artifact_get', { artifactId })
				: Promise.resolve({
						artifactId,
						typeKey: 'core.file',
						typeVersion: 1,
						payload: {
							originalName: 'example.pdf',
							declaredMediaType: 'application/pdf',
							sourceKind: 'desktop-drop'
						},
						blob: { sha256: 'fixture', length: 1234 }
					}),
			isTauri()
				? invoke<EvidenceResource>('artifact_evidence_get', { artifactId }).catch((cause) => {
						if (selectedId === artifactId)
							evidenceFailure = cause instanceof Error ? cause.message : String(cause)
						return { artifactId, evidence: [] }
					})
				: Promise.resolve({ artifactId, evidence: [] })
		])
		if (selectedId === artifactId) {
			envelope = loaded
			evidence = Array.isArray(evidenceResource.evidence) ? evidenceResource.evidence : []
			if (loaded.blob) void loadContent(artifactId)
			const first = evidence[0]
			if (first) void chooseEvidence(first)
		}
	} catch (cause) {
		if (selectedId === artifactId) {
			envelopeFailure = cause instanceof Error ? cause.message : String(cause)
			evidenceFailure = cause instanceof Error ? cause.message : String(cause)
		}
	} finally {
		if (selectedId === artifactId) {
			envelopeLoading = false
			evidenceLoading = false
		}
	}
}

async function loadContent(artifactId: string): Promise<void> {
	contentLoading = true
	contentFailure = null
	try {
		if (!isTauri()) throw new Error('Content preview is available in the desktop app.')
		const loaded = await invoke<ArtifactContent>('artifact_content_get', { artifactId })
		if (selectedId === artifactId) content = loaded
	} catch (cause) {
		if (selectedId === artifactId)
			contentFailure = cause instanceof Error ? cause.message : String(cause)
	} finally {
		if (selectedId === artifactId) contentLoading = false
	}
}

async function chooseEvidence(edge: ArtifactEvidence): Promise<void> {
	activeEvidence = edge
	const selectedArtifactId = selectedId
	const sourceArtifactId = edge.inputArtifactId
	sourceContent = null
	sourceLoading = true
	sourceFailure = null
	try {
		if (!isTauri()) throw new Error('Quellenvorschau ist in der Desktop-App verfügbar.')
		const loadedEnvelope = await invoke<Record<string, unknown>>('artifact_get', {
			artifactId: sourceArtifactId
		})
		const loadedContent = loadedEnvelope.blob
			? await invoke<ArtifactContent>('artifact_content_get', { artifactId: sourceArtifactId })
			: null
		if (selectedId === selectedArtifactId && activeEvidence?.ordinal === edge.ordinal) {
			sourceContent = loadedContent
		}
	} catch (cause) {
		if (selectedId === selectedArtifactId && activeEvidence?.ordinal === edge.ordinal) {
			sourceFailure = cause instanceof Error ? cause.message : String(cause)
		}
	} finally {
		if (selectedId === selectedArtifactId && activeEvidence?.ordinal === edge.ordinal) {
			sourceLoading = false
		}
	}
}

async function copy(value: string): Promise<void> {
	await navigator.clipboard.writeText(value)
}

onMount(() => {
	void refresh()
})
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
	<header class="flex items-center gap-3 px-1">
		<h1 class="font-semibold text-sm">Artefakte</h1>
		{#if result}
			<span class="text text--mono-meta">
				{roots.length}
				{roots.length === 1 ? 'Datei' : 'Dateien'}
				· {result.artifacts.length} Artefakte · Epoch
				{result.storeEpoch.slice(
					0,
					8
				)}
			</span>
		{/if}
		<button
			type="button"
			onclick={() => void refresh()}
			class="ml-auto rounded-full border border-border px-3 py-1 text-foreground/50 text-xs hover:bg-surface-sunken hover:text-foreground"
		>
			Aktualisieren
		</button>
	</header>

	<div class="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
		<!-- LEFT — every uploaded file, as a tile. -->
		<section class="flex min-h-[14rem] min-w-0 flex-col lg:w-1/2">
			{#if loading}
				<p class="px-1 text-foreground/35 text-sm">Artifact Store wird gelesen …</p>
			{:else if failure}
				<p class="px-1 text-error-ink text-sm">{failure}</p>
			{:else if roots.length === 0}
				<p class="px-1 text-foreground/35 text-sm">
					Noch keine Dateien. Zieh eine Datei ins Fenster — sie wird als Intent aufgenommen.
				</p>
			{:else}
				<div class="min-h-0 flex-1 overflow-y-auto pr-1">
					<div class="grid grid-cols-2 gap-3 xl:grid-cols-3">
						{#each roots as artifact (artifact.artifactId)}
							{@const facts = factsFor(artifact)}
							<ArtifactCard
								artifactId={artifact.artifactId}
								mediaType={facts.mediaType}
								title={facts.title}
								badge={facts.badge}
								sizeBytes={facts.sizeBytes}
								committedAt={artifact.committedAt}
								selected={rootId === artifact.artifactId}
								onselect={() => void selectRoot(artifact.artifactId)}
							/>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<!-- RIGHT — the document itself, or where it came from. -->
		<section
			class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised lg:w-1/2"
		>
			<header class="flex items-center gap-2 border-border border-b px-3 py-2">
				<div class="flex rounded-full border border-border p-0.5 text-xs">
					<button
						type="button"
						onclick={() => (pane = 'file')}
						class="rounded-full px-3 py-1 {pane === 'file'
							? 'bg-primary text-primary-foreground'
							: 'text-foreground/50'}"
					>
						Datei
					</button>
					<button
						type="button"
						onclick={() => (pane = 'lineage')}
						class="rounded-full px-3 py-1 {pane === 'lineage'
							? 'bg-primary text-primary-foreground'
							: 'text-foreground/50'}"
					>
						Herkunft
					</button>
				</div>
				{#if rootArtifact}
					<span class="min-w-0 flex-1 truncate text-right text-foreground/50 text-xs">
						{factsFor(rootArtifact).title}
					</span>
				{/if}
			</header>

			{#if !rootArtifact}
				<p class="m-auto text-foreground/35 text-sm">Wähle eine Datei aus.</p>
			{:else if pane === 'file'}
				<!-- The default: the document, filling the pane. Nothing else —
				     the metadata lives one tab away, where it does not compete
				     with the thing you opened. -->
				{#key rootArtifact.artifactId}
					{#if contentLoading}
						<p class="m-auto text-foreground/35 text-sm">Datei wird geladen …</p>
					{:else if contentFailure}
						<p class="m-auto px-4 text-error-ink text-sm">{contentFailure}</p>
					{:else if content}
						<div class="min-h-0 flex-1 overflow-auto">
							<ArtifactContentViewer mediaType={content.mediaType} base64={content.base64} />
						</div>
					{:else}
						<p class="m-auto text-foreground/35 text-sm">Diese Datei hat keinen Inhalt.</p>
					{/if}
				{/key}
			{:else}
				<div class="flex min-h-0 flex-1 flex-col gap-2">
					<section
						class="flex min-h-0 shrink-0 basis-[45%] flex-col overflow-hidden border-border border-b"
					>
						<div class="flex flex-wrap items-center gap-2 border-border border-b p-3">
							<input
								bind:value={query}
								placeholder="Typ, ID, Run, Input oder Local Key filtern"
								class="min-w-0 flex-1 rounded-xl border border-border bg-surface-sunken px-3 py-2 text-xs outline-none focus:border-primary/25"
							>
							<div class="flex rounded-xl border border-border p-0.5 text-[length:var(--fs-micro)]">
								<button
									type="button"
									onclick={expandAll}
									class="rounded-lg px-2 py-1.5 text-foreground/50 hover:bg-surface-sunken hover:text-foreground"
								>
									Alle öffnen
								</button>
								<button
									type="button"
									onclick={collapseAll}
									disabled={branchCount === 0}
									class="rounded-lg px-2 py-1.5 text-foreground/50 hover:bg-surface-sunken hover:text-foreground disabled:opacity-35"
								>
									Zuklappen
								</button>
							</div>
							<button
								type="button"
								onclick={() => void refresh()}
								class="rounded-xl border border-border px-3 py-2 text-xs hover:bg-surface-sunken"
							>
								Aktualisieren
							</button>
						</div>
						{#if loading}
							<p class="p-4 text-foreground/35 text-sm">Artifact Store wird gelesen …</p>
						{:else if failure}
							<p class="p-4 text-error-ink text-sm">{failure}</p>
						{:else if treeRows.length === 0}
							<p class="p-4 text-foreground/35 text-sm">Keine Artefakte gefunden.</p>
						{:else}
							<div class="min-h-0 flex-1 overflow-auto" role="tree" aria-label="Artifact lineage">
								{#each treeRows as row (row.artifact.artifactId)}
									{@const artifact = row.artifact}
									<div
										role="treeitem"
										aria-level={row.depth + 1}
										aria-selected={selectedId === artifact.artifactId}
										aria-expanded={row.hasChildren ? !collapsedIds.has(artifact.artifactId) : undefined}
										class="flex min-w-0 items-center border-border/25 border-b transition-colors {selectedId ===
								artifact.artifactId
									? 'bg-surface-selected'
									: 'hover:bg-surface-sunken/25'}"
										style:padding-left={`${row.depth * 14 + 4}px`}
									>
										{#if row.hasChildren}
											<button
												type="button"
												onclick={() => toggleBranch(artifact.artifactId)}
												aria-label={collapsedIds.has(artifact.artifactId)
											? 'Zweig öffnen'
											: 'Zweig schließen'}
												class="grid size-6 shrink-0 place-items-center rounded text-foreground/50 hover:bg-surface-sunken hover:text-foreground"
											>
												<span
													class="transition-transform {collapsedIds.has(artifact.artifactId)
												? ''
												: 'rotate-90'}"
													>›</span
												>
											</button>
										{:else}
											<span class="grid size-6 shrink-0 place-items-center text-foreground/35"
												>·</span
											>
										{/if}
										<button
											type="button"
											onclick={() => void selectArtifact(artifact.artifactId)}
											class="min-w-0 flex-1 py-1.5 pr-2 text-left"
											title="{artifact.typeKey}@{artifact.typeVersion} · {artifact.artifactId}"
										>
											<span class="flex min-w-0 items-baseline gap-2">
												<span class="truncate font-medium text-xs">
													{artifactTypeLabel(artifact.typeKey)}
												</span>
												<span
													class="shrink-0 font-mono text-[length:var(--fs-nano)] text-foreground/35"
												>
													{artifact.localKey}
												</span>
											</span>
											<span
												class="flex min-w-0 items-baseline gap-2 font-mono text-[length:var(--fs-nano)] text-foreground/35"
											>
												<span class="truncate">{artifact.typeKey}@{artifact.typeVersion}</span>
												<span class="ml-auto shrink-0">#{artifact.scopeSequence}</span>
												{#if row.missingParentCount}
													<span class="shrink-0 text-warning-ink">{row.missingParentCount}?</span>
												{/if}
											</span>
										</button>
									</div>
								{/each}
							</div>
							{#if result?.truncated}
								<p class="border-border border-t px-3 py-2 text-warning-ink text-xs">
									Ansicht auf die neuesten 2.000 Artefakte begrenzt.
								</p>
							{/if}
						{/if}
					</section>

					<section
						class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised"
					>
						{#if selected}
							<header class="border-border border-b px-4 py-3">
								<div class="flex items-baseline gap-2">
									<h2 class="min-w-0 flex-1 truncate font-semibold text-sm">{selected.typeKey}</h2>
									<span class="text text--mono-meta">v{selected.typeVersion}</span>
								</div>
								<div class="mt-1 flex items-center gap-2">
									<button
										type="button"
										onclick={() => void copy(selected.artifactId)}
										class="truncate font-mono text-[length:var(--fs-micro)] text-foreground/50 hover:text-foreground"
										title="ID kopieren"
									>
										{selected.artifactId}
									</button>
									{#if selected.inputs.length > 0}
										<span
											class="ml-auto rounded-md bg-surface-sunken px-2 py-0.5 text-[length:var(--fs-micro)] text-foreground/50"
											title={selected.inputs.map((input) => `${input.role}:${input.ordinal} → ${input.artifactId}`).join('\n')}
										>
											{selected.inputs.length} {selected.inputs.length === 1 ? 'Input' : 'Inputs'}
										</span>
									{/if}
									<span
										class={selected.inputs.length ? 'text-foreground/35 text-xs' : 'ml-auto text-foreground/35 text-xs'}
										>#{selected.scopeSequence}</span
									>
								</div>
								<div class="mt-3 flex items-center gap-1">
									<button
										type="button"
										onclick={() => (viewMode = 'view')}
										class="rounded-lg px-2.5 py-1 text-xs {viewMode === 'view' ? 'bg-primary text-primary-foreground' : 'text-foreground/50 hover:bg-surface-sunken'}"
									>
										Ansicht
									</button>
									<button
										type="button"
										onclick={() => (viewMode = 'raw')}
										class="rounded-lg px-2.5 py-1 text-xs {viewMode === 'raw' ? 'bg-primary text-primary-foreground' : 'text-foreground/50 hover:bg-surface-sunken'}"
									>
										Raw
									</button>
									{#if evidenceLoading}
										<span class="ml-auto text-foreground/35 text-[length:var(--fs-micro)]"
											>Evidenz wird geladen …</span
										>
									{:else if evidence.length > 0}
										<span
											class="ml-auto rounded-full bg-info-surface px-2 py-0.5 text-info-ink text-[length:var(--fs-micro)]"
											>▣ {evidence.length} Fundstellen</span
										>
									{/if}
								</div>
							</header>
							{#if envelopeLoading}
								<p class="p-4 text-foreground/35 text-sm">Envelope wird geladen …</p>
							{:else if envelopeFailure}
								<p class="p-4 text-error-ink text-sm">{envelopeFailure}</p>
							{:else if envelope}
								{#if viewMode === 'raw'}
									<div class="flex min-h-0 flex-1 flex-col">
										<div class="flex items-center justify-between border-border border-b px-4 py-2">
											<span
												class="font-semibold text-foreground/50 text-[length:var(--fs-micro)] uppercase tracking-wide"
												>Unverändertes Envelope</span
											><button
												type="button"
												onclick={() => void copy(envelopeJson)}
												class="text-foreground/50 text-xs hover:text-foreground"
											>
												JSON kopieren
											</button>
										</div>
										<pre
											class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[length:var(--fs-eyebrow)] leading-relaxed"
										>{envelopeJson}</pre>
									</div>
								{:else}
									<div class="flex min-h-0 flex-1 flex-col lg:flex-row">
										<div
											class="flex min-h-[18rem] min-w-0 flex-1 flex-col {sourceContent || content || sourceLoading || contentLoading ? 'border-border lg:border-r' : ''}"
										>
											<ArtifactSemanticViewer
												typeKey={selected.typeKey}
												payload={envelope.payload}
												{evidence}
												{activeEvidence}
												onEvidence={(edge) => void chooseEvidence(edge)}
											/>
										</div>
										{#if sourceContent || content || sourceLoading || contentLoading || sourceFailure || contentFailure}
											<div class="flex min-h-[22rem] min-w-0 flex-1 flex-col bg-surface-sunken/25">
												<div
													class="flex items-center justify-between border-border border-b bg-surface-raised px-4 py-2"
												>
													<div>
														<p
															class="font-semibold text-foreground/50 text-[length:var(--fs-micro)] uppercase tracking-wide"
														>
															{activeEvidence ? 'Belegquelle' : 'Vorschau'}
														</p>
														{#if activeEvidence}
															<p
																class="mt-0.5 font-mono text-foreground/35 text-[length:var(--fs-nano)]"
															>
																{activeEvidence.inputRole}:{activeEvidence.inputOrdinal}
																· {activeEvidence.inputArtifactId.slice(0, 8)}
															</p>
														{/if}
													</div>
													{#if activeEvidence?.outputLocator.kind === 'json-pointer'}
														<span
															class="rounded-md bg-info-surface px-2 py-1 font-mono text-info-ink text-[length:var(--fs-nano)]"
															>{activeEvidence.outputLocator.pointer}</span
														>
													{/if}
												</div>
												{#if sourceLoading || (!sourceContent && contentLoading)}
													<p class="p-4 text-foreground/35 text-xs">Dokument wird gerendert …</p>
												{:else if sourceFailure || (!sourceContent && contentFailure)}
													<p class="p-4 text-error-ink text-xs">
														{sourceFailure ?? contentFailure}
													</p>
												{:else if sourceContent && activeEvidence}
													{#key `${activeEvidence.inputArtifactId}:${activeEvidence.ordinal}`}
														<ArtifactContentViewer
															{...sourceContent}
															locator={activeEvidence.inputLocator}
														/>
													{/key}
												{:else if content}
													{#key selected.artifactId}
														<ArtifactContentViewer {...content} />
													{/key}
												{/if}
											</div>
										{/if}
									</div>
									{#if evidenceFailure}
										<p class="border-border border-t px-4 py-2 text-warning-ink text-xs">
											Evidenz nicht verfügbar: {evidenceFailure}
										</p>
									{/if}
								{/if}
							{/if}
						{:else}
							<p class="m-auto text-foreground/35 text-sm">Wähle ein Artefakt aus.</p>
						{/if}
					</section>
				</div>
			{/if}
		</section>
	</div>
</div>
