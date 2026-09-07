import { json } from '@sveltejs/kit'
import { loadIdentityConfig } from '$lib/server/config.js'
export const GET = () => {
	const issuer = loadIdentityConfig().PUBLIC_BASE_URL.replace(/\/$/, '')
	return json({
		issuer,
		jwks_uri: `${issuer}/api/auth/jwks`,
		token_endpoint: `${issuer}/api/auth/token`,
		response_types_supported: [],
		subject_types_supported: ['public'],
		id_token_signing_alg_values_supported: ['EdDSA']
	})
}
