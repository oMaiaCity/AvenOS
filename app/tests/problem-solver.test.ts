import { describe, expect, test } from 'bun:test'
import { type Capability, capabilitiesFromManifests, solve } from '../src/lib/skills/problem-solver'

const inboxToTodo: Capability[] = [
	{
		id: 'inbox.normalize-mail',
		actor: 'inbox@desktop',
		method: 'normalize_mail',
		requires: ['mail(M)'],
		produces: ['intake(M)']
	},
	{
		id: 'inbox.normalize-upload',
		actor: 'inbox@desktop',
		method: 'normalize_upload',
		requires: ['upload(U)'],
		produces: ['intake(U)']
	},
	{
		id: 'inbox.classify',
		actor: 'classifier@server',
		method: 'classify',
		requires: ['intake(I)'],
		produces: ['intent(I, todo)'],
		cost: 2
	},
	{
		id: 'inbox.route-todo',
		actor: 'inbox@desktop',
		method: 'route_todo',
		requires: ['intent(I, todo)'],
		produces: ['todo_intent(I)']
	},
	{
		id: 'todos.create',
		actor: 'todos@server',
		method: 'todo_create',
		requires: ['todo_intent(I)'],
		produces: ['todo(I)']
	}
]

describe('ad-hoc capability planner', () => {
	test('derives invocable method capabilities from actor registry manifests', () => {
		const capabilities = capabilitiesFromManifests([
			{
				id: 'document-text',
				authority: 'ceo.aven',
				namespace: 'tests.solver',
				version: '1',
				name: 'Document text',
				description: 'Extract text.',
				tags: ['document'],
				requires: ['page(P)'],
				produces: ['text(P)'],
				methods: [
					{
						name: 'extract_text',
						description: 'Extract page text.',
						parameters: { type: 'object' }
					},
					{
						name: 'inspect',
						description: 'Inspect metadata.',
						parameters: { type: 'object' },
						requires: ['file(F)'],
						produces: ['metadata(F)']
					},
					{
						name: 'ping',
						description: 'Health check.',
						parameters: { type: 'object' },
						produces: []
					}
				]
			}
		])

		expect(capabilities).toEqual([
			{
				id: 'ceo.aven:capability:tests.solver.document-text:extract_text@1',
				actor: 'ceo.aven:actor:tests.solver:document-text@1',
				method: 'extract_text',
				requires: ['page(P)'],
				produces: ['text(P)'],
				mode: 'transform',
				idempotency: 'none',
				parametersSchema: { type: 'object' }
			},
			{
				id: 'ceo.aven:capability:tests.solver.document-text:inspect@1',
				actor: 'ceo.aven:actor:tests.solver:document-text@1',
				method: 'inspect',
				requires: ['file(F)'],
				produces: ['metadata(F)'],
				mode: 'transform',
				idempotency: 'none',
				parametersSchema: { type: 'object' }
			}
		])
	})

	test('compiles registry capabilities into a concrete envelope program', () => {
		const result = solve(
			inboxToTodo,
			[{ predicate: 'mail(message_42)', artifactId: 'artifact-mail-42' }],
			['todo(message_42)']
		)

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.program.steps.map((step) => step.method)).toEqual([
			'normalize_mail',
			'classify',
			'route_todo',
			'todo_create'
		])
		expect(result.program.steps[0]?.inputs[0]?.source).toEqual({
			kind: 'ingredient',
			artifactId: 'artifact-mail-42'
		})
		expect(result.program.results[0]?.predicate).toBe('todo(message_42)')
		expect(result.program.totalCost).toBe(5)
	})

	test('treats alternative producers as OR and picks the cheaper physical plan', () => {
		const result = solve(
			[
				{
					id: 'ocr.remote',
					actor: 'ocr@server',
					method: 'extract_text',
					requires: ['file(F)'],
					produces: ['text(F)'],
					cost: 8
				},
				{
					id: 'ocr.local',
					actor: 'ocr@device',
					method: 'extract_text',
					requires: ['file(F)'],
					produces: ['text(F)'],
					cost: 2
				}
			],
			[{ predicate: 'file(scan_7)' }],
			['text(scan_7)']
		)

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.program.steps.map((step) => step.capability)).toEqual(['ocr.local'])
	})

	test("treats a capability's inputs as AND with consistent variable bindings", () => {
		const result = solve(
			[
				{
					id: 'reconcile',
					actor: 'finance@server',
					method: 'reconcile',
					requires: ['invoice(I)', 'payment(I)'],
					produces: ['reconciled(I)']
				}
			],
			[
				{ predicate: 'invoice(inv_1)' },
				{ predicate: 'payment(inv_2)' },
				{ predicate: 'payment(inv_1)' }
			],
			['reconciled(inv_1)']
		)

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.program.steps[0]?.inputs.map((input) => input.predicate)).toEqual([
			'invoice(inv_1)',
			'payment(inv_1)'
		])
	})

	test('reports a goal for which the registry has no complete proof', () => {
		const result = solve(inboxToTodo, [{ predicate: 'upload(scan_7)' }], ['archived(scan_7)'])

		expect(result).toMatchObject({
			ok: false,
			unmetGoals: ['archived(scan_7)']
		})
	})
})
