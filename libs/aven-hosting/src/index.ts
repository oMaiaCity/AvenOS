export type SiteRuntimeStatus = 'awaiting_dns' | 'syncing' | 'active' | 'dns_invalid' | 'failed'

export interface SiteBinding {
	id: string
	hostname: string
	repository: string
	sourceBranch: string
	deploymentBranch: string
	status: SiteRuntimeStatus
	activeArtifactRevision: string | null
	activeSourceRevision: string | null
	lastError: string | null
	verifiedAt: string | null
	lastSyncedAt: string | null
	systemManaged: boolean
}

export interface SiteBindingDraft {
	hostname: string
	repository: string
	sourceBranch: string
	deploymentBranch: string
}

export interface SiteDnsVerification {
	txtName: string
	txtValue: string
	hostname: string
	ipv4: string | null
	ipv6: string[]
}

export interface SiteBindingMutation {
	site: SiteBinding
	dns: SiteDnsVerification
}

export type SiteApiTransport = <T>(path: string, options?: RequestInit) => Promise<T>

export interface SiteHostingClient {
	list(): Promise<SiteBinding[]>
	create(input: SiteBindingDraft): Promise<SiteBindingMutation>
	update(id: string, input: SiteBindingDraft): Promise<SiteBindingMutation>
	remove(id: string): Promise<void>
}

export function createSiteHostingClient(transport: SiteApiTransport): SiteHostingClient {
	return {
		async list() {
			return (await transport<{ sites: SiteBinding[] }>('/sites')).sites
		},
		create(input) {
			return transport<SiteBindingMutation>('/sites', {
				method: 'POST',
				body: JSON.stringify(input)
			})
		},
		update(id, input) {
			return transport<SiteBindingMutation>(`/sites/${encodeURIComponent(id)}`, {
				method: 'PUT',
				body: JSON.stringify(input)
			})
		},
		async remove(id) {
			await transport(`/sites/${encodeURIComponent(id)}`, { method: 'DELETE' })
		}
	}
}
