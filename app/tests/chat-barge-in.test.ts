import { beforeAll, describe, expect, test } from 'bun:test'
import type { AnonymousSpeaker } from '../src/lib/chat/anonymous-speaker'
import type { ChatMessage, StreamEvent, ToolSpec } from '../src/lib/chat/redpill'

let Chat: typeof import('../src/lib/chat/chat.svelte').Chat

beforeAll(async () => {
	;(globalThis as typeof globalThis & { $state: <T>(value: T) => T }).$state = <T>(value: T) =>
		value
	Chat = (await import('../src/lib/chat/chat.svelte')).Chat
})

describe('Chat barge-in', () => {
	test('queues the final utterance until the interrupted stream has unwound', async () => {
		const speaker: AnonymousSpeaker = {
			session_id: 'session-1',
			speaker_id: 'speaker-2',
			confidence: 0.91
		}
		const stream = async function* (
			messages: ChatMessage[],
			_tools: ToolSpec[],
			signal?: AbortSignal
		): AsyncGenerator<StreamEvent> {
			const prompt = [...messages].reverse().find((message) => message.role === 'user')?.content
			if (prompt === 'first') {
				yield { kind: 'text', text: 'Opening. ' }
				await new Promise<never>((_resolve, reject) => {
					const aborted = () => reject(new Error('aborted'))
					if (signal?.aborted) aborted()
					else signal?.addEventListener('abort', aborted, { once: true })
				})
			}
			yield { kind: 'text', text: 'Follow-up reply.' }
		}
		const chat = new Chat({}, undefined, stream)
		const first = chat.send('first')
		await waitUntil(() => chat.routingReply === 'Opening. ')
		const followUp = chat.send('second', speaker)
		await Promise.all([first, followUp])

		expect(chat.turns.map((turn) => [turn.role, turn.content])).toEqual([
			['user', 'first'],
			['assistant', 'Opening. '],
			['user', 'second'],
			['assistant', 'Follow-up reply.']
		])
		expect(chat.turns[2]?.anonymousSpeaker).toEqual(speaker)
	})
})

async function waitUntil(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) return
		await new Promise((resolve) => setTimeout(resolve, 1))
	}
	throw new Error('condition was not reached')
}
