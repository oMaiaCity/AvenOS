import { api } from '$lib/api.js'
import { createProofOfWorkHeader } from '$lib/proof-of-work.js'
import type { MetaInfo, NameAvailability, NameHoldResult } from '$lib/types.js'
import type { AppRuntime } from './contract.js'

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
		checkout: () => ({ state: 'loading', error: '' }),
		payment: () => ({ busy: false, error: '' })
	},
	names: {
		check: (name) =>
			api<NameAvailability>(`/names/check?name=${encodeURIComponent(name.trim().toLowerCase())}`),
		loadInfo: (name) =>
			name
				? api<NameAvailability>(`/names/check?name=${encodeURIComponent(name)}`).catch(() => null)
				: Promise.resolve(null),
		async hold(name, email, origin) {
			const headers = await createProofOfWorkHeader('secure-name')
			const result = await api<{ hold: NameHoldResult }>('/names/hold', {
				method: 'POST',
				headers,
				body: JSON.stringify({ name, email, ...origin })
			})
			return result.hold
		}
	},
	billing: {
		pay: (input) =>
			api<{ redirect: string }>('/billing/fake-pay', {
				method: 'POST',
				body: JSON.stringify(input)
			})
	},
	meta: () => api<MetaInfo>('/meta')
}
