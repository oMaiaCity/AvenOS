import type { ServerBuildRuntime } from './contract.js'

export const serverBuildRuntime: ServerBuildRuntime = {
	async handle({ event, resolve }) {
		const response = await resolve(event)
		response.headers.set('X-Designer-Preview', 'true')
		return response
	},
	async loadCheckout(event) {
		const state = event.url.searchParams.get('scenario') || 'polar-loading'
		const fake = state.startsWith('fake-')
		return {
			checkoutUrl: fake
				? 'https://designer.aven.invalid/purchase/fake-checkout?checkoutId=designer&holdId=designer-hold&name=aurora&email=alex%40example.com&successUrl=%2Fpurchase%2Fsuccess%3Fname%3Daurora'
				: 'about:blank',
			name: 'aurora',
			provider: fake ? 'fake' : 'polar',
			priceEur: 25,
			reservationMinutes: 15
		}
	}
}
