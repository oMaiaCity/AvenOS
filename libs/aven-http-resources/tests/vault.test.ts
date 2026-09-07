import { describe, expect, test } from 'vitest'
import { httpRequestDigest, parseHttpRequestArtifact } from '../src/contracts'
import { type CredentialBinding, createMemoryCustomerVault, type VaultError } from '../src/vault'

const TENANT = '10000000-0000-4000-8000-000000000001'
const OTHER_TENANT = '10000000-0000-4000-8000-000000000009'
const SUBJECT = '20000000-0000-4000-8000-000000000002'
const OTHER_SUBJECT = '30000000-0000-4000-8000-000000000003'
const CREDENTIAL = '40000000-0000-4000-8000-000000000004'
const BINDING = '50000000-0000-4000-8000-000000000005'

const context = {
	tenantId: TENANT,
	subjectId: SUBJECT,
	sessionId: 'session-1',
	executionEnvironment: 'server' as const
}

function binding(overrides: Partial<CredentialBinding> = {}): CredentialBinding {
	return {
		bindingRef: BINDING,
		label: 'Reports API',
		ownerSubjectId: SUBJECT,
		credentialRef: CREDENTIAL,
		placements: ['server'],
		schemes: ['https'],
		host: { kind: 'exact', value: 'api.example.com' },
		ports: [443],
		pathPrefix: '/reports/',
		methods: ['GET'],
		purpose: 'report-read',
		attachment: { kind: 'header', name: 'Authorization', prefix: 'Bearer ' },
		enabled: true,
		...overrides
	}
}

function request(method: 'GET' | 'HEAD' = 'GET') {
	return parseHttpRequestArtifact({
		method,
		url: 'https://api.example.com/reports/august',
		authentication: { mode: 'mapped-required', purpose: 'report-read' }
	})
}

describe('customer Vault session boundary', () => {
	test('sets without readback and resolves only a matching method in the active session', async () => {
		const vault = createMemoryCustomerVault({
			tenantId: TENANT,
			now: () => new Date('2026-08-30T12:00:00.000Z')
		})
		const metadata = await vault.administration.setCredential({
			ownerSubjectId: SUBJECT,
			credentialRef: CREDENTIAL,
			label: 'Reports token',
			secret: 'top-secret-token'
		})
		await vault.administration.putBinding(binding())

		expect(metadata).toEqual({
			credentialRef: CREDENTIAL,
			label: 'Reports token',
			version: 1,
			enabled: true,
			createdAt: '2026-08-30T12:00:00.000Z',
			updatedAt: '2026-08-30T12:00:00.000Z'
		})
		expect(JSON.stringify(await vault.administration.metadata(SUBJECT))).not.toContain(
			'top-secret-token'
		)

		const matched = await vault.sessions.match(request(), context)
		expect(matched).toMatchObject({
			outcome: 'matched',
			credentialRef: CREDENTIAL,
			secretVersion: 1,
			binding: {
				bindingRef: BINDING,
				methods: ['GET'],
				attachment: { kind: 'header', name: 'authorization', prefix: 'Bearer ' }
			}
		})
		expect(await vault.sessions.match(request('HEAD'), context)).toEqual({ outcome: 'none' })

		const exactRequest = request()
		const resolved = await vault.sessions.resolveForUse({
			bindingRef: BINDING,
			request: exactRequest,
			requestDigest: httpRequestDigest(exactRequest),
			runId: 'run-1',
			stepId: 'step-1',
			context
		})
		expect(resolved.secret).toBe('top-secret-token')
		expect(resolved.requestDigest).toBe(httpRequestDigest(exactRequest))
	})

	test('keeps credential references stable across rotation and invalidates revoked values', async () => {
		const vault = createMemoryCustomerVault({ tenantId: TENANT })
		await vault.administration.setCredential({
			ownerSubjectId: SUBJECT,
			credentialRef: CREDENTIAL,
			label: 'Reports token',
			secret: 'version-one'
		})
		await vault.administration.putBinding(binding())
		const rotated = await vault.administration.rotateCredential({
			ownerSubjectId: SUBJECT,
			credentialRef: CREDENTIAL,
			secret: 'version-two'
		})
		expect(rotated).toMatchObject({ credentialRef: CREDENTIAL, version: 2, enabled: true })
		expect(await vault.sessions.match(request(), context)).toMatchObject({
			outcome: 'matched',
			credentialRef: CREDENTIAL,
			secretVersion: 2
		})
		await vault.administration.revokeCredential(SUBJECT, CREDENTIAL)
		expect(await vault.sessions.match(request(), context)).toEqual({ outcome: 'none' })
	})

	test('fails closed for cross-subject access, path tricks, and equally specific bindings', async () => {
		const vault = createMemoryCustomerVault({ tenantId: TENANT })
		await vault.administration.setCredential({
			ownerSubjectId: SUBJECT,
			credentialRef: CREDENTIAL,
			label: 'Reports token',
			secret: 'secret'
		})
		await vault.administration.putBinding(binding())

		expect(await vault.sessions.match(request(), { ...context, subjectId: OTHER_SUBJECT })).toEqual(
			{ outcome: 'none' }
		)
		await expect(
			vault.sessions.match(request(), { ...context, tenantId: OTHER_TENANT })
		).rejects.toMatchObject({ code: 'VAULT_TENANT_MISMATCH' } satisfies Partial<VaultError>)
		const wrongPath = parseHttpRequestArtifact({
			method: 'GET',
			url: 'https://api.example.com/reports-evil/august',
			authentication: { mode: 'mapped-required', purpose: 'report-read' }
		})
		expect(await vault.sessions.match(wrongPath, context)).toEqual({ outcome: 'none' })

		const secondCredential = '60000000-0000-4000-8000-000000000006'
		await vault.administration.setCredential({
			ownerSubjectId: SUBJECT,
			credentialRef: secondCredential,
			label: 'Duplicate',
			secret: 'other'
		})
		await vault.administration.putBinding(
			binding({
				bindingRef: '70000000-0000-4000-8000-000000000007',
				credentialRef: secondCredential
			})
		)
		expect(await vault.sessions.match(request(), context)).toEqual({
			outcome: 'ambiguous',
			bindingRefs: [BINDING, '70000000-0000-4000-8000-000000000007']
		})
	})

	test('rejects a digest changed after authorization', async () => {
		const vault = createMemoryCustomerVault({ tenantId: TENANT })
		await vault.administration.setCredential({
			ownerSubjectId: SUBJECT,
			credentialRef: CREDENTIAL,
			label: 'Reports token',
			secret: 'secret'
		})
		await vault.administration.putBinding(binding())
		await expect(
			vault.sessions.resolveForUse({
				bindingRef: BINDING,
				request: request(),
				requestDigest: '0'.repeat(64),
				runId: 'run-1',
				stepId: 'step-1',
				context
			})
		).rejects.toMatchObject({ code: 'VAULT_REQUEST_DIGEST_MISMATCH' } satisfies Partial<VaultError>)
	})
})
