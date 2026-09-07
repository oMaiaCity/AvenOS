import {
	ACTOR_RUN_PROTOCOL,
	ACTOR_RUN_PROTOCOL_V1,
	assertPortableRunValue,
	type PlanRunStartCommand
} from '@avenos/actors/run'
import { z } from 'zod'

const qualifiedResource = z
	.string()
	.regex(/^[a-z][a-z0-9.-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*:[a-z][a-z0-9-]*@[1-9][0-9]*$/)
const predicate = z
	.string()
	.min(3)
	.max(2_048)
	.regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+\(.+\)$/)
const ingredient = z
	.object({
		predicate,
		artifactId: z.uuid().optional()
	})
	.strict()
const factFamily = z
	.string()
	.min(3)
	.max(512)
	.regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/)
const explorationScope = {
	subject: ingredient,
	factFamilies: z.array(factFamily).min(1).max(128)
}
const goalSpec = z.union([
	z
		.object({
			mode: z.literal('explore'),
			...explorationScope
		})
		.strict(),
	z.object({ mode: z.literal('exact'), completion: z.literal('goal_only') }).strict(),
	z
		.object({
			mode: z.literal('exact'),
			completion: z.literal('goal_then_enrich'),
			...explorationScope
		})
		.strict()
])

const planRunStartCommandSchema = z
	.object({
		protocol: z.union([z.literal(ACTOR_RUN_PROTOCOL), z.literal(ACTOR_RUN_PROTOCOL_V1)]),
		requestId: z.string().min(1).max(255),
		idempotencyKey: z.string().min(1).max(512),
		requestedAt: z.iso.datetime({ offset: true }),
		skillRef: qualifiedResource,
		executionEnvironment: z.literal('server'),
		ingredients: z.array(ingredient).max(256),
		goals: z.array(predicate).max(64),
		goalSpec: goalSpec.optional(),
		parameters: z.record(z.string(), z.unknown())
	})
	.strict()
	.superRefine((command, context) => {
		if (command.protocol === ACTOR_RUN_PROTOCOL_V1 && command.goalSpec) {
			context.addIssue({
				code: 'custom',
				path: ['goalSpec'],
				message: 'protocol version 1 supports exact goals only'
			})
		}
		const mode = command.goalSpec?.mode ?? 'exact'
		if (mode === 'explore' && command.goals.length > 0) {
			context.addIssue({
				code: 'custom',
				path: ['goals'],
				message: 'exploration has no exact goals'
			})
		}
		if (mode === 'exact' && command.goals.length === 0) {
			context.addIssue({ code: 'custom', path: ['goals'], message: 'exact execution needs a goal' })
		}
		const subject = command.goalSpec && 'subject' in command.goalSpec && command.goalSpec.subject
		if (
			subject &&
			!command.ingredients.some(
				(ingredient) =>
					ingredient.predicate === subject.predicate && ingredient.artifactId === subject.artifactId
			)
		) {
			context.addIssue({
				code: 'custom',
				path: ['goalSpec', 'subject'],
				message: 'exploration subject must be an admitted ingredient'
			})
		}
	})

/** Parse the external command. `.strict()` makes asserted `security` fail closed. */
export function parsePlanRunStartCommand(value: unknown): PlanRunStartCommand {
	const command = planRunStartCommandSchema.parse(value) as PlanRunStartCommand
	assertPortableRunValue(command)
	return command
}
