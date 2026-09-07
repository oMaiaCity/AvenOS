import { describe, expect, test } from 'vitest'
import { LlmActor } from '../src/lib/actors/llm.actor'

describe('LLM actor ownership', () => {
	test('keeps every LLM invocation contract in the avenCEO application domain', () => {
		const actor = new LlmActor(async () => 'ok')

		expect(actor.manifest).toMatchObject({
			authority: 'ceo.aven',
			namespace: 'ai.gateway',
			tags: expect.arrayContaining(['application', 'llm'])
		})
	})
})
