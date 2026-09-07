import type { Contribution, LogEntry } from './intents.svelte'

/**
 * THE ACTIVITY LOG is the intent's journey, not a transcript of the
 * conversation.
 *
 * Message contributions (`kind: 'message'`, contributed by human or agent)
 * are already inlined as chat turns below the log. Mapping them into log
 * entries as well rendered every round-trip twice, so they are excluded
 * here: the chat is the only home for messages.
 *
 * Everything else — file uploads, intent lifecycle events, and future
 * skill or system activity — stays in the log as a typed timeline entry.
 */
export function persistentLogEntries(contributions: Contribution[]): LogEntry[] {
	return contributions
		.filter((entry) => entry.kind !== 'message')
		.map((entry) => ({
			step:
				entry.kind === 'file-upload'
					? 'File uploaded'
					: entry.kind === 'intent-created'
						? 'Intent created'
						: entry.kind === 'intents-merged'
							? 'Intents merged'
							: 'Contribution',
			when: new Date(entry.createdAt).toLocaleString(),
			state: 'done',
			skill: entry.kind === 'file-upload' ? 'file' : entry.contributorKind,
			note: logNote(entry)
		}))
}

function logNote(entry: Contribution): string | undefined {
	if (entry.text) return entry.text
	if (typeof entry.payload.originalName === 'string') return entry.payload.originalName
	const merged = entry.payload.sourceIntentIds
	if (Array.isArray(merged) && merged.length > 0) {
		return `${merged.length} ${merged.length === 1 ? 'intent' : 'intents'} merged in`
	}
	return undefined
}
