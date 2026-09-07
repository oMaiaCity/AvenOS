import { describe, expect, test } from 'bun:test'
import {
	AVEN_CEO_AUTHORITY,
	AVEN_ID_AUTHORITY,
	AVEN_RUNTIME_AUTHORITY,
	resourceId
} from '../src/ids'
import {
	ACTOR_RUN_PROTOCOL,
	ACTOR_RUN_PROTOCOL_V1,
	assertPlanRunTransition,
	type PlanRunStartRequest,
	portableRunClone
} from '../src/run'

describe('portable plan runner protocol', () => {
	test('belongs to the neutral runtime authority rather than identity or an application', () => {
		expect(ACTOR_RUN_PROTOCOL).toBe('os.aven:protocol:actors:plan-runner@2')
		expect(ACTOR_RUN_PROTOCOL_V1).toBe('os.aven:protocol:actors:plan-runner@1')
		expect(AVEN_RUNTIME_AUTHORITY).toBe('os.aven')
		expect(AVEN_ID_AUTHORITY).toBe('id.aven')
		expect(AVEN_CEO_AUTHORITY).toBe('ceo.aven')
	})

	test('round-trips a placement-frozen run request without process references', () => {
		const request: PlanRunStartRequest = {
			protocol: ACTOR_RUN_PROTOCOL,
			requestId: 'request-1',
			idempotencyKey: 'run-1',
			requestedAt: '2026-08-28T12:00:00.000Z',
			skillRef: resourceId({
				authority: 'ceo.aven',
				kind: 'skill',
				namespace: 'docs.ingest',
				name: 'document-ingest',
				version: '1'
			}),
			executionEnvironment: 'server',
			security: {
				principal: { subjectId: 'user-1', kind: 'user', assurance: ['passkey'] },
				access: { tenantId: 'tenant-1', artifactGrantIds: ['grant-1'] },
				establishedBy: 'api.aven.ceo',
				authorizedAt: '2026-08-28T12:00:00.000Z'
			},
			ingredients: [{ predicate: 'ceo.aven.docs.document(invoice_1)', artifactId: 'artifact-1' }],
			goals: ['ceo.aven.bookkeeping.invoice_details(invoice_1)'],
			parameters: { quality: 'standard' }
		}

		expect(portableRunClone(request)).toEqual(request)
	})

	test('rejects values that JSON would silently erase', () => {
		expect(() => portableRunClone({ callback: () => undefined })).toThrow('not portable JSON')
		expect(() => portableRunClone({ optional: undefined })).toThrow('not portable JSON')
	})

	test('allows suspension and replanning but protects terminal states', () => {
		expect(() => assertPlanRunTransition('running', 'waiting_for_input')).not.toThrow()
		expect(() => assertPlanRunTransition('waiting_for_input', 'planning')).not.toThrow()
		expect(() => assertPlanRunTransition('succeeded', 'running')).toThrow(
			'invalid plan run transition'
		)
	})
})
