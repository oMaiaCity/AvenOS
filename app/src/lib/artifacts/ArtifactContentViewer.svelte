<script lang="ts">
import { type ArtifactLocator, splitUtf8Range } from './artifact-view'
import { base64ToBytes, loadPdf, renderPageToCanvas } from './pdf'

let {
	mediaType,
	base64,
	locator = null
}: { mediaType: string; base64: string; locator?: ArtifactLocator | null } = $props()

const bytes = $derived(base64ToBytes(base64))
const text = $derived.by(() => {
	if (!(mediaType.startsWith('text/') || mediaType.includes('json'))) return null
	const decoded = new TextDecoder().decode(bytes)
	if (!mediaType.includes('json')) return decoded
	try {
		return JSON.stringify(JSON.parse(decoded), null, 2)
	} catch {
		return decoded
	}
})
const rangedText = $derived.by(() => {
	if (text === null || locator?.kind !== 'byte-range') return null
	return splitUtf8Range(bytes, locator.start, locator.endExclusive)
})
const regionStyle = $derived.by(() => {
	if (locator?.kind !== 'page-region') return ''
	return `left:${locator.x / 10000}%;top:${locator.y / 10000}%;width:${locator.width / 10000}%;height:${locator.height / 10000}%`
})
let imageUrl = $state<string | null>(null)
let pages = $state<HTMLDivElement | null>(null)
let width = $state(0)
let failure = $state<string | null>(null)
let loading = $state(false)

$effect(() => {
	if (!mediaType.startsWith('image/')) return
	const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: mediaType }))
	imageUrl = url
	return () => {
		URL.revokeObjectURL(url)
		imageUrl = null
	}
})

$effect(() => {
	const host = pages
	const pageWidth = Math.floor(width)
	const activeLocator = locator
	if (mediaType !== 'application/pdf' || !host || pageWidth <= 0) return
	let stale = false
	loading = true
	failure = null
	;(async () => {
		try {
			const doc = await loadPdf(bytes)
			try {
				if (stale) return
				host.replaceChildren()
				for (let number = 1; number <= doc.numPages; number++) {
					const page = await doc.getPage(number)
					if (stale) return
					const wrapper = document.createElement('div')
					wrapper.className = 'relative'
					wrapper.dataset.page = String(number)
					const canvas = document.createElement('canvas')
					canvas.className = 'block w-full rounded-xl shadow-[0_1px_3px_rgba(30,41,59,0.12)]'
					wrapper.appendChild(canvas)
					host.appendChild(wrapper)
					await renderPageToCanvas(page, canvas, pageWidth)
					if (activeLocator?.kind === 'page-region' && activeLocator.page === number) {
						const marker = document.createElement('div')
						marker.className =
							'pointer-events-none absolute rounded-sm border-2 border-info bg-info/30 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]'
						marker.style.left = `${activeLocator.x / 10000}%`
						marker.style.top = `${activeLocator.y / 10000}%`
						marker.style.width = `${activeLocator.width / 10000}%`
						marker.style.height = `${activeLocator.height / 10000}%`
						wrapper.appendChild(marker)
						requestAnimationFrame(() =>
							wrapper.scrollIntoView({ block: 'center', behavior: 'smooth' })
						)
					}
				}
				if (!stale) loading = false
			} finally {
				void doc.loadingTask.destroy()
			}
		} catch (cause) {
			if (!stale) {
				failure = cause instanceof Error ? cause.message : String(cause)
				loading = false
			}
		}
	})()
	return () => {
		stale = true
	}
})
</script>

{#if text !== null}
	<pre
		class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed"
	>{#if rangedText}{rangedText.before}<mark class="rounded bg-info/45 px-0.5 text-inherit ring-1 ring-info/60">{rangedText.marked}</mark>{rangedText.after}{:else}{text}{/if}</pre>
{:else if imageUrl}
	<div class="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4">
		<div class="relative inline-block max-w-full">
			<img src={imageUrl} alt="Artifact content" class="block max-w-full rounded-xl">
			{#if locator?.kind === 'page-region' && locator.page === 1}
				<div
					aria-label="Markierte Fundstelle"
					class="pointer-events-none absolute rounded-sm border-2 border-info bg-info/30 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]"
					style={regionStyle}
				></div>
			{/if}
		</div>
	</div>
{:else if mediaType === 'application/pdf'}
	<div class="min-h-0 flex-1 overflow-y-auto p-4">
		{#if failure}
			<p class="text-error-ink text-xs">{failure}</p>
		{/if}
		{#if loading}
			<p class="text-foreground/35 text-xs">PDF wird gerendert …</p>
		{/if}
		<div bind:this={pages} bind:clientWidth={width} class="flex flex-col gap-3"></div>
	</div>
{:else}
	<div class="p-4 text-foreground/50 text-xs">
		<p>Binärer Inhalt · {mediaType}</p>
		<p class="mt-1 font-mono">{bytes.byteLength.toLocaleString('de-DE')} Bytes</p>
	</div>
{/if}
