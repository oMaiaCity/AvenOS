import { z } from 'zod'
import { qualifiedRoleKindSchema, roleSuffixSchema } from './roles.js'

export const componentRefSchema = z
	.string()
	.regex(/^[a-z][a-z0-9-]{0,30}\.aven:component:[a-z][a-z0-9-]{0,40}:[a-z][a-z0-9-]{0,40}@1$/)

export const functionRoleSchema = z
	.object({
		kind: qualifiedRoleKindSchema,
		roleSuffix: roleSuffixSchema,
		grantsFile: z.string().regex(/^grants\/[a-z0-9-]+\.sql$/),
		connectionLimit: z.number().int().min(1).max(20)
	})
	.strict()

export const customerComponentManifestSchema = z
	.object({
		componentRef: componentRefSchema,
		contractVersion: z.literal(1),
		schema: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
		targetSchemaVersion: z.number().int().positive(),
		migrationSetDigest: z.string().regex(/^[0-9a-f]{64}$/),
		minimumRuntimeSchemaVersion: z.number().int().positive(),
		maximumRuntimeSchemaVersion: z.number().int().positive(),
		ownerRoleSuffix: roleSuffixSchema,
		functionRoles: z.array(functionRoleSchema).min(1),
		dependencies: z.array(componentRefSchema).default([]),
		requiredByDefault: z.boolean().default(true)
	})
	.strict()
	.superRefine((value, context) => {
		if (value.minimumRuntimeSchemaVersion > value.maximumRuntimeSchemaVersion)
			context.addIssue({ code: 'custom', message: 'runtime schema range is inverted' })
		const suffixes = [value.ownerRoleSuffix, ...value.functionRoles.map((role) => role.roleSuffix)]
		if (new Set(suffixes).size !== suffixes.length)
			context.addIssue({ code: 'custom', message: 'role suffixes must be unique' })
		const kinds = value.functionRoles.map((role) => role.kind)
		if (new Set(kinds).size !== kinds.length)
			context.addIssue({ code: 'custom', message: 'function role kinds must be unique' })
	})

export type CustomerComponentManifest = z.infer<typeof customerComponentManifestSchema>
