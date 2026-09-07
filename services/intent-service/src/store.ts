import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import pg from 'pg'

pg.types.setTypeParser(20, Number)

export type IntentState = 'working' | 'waiting' | 'done' | 'error' | 'archive' | 'merged'
export type ActiveIntentState = 'working' | 'waiting' | 'done' | 'error'
export type ContributorKind = 'human' | 'agent'

export interface CreateIntent {
	id: string
	title: string
	intentType: string
	sourceLabel: string
	deadline: string | null
	routingSummary?: string
}

export interface UpdateIntent {
	expectedVersion: number
	title?: string
	intentType?: string
	sourceLabel?: string
	deadline?: string
	clearDeadline: boolean
	routingSummary?: string
	state?: ActiveIntentState
}

export interface ContributionInput {
	id: string
	contributorKind: ContributorKind
	kind: string
	text: string | null
	payload: Record<string, unknown>
}

export interface VersionCommand {
	id: string
	expectedVersion: number
}

export interface MergeCommand extends VersionCommand {
	commandId: string
	sources: Array<{ id: string; expectedVersion: number }>
}

export interface IntentSummary {
	id: string
	title: string
	intentType: string
	sourceLabel: string
	deadline: string | null
	routingSummary: string
	state: IntentState
	version: number
	sourceArtifactId: null
	createdAt: string
	updatedAt: string
}

export interface Contribution {
	id: string
	sequence: number
	contributorKind: 'human' | 'agent' | 'skill' | 'system'
	kind: string
	text: string | null
	payload: Record<string, unknown>
	createdAt: string
}

export interface IntentDetail extends IntentSummary {
	contributions: Contribution[]
	artifacts: []
	fileSkill: null
}

export class IntentNotFoundError extends Error {}
export class IntentConflictError extends Error {}

type Queryable = pg.Pool | pg.PoolClient

const intentColumns =
	'id,title,intent_type,source_label,deadline,routing_summary,state,version,created_at,updated_at'

function timestamp(value: unknown): string {
	return value instanceof Date ? value.toISOString() : String(value)
}

function summary(row: Record<string, unknown>): IntentSummary {
	return {
		id: String(row.id),
		title: String(row.title),
		intentType: String(row.intent_type),
		sourceLabel: String(row.source_label),
		deadline: row.deadline === null ? null : String(row.deadline),
		routingSummary: String(row.routing_summary),
		state: String(row.state) as IntentState,
		version: Number(row.version),
		sourceArtifactId: null,
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at)
	}
}

function contribution(row: Record<string, unknown>): Contribution {
	return {
		id: String(row.id),
		sequence: Number(row.sequence),
		contributorKind: String(row.contributor_kind) as Contribution['contributorKind'],
		kind: String(row.kind),
		text: row.text === null ? null : String(row.text),
		payload: row.payload as Record<string, unknown>,
		createdAt: timestamp(row.created_at)
	}
}

async function transaction<T>(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<T>) {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const value = await run(client)
		await client.query('COMMIT')
		return value
	} catch (error) {
		await client.query('ROLLBACK').catch(() => {})
		throw error
	} finally {
		client.release()
	}
}

async function insertContribution(
	client: Queryable,
	intentId: string,
	input:
		| ContributionInput
		| (Omit<ContributionInput, 'contributorKind'> & { contributorKind: 'system' }),
	idempotencyKey: string
): Promise<Contribution> {
	const result = await client.query(
		`INSERT INTO contributions
		 (id,intent_id,sequence,contributor_kind,kind,text,payload,idempotency_key)
		 VALUES($1,$2,(SELECT COALESCE(max(sequence),0)+1 FROM contributions WHERE intent_id=$2),$3,$4,$5,$6,$7)
		 RETURNING id,sequence,contributor_kind,kind,text,payload,created_at`,
		[
			input.id,
			intentId,
			input.contributorKind,
			input.kind,
			input.text,
			input.payload,
			idempotencyKey
		]
	)
	return contribution(result.rows[0])
}

export class IntentStore {
	constructor(readonly pool: pg.Pool) {}

	async ready(): Promise<void> {
		const result = await this.pool.query(
			`SELECT 1 FROM aven_platform.component_installations
			 WHERE component_ref='ceo.aven:component:data:intents@1'
			 AND schema_version>=1`
		)
		if (result.rowCount !== 1) throw new Error('Intent Service migration is not applied.')
	}

	async list(subjectId: string): Promise<IntentSummary[]> {
		const result = await this.pool.query(
			`SELECT ${intentColumns} FROM intents
			 WHERE owner_subject_id=$1 AND state NOT IN ('merged','deleted')
			 ORDER BY updated_at DESC,id`,
			[subjectId]
		)
		return result.rows.map(summary)
	}

	async detail(subjectId: string, intentId: string): Promise<IntentDetail> {
		const intent = await this.pool.query(
			`SELECT ${intentColumns} FROM intents
			 WHERE owner_subject_id=$1 AND id=$2 AND state<>'deleted'`,
			[subjectId, intentId]
		)
		if (!intent.rows[0]) throw new IntentNotFoundError('Intent not found.')
		const contributions = await this.pool.query(
			`SELECT id,sequence,contributor_kind,kind,text,payload,created_at
			 FROM contributions WHERE intent_id=$1 ORDER BY sequence`,
			[intentId]
		)
		return {
			...summary(intent.rows[0]),
			contributions: contributions.rows.map(contribution),
			artifacts: [],
			fileSkill: null
		}
	}

	async create(subjectId: string, input: CreateIntent): Promise<IntentDetail> {
		const routingSummary = input.routingSummary?.trim() || `Intent: ${input.title.trim()}`
		const inserted = await transaction(this.pool, async (client) => {
			const result = await client.query(
				`INSERT INTO intents
				 (id,owner_subject_id,trigger_kind,title,intent_type,source_label,deadline,routing_summary)
				 VALUES($1,$2,'human',$3,$4,$5,$6,$7)
				 ON CONFLICT(id) DO NOTHING`,
				[
					input.id,
					subjectId,
					input.title.trim(),
					input.intentType.trim(),
					input.sourceLabel.trim(),
					input.deadline?.trim() || null,
					routingSummary
				]
			)
			if (result.rowCount === 0) return false
			await insertContribution(
				client,
				input.id,
				{
					id: randomUUID(),
					contributorKind: 'system',
					kind: 'intent-created',
					text: null,
					payload: { triggerKind: 'human' }
				},
				`create:${input.id}`
			)
			return true
		})
		if (!inserted) {
			const existing = await this.detail(subjectId, input.id).catch(() => null)
			if (
				!existing ||
				existing.title !== input.title.trim() ||
				existing.intentType !== input.intentType.trim() ||
				existing.sourceLabel !== input.sourceLabel.trim() ||
				existing.deadline !== (input.deadline?.trim() || null) ||
				existing.routingSummary !== routingSummary
			)
				throw new IntentConflictError('Intent ID conflicts with another request.')
			return existing
		}
		return this.detail(subjectId, input.id)
	}

	async append(
		subjectId: string,
		intentId: string,
		input: ContributionInput
	): Promise<Contribution> {
		return transaction(this.pool, async (client) => {
			const owned = await client.query(
				`SELECT true FROM intents
				 WHERE owner_subject_id=$1 AND id=$2 AND state NOT IN ('merged','deleted') FOR UPDATE`,
				[subjectId, intentId]
			)
			if (!owned.rows[0]) throw new IntentNotFoundError('Intent not found.')
			const existing = await client.query(
				`SELECT id,intent_id,sequence,contributor_kind,kind,text,payload,created_at
				 FROM contributions WHERE id=$1 OR (intent_id=$2 AND idempotency_key=$3)
				 LIMIT 1 FOR UPDATE`,
				[input.id, intentId, input.id]
			)
			if (existing.rows[0]) {
				const row = existing.rows[0]
				if (
					String(row.intent_id) !== intentId ||
					String(row.contributor_kind) !== input.contributorKind ||
					String(row.kind) !== input.kind ||
					(row.text === null ? null : String(row.text)) !== input.text ||
					!isDeepStrictEqual(row.payload, input.payload)
				)
					throw new IntentConflictError('Contribution ID conflicts with another request.')
				return contribution(row)
			}
			const created = await insertContribution(client, intentId, input, input.id)
			await client.query(
				'UPDATE intents SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',
				[intentId]
			)
			return created
		})
	}

	async update(subjectId: string, intentId: string, input: UpdateIntent): Promise<IntentDetail> {
		const result = await this.pool.query(
			`UPDATE intents SET
			 title=COALESCE($4,title),intent_type=COALESCE($5,intent_type),
			 source_label=COALESCE($6,source_label),
			 deadline=CASE WHEN $7 THEN NULL WHEN $8::text IS NOT NULL THEN $8 ELSE deadline END,
			 routing_summary=COALESCE($9,routing_summary),state=COALESCE($10,state),
			 version=version+1,updated_at=clock_timestamp()
			 WHERE owner_subject_id=$1 AND id=$2 AND version=$3 AND state NOT IN ('merged','deleted')`,
			[
				subjectId,
				intentId,
				input.expectedVersion,
				input.title?.trim() || null,
				input.intentType?.trim() || null,
				input.sourceLabel?.trim() || null,
				input.clearDeadline,
				input.deadline?.trim() || null,
				input.routingSummary?.trim() || null,
				input.state ?? null
			]
		)
		if (result.rowCount !== 1) throw new IntentConflictError('Intent version or state changed.')
		return this.detail(subjectId, intentId)
	}

	async archiveOrRestore(
		subjectId: string,
		intentId: string,
		input: VersionCommand,
		restore: boolean
	): Promise<IntentDetail> {
		if (input.id !== intentId) throw new IntentConflictError('Intent ID does not match the path.')
		const query = restore
			? `UPDATE intents SET state=COALESCE(state_before_archive,'working'),state_before_archive=NULL,
			   version=version+1,updated_at=clock_timestamp()
			   WHERE owner_subject_id=$1 AND id=$2 AND version=$3 AND state='archive'`
			: `UPDATE intents SET state_before_archive=state,state='archive',
			   version=version+1,updated_at=clock_timestamp()
			   WHERE owner_subject_id=$1 AND id=$2 AND version=$3
			   AND state IN ('working','waiting','done','error')`
		const result = await this.pool.query(query, [subjectId, intentId, input.expectedVersion])
		if (result.rowCount !== 1) throw new IntentConflictError('Intent version or state changed.')
		return this.detail(subjectId, intentId)
	}

	async tombstone(subjectId: string, intentId: string, input: VersionCommand): Promise<void> {
		if (input.id !== intentId) throw new IntentConflictError('Intent ID does not match the path.')
		const result = await this.pool.query(
			`UPDATE intents SET state='deleted',version=version+1,updated_at=clock_timestamp()
			 WHERE owner_subject_id=$1 AND id=$2 AND version=$3 AND state NOT IN ('merged','deleted')`,
			[subjectId, intentId, input.expectedVersion]
		)
		if (result.rowCount !== 1) throw new IntentConflictError('Intent version or state changed.')
	}

	async merge(subjectId: string, targetId: string, input: MergeCommand): Promise<IntentDetail> {
		if (input.id !== targetId || input.sources.some((source) => source.id === targetId))
			throw new IntentConflictError('Intent merge is invalid.')
		const sourceVersions = new Map(
			input.sources.map((source) => [source.id, source.expectedVersion])
		)
		if (sourceVersions.size !== input.sources.length)
			throw new IntentConflictError('Intent merge contains duplicate sources.')
		const sources = [...sourceVersions.keys()].sort()
		return transaction(this.pool, async (client) => {
			const prior = await client.query(
				`SELECT target_intent_id,target_version,source_versions
				 FROM merge_commands WHERE command_id=$1 FOR UPDATE`,
				[input.commandId]
			)
			if (prior.rows[0]) {
				const row = prior.rows[0]
				const expectedSources = Object.fromEntries(
					[...sourceVersions.entries()].sort(([left], [right]) => left.localeCompare(right))
				)
				if (
					String(row.target_intent_id) !== targetId ||
					Number(row.target_version) !== input.expectedVersion ||
					!isDeepStrictEqual(row.source_versions, expectedSources)
				)
					throw new IntentConflictError('Merge command ID conflicts with another request.')
				return this.detailWith(client, subjectId, targetId)
			}
			const ids = [targetId, ...sources].sort()
			const locked = await client.query(
				`SELECT id,version,state FROM intents
				 WHERE owner_subject_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE`,
				[subjectId, ids]
			)
			if (locked.rows.length !== ids.length)
				throw new IntentConflictError('One or more intents do not exist.')
			const target = locked.rows.find((row) => String(row.id) === targetId)
			if (
				!target ||
				Number(target.version) !== input.expectedVersion ||
				['merged', 'deleted'].includes(String(target.state)) ||
				locked.rows.some(
					(row) =>
						String(row.id) !== targetId &&
						(Number(row.version) !== sourceVersions.get(String(row.id)) ||
							['merged', 'deleted'].includes(String(row.state)))
				)
			)
				throw new IntentConflictError('Intent version or state changed.')
			await client.query(
				`INSERT INTO merge_commands(command_id,target_intent_id,target_version,source_versions)
				 VALUES($1,$2,$3,$4)`,
				[
					input.commandId,
					targetId,
					input.expectedVersion,
					Object.fromEntries(
						[...sourceVersions.entries()].sort(([left], [right]) => left.localeCompare(right))
					)
				]
			)
			for (const sourceId of sources) {
				await client.query(
					`INSERT INTO merge_relations(target_intent_id,source_intent_id,command_id)
					 VALUES($1,$2,$3)`,
					[targetId, sourceId, input.commandId]
				)
				await client.query(
					`UPDATE intents SET state='merged',merged_into_id=$1,version=version+1,
					 updated_at=clock_timestamp() WHERE id=$2`,
					[targetId, sourceId]
				)
			}
			await insertContribution(
				client,
				targetId,
				{
					id: randomUUID(),
					contributorKind: 'system',
					kind: 'intents-merged',
					text: null,
					payload: { sourceIntentIds: sources, commandId: input.commandId }
				},
				input.commandId
			)
			await client.query(
				'UPDATE intents SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',
				[targetId]
			)
			return this.detailWith(client, subjectId, targetId)
		})
	}

	private async detailWith(
		client: Queryable,
		subjectId: string,
		intentId: string
	): Promise<IntentDetail> {
		const intent = await client.query(
			`SELECT ${intentColumns} FROM intents
			 WHERE owner_subject_id=$1 AND id=$2 AND state<>'deleted'`,
			[subjectId, intentId]
		)
		if (!intent.rows[0]) throw new IntentNotFoundError('Intent not found.')
		const contributions = await client.query(
			`SELECT id,sequence,contributor_kind,kind,text,payload,created_at
			 FROM contributions WHERE intent_id=$1 ORDER BY sequence`,
			[intentId]
		)
		return {
			...summary(intent.rows[0]),
			contributions: contributions.rows.map(contribution),
			artifacts: [],
			fileSkill: null
		}
	}
}
