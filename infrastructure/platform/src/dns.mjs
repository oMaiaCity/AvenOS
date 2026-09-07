function record(resourceName, zone, name, type, value, ttl = 300) {
	if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86_400)
		throw new Error('DNS TTL must be 60..86400')
	return { resourceName, zone, name, type, value, ttl }
}

export function manualIdentityRecordSpecs({ hostname, ipv4, ipv6 }) {
	if (hostname !== 'aven.id') throw new Error('identity DNS is restricted to the aven.id apex')
	return [
		{ hostname, name: '@', type: 'A', value: ipv4, ttl: 300 },
		{ hostname, name: '@', type: 'AAAA', value: ipv6, ttl: 300 }
	]
}

const supportedHostnames = [
	{ apex: 'next.aven.ceo', api: 'api.next.aven.ceo', checkout: 'portal.next.aven.ceo' },
	{ apex: 'aven.ceo', api: 'api.aven.ceo', checkout: 'portal.aven.ceo' }
]

function relativeName(hostname, zone) {
	if (hostname === zone) return '@'
	const suffix = `.${zone}`
	if (!hostname.endsWith(suffix)) throw new Error(`${hostname} is outside ${zone}`)
	return hostname.slice(0, -suffix.length)
}

export function platformRecordSpecs({ zone, hostnames, ipv4, ipv6 }) {
	if (
		zone !== 'aven.ceo' ||
		!supportedHostnames.some((supported) =>
			Object.keys(supported).every((key) => supported[key] === hostnames[key])
		)
	)
		throw new Error('platform DNS is restricted to the next or production aven.ceo origins')
	return [
		record('platform-api-a', zone, relativeName(hostnames.api, zone), 'A', ipv4),
		record('platform-api-aaaa', zone, relativeName(hostnames.api, zone), 'AAAA', ipv6),
		record('platform-portal-a', zone, relativeName(hostnames.checkout, zone), 'A', ipv4),
		record('platform-portal-aaaa', zone, relativeName(hostnames.checkout, zone), 'AAAA', ipv6),
		record('platform-apex-a', zone, relativeName(hostnames.apex, zone), 'A', ipv4),
		record('platform-apex-aaaa', zone, relativeName(hostnames.apex, zone), 'AAAA', ipv6)
	]
}

export function platformHostnames(environment) {
	if (environment === 'next')
		return {
			apex: 'next.aven.ceo',
			api: 'api.next.aven.ceo',
			checkout: 'portal.next.aven.ceo'
		}
	if (environment === 'production')
		return { apex: 'aven.ceo', api: 'api.aven.ceo', checkout: 'portal.aven.ceo' }
	throw new Error('managed platform DNS exists only for next and production')
}
