<script lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core'
import { base64ToBytes, loadPdf, renderPageToCanvas } from './pdf'

/**
 * One uploaded file, as a tile: a real first-page preview, its name, its type
 * and how big and how old it is.
 *
 * The preview is rendered from the STORE — `artifact_content_get` on the
 * artifact's own blob — rather than from a file on disk. The tile this
 * replaces read a local directory through a Tauri command that existed only
 * for the retired downloads shelf; the store already holds the bytes, so the
 * second path was never needed.
 */

let {
	artifactId,
	mediaType,
	title,
	badge,
	sizeBytes,
	committedAt,
	selected,
	onselect
}: {
	artifactId: string
	mediaType: string
	title: string
	badge: string
	sizeBytes: number | null
	committedAt: string | null
	selected: boolean
	onselect: () => void
} = $props()

let canvas = $state<HTMLCanvasElement | null>(null)
let imageUrl = $state<string | null>(null)
let width = $state(0)
let failed = $state(false)

const isPdf = $derived(mediaType === 'application/pdf')
const isImage = $derived(mediaType.startsWith('image/'))

function sizeLabel(bytes: number | null): string {
	if (bytes === null) return ''
	if (bytes >= 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
	return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function dateLabel(iso: string | null): string {
	if (!iso) return ''
	return new Date(iso).toLocaleDateString('de-DE', {
		day: '2-digit',
		month: 'long',
		year: 'numeric'
	})
}

const meta = $derived([sizeLabel(sizeBytes), dateLabel(committedAt)].filter(Boolean).join(' · '))

/** Fetch once per tile, lazily, and only for the two kinds we can draw. */
$effect(() => {
	const id = artifactId
	const tileWidth = Math.floor(width)
	const target = canvas
	if (!isTauri() || tileWidth <= 0) return
	if (!isPdf && !isImage) return
	if (isPdf && !target) return

	let stale = false
	let objectUrl: string | null = null
	;(async () => {
		try {
			const loaded = await invoke<{ mediaType: string; base64: string }>('artifact_content_get', {
				artifactId: id
			})
			if (stale) return
			const bytes = base64ToBytes(loaded.base64)
			if (loaded.mediaType.startsWith('image/')) {
				objectUrl = URL.createObjectURL(
					new Blob([Uint8Array.from(bytes).buffer], { type: loaded.mediaType })
				)
				imageUrl = objectUrl
				return
			}
			const doc = await loadPdf(bytes)
			try {
				const page = await doc.getPage(1)
				if (!stale && target) await renderPageToCanvas(page, target, tileWidth)
			} finally {
				void doc.loadingTask.destroy()
			}
		} catch {
			if (!stale) failed = true
		}
	})()

	return () => {
		stale = true
		if (objectUrl) URL.revokeObjectURL(objectUrl)
		imageUrl = null
	}
})
</script>

<button
	type="button"
	onclick={onselect}
	{title}
	class="flex aspect-square flex-col overflow-hidden rounded-3xl border p-1 text-left transition-colors {selected
		? 'border-primary bg-surface-sunken'
		: 'border-border bg-surface-card hover:bg-surface-sunken'}"
>
	<div bind:clientWidth={width} class="min-h-0 flex-1 overflow-hidden rounded-[1.25rem] bg-white">
		{#if imageUrl}
			<img src={imageUrl} alt="" class="h-full w-full object-cover">
		{:else if isPdf && !failed}
			<canvas bind:this={canvas} class="block w-full"></canvas>
		{:else}
			<div class="flex h-full items-center justify-center font-mono text-foreground/35 text-xs">
				{badge}
			</div>
		{/if}
	</div>
	<div class="flex flex-col gap-0.5 px-2.5 pt-2 pb-1.5">
		<div class="flex items-baseline justify-between gap-2">
			<span class="truncate font-semibold text-sm">{title}</span>
			<span
				class="shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[length:var(--fs-micro)]"
			>
				{badge}
			</span>
		</div>
		{#if meta}
			<p class="truncate text-foreground/50 text-xs">{meta}</p>
		{/if}
	</div>
</button>
