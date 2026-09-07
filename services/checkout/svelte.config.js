import adapter from '@sveltejs/adapter-node'

export default {
	kit: {
		adapter: adapter(),
		csp: {
			mode: 'auto',
			directives: {
				'script-src': ['self'],
				'frame-src': ['self', 'https://polar.sh', 'https://*.polar.sh'],
				'frame-ancestors': ['none'],
				'object-src': ['none'],
				'base-uri': ['self']
			}
		}
	}
}
