import type pg from 'pg'

export interface Operation {
	id: string
	environmentId: string
	databaseName: string
	componentRef: string
	action: 'reconcile' | 'suspend'
	targetSchemaVersion: number
	migrationSetDigest: string
	routingGeneration: number
}

export class ControlStore {
	constructor(
		private readonly pool: pg.Pool,
		private readonly instanceId: string,
		private readonly leaseSeconds: number
	) {}

	async heartbeat(catalogDigest: string): Promise<void> {
		await this.pool.query(
			`INSERT INTO platform_worker_heartbeats
			 (worker_name,instance_id,catalog_digest,started_at,last_heartbeat_at)
			 VALUES('platform-provisioner',$1,$2,now(),now())
			 ON CONFLICT(worker_name) DO UPDATE SET instance_id=EXCLUDED.instance_id,
			 catalog_digest=EXCLUDED.catalog_digest,last_heartbeat_at=now()`,
			[this.instanceId, catalogDigest]
		)
	}

	async claim(): Promise<Operation | null> {
		const client = await this.pool.connect()
		try {
			await client.query('BEGIN')
			const row = (
				await client.query<{
					id: string
					environment_id: string
					database_name: string
					component_ref: string
					action: 'reconcile' | 'suspend'
					target_schema_version: number
					migration_set_digest: string
					routing_generation: number
				}>(
					`SELECT o.id,o.environment_id,e.database_name,o.component_ref,o.action,
					 o.target_schema_version,o.migration_set_digest,o.routing_generation
					 FROM customer_component_operations o
					 JOIN customer_environments e ON e.id=o.environment_id
					 WHERE o.status='queued' OR (o.status='running' AND o.lease_expires_at<now())
					 ORDER BY o.created_at,o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1`
				)
			).rows[0]
			if (!row) {
				await client.query('COMMIT')
				return null
			}
			await client.query(
				`UPDATE customer_component_operations SET status='running',attempt=attempt+1,
				 lease_owner=$2,lease_expires_at=now()+make_interval(secs=>$3),updated_at=now()
				 WHERE id=$1`,
				[row.id, this.instanceId, this.leaseSeconds]
			)
			await client.query(
				`UPDATE customer_environment_components SET observed_state='reconciling',
				 last_operation_id=$3,updated_at=now() WHERE environment_id=$1 AND component_ref=$2`,
				[row.environment_id, row.component_ref, row.id]
			)
			await client.query(
				"UPDATE customer_environments SET observed_state='reconciling',updated_at=now() WHERE id=$1",
				[row.environment_id]
			)
			await client.query('COMMIT')
			return {
				id: row.id,
				environmentId: row.environment_id,
				databaseName: row.database_name,
				componentRef: row.component_ref,
				action: row.action,
				targetSchemaVersion: row.target_schema_version,
				migrationSetDigest: row.migration_set_digest,
				routingGeneration: Number(row.routing_generation)
			}
		} catch (error) {
			await client.query('ROLLBACK').catch(() => {})
			throw error
		} finally {
			client.release()
		}
	}

	async finish(operation: Operation): Promise<void> {
		const client = await this.pool.connect()
		try {
			await client.query('BEGIN')
			const current = await client.query(
				`UPDATE customer_component_operations SET status='succeeded',lease_owner=NULL,
				 lease_expires_at=NULL,last_error=NULL,updated_at=now()
				 WHERE id=$1 AND status='running' AND lease_owner=$2 RETURNING id`,
				[operation.id, this.instanceId]
			)
			if (!current.rowCount) throw new Error('provisioning attempt is stale')
			await client.query(
				`UPDATE customer_environment_components SET observed_state=$3,
				 observed_schema_version=$4,observed_migration_set_digest=$5,last_error=NULL,
				 updated_at=now() WHERE environment_id=$1 AND component_ref=$2
				 AND routing_generation=$6`,
				[
					operation.environmentId,
					operation.componentRef,
					operation.action === 'suspend' ? 'suspended' : 'ready',
					operation.targetSchemaVersion,
					operation.migrationSetDigest,
					operation.routingGeneration
				]
			)
			await client.query(
				`UPDATE customer_environments e SET observed_state=CASE
				 WHEN e.desired_state='suspended' AND NOT EXISTS (
				   SELECT 1 FROM customer_environment_components c WHERE c.environment_id=e.id
				   AND c.observed_state<>'suspended') THEN 'suspended'
				 WHEN e.desired_state='ready' AND NOT EXISTS (
				   SELECT 1 FROM customer_environment_components c WHERE c.environment_id=e.id
				   AND c.observed_state<>'ready') THEN 'ready'
				 ELSE 'reconciling' END,updated_at=now() WHERE e.id=$1`,
				[operation.environmentId]
			)
			await client.query('COMMIT')
		} catch (error) {
			await client.query('ROLLBACK').catch(() => {})
			throw error
		} finally {
			client.release()
		}
	}

	async fail(operation: Operation, error: unknown): Promise<void> {
		const message = String(error).slice(0, 1000)
		await this.pool.query(
			`UPDATE customer_component_operations SET status='failed',lease_owner=NULL,
			 lease_expires_at=NULL,last_error=$3,updated_at=now()
			 WHERE id=$1 AND lease_owner=$2`,
			[operation.id, this.instanceId, message]
		)
		await this.pool.query(
			`UPDATE customer_environment_components SET observed_state='failed',last_error=$3,
			 updated_at=now() WHERE environment_id=$1 AND component_ref=$2`,
			[operation.environmentId, operation.componentRef, message]
		)
		await this.pool.query(
			"UPDATE customer_environments SET observed_state='failed',last_error=$2,updated_at=now() WHERE id=$1",
			[operation.environmentId, message]
		)
	}
}
