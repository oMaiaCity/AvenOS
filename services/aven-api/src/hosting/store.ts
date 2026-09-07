import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type {
	SiteBinding,
	SiteBindingDraft,
	SiteBindingMutation,
	SiteRuntimeStatus
} from '@avenos/aven-hosting'
import type pg from 'pg'
import { type SystemSiteInput, systemSiteSchema } from './validation.js'

interface SiteRow {
	id: string
	owner_subject_id: string | null
	system_managed: boolean
	hostname: string
	repository_full_name: string
	source_ref: string
	artifact_ref: string
	runtime_status: SiteRuntimeStatus
	active_artifact_revision: string | null
	active_source_revision: string | null
	last_error: string | null
	verified_at: Date | string | null
	last_synced_at: Date | string | null
}

export class HostingControlError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message)
	}
}

const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
const iso = (value: Date | string | null): string | null =>
	value instanceof Date ? value.toISOString() : value
const branchOf = (ref: string): string => ref.replace(/^refs\/heads\//, '')

function siteOf(row: SiteRow): SiteBinding {
	return {
		id: row.id,
		hostname: row.hostname,
		repository: row.repository_full_name,
		sourceBranch: branchOf(row.source_ref),
		deploymentBranch: branchOf(row.artifact_ref),
		status: row.runtime_status,
		activeArtifactRevision: row.active_artifact_revision,
		activeSourceRevision: row.active_source_revision,
		lastError: row.last_error,
		verifiedAt: iso(row.verified_at),
		lastSyncedAt: iso(row.last_synced_at),
		systemManaged: row.system_managed
	}
}

export class HostingStore {
	constructor(
		private readonly pool: pg.Pool,
		private readonly publicAddresses: { ipv4: string | null; ipv6: string[] }
	) {}

	async list(subjectId: string, admin: boolean): Promise<SiteBinding[]> {
		const result = await this.pool.query<SiteRow>(
			`SELECT id,owner_subject_id,system_managed,hostname,repository_full_name,source_ref,
			        artifact_ref,runtime_status,active_artifact_revision,active_source_revision,
			        last_error,verified_at,last_synced_at
			 FROM site_bindings
			 WHERE owner_subject_id=$1 OR ($2 AND system_managed)
			 ORDER BY system_managed DESC,hostname`,
			[subjectId, admin]
		)
		return result.rows.map(siteOf)
	}

	async create(subjectId: string, input: SiteBindingDraft): Promise<SiteBindingMutation> {
		return this.persist(subjectId, null, input)
	}

	async update(
		subjectId: string,
		id: string,
		input: SiteBindingDraft
	): Promise<SiteBindingMutation> {
		return this.persist(subjectId, id, input)
	}

	private async persist(
		subjectId: string,
		id: string | null,
		input: SiteBindingDraft
	): Promise<SiteBindingMutation> {
		const verificationToken = randomBytes(32).toString('base64url')
		const now = new Date()
		try {
			let row: SiteRow | undefined
			if (id) {
				const result = await this.pool.query<SiteRow>(
					`UPDATE site_bindings SET hostname=$3,repository_full_name=$4,source_ref=$5,
					 artifact_ref=$6,verification_token_hash=$7,desired_status='active',
					 runtime_status='awaiting_dns',active_artifact_revision=NULL,
					 active_source_revision=NULL,last_error=NULL,verified_at=NULL,
					 last_dns_check_at=NULL,last_synced_at=NULL,updated_at=$8
					 WHERE id=$1 AND owner_subject_id=$2 AND NOT system_managed
					 RETURNING *`,
					[
						id,
						subjectId,
						input.hostname,
						input.repository,
						`refs/heads/${input.sourceBranch}`,
						`refs/heads/${input.deploymentBranch}`,
						tokenHash(verificationToken),
						now
					]
				)
				row = result.rows[0]
				if (!row) throw new HostingControlError(404, 'SITE_NOT_FOUND', 'No site has that id.')
			} else {
				const result = await this.pool.query<SiteRow>(
					`INSERT INTO site_bindings
					 (id,owner_subject_id,system_managed,hostname,repository_full_name,source_ref,
					  artifact_ref,artifact_path,verification_mode,verification_token_hash,
					  desired_status,runtime_status,created_at,updated_at)
					 VALUES ($1,$2,false,$3,$4,$5,$6,'dist','txt',$7,'active','awaiting_dns',$8,$8)
					 RETURNING *`,
					[
						randomUUID(),
						subjectId,
						input.hostname,
						input.repository,
						`refs/heads/${input.sourceBranch}`,
						`refs/heads/${input.deploymentBranch}`,
						tokenHash(verificationToken),
						now
					]
				)
				row = result.rows[0]
			}
			if (!row) throw new Error('site write returned no row')
			return {
				site: siteOf(row),
				dns: {
					txtName: `_aven-site.${input.hostname}`,
					txtValue: verificationToken,
					hostname: input.hostname,
					...this.publicAddresses
				}
			}
		} catch (error) {
			if (error instanceof HostingControlError) throw error
			if ((error as { code?: string }).code === '23505')
				throw new HostingControlError(
					409,
					'SITE_BINDING_CONFLICT',
					'That hostname or deployment branch is already assigned.'
				)
			throw error
		}
	}

	async remove(subjectId: string, id: string): Promise<void> {
		const result = await this.pool.query(
			'DELETE FROM site_bindings WHERE id=$1 AND owner_subject_id=$2 AND NOT system_managed',
			[id, subjectId]
		)
		if (!result.rowCount)
			throw new HostingControlError(404, 'SITE_NOT_FOUND', 'No site has that id.')
	}

	async directory(): Promise<{ bindings: Record<string, unknown>[] }> {
		const result = await this.pool.query<
			SiteRow & {
				artifact_path: string
				verification_mode: 'txt' | 'operator'
				verification_token_hash: string
			}
		>(
			`SELECT id,owner_subject_id,system_managed,hostname,repository_full_name,source_ref,
			        artifact_ref,artifact_path,verification_mode,verification_token_hash,
			        runtime_status,active_artifact_revision,active_source_revision,last_error,
			        verified_at,last_synced_at
			 FROM site_bindings WHERE desired_status='active' ORDER BY hostname`
		)
		return {
			bindings: result.rows.map((row) => ({
				id: row.id,
				hostname: row.hostname,
				repository_full_name: row.repository_full_name,
				clone_url: `https://github.com/${row.repository_full_name}.git`,
				source_ref: row.source_ref,
				artifact_ref: row.artifact_ref,
				artifact_path: row.artifact_path,
				verification_mode: row.verification_mode,
				verification_token_hash: row.verification_token_hash,
				verified_at: iso(row.verified_at),
				owner_is_admin: row.system_managed
			}))
		}
	}

	async report(input: {
		id: string
		status: SiteRuntimeStatus
		error?: string | null
		artifactRevision?: string | null
		sourceRevision?: string | null
		dnsVerified?: boolean
	}): Promise<void> {
		const now = new Date()
		await this.pool.query(
			`UPDATE site_bindings SET runtime_status=$2,last_error=$3,
			 active_artifact_revision=COALESCE($4,active_artifact_revision),
			 active_source_revision=COALESCE($5,active_source_revision),last_dns_check_at=$6,
			 verified_at=CASE WHEN $7 THEN $6 ELSE verified_at END,
			 last_synced_at=CASE WHEN $2='active' THEN $6 ELSE last_synced_at END,updated_at=$6
			 WHERE id=$1`,
			[
				input.id,
				input.status,
				input.error?.slice(0, 1000) ?? null,
				input.artifactRevision ?? null,
				input.sourceRevision ?? null,
				now,
				input.dnsVerified ?? false
			]
		)
	}

	async seedSystemSites(raw: string): Promise<void> {
		let parsed: unknown
		try {
			parsed = JSON.parse(raw)
		} catch {
			throw new Error('SYSTEM_SITES_JSON must be valid JSON')
		}
		const sites = systemSiteSchema.array().parse(parsed) as SystemSiteInput[]
		for (const site of sites) {
			const now = new Date()
			await this.pool.query(
				`INSERT INTO site_bindings
				 (id,owner_subject_id,system_managed,hostname,repository_full_name,source_ref,
				  artifact_ref,artifact_path,verification_mode,verification_token_hash,
				  desired_status,runtime_status,created_at,updated_at)
				 VALUES ($1,NULL,true,$2,$3,$4,$5,'dist','operator',$6,'active','awaiting_dns',$7,$7)
				 ON CONFLICT (hostname) DO UPDATE SET system_managed=true,owner_subject_id=NULL,
				 repository_full_name=EXCLUDED.repository_full_name,source_ref=EXCLUDED.source_ref,
				 artifact_ref=EXCLUDED.artifact_ref,artifact_path='dist',verification_mode='operator',
				 desired_status='active',runtime_status='awaiting_dns',last_error=NULL,updated_at=EXCLUDED.updated_at`,
				[
					randomUUID(),
					site.hostname,
					site.repository,
					`refs/heads/${site.sourceBranch}`,
					`refs/heads/${site.deploymentBranch}`,
					tokenHash(randomBytes(32).toString('base64url')),
					now
				]
			)
		}
	}
}
