import { describe, expect, test } from 'bun:test'
import {
	Actor,
	type ActorAuthorizationRequest,
	type ActorAuthorizer,
	ActorRegistry,
	authorizeRegistryForPlanning,
	definitionFromManifest,
	MessageBus,
	resourceId,
	solveAuthorized
} from '../src/lib/actors/bus'

const allowAll: ActorAuthorizer = {
	decide(request: ActorAuthorizationRequest) {
		return { allow: true, decisionId: `allow:${request.action}` }
	}
}

describe('generic actor registry', () => {
	test('tracks local actor instances without taking lifecycle ownership from their host', () => {
		const actor = new Actor(
			{
				id: 'normalize',
				authority: 'ceo.aven',
				namespace: 'examples',
				version: '1',
				name: 'Normalizer',
				description: 'Normalizes an input.',
				tags: ['example'],
				methods: [
					{
						name: 'normalize',
						description: 'Normalize.',
						parameters: { type: 'object' },
						requires: ['ceo.aven.examples.raw(X)'],
						produces: ['ceo.aven.examples.normalized(X)'],
						idempotency: 'pure'
					}
				]
			},
			{ normalize: () => ({ record: '{}', wire: 'ok' }) }
		)
		const bus = new MessageBus()
		bus.register(actor)

		const registered = bus.registry.snapshot()
		expect(registered.definitions.map((definition) => definition.ref)).toEqual([
			'ceo.aven:actor:examples:normalize@1'
		])
		expect(registered.instances[0]?.instanceId).toBe(actor.uuid)
		expect(registered.definitions[0]?.capabilities[0]?.method).toBe('normalize')

		bus.unregister(actor.uuid)
		expect(bus.registry.snapshot().instances).toHaveLength(0)
	})

	test('plans against a spawnable actor even when no instance exists yet', async () => {
		const registry = new ActorRegistry(() => new Date('2026-08-28T12:00:00.000Z'))
		const definition = definitionFromManifest({
			id: 'xrechnung-reader',
			authority: 'ceo.aven',
			namespace: 'bookkeeping',
			version: '1',
			name: 'XRechnung reader',
			description: 'Reads machine-readable XRechnung invoices.',
			tags: ['bookkeeping'],
			methods: [
				{
					name: 'read_xrechnung',
					description: 'Read one XRechnung.',
					parameters: { type: 'object' },
					requires: ['ceo.aven.docs.document(D)', 'ceo.aven.docs.document_profile(D, xrechnung)'],
					produces: ['ceo.aven.bookkeeping.invoice_details(D)'],
					idempotency: 'pure',
					cost: 1
				}
			]
		})
		registry.registerDefinition(definition)
		const offerId = resourceId({
			authority: 'ceo.aven',
			kind: 'offer',
			namespace: 'docs.ingest',
			name: 'local-xrechnung',
			version: '1'
		})
		registry.publishOffer({
			offerId,
			factoryId: resourceId({
				authority: 'os.aven',
				kind: 'factory',
				namespace: 'runtime',
				name: 'desktop-actor-host',
				version: '1'
			}),
			definitionRef: definition.ref,
			label: 'Local XRechnung reader',
			capabilityIds: definition.capabilities.map((capability) => capability.id),
			executionEnvironment: 'local',
			cost: 0
		})
		const visionDefinition = definitionFromManifest({
			id: 'invoice-vision-reader',
			authority: 'ceo.aven',
			namespace: 'bookkeeping',
			version: '1',
			name: 'Invoice vision reader',
			description: 'Reads invoice page images.',
			tags: ['bookkeeping'],
			methods: [
				{
					name: 'read_invoice_image',
					description: 'Read invoice page images.',
					parameters: { type: 'object' },
					requires: ['ceo.aven.docs.document(D)', 'ceo.aven.docs.page_image(D)'],
					produces: ['ceo.aven.bookkeeping.invoice_details(D)'],
					idempotency: 'pure',
					cost: 8
				}
			]
		})
		registry.registerDefinition(visionDefinition)
		registry.publishOffer({
			offerId: resourceId({
				authority: 'ceo.aven',
				kind: 'offer',
				namespace: 'docs.ingest',
				name: 'invoice-vision',
				version: '1'
			}),
			factoryId: resourceId({
				authority: 'ceo.aven',
				kind: 'factory',
				namespace: 'ai.runtime',
				name: 'model-actor-host',
				version: '1'
			}),
			definitionRef: visionDefinition.ref,
			label: 'Invoice vision',
			capabilityIds: visionDefinition.capabilities.map((capability) => capability.id),
			executionEnvironment: 'local',
			cost: 3
		})

		const view = await authorizeRegistryForPlanning(
			registry.snapshot(),
			{ subjectId: 'user-1', kind: 'user', assurance: ['passkey'] },
			allowAll,
			{ access: { entitlements: ['bookkeeping'] } }
		)
		const result = solveAuthorized(
			view,
			[
				{ predicate: 'ceo.aven.docs.document(invoice_1)', artifactId: 'file-1' },
				{
					predicate: 'ceo.aven.docs.document_profile(invoice_1, xrechnung)',
					artifactId: 'inspection-1'
				}
			],
			['ceo.aven.bookkeeping.invoice_details(invoice_1)'],
			{ executionEnvironment: 'local' }
		)

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.program.steps[0]?.method).toBe('read_xrechnung')
		expect(result.program.steps[0]?.target).toMatchObject({
			kind: 'factory',
			offerId
		})

		const scanned = solveAuthorized(
			view,
			[
				{ predicate: 'ceo.aven.docs.document(invoice_2)', artifactId: 'file-2' },
				{ predicate: 'ceo.aven.docs.page_image(invoice_2)', artifactId: 'page-2' }
			],
			['ceo.aven.bookkeeping.invoice_details(invoice_2)'],
			{ executionEnvironment: 'local' }
		)
		expect(scanned.ok).toBe(true)
		if (scanned.ok) expect(scanned.program.steps[0]?.method).toBe('read_invoice_image')
	})

	test('hides unauthorized actor configurations before planning', async () => {
		const registry = new ActorRegistry(() => new Date('2026-08-28T12:00:00.000Z'))
		const definition = definitionFromManifest({
			id: 'vision-reader',
			authority: 'ceo.aven',
			namespace: 'docs.vision',
			version: '1',
			name: 'Vision reader',
			description: 'Reads page images.',
			tags: ['docs'],
			methods: [
				{
					name: 'read_page',
					description: 'Read a page.',
					parameters: { type: 'object' },
					requires: ['ceo.aven.docs.page_image(P)'],
					produces: ['ceo.aven.docs.page_text(P)']
				}
			]
		})
		registry.registerDefinition(definition)
		for (const [offerName, quality, cost] of [
			['vision-standard', 'standard', 3],
			['vision-premium', 'high-accuracy', 1]
		] as const) {
			registry.publishOffer({
				offerId: resourceId({
					authority: 'ceo.aven',
					kind: 'offer',
					namespace: 'docs.vision',
					name: offerName,
					version: '1'
				}),
				factoryId: resourceId({
					authority: 'ceo.aven',
					kind: 'factory',
					namespace: 'ai.runtime',
					name: 'model-actor-host',
					version: '1'
				}),
				definitionRef: definition.ref,
				label: quality,
				capabilityIds: definition.capabilities.map((capability) => capability.id),
				executionEnvironment: 'local',
				defaultConfiguration: { quality },
				cost
			})
		}
		const tierAuthorizer: ActorAuthorizer = {
			decide(request) {
				if (
					request.action === 'plan' &&
					request.configuration?.quality === 'high-accuracy' &&
					!request.access.entitlements?.includes('vision-premium')
				) {
					return { allow: false, decisionId: 'tier-deny', reasonCode: 'product-tier' }
				}
				return { allow: true, decisionId: `tier-allow:${request.action}` }
			}
		}

		const view = await authorizeRegistryForPlanning(
			registry.snapshot(),
			{ subjectId: 'basic-user', kind: 'user', assurance: ['passkey'] },
			tierAuthorizer,
			{ access: { entitlements: ['vision-standard'] } }
		)
		const result = solveAuthorized(
			view,
			[{ predicate: 'ceo.aven.docs.page_image(page_1)', artifactId: 'page-1' }],
			['ceo.aven.docs.page_text(page_1)'],
			{ executionEnvironment: 'local' }
		)

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.program.steps[0]?.target).toMatchObject({
			kind: 'factory',
			offerId: 'ceo.aven:offer:docs.vision:vision-standard@1',
			configuration: { quality: 'standard' }
		})
	})

	test('can invoke one capability repeatedly for independently bound facts', () => {
		const result = solveAuthorized(
			{
				registryRevision: 1,
				capturedAt: '2026-08-28T12:00:00.000Z',
				principal: { subjectId: 'user-1', kind: 'user', assurance: ['passkey'] },
				access: {},
				capabilities: [
					{
						capability: {
							id: 'docs.ocr@1.read',
							actor: 'docs.ocr@1',
							method: 'read',
							requires: ['ceo.aven.docs.page(P)'],
							produces: ['ceo.aven.docs.text(P)']
						},
						targets: [
							{
								kind: 'instance',
								instanceId: 'ocr-1',
								definitionRef: 'docs.ocr@1',
								address: { kind: 'local', value: 'ocr-1' },
								executionEnvironment: 'local',
								cost: 0,
								authorization: { allow: true, decisionId: 'allow' }
							}
						]
					}
				]
			},
			[{ predicate: 'ceo.aven.docs.page(one)' }, { predicate: 'ceo.aven.docs.page(two)' }],
			['ceo.aven.docs.text(one)', 'ceo.aven.docs.text(two)'],
			{ executionEnvironment: 'local' }
		)

		expect(result.ok).toBe(true)
		if (result.ok) expect(result.program.steps.map((step) => step.method)).toEqual(['read', 'read'])
	})

	test('places a whole plan only in the requested execution environment', () => {
		const result = solveAuthorized(
			{
				registryRevision: 4,
				capturedAt: '2026-08-28T12:00:00.000Z',
				principal: { subjectId: 'user-1', kind: 'user', assurance: ['passkey'] },
				access: { tenantId: 'tenant-1' },
				capabilities: [
					{
						capability: {
							id: 'ceo.aven:capability:docs.vision:read@1',
							actor: 'ceo.aven:actor:docs.vision:reader@1',
							method: 'read',
							requires: ['ceo.aven.docs.page(P)'],
							produces: ['ceo.aven.docs.text(P)']
						},
						targets: [
							{
								kind: 'instance',
								instanceId: 'server-reader',
								definitionRef: 'ceo.aven:actor:docs.vision:reader@1',
								address: { kind: 'http', value: 'https://worker.example' },
								executionEnvironment: 'server',
								cost: 0,
								authorization: { allow: true, decisionId: 'allow-server' }
							},
							{
								kind: 'instance',
								instanceId: 'local-reader',
								definitionRef: 'ceo.aven:actor:docs.vision:reader@1',
								address: { kind: 'local', value: 'local-reader' },
								executionEnvironment: 'local',
								cost: 3,
								authorization: { allow: true, decisionId: 'allow-local' }
							}
						]
					}
				]
			},
			[{ predicate: 'ceo.aven.docs.page(one)' }],
			['ceo.aven.docs.text(one)'],
			{ executionEnvironment: 'local' }
		)

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.program.executionEnvironment).toBe('local')
		expect(result.program.plannedFor.tenantId).toBe('tenant-1')
		expect(result.program.steps[0]?.target).toMatchObject({
			executionEnvironment: 'local',
			instanceId: 'local-reader'
		})
	})

	test('rejects catalog identities with an omitted authority', () => {
		expect(() =>
			resourceId({
				authority: undefined as unknown as string,
				kind: 'actor',
				namespace: 'tests',
				name: 'unnamed-owner',
				version: '1'
			})
		).toThrow('invalid resource authority')
	})
})
