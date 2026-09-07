import { expect, test } from 'bun:test'
import { type HeldMessage, MessageBus } from '../src/bus'

const held: HeldMessage = {
	id: 'review',
	actor: 'test',
	method: 'review',
	label: 'Confirm',
	detail: '{}'
}
const success = { record: '{"ok":true}', wire: 'saved' }

test('review stays held on failed publication and resolves only after successful retry', async () => {
	const bus = new MessageBus()
	const resolved: string[] = []
	let attempts = 0
	bus.onHold = () => undefined
	bus.onHeldResolved = (id) => resolved.push(id)
	bus.holdAction(held, {
		confirm: async () => {
			if (++attempts === 1) throw new Error('save failed')
			return success
		}
	})
	await expect(bus.confirmHeld(held.id)).rejects.toThrow('save failed')
	expect(resolved).toEqual([])
	expect(await bus.confirmHeld(held.id)).toEqual(success)
	expect(resolved).toEqual([held.id])
	expect(JSON.parse((await bus.confirmHeld(held.id)).record).ok).toBe(false)
})

test('concurrent confirmation and rejection cannot race the same review', async () => {
	const bus = new MessageBus()
	bus.onHold = () => undefined
	let release!: () => void
	const pending = new Promise<void>((resolve) => {
		release = resolve
	})
	let confirms = 0
	let rejects = 0
	bus.holdAction(held, {
		confirm: async () => {
			confirms++
			await pending
			return success
		},
		reject: async () => {
			rejects++
		}
	})
	const first = bus.confirmHeld(held.id)
	expect(JSON.parse((await bus.confirmHeld(held.id)).record).ok).toBe(false)
	await bus.rejectHeld(held.id)
	release()
	await first
	expect(confirms).toBe(1)
	expect(rejects).toBe(0)
})

test('failed rejection remains retryable, and missing UI fails closed', async () => {
	const bus = new MessageBus()
	expect(() => bus.holdAction(held, { confirm: async () => success })).toThrow('unavailable')
	bus.onHold = () => undefined
	let rejected = 0
	bus.holdAction(held, {
		confirm: async () => success,
		reject: async () => {
			if (++rejected === 1) throw new Error('offline')
		}
	})
	await expect(bus.rejectHeld(held.id)).rejects.toThrow('offline')
	await bus.rejectHeld(held.id)
	expect(rejected).toBe(2)
})
