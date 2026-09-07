import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config.js'

const validEnvironment: NodeJS.ProcessEnv = {
	SITE_HOST_DIRECTORY_BEARER_TOKEN: 'a'.repeat(32),
	SITE_HOST_DIRECTORY_URL: 'http://app:3000/internal/v1/static-sites/bindings',
	SITE_HOST_ALLOWED_IPV4: '192.0.2.10'
}

describe('site host configuration', () => {
	test('derives a same-origin status endpoint and bounded concurrency', () => {
		const config = loadConfig(validEnvironment)
		expect(config.statusUrl).toBe('http://app:3000/internal/v1/static-sites/status')
		expect(config.maxConcurrentSyncs).toBe(2)
		expect(config.dnsServers).toEqual([])
	})

	test('accepts explicit DNS servers for deterministic or split-horizon resolution', () => {
		expect(
			loadConfig({
				...validEnvironment,
				SITE_HOST_DNS_SERVERS: '127.0.0.1:5353, [2001:db8::53]:5353'
			}).dnsServers
		).toEqual(['127.0.0.1:5353', '[2001:db8::53]:5353'])
	})

	test('does not send the directory token to a different origin', () => {
		expect(() =>
			loadConfig({
				...validEnvironment,
				SITE_HOST_STATUS_URL: 'https://attacker.example/status'
			})
		).toThrow(/same origin/)
	})

	test('accepts only HTTP directory endpoints', () => {
		expect(() =>
			loadConfig({ ...validEnvironment, SITE_HOST_DIRECTORY_URL: 'file:///tmp/bindings' })
		).toThrow(/HTTP or HTTPS/)
	})
})
