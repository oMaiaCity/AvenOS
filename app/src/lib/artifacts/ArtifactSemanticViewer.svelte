<script lang="ts">
import {
	type ArtifactEvidence,
	arrayValue,
	displayValue,
	evidenceForPointer,
	formatConfidence,
	formatMoney,
	labelForKey,
	objectValue,
	stringValue
} from './artifact-view'

let {
	typeKey,
	payload,
	evidence = [],
	activeEvidence = null,
	onEvidence = () => undefined
}: {
	typeKey: string
	payload: unknown
	evidence?: ArtifactEvidence[]
	activeEvidence?: ArtifactEvidence | null
	onEvidence?: (edge: ArtifactEvidence) => void
} = $props()

const data = $derived(objectValue(payload))
const supplier = $derived(objectValue(data.supplier))
const buyer = $derived(objectValue(data.buyer))
const payment = $derived(objectValue(data.payment))
const lineItems = $derived(arrayValue(data.lineItems).map(objectValue))
const transactions = $derived(arrayValue(data.transactions).map(objectValue))
const checks = $derived(arrayValue(data.checks).map(objectValue))
const currency = $derived(stringValue(data.currency, 'EUR'))
const candidateInvoice = $derived(typeKey === 'bookkeeping.invoice-candidate')
const detailedInvoice = $derived(typeKey === 'bookkeeping.invoice-details')
const statement = $derived(typeKey === 'banking.account-statement-candidate')
const validation = $derived(
	typeKey === 'bookkeeping.invoice-validation' || typeKey === 'banking.statement-validation'
)
const classification = $derived(typeKey.includes('classification'))

const preferredFields: Record<string, string[]> = {
	'core.file': ['originalName', 'declaredMediaType', 'sourceKind'],
	'core.file-inspection': ['outcome', 'detectedMediaType', 'readable', 'pageCount', 'encrypted'],
	'core.bundle': ['purpose', 'displayName'],
	'docs.page': ['sourcePage', 'rotationDegrees', 'widthUnits', 'heightUnits'],
	'docs.extracted-text': ['method', 'language', 'pageCount', 'characterCount', 'complete'],
	'docs.text-layout': ['coordinateSpace', 'complete', 'spans'],
	'core.content-classification': [
		'subjectLevel',
		'primaryKind',
		'facets',
		'confidenceBps',
		'reason',
		'resolutionMode',
		'complete'
	],
	'core.content-description': ['summary', 'topics'],
	'core.document-classification': [
		'rawKind',
		'resolvedKind',
		'family',
		'confidenceBps',
		'reason',
		'resolutionMode',
		'alternatives'
	],
	'intent.declaration': ['title', 'triggerKind', 'observedAt', 'intentId']
}

const genericKeys = $derived(
	preferredFields[typeKey] ?? Object.keys(data).filter((key) => data[key] !== undefined)
)

function edge(pointer: string): ArtifactEvidence | null {
	return evidenceForPointer(evidence, pointer)
}

function choose(pointer: string): void {
	const found = edge(pointer)
	if (found) onEvidence(found)
}

function active(pointer: string): boolean {
	const found = edge(pointer)
	return found !== null && found.ordinal === activeEvidence?.ordinal
}

function title(): string {
	if (candidateInvoice) return 'Rechnungskandidat'
	if (detailedInvoice) {
		return (
			{
				invoice: 'Rechnung',
				'credit-note': 'Gutschrift',
				receipt: 'Kassenbeleg',
				'self-issued-receipt': 'Eigenbeleg',
				mandate: 'Mandat',
				'order-confirmation': 'Auftragsbestätigung',
				offer: 'Angebot',
				reminder: 'Zahlungserinnerung'
			}[stringValue(data.documentKind, 'invoice')] ?? 'Beleg'
		)
	}
	if (statement) return data.statementKind === 'payment-receipt' ? 'Zahlungsbeleg' : 'Kontoauszug'
	return typeKey.split('.').at(-1)?.replaceAll('-', ' ') ?? typeKey
}
</script>

<div class="min-h-0 flex-1 overflow-auto bg-surface-sunken/25 p-3 sm:p-5">
	{#if candidateInvoice || detailedInvoice}
		<article
			class="mx-auto max-w-3xl overflow-hidden rounded-sm border border-border bg-white text-foreground shadow-[0_12px_40px_rgba(30,41,59,0.10)] dark:bg-surface-raised"
		>
			<div class="h-1.5 bg-gradient-to-r from-info via-earth to-terracotta"></div>
			<header class="flex items-start justify-between gap-6 border-border border-b px-6 py-6">
				<div class="min-w-0">
					<p
						class="text-[length:var(--fs-micro)] font-semibold text-muted-foreground uppercase tracking-[var(--tracking-wider)]"
					>
						{title()}
					</p>
					<button
						type="button"
						onclick={() => choose('/supplier')}
						class="mt-2 block max-w-full text-left {edge('/supplier') ? 'cursor-crosshair' : ''}"
					>
						<span
							class="block truncate font-semibold text-lg {active('/supplier') ? 'rounded bg-info-surface ring-2 ring-info' : ''}"
							>{stringValue(candidateInvoice ? data.supplier : supplier.name, 'Unbekannter Lieferant')}</span
						>
					</button>
					{#if detailedInvoice}
						<p class="mt-1 max-w-sm whitespace-pre-line text-muted-foreground text-xs">
							{stringValue(supplier.address, '')}
						</p>
					{/if}
				</div>
				<div class="shrink-0 text-right">
					<p class="text-muted-foreground text-xs">Belegnummer</p>
					<button
						type="button"
						onclick={() => choose('/invoiceNumber')}
						class="font-mono font-semibold text-sm {active('/invoiceNumber') ? 'rounded bg-info-surface ring-2 ring-info' : ''}"
					>
						{stringValue(data.invoiceNumber, stringValue(data.orderNumber))}
					</button>
					{#if detailedInvoice}
						<p class="mt-2 text-muted-foreground text-xs">{stringValue(data.issueDate)}</p>
					{/if}
				</div>
			</header>

			{#if candidateInvoice}
				<div class="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
					{#each [['Netto', 'netMinor'], ['Steuer', 'taxMinor'], ['Brutto', 'grossMinor'], ['Fällig', 'dueDate']] as item}
						<button
							type="button"
							onclick={() => choose(`/${item[1]}`)}
							class="bg-white px-4 py-4 text-left hover:bg-info-surface"
						>
							<span
								class="block text-[length:var(--fs-micro)] text-muted-foreground uppercase tracking-wide"
								>{item[0]}</span
							>
							<strong
								class="mt-1 block {active(`/${item[1]}`) ? 'rounded bg-info-surface ring-2 ring-info' : ''}"
								>{item[1] === 'dueDate' ? displayValue(data[item[1]]) : formatMoney(data[item[1]], data.currency)}</strong
							>
						</button>
					{/each}
				</div>
				<p class="px-6 py-6 text-foreground text-sm leading-relaxed">
					{stringValue(data.summary, 'Keine Zusammenfassung verfügbar.')}
				</p>
			{:else}
				{#if buyer.name || buyer.address}
					<div class="grid gap-6 px-6 py-5 sm:grid-cols-2">
						<div>
							<p class="text-[length:var(--fs-micro)] text-muted-foreground uppercase">Von</p>
							<p class="mt-1 font-medium">{stringValue(supplier.name)}</p>
							<p class="whitespace-pre-line text-muted-foreground text-xs">
								{stringValue(supplier.address, '')}
							</p>
						</div>
						<div>
							<p class="text-[length:var(--fs-micro)] text-muted-foreground uppercase">An</p>
							<p class="mt-1 font-medium">{stringValue(buyer.name)}</p>
							<p class="whitespace-pre-line text-muted-foreground text-xs">
								{stringValue(buyer.address, '')}
							</p>
						</div>
					</div>
				{/if}
				{#if lineItems.length > 0}
					<div class="overflow-x-auto px-6 py-3">
						<table class="w-full min-w-[34rem] text-left text-xs">
							<thead>
								<tr class="border-border border-b text-muted-foreground uppercase tracking-wide">
									<th class="py-2 font-medium">Position</th>
									<th class="py-2 text-right font-medium">Menge</th>
									<th class="py-2 text-right font-medium">Netto</th>
									<th class="py-2 text-right font-medium">Brutto</th>
								</tr>
							</thead>
							<tbody>
								{#each lineItems as item, index}
									<tr class="border-border border-b">
										<td class="py-3">
											<button
												type="button"
												onclick={() => choose(`/lineItems/${index}`)}
												class="text-left {edge(`/lineItems/${index}`) ? 'cursor-crosshair hover:text-info-ink' : ''}"
											>
												<span
													class={active(`/lineItems/${index}`) ? 'rounded bg-info-surface ring-2 ring-info' : ''}
													>{stringValue(item.description)}</span
												>
											</button>
										</td>
										<td class="py-3 text-right">
											{stringValue(item.quantity)} {stringValue(item.unit, '')}
										</td>
										<td class="py-3 text-right font-mono">
											{formatMoney(item.netMinor, currency)}
										</td>
										<td class="py-3 text-right font-mono font-semibold">
											{formatMoney(item.grossMinor, currency)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				<div class="ml-auto grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 px-6 py-6 text-sm">
					<span class="text-muted-foreground">Bezahlt</span
					><strong class="text-right">{formatMoney(payment.amountPaidMinor, currency)}</strong>
					<span class="text-muted-foreground">Offen</span
					><strong class="text-right text-lg"
						>{formatMoney(payment.totalOutstandingMinor, currency)}</strong
					>
				</div>
			{/if}
			{#if evidence.length > 0}
				<footer
					class="border-border border-t bg-info-surface/70 px-6 py-3 text-info-ink text-xs"
				>
					▣ {evidence.length} belegte {evidence.length === 1 ? 'Fundstelle' : 'Fundstellen'} · Feld
					anklicken, um die Quelle zu markieren
				</footer>
			{/if}
		</article>
	{:else if statement}
		<article
			class="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm"
		>
			<header class="bg-gradient-to-br from-primary to-quiet px-6 py-6 text-white">
				<p
					class="text-[length:var(--fs-micro)] text-white/50 uppercase tracking-[var(--tracking-widest)]"
				>
					{title()}
				</p>
				<div class="mt-4 flex flex-wrap items-end justify-between gap-4">
					<div>
						<h3 class="font-semibold text-xl">
							{stringValue(data.accountHolder, 'Konto')}
						</h3>
						<p class="mt-1 font-mono text-white/65 text-xs">{stringValue(data.accountIban)}</p>
					</div>
					<div class="text-right">
						<p class="text-white/50 text-xs">Schlusssaldo</p>
						<p class="font-semibold text-2xl">
							{formatMoney(data.closingBalanceMinor, data.currency)}
						</p>
					</div>
				</div>
			</header>
			<div class="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
				{#each [['Zeitraum', `${stringValue(data.periodStart)} – ${stringValue(data.periodEnd)}`], ['Währung', data.currency], ['Anfang', formatMoney(data.openingBalanceMinor, data.currency)], ['Buchungen', transactions.length]] as metric}
					<div class="bg-surface-raised p-4">
						<span class="block text-[length:var(--fs-micro)] text-foreground/35 uppercase"
							>{metric[0]}</span
						><strong class="mt-1 block text-sm">{displayValue(metric[1])}</strong>
					</div>
				{/each}
			</div>
			{#if transactions.length}
				<div class="overflow-x-auto">
					<table class="w-full min-w-[42rem] text-xs">
						<thead>
							<tr class="border-border border-b text-foreground/35">
								<th class="px-4 py-3 text-left">Datum</th>
								<th class="px-4 py-3 text-left">Text</th>
								<th class="px-4 py-3 text-left">Gegenkonto</th>
								<th class="px-4 py-3 text-right">Betrag</th>
							</tr>
						</thead>
						<tbody>
							{#each transactions as transaction, index}
								<tr class="border-border/25 border-b hover:bg-surface-sunken">
									<td class="px-4 py-3">
										{stringValue(transaction.bookingDate)}
									</td>
									<td class="px-4 py-3">
										<button
											type="button"
											onclick={() => choose(`/transactions/${index}`)}
											class="text-left {edge(`/transactions/${index}`) ? 'cursor-crosshair' : ''}"
										>
											<span
												class={active(`/transactions/${index}`) ? 'rounded bg-info-surface/60 ring-2 ring-info' : ''}
												>{stringValue(transaction.description)}</span
											>
										</button>
									</td>
									<td class="px-4 py-3 text-foreground/50">
										{stringValue(transaction.counterpartyName, '')}
									</td>
									<td class="px-4 py-3 text-right font-mono font-semibold">
										{formatMoney(transaction.amountMinor, data.currency)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</article>
	{:else if validation}
		<div class="mx-auto max-w-3xl space-y-3">
			<div class="surface surface--raised surface--size-lg">
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-[length:var(--fs-micro)] text-foreground/35 uppercase tracking-wide">
							Validierung
						</p>
						<h3 class="mt-1 font-semibold text-lg">{stringValue(data.status)}</h3>
					</div>
					<div class="text-right">
						<p class="font-semibold text-2xl">{formatConfidence(data.coverageBps)}</p>
						<p class="text-foreground/35 text-xs">Abdeckung</p>
					</div>
				</div>
				<div class="mt-4 h-2 overflow-hidden rounded-full bg-surface-sunken">
					<div
						class="h-full rounded-full bg-primary"
						style:width={`${Math.max(0, Math.min(100, (Number(data.coverageBps) || 0) / 100))}%`}
					></div>
				</div>
			</div>
			{#each checks as check, index}
				<button
					type="button"
					onclick={() => choose(`/checks/${index}`)}
					class="flex w-full items-start gap-3 rounded-xl border border-border bg-surface-raised p-4 text-left hover:bg-surface-sunken"
				>
					<span
						class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs {check.status === 'pass' ? 'bg-success-surface text-success-ink' : check.status === 'fail' ? 'bg-error-surface text-error-ink' : 'bg-info-surface text-info-ink'}"
						>{check.status === 'pass' ? '✓' : check.status === 'fail' ? '×' : '?'}</span
					><span
						><strong class="block text-sm"
							>{stringValue(check.label, stringValue(check.key, `Prüfung ${index + 1}`))}</strong
						><span class="mt-0.5 block text-foreground/50 text-xs"
							>{stringValue(check.message, '')}</span
						></span
					>
				</button>
			{/each}
		</div>
	{:else}
		<div class="mx-auto max-w-3xl space-y-4">
			<header class="surface surface--raised surface--size-lg">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p
							class="text-[length:var(--fs-micro)] text-foreground/35 uppercase tracking-[var(--tracking-wider)]"
						>
							{typeKey}
						</p>
						<h3 class="mt-1 font-semibold text-xl capitalize">{title()}</h3>
					</div>
					{#if classification}
						<span class="rounded-full bg-primary/8 px-3 py-1 font-semibold text-primary text-xs"
							>{formatConfidence(data.confidenceBps)}</span
						>
					{/if}
				</div>
				{#if typeof data.summary === 'string'}
					<p class="mt-4 max-w-2xl text-foreground/65 text-sm leading-relaxed">{data.summary}</p>
				{/if}
			</header>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each genericKeys as key}
					{@const value = data[key]}
					{@const pointer = `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`}
					<button
						type="button"
						onclick={() => choose(pointer)}
						disabled={!edge(pointer)}
						class="min-w-0 rounded-xl border border-border bg-surface-raised p-4 text-left {edge(pointer) ? 'cursor-crosshair hover:border-info hover:bg-info-surface/40' : ''} {active(pointer) ? 'border-info ring-2 ring-info/50' : ''}"
					>
						<span
							class="block text-[length:var(--fs-micro)] text-foreground/35 uppercase tracking-wide"
							>{labelForKey(key)}</span
						>
						{#if key === 'confidenceBps'}
							<strong class="mt-1 block text-sm">{formatConfidence(value)}</strong>
						{:else if key === 'spans' && Array.isArray(value)}
							<strong class="mt-1 block text-sm"
								>{value.length.toLocaleString('de-DE')}
								Textbereiche</strong
							>
						{:else}
							<span class="mt-1 block break-words text-sm">{displayValue(value)}</span>
						{/if}
						{#if edge(pointer)}
							<span class="mt-2 block text-info-ink text-[length:var(--fs-micro)]"
								>▣ Quelle anzeigen</span
							>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
