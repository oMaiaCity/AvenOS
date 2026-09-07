import { describe, expect, test } from 'bun:test'
import {
	compileObservationOperations,
	executeObservedProgram,
	type SolverFact,
	type SolverInvocation,
	type SolverOperation,
	type SolverReceipt,
	solve,
	solveObservedFrontier
} from '../src'

const fact = (id: string, predicate: string, value: unknown = {}): SolverFact => ({
	id,
	predicate,
	value
})
const operation = (
	id: string,
	requires: string[],
	produces: string[],
	extra: Partial<SolverOperation> = {}
): SolverOperation => ({
	id,
	actor: id,
	method: id,
	requires,
	produces,
	mode: 'transform',
	idempotency: 'pure',
	...extra
})
const receipt = (
	invocation: SolverInvocation,
	facts: SolverFact[],
	state: 'succeeded' | 'failed' = 'succeeded'
): SolverReceipt => ({
	invocationId: invocation.id,
	operation: invocation.operation,
	state,
	facts
})

describe('observation-driven general solver', () => {
	test('anonymous requirements are independent and Cartesian matching is bounded', async () => {
		const operations = [operation('join', ['left(X, _)', 'right(X, _)'], ['done(X)'])]
		const ingredients = [
			fact('left', 'left(subject, first)'),
			fact('right', 'right(subject, second)')
		]
		const port = {
			lookup: async () => null,
			invoke: async (invocation: SolverInvocation) =>
				receipt(invocation, [fact('done', 'done(subject)')])
		}
		expect(
			(
				await executeObservedProgram({
					runId: 'wildcard',
					operations,
					ingredients,
					goals: ['done(subject)'],
					port
				})
			).state
		).toBe('complete')
		expect(
			(
				await executeObservedProgram({
					runId: 'bounded',
					operations,
					ingredients,
					maxSearchAttempts: 1,
					port
				})
			).state
		).toBe('limit')
	})
	test('conjunctive goals require the same witness in the existing exact solver', () => {
		expect(
			solve(
				[],
				[{ predicate: 'candidate(first)' }, { predicate: 'validated(second)' }],
				['candidate(I)', 'validated(I)']
			).ok
		).toBe(false)
		expect(
			solve(
				[],
				[{ predicate: 'candidate(first)' }, { predicate: 'validated(first)' }],
				['candidate(I)', 'validated(I)']
			).ok
		).toBe(true)
	})

	test('observations, not advertised promises, select the next operation', async () => {
		const operations = [
			operation('inspect', ['source(F)'], ['inspection(F, Status)']),
			operation('extract', ['inspection(F, readable)'], ['text(F)'])
		]
		for (const status of ['readable', 'encrypted']) {
			const calls: string[] = []
			const result = await executeObservedProgram({
				runId: status,
				operations,
				ingredients: [fact('source', 'source(file)')],
				port: {
					lookup: async () => null,
					invoke: async (invocation) => {
						calls.push(invocation.operation)
						return receipt(invocation, [
							fact(
								invocation.id,
								invocation.operation === 'inspect' ? `inspection(file, ${status})` : 'text(file)'
							)
						])
					}
				}
			})
			expect(calls).toEqual(status === 'readable' ? ['inspect', 'extract'] : ['inspect'])
			expect(result.state).toBe('complete')
		}
	})

	test('never joins two extraction revisions from the same source', async () => {
		const normalize = operation(
			'normalize',
			['candidate(F, B, I)', 'details(F, B, D)', 'validation(I, V)'],
			['open_item(I, O)']
		)
		const ingredients = [
			fact('i1', 'candidate(file, first, i1)'),
			fact('d2', 'details(file, second, d2)'),
			fact('v1', 'validation(i1, v1)')
		]
		expect(await solveObservedFrontier('run', [normalize], ingredients)).toHaveLength(0)
		const ready = await solveObservedFrontier(
			'run',
			[normalize],
			[...ingredients, fact('d1', 'details(file, first, d1)')]
		)
		expect(ready).toHaveLength(1)
		expect(ready[0]?.inputs.map((input) => input.id)).toEqual(['i1', 'd1', 'v1'])
	})

	test('gathers only exact sealed members, in declared order, including empty collections', async () => {
		const assemble = operation('assemble', ['pages(F, C)'], ['document(F)'], {
			gathers: [{ name: 'text', collection: 0, member: 'P', predicate: 'text(F, P, T)' }]
		})
		const inputs = [
			fact('pages', 'pages(file, pages)', { members: ['second', 'first'] }),
			fact('first', 'text(file, first, text1)'),
			fact('unrelated', 'text(other, second, text2)')
		]
		expect(await solveObservedFrontier('run', [assemble], inputs)).toHaveLength(0)
		const complete = await solveObservedFrontier(
			'run',
			[assemble],
			[...inputs, fact('second', 'text(file, second, text2)')]
		)
		expect(complete[0]?.gathers.text?.map((input) => input.id)).toEqual(['second', 'first'])
		const empty = await solveObservedFrontier(
			'run',
			[assemble],
			[fact('empty', 'pages(file, pages)', { members: [] })]
		)
		expect(empty[0]?.gathers.text).toEqual([])
		await expect(
			solveObservedFrontier(
				'run',
				[assemble],
				[
					...inputs,
					fact('second', 'text(file, second, text2)'),
					fact('dupe', 'text(file, first, other)')
				]
			)
		).rejects.toThrow('ambiguous collection member')
	})

	test('replays committed prefix after interruption without reinvoking it', async () => {
		const operations = [
			operation('first', ['source(F)'], ['intermediate(F)']),
			operation('second', ['intermediate(F)'], ['done(F)'])
		]
		const persisted = new Map<string, SolverReceipt>()
		const calls: string[] = []
		let interrupt = true
		const options = {
			runId: 'stable',
			operations,
			ingredients: [fact('source', 'source(file)')],
			goals: ['done(file)'],
			port: {
				lookup: async (invocation: SolverInvocation) => persisted.get(invocation.id) ?? null,
				invoke: async (invocation: SolverInvocation) => {
					calls.push(invocation.operation)
					const committed = receipt(invocation, [
						fact(
							invocation.id,
							invocation.operation === 'first' ? 'intermediate(file)' : 'done(file)'
						)
					])
					persisted.set(invocation.id, committed)
					if (interrupt) {
						interrupt = false
						throw new Error('lost acknowledgement after commit')
					}
					return committed
				}
			}
		}
		await expect(executeObservedProgram(options)).rejects.toThrow('lost acknowledgement')
		expect((await executeObservedProgram(options)).state).toBe('complete')
		expect(calls).toEqual(['first', 'second'])
	})

	test('failed observers can unblock declared fallback without inventing success', async () => {
		const operations = [
			operation('model', ['source(F)'], ['recognized(F)'], {
				failureProduces: ['model_failed(F)']
			}),
			operation('fallback', ['model_failed(F)'], ['native(F)'])
		]
		const result = await executeObservedProgram({
			runId: 'run',
			operations,
			ingredients: [fact('source', 'source(file)')],
			port: {
				lookup: async () => null,
				invoke: async (invocation) =>
					invocation.operation === 'model'
						? receipt(invocation, [fact('failed', 'model_failed(file)')], 'failed')
						: receipt(invocation, [fact('native', 'native(file)')])
			}
		})
		expect(result.state).toBe('partial')
		expect(result.facts.map((item) => item.predicate)).not.toContain('recognized(file)')
		expect(result.facts.map((item) => item.predicate)).toContain('native(file)')
	})

	test('excludes effects by default and reports limits and unresolved goals honestly', async () => {
		const options = {
			runId: 'run',
			operations: [operation('effect', ['source(F)'], ['sent(F)'], { mode: 'effect' })],
			ingredients: [fact('source', 'source(file)')],
			goals: ['sent(file)'],
			port: {
				lookup: async () => null,
				invoke: async (invocation: SolverInvocation) =>
					receipt(invocation, [fact('sent', 'sent(file)')])
			}
		}
		expect((await executeObservedProgram(options)).state).toBe('no-route')
		expect(
			(await executeObservedProgram({ ...options, allowEffects: true, maxInvocations: 0 })).state
		).toBe('limit')
		expect((await executeObservedProgram({ ...options, allowEffects: true })).state).toBe(
			'complete'
		)
		const signal = AbortSignal.abort()
		expect((await executeObservedProgram({ ...options, signal })).state).toBe('cancelled')
	})

	test('rejects ungrounded inputs, undeclared observations and wrong receipts', async () => {
		const options = {
			runId: 'run',
			operations: [operation('validate', ['invoice(I)'], ['validation(I, V)'])],
			ingredients: [fact('invoice', 'invoice(first)')],
			port: {
				lookup: async () => null,
				invoke: async (invocation: SolverInvocation) =>
					receipt(invocation, [fact('other', 'validation(second, report)')])
			}
		}
		await expect(
			executeObservedProgram({ ...options, ingredients: [fact('invoice', 'invoice(I)')] })
		).rejects.toThrow('not grounded')
		await expect(executeObservedProgram(options)).rejects.toThrow('undeclared observation')
		await expect(
			executeObservedProgram({
				...options,
				port: {
					...options.port,
					lookup: async () => ({
						invocationId: 'wrong',
						operation: 'validate',
						state: 'succeeded',
						facts: []
					})
				}
			})
		).rejects.toThrow('does not belong')
	})

	test('rejects invalid catalogs before any execution', () => {
		const rule = operation('rule', ['source(F)'], ['done(F)'])
		expect(() => compileObservationOperations([rule, rule])).toThrow('duplicate operation')
		expect(() => compileObservationOperations([{ ...rule, cost: -1 }])).toThrow(
			'invalid operation cost'
		)
		expect(() =>
			compileObservationOperations([{ ...rule, requires: ['source(nested(F))'] }])
		).toThrow('unsupported predicate syntax')
	})
})
