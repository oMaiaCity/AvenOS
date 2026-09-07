import { type ArtifactJson, canonicalArtifactJson } from './canonical'

export const DIGEST_DOMAINS = {
	typeDefinition: 'artifact-store/type-definition/v1\0',
	artifact: 'artifact-store/artifact/v1\0',
	publicationRequest: 'artifact-store/publication-request/v1\0'
} as const

export async function artifactJsonDigest(domain: string, value: ArtifactJson): Promise<string> {
	const domainBytes = new TextEncoder().encode(domain)
	const valueBytes = canonicalArtifactJson(value)
	const preimage = new Uint8Array(domainBytes.length + valueBytes.length)
	preimage.set(domainBytes)
	preimage.set(valueBytes, domainBytes.length)
	const digest = await crypto.subtle.digest('SHA-256', preimage)
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
