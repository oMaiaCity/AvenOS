<script lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { onMount, untrack } from 'svelte'
import { dev } from '$app/environment'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { chatActor } from '$lib/actors/chat.actor.svelte'
import { hitlQueue } from '$lib/actors/hitl.svelte'
import { listenerActor } from '$lib/actors/listener.actor.svelte'
import { speakerActor } from '$lib/actors/speaker.actor.svelte'
import { anonymousSpeakerPayload } from '$lib/chat/anonymous-speaker'
import { voiceController } from '$lib/voice/controller.svelte'
import '$lib/actors/windows'
import ArtifactsPage from '$lib/artifacts/ArtifactsPage.svelte'
import {
	documentExecutionPreference,
	ingestDroppedFiles,
	ingestFile,
	loadPersistentIntents,
	refreshIntent
} from '$lib/artifacts/ingest.svelte'
import { composer } from '$lib/intents/composer.svelte'
import IntentsPlaceholder from '$lib/intents/IntentsPlaceholder.svelte'
import { intents } from '$lib/intents/intents.svelte'
import { shell } from '$lib/intents/talk.svelte'
import SkillsPlatform from '$lib/skills/SkillsPlatform.svelte'

/**
 * Dashboard — a chat against RedPill's confidential Gemma
 * (`phala/gemma-4-31b-it`), streamed token by token, spoken aloud in German by
 * Supertonic as it arrives, and listened to with Nemotron + Silero VAD.
 *
 * The split is deliberate: the brain is remote and attested, the voice is
 * entirely on-device.
 */

/**
 * The page constructs nothing. The mesh assembles itself in the actor
 * modules — registration, contracts, the emit wiring — and this file merely
 * renders the actors' state. The aliases keep the template readable.
 */
const speaker = speakerActor.core
const chat = chatActor.core
const listener = listenerActor.core

interface ArtifactUploadProgress {
	uploadId: string
	phase: 'preparing' | 'uploading' | 'finalizing'
	sent: number
	total: number
}

let fileHovering = $state(false)

/**
 * Which surface fills the middle of the screen — driven by the left rail
 * now that the tab bar is gone: the intents workspace, or the skills
 * platform. One store, so the rail and the shell never disagree.
 */

/**
 * Voice is the default, except where there is no voice.
 *
 * In a plain browser tab the recognizer is unavailable, and starting in voice
 * mode there means an empty panel with no way to say anything until you find
 * the icon. Text is the only mode that works, so it is the one to start in.
 */
/**
 * Dev only: `?voice=<phase>` in a browser tab fakes the voice UI so the pill
 * can be styled without a Tauri build — `idle`, `hearing`, `speaking`,
 * `thinking`, `loading`, `blocked`, `denied`, `error`. No mic, no TTS: the
 * phase is painted, not produced. Production ignores the parameter.
 */
const MOCK_PHASES = {
	idle: 'Ready',
	hearing: 'Listening',
	speaking: 'Speaking',
	thinking: 'Thinking',
	loading: 'Ears loading 42%',
	blocked: 'Enable audio',
	denied: 'No microphone',
	error: 'Error'
} as const
const mockPhase = $derived.by(() => {
	if (!dev) return null
	const v = page.url.searchParams.get('voice')
	return v !== null && v in MOCK_PHASES ? (v as keyof typeof MOCK_PHASES) : null
})
const voiceUi = $derived(isTauri() || mockPhase !== null)
const e2eFixture = $derived(
	import.meta.env.VITE_AVEN_E2E === 'true' ? page.url.searchParams.get('e2eFixture') : null
)
const e2ePlacement = $derived(
	page.url.searchParams.get('e2ePlacement') === 'server' ? 'server' : 'local'
)

async function importE2eFixture() {
	if (e2eFixture) await ingestFile(e2eFixture, e2ePlacement)
}

let e2eDuplexSession: string | null = null

async function beginE2eNarration() {
	if (!e2eFixture) return
	try {
		speaker.muted = true
		const fixture = await invoke<{ session_id: string }>('voice_e2e_duplex_fixture')
		e2eDuplexSession = fixture.session_id
		await voiceController.attachE2eSession(fixture.session_id)
		await invoke('voice_e2e_begin_narration', { sessionId: fixture.session_id })
	} catch (error) {
		chat.failure = `Could not begin the silent duplex proof: ${String(error)}`
	}
}

async function interruptE2eNarration() {
	if (!e2eFixture) return
	try {
		if (!e2eDuplexSession) throw new Error('The duplex proof has no active session.')
		await invoke('voice_e2e_inject_interruption', { sessionId: e2eDuplexSession })
	} catch (error) {
		chat.failure = `Could not inject the silent interruption: ${String(error)}`
	}
}

async function injectE2eSecondSpeaker() {
	if (!e2eFixture) return
	try {
		if (!e2eDuplexSession) throw new Error('The duplex proof has no active session.')
		await invoke('voice_e2e_inject_second_speaker', { sessionId: e2eDuplexSession })
	} catch (error) {
		chat.failure = `Could not inject the second silent speaker: ${String(error)}`
	}
}

/**
 * Whether the conversation is running at all — on by default, because
 * hands-free IS the product. There is no separate text mode any more: the
 * composer in the conversation's footer is always there, so you can write,
 * speak, or both, while the ears are open. Ending means the ears close (the
 * OS mic indicator goes dark), the voice goes silent, and the pill shrinks
 * to the logo — one tap to come back. Writing still works while ended; the
 * reply is then read, not heard.
 */
let conversing = $state(isTauri() && import.meta.env.VITE_AVEN_E2E !== 'true')

// The mock enters the conversation without opening anything.
$effect.pre(() => {
	if (mockPhase !== null) conversing = true
})

// Hands-free by default: the mic opens as soon as the page does.
//
// `onMount`, emphatically not `$effect`. An effect tracks what its body reads,
// and `start()` both reads and writes `listener.status` — so the write
// invalidated the effect, the cleanup tore the audio graph down, and it started
// over, forever. The microphone was genuinely open the whole time (macOS even
// showed the orange indicator), but the worklet never survived long enough to
// deliver a single batch.
onMount(() => {
	if (conversing && mockPhase === null) void listener.start()
	return () => listener.stop()
})

onMount(() => {
	if (!isTauri()) return
	let disposed = false
	let stopDrop: (() => void) | undefined
	let stopProgress: (() => void) | undefined
	let contributionPersistence = Promise.resolve()
	const webview = getCurrentWebview()
	void loadPersistentIntents().catch((error) => {
		chat.failure = `Could not load persistent intents: ${String(error)}`
	})
	chat.onExchange = (session, user, assistant) => {
		if (!intents.items.find((intent) => intent.id === session)?.persistent) return
		// Exchange callbacks can overlap when a barge-in aborts one response and
		// immediately submits the final utterance. Preserve the chat's settled
		// order at the Intent boundary instead of racing two append pairs.
		contributionPersistence = contributionPersistence
			.then(async () => {
				for (const turn of [user, assistant]) {
					if (turn.content === '') continue
					await invoke('intent_append_contribution', {
						intentId: session,
						contribution: {
							id: turn.id,
							contributorKind: turn.role === 'user' ? 'human' : 'agent',
							kind: 'message',
							text: turn.content,
							payload: anonymousSpeakerPayload(turn.anonymousSpeaker)
						}
					})
				}
				await refreshIntent(session)
			})
			.catch((error) => {
				chat.failure = `Could not persist the conversation: ${String(error)}`
			})
	}

	void webview
		.onDragDropEvent(({ payload }) => {
			if (payload.type === 'enter' || payload.type === 'over') {
				fileHovering = true
				return
			}
			fileHovering = false
			if (payload.type === 'drop') void ingestDroppedFiles(payload.paths)
		})
		.then((unlisten) => {
			if (disposed) unlisten()
			else stopDrop = unlisten
		})
		.catch((error) => {
			chat.failure = `Could not enable file dropping: ${String(error)}`
		})

	void webview
		.listen<ArtifactUploadProgress>('artifact-upload-progress', ({ payload }) => {
			chat.updateArtifactUpload(payload.uploadId, payload.phase, payload.sent, payload.total)
		})
		.then((unlisten) => {
			if (disposed) unlisten()
			else stopProgress = unlisten
		})
		.catch((error) => {
			chat.failure = `Could not observe file upload progress: ${String(error)}`
		})

	return () => {
		disposed = true
		stopDrop?.()
		stopProgress?.()
		chat.onExchange = null
	}
})

/**
 * Leaving the conversation stops everything that could still make noise or
 * listen: the reply stream, the work lane, the voice, the ears. Coming back
 * reopens the ears — and only then, so the mic is never live while the
 * conversation is off.
 */
function endConversation() {
	conversing = false
	chat.stop()
	speaker.silence()
	// Ended is silent: a reply to something typed while off is read, not heard.
	speaker.muted = true
	listener.stop()
}

function beginConversation() {
	conversing = true
	speaker.muted = false
	if (mockPhase === null) void listener.start()
}

/** Clear whatever error is showing above the pill; the next good turn clears it anyway. */
function dismissError() {
	chat.failure = null
	speaker.failure = null
	listener.failure = null
}

// A NEW turn — typed or spoken — brings the intent's stream into view,
// where the reply and anything it renders appear. Only a new one, and only
// the turn count is tracked.
//
// Seeded from the CURRENT count, not from zero. `chat` is a singleton that
// outlives this page, but this counter is component-local: a trip to settings
// unmounts the page and reset it, so coming back looked like every existing
// turn had just arrived and the effect yanked the rail to intents — stealing
// whichever surface had just been picked. Starting level with the singleton
// means only turns that arrive WHILE the page is mounted count as new.
let turnsSeen = chat.turns.length
$effect(() => {
	const n = chat.turns.length
	if (n > turnsSeen) {
		turnsSeen = n
		untrack(() => {
			shell.tab = 'intents'
			shell.detail = true
		})
	}
})

/**
 * One state for the whole conversation, instead of one per component.
 *
 * The pieces each know their own status, but what you actually want to see is
 * whose turn it is — and the order matters: speaking wins over thinking because
 * the reply is still streaming while the first sentence is already being read
 * out, and hearing wins over everything because interrupting is allowed.
 */
const phase = $derived.by(() => {
	if (mockPhase !== null && conversing) return { key: mockPhase, label: MOCK_PHASES[mockPhase] }
	// Off wins over everything: with the ears closed, every other status is
	// a leftover from the session that just ended.
	if (!conversing) return { key: 'off', label: 'Conversation ended' }
	if (listener.status === 'denied') return { key: 'denied', label: 'No microphone' }
	if (listener.status === 'error' || speaker.status === 'error')
		return { key: 'error', label: 'Error' }
	// A sentence that fails to synthesize does not stop the voice for good, so it
	// keeps `status` — but it must not just go quiet either, which is
	// indistinguishable from the voice being broken.
	if (speaker.failure) return { key: 'error', label: `Voice: ${speaker.failure}` }
	if (speaker.status === 'preparing')
		return { key: 'loading', label: `Voice loading ${Math.round(speaker.progress * 100)}%` }
	if (listener.status === 'preparing')
		return listener.stage === 'load'
			? { key: 'starting', label: 'Ears starting…' }
			: { key: 'loading', label: `Ears loading ${Math.round(listener.progress * 100)}%` }
	if (listener.speech) return { key: 'hearing', label: 'Listening' }
	// Audio output that never got a user gesture. Saying "Spricht" over a sleeping
	// device is the one state that gives you nothing to act on — this one you can
	// tap, and one tap fixes it for the rest of the session.
	if (speaker.output === 'suspended') return { key: 'blocked', label: 'Enable audio' }
	if (speaker.speaking) return { key: 'speaking', label: 'Speaking' }
	if (chat.streaming) return { key: 'thinking', label: 'Thinking' }
	if (listener.status === 'listening') return { key: 'idle', label: 'Ready' }
	return { key: 'text', label: 'Text only' }
})

// Model-load percent (STT or TTS, whichever is preparing). Kept as a number so
// the loading bar and its label can share ONE line — no second row that grows
// the pill's height.
const loadPct = $derived(
	mockPhase === 'loading'
		? 42
		: Math.round((listener.status === 'preparing' ? listener.progress : speaker.progress) * 100)
)

/**
 * The orb's wardrobe, one entry per phase: its brand color, the halo that
 * breathes around it, and a Lucide glyph (Iconify `lucide:*`, inlined — the
 * app draws every icon inline). Tailwind needs the class names literal, so
 * they live here rather than being composed.
 */
const ORB: Record<string, { orb: string; halo?: string; icon: string }> = {
	// lucide:mic
	idle: {
		orb: 'bg-surface-sunken text-primary',
		icon: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>'
	},
	// lucide:ear
	hearing: {
		orb: 'bg-error text-error-foreground',
		halo: 'bg-error',
		icon: '<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>'
	},
	// lucide:sparkles
	thinking: {
		orb: 'bg-progress text-progress-foreground',
		halo: 'bg-progress',
		icon: '<path d="M9.9 2.6a1 1 0 0 1 2 0l1.3 4.1a4 4 0 0 0 2.6 2.6l4.1 1.3a1 1 0 0 1 0 2l-4.1 1.3a4 4 0 0 0-2.6 2.6l-1.3 4.1a1 1 0 0 1-2 0l-1.3-4.1a4 4 0 0 0-2.6-2.6l-4.1-1.3a1 1 0 0 1 0-2l4.1-1.3a4 4 0 0 0 2.6-2.6Z"/><path d="M20 3v4"/><path d="M22 5h-4"/>'
	},
	// lucide:audio-lines
	speaking: {
		orb: 'bg-success text-success-foreground',
		icon: '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>'
	},
	// lucide:download
	loading: {
		orb: 'bg-surface-sunken text-progress',
		icon: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>'
	},
	// lucide:loader (the ring is the halo here)
	starting: {
		orb: 'bg-surface-sunken text-progress',
		halo: 'bg-progress',
		icon: '<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>'
	},
	// lucide:volume-x — tap to wake the audio device
	blocked: {
		orb: 'bg-warning text-warning-foreground',
		icon: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3l3.8 3.8a.7.7 0 0 0 1.2-.5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'
	},
	// lucide:mic-off
	denied: {
		orb: 'bg-error text-error-foreground',
		icon: '<path d="M12 19v3"/><path d="M15 9.3V6a3 3 0 0 0-5.7-1.3"/><path d="M16.9 16.9A7 7 0 0 1 5 12"/><path d="M19 12a7 7 0 0 1-.5 2.6"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1"/><path d="m2 2 20 20"/>'
	},
	// lucide:triangle-alert
	error: {
		orb: 'bg-error text-error-foreground',
		icon: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
	},
	// lucide:keyboard — no recognizer; text is the whole interface
	text: {
		orb: 'bg-surface-sunken text-primary',
		icon: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M17.5 10h.01M7.5 14h9"/>'
	}
}

/** The phases that carry information the orb cannot show alone — a
 * percentage, a cause, a thing to do — get a word in the chip above the
 * notch. The happy path (ready / hearing / thinking / speaking) stays mute. */
const TOLD = new Set(['loading', 'starting', 'blocked', 'denied', 'error'])

/** The orb acts only where the phase offers an action: interrupting, or
 * waking the audio device. Everywhere else it is a status, not a button. */
const orbActs = $derived(
	mockPhase !== null || phase.key === 'blocked' || chat.streaming || speaker.speaking
)

function onOrb() {
	// Dev mock: every tap walks to the next phase, so all the orb's faces can
	// be reviewed from one button without a microphone.
	if (mockPhase !== null) {
		const keys = Object.keys(MOCK_PHASES)
		const next = keys[(keys.indexOf(mockPhase) + 1) % keys.length]
		void goto(`?voice=${next}`, { replaceState: true, noScroll: true, keepFocus: true })
		return
	}
	if (phase.key === 'blocked') {
		speaker.resumeAudio()
		return
	}
	// Stops the reply stream and the voice; the ears stay open, because
	// interrupting is allowed — that is what the orb is for while it talks.
	chat.stop()
	speaker.silence()
}

/**
 * What is being heard goes INTO the composer, not beside it: the transcript
 * is the draft while it is spoken, and the intent's stream comes into view
 * the moment the first word lands. `spoken` is the live tail currently
 * mirrored into the draft, so a partial can replace the previous partial
 * without touching anything typed before it. On the pause the mesh delivers
 * the utterance to the chat, the partial empties, and the tail leaves.
 */
let spoken = ''
$effect(() => {
	const p = listener.partial
	untrack(() => {
		if (p !== '') {
			shell.tab = 'intents'
			shell.detail = true
		}
		const d = composer.draft
		const base = spoken !== '' && d.endsWith(spoken) ? d.slice(0, -spoken.length) : d
		composer.draft = p === '' ? base : base + p
		spoken = p
	})
})

/** Height of the floating bottom dock (toast/HITL/pill) — the center column
 * of the workspaces keeps this much clearance while the asides run to the
 * screen bottom underneath it. */
let dockH = $state(0)

/**
 * How far the dock floats off the bottom edge, in px — the `bottom-2`/`left-2`/
 * `right-2` on the dock below, named so the clearance above it can use the SAME
 * number. It was hard-coded as 16 while the dock sat at 8, which is why the gap
 * over the pill read as twice the gap under it.
 */
const DOCK_INSET = 8

/** Bring the composer up, seeded with the keystroke that asked for it. */
function focusComposer(seed = '') {
	shell.tab = 'intents'
	shell.detail = true
	composer.focus(seed)
}

/**
 * Writing without a click: the first printable keystroke anywhere opens the
 * conversation with the composer focused, seeded with that very character.
 */
function onGlobalKeydown(event: KeyboardEvent) {
	if (event.metaKey || event.ctrlKey || event.altKey) return
	if (event.key.length !== 1) return
	const el = document.activeElement
	if (
		el instanceof HTMLInputElement ||
		el instanceof HTMLTextAreaElement ||
		(el instanceof HTMLElement && el.isContentEditable)
	)
		return
	event.preventDefault()
	focusComposer(event.key)
}
</script>

<svelte:window onkeydown={onGlobalKeydown} />

{#if e2eFixture}
	<div class="fixed right-2 bottom-2 z-[200] flex gap-2">
		<button
			type="button"
			data-testid="e2e-import-fixture"
			class="rounded bg-primary px-2 py-1 text-primary-foreground text-xs"
			onclick={importE2eFixture}
		>
			Import E2E fixture on {e2ePlacement}
		</button>
		<button
			type="button"
			data-testid="e2e-begin-narration"
			class="rounded bg-primary px-2 py-1 text-primary-foreground text-xs"
			onclick={beginE2eNarration}
		>
			Begin narration
		</button>
		<button
			type="button"
			data-testid="e2e-interrupt-narration"
			class="rounded bg-primary px-2 py-1 text-primary-foreground text-xs"
			onclick={interruptE2eNarration}
		>
			Interrupt narration
		</button>
		<button
			type="button"
			data-testid="e2e-second-speaker"
			class="rounded bg-primary px-2 py-1 text-primary-foreground text-xs"
			onclick={injectE2eSecondSpeaker}
		>
			Second speaker
		</button>
		<output
			data-testid="e2e-voice-state"
			data-speaking={voiceController.speaking ? 'true' : 'false'}
			data-hearing={voiceController.hearing ? 'true' : 'false'}
			class="hidden"
			aria-label="E2E voice state"
		></output>
	</div>
{/if}

<svelte:head>
	<title>Dashboard · avenOS</title>
</svelte:head>

<!-- Buchhaltung und Skills sind Arbeitsflächen im Inbox-Layout und bekommen
     die volle Fensterbreite; die übrigen Tabs bleiben auf Lesebreite zentriert.
     Ein einziges 8px-Raster (gap-2/p-2) trägt alle Abstände: Fensterkante →
     Tabs → Fläche → Voice-Panel → Fensterkante. -->
<!-- The workspaces (skills, intents) take the whole window; views stay at
     reading width. -->
<main
	class="relative mx-auto flex min-h-0 min-w-0 w-full max-w-none flex-1 flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
	style="--dock-h: {dockH + DOCK_INSET}px"
>
	{#if fileHovering}
		<div
			class="pointer-events-none fixed inset-2 z-[80] flex items-center justify-center rounded-3xl border-2 border-primary border-dashed bg-surface-raised/25 text-primary shadow-xl backdrop-blur-sm"
		>
			<div class="flex flex-col items-center gap-3">
				<span class="text-4xl" aria-hidden="true">⇩</span>
				<p class="font-medium text-lg">Drop one file to upload it</p>
				<p class="text-sm opacity-60">Any format · up to 25 MiB</p>
			</div>
		</div>
	{/if}

	{#if shell.tab === 'intents'}
		<!-- The intents workspace fills everything between the tabs and the
		     HITL bar — the wrapper carries the flex-1 so the three columns
		     stretch to the full available height. -->
		<div class="flex min-h-0 w-full flex-1">
			<IntentsPlaceholder />
		</div>
	{:else if shell.tab === 'skills'}
		<!-- The skills platform: a skill is a collection of composable
		     workflows; the canvas draws them n8n-style, every wire derived. -->
		<div class="flex min-h-0 w-full flex-1 flex-col">
			<SkillsPlatform />
		</div>
	{:else if shell.tab === 'artifacts'}
		<!-- Artifact Store debugger plus the retained local-download shelf. -->
		<div class="flex min-h-0 w-full flex-1 flex-col">
			<ArtifactsPage />
		</div>
	{/if}

	<!-- THE answer surface: it floats over the workspace rather than replacing
	     it, so the selected intent it answers about stays in view behind. -->

	<!-- The floating dock: errors and the pill hover OVER the workspace, so the
	     side columns can run to the bottom of the screen. What the tools DID is
	     not here — a tool result is part of the conversation that asked for it,
	     so it renders inline in the modal's chat band. -->
	<div
		bind:clientHeight={dockH}
		class="pointer-events-none absolute right-2 bottom-2 left-2 z-50 flex flex-col gap-1.5 pb-[env(safe-area-inset-bottom)]"
	>
		<!-- Errors surface HERE, above the voice area — the same universal band as
	     the human gate, so a failed reply (a dead lane, an unset key) is visible
	     from any tab and in voice mode, not buried in the chat stream. The × or
	     the next successful turn clears it. -->
		{#if chat.failure || speaker.failure || listener.failure}
			<div
				class="pointer-events-auto mx-auto mb-2 flex w-full max-w-2xl items-start gap-3 rounded-2xl border border-error/25 bg-error-surface px-4 py-2.5 text-error-ink shadow-[0_4px_16px_rgba(30,41,59,0.08)]"
			>
				<span class="shrink-0 pt-0.5 font-mono text-sm">✗</span>
				<p class="min-w-0 flex-1 text-sm leading-snug">
					{chat.failure ?? speaker.failure ?? listener.failure}
				</p>
				<button
					type="button"
					onclick={dismissError}
					title="Dismiss"
					aria-label="Dismiss error"
					class="-mr-1 shrink-0 rounded-full p-1 transition-colors hover:bg-error/15"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					>
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>
		{/if}

		<!-- The bottom row: on phones, the way back from an open intent sits to
		     the LEFT of the pill — the pill is the one fixed landmark, so the
		     back button lives beside it rather than anywhere in the workspace. -->
		<!-- The pill sits in the same place in both modes; the orb simply
		     overhangs it (6px each way) without pushing anything — so switching
		     voice ↔ text never makes the notch jump. -->
		<div class="relative flex items-center justify-center gap-2">
			{#if shell.tab === 'intents'}
				<div
					class="pointer-events-auto absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-full border border-border bg-surface-card p-1 text-foreground shadow-sm"
					role="group"
					aria-label="Run new document processes on"
					title="Placement is fixed when an upload starts"
				>
					<span class="pl-2 text-[11px] opacity-60">Process on</span>
					{#each [['local', 'Device'], ['server', 'Server']] as [environment, label]}
						<button
							type="button"
							onclick={() => {
								documentExecutionPreference.environment = environment as 'local' | 'server'
							}}
							aria-pressed={documentExecutionPreference.environment === environment}
							class="rounded-full px-2.5 py-1 text-xs transition-colors {documentExecutionPreference.environment ===
							environment
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-surface-selected'}"
						>
							{label}
						</button>
					{/each}
				</div>
			{/if}
			<!-- Back and the drawer toggle hug the screen edges, not the notch:
			     the pill stays centered on its own, and in text mode both step
			     aside so the input gets the whole width. -->
			{#if shell.tab === 'intents' && shell.detail}
				<button
					type="button"
					onclick={() => {
					shell.detail = false
					shell.rightOpen = false
				}}
					title="Zurück zu den Intents"
					aria-label="Zurück zu den Intents"
					class="-translate-y-1/2 pointer-events-auto absolute top-1/2 left-0 flex size-11 items-center justify-center rounded-full border border-border bg-surface-card text-foreground shadow-[0_4px_16px_rgba(30,41,59,0.12)] transition-colors hover:bg-surface-selected lg:hidden"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M19 12H5" />
						<path d="m12 19-7-7 7-7" />
					</svg>
				</button>
			{/if}
			<!-- One panel: what the system is doing, and how you talk to it. Dark, so it
	     reads as the active surface rather than another card on a pale page. -->
			<div
				class="pointer-events-auto {phase.key === 'off'
			? 'w-fit'
			: `rounded-full bg-primary text-primary-foreground w-fit px-2.5 py-2`}"
				title="Silero VAD · Nemotron 3.5 (de-DE) · Supertonic-3 M5 — all on-device"
			>
				<div class="flex items-center {phase.key === 'off' ? '' : 'gap-3'}">
					<!-- Upload sits LEFT, where the input switch used to be: a
					     placeholder for now — it is not wired yet. Same outline as the
					     ✕ opposite, so the notch stays a matched pair. -->
					{#if phase.key !== 'off'}
						<button
							type="button"
							disabled
							title="Hochladen — bald"
							aria-label="Hochladen"
							class="shrink-0 rounded-full border border-primary-foreground/25 p-2.5 opacity-60 transition-colors"
						>
							<!-- lucide:upload -->
							<svg
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M12 3v12" />
								<path d="m17 8-5-5-5 5" />
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							</svg>
						</button>
					{/if}
					{#if phase.key === 'off'}
						<!-- Ended: the pill shrinks to the mark itself. One target, one
				     meaning — tap the logo and the conversation is back. Nothing
				     else is offered here, because nothing else applies. -->
						<button
							type="button"
							onclick={beginConversation}
							title="Start conversation"
							aria-label="Start conversation"
							class="group relative block size-14 overflow-visible rounded-full"
						>
							<!-- The label is a standing tooltip above the mark — a light eggshell
					     chip with a little arrow pointing down at the circle, shown always
					     so the one thing to press names itself. Except while a human
					     gate is open: the gate's card sits exactly where the chip would,
					     and the decision being asked outranks the invitation. -->
							{#if hitlQueue.items.length === 0}
								<span
									class="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 mb-2.5 whitespace-nowrap rounded-full border border-border bg-surface-sunken px-3 py-1 font-medium text-foreground text-xs shadow-sm"
								>
									Start conversation
									<!-- The arrow: an eggshell diamond, its two lower sides bordered, so
						     it reads as the tail of the chip pointing at the button. -->
									<span
										class="-bottom-[5px] -translate-x-1/2 absolute left-1/2 size-2 rotate-45 border-border border-r border-b bg-surface-sunken"
									></span>
								</span>
							{/if}
							<!-- The mark itself: a bordered circle with air between edge and logo.
					     Hover deepens the cream a touch — the border stays exactly as it
					     is; the whole gesture is a whisper, not a repaint. -->
							<span
								class="block size-full rounded-full border border-border bg-surface-sunken p-1.5 transition-colors group-hover:bg-surface-selected"
							>
								<img src="/aven-logo.svg" alt="" class="size-full rounded-full object-cover">
							</span>
						</button>
					{:else}
						<!-- The phases that need a word — how far a model is, why audio is
						     off, what went wrong — say it in a chip above the notch, the
						     same eggshell tooltip the ended state wears. The orb stays
						     wordless. -->
						{#if TOLD.has(phase.key)}
							<span
								class="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 mb-5 whitespace-nowrap rounded-full border border-border bg-surface-sunken px-3 py-1 font-medium text-foreground text-xs shadow-sm"
							>
								{phase.label}
								<span
									class="-bottom-[5px] -translate-x-1/2 absolute left-1/2 size-2 rotate-45 border-border border-r border-b bg-surface-sunken"
								></span>
							</span>
						{/if}
						<!-- THE state orb. No words: one circle, taller than the pill it
						     sits in, wearing the phase as a brand color and an icon —
						     terracotta ear while you speak, tidal blue while it thinks,
						     paradise water while it talks, chalk when it is simply ready.
						     It is also the one action the phase allows: tap to interrupt
						     a reply, tap to wake a sleeping audio device. -->
						<div class="flex flex-1 justify-center">
							<button
								type="button"
								onclick={onOrb}
								disabled={!orbActs}
								title={phase.label}
								aria-label={phase.label}
								class="-my-3 relative flex size-17 shrink-0 items-center justify-center rounded-full border-4 border-primary shadow-[0_4px_16px_rgba(30,41,59,0.25)] transition-[transform,background-color,color] duration-150 {ORB[
									phase.key
								]?.orb ?? ORB.text.orb} {orbActs ? 'cursor-pointer' : 'cursor-default'}"
								style={phase.key === 'hearing'
									? `transform: scale(${1 + Math.min(listener.level, 1) * 0.25})`
									: ''}
							>
								<!-- The loading ring: progress as a sweep around the orb,
								     never a bar with a number. -->
								{#if phase.key === 'loading'}
									<span
										class="-inset-1 pointer-events-none absolute rounded-full"
										style="background: conic-gradient(var(--color-progress) {loadPct}%, transparent 0); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px)); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px))"
									></span>
								{/if}
								<!-- The breathing halo while it listens or works. -->
								{#if phase.key === 'hearing' || phase.key === 'thinking' || phase.key === 'starting'}
									<span
										class="pointer-events-none absolute inset-0 animate-ping rounded-full opacity-40 {ORB[
											phase.key
										]?.halo}"
									></span>
								{/if}
								<svg
									viewBox="0 0 24 24"
									class="relative size-8"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									{@html ORB[phase.key]?.icon ?? ORB.text.icon}
								</svg>
							</button>
						</div>
					{/if}

					<!-- Only where there is something to switch to. In the browser there is
			     no recognizer at all, so text is not a mode there — it is the whole
			     interface, and a button offering to leave it leads nowhere. -->
					<!-- Ending the conversation: the hang-up, far right — a phone put down,
			     not a power switch. Hidden once ended; the logo is the way back. -->
					{#if voiceUi && phase.key !== 'off'}
						<button
							type="button"
							onclick={endConversation}
							title="End conversation"
							aria-label="End conversation"
							class="shrink-0 rounded-full border border-primary-foreground/25 p-2.5 transition-colors hover:bg-primary-foreground/8"
						>
							<!-- close: end the conversation — a quiet ✕, the same outline as
							     the keyboard toggle opposite it, not a red alarm -->
							<svg
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							>
								<path d="M6 6l12 12M18 6L6 18" />
							</svg>
						</button>
					{/if}
				</div>
			</div>
			{#if shell.tab === 'intents' && shell.detail}
				<!-- Skills & artifacts: the right column, as a drawer, bottom right. -->
				<button
					type="button"
					onclick={() => {
						shell.rightOpen = !shell.rightOpen
					}}
					title="Skills & Artefakte"
					aria-label="Skills & Artefakte"
					aria-expanded={shell.rightOpen}
					class="-translate-y-1/2 pointer-events-auto absolute top-1/2 right-0 flex size-11 items-center justify-center rounded-full border border-border bg-surface-card text-foreground shadow-[0_4px_16px_rgba(30,41,59,0.12)] transition-colors hover:bg-surface-selected lg:hidden"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
					>
						<path d="M4 7h16M4 12h16M4 17h16" />
					</svg>
				</button>
			{/if}
		</div>
	</div>
</main>
