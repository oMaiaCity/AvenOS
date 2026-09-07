import {
	ACTOR_RUN_PROTOCOL,
	ACTOR_RUN_PROTOCOL_V1,
	type PlanRunStartCommand,
	resourceId
} from '@avenos/actors'
import { describe, expect, test } from 'vitest'
import { parsePlanRunStartCommand } from '../src/command.js'

const SOURCE_ID = '11111111-1111-4111-8111-111111111111'
const source = { predicate: 'ceo.aven.docs.file(invoice_1)', artifactId: SOURCE_ID }

const command = (): PlanRunStartCommand => ({
	protocol: ACTOR_RUN_PROTOCOL,
	requestId: 'request-1',
	idempotencyKey: 'artifact-first-1',
	requestedAt: '2026-08-30T12:00:00.000Z',
	skillRef: resourceId({
		authority: 'ceo.aven',
		kind: 'skill',
		namespace: 'docs.ingest',
		name: 'document-ingest',
		version: '1'
	}),
	executionEnvironment: 'server',
	ingredients: [source],
	goals: [],
	goalSpec: {
		mode: 'explore',
		subject: source,
		factFamilies: ['ceo.aven']
	},
	parameters: {}
})

describe('artifact-first run command', () => {
	test('accepts an explicit exploration scope with no exact goals', () => {
		expect(parsePlanRunStartCommand(command())).toEqual(command())
	})

	test('rejects exact goals on an exploratory run', () => {
		expect(() =>
			parsePlanRunStartCommand({
				...command(),
				goals: ['ceo.aven.bookkeeping.invoice_details(invoice_1)']
			})
		).toThrow()
	})

	test('rejects a subject which is not an admitted ingredient', () => {
		expect(() =>
			parsePlanRunStartCommand({
				...command(),
				goalSpec: {
					mode: 'explore',
					subject: {
						predicate: 'ceo.aven.docs.file(other_1)',
						artifactId: '22222222-2222-4222-8222-222222222222'
					},
					factFamilies: ['ceo.aven']
				}
			})
		).toThrow()
	})

	test('preserves the existing requirement that exact runs name a goal', () => {
		const value = command()
		delete value.goalSpec
		expect(() => parsePlanRunStartCommand(value)).toThrow()
	})

	test('accepts legacy exact commands but rejects exploration on protocol version 1', () => {
		const legacy = command()
		legacy.protocol = ACTOR_RUN_PROTOCOL_V1
		legacy.goals = ['ceo.aven.bookkeeping.invoice_details(invoice_1)']
		delete legacy.goalSpec
		expect(parsePlanRunStartCommand(legacy)).toEqual(legacy)

		const invalid = command()
		invalid.protocol = ACTOR_RUN_PROTOCOL_V1
		expect(() => parsePlanRunStartCommand(invalid)).toThrow()
	})
})
