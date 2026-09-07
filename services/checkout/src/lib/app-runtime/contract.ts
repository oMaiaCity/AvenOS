import type { HoldOrigin, MetaInfo, NameAvailability, NameHoldResult } from '$lib/types.js'

export interface AppRuntime {
	initial: {
		nameSearch(url: URL): {
			name: string
			busy: boolean
			result: NameAvailability | null
			error: string
		}
		secureName(url: URL): {
			name: string
			email: string
			info: NameAvailability | null
			hold: NameHoldResult | null
			loading: boolean
			error: string
		}
		checkout(url: URL): { state: 'loading' | 'ready' | 'paying' | 'confirming'; error: string }
		payment(url: URL): { busy: boolean; error: string }
	}
	names: {
		check(name: string): Promise<NameAvailability>
		loadInfo(name: string, current: NameAvailability | null): Promise<NameAvailability | null>
		hold(name: string, email: string, origin?: HoldOrigin): Promise<NameHoldResult>
	}
	billing: { pay(input: Record<string, string>): Promise<{ redirect: string }> }
	meta(): Promise<MetaInfo>
}
