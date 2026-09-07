import type { MetaInfo, NameAvailability, NameHoldResult } from '$lib/types.js'
import type { AppRuntime } from './contract.js'

const available = (name = 'aurora'): NameAvailability => ({
	name,
	available: true,
	priceEur: 25,
	reservationMinutes: 15
})
const hold = (name = 'aurora'): NameHoldResult => ({
	name,
	expiresAt: '2026-08-21T15:30:00.000Z',
	priceEur: 25,
	reservationMinutes: 15
})
export const appRuntime: AppRuntime = {
	initial: {
		nameSearch: () => ({ name: '', busy: false, result: null, error: '' }),
		secureName: (url) => ({
			name: (url.searchParams.get('name') ?? '').toLowerCase(),
			email: '',
			info: null,
			hold: null,
			loading: false,
			error: ''
		}),
		checkout: () => ({ state: 'ready', error: '' }),
		payment: () => ({ busy: false, error: '' })
	},
	names: {
		check: async (name) => available(name),
		loadInfo: async (name, current) => current ?? (name ? available(name) : null),
		hold: async (name) => hold(name)
	},
	billing: { pay: async () => ({ redirect: '/purchase/success?name=aurora' }) },
	meta: async () => ({ priceEur: 25, downloadUrl: '' }) satisfies MetaInfo
}
