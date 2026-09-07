// The single implementation of the cryptographic primitives used across
// modules.
//
// Bearer tokens (claim links, setup links, purchase tokens):
// random base64url strings, stored and compared as SHA-256 hex.
//
// Envelope encryption (email payloads): AES-256-GCM with
// a random nonce, serialised as a self-describing JSON envelope so a value at
// rest is useless without the key held by the process.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url')
}

// Shape check applied before hashing any user-supplied token.
export const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,100}$/

export function isBearerToken(value: string): boolean {
	return BEARER_TOKEN_PATTERN.test(value.trim())
}

export interface EncryptedEnvelope {
	version: 1
	nonce: string
	ciphertext: string
	authenticationTag: string
}

export function decodeEncryptionKey(value: string): Buffer {
	const key = Buffer.from(value, 'base64')
	if (key.length !== 32) throw new Error('encryption key must decode to exactly 32 bytes')
	return key
}

export function encryptPayload(value: unknown, key: Buffer): string {
	const nonce = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', key, nonce)
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
	const envelope: EncryptedEnvelope = {
		version: 1,
		nonce: nonce.toString('base64'),
		ciphertext: ciphertext.toString('base64'),
		authenticationTag: cipher.getAuthTag().toString('base64')
	}
	return JSON.stringify(envelope)
}

export function decryptPayload<T>(value: string, key: Buffer): T {
	const envelope = JSON.parse(value) as EncryptedEnvelope
	if (envelope.version !== 1) throw new Error('Unsupported encrypted payload version')
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'))
	decipher.setAuthTag(Buffer.from(envelope.authenticationTag, 'base64'))
	return JSON.parse(
		Buffer.concat([
			decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
			decipher.final()
		]).toString('utf8')
	) as T
}
