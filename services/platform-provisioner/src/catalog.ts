import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
	type CustomerComponentManifest,
	customerComponentCatalog,
	customerComponentManifestSchema
} from '@avenos/aven-customer-contracts'

export interface ComponentCatalogEntry {
	manifest: CustomerComponentManifest
	migrations: { id: string; sql: string; digest: string }[]
	grants: Record<string, { tables: Array<{ name: string; privileges: string[] }> }>
	externalProvisioner?: 'artifact-store'
	verifyTable?: string
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

async function entry(input: {
	folder: string
	componentRef: string
	schema: string
	ownerRoleSuffix: string
	targetSchemaVersion?: number
	migrationFiles?: Array<{ id: string; candidates: string[] }>
	externalProvisioner?: 'artifact-store'
	verifyTable?: string
	functionRoles: {
		kind: string
		roleSuffix: string
		tables: Array<string | { name: string; privileges: string[] }>
	}[]
}): Promise<ComponentCatalogEntry> {
	const defaultId = `0001_${input.folder.replaceAll('-', '_')}`
	const migrationFiles = input.migrationFiles ?? [
		{
			id: defaultId,
			candidates: [resolve(process.cwd(), 'components', input.folder, `${defaultId}.sql`)]
		}
	]
	const migrations = await Promise.all(
		migrationFiles.map(async (migration) => {
			let sql: string | undefined
			for (const candidate of migration.candidates) {
				try {
					sql = await readFile(candidate, 'utf8')
					break
				} catch {}
			}
			if (sql === undefined) throw new Error(`migration source is absent: ${migration.id}`)
			return { id: migration.id, sql, digest: sha256(sql) }
		})
	)
	const migrationSetDigest = sha256(
		migrations.map((migration) => `${migration.id}\0${migration.digest}`).join('\n')
	)
	const pinned = customerComponentCatalog.find((value) => value.componentRef === input.componentRef)
	if (!pinned || pinned.migrationSetDigest !== migrationSetDigest)
		throw new Error(`component catalog digest is not pinned for ${input.componentRef}`)
	const manifest = customerComponentManifestSchema.parse({
		componentRef: input.componentRef,
		contractVersion: 1,
		schema: input.schema,
		targetSchemaVersion: input.targetSchemaVersion ?? 1,
		migrationSetDigest: pinned.migrationSetDigest,
		minimumRuntimeSchemaVersion: 1,
		maximumRuntimeSchemaVersion: input.targetSchemaVersion ?? 1,
		ownerRoleSuffix: input.ownerRoleSuffix,
		functionRoles: input.functionRoles.map((role) => ({
			kind: role.kind,
			roleSuffix: role.roleSuffix,
			grantsFile: `grants/${role.roleSuffix.replaceAll('_', '-')}.sql`,
			connectionLimit: 4
		})),
		dependencies: [],
		requiredByDefault: true
	})
	return {
		manifest,
		migrations,
		grants: Object.fromEntries(
			input.functionRoles.map((role) => [
				role.kind,
				{
					tables: role.tables.map((table) =>
						typeof table === 'string'
							? { name: table, privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] }
							: table
					)
				}
			])
		),
		...(input.externalProvisioner && { externalProvisioner: input.externalProvisioner }),
		...(input.verifyTable && { verifyTable: input.verifyTable })
	}
}

export async function loadCatalog(): Promise<Map<string, ComponentCatalogEntry>> {
	const artifactMigration = (id: string) => ({
		id,
		candidates: [
			resolve(process.cwd(), 'artifact-migrations', `${id}.sql`),
			resolve(
				process.cwd(),
				'..',
				'artifact-store',
				'crates',
				'postgres',
				'migrations',
				`${id}.sql`
			)
		]
	})
	const entries = await Promise.all([
		entry({
			folder: 'artifacts',
			componentRef: 'ceo.aven:component:data:artifacts@1',
			schema: 'artifact_store',
			ownerRoleSuffix: 'art_owner',
			targetSchemaVersion: 3,
			migrationFiles: [
				artifactMigration('0001_core'),
				artifactMigration('0002_upload_cleanup'),
				artifactMigration('0003_intent_declaration_catalog')
			],
			externalProvisioner: 'artifact-store',
			verifyTable: 'store_state',
			functionRoles: [
				{
					kind: 'ceo.aven:db-role:artifacts:api@1',
					roleSuffix: 'art_api',
					tables: []
				}
			]
		}),
		entry({
			folder: 'intents',
			componentRef: 'ceo.aven:component:data:intents@1',
			schema: 'aven_intents',
			ownerRoleSuffix: 'int_owner',
			functionRoles: [
				{
					kind: 'ceo.aven:db-role:intents:api@1',
					roleSuffix: 'int_api',
					tables: ['intents', 'contributions', 'merge_commands', 'merge_relations']
				}
			]
		}),
		entry({
			folder: 'actor-runs',
			componentRef: 'os.aven:component:actors:run-repository@1',
			schema: 'aven_actor_runs',
			ownerRoleSuffix: 'act_owner',
			functionRoles: [
				{
					kind: 'os.aven:db-role:actors:api@1',
					roleSuffix: 'act_api',
					tables: [{ name: 'runs', privileges: ['SELECT', 'INSERT', 'UPDATE'] }]
				},
				{
					kind: 'os.aven:db-role:actors:worker@1',
					roleSuffix: 'act_worker',
					tables: [{ name: 'runs', privileges: ['SELECT', 'UPDATE'] }]
				}
			]
		})
	])
	return new Map(entries.map((value) => [value.manifest.componentRef, value]))
}

export function catalogDigest(catalog: Map<string, ComponentCatalogEntry>): string {
	return sha256(
		[...catalog.values()]
			.map((entry) => `${entry.manifest.componentRef}\0${entry.manifest.migrationSetDigest}`)
			.sort()
			.join('\n')
	)
}
