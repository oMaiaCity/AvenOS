<script lang="ts">
import type { HeldMessage } from '$lib/actors/bus'
import { confirmHeld, rejectHeld } from '$lib/actors/hitl.svelte'

/**
 * THE human gate, as one answer shape (0159).
 *
 * Every held message — a destructive tool call, a drafted reply — carries the
 * thing being decided in the shape that fits it: a document reads as paper, a
 * payment as a ledger, a proposal as a choice, a match as two sides held
 * together, a deletion as a list. The marine footer is where it opens, and it
 * opens ONLY by a physical button press; voice cannot confirm.
 *
 * This lived in the dashboard's floating dock as its own 414-line layer. It is
 * now one arm of the query modal's answer dispatcher — the layouts moved
 * verbatim, the surface around them did not survive.
 */
const { held }: { held: HeldMessage } = $props()
</script>

<!--
  The `gate-card` actor: the human gate, where an autonomous process stops and
  asks. Its own description is this component. The frame, the head and the
  footer are the actor's; the four preview LAYOUTS below stay, because they are
  content shapes and `gate-card-preview` is the box that holds whatever they are.
-->
<div class="gate-card" data-held-id={held.id}>
	<div class="gate-card-body">
		<div class="gate-card-head">
			{#if held.preview}
				<span class="gate-card-kind">{held.preview.kind}</span>
			{/if}
			<p class="gate-card-question">{held.label}</p>
			<span class="gate-card-asked">{held.actor}· {held.method}</span>
		</div>

		{#if held.preview}
			{@const p = held.preview}
			<p class="gate-card-detail">{p.title}</p>

			{#if p.layout === 'document'}
				<!-- paper: the text as it would go out -->
				<div class="rounded-xl border border-border bg-white px-5 py-4">
					{#if p.body}
						<p
							class="whitespace-pre-wrap text-[length:var(--fs-body)] text-foreground/80 leading-relaxed"
						>
							{p.body}
						</p>
					{/if}
					{#if p.attachments}
						<div class="mt-3 flex flex-wrap gap-1.5 border-border/25 border-t pt-3">
							{#each p.attachments as file (file)}
								<span
									class="flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2 py-1 font-mono text-[length:var(--fs-micro)]"
								>
									<svg
										viewBox="0 0 24 24"
										class="size-3 text-foreground/35"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<path d="M14 3v5h5M14 3H6v18h12V8l-4-5Z" />
									</svg>
									{file}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			{:else if p.layout === 'ledger'}
				<!-- figures: the first row is the amount, in full size -->
				<div class="surface">
					{#each p.rows ?? [] as row, i (row.label)}
						{#if i === 0}
							<div class="flex items-baseline justify-between pb-3">
								<span
									class="text-[length:var(--fs-eyebrow)] text-foreground/50 uppercase tracking-wide"
								>
									{row.label}
								</span>
								<span class="font-semibold text-2xl tabular-nums">{row.value}</span>
							</div>
						{:else}
							<div class="flex items-baseline justify-between border-border/25 border-t py-1.5">
								<span class="text-[length:var(--fs-eyebrow)] text-foreground/50">{row.label}</span>
								<span class="font-mono text-xs">{row.value}</span>
							</div>
						{/if}
					{/each}
				</div>
			{:else if p.layout === 'choice'}
				<!-- the proposal, and what it was chosen over -->
				<div class="flex flex-col gap-2">
					{#each p.options ?? [] as option (option.label)}
						<div
							class="flex items-center gap-3 rounded-xl border px-4 py-2.5 {option.chosen
							? 'border-primary/25 bg-primary/[0.06]'
							: 'border-border bg-surface-card'}"
						>
							<span
								class="flex size-4 shrink-0 items-center justify-center rounded-full border-2 {option.chosen
								? 'border-primary bg-primary'
								: 'border-foreground/15'}"
							>
								{#if option.chosen}
									<span class="size-1.5 rounded-full bg-primary-foreground"></span>
								{/if}
							</span>
							<span class="min-w-0 flex-1 font-medium text-xs">{option.label}</span>
							{#if option.note}
								<span class="shrink-0 font-mono text-[length:var(--fs-micro)] text-foreground/50">
									{option.note}
								</span>
							{/if}
						</div>
					{/each}
				</div>
			{:else if p.layout === 'compare'}
				<!-- two sides, held against each other -->
				<div class="flex items-stretch gap-3">
					{#each p.sides ?? [] as side, i (side.heading)}
						{#if i > 0}
							<span class="self-center font-mono text-foreground/35 text-sm">↔</span>
						{/if}
						<div class="min-w-0 flex-1 surface surface--size-sm">
							<p
								class="pb-1.5 font-mono text-[length:var(--fs-nano)] text-foreground/50 uppercase tracking-wide"
							>
								{side.heading}
							</p>
							{#each side.lines as line (line)}
								<p class="truncate text-xs leading-relaxed">{line}</p>
							{/each}
						</div>
					{/each}
				</div>
			{:else}
				<!-- a list: what goes, what stays -->
				<ul class="flex flex-col gap-1.5">
					{#each p.items ?? [] as item (item.text)}
						<li
							class="flex items-center gap-3 rounded-xl border border-border bg-surface-card px-4 py-2"
						>
							<span
								class="font-mono text-[length:var(--fs-micro)] {item.struck
								? 'text-error-ink'
								: 'text-success-ink'}"
							>
								{item.struck ? '✕' : '✓'}
							</span>
							<span class="min-w-0 flex-1 text-xs {item.struck ? 'line-through opacity-60' : ''}">
								{item.text}
							</span>
							{#if item.note}
								<span class="shrink-0 font-mono text-[length:var(--fs-micro)] text-foreground/50">
									{item.note}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<p class="gate-card-detail">{held.detail}</p>
		{/if}
	</div>

	<!-- the footer: the only place the gate opens -->
	<div class="gate-card-actions">
		<button class="btn btn--ghost" type="button" onclick={() => rejectHeld(held.id)}>
			Reject
		</button>
		<button class="btn btn--primary" type="button" onclick={() => confirmHeld(held.id)}>
			Confirm
		</button>
	</div>
</div>
