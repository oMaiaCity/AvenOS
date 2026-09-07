import { writable } from 'svelte/store'
import { getHealth } from '$lib/api.js'
import type { BackendAvailability, HealthStatus } from '$lib/types.js'

export const availability = writable<BackendAvailability>('available')
export const capabilityHealth = writable<HealthStatus | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
let failures = 0

export function monitorBackend() {
	const check = async () => {
		try {
			const status = await getHealth()
			failures = 0
			capabilityHealth.set(status)
			availability.set(status.overall === 'healthy' ? 'available' : 'degraded')
			timer = setTimeout(check, 10_000)
		} catch {
			failures += 1
			availability.set('unavailable')
			timer = setTimeout(check, Math.min(1_000 * 2 ** failures, 30_000))
		}
	}
	void check()
	return () => {
		if (timer) clearTimeout(timer)
	}
}
