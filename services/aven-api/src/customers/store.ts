import { randomUUID } from 'node:crypto'
import {
	customerComponentCatalog,
	databaseNameForEnvironment,
	type MembershipRole,
	membershipAllows,
	type TenantGrantClaims
} from '@avenos/aven-customer-contracts'
import type { IdentityClaims } from '@avenos/aven-identity'
import type pg from 'pg'

export interface EntitlementEvent {
	eventId: string
	eventType: 'purchase_granted' | 'purchase_revoked'
	subjectId: string
	purchasedName: string
	occurredAt: string
}

export interface EnvironmentSummary {
	id: string
	purchasedName: string
	role: 'owner' | 'admin' | 'member'
	desiredState: string
	observedState: string
	routingGeneration: number
	components: { componentRef: string; desiredState: string; observedState: string }[]
}

export class CustomerAuthorizationError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message)
	}
}

const defaults = customerComponentCatalog

export class CustomerStore {
	constructor(private readonly pool: pg.Pool) {}

	async acceptEntitlement(
		event: EntitlementEvent
	): Promise<{ environmentId: string; replay: boolean }> {
		const client = await this.pool.connect()
		try {
			await client.query('BEGIN')
			const inserted = await client.query(
				`INSERT INTO customer_entitlement_events
				 (event_id,event_type,subject_id,purchased_name,occurred_at)
				 VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
				[event.eventId, event.eventType, event.subjectId, event.purchasedName, event.occurredAt]
			)
			const existing = await client.query<{ id: string }>(
				'SELECT id FROM customer_environments WHERE purchased_name=$1 FOR UPDATE',
				[event.purchasedName]
			)
			if (!inserted.rowCount) {
				const replay = (
					await client.query<{
						event_type: string
						subject_id: string
						purchased_name: string
						occurred_at: Date
					}>(
						`SELECT event_type,subject_id,purchased_name,occurred_at
						 FROM customer_entitlement_events WHERE event_id=$1 FOR UPDATE`,
						[event.eventId]
					)
				).rows[0]
				if (
					!replay ||
					replay.event_type !== event.eventType ||
					replay.subject_id !== event.subjectId ||
					replay.purchased_name !== event.purchasedName ||
					new Date(replay.occurred_at).getTime() !== new Date(event.occurredAt).getTime()
				)
					throw new CustomerAuthorizationError(
						409,
						'ENTITLEMENT_EVENT_CONFLICT',
						'The event ID is already bound to different entitlement data.'
					)
				if (!existing.rows[0]) throw new Error('entitlement replay has no environment')
				await client.query('COMMIT')
				return { environmentId: existing.rows[0].id, replay: true }
			}

			const environmentId = existing.rows[0]?.id ?? randomUUID()
			const desiredState = event.eventType === 'purchase_granted' ? 'ready' : 'suspended'
			if (existing.rows[0]) {
				await client.query(
					`UPDATE customer_environments SET owner_subject_id=$2,desired_state=$3,
					 observed_state='pending',routing_generation=CASE WHEN movement_id IS NULL
					 THEN routing_generation+1 ELSE routing_generation END,
					 updated_at=clock_timestamp() WHERE id=$1`,
					[environmentId, event.subjectId, desiredState]
				)
			} else {
				await client.query(
					`INSERT INTO customer_environments
					 (id,purchased_name,owner_subject_id,database_name,desired_state,observed_state,routing_generation)
					 VALUES($1,$2,$3,$4,$5,'pending',1)`,
					[
						environmentId,
						event.purchasedName,
						event.subjectId,
						databaseNameForEnvironment(environmentId),
						desiredState
					]
				)
			}
			await client.query(
				`INSERT INTO customer_environment_memberships(environment_id,subject_id,role)
				 VALUES($1,$2,'owner') ON CONFLICT(environment_id,subject_id) DO UPDATE SET role='owner'`,
				[environmentId, event.subjectId]
			)
			const generation = (
				await client.query<{ routing_generation: number }>(
					'SELECT routing_generation FROM customer_environments WHERE id=$1',
					[environmentId]
				)
			).rows[0]?.routing_generation
			if (!generation) throw new Error('environment generation missing')
			const components = existing.rows[0]
				? (
						await client.query<{
							component_ref: string
							target_schema_version: number
							migration_set_digest: string
						}>(
							'SELECT component_ref,target_schema_version,migration_set_digest FROM customer_environment_components WHERE environment_id=$1',
							[environmentId]
						)
					).rows.map((row) => ({
						componentRef: row.component_ref,
						targetSchemaVersion: row.target_schema_version,
						migrationSetDigest: row.migration_set_digest
					}))
				: defaults
			for (const component of components) {
				await client.query(
					`INSERT INTO customer_environment_components
					 (environment_id,component_ref,desired_state,observed_state,target_schema_version,
					  migration_set_digest,routing_generation)
					 VALUES($1,$2,$3,'pending',$4,$5,$6)
					 ON CONFLICT(environment_id,component_ref) DO UPDATE SET desired_state=EXCLUDED.desired_state,
					 observed_state='pending',target_schema_version=EXCLUDED.target_schema_version,
					 migration_set_digest=EXCLUDED.migration_set_digest,
					 routing_generation=EXCLUDED.routing_generation,updated_at=clock_timestamp()`,
					[
						environmentId,
						component.componentRef,
						desiredState,
						component.targetSchemaVersion,
						component.migrationSetDigest,
						generation
					]
				)
				await client.query(
					`INSERT INTO customer_component_operations
					 (id,environment_id,component_ref,action,status,target_schema_version,
					  migration_set_digest,routing_generation)
					 VALUES($1,$2,$3,$4,'queued',$5,$6,$7) ON CONFLICT DO NOTHING`,
					[
						randomUUID(),
						environmentId,
						component.componentRef,
						desiredState === 'ready' ? 'reconcile' : 'suspend',
						component.targetSchemaVersion,
						component.migrationSetDigest,
						generation
					]
				)
			}
			await client.query('COMMIT')
			return { environmentId, replay: false }
		} catch (error) {
			await client.query('ROLLBACK').catch(() => {})
			throw error
		} finally {
			client.release()
		}
	}

	async list(subjectId: string): Promise<EnvironmentSummary[]> {
		const environments = await this.pool.query<{
			id: string
			purchased_name: string
			role: 'owner' | 'admin' | 'member'
			desired_state: string
			observed_state: string
			routing_generation: number
		}>(
			`SELECT e.id,e.purchased_name,m.role,e.desired_state,e.observed_state,e.routing_generation
			 FROM customer_environments e JOIN customer_environment_memberships m ON m.environment_id=e.id
			 WHERE m.subject_id=$1 ORDER BY e.created_at,e.id`,
			[subjectId]
		)
		return Promise.all(
			environments.rows.map(async (row) => ({
				id: row.id,
				purchasedName: row.purchased_name,
				role: row.role,
				desiredState: row.desired_state,
				observedState: row.observed_state,
				routingGeneration: Number(row.routing_generation),
				components: (
					await this.pool.query<{
						component_ref: string
						desired_state: string
						observed_state: string
					}>(
						`SELECT component_ref,desired_state,observed_state
						 FROM customer_environment_components WHERE environment_id=$1 ORDER BY component_ref`,
						[row.id]
					)
				).rows.map((component) => ({
					componentRef: component.component_ref,
					desiredState: component.desired_state,
					observedState: component.observed_state
				}))
			}))
		)
	}

	async authorize(
		claims: IdentityClaims,
		environmentId: string,
		componentRef: string,
		actions: string[]
	): Promise<Omit<TenantGrantClaims, 'iat' | 'exp'> & { runtimeId: string }> {
		const row = (
			await this.pool.query<{
				database_name: string
				runtime_id: string
				movement_id: string | null
				routing_generation: number
				desired_state: string
				observed_state: string
				component_state: string
				membership_role: MembershipRole
			}>(
				`SELECT e.database_name,e.runtime_id,e.movement_id,e.routing_generation,e.desired_state,e.observed_state,
				 c.observed_state AS component_state,m.role AS membership_role
				 FROM customer_environments e
				 JOIN customer_environment_memberships m ON m.environment_id=e.id AND m.subject_id=$2
				 JOIN customer_environment_components c ON c.environment_id=e.id AND c.component_ref=$3
				 WHERE e.id=$1`,
				[environmentId, claims.sub, componentRef]
			)
		).rows[0]
		if (!row)
			throw new CustomerAuthorizationError(404, 'ENVIRONMENT_NOT_FOUND', 'Environment not found.')
		if (!membershipAllows(row.membership_role, componentRef, actions))
			throw new CustomerAuthorizationError(
				403,
				'MEMBERSHIP_ACTION_DENIED',
				'Your customer role does not permit this action.'
			)
		if (
			row.movement_id != null ||
			row.desired_state !== 'ready' ||
			row.observed_state !== 'ready' ||
			row.component_state !== 'ready'
		)
			throw new CustomerAuthorizationError(
				503,
				'COMPONENT_NOT_READY',
				'The customer component is not ready.'
			)
		return {
			iss: process.env.API_PUBLIC_BASE_URL ?? 'https://api.aven.ceo',
			aud: componentRef,
			sub: claims.sub,
			sid: claims.sid,
			role: claims.role,
			membershipRole: row.membership_role,
			environmentId,
			databaseName: row.database_name,
			runtimeId: row.runtime_id,
			routingGeneration: Number(row.routing_generation),
			componentRef,
			actions
		}
	}
}
