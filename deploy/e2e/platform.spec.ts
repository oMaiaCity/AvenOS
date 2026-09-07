import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { expect, type Page, test } from '@playwright/test'
import pg from 'pg'
import { ACTOR_RUN_PROTOCOL } from '../../libs/aven-actors/src/index.js'
import {
	databaseNameForEnvironment,
	databaseRoleName,
	deriveDatabasePassword
} from '../../libs/aven-customer-contracts/src/index.js'
import { signWebhookHeaders } from '../../services/checkout/src/lib/server/billing/provider.js'
import { TauriSession } from './tauri-driver.js'

const identity = process.env.E2E_IDENTITY_ORIGIN as string
const identityBrowser = process.env.E2E_IDENTITY_BROWSER_ORIGIN as string
const checkout = process.env.E2E_CHECKOUT_ORIGIN as string
const checkoutBrowser = process.env.E2E_CHECKOUT_BROWSER_ORIGIN as string
const api = process.env.E2E_API_ORIGIN as string
const staticHost = process.env.E2E_STATIC_ORIGIN as string
const mailpit = process.env.E2E_MAILPIT_ORIGIN as string
const databaseUrl = process.env.E2E_DATABASE_URL as string
const tauriApplication = process.env.E2E_TAURI_APPLICATION as string
const tauriDriver = process.env.E2E_TAURI_DRIVER as string
const tauriFixture = process.env.E2E_TAURI_FIXTURE as string
const silentVoiceFixtureJson = process.env.E2E_SILENT_VOICE_FIXTURE as string
const silentDuplexFixtureJson = process.env.E2E_SILENT_DUPLEX_FIXTURE as string
const productionProvisioningSecret = 'identity-production-provisioning-secret-for-e2e-only'
const directorySecret = 'site-host-directory-token-for-e2e-only'

function requireEnvironment() {
	for (const [name, value] of Object.entries({
		identity,
		identityBrowser,
		checkout,
		checkoutBrowser,
		api,
		staticHost,
		mailpit,
		databaseUrl,
		tauriApplication,
		tauriDriver,
		tauriFixture,
		silentVoiceFixtureJson,
		silentDuplexFixtureJson
	}))
		if (!value) throw new Error(`${name} is required`)
}

interface SilentDuplexFixture {
	session_id: string
	turn_id: string
	narration_text: string
	interrupted: SilentVoiceFixture
	follow_up: SilentVoiceFixture
	fade_duration_ms: number
}

function silentDuplexFixture(): SilentDuplexFixture {
	const fixture = JSON.parse(silentDuplexFixtureJson) as Partial<SilentDuplexFixture>
	if (
		typeof fixture.session_id !== 'string' ||
		typeof fixture.turn_id !== 'string' ||
		typeof fixture.narration_text !== 'string' ||
		fixture.fade_duration_ms !== 80 ||
		!fixture.interrupted ||
		!fixture.follow_up ||
		fixture.interrupted.speaker_id === fixture.follow_up.speaker_id
	)
		throw new Error('silent duplex fixture is invalid')
	return fixture as SilentDuplexFixture
}

async function waitForE2eSpeaking(session: TauriSession, expected: boolean): Promise<void> {
	const deadline = Date.now() + 10_000
	while (Date.now() < deadline) {
		const speaking = await session.execute<string | null>(
			"return document.querySelector('[data-testid=\"e2e-voice-state\"]')?.getAttribute('data-speaking') ?? null"
		)
		if (speaking === String(expected)) return
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
	throw new Error(`Tauri voice playback did not become speaking=${expected}`)
}

interface SilentVoiceFixture {
	text: string
	session_id: string
	speaker_id: string
	confidence: number
}

function silentVoiceFixture(): SilentVoiceFixture {
	const fixture = JSON.parse(silentVoiceFixtureJson) as Partial<SilentVoiceFixture>
	if (
		typeof fixture.text !== 'string' ||
		typeof fixture.session_id !== 'string' ||
		!/^speaker-[1-9]\d*$/.test(fixture.speaker_id ?? '') ||
		typeof fixture.confidence !== 'number' ||
		fixture.confidence < 0 ||
		fixture.confidence > 1
	)
		throw new Error('silent voice fixture is invalid')
	return fixture as SilentVoiceFixture
}

interface TauriAcceptance {
	intentId: string
	sourceArtifactId: string
	extractedTextArtifactId: string
	serverSourceArtifactId: string
	serverExtractedTextArtifactId: string
	remoteReconciliationCandidateId: string
}

interface BrowsedArtifact {
	artifactId: string
	localKey: string
	typeKey: string
	inputs: Array<{ role: string; ordinal: number; artifactId: string }>
}

async function waitForDocumentGraph(
	artifactBase: string,
	authorizedHeaders: Record<string, string>,
	excludedSources: ReadonlySet<string>
): Promise<{ sourceId: string; extractedTextId: string; graph: BrowsedArtifact[] }> {
	let lastArtifactResponse = 'not requested'
	const deadline = Date.now() + 20_000
	while (Date.now() < deadline) {
		const response = await fetch(artifactBase, {
			headers: authorizedHeaders,
			signal: AbortSignal.timeout(10_000)
		})
		lastArtifactResponse = `${response.status} ${await response.clone().text()}`
		if (response.ok) {
			const browse = (await response.json()) as { artifacts: BrowsedArtifact[] }
			const source = browse.artifacts.find(
				(artifact) => artifact.typeKey === 'core.file' && !excludedSources.has(artifact.artifactId)
			)
			if (source) {
				const ids = new Set([source.artifactId])
				let changed = true
				while (changed) {
					changed = false
					for (const artifact of browse.artifacts) {
						if (
							!ids.has(artifact.artifactId) &&
							artifact.inputs.some((input) => ids.has(input.artifactId))
						) {
							ids.add(artifact.artifactId)
							changed = true
						}
					}
				}
				const graph = browse.artifacts.filter((artifact) => ids.has(artifact.artifactId))
				const extracted = graph.find(
					(artifact) => artifact.typeKey === 'docs.extracted-text' && artifact.inputs.length > 2
				)
				const aggregatedClassification = graph.find(
					(artifact) =>
						artifact.typeKey === 'core.content-classification' &&
						artifact.inputs.some((input) => input.role === 'page-classification')
				)
				if (
					extracted &&
					aggregatedClassification &&
					graph.some((artifact) => artifact.typeKey === 'core.file-inspection') &&
					graph.some((artifact) => artifact.typeKey === 'docs.text-layout')
				) {
					return { sourceId: source.artifactId, extractedTextId: extracted.artifactId, graph }
				}
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	throw new Error(`document import did not publish its complete graph: ${lastArtifactResponse}`)
}

async function canonicalDocumentGraph(
	artifactBase: string,
	authorizedHeaders: Record<string, string>,
	graph: BrowsedArtifact[]
) {
	const byId = new Map(graph.map((artifact) => [artifact.artifactId, artifact]))
	const derived = graph.filter((artifact) => artifact.typeKey !== 'core.file')
	const values = await Promise.all(
		derived.map(async (artifact) => {
			const envelope = (await json(
				await fetch(`${artifactBase}/${artifact.artifactId}`, { headers: authorizedHeaders })
			)) as { payload: unknown; blob?: unknown }
			let content: string | null = null
			if (envelope.blob) {
				const response = await fetch(`${artifactBase}/${artifact.artifactId}/content`, {
					headers: authorizedHeaders
				})
				expect(response.status).toBe(200)
				content = createHash('sha256')
					.update(new Uint8Array(await response.arrayBuffer()))
					.digest('hex')
			}
			return {
				localKey: artifact.localKey,
				typeKey: artifact.typeKey,
				payload: envelope.payload,
				content,
				inputs: artifact.inputs.map((input) => ({
					role: input.role,
					ordinal: input.ordinal,
					typeKey: byId.get(input.artifactId)?.typeKey ?? 'external',
					localKey: byId.get(input.artifactId)?.localKey ?? 'external'
				}))
			}
		})
	)
	return values.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

async function tauriAcceptance(
	page: import('@playwright/test').Page,
	environmentId: string,
	authorizedHeaders: Record<string, string>
): Promise<TauriAcceptance> {
	const session = await TauriSession.launch(tauriApplication, tauriDriver)
	try {
		await session.waitForBodyText('GERÄTECODE')
		const body = await session.bodyText()
		const code = body.match(/\b([A-Z0-9]{4})-([A-Z0-9]{4})\b/)
		if (!code) throw new Error(`Tauri did not display a device code:\n${body}`)
		await page.goto(`${identityBrowser}/device?user_code=${code[1]}${code[2]}`)
		await expect(page.getByRole('heading', { name: 'Authorize this device' })).toBeVisible()
		await page.getByRole('button', { name: 'Authorize' }).click()
		await expect(page.getByRole('heading', { name: 'Device connected' })).toBeVisible()
		await session.waitForBodyText('Process on')
		const dashboard = new URL(await session.url())
		dashboard.pathname = '/dashboard'
		dashboard.searchParams.set('e2eFixture', tauriFixture)
		dashboard.searchParams.set('e2ePlacement', 'local')
		await session.navigate(dashboard.toString())
		const importButton = await session.findEventually('[data-testid="e2e-import-fixture"]')
		await session.click(importButton)

		const artifactBase = `${api}/api/environments/${environmentId}/artifacts`
		const localDocument = await waitForDocumentGraph(artifactBase, authorizedHeaders, new Set())
		const sourceArtifactId = localDocument.sourceId
		const extractedTextArtifactId = localDocument.extractedTextId
		const fixture = await readFile(tauriFixture, 'utf8')
		for (const [artifactId, expected] of [
			[sourceArtifactId, fixture],
			[extractedTextArtifactId, fixture.trim()]
		] as const) {
			const content = await fetch(`${artifactBase}/${artifactId}/content`, {
				headers: authorizedHeaders
			})
			expect(content.status).toBe(200)
			expect(await content.text()).toBe(expected)
		}

		const intentBase = `${api}/api/environments/${environmentId}/intents`
		let intentId = ''
		const intentDeadline = Date.now() + 30_000
		while (Date.now() < intentDeadline) {
			const intents = (await json(
				await fetch(intentBase, { headers: authorizedHeaders })
			)) as Array<{
				id: string
				title: string
			}>
			intentId = intents.find((intent) => intent.title === 'e2e-document.txt')?.id ?? ''
			if (intentId) break
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		if (!intentId) throw new Error('Tauri import did not create its customer intent')

		dashboard.searchParams.set('e2ePlacement', 'server')
		await session.navigate(dashboard.toString())
		await session.click(await session.findEventually('[data-testid="e2e-import-fixture"]'))
		const serverDocument = await waitForDocumentGraph(
			artifactBase,
			authorizedHeaders,
			new Set([sourceArtifactId])
		)
		expect(serverDocument.sourceId).not.toBe(sourceArtifactId)
		expect(
			await canonicalDocumentGraph(artifactBase, authorizedHeaders, serverDocument.graph)
		).toEqual(await canonicalDocumentGraph(artifactBase, authorizedHeaders, localDocument.graph))
		for (const [artifactId, expected] of [
			[serverDocument.sourceId, fixture],
			[serverDocument.extractedTextId, fixture.trim()]
		] as const) {
			const content = await fetch(`${artifactBase}/${artifactId}/content`, {
				headers: authorizedHeaders
			})
			expect(content.status).toBe(200)
			expect(await content.text()).toBe(expected)
		}
		const localIntentId = intentId
		const serverIntentDeadline = Date.now() + 30_000
		while (Date.now() < serverIntentDeadline) {
			const intents = (await json(
				await fetch(intentBase, { headers: authorizedHeaders })
			)) as Array<{ id: string; title: string }>
			intentId =
				intents.find((intent) => intent.title === 'e2e-document.txt' && intent.id !== localIntentId)
					?.id ?? ''
			if (intentId) break
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		if (!intentId) throw new Error('server import did not create its customer intent')

		await session.execute(
			"window.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', bubbles: true }))"
		)
		const composer = await session.findEventually('textarea[placeholder="Sprich — oder schreib…"]')
		await session.type(composer, 'ello from Tauri E2E')
		await session.click(await session.find('button[aria-label="Senden"]'))
		await session.waitForBodyText('E2E chat reply.')

		let typedExchangePersisted = false
		const contributionDeadline = Date.now() + 30_000
		while (Date.now() < contributionDeadline) {
			const detail = (await json(
				await fetch(`${intentBase}/${intentId}`, { headers: authorizedHeaders })
			)) as {
				contributions: Array<{ contributorKind: string; text: string | null }>
			}
			if (
				detail.contributions.some(
					(entry) => entry.contributorKind === 'human' && entry.text === 'Hello from Tauri E2E'
				) &&
				detail.contributions.some(
					(entry) => entry.contributorKind === 'agent' && entry.text === 'E2E chat reply.'
				)
			) {
				typedExchangePersisted = true
				break
			}
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		if (!typedExchangePersisted)
			throw new Error('Tauri chat exchange was not persisted to the customer intent')

		const duplex = silentDuplexFixture()
		await session.execute(
			"window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', bubbles: true }))"
		)
		const narrationComposer = await session.findEventually(
			'textarea[placeholder="Sprich — oder schreib…"]'
		)
		await session.type(narrationComposer, 'tart E2E narrated answer')
		await session.click(await session.find('button[aria-label="Senden"]'))
		await session.waitForBodyText('E2E narration begins.')
		await session.click(await session.find('[data-testid="e2e-begin-narration"]'))
		await waitForE2eSpeaking(session, true)
		await session.click(await session.find('[data-testid="e2e-interrupt-narration"]'))
		await waitForE2eSpeaking(session, false)
		await session.waitForBodyText(duplex.interrupted.text)
		await new Promise((resolve) => setTimeout(resolve, 2_300))
		expect(await session.bodyText()).not.toContain('E2E narration tail must be cancelled.')

		let interruptedPersisted = false
		let interruptedContributions: Array<{
			contributorKind: string
			text: string | null
			payload: Record<string, unknown>
		}> = []
		const interruptedDeadline = Date.now() + 30_000
		while (Date.now() < interruptedDeadline) {
			const detail = (await json(
				await fetch(`${intentBase}/${intentId}`, { headers: authorizedHeaders })
			)) as {
				contributions: Array<{
					contributorKind: string
					text: string | null
					payload: Record<string, unknown>
				}>
			}
			interruptedContributions = detail.contributions
			const narrationIndex = detail.contributions.findIndex(
				(entry) => entry.contributorKind === 'human' && entry.text === 'Start E2E narrated answer'
			)
			const interruptedReplyIndex = detail.contributions.findIndex(
				(entry, index) =>
					index > narrationIndex &&
					entry.contributorKind === 'agent' &&
					entry.text?.startsWith('E2E narration begins.')
			)
			const voiceIndex = detail.contributions.findIndex(
				(entry, index) =>
					index > interruptedReplyIndex &&
					entry.contributorKind === 'human' &&
					entry.text === duplex.interrupted.text
			)
			if (
				narrationIndex >= 0 &&
				interruptedReplyIndex > narrationIndex &&
				voiceIndex > interruptedReplyIndex &&
				detail.contributions
					.slice(voiceIndex + 1)
					.some((entry) => entry.contributorKind === 'agent' && entry.text === 'E2E chat reply.')
			) {
				expect(detail.contributions[voiceIndex].payload).toEqual({
					anonymousSpeaker: {
						session_id: duplex.session_id,
						speaker_id: duplex.interrupted.speaker_id,
						confidence: duplex.interrupted.confidence
					}
				})
				interruptedPersisted = true
				break
			}
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		if (!interruptedPersisted)
			throw new Error(
				`PCM barge-in did not interrupt narration and reach the Intent Service: ${JSON.stringify(interruptedContributions)}`
			)

		await session.click(await session.find('[data-testid="e2e-second-speaker"]'))
		await session.waitForBodyText(duplex.follow_up.text)
		const secondSpeakerDeadline = Date.now() + 30_000
		while (Date.now() < secondSpeakerDeadline) {
			const detail = (await json(
				await fetch(`${intentBase}/${intentId}`, { headers: authorizedHeaders })
			)) as {
				contributions: Array<{
					contributorKind: string
					text: string | null
					payload: Record<string, unknown>
				}>
			}
			const firstSpeakerIndex = detail.contributions.findIndex(
				(entry) => entry.contributorKind === 'human' && entry.text === duplex.interrupted.text
			)
			const secondSpeakerIndex = detail.contributions.findIndex(
				(entry, index) =>
					index > firstSpeakerIndex &&
					entry.contributorKind === 'human' &&
					entry.text === duplex.follow_up.text
			)
			if (
				secondSpeakerIndex > firstSpeakerIndex &&
				detail.contributions
					.slice(secondSpeakerIndex + 1)
					.some((entry) => entry.contributorKind === 'agent' && entry.text === 'E2E chat reply.')
			) {
				expect(detail.contributions[secondSpeakerIndex].payload).toEqual({
					anonymousSpeaker: {
						session_id: duplex.session_id,
						speaker_id: duplex.follow_up.speaker_id,
						confidence: duplex.follow_up.confidence
					}
				})
				const remoteReconciliationCandidateId = await tauriReconciliation(
					session,
					dashboard,
					artifactBase,
					authorizedHeaders
				)
				return {
					intentId,
					sourceArtifactId,
					extractedTextArtifactId,
					serverSourceArtifactId: serverDocument.sourceId,
					serverExtractedTextArtifactId: serverDocument.extractedTextId,
					remoteReconciliationCandidateId
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		throw new Error('Second PCM speaker did not reach the Intent Service with a distinct label')
	} finally {
		await session.close()
	}
}

/** Real native import and human-confirmation surfaces; only the model provider is deterministic. */
async function tauriReconciliation(
	session: TauriSession,
	dashboard: URL,
	artifactBase: string,
	headers: Record<string, string>
) {
	const readType = async (typeKey: string) => {
		const response = await fetch(
			`${artifactBase}/query?typeKey=${encodeURIComponent(typeKey)}&limit=128`,
			{ headers, signal: AbortSignal.timeout(10_000) }
		)
		expect(response.status).toBe(200)
		return (
			(await response.json()) as {
				items: Array<{ artifactId: string; payload: Record<string, unknown> }>
			}
		).items
	}
	const waitForCount = async (typeKey: string, count: number) => {
		const documentTimeout = process.env.TEST_DOCUMENT_PROVIDER_BASE_URL ? 60_000 : 20_000
		const deadline = Date.now() + (typeKey === 'reconciliation.decision' ? 10_000 : documentTimeout)
		let diagnostics: unknown
		let previousProgress = ''
		while (Date.now() < deadline) {
			const items = await readType(typeKey)
			if (items.length === count) return items
			const sources = await readType('core.file')
			const state = await session.execute<{
				presentations: Array<{
					state: string
					stages?: Array<{ key: string; state: string; attemptCount?: number; lastError?: string }>
				} | null>
				body: string
			}>(
				`return {
			body: document.body.innerText,
			warnings: globalThis.__e2eDocumentWarnings ?? [],
			presentations: arguments[0].map(id => globalThis['aven.document-execution-router']?.status(id))
		}`,
				[sources.map((item) => item.artifactId)]
			)
			diagnostics = state
			const progress = JSON.stringify(
				state.presentations
					.filter((p) => p?.state === 'active')
					.map((p) =>
						p?.stages?.filter((s) =>
							['running', 'retry_wait', 'publishing', 'failed'].includes(s.state)
						)
					)
			)
			if (progress !== previousProgress) {
				console.info(`[native finance ${typeKey}] ${progress}`)
				previousProgress = progress
			}
			if (
				state.presentations.some(
					(item) => item && ['failed', 'needs_review'].includes(item.state)
				) ||
				state.body.includes('Could not persist')
			) {
				throw new Error(
					`Native financial flow reached a failed/review-required state: ${JSON.stringify(state)}`
				)
			}
			await new Promise((resolve) => setTimeout(resolve, 200))
		}
		throw new Error(
			`Native reconciliation did not commit ${count} ${typeKey} occurrences: ${JSON.stringify(diagnostics)}`
		)
	}
	let invoices = 0
	let transactions = 0
	let decisions = 0
	let remoteCandidateId = ''
	for (const placement of ['local', 'server']) {
		for (const kind of placement === 'local'
			? ['invoice', 'statement']
			: ['statement', 'invoice']) {
			dashboard.searchParams.set(
				'e2eFixture',
				new URL(`./fixtures/e2e-${kind}.pdf`, import.meta.url).pathname
			)
			dashboard.searchParams.set('e2ePlacement', placement)
			await session.navigate(dashboard.toString())
			await session.execute(`
				globalThis.__e2eDocumentWarnings = [];
				const original = console.warn;
				console.warn = (...args) => {
					globalThis.__e2eDocumentWarnings.push(args.map(arg => arg instanceof Error ? arg.name + ': ' + arg.message : String(arg)).join(' '));
					if (globalThis.__e2eDocumentWarnings.length > 20) globalThis.__e2eDocumentWarnings.shift();
					original.apply(console, args);
				};
			`)
			await session.click(await session.findEventually('[data-testid="e2e-import-fixture"]'))
			if (kind === 'invoice') await waitForCount('bookkeeping.open-item', ++invoices)
			else await waitForCount('banking.transaction', ++transactions)
		}
		await session.waitForBodyText('Confirm invoice-to-booking relationship', 15_000)
		const before = await readType('reconciliation.decision')
		expect(before).toHaveLength(decisions)
		const confirm = await session.findEventually(
			'.gate-card[data-held-id^="reconciliation:"] .btn--primary'
		)
		await session.click(confirm)
		const saved = await waitForCount('reconciliation.decision', ++decisions)
		const priorIds = new Set(before.map((item) => item.artifactId))
		const decision = saved.find((item) => !priorIds.has(item.artifactId))!
		expect(decision.payload).toMatchObject({ decision: 'accepted', relation: 'supports-booking' })
		if (placement === 'server') remoteCandidateId = String(decision.payload.candidateArtifactId)
		const candidate = (await json(
			await fetch(`${artifactBase}/${decision.payload.candidateArtifactId}`, { headers })
		)) as { payload: { amountDistanceMinor: number; transactionInputOrdinal: number } }
		expect(candidate.payload.amountDistanceMinor).toBe(0)
		const evidence = (await json(
			await fetch(`${artifactBase}/${decision.artifactId}/evidence`, { headers })
		)) as { artifactId: string; evidence: Array<{ inputArtifactId: string; inputRole: string }> }
		expect(evidence.artifactId).toBe(decision.artifactId)
		expect(evidence.evidence.map((item) => [item.inputRole, item.inputArtifactId])).toEqual([
			['match-candidate', decision.payload.candidateArtifactId],
			['open-item', decision.payload.openItemArtifactId],
			['transaction', decision.payload.transactionArtifactId]
		])
	}
	// CSV detection is a separate mandatory human decision. Even known, fully
	// parsed exports must contribute zero bookings before that physical click.
	let csvDetections = 0
	let csvConfirmations = 0
	const waitCsvCount = async (typeKey: string, count: number, timeoutMs = 10_000) => {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			const rows = await readType(typeKey)
			if (rows.length === count) return rows
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		throw new Error(
			`CSV gate did not commit ${count} ${typeKey}: ${await session.execute('return document.body.innerText')}`
		)
	}
	for (const placement of ['local', 'server']) {
		for (const accept of [false, true]) {
			const beforeTransactions = (await readType('banking.transaction')).length
			const beforeCandidates = (await readType('reconciliation.match-candidate')).length
			const beforeDecisions = (await readType('reconciliation.decision')).length
			dashboard.searchParams.set(
				'e2eFixture',
				new URL('../../fixtures/golden/bank-csv/nl-rabobank-official-layout.csv', import.meta.url)
					.pathname
			)
			dashboard.searchParams.set('e2ePlacement', placement)
			await session.navigate(dashboard.toString())
			await session.click(await session.findEventually('[data-testid="e2e-import-fixture"]'))
			await waitCsvCount('banking.csv-statement-detection', ++csvDetections)
			await session.waitForBodyText('Confirm this CSV is an account statement', 10_000)
			expect(await readType('banking.transaction')).toHaveLength(beforeTransactions)
			expect(await readType('reconciliation.match-candidate')).toHaveLength(beforeCandidates)
			expect(await readType('banking.csv-statement-confirmation')).toHaveLength(csvConfirmations)
			await session.click(
				await session.findEventually(
					`.gate-card[data-held-id^="csv-document:"] ${accept ? '.btn--primary' : '.btn:not(.btn--primary)'}`
				)
			)
			const confirmations = await waitCsvCount(
				'banking.csv-statement-confirmation',
				++csvConfirmations
			)
			expect(
				confirmations.filter((r) => r.payload.decision === (accept ? 'accepted' : 'rejected'))
			).toHaveLength(placement === 'local' ? 1 : 2)
			const bookings = await waitCsvCount(
				'banking.transaction',
				beforeTransactions + (accept ? 2 : 0)
			)
			if (accept)
				expect(
					bookings.filter((r) => r.payload.providerTransactionId === '000000000000000001').at(-1)
						?.payload
				).toMatchObject({ amountMinor: -11900, bookingDate: '2026-09-02', valueDate: '2026-09-03' })
			expect(await readType('reconciliation.decision')).toHaveLength(beforeDecisions)
			if (accept) {
				// Import the independently authored invoice only after CSV admission.
				// The existing same-amount PDF booking is a different supplier/reference.
				dashboard.searchParams.set(
					'e2eFixture',
					new URL(
						'../../fixtures/golden/reconciliation-market/de-business-invoice.pdf',
						import.meta.url
					).pathname
				)
				await session.navigate(dashboard.toString())
				await session.click(await session.findEventually('[data-testid="e2e-import-fixture"]'))
				await waitCsvCount(
					'bookkeeping.open-item',
					++invoices,
					process.env.TEST_DOCUMENT_PROVIDER_BASE_URL ? 60_000 : 20_000
				)
				await session.waitForBodyText('Confirm invoice-to-booking relationship', 15_000)
				expect(await readType('reconciliation.decision')).toHaveLength(beforeDecisions)
				await session.click(
					await session.findEventually('.gate-card[data-held-id^="reconciliation:"] .btn--primary')
				)
				const saved = await waitCsvCount('reconciliation.decision', beforeDecisions + 1)
				const matched = []
				for (const decision of saved) {
					const invoice = (await json(
						await fetch(`${artifactBase}/${decision.payload.openItemArtifactId}`, { headers })
					)) as { payload: Record<string, unknown> }
					if (invoice.payload.invoiceNumber !== 'RE-DE-1001') continue
					const transaction = (await json(
						await fetch(`${artifactBase}/${decision.payload.transactionArtifactId}`, { headers })
					)) as { payload: Record<string, unknown> }
					expect(transaction.payload).toMatchObject({
						providerTransactionId: '000000000000000001',
						amountMinor: -11900,
						sourceRow: 2
					})
					const evidence = (await json(
						await fetch(`${artifactBase}/${decision.artifactId}/evidence`, { headers })
					)) as { evidence: Array<{ inputRole: string; inputArtifactId: string }> }
					expect(evidence.evidence.map((e) => [e.inputRole, e.inputArtifactId])).toEqual([
						['match-candidate', decision.payload.candidateArtifactId],
						['open-item', decision.payload.openItemArtifactId],
						['transaction', decision.payload.transactionArtifactId]
					])
					matched.push(decision)
				}
				expect(matched).toHaveLength(placement === 'local' ? 1 : 2)
			}
		}
	}
	return remoteCandidateId
}

async function json(response: Response) {
	const body = await response.json().catch(() => null)
	if (!response.ok)
		throw new Error(`${response.url} returned ${response.status}: ${JSON.stringify(body)}`)
	return body
}

async function hostedDocument(
	origin: string,
	hostname: string
): Promise<{ ok: boolean; status: number; text: string }> {
	const url = new URL(origin)
	return new Promise((resolve, reject) => {
		const request = httpRequest(
			{
				hostname: url.hostname,
				port: url.port,
				path: '/',
				method: 'GET',
				headers: { host: hostname }
			},
			(response) => {
				const chunks: Buffer[] = []
				response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
				response.on('end', () => {
					const status = response.statusCode ?? 0
					resolve({
						ok: status >= 200 && status < 300,
						status,
						text: Buffer.concat(chunks).toString()
					})
				})
			}
		)
		request.on('error', reject)
		request.end()
	})
}

function leadingZeroBits(digest: Buffer, bits: number): boolean {
	const bytes = Math.floor(bits / 8)
	for (let index = 0; index < bytes; index += 1) if (digest[index] !== 0) return false
	const remaining = bits % 8
	return remaining === 0 || ((digest[bytes] ?? 255) & (0xff << (8 - remaining))) === 0
}

async function proofOfWork(purpose: string): Promise<string> {
	const challenge = (await json(
		await fetch(`${checkout}/api/pow/challenge?purpose=${encodeURIComponent(purpose)}`)
	)) as { id: string; nonce: string; purpose: string; difficultyBits: number }
	for (let counter = 0; counter < 10_000_000; counter += 1) {
		const digest = createHash('sha256')
			.update(`${challenge.id}:${challenge.nonce}:${challenge.purpose}:${counter}`)
			.digest()
		if (leadingZeroBits(digest, challenge.difficultyBits)) return `${challenge.id}.${counter}`
	}
	throw new Error('proof of work search limit exceeded')
}

interface MailSummary {
	ID: string
	Subject: string
}

async function waitForMail(
	subject: RegExp,
	content?: RegExp
): Promise<{ text: string; html: string }> {
	const deadline = Date.now() + 30_000
	while (Date.now() < deadline) {
		const list = (await json(await fetch(`${mailpit}/api/v1/messages`))) as {
			messages?: MailSummary[]
		}
		for (const message of list.messages ?? []) {
			if (!subject.test(message.Subject)) continue
			const detail = (await json(await fetch(`${mailpit}/api/v1/message/${message.ID}`))) as {
				Text?: string
				HTML?: string
			}
			if (!content || content.test(detail.Text ?? ''))
				return { text: detail.Text ?? '', html: detail.HTML ?? '' }
		}
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	throw new Error(`mail matching ${subject} did not arrive`)
}

function linkFrom(mail: { text: string; html: string }, host: string): string {
	const decoded = mail.html.replaceAll('&amp;', '&')
	const match = `${mail.text}\n${decoded}`.match(
		new RegExp(`https?://${host.replaceAll('.', '\\.')}[^\\s"<>]+`)
	)
	if (!match) throw new Error(`mail contained no ${host} link`)
	return match[0]
}

async function deviceSession(page: import('@playwright/test').Page): Promise<string> {
	const issued = (await json(
		await fetch(`${identity}/api/auth/device/code`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ client_id: 'ceo.aven.os' })
		})
	)) as {
		device_code: string
		verification_uri_complete: string
		user_code: string
		interval: number
	}
	await page.goto(issued.verification_uri_complete)
	await expect(page.getByRole('heading', { name: 'Authorize this device' })).toBeVisible()
	// The page shows the code ONCE, grouped for reading aloud — `ABCD-EFGH`, not
	// the raw string with a `Code:` prefix beside it. It used to show both, which
	// is the same code twice inside a `user-select: all` region, so a copy took
	// the label with it. Group it here the way the page does.
	const grouped = issued.user_code.replaceAll('-', '').replace(/(.{4})(?=.)/g, '$1-')
	await expect(page.getByText(grouped, { exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Authorize' }).click()
	await expect(page.getByRole('heading', { name: 'Device connected' })).toBeVisible()
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const response = await fetch(`${identity}/api/auth/device/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
				device_code: issued.device_code,
				client_id: 'ceo.aven.os'
			})
		})
		const body = (await response.json()) as { access_token?: string; error?: string }
		if (response.ok && body.access_token) return body.access_token
		if (!['authorization_pending', 'slow_down'].includes(body.error ?? ''))
			throw new Error(`device token failed: ${response.status} ${JSON.stringify(body)}`)
		await new Promise((resolve) => setTimeout(resolve, Math.max(issued.interval, 1) * 1000))
	}
	throw new Error('device token was not issued')
}

async function recordPasskeyCreation(page: Page) {
	await page.evaluate(() => {
		const create = navigator.credentials.create.bind(navigator.credentials)
		navigator.credentials.create = (options) => {
			if (options?.publicKey) {
				Reflect.set(globalThis, '__passkeyCreationLabels', {
					name: options.publicKey.user.name,
					displayName: options.publicKey.user.displayName,
					rpId: options.publicKey.rp.id
				})
			}
			// Observe the real call; the normal authenticator still performs it.
			return create(options)
		}
	})
}

test('fresh split stack: checkout, identity, facade, and managed hosting', async ({ browser }) => {
	requireEnvironment()
	const context = await browser.newContext()
	await context.credentials.install()
	const page = await context.newPage()

	await expect((await fetch(`${identity}/api/health/ready`)).status).toBe(200)
	await expect((await fetch(`${checkout}/api/health/ready`)).status).toBe(200)
	await expect((await fetch(`${api}/health/live`)).status).toBe(200)
	await expect((await fetch(`${api}/api/billing/me`)).status).toBe(401)
	await expect(
		(
			await fetch(`${identity}/internal/v1/authorizations/roles`, {
				method: 'POST',
				headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
				body: JSON.stringify({ subjectIds: [] })
			})
		).status
	).toBe(401)
	await expect(
		(
			await fetch(`${identity}/internal/v1/authorizations/roles`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${productionProvisioningSecret}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ subjectIds: [] })
			})
		).status
	).toBe(200)
	const ignoredDeliveryId = `msg_${crypto.randomUUID()}`
	const ignoredWebhookBody = JSON.stringify({
		type: 'future.feature.created',
		data: { id: crypto.randomUUID(), future: { retained: true } }
	})
	const ignoredWebhookHeaders = signWebhookHeaders(
		ignoredWebhookBody,
		'polar-webhook-e2e',
		ignoredDeliveryId
	)
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const response = await fetch(`${checkout}/api/webhooks/polar`, {
			method: 'POST',
			headers: { ...ignoredWebhookHeaders, 'content-type': 'application/json' },
			body: ignoredWebhookBody
		})
		expect(response.status).toBe(200)
	}

	const name = `e2e-${Date.now().toString(36)}`.slice(0, 28)
	const email = `${name}@example.test`
	const held = await fetch(`${checkout}/api/names/hold`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin: checkoutBrowser,
			'x-proof-of-work': await proofOfWork('secure-name')
		},
		body: JSON.stringify({ name, email, tier: 'aven-name' })
	})
	if (held.status !== 201) throw new Error(`name hold failed: ${held.status} ${await held.text()}`)

	const claimMail = await waitForMail(new RegExp(`Checkout link for ${name}`))
	const claimUrl = linkFrom(claimMail, new URL(checkoutBrowser).host)
	await page.goto(claimUrl)
	await expect(page.getByText(`${name}.aven.ceo`)).toBeVisible()
	await page.getByRole('button', { name: 'Pay' }).click()
	await expect(page).toHaveURL(/\/purchase\/success/)

	const setupMail = await waitForMail(new RegExp(`Login for ${name}`))
	let setupUrl = linkFrom(setupMail, new URL(identityBrowser).host)
	await page.goto(setupUrl)
	await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
	await expect(page).toHaveURL(`${identityBrowser}/dashboard`)
	// Pending onboarding remains cross-device, but neither browser receives normal service access.
	const pendingContext = await browser.newContext()
	const pendingPage = await pendingContext.newPage()
	await pendingPage.goto(setupUrl)
	await expect(pendingPage.getByRole('heading', { name: 'Your account' })).toBeVisible()
	expect((await pendingContext.request.get(`${identityBrowser}/api/auth/token`)).status()).toBe(403)
	expect((await context.request.get(`${identityBrowser}/api/auth/token`)).status()).toBe(403)
	const useNotice = await waitForMail(/Your aven.id account security/, /setup link was opened/)
	expect(useNotice.text).not.toContain('token=')
	// Exercise the public replacement action and its real per-account cooldown. No
	// test-only clock, privileged account edit, or direct database replacement is used.
	await expect(async () => {
		await page.getByRole('button', { name: 'Email a replacement setup link' }).click()
		await expect(page.getByRole('status')).toContainText('A replacement link is queued', {
			timeout: 1000
		})
	}).toPass({ timeout: 70_000, intervals: [10_000] })
	expect((await pendingContext.request.get(setupUrl)).status()).toBe(401)
	const replacement = await waitForMail(
		/Your aven.id account security/,
		/requested a replacement setup link/
	)
	setupUrl = linkFrom(replacement, new URL(identityBrowser).host)
	await page.goto(setupUrl)
	await pendingPage.goto(setupUrl)
	await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
	expect((await pendingContext.request.get(`${identityBrowser}/api/auth/token`)).status()).toBe(403)
	await expect(page.getByLabel('Name for your new passkey')).toHaveValue(
		new RegExp(`^aven\\.id-${email}-`)
	)
	const firstPasskeyName = `aven.id-${email}-My phone`
	await page.getByLabel('Name for your new passkey').fill(firstPasskeyName)
	await recordPasskeyCreation(page)
	expect(
		(
			await context.request.get(`${identityBrowser}/api/auth/passkey/generate-register-options`, {
				params: { name: 'x'.repeat(129) }
			})
		).status()
	).toBe(400)
	await page.getByRole('button', { name: 'Add passkey' }).click()
	await expect(page.getByRole('list', { name: 'Passkeys' }).getByRole('listitem')).toHaveCount(1)
	await expect(page.getByRole('list', { name: 'Passkeys' })).toContainText(firstPasskeyName)
	expect(await page.evaluate(() => Reflect.get(globalThis, '__passkeyCreationLabels'))).toEqual({
		name: firstPasskeyName,
		displayName: firstPasskeyName,
		rpId: 'localhost'
	})
	await page.getByRole('button', { name: /^Rename / }).click()
	await expect(page.getByLabel('Passkey name', { exact: true })).toHaveClass('field-control')
	await page.getByLabel('Passkey name', { exact: true }).fill('My everyday passkey')
	await page.getByRole('button', { name: 'Save name' }).click()
	await expect(
		page.getByRole('button', { name: 'Rename My everyday passkey', exact: true })
	).toBeVisible()
	await page.reload()
	await expect(page.getByRole('list', { name: 'Passkeys' })).toContainText('My everyday passkey')
	expect(
		await (await pendingContext.request.get(`${identityBrowser}/api/auth/get-session`)).json()
	).toBeNull()
	expect((await pendingContext.request.get(setupUrl)).status()).toBe(401)
	await pendingContext.close()
	const enrollmentNotice = await waitForMail(
		/Your aven.id account security/,
		/first passkey was registered/
	)
	expect(enrollmentNotice.text).not.toContain('token=')
	const [firstCredential] = await context.credentials.get({ rpId: 'localhost' })
	expect(firstCredential).toBeDefined()

	// A second passkey represents another authenticator/device. A conforming authenticator
	// refuses to enroll itself twice for the same account, so preserve the session in a new
	// browser context with a separate virtual authenticator.
	const secondContext = await browser.newContext({ storageState: await context.storageState() })
	await secondContext.credentials.install()
	const secondPage = await secondContext.newPage()
	// Account and passkey-list fetches finish independently. A late account must
	// never replace a name the user has already typed or intentionally cleared.
	for (const earlyName of ['My early choice', '']) {
		let releaseAccount = () => {}
		const accountGate = new Promise<void>((resolve) => {
			releaseAccount = resolve
		})
		await secondPage.route('**/api/auth/get-session**', async (route) => {
			await accountGate
			await route.continue()
		})
		try {
			await secondPage.goto(`${identityBrowser}/dashboard`)
			await expect(
				secondPage.getByRole('list', { name: 'Passkeys' }).getByRole('listitem')
			).toHaveCount(1)
			await expect(secondPage.locator('.flow-card-description')).toHaveText('Loading…')
			await secondPage.getByLabel('Name for your new passkey').fill('Temporary input')
			await secondPage.getByLabel('Name for your new passkey').fill(earlyName)
			releaseAccount()
			await expect(secondPage.locator('.flow-card-description')).toHaveText(email)
			await expect(secondPage.getByLabel('Name for your new passkey')).toHaveValue(earlyName)
		} finally {
			releaseAccount()
			await secondPage.unroute('**/api/auth/get-session**')
		}
	}
	await expect(secondPage.getByRole('button', { name: 'Add another passkey' })).toBeDisabled()
	await secondPage.getByLabel('Name for your new passkey').fill('Spare security key')
	await recordPasskeyCreation(secondPage)
	await secondPage.getByRole('button', { name: 'Add another passkey' }).click()
	await expect(
		secondPage.getByRole('list', { name: 'Passkeys' }).getByRole('listitem')
	).toHaveCount(2)
	expect(
		await secondPage.evaluate(() => Reflect.get(globalThis, '__passkeyCreationLabels'))
	).toEqual({
		name: 'Spare security key',
		displayName: 'Spare security key',
		rpId: 'localhost'
	})
	const [secondCredential] = await secondContext.credentials.get({ rpId: 'localhost' })
	await expect(secondPage.getByRole('list', { name: 'Passkeys' })).toContainText(
		'Spare security key'
	)
	expect(secondCredential).toBeDefined()
	expect(secondCredential.id).not.toBe(firstCredential.id)
	for (const width of [375, 1280]) {
		await secondPage.setViewportSize({ width, height: 900 })
		expect(
			await secondPage
				.getByLabel('Name for your new passkey')
				.evaluate((input) => input.getBoundingClientRect().height)
		).toBeGreaterThanOrEqual(44)
		expect(await secondPage.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
		await secondPage.screenshot({
			path: test.info().outputPath(`passkey-dashboard-${width}.png`),
			fullPage: true
		})
	}

	await secondPage.getByRole('button', { name: 'Sign out' }).click()
	await expect(secondPage).toHaveURL(`${identityBrowser}/login`)
	await secondPage.getByRole('button', { name: 'Continue with passkey' }).click()
	await expect(secondPage.getByRole('heading', { name: 'Your account' })).toBeVisible()

	const secondName = `${name}-other`.slice(0, 28)
	const secondNameHold = await fetch(`${checkout}/api/names/hold`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin: checkoutBrowser,
			'x-proof-of-work': await proofOfWork('secure-name')
		},
		body: JSON.stringify({ name: secondName, email, tier: 'aven-name' })
	})
	expect(secondNameHold.status).toBe(409)
	expect(await secondNameHold.json()).toMatchObject({ code: 'NAME_LIMIT_REACHED' })

	const sessionToken = await deviceSession(secondPage)
	const tokenBody = (await json(
		await fetch(`${identity}/api/auth/token`, {
			headers: { authorization: `Bearer ${sessionToken}` }
		})
	)) as { token: string }
	const claims = JSON.parse(Buffer.from(tokenBody.token.split('.')[1], 'base64url').toString()) as {
		sub: string
		iss: string
		aud: string
		amr: string[]
		scope: string
		exp: number
		iat: number
	}
	expect(claims.iss).toBe(identityBrowser)
	expect(claims.aud).toBe('aven-services')
	expect(claims.amr).toContain('passkey')
	expect(claims.scope.split(' ')).toContain('services:access')
	expect(claims.exp - claims.iat).toBeLessThanOrEqual(300)

	const authorizedHeaders = {
		authorization: `Bearer ${tokenBody.token}`,
		origin: checkoutBrowser
	}
	const llmModels = await fetch(`${api}/api/llm/models`, { headers: authorizedHeaders })
	expect(llmModels.status).toBe(200)
	expect(await llmModels.json()).toEqual({
		models: [
			{
				id: 'deepseek/deepseek-v4-flash-0731',
				label: 'E2E Chat',
				capabilities: ['streaming', 'text-generation', 'tool-calling']
			},
			{
				id: 'e2e/document',
				label: 'E2E Documents',
				capabilities: ['structured-output', 'text-generation', 'vision']
			}
		]
	})
	const llmCompletion = await fetch(`${api}/api/llm/v1/chat/completions`, {
		method: 'POST',
		headers: { ...authorizedHeaders, 'content-type': 'application/json' },
		body: JSON.stringify({
			model: 'deepseek/deepseek-v4-flash-0731',
			messages: [{ role: 'user', content: 'Prove the deterministic local LLM route.' }],
			stream: false
		})
	})
	expect(llmCompletion.status).toBe(200)
	expect(await llmCompletion.json()).toMatchObject({
		model: 'deepseek/deepseek-v4-flash-0731',
		choices: [{ message: { role: 'assistant', content: 'E2E chat reply.' } }],
		aven: {
			modelId: 'deepseek/deepseek-v4-flash-0731',
			providerReportedModel: 'e2e-chat'
		}
	})
	const billing = await fetch(`${api}/api/billing/me`, { headers: authorizedHeaders })
	await expect(billing.status).toBe(200)
	await expect(billing.headers.get('access-control-allow-origin')).toBe(checkoutBrowser)
	await expect(await billing.json()).toEqual({ subscriptions: [] })

	const forged = await fetch(`${api}/api/billing/me`, {
		headers: { ...authorizedHeaders, 'x-aven-subject': 'forged', 'x-aven-role': 'admin' }
	})
	await expect(forged.status).toBe(200)
	const facadeOnly = await fetch(`${checkout}/api/billing/me`, {
		headers: { authorization: 'Bearer checkout-facade-token-for-e2e-only' }
	})
	await expect(facadeOnly.status).toBe(401)

	let environment:
		| {
				id: string
				observedState: string
				routingGeneration: number
				components: { componentRef: string; observedState: string }[]
		  }
		| undefined
	const environmentDeadline = Date.now() + 60_000
	while (Date.now() < environmentDeadline) {
		const response = await fetch(`${api}/api/environments`, { headers: authorizedHeaders })
		expect(response.status).toBe(200)
		const body = (await response.json()) as { environments: (typeof environment)[] }
		environment = body.environments.find(
			(candidate) =>
				candidate.observedState === 'ready' &&
				candidate.components.every((component) => component.observedState === 'ready')
		)
		if (environment) break
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	if (!environment) throw new Error('customer environment did not reconcile')
	const tauri = await tauriAcceptance(secondPage, environment.id, authorizedHeaders)
	const secondEntitlement = await fetch(`${api}/internal/v1/customer-entitlement-events`, {
		method: 'POST',
		headers: {
			authorization: 'Bearer customer-entitlement-token-for-e2e',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			eventId: crypto.randomUUID(),
			eventType: 'purchase_granted',
			subjectId: claims.sub,
			purchasedName: `${name}-second`,
			occurredAt: new Date().toISOString()
		})
	})
	expect(secondEntitlement.status).toBe(201)
	let secondEnvironment: typeof environment | undefined
	const secondEnvironmentDeadline = Date.now() + 60_000
	while (Date.now() < secondEnvironmentDeadline) {
		const body = (await json(
			await fetch(`${api}/api/environments`, { headers: authorizedHeaders })
		)) as { environments: (typeof environment)[] }
		secondEnvironment = body.environments.find(
			(candidate) =>
				candidate.id !== environment.id &&
				candidate.observedState === 'ready' &&
				candidate.components.every((component) => component.observedState === 'ready')
		)
		if (secondEnvironment) break
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	if (!secondEnvironment) throw new Error('second customer environment did not reconcile')

	const intentBase = `${api}/api/environments/${environment.id}/intents`
	const targetIntentId = crypto.randomUUID()
	const sourceIntentId = crypto.randomUUID()
	for (const [id, title] of [
		[targetIntentId, 'Target conversation'],
		[sourceIntentId, 'Source conversation']
	] as const) {
		const response = await fetch(intentBase, {
			method: 'POST',
			headers: { ...authorizedHeaders, 'content-type': 'application/json' },
			body: JSON.stringify({ id, title })
		})
		expect(response.status).toBe(201)
	}
	const secondIntentId = crypto.randomUUID()
	expect(
		(
			await fetch(`${api}/api/environments/${secondEnvironment.id}/intents`, {
				method: 'POST',
				headers: { ...authorizedHeaders, 'content-type': 'application/json' },
				body: JSON.stringify({ id: secondIntentId, title: 'Second customer only' })
			})
		).status
	).toBe(201)
	const firstList = (await json(await fetch(intentBase, { headers: authorizedHeaders }))) as {
		id: string
	}[]
	expect(firstList.map((intent) => intent.id)).not.toContain(secondIntentId)
	// The same still-valid identity token must obey current database membership.
	const membershipDatabase = new pg.Pool({
		connectionString: databaseUrl.replace(/\/postgres$/, '/aven_api'),
		max: 1
	})
	try {
		await membershipDatabase.query(
			'UPDATE customer_environment_memberships SET role=$1 WHERE environment_id=$2 AND subject_id=$3',
			['member', environment.id, claims.sub]
		)
		expect((await fetch(intentBase, { headers: authorizedHeaders })).status).toBe(200)
		expect(
			(
				await fetch(`${intentBase}/${targetIntentId}`, {
					method: 'DELETE',
					headers: authorizedHeaders
				})
			).status
		).toBe(403)
		expect(
			(await fetch(`${intentBase}/${targetIntentId}`, { headers: authorizedHeaders })).status
		).toBe(200)
		await membershipDatabase.query(
			'DELETE FROM customer_environment_memberships WHERE environment_id=$1 AND subject_id=$2',
			[environment.id, claims.sub]
		)
		expect((await fetch(intentBase, { headers: authorizedHeaders })).status).toBe(404)
		// Membership in the other environment is unaffected.
		expect(
			(
				await fetch(`${api}/api/environments/${secondEnvironment.id}/intents`, {
					headers: authorizedHeaders
				})
			).status
		).toBe(200)
	} finally {
		await membershipDatabase.query(
			`INSERT INTO customer_environment_memberships(environment_id,subject_id,role)
			VALUES($1,$2,'owner') ON CONFLICT(environment_id,subject_id) DO UPDATE SET role='owner'`,
			[environment.id, claims.sub]
		)
		await membershipDatabase.end()
	}
	expect((await fetch(intentBase, { headers: authorizedHeaders })).status).toBe(200)
	const voiceFixture = silentVoiceFixture()
	const anonymousSpeaker = {
		session_id: voiceFixture.session_id,
		speaker_id: voiceFixture.speaker_id,
		confidence: voiceFixture.confidence
	}
	const contribution = {
		id: crypto.randomUUID(),
		contributorKind: 'human',
		kind: 'message',
		text: voiceFixture.text,
		payload: { anonymousSpeaker }
	}
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const response = await fetch(`${intentBase}/${targetIntentId}`, {
			method: 'POST',
			headers: { ...authorizedHeaders, 'content-type': 'application/json' },
			body: JSON.stringify(contribution)
		})
		expect(response.status).toBe(201)
	}
	const targetDetail = (await json(
		await fetch(`${intentBase}/${targetIntentId}`, { headers: authorizedHeaders })
	)) as { version: number; contributions: Array<Record<string, unknown>> }
	expect(targetDetail.version).toBe(2)
	expect(targetDetail.contributions).toHaveLength(2)
	expect(targetDetail.contributions[1]).toMatchObject({
		text: voiceFixture.text,
		payload: { anonymousSpeaker }
	})
	const sourceDetail = (await json(
		await fetch(`${intentBase}/${sourceIntentId}`, { headers: authorizedHeaders })
	)) as { version: number }
	const mergeCommand = {
		id: targetIntentId,
		commandId: crypto.randomUUID(),
		expectedVersion: targetDetail.version,
		sources: [{ id: sourceIntentId, expectedVersion: sourceDetail.version }]
	}
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const response = await fetch(`${intentBase}/${targetIntentId}/merge`, {
			method: 'POST',
			headers: { ...authorizedHeaders, 'content-type': 'application/json' },
			body: JSON.stringify(mergeCommand)
		})
		expect(response.status).toBe(200)
	}

	const actorBase = `${api}/api/environments/${environment.id}/actor-runs`
	const actorStart = await fetch(actorBase, {
		method: 'POST',
		headers: {
			...authorizedHeaders,
			'content-type': 'application/json',
			'x-aven-tenant-grant': 'forged-caller-grant'
		},
		body: JSON.stringify({
			protocol: ACTOR_RUN_PROTOCOL,
			requestId: crypto.randomUUID(),
			idempotencyKey: crypto.randomUUID(),
			requestedAt: new Date().toISOString(),
			skillRef: 'ceo.aven:skill:e2e:already-satisfied@1',
			executionEnvironment: 'server',
			ingredients: [{ predicate: 'ceo.aven.e2e.done(test)' }],
			goals: ['ceo.aven.e2e.done(test)'],
			parameters: {}
		})
	})
	expect(actorStart.status).toBe(202)
	const actorHandle = (await actorStart.json()) as { runId: string }
	let actorRecord: { state: string; security: { access: { tenantId?: string } } } | undefined
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const response = await fetch(`${actorBase}/${actorHandle.runId}`, {
			headers: authorizedHeaders
		})
		expect(response.status).toBe(200)
		actorRecord = await response.json()
		if (actorRecord.state === 'succeeded') break
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
	expect(actorRecord).toMatchObject({
		state: 'succeeded',
		security: { access: { tenantId: environment.id } }
	})

	const admin = new pg.Pool({ connectionString: databaseUrl, max: 1 })
	try {
		const customerDatabase = databaseNameForEnvironment(environment.id)
		const secondCustomerDatabase = databaseNameForEnvironment(secondEnvironment.id)
		expect(secondCustomerDatabase).not.toBe(customerDatabase)
		expect(
			(
				await admin.query("SELECT has_database_privilege('aven_backup',$1,'CONNECT') AS allowed", [
					customerDatabase
				])
			).rows[0].allowed
		).toBe(true)
		expect(
			(
				await admin.query(
					"SELECT rolcanlogin,rolinherit,pg_has_role('aven_backup','pg_read_all_data','MEMBER') AS reader FROM pg_roles WHERE rolname='aven_backup'"
				)
			).rows[0]
		).toEqual({ rolcanlogin: true, rolinherit: true, reader: true })
		const backupDatabaseUrl = new URL(databaseUrl)
		backupDatabaseUrl.username = 'aven_backup'
		backupDatabaseUrl.password = 'platform-backup-e2e'
		backupDatabaseUrl.pathname = `/${customerDatabase}`
		const backupDatabase = new pg.Pool({ connectionString: backupDatabaseUrl.toString(), max: 1 })
		try {
			expect(
				(await backupDatabase.query('SELECT count(*)::int AS count FROM aven_intents.intents'))
					.rows[0].count
			).toBeGreaterThan(0)
			await expect(backupDatabase.query('DELETE FROM aven_intents.intents')).rejects.toThrow(
				/permission denied/
			)
		} finally {
			await backupDatabase.end()
		}
		const apiDatabase = new pg.Pool({
			connectionString: databaseUrl.replace(/\/postgres$/, '/aven_api'),
			max: 1
		})
		try {
			expect(
				(await apiDatabase.query("SELECT to_regnamespace('aven_intents') AS schema")).rows[0].schema
			).toBeNull()
		} finally {
			await apiDatabase.end()
		}
		const checkoutDatabase = new pg.Pool({
			connectionString: databaseUrl.replace(/\/postgres$/, '/aven_checkout'),
			max: 1
		})
		try {
			const heartbeat = (
				await checkoutDatabase.query(
					"SELECT metadata FROM worker_heartbeats WHERE worker_name='email-worker'"
				)
			).rows[0]?.metadata
			expect(heartbeat.providerHealth.code).toBe('SMTP_PROVIDER_NOT_OBSERVABLE')
			expect(heartbeat.providerHealth.healthy).toBe(false)
			expect(Date.now() - heartbeat.providerHealth.checkedAt).toBeLessThan(180_000)
			expect(Object.keys(heartbeat.providerHealth).sort()).toEqual(['checkedAt', 'code', 'healthy'])
			const delivery = (
				await checkoutDatabase.query(
					`SELECT event_type,payload,state,attempt_count
					 FROM polar_webhook_deliveries WHERE delivery_id=$1`,
					[ignoredDeliveryId]
				)
			).rows[0]
			expect(delivery).toEqual({
				event_type: 'future.feature.created',
				payload: JSON.parse(ignoredWebhookBody),
				state: 'processed',
				attempt_count: 1
			})
		} finally {
			await checkoutDatabase.end()
		}
		const customer = new pg.Pool({
			connectionString: databaseUrl.replace(/\/postgres$/, `/${customerDatabase}`),
			max: 1
		})
		try {
			const duplex = silentDuplexFixture()
			expect(
				(await customer.query('SELECT count(*)::int AS count FROM aven_intents.intents')).rows[0]
					.count
			).toBe(14)
			expect(
				(
					await customer.query(
						`SELECT count(*)::int AS count FROM aven_intents.contributions
						 WHERE intent_id=$1
						   AND (text = ANY($2::text[]) OR text LIKE 'E2E narration begins.%')`,
						[
							tauri.intentId,
							[
								'Hello from Tauri E2E',
								'E2E chat reply.',
								'Start E2E narrated answer',
								duplex.interrupted.text,
								duplex.follow_up.text
							]
						]
					)
				).rows[0].count
			).toBe(8)
			expect(
				(
					await customer.query(
						`SELECT count(*)::int AS count FROM artifact_store.artifact_records
						 WHERE id = ANY($1::uuid[])`,
						[
							[
								tauri.sourceArtifactId,
								tauri.extractedTextArtifactId,
								tauri.serverSourceArtifactId,
								tauri.serverExtractedTextArtifactId
							]
						]
					)
				).rows[0].count
			).toBe(4)
			const retainedRuns = (
				await customer.query('SELECT record FROM aven_actor_runs.runs')
			).rows.map((row) => row.record)
			const documentRuns = retainedRuns.filter(
				(run) => run.skillRef === 'ceo.aven:skill:docs.ingest:document-ingest@1'
			)
			// Three original document runs, two remote CSV detections, and the
			// accepted CSV's new observation after its human confirmation, plus
			// the invoice imported to prove its separate relationship decision.
			expect(documentRuns).toHaveLength(7)
			expect(documentRuns.every((run) => run.state === 'succeeded')).toBe(true)
			const reconciliationRuns = retainedRuns.filter(
				(run) => run.skillRef === 'ceo.aven:skill:bookkeeping:invoice-reconciliation@2'
			)
			// Restoring a file can trigger an additional read-only reconciliation. Prove
			// the required financial runs and exact remote candidate, not a timing-dependent total.
			expect(reconciliationRuns.length).toBeGreaterThanOrEqual(2)
			expect(
				reconciliationRuns.some(
					(run) =>
						run.state === 'succeeded' &&
						run.checkpoints.some((checkpoint: { artifactIds: string[] }) =>
							checkpoint.artifactIds.includes(tauri.remoteReconciliationCandidateId)
						)
				)
			).toBe(true)
			expect(
				retainedRuns.filter((run) => run.skillRef === 'ceo.aven:skill:e2e:already-satisfied@1')
			).toHaveLength(1)
			const documentRun = (
				await customer.query(
					`SELECT record FROM aven_actor_runs.runs
					 WHERE record->>'skillRef'='ceo.aven:skill:docs.ingest:document-ingest@1'
					 AND record->'parameters'->'source'->>'artifactId'=$1`,
					[tauri.serverSourceArtifactId]
				)
			).rows[0]?.record as
				| {
						state: string
						checkpoints: Array<{
							artifactIds: string[]
							output?: { presentation?: { metadata?: Record<string, unknown> } }
						}>
				  }
				| undefined
			expect(documentRun).toMatchObject({
				state: 'succeeded',
				checkpoints: [
					{
						output: {
							presentation: {
								metadata: {
									executionEnvironment: 'server',
									runtimeHost: 'actor-runner'
								}
							}
						}
					}
				]
			})
			expect(documentRun?.checkpoints[0]?.artifactIds).toContain(
				tauri.serverExtractedTextArtifactId
			)
			const intentRole = databaseRoleName(environment.id, 'int_api')
			const actorRole = databaseRoleName(environment.id, 'act_api')
			const artifactRole = databaseRoleName(environment.id, 'art_api')
			const privileges = (
				await customer.query(
					`SELECT has_table_privilege($1,'aven_intents.intents','SELECT') AS intent_read,
					 has_table_privilege($1,'aven_actor_runs.runs','SELECT') AS actor_read,
					 has_table_privilege($2,'aven_actor_runs.runs','SELECT') AS actor_own,
					 has_table_privilege($2,'aven_intents.intents','SELECT') AS intent_cross,
					 has_table_privilege($3,'artifact_store.artifact_records','SELECT') AS artifact_own,
					 has_table_privilege($3,'aven_intents.intents','SELECT') AS artifact_cross,
					 has_table_privilege($1,'artifact_store.artifact_records','SELECT') AS intent_artifact_cross`,
					[intentRole, actorRole, artifactRole]
				)
			).rows[0]
			expect(privileges).toEqual({
				intent_read: true,
				actor_read: false,
				actor_own: true,
				intent_cross: false,
				artifact_own: true,
				artifact_cross: false,
				intent_artifact_cross: false
			})
		} finally {
			await customer.end()
		}
		const secondCustomer = new pg.Pool({
			connectionString: databaseUrl.replace(/\/postgres$/, `/${secondCustomerDatabase}`),
			max: 1
		})
		try {
			expect(
				(await secondCustomer.query('SELECT count(*)::int AS count FROM aven_intents.intents'))
					.rows[0].count
			).toBe(1)
		} finally {
			await secondCustomer.end()
		}
		const crossDatabaseUrl = new URL(databaseUrl)
		crossDatabaseUrl.username = databaseRoleName(environment.id, 'int_api')
		crossDatabaseUrl.password = deriveDatabasePassword({
			root: 'intent-root-00000000000000000000000000000001',
			environmentId: environment.id,
			routingGeneration: environment.routingGeneration,
			roleKind: 'ceo.aven:db-role:intents:api@1'
		})
		crossDatabaseUrl.pathname = `/${secondCustomerDatabase}`
		const crossDatabase = new pg.Pool({ connectionString: crossDatabaseUrl.toString(), max: 1 })
		try {
			await expect(crossDatabase.query('SELECT 1')).rejects.toThrow(/permission denied/)
		} finally {
			await crossDatabase.end()
		}
	} finally {
		await admin.end()
	}

	const created = await fetch(`${api}/api/sites`, {
		method: 'POST',
		headers: { ...authorizedHeaders, 'content-type': 'application/json' },
		body: JSON.stringify({
			hostname: `${name}.example.test`,
			repository: 'myavenceo/aven-brands',
			sourceBranch: 'production',
			deploymentBranch: `deploy/${name}`
		})
	})
	if (created.status !== 201)
		throw new Error(`site creation failed: ${created.status} ${await created.text()}`)
	const createdSite = (await created.json()) as { site: { id: string }; dns: { txtName: string } }
	expect(createdSite.dns.txtName).toBe(`_aven-site.${name}.example.test`)
	await expect(
		(
			await fetch(`${api}/api/sites/${createdSite.site.id}`, {
				method: 'DELETE',
				headers: authorizedHeaders
			})
		).status
	).toBe(200)

	await expect(
		(
			await fetch(`${api}/internal/v1/static-sites/bindings`, {
				headers: { authorization: 'Bearer wrong' }
			})
		).status
	).toBe(404)
	const directory = (await json(
		await fetch(`${api}/internal/v1/static-sites/bindings`, {
			headers: { authorization: `Bearer ${directorySecret}` }
		})
	)) as { bindings: { hostname: string; verification_mode: string; owner_is_admin: boolean }[] }
	expect(directory.bindings).toContainEqual(
		expect.objectContaining({
			hostname: 'aven.ceo',
			verification_mode: 'operator',
			owner_is_admin: true
		})
	)

	const staticDeadline = Date.now() + 90_000
	let hosted: Awaited<ReturnType<typeof hostedDocument>> | null = null
	while (Date.now() < staticDeadline) {
		hosted = await hostedDocument(staticHost, 'aven.ceo')
		if (hosted.ok) break
		await new Promise((resolve) => setTimeout(resolve, 1_000))
	}
	if (!hosted?.ok) throw new Error(`aven.ceo managed release was not served (${hosted?.status})`)
	expect(hosted.text.toLowerCase()).toContain('aven')

	const secondProvision = await fetch(`${identity}/internal/v1/accounts`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${productionProvisioningSecret}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ email, source: 'e2e-idempotence' })
	})
	await expect(secondProvision.status).toBe(200)
	await expect((await secondProvision.json()).setupUrl).toBeNull()

	await secondContext.close()
	await context.close()
})
