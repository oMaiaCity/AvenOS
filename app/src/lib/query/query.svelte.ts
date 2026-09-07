import { singleton } from '$lib/actors/singleton'

/**
 * Which intent is in view (0159). The conversation is scoped to it — the
 * chat switches sessions on it, and human gates raised with a context are
 * filtered by it. The modal that once owned this state is gone; the chat
 * renders inline in the intent's stream.
 */
class QueryState {
	intent = $state<string | null>(null)
}

export const query = singleton('aven.query', () => new QueryState())
