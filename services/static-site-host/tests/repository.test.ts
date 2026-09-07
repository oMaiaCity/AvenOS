import { describe, expect, test } from 'bun:test'
import { type DirectoryBinding, validateBinding } from '../src/repository.js'

const valid: DirectoryBinding = {
	id: '00000000-0000-4000-8000-000000000001',
	hostname: 'customer.example',
	repository_full_name: 'myavenceo/avenceo',
	clone_url: 'https://github.com/myavenceo/avenceo.git',
	source_ref: 'refs/heads/next',
	artifact_ref: 'refs/heads/deploy/next',
	artifact_path: 'dist',
	verification_mode: 'txt',
	verification_token_hash: 'a'.repeat(64),
	verified_at: null,
	owner_is_admin: false
}

describe('directory binding validation', () => {
	test('accepts the deployment branch contract', () =>
		expect(() => validateBinding(valid)).not.toThrow())
	test('rejects arbitrary clone URLs', () =>
		expect(() => validateBinding({ ...valid, clone_url: 'http://127.0.0.1/repo' })).toThrow())
	test('rejects malformed identifiers and repository traversal-like names', () => {
		expect(() => validateBinding({ ...valid, id: '0'.repeat(36) })).toThrow()
		expect(() =>
			validateBinding({
				...valid,
				repository_full_name: 'myavenceo/..',
				clone_url: 'https://github.com/myavenceo/...git'
			})
		).toThrow()
	})
	test('rejects non-deployment artifact branches', () =>
		expect(() => validateBinding({ ...valid, artifact_ref: 'refs/heads/main' })).toThrow())
	test('accepts aven.ceo and its subdomains only with identity-service admin authorization', () => {
		expect(() =>
			validateBinding({ ...valid, hostname: 'aven.ceo', owner_is_admin: true })
		).not.toThrow()
		expect(() =>
			validateBinding({ ...valid, hostname: 'aven.ceo', owner_is_admin: false })
		).toThrow(/reserved/)
		expect(() =>
			validateBinding({ ...valid, hostname: 'docs.aven.ceo', owner_is_admin: true })
		).not.toThrow()
		expect(() =>
			validateBinding({ ...valid, hostname: 'docs.aven.ceo', owner_is_admin: false })
		).toThrow(/reserved/)
	})
	test('accepts operator verification only for platform-managed aven.ceo sites', () => {
		expect(() =>
			validateBinding({
				...valid,
				hostname: 'aven.ceo',
				owner_is_admin: true,
				verification_mode: 'operator'
			})
		).not.toThrow()
		expect(() =>
			validateBinding({ ...valid, owner_is_admin: true, verification_mode: 'operator' })
		).toThrow(/operator verification/)
	})
	test.each(['refs/heads/-next', 'refs/heads/feature/.hidden', 'refs/heads/deploy/release.lock'])(
		'rejects a Git-invalid ref %s',
		(source_ref) => expect(() => validateBinding({ ...valid, source_ref })).toThrow()
	)
})
