import { readBoundedBytes } from '@avenos/http-boundary'

export type MailProviderObservation = { healthy: boolean; code: string }
// SMTP passwords are Postscale API keys. Reuse that existing credential only for
// this fixed provider origin; never send it to a configured callback or redirect.
export async function observeMailProvider(
	smtpUrl: string,
	sender: string,
	fetcher: typeof fetch = fetch
): Promise<MailProviderObservation> {
	const unavailable = (code: string) => ({ healthy: false, code })
	try {
		const smtp = new URL(smtpUrl)
		if (smtp.hostname !== 'smtp.postscale.io') return unavailable('SMTP_PROVIDER_NOT_OBSERVABLE')
		const domain = /@([a-z0-9.-]+)(?:>|\s|$)/i.exec(sender)?.[1]?.toLowerCase()
		if (!domain) return unavailable('SMTP_SENDER_INVALID')
		const token = decodeURIComponent(smtp.password)
		if (!token || token.startsWith('ps_test_')) return unavailable('SMTP_LIVE_CREDENTIAL_REQUIRED')
		const read = async (path: string) => {
			const response = await fetcher(`https://api.postscale.io/v1/${path}`, {
				headers: { authorization: `Bearer ${token}` },
				redirect: 'error',
				signal: AbortSignal.timeout(10_000)
			})
			if (!response.ok) throw new Error('Provider observation failed')
			// fetch has already decoded any compressed response; limit the actual decoded bytes.
			return JSON.parse(
				new TextDecoder().decode(
					await readBoundedBytes(
						{
							headers: new Headers(),
							body: response.body
						},
						64 * 1024,
						10_000
					)
				)
			)
		}
		const details = await read(`domains/${encodeURIComponent(domain)}`)
		if (
			details.domain !== domain ||
			!/^[0-9a-f-]{36}$/.test(details.id ?? '') ||
			details.active !== true ||
			details.verified !== true ||
			details.spf_verified !== true ||
			details.dkim_verified !== true
		)
			return unavailable('SMTP_SENDER_UNVERIFIED')
		const warming = await read(`domains/${details.id}/warming`)
		if (
			!['phase_1', 'phase_2', 'phase_3', 'phase_4', 'warmed'].includes(warming.phase) ||
			typeof warming.remaining_today !== 'number' ||
			warming.remaining_today <= 0 ||
			typeof warming.remaining_this_hour !== 'number' ||
			warming.remaining_this_hour <= 0
		)
			return unavailable('SMTP_SENDING_CAPACITY_UNAVAILABLE')
		return { healthy: true, code: 'OK' }
	} catch {
		return unavailable('SMTP_PROVIDER_OBSERVATION_FAILED')
	}
}
