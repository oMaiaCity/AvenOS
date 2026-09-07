import { bus, type HeldMessage } from './bus'
import { singleton } from './singleton'

/**
 * The one HITL queue (universal): every held message — a destructive tool
 * call, a drafted bridge — surfaces in the SAME bar above the voice pill,
 * and resolves ONLY by a physical button press. Voice cannot confirm:
 * confirming is not a tool, it is these two functions, wired to buttons.
 */
class HitlQueue {
	items = $state<HeldMessage[]>([])
}

export const hitlQueue = singleton('aven.hitl', () => new HitlQueue())

bus.onHold = (held) => {
	hitlQueue.items.push(held)
}
bus.onHeldResolved = (id) => {
	hitlQueue.items = hitlQueue.items.filter((h) => h.id !== id)
}

export function confirmHeld(id: string): void {
	void bus
		.confirmHeld(id)
		.then((result) => {
			if (JSON.parse(result.record)?.ok === false) reviewFailed(id, result.wire)
		})
		.catch((error) => reviewFailed(id, error))
}

export function rejectHeld(id: string): void {
	void bus.rejectHeld(id).catch((error) => reviewFailed(id, error))
}

function reviewFailed(id: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error)
	hitlQueue.items = hitlQueue.items.map((held) =>
		held.id === id
			? {
					...held,
					label: `Could not save review: ${message}. You can retry.`
				}
			: held
	)
}
