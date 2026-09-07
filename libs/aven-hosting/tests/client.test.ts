import { describe, expect, test } from 'bun:test'
import { createSiteHostingClient, type SiteBindingDraft } from '../src/index.js'

const draft: SiteBindingDraft = {
	hostname: 'www.customer.example',
	repository: 'myavenceo/avenceo',
	sourceBranch: 'next',
	deploymentBranch: 'deploy/next'
}

describe('site hosting client', () => {
	test('keeps transport concerns outside the domain client', async () => {
		const calls: Array<{ path: string; options?: RequestInit }> = []
		const client = createSiteHostingClient(async (path, options) => {
			calls.push({ path, options })
			return (path === '/sites' && !options ? { sites: [] } : {}) as never
		})
		expect(await client.list()).toEqual([])
		await client.create(draft)
		await client.update('site/id', draft)
		await client.remove('site/id')
		expect(calls.map((call) => [call.path, call.options?.method])).toEqual([
			['/sites', undefined],
			['/sites', 'POST'],
			['/sites/site%2Fid', 'PUT'],
			['/sites/site%2Fid', 'DELETE']
		])
	})
})
