import { customerComponentManifestSchema } from './manifest.js'

export const customerComponentCatalog = [
	customerComponentManifestSchema.parse({
		componentRef: 'ceo.aven:component:data:artifacts@1',
		contractVersion: 1,
		schema: 'artifact_store',
		targetSchemaVersion: 3,
		migrationSetDigest: 'd0f56d78fac8732d7340caf4079d7d63616e4a1599c56cddbe821326569cf72f',
		minimumRuntimeSchemaVersion: 1,
		maximumRuntimeSchemaVersion: 3,
		ownerRoleSuffix: 'art_owner',
		functionRoles: [
			{
				kind: 'ceo.aven:db-role:artifacts:api@1',
				roleSuffix: 'art_api',
				grantsFile: 'grants/art-api.sql',
				connectionLimit: 4
			}
		],
		dependencies: [],
		requiredByDefault: true
	}),
	customerComponentManifestSchema.parse({
		componentRef: 'ceo.aven:component:data:intents@1',
		contractVersion: 1,
		schema: 'aven_intents',
		targetSchemaVersion: 1,
		migrationSetDigest: 'f3a492c6ace83c96f9f2fb73ad0b45d567c6fca894bd02f5af237a342bfe968c',
		minimumRuntimeSchemaVersion: 1,
		maximumRuntimeSchemaVersion: 1,
		ownerRoleSuffix: 'int_owner',
		functionRoles: [
			{
				kind: 'ceo.aven:db-role:intents:api@1',
				roleSuffix: 'int_api',
				grantsFile: 'grants/int-api.sql',
				connectionLimit: 4
			}
		],
		dependencies: [],
		requiredByDefault: true
	}),
	customerComponentManifestSchema.parse({
		componentRef: 'os.aven:component:actors:run-repository@1',
		contractVersion: 1,
		schema: 'aven_actor_runs',
		targetSchemaVersion: 1,
		migrationSetDigest: 'db8feebbeb4514adcf0c0b2a04601b712ea8e00b436d6fbfc67a17958193732c',
		minimumRuntimeSchemaVersion: 1,
		maximumRuntimeSchemaVersion: 1,
		ownerRoleSuffix: 'act_owner',
		functionRoles: [
			{
				kind: 'os.aven:db-role:actors:api@1',
				roleSuffix: 'act_api',
				grantsFile: 'grants/act-api.sql',
				connectionLimit: 4
			},
			{
				kind: 'os.aven:db-role:actors:worker@1',
				roleSuffix: 'act_worker',
				grantsFile: 'grants/act-worker.sql',
				connectionLimit: 4
			}
		],
		dependencies: [],
		requiredByDefault: true
	})
] as const
