import { randomUUID } from 'node:crypto'
import type pg from 'pg'

export type MovementPhase =
	| 'paused'
	| 'fenced'
	| 'copied'
	| 'verified'
	| 'activated'
	| 'completed'
	| 'cancelled'
	| 'superseded'
export interface Movement {
	id: string
	environment_id: string
	database_name: string
	source_runtime_id: string
	destination_runtime_id: string
	source_generation: number
	destination_generation: number
	phase: MovementPhase
	mode: 'move' | 'rollback'
	rollback_of: string | null
	accept_divergence: boolean
	evidence: Record<string, unknown>
}

/** The directory is the only authority that publishes a customer's new location. */
export class CustomerMovementStore {
	constructor(private readonly pool: pg.Pool) {}

	async registerRuntime(id: string, releaseSha: string): Promise<void> {
		if (!/^[a-z][a-z0-9-]{0,62}$/.test(id) || !/^[a-f0-9]{40}$/.test(releaseSha))
			throw new Error('runtime identity is invalid')
		const result = await this.pool.query(
			`INSERT INTO customer_runtimes(id,release_sha) VALUES($1,$2)
			 ON CONFLICT(id) DO UPDATE SET release_sha=EXCLUDED.release_sha
			 WHERE customer_runtimes.release_sha IS NULL OR customer_runtimes.release_sha=EXCLUDED.release_sha
			 RETURNING id`,
			[id, releaseSha]
		)
		if (!result.rowCount) throw new Error('runtime ID is already bound to another release')
	}

	async begin(input: {
		id?: string
		environmentId: string
		sourceRuntimeId: string
		destinationRuntimeId: string
		expectedGeneration: number
		rollbackOf?: string
		acceptDivergence?: boolean
	}): Promise<string> {
		const id = input.id ?? randomUUID()
		if (
			!Number.isSafeInteger(input.expectedGeneration) ||
			input.expectedGeneration < 1 ||
			input.expectedGeneration >= Number.MAX_SAFE_INTEGER
		)
			throw new Error('routing generation is invalid')
		const client = await this.pool.connect()
		try {
			await client.query('BEGIN')
			const environment = (
				await client.query<{
					runtime_id: string
					routing_generation: string
					movement_id: string | null
					desired_state: string
					observed_state: string
				}>('SELECT * FROM customer_environments WHERE id=$1 FOR UPDATE', [input.environmentId])
			).rows[0]
			const prior = (
				await client.query<Movement>('SELECT * FROM customer_movements WHERE id=$1', [id])
			).rows[0]
			if (prior) {
				if (
					prior.environment_id !== input.environmentId ||
					prior.source_runtime_id !== input.sourceRuntimeId ||
					prior.destination_runtime_id !== input.destinationRuntimeId ||
					Number(prior.source_generation) !== input.expectedGeneration ||
					prior.rollback_of !== (input.rollbackOf ?? null) ||
					prior.accept_divergence !== (input.acceptDivergence ?? false)
				)
					throw new Error('movement ID is already bound to different input')
				await client.query('COMMIT')
				return id
			}
			if (
				!environment ||
				environment.runtime_id !== input.sourceRuntimeId ||
				Number(environment.routing_generation) !== input.expectedGeneration ||
				environment.movement_id ||
				environment.desired_state !== 'ready' ||
				environment.observed_state !== 'ready'
			)
				throw new Error('customer placement is not ready or has changed')
			const runtimes = await client.query(
				'SELECT id FROM customer_runtimes WHERE id=ANY($1::text[]) AND release_sha IS NOT NULL',
				[[input.sourceRuntimeId, input.destinationRuntimeId]]
			)
			if (runtimes.rowCount !== 2)
				throw new Error('two distinct release-bound runtimes are required')
			// Claim locks the same environment row. Once held, no new provisioner can start.
			if (
				(
					await client.query(
						"SELECT id FROM customer_component_operations WHERE environment_id=$1 AND status='running' LIMIT 1",
						[input.environmentId]
					)
				).rowCount
			)
				throw new Error('customer provisioning is still running')
			if (input.rollbackOf) {
				const retained = (
					await client.query<Movement>(
						"SELECT * FROM customer_movements WHERE id=$1 AND phase IN ('activated','completed')",
						[input.rollbackOf]
					)
				).rows[0]
				if (
					!input.acceptDivergence ||
					!retained ||
					retained.environment_id !== input.environmentId ||
					retained.source_runtime_id !== input.destinationRuntimeId ||
					retained.destination_runtime_id !== input.sourceRuntimeId
				)
					throw new Error(
						'rollback requires a retained customer movement and explicit divergence acceptance'
					)
				if (retained.phase === 'activated')
					await client.query(
						"UPDATE customer_movements SET phase='superseded',updated_at=clock_timestamp() WHERE id=$1 AND phase='activated'",
						[retained.id]
					)
			} else if (input.acceptDivergence)
				throw new Error('divergence acceptance applies only to rollback')
			await client.query(
				`INSERT INTO customer_movements
				 (id,environment_id,source_runtime_id,destination_runtime_id,source_generation,destination_generation,
				 phase,mode,rollback_of,accept_divergence)
				 VALUES($1,$2,$3,$4,$5,$6,'paused',$7,$8,$9)`,
				[
					id,
					input.environmentId,
					input.sourceRuntimeId,
					input.destinationRuntimeId,
					input.expectedGeneration,
					input.expectedGeneration + 1,
					input.rollbackOf ? 'rollback' : 'move',
					input.rollbackOf ?? null,
					input.acceptDivergence ?? false
				]
			)
			await client.query(
				'UPDATE customer_environments SET movement_id=$2,updated_at=clock_timestamp() WHERE id=$1',
				[input.environmentId, id]
			)
			await client.query('COMMIT')
			return id
		} catch (error) {
			await client.query('ROLLBACK').catch(() => {})
			throw error
		} finally {
			client.release()
		}
	}

	async read(id: string, client: Pick<pg.Pool, 'query'> = this.pool): Promise<Movement> {
		const row = (
			await client.query<Movement>(
				`SELECT m.*,e.database_name FROM customer_movements m
			 JOIN customer_environments e ON e.id=m.environment_id WHERE m.id=$1`,
				[id]
			)
		).rows[0]
		if (!row) throw new Error('customer movement does not exist')
		return {
			...row,
			source_generation: Number(row.source_generation),
			destination_generation: Number(row.destination_generation)
		}
	}

	/** A dedicated connection serializes controllers; connection loss aborts the adapter. */
	async exclusive<T>(id: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const client = await this.pool.connect()
		const abort = new AbortController()
		const lost = () => abort.abort(new Error('movement controller lost its directory lock'))
		client.on('error', lost)
		client.on('end', lost)
		try {
			const claimed = (
				await client.query<{ claimed: boolean }>(
					'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS claimed',
					[`movement:${id}`]
				)
			).rows[0]?.claimed
			if (!claimed) throw new Error('another controller owns this movement')
			return await work(abort.signal)
		} finally {
			await client
				.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`movement:${id}`])
				.catch(() => {})
			client.removeListener('error', lost)
			client.removeListener('end', lost)
			client.release(abort.signal.aborted)
		}
	}

	async advance(
		id: string,
		from: MovementPhase,
		to: MovementPhase,
		evidence: Record<string, unknown>
	): Promise<void> {
		const successor: Partial<Record<MovementPhase, MovementPhase>> = {
			paused: 'fenced',
			fenced: 'copied',
			copied: 'verified',
			activated: 'completed'
		}
		if (successor[from] !== to) throw new Error('invalid movement phase transition')
		const result = await this.pool.query(
			`UPDATE customer_movements SET phase=$3,evidence=evidence || $4::jsonb,
			 last_error=NULL,updated_at=clock_timestamp() WHERE id=$1 AND phase=$2 RETURNING id`,
			[id, from, to, JSON.stringify(evidence)]
		)
		if (!result.rowCount) throw new Error('movement phase changed')
	}

	async activate(id: string): Promise<void> {
		const client = await this.pool.connect()
		try {
			await client.query('BEGIN')
			const movement = await this.read(id, client)
			// Match entitlement state and generation as well as placement. A revocation must win.
			const result = await client.query(
				`UPDATE customer_environments SET runtime_id=$3,routing_generation=$4,movement_id=NULL,
				 observed_state='ready',updated_at=clock_timestamp()
				 WHERE id=$1 AND movement_id=$2 AND runtime_id=$5 AND routing_generation=$6
				 AND desired_state='ready' AND EXISTS
				 (SELECT 1 FROM customer_movements WHERE id=$2 AND phase='verified') RETURNING id`,
				[
					movement.environment_id,
					id,
					movement.destination_runtime_id,
					movement.destination_generation,
					movement.source_runtime_id,
					movement.source_generation
				]
			)
			if (!result.rowCount)
				throw new Error('customer placement or entitlement changed; activation refused')
			const components = movement.evidence.verifiedComponents
			if (!Array.isArray(components) || components.length === 0)
				throw new Error('verified component evidence is missing')
			const required = (
				await client.query<{ component_ref: string }>(
					'SELECT component_ref FROM customer_environment_components WHERE environment_id=$1',
					[movement.environment_id]
				)
			).rows.map((row) => row.component_ref)
			if (
				new Set(components.map((component) => component.component_ref)).size !==
					components.length ||
				required.some((ref) => !components.some((component) => component.component_ref === ref))
			)
				throw new Error('verified components do not cover the customer installation')
			for (const component of components) {
				if (
					typeof component.component_ref !== 'string' ||
					!Number.isSafeInteger(component.schema_version) ||
					component.schema_version < 1 ||
					!/^[a-f0-9]{64}$/.test(component.migration_set_digest)
				)
					throw new Error('verified component evidence is invalid')
				await client.query(
					`INSERT INTO customer_environment_components
					 (environment_id,component_ref,desired_state,observed_state,target_schema_version,observed_schema_version,
					 migration_set_digest,observed_migration_set_digest,routing_generation)
					 VALUES($1,$2,'ready','ready',$3,$3,$4,$4,$5) ON CONFLICT(environment_id,component_ref)
					 DO UPDATE SET target_schema_version=$3,observed_schema_version=$3,migration_set_digest=$4,
					 observed_migration_set_digest=$4,routing_generation=$5,observed_state='ready',updated_at=clock_timestamp()`,
					[
						movement.environment_id,
						component.component_ref,
						component.schema_version,
						component.migration_set_digest,
						movement.destination_generation
					]
				)
			}
			await client.query(
				"UPDATE customer_movements SET phase='activated',updated_at=clock_timestamp() WHERE id=$1",
				[id]
			)
			await client.query('COMMIT')
		} catch (error) {
			await client.query('ROLLBACK').catch(() => {})
			throw error
		} finally {
			client.release()
		}
	}
}

export interface MovementDriver {
	/** Idempotent; must verify execution drain and persistent source fencing. */
	fence(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>>
	/** Idempotent; only a source frozen at the recorded boundary can be copied. */
	copy(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>>
	/** Restore/migrate/verify while the directory remains paused. */
	verify(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>>
	/** Recheck both physical postconditions immediately before publication. */
	beforeActivate(movement: Movement, signal: AbortSignal): Promise<void>
	observe(movement: Movement, signal: AbortSignal): Promise<Record<string, unknown>>
}

export async function resumeMovement(
	store: CustomerMovementStore,
	id: string,
	driver: MovementDriver
): Promise<Movement> {
	return store.exclusive(id, async (signal) => {
		for (;;) {
			signal.throwIfAborted()
			const movement = await store.read(id)
			switch (movement.phase) {
				case 'paused': {
					const evidence = await driver.fence(movement, signal)
					signal.throwIfAborted()
					await store.advance(id, 'paused', 'fenced', evidence)
					break
				}
				case 'fenced': {
					const evidence = await driver.copy(movement, signal)
					signal.throwIfAborted()
					await store.advance(id, 'fenced', 'copied', evidence)
					break
				}
				case 'copied': {
					const evidence = await driver.verify(movement, signal)
					signal.throwIfAborted()
					await store.advance(id, 'copied', 'verified', evidence)
					break
				}
				case 'verified':
					await driver.beforeActivate(movement, signal)
					signal.throwIfAborted()
					await store.activate(id)
					break
				case 'activated': {
					const evidence = await driver.observe(movement, signal)
					signal.throwIfAborted()
					await store.advance(id, 'activated', 'completed', evidence)
					break
				}
				case 'completed':
				case 'cancelled':
				case 'superseded':
					return movement
			}
		}
	})
}
