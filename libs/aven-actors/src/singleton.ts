/**
 * HMR-proof singletons.
 *
 * Module-scope singletons split-brain under Vite HMR: every re-evaluation of
 * a module makes a fresh instance, and after a structural refactor the chat
 * can be emitting on one bus generation while the speaker registered on
 * another — deltas fan out to nobody and the voice goes silent. Stashing the
 * instance on globalThis makes every module generation see the same one.
 * In production builds each module evaluates once and this is a no-op.
 */
export function singleton<T>(key: string, make: () => T): T {
	const store = globalThis as unknown as Record<string, T>
	store[key] ??= make()
	return store[key]
}
