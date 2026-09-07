import { json } from '@sveltejs/kit'
import { loadIdentityConfig } from '$lib/server/config.js'
export const GET = () => {
	const values = loadIdentityConfig().ANDROID_APP_CERT_SHA256_FINGERPRINTS
	if (!values.length)
		return json({ error: 'Android fingerprints are not configured.' }, { status: 503 })
	return json([
		{
			relation: [
				'delegate_permission/common.handle_all_urls',
				'delegate_permission/common.get_login_creds'
			],
			target: {
				namespace: 'android_app',
				package_name: 'ceo.aven.os',
				sha256_cert_fingerprints: values
			}
		}
	])
}
