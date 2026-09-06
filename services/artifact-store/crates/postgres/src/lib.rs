//! `PostgreSQL` persistence adapter for the artifact-store kernel.

use std::collections::BTreeMap;

use aven_artifact_store_contract::{
    ArtifactEnvelope, ArtifactEvidence, ArtifactQueryPage, ArtifactResult, BlobAuthority,
    CommittedRunMetadata, DeclaredBlob, FeedArtifact, OutputBinding, ProducerInputs,
    PublicationBody, PublicationDetails, PublicationFeedItem, PublicationFeedPage,
    PublicationResult, RegisteredTypeDefinition, RunInput, StablePublisher, StoreContext,
    SupportingEvidence, TypeKey, UploadClaimResult, UploadDeclaration, COMMAND_VERSION,
    JSON_PROFILE_ID, SCHEMA_PROFILE_ID,
};
use aven_artifact_store_core::{ExistingArtifact, PreparedPublication};
use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{PgPool, Postgres, Row, Transaction};
use thiserror::Error;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("database operation failed: {0}")]
    Database(#[from] sqlx::Error),
    #[error("database migration failed: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("stored JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("store is fenced for reconciliation")]
    Reconciling,
    #[error("expected store epoch {expected}, current epoch is {actual}")]
    EpochChanged { expected: Uuid, actual: Uuid },
    #[error("publication identity is already bound to another publisher or intent")]
    PublicationConflict,
    #[error("publication identity was excluded during divergent recovery")]
    PublicationDataLost,
    #[error("upload claim conflicts with its prior declaration")]
    UploadConflict,
    #[error("upload claim is expired, consumed, or unavailable")]
    UploadExpired,
    #[error("uploaded bytes differ from their declaration")]
    UploadDigestMismatch,
    #[error("the scope staging quota is exhausted")]
    StagingQuotaExceeded,
    #[error("the scope storage quota would be exceeded")]
    StorageQuotaExceeded,
    #[error("an input, reference, or blob source is unavailable")]
    InputUnavailable,
    #[error("immutable store invariant failed: {0}")]
    Integrity(String),
}

#[derive(Clone)]
pub struct PostgresStore {
    pool: PgPool,
}

#[derive(Clone, Copy, Debug)]
pub struct UploadAdmission {
    pub max_live_claims_per_scope: i64,
    pub max_staged_bytes_per_scope: i64,
    pub max_logical_bytes_per_scope: i64,
}

impl PostgresStore {
    /// Connect a bounded pool to one artifact-store database.
    ///
    /// # Errors
    ///
    /// Returns a database error when the pool cannot connect.
    pub async fn connect(database_url: &str, max_connections: u32) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .after_connect(|connection, _metadata| {
                Box::pin(async move {
                    sqlx::query("SET statement_timeout = '60s'")
                        .execute(&mut *connection)
                        .await?;
                    sqlx::query("SET lock_timeout = '10s'")
                        .execute(&mut *connection)
                        .await?;
                    Ok(())
                })
            })
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    #[must_use]
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Apply embedded immutable migrations and initialize store state.
    ///
    /// # Errors
    ///
    /// Returns a migration or database error when setup cannot complete atomically.
    pub async fn migrate(&self) -> Result<(), StoreError> {
        MIGRATOR.run(&self.pool).await?;
        sqlx::query(
            "INSERT INTO artifact_store.store_state(singleton, store_epoch, write_mode) \
             VALUES (true, $1, 'normal') ON CONFLICT (singleton) DO NOTHING",
        )
        .bind(Uuid::new_v4())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Register exact source-controlled type definitions without permitting mutation.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid serialization, database failure, or digest drift.
    pub async fn register_types<'a>(
        &self,
        definitions: impl IntoIterator<Item = &'a RegisteredTypeDefinition>,
    ) -> Result<(), StoreError> {
        for registered in definitions {
            let definition = &registered.definition;
            let payload_schema = serde_json::to_value(&definition.payload_schema)?;
            let reference_rules = serde_json::to_value(&definition.reference_rules)?;
            let blob_policy = serde_json::to_value(definition.blob_policy)?
                .as_str()
                .ok_or_else(|| StoreError::Integrity("invalid blob policy encoding".into()))?
                .to_owned();
            let version = i32::try_from(definition.version)
                .map_err(|_| StoreError::Integrity("type version exceeds SQL integer".into()))?;
            let result = sqlx::query(
                "INSERT INTO artifact_store.artifact_type_versions \
                 (type_key, version, schema_profile_id, payload_schema, blob_policy, reference_rules, type_definition_sha256, created_at) \
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (type_key, version) DO NOTHING",
            )
            .bind(definition.type_key.as_str())
            .bind(version)
            .bind(&definition.schema_profile_id)
            .bind(payload_schema)
            .bind(blob_policy)
            .bind(reference_rules)
            .bind(&registered.type_definition_sha256)
            .bind(registered.created_at)
            .execute(&self.pool)
            .await?;
            if result.rows_affected() == 0 {
                let digest: String = sqlx::query_scalar(
                    "SELECT type_definition_sha256::text FROM artifact_store.artifact_type_versions WHERE type_key=$1 AND version=$2",
                )
                .bind(definition.type_key.as_str())
                .bind(version)
                .fetch_one(&self.pool)
                .await?;
                if digest != registered.type_definition_sha256 {
                    return Err(StoreError::Integrity(format!(
                        "source type {}@{} differs from registered digest",
                        definition.type_key, definition.version
                    )));
                }
            }
        }
        Ok(())
    }

    /// Provision a scope sequence head for an already-authorized scope.
    ///
    /// # Errors
    ///
    /// Returns a database error when provisioning fails.
    pub async fn ensure_scope(&self, scope_id: Uuid) -> Result<(), StoreError> {
        sqlx::query(
            "INSERT INTO artifact_store.artifact_scopes(id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
        )
        .bind(scope_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Check whether provisioning installed an exact authorized scope.
    ///
    /// # Errors
    ///
    /// Returns a database error when the scope catalog cannot be read.
    pub async fn has_scope(&self, scope_id: Uuid) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM artifact_store.artifact_scopes WHERE id=$1)",
        )
        .bind(scope_id)
        .fetch_one(&self.pool)
        .await?)
    }

    /// Grant the preview runtime role only the table privileges used by this adapter.
    ///
    /// Role creation and database `CONNECT` remain cluster-provisioning concerns. This
    /// method is deliberately called by the provisioning process, never by HTTP runtime
    /// requests.
    ///
    /// # Errors
    ///
    /// Returns an integrity error for an unsafe role name or a database error when a
    /// grant cannot be applied.
    pub async fn grant_runtime_role(&self, role: &str) -> Result<(), StoreError> {
        if !valid_role_name(role) {
            return Err(StoreError::Integrity(
                "artifact runtime role is not a safe PostgreSQL identifier".into(),
            ));
        }
        let role = format!("\"{role}\"");
        for statement in [
            format!("GRANT USAGE ON SCHEMA artifact_store TO {role}"),
            format!("GRANT SELECT ON ALL TABLES IN SCHEMA artifact_store TO {role}"),
            format!(
                "GRANT INSERT ON artifact_store.artifact_scopes, artifact_store.artifact_blobs, artifact_store.upload_claims, artifact_store.publications, artifact_store.production_runs, artifact_store.artifact_records, artifact_store.artifact_contents, artifact_store.artifact_references, artifact_store.artifact_run_inputs, artifact_store.artifact_evidence TO {role}"
            ),
            format!(
                "GRANT UPDATE (next_sequence) ON artifact_store.artifact_scopes TO {role}"
            ),
            format!(
                "GRANT UPDATE (consumed_publication_id) ON artifact_store.upload_claims TO {role}"
            ),
            format!(
                "GRANT EXECUTE ON FUNCTION artifact_store.cleanup_expired_uploads() TO {role}"
            ),
        ] {
            sqlx::query(&statement).execute(&self.pool).await?;
        }
        Ok(())
    }

    /// Read the current epoch, write mode, and frozen protocol profiles.
    ///
    /// # Errors
    ///
    /// Returns a database error when store state is unavailable.
    pub async fn context(&self) -> Result<StoreContext, StoreError> {
        let row = sqlx::query(
            "SELECT store_epoch, write_mode FROM artifact_store.store_state WHERE singleton=true",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(StoreContext {
            command_version: COMMAND_VERSION,
            json_profile_id: JSON_PROFILE_ID.to_owned(),
            schema_profile_id: SCHEMA_PROFILE_ID.to_owned(),
            store_epoch: row.get("store_epoch"),
            write_mode: row.get("write_mode"),
            features: vec![
                "roots".into(),
                "runs".into(),
                "evidence".into(),
                "publication-feed".into(),
            ],
        })
    }

    /// Verify exact bytes and create or replay a temporary upload claim.
    ///
    /// # Errors
    ///
    /// Returns an error for byte mismatch, identity conflict, expiry, fencing, an
    /// integrity violation, or a database failure.
    #[allow(clippy::too_many_arguments)]
    pub async fn stage_upload(
        &self,
        now: OffsetDateTime,
        publisher: &StablePublisher,
        scope_id: Uuid,
        claim_id: Uuid,
        declaration: &UploadDeclaration,
        bytes: &[u8],
        lifetime: Duration,
        admission: UploadAdmission,
    ) -> Result<UploadClaimResult, StoreError> {
        if u64::try_from(bytes.len()).ok() != Some(declaration.length)
            || aven_artifact_store_contract::sha256_hex(bytes) != declaration.sha256
        {
            return Err(StoreError::UploadDigestMismatch);
        }
        let mut transaction = self.pool.begin().await?;
        assert_store_normal(&mut transaction, None).await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(claim_id.to_string())
            .execute(&mut *transaction)
            .await?;
        sqlx::query("SELECT * FROM artifact_store.cleanup_expired_uploads()")
            .execute(&mut *transaction)
            .await?;
        sqlx::query("SELECT id FROM artifact_store.artifact_scopes WHERE id=$1 FOR UPDATE")
            .bind(scope_id)
            .fetch_one(&mut *transaction)
            .await?;

        if let Some(result) = replay_upload_claim(
            &mut transaction,
            now,
            publisher,
            scope_id,
            claim_id,
            declaration,
        )
        .await?
        {
            transaction.commit().await?;
            return Ok(result);
        }

        admit_staged_upload(
            &mut transaction,
            scope_id,
            now,
            declaration.length,
            admission,
        )
        .await?;

        sqlx::query(
            "INSERT INTO artifact_store.artifact_blobs(sha256, length, bytes) VALUES ($1,$2,$3) ON CONFLICT (sha256) DO NOTHING",
        )
        .bind(&declaration.sha256)
        .bind(to_i64(declaration.length, "blob length")?)
        .bind(bytes)
        .execute(&mut *transaction)
        .await?;
        let stored =
            sqlx::query("SELECT length, bytes FROM artifact_store.artifact_blobs WHERE sha256=$1")
                .bind(&declaration.sha256)
                .fetch_one(&mut *transaction)
                .await?;
        if stored.get::<i64, _>("length") != to_i64(declaration.length, "blob length")?
            || stored.get::<Vec<u8>, _>("bytes") != bytes
        {
            return Err(StoreError::Integrity(
                "deduplicated blob bytes do not match their digest binding".into(),
            ));
        }
        let expires_at = now + lifetime;
        sqlx::query(
            "INSERT INTO artifact_store.upload_claims \
             (claim_id, scope_id, publisher_issuer, publisher_subject, blob_sha256, blob_length, declared_media_type, expires_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        )
        .bind(claim_id)
        .bind(scope_id)
        .bind(&publisher.issuer)
        .bind(&publisher.subject)
        .bind(&declaration.sha256)
        .bind(to_i64(declaration.length, "blob length")?)
        .bind(&declaration.declared_media_type)
        .bind(expires_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(UploadClaimResult {
            claim_id,
            scope_id,
            sha256: declaration.sha256.clone(),
            length: declaration.length,
            declared_media_type: declaration.declared_media_type.clone(),
            expires_at,
            replayed: false,
        })
    }

    /// Resolve an authorized set of pre-existing same-scope artifact summaries.
    ///
    /// # Errors
    ///
    /// Returns an error when stored identifiers are invalid or the database fails.
    pub async fn existing_artifacts(
        &self,
        scope_id: Uuid,
        ids: impl IntoIterator<Item = Uuid>,
    ) -> Result<BTreeMap<Uuid, ExistingArtifact>, StoreError> {
        let mut result = BTreeMap::new();
        for id in ids {
            if let Some(row) = sqlx::query(
                "SELECT artifact_id, scope_id, type_key, type_version, artifact_sha256::text, blob_sha256::text, blob_length \
                 FROM artifact_store.artifact_contents WHERE scope_id=$1 AND artifact_id=$2",
            )
            .bind(scope_id)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            {
                result.insert(id, existing_from_row(&row)?);
            }
        }
        Ok(result)
    }

    /// Atomically insert or permanently replay one prepared publication.
    ///
    /// # Errors
    ///
    /// Returns an error for fencing, epoch drift, identity conflict, unavailable
    /// authority, relational integrity failure, or a database failure.
    pub async fn publish(
        &self,
        now: OffsetDateTime,
        expected_epoch: Uuid,
        prepared: &PreparedPublication,
        admission: UploadAdmission,
    ) -> Result<PublicationResult, StoreError> {
        let intent = &prepared.submission.intent;
        let mut transaction = self.pool.begin().await?;
        let epoch = assert_store_normal(&mut transaction, Some(expected_epoch)).await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("{}:{}", intent.scope_id, intent.publication_id))
            .execute(&mut *transaction)
            .await?;

        if let Some(row) = sqlx::query(
            "SELECT publisher_issuer, publisher_subject, publication_request_sha256::text, result_mapping \
             FROM artifact_store.publications WHERE scope_id=$1 AND publication_id=$2",
        )
        .bind(intent.scope_id)
        .bind(intent.publication_id)
        .fetch_optional(&mut *transaction)
        .await?
        {
            if row.get::<String, _>("publisher_issuer") != prepared.context.publisher.issuer
                || row.get::<String, _>("publisher_subject") != prepared.context.publisher.subject
                || row.get::<String, _>("publication_request_sha256") != prepared.publication_request_sha256
            {
                return Err(StoreError::PublicationConflict);
            }
            let mut result: PublicationResult = serde_json::from_value(row.get("result_mapping"))?;
            result.replayed = true;
            transaction.commit().await?;
            return Ok(result);
        }
        admit_publication(&mut transaction, intent.scope_id, prepared, admission).await?;
        let excluded: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM artifact_store.publication_id_exclusions WHERE scope_id=$1 AND publication_id=$2)",
        )
        .bind(intent.scope_id)
        .bind(intent.publication_id)
        .fetch_one(&mut *transaction)
        .await?;
        if excluded {
            return Err(StoreError::PublicationDataLost);
        }

        validate_blob_authorities(&mut transaction, now, prepared).await?;
        let sequence: i64 = sqlx::query_scalar(
            "UPDATE artifact_store.artifact_scopes SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence",
        )
        .bind(intent.scope_id)
        .fetch_one(&mut *transaction)
        .await?;
        let artifacts = prepared
            .artifacts
            .iter()
            .map(|artifact| ArtifactResult {
                local_key: artifact.local_key.clone(),
                artifact_id: artifact.id,
                artifact_sha256: artifact.artifact_sha256.clone(),
                type_definition_sha256: artifact.type_definition_sha256.clone(),
            })
            .collect();
        let result = PublicationResult {
            scope_id: intent.scope_id,
            publication_id: intent.publication_id,
            publication_request_sha256: prepared.publication_request_sha256.clone(),
            committed_store_epoch: epoch,
            scope_sequence: sequence,
            committed_at: now,
            run_id: prepared.run_id,
            artifacts,
            replayed: false,
        };
        insert_publication(&mut transaction, prepared, &result).await?;
        insert_artifacts(&mut transaction, prepared, now).await?;
        consume_upload_claims(&mut transaction, prepared).await?;
        transaction.commit().await?;
        Ok(result)
    }

    /// Retrieve one exact authorized artifact envelope.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid retained data or a database failure.
    pub async fn get_artifact(
        &self,
        scope_id: Uuid,
        artifact_id: Uuid,
    ) -> Result<Option<ArtifactEnvelope>, StoreError> {
        let row = sqlx::query(
            "SELECT r.id, r.scope_id, r.publication_id, r.publication_ordinal, r.producer_run_id, r.output_role, r.output_ordinal, \
                    p.scope_sequence, p.committed_at, c.type_key, c.type_version, c.type_definition_sha256::text, c.payload, \
                    c.blob_sha256::text, c.blob_length, c.artifact_sha256::text \
             FROM artifact_store.artifact_records r JOIN artifact_store.publications p USING (scope_id, publication_id) \
             JOIN artifact_store.artifact_contents c ON c.scope_id=r.scope_id AND c.artifact_id=r.id \
             WHERE r.scope_id=$1 AND r.id=$2",
        )
        .bind(scope_id)
        .bind(artifact_id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| artifact_from_row(&row)).transpose()
    }

    /// Retrieve exact blob bytes only through one authorized occurrence.
    ///
    /// # Errors
    ///
    /// Returns a database error when the read fails.
    pub async fn get_content(
        &self,
        scope_id: Uuid,
        artifact_id: Uuid,
    ) -> Result<Option<Vec<u8>>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT b.bytes FROM artifact_store.artifact_contents c JOIN artifact_store.artifact_blobs b ON b.sha256=c.blob_sha256 WHERE c.scope_id=$1 AND c.artifact_id=$2",
        )
        .bind(scope_id)
        .bind(artifact_id)
        .fetch_optional(&self.pool)
        .await?)
    }

    /// Retrieve the immutable producer inputs for one exact artifact occurrence.
    ///
    /// Root artifacts have no producer run and therefore return an empty input list.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid retained data or a database failure.
    pub async fn get_producer_inputs(
        &self,
        scope_id: Uuid,
        artifact_id: Uuid,
    ) -> Result<Option<ProducerInputs>, StoreError> {
        let producer_run_id = sqlx::query_scalar::<_, Option<Uuid>>(
            "SELECT producer_run_id FROM artifact_store.artifact_records WHERE scope_id=$1 AND id=$2",
        )
        .bind(scope_id)
        .bind(artifact_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(producer_run_id) = producer_run_id else {
            return Ok(None);
        };
        let inputs = if let Some(run_id) = producer_run_id {
            sqlx::query(
                "SELECT role, ordinal, input_artifact_id FROM artifact_store.artifact_run_inputs \
                 WHERE scope_id=$1 AND run_id=$2 ORDER BY role, ordinal",
            )
            .bind(scope_id)
            .bind(run_id)
            .fetch_all(&self.pool)
            .await?
            .iter()
            .map(run_input_from_row)
            .collect::<Result<Vec<_>, _>>()?
        } else {
            Vec::new()
        };
        Ok(Some(ProducerInputs {
            artifact_id,
            producer_run_id,
            inputs,
        }))
    }

    /// Retrieve direct supporting-evidence edges for one exact artifact occurrence.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid retained data or a database failure.
    pub async fn get_supporting_evidence(
        &self,
        scope_id: Uuid,
        artifact_id: Uuid,
    ) -> Result<Option<SupportingEvidence>, StoreError> {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM artifact_store.artifact_records WHERE scope_id=$1 AND id=$2)",
        )
        .bind(scope_id)
        .bind(artifact_id)
        .fetch_one(&self.pool)
        .await?;
        if !exists {
            return Ok(None);
        }
        let evidence = sqlx::query(
            "SELECT e.ordinal, e.output_artifact_id, e.output_locator, \
                    e.input_role, e.input_ordinal, i.input_artifact_id, e.input_locator \
             FROM artifact_store.artifact_evidence e \
             JOIN artifact_store.artifact_run_inputs i \
               ON i.scope_id=e.scope_id AND i.run_id=e.run_id \
              AND i.role=e.input_role AND i.ordinal=e.input_ordinal \
             WHERE e.scope_id=$1 AND e.output_artifact_id=$2 ORDER BY e.ordinal LIMIT 1024",
        )
        .bind(scope_id)
        .bind(artifact_id)
        .fetch_all(&self.pool)
        .await?
        .iter()
        .map(evidence_from_row)
        .collect::<Result<Vec<_>, _>>()?;
        Ok(Some(SupportingEvidence {
            artifact_id,
            evidence,
        }))
    }

    /// Read one type at a frozen publication watermark with deterministic UUID pagination.
    ///
    /// # Errors
    /// Returns an error for an invalid snapshot or a database failure.
    pub async fn query_artifacts(
        &self,
        scope_id: Uuid,
        type_key: &str,
        snapshot: Option<i64>,
        after: Option<Uuid>,
        limit: u32,
    ) -> Result<ArtifactQueryPage, StoreError> {
        let latest: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(scope_sequence),0) FROM artifact_store.publications WHERE scope_id=$1")
            .bind(scope_id).fetch_one(&self.pool).await?;
        let snapshot_sequence = snapshot.unwrap_or(latest);
        if snapshot_sequence < 0 || snapshot_sequence > latest {
            return Err(StoreError::Integrity(
                "artifact query snapshot is unavailable".into(),
            ));
        }
        let limit = limit.clamp(1, 128);
        let ids: Vec<Uuid> = sqlx::query_scalar(
            "SELECT r.id FROM artifact_store.artifact_records r JOIN artifact_store.artifact_contents c ON c.scope_id=r.scope_id AND c.artifact_id=r.id JOIN artifact_store.publications p ON p.scope_id=r.scope_id AND p.publication_id=r.publication_id WHERE r.scope_id=$1 AND c.type_key=$2 AND p.scope_sequence<=$3 AND ($4::uuid IS NULL OR r.id>$4) ORDER BY r.id LIMIT $5",
        ).bind(scope_id).bind(type_key).bind(snapshot_sequence).bind(after).bind(i64::from(limit) + 1)
            .fetch_all(&self.pool).await?;
        let next_after = if ids.len() > limit as usize {
            ids.get(limit as usize - 1).copied()
        } else {
            None
        };
        let mut items = Vec::new();
        for id in ids.into_iter().take(limit as usize) {
            items.push(
                self.get_artifact(scope_id, id)
                    .await?
                    .ok_or_else(|| StoreError::Integrity("query artifact disappeared".into()))?,
            );
        }
        Ok(ArtifactQueryPage {
            snapshot_sequence,
            items,
            next_after,
        })
    }

    /// Resolve an immutable publication by its scope-bound identity without scanning the feed.
    ///
    /// # Errors
    /// Returns an error for invalid retained data or database failure.
    pub async fn read_publication(
        &self,
        scope_id: Uuid,
        publication_id: Uuid,
    ) -> Result<Option<PublicationDetails>, StoreError> {
        let sequence: Option<i64> = sqlx::query_scalar(
            "SELECT scope_sequence FROM artifact_store.publications WHERE scope_id=$1 AND publication_id=$2",
        )
        .bind(scope_id)
        .bind(publication_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(sequence) = sequence else {
            return Ok(None);
        };
        let epoch = self.context().await?.store_epoch;
        let page = self.read_feed(scope_id, epoch, sequence - 1, 1).await?;
        let item = page.items.into_iter().next();
        if item
            .as_ref()
            .is_none_or(|item| item.publication_id != publication_id)
        {
            return Err(StoreError::Integrity(
                "publication lookup changed identity".into(),
            ));
        }
        let publication = item.expect("publication identity checked above");
        let run = if let Some(run_id) = publication.run_id {
            let row = sqlx::query("SELECT procedure_key, procedure_version, parameters FROM artifact_store.production_runs WHERE scope_id=$1 AND id=$2")
                .bind(scope_id).bind(run_id).fetch_one(&self.pool).await?;
            Some(CommittedRunMetadata {
                procedure_key: row.get("procedure_key"),
                procedure_version: row.get("procedure_version"),
                parameters: serde_json::from_value(row.get("parameters"))?,
            })
        } else {
            None
        };
        Ok(Some(PublicationDetails { publication, run }))
    }

    /// Read increasing whole publications after one scope-local sequence.
    ///
    /// # Errors
    ///
    /// Returns an error for epoch mismatch, invalid retained data, or database failure.
    pub async fn read_feed(
        &self,
        scope_id: Uuid,
        store_epoch: Uuid,
        after_sequence: i64,
        limit: u32,
    ) -> Result<PublicationFeedPage, StoreError> {
        let context = self.context().await?;
        if context.store_epoch != store_epoch {
            return Err(StoreError::EpochChanged {
                expected: store_epoch,
                actual: context.store_epoch,
            });
        }
        let rows = sqlx::query(
            "SELECT publication_id, scope_sequence, committed_store_epoch, publication_request_sha256::text, kind, publisher_issuer, publisher_subject, run_id, committed_at \
             FROM artifact_store.publications WHERE scope_id=$1 AND scope_sequence>$2 ORDER BY scope_sequence LIMIT $3",
        )
        .bind(scope_id)
        .bind(after_sequence)
        .bind(i64::from(limit.min(1_000)))
        .fetch_all(&self.pool)
        .await?;
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            let publication_id: Uuid = row.get("publication_id");
            let run_id: Option<Uuid> = row.get("run_id");
            let artifact_rows = sqlx::query(
                "SELECT r.id, r.local_key, r.publication_ordinal, r.producer_run_id, r.output_role, r.output_ordinal, c.type_key, c.type_version, c.artifact_sha256::text \
                 FROM artifact_store.artifact_records r JOIN artifact_store.artifact_contents c ON c.scope_id=r.scope_id AND c.artifact_id=r.id \
                 WHERE r.scope_id=$1 AND r.publication_id=$2 ORDER BY r.publication_ordinal",
            )
            .bind(scope_id)
            .bind(publication_id)
            .fetch_all(&self.pool)
            .await?;
            let artifacts = artifact_rows
                .iter()
                .map(feed_artifact_from_row)
                .collect::<Result<Vec<_>, _>>()?;
            items.push(PublicationFeedItem {
                scope_id,
                publication_id,
                scope_sequence: row.get("scope_sequence"),
                committed_store_epoch: row.get("committed_store_epoch"),
                publication_request_sha256: row.get("publication_request_sha256"),
                kind: row.get("kind"),
                publisher: StablePublisher {
                    issuer: row.get("publisher_issuer"),
                    subject: row.get("publisher_subject"),
                },
                run_id,
                committed_at: row.get("committed_at"),
                artifacts,
            });
        }
        let next_after_sequence = items.last().map(|item| item.scope_sequence);
        Ok(PublicationFeedPage {
            store_epoch,
            items,
            next_after_sequence,
        })
    }
}

fn valid_role_name(role: &str) -> bool {
    !role.is_empty()
        && role.len() <= 63
        && role
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

async fn assert_store_normal(
    transaction: &mut Transaction<'_, Postgres>,
    expected: Option<Uuid>,
) -> Result<Uuid, StoreError> {
    let row = sqlx::query(
        "SELECT store_epoch, write_mode FROM artifact_store.store_state WHERE singleton=true",
    )
    .fetch_one(&mut **transaction)
    .await?;
    let epoch: Uuid = row.get("store_epoch");
    if row.get::<String, _>("write_mode") != "normal" {
        return Err(StoreError::Reconciling);
    }
    if let Some(expected) = expected {
        if expected != epoch {
            return Err(StoreError::EpochChanged {
                expected,
                actual: epoch,
            });
        }
    }
    Ok(epoch)
}

async fn replay_upload_claim(
    transaction: &mut Transaction<'_, Postgres>,
    now: OffsetDateTime,
    publisher: &StablePublisher,
    scope_id: Uuid,
    claim_id: Uuid,
    declaration: &UploadDeclaration,
) -> Result<Option<UploadClaimResult>, StoreError> {
    let Some(row) = sqlx::query(
        "SELECT scope_id, publisher_issuer, publisher_subject, blob_sha256::text, blob_length, declared_media_type, expires_at, consumed_publication_id \
         FROM artifact_store.upload_claims WHERE claim_id=$1",
    )
    .bind(claim_id)
    .fetch_optional(&mut **transaction)
    .await?
    else {
        return Ok(None);
    };
    let same = row.get::<Uuid, _>("scope_id") == scope_id
        && row.get::<String, _>("publisher_issuer") == publisher.issuer
        && row.get::<String, _>("publisher_subject") == publisher.subject
        && row.get::<String, _>("blob_sha256") == declaration.sha256
        && row.get::<i64, _>("blob_length") == to_i64(declaration.length, "blob length")?
        && row.get::<String, _>("declared_media_type") == declaration.declared_media_type;
    if !same {
        return Err(StoreError::UploadConflict);
    }
    let expires_at: OffsetDateTime = row.get("expires_at");
    if expires_at <= now
        || row
            .get::<Option<Uuid>, _>("consumed_publication_id")
            .is_some()
    {
        return Err(StoreError::UploadExpired);
    }
    Ok(Some(UploadClaimResult {
        claim_id,
        scope_id,
        sha256: declaration.sha256.clone(),
        length: declaration.length,
        declared_media_type: declaration.declared_media_type.clone(),
        expires_at,
        replayed: true,
    }))
}

async fn admit_staged_upload(
    transaction: &mut Transaction<'_, Postgres>,
    scope_id: Uuid,
    now: OffsetDateTime,
    length: u64,
    admission: UploadAdmission,
) -> Result<(), StoreError> {
    let quota = sqlx::query(
        "SELECT COUNT(*) AS claim_count, COALESCE(SUM(blob_length),0)::bigint AS staged_bytes \
         FROM artifact_store.upload_claims \
         WHERE scope_id=$1 AND consumed_publication_id IS NULL AND expires_at>$2",
    )
    .bind(scope_id)
    .bind(now)
    .fetch_one(&mut **transaction)
    .await?;
    let declared_length = to_i64(length, "blob length")?;
    if quota.get::<i64, _>("claim_count") >= admission.max_live_claims_per_scope
        || quota
            .get::<i64, _>("staged_bytes")
            .checked_add(declared_length)
            .is_none_or(|total| total > admission.max_staged_bytes_per_scope)
    {
        return Err(StoreError::StagingQuotaExceeded);
    }
    Ok(())
}

async fn admit_publication(
    transaction: &mut Transaction<'_, Postgres>,
    scope_id: Uuid,
    prepared: &PreparedPublication,
    admission: UploadAdmission,
) -> Result<(), StoreError> {
    sqlx::query("SELECT id FROM artifact_store.artifact_scopes WHERE id=$1 FOR UPDATE")
        .bind(scope_id)
        .fetch_one(&mut **transaction)
        .await?;
    let logical_bytes: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(blob_length),0)::bigint FROM artifact_store.artifact_contents WHERE scope_id=$1",
    )
    .bind(scope_id)
    .fetch_one(&mut **transaction)
    .await?;
    let added_bytes = prepared
        .artifacts
        .iter()
        .try_fold(0_i64, |total, artifact| {
            let length = artifact
                .blob_length
                .map(|value| to_i64(value, "blob length"))
                .transpose()?
                .unwrap_or(0);
            total
                .checked_add(length)
                .ok_or_else(|| StoreError::Integrity("logical byte total overflowed".into()))
        })?;
    if logical_bytes
        .checked_add(added_bytes)
        .is_none_or(|total| total > admission.max_logical_bytes_per_scope)
    {
        return Err(StoreError::StorageQuotaExceeded);
    }
    Ok(())
}

async fn validate_blob_authorities(
    transaction: &mut Transaction<'_, Postgres>,
    now: OffsetDateTime,
    prepared: &PreparedPublication,
) -> Result<(), StoreError> {
    for artifact in &prepared.artifacts {
        let Some(expected_sha) = &artifact.blob_sha256 else {
            continue;
        };
        let expected_length = artifact
            .blob_length
            .ok_or_else(|| StoreError::Integrity("blob digest lacks length".into()))?;
        let authority = prepared
            .submission
            .blob_authorities
            .get(&artifact.local_key)
            .ok_or(StoreError::InputUnavailable)?;
        match authority {
            BlobAuthority::UploadClaim { claim_id } => {
                let row = sqlx::query(
                    "SELECT scope_id, publisher_issuer, publisher_subject, blob_sha256::text, blob_length, expires_at, consumed_publication_id FROM artifact_store.upload_claims WHERE claim_id=$1 FOR UPDATE",
                )
                .bind(claim_id).fetch_optional(&mut **transaction).await?.ok_or(StoreError::UploadExpired)?;
                if row.get::<Uuid, _>("scope_id") != prepared.context.scope_id
                    || row.get::<String, _>("publisher_issuer") != prepared.context.publisher.issuer
                    || row.get::<String, _>("publisher_subject")
                        != prepared.context.publisher.subject
                    || row.get::<String, _>("blob_sha256") != *expected_sha
                    || row.get::<i64, _>("blob_length") != to_i64(expected_length, "blob length")?
                    || row.get::<OffsetDateTime, _>("expires_at") <= now
                {
                    return Err(StoreError::InputUnavailable);
                }
                if let Some(consumed) = row.get::<Option<Uuid>, _>("consumed_publication_id") {
                    if consumed != prepared.submission.intent.publication_id {
                        return Err(StoreError::UploadExpired);
                    }
                }
            }
            BlobAuthority::SourceArtifact { artifact_id } => {
                let row = sqlx::query("SELECT blob_sha256::text, blob_length FROM artifact_store.artifact_contents WHERE scope_id=$1 AND artifact_id=$2")
                    .bind(prepared.context.scope_id).bind(artifact_id)
                    .fetch_optional(&mut **transaction).await?.ok_or(StoreError::InputUnavailable)?;
                if row.get::<Option<String>, _>("blob_sha256").as_deref() != Some(expected_sha)
                    || row.get::<Option<i64>, _>("blob_length")
                        != Some(to_i64(expected_length, "blob length")?)
                {
                    return Err(StoreError::InputUnavailable);
                }
            }
        }
    }
    Ok(())
}

async fn insert_publication(
    transaction: &mut Transaction<'_, Postgres>,
    prepared: &PreparedPublication,
    result: &PublicationResult,
) -> Result<(), StoreError> {
    let intent = &prepared.submission.intent;
    let (kind, root_actor) = match &intent.body {
        PublicationBody::Roots { root_actor } => ("roots", Some(serde_json::to_value(root_actor)?)),
        PublicationBody::Run { .. } => ("run", None),
    };
    sqlx::query(
        "INSERT INTO artifact_store.publications (scope_id,publication_id,scope_sequence,committed_store_epoch,command_version,kind,publisher_issuer,publisher_subject,root_actor,publication_request_sha256,result_mapping,run_id,committed_at) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    )
    .bind(intent.scope_id).bind(intent.publication_id).bind(result.scope_sequence)
    .bind(result.committed_store_epoch).bind(i32::try_from(intent.command_version).unwrap_or(i32::MAX))
    .bind(kind).bind(&prepared.context.publisher.issuer).bind(&prepared.context.publisher.subject)
    .bind(root_actor).bind(&prepared.publication_request_sha256).bind(serde_json::to_value(result)?)
    .bind(prepared.run_id).bind(result.committed_at).execute(&mut **transaction).await?;

    if let (PublicationBody::Run { run }, Some(run_id)) = (&intent.body, prepared.run_id) {
        sqlx::query(
            "INSERT INTO artifact_store.production_runs (id,scope_id,publication_id,procedure_key,procedure_version,initiator_actor,executor_actor,parameters,implementation,receipt,created_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(run_id).bind(intent.scope_id).bind(intent.publication_id).bind(run.procedure_key.as_str())
        .bind(&run.procedure_version).bind(serde_json::to_value(&run.initiator)?)
        .bind(serde_json::to_value(&run.executor)?).bind(serde_json::to_value(&run.parameters)?)
        .bind(serde_json::to_value(&run.implementation)?).bind(serde_json::to_value(&run.receipt)?)
        .bind(result.committed_at).execute(&mut **transaction).await?;
        for input in &run.inputs {
            sqlx::query("INSERT INTO artifact_store.artifact_run_inputs(scope_id,run_id,role,ordinal,input_artifact_id) VALUES ($1,$2,$3,$4,$5)")
                .bind(intent.scope_id).bind(run_id).bind(input.role.as_str())
                .bind(i32::try_from(input.ordinal).unwrap_or(i32::MAX)).bind(input.artifact_id)
                .execute(&mut **transaction).await?;
        }
    }
    Ok(())
}

async fn insert_artifacts(
    transaction: &mut Transaction<'_, Postgres>,
    prepared: &PreparedPublication,
    now: OffsetDateTime,
) -> Result<(), StoreError> {
    let scope_id = prepared.context.scope_id;
    let publication_id = prepared.submission.intent.publication_id;
    for artifact in &prepared.artifacts {
        let output_role = artifact.output.as_ref().map(|output| output.role.as_str());
        let output_ordinal = artifact
            .output
            .as_ref()
            .map(|output| i32::try_from(output.ordinal).unwrap_or(i32::MAX));
        sqlx::query(
            "INSERT INTO artifact_store.artifact_records (id,scope_id,publication_id,publication_ordinal,local_key,producer_run_id,output_role,output_ordinal,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(artifact.id).bind(scope_id).bind(publication_id)
        .bind(i32::try_from(artifact.publication_ordinal).unwrap_or(i32::MAX)).bind(artifact.local_key.as_str())
        .bind(prepared.run_id).bind(output_role).bind(output_ordinal).bind(now)
        .execute(&mut **transaction).await?;
        sqlx::query(
            "INSERT INTO artifact_store.artifact_contents (artifact_id,scope_id,type_key,type_version,type_definition_sha256,payload,blob_sha256,blob_length,artifact_sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(artifact.id).bind(scope_id).bind(artifact.type_key.as_str())
        .bind(i32::try_from(artifact.type_version).unwrap_or(i32::MAX)).bind(&artifact.type_definition_sha256)
        .bind(serde_json::to_value(&artifact.payload)?).bind(&artifact.blob_sha256)
        .bind(artifact.blob_length.map(|length| to_i64(length, "blob length")).transpose()?)
        .bind(&artifact.artifact_sha256).execute(&mut **transaction).await?;
        for reference in &artifact.references {
            sqlx::query(
                "INSERT INTO artifact_store.artifact_references (scope_id,source_artifact_id,target_artifact_id,role,ordinal,attributes,target_artifact_sha256) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            )
            .bind(scope_id).bind(artifact.id).bind(reference.target_artifact_id).bind(reference.role.as_str())
            .bind(i32::try_from(reference.ordinal).unwrap_or(i32::MAX))
            .bind(serde_json::to_value(&reference.attributes)?).bind(&reference.target_artifact_sha256)
            .execute(&mut **transaction).await?;
        }
    }
    if let (PublicationBody::Run { .. }, Some(run_id)) =
        (&prepared.submission.intent.body, prepared.run_id)
    {
        let local: BTreeMap<_, _> = prepared
            .artifacts
            .iter()
            .map(|artifact| (&artifact.local_key, artifact.id))
            .collect();
        for evidence in &prepared.submission.intent.evidence {
            sqlx::query(
                "INSERT INTO artifact_store.artifact_evidence (scope_id,run_id,output_artifact_id,output_locator,input_role,input_ordinal,input_locator,ordinal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            )
            .bind(scope_id).bind(run_id).bind(local[&evidence.output_local_key])
            .bind(serde_json::to_value(&evidence.output_locator)?).bind(evidence.input_role.as_str())
            .bind(i32::try_from(evidence.input_ordinal).unwrap_or(i32::MAX))
            .bind(serde_json::to_value(&evidence.input_locator)?)
            .bind(i32::try_from(evidence.ordinal).unwrap_or(i32::MAX))
            .execute(&mut **transaction).await?;
        }
    }
    Ok(())
}

async fn consume_upload_claims(
    transaction: &mut Transaction<'_, Postgres>,
    prepared: &PreparedPublication,
) -> Result<(), StoreError> {
    for authority in prepared.submission.blob_authorities.values() {
        if let BlobAuthority::UploadClaim { claim_id } = authority {
            sqlx::query("UPDATE artifact_store.upload_claims SET consumed_publication_id=$1 WHERE claim_id=$2 AND consumed_publication_id IS NULL")
                .bind(prepared.submission.intent.publication_id).bind(claim_id)
                .execute(&mut **transaction).await?;
        }
    }
    Ok(())
}

fn existing_from_row(row: &PgRow) -> Result<ExistingArtifact, StoreError> {
    Ok(ExistingArtifact {
        id: row.get("artifact_id"),
        scope_id: row.get("scope_id"),
        type_key: TypeKey::new(row.get::<String, _>("type_key"))
            .map_err(|error| StoreError::Integrity(error.to_string()))?,
        type_version: to_u32(row.get("type_version"), "type version")?,
        artifact_sha256: row.get("artifact_sha256"),
        blob_sha256: row.get("blob_sha256"),
        blob_length: row
            .get::<Option<i64>, _>("blob_length")
            .map(|value| to_u64(value, "blob length"))
            .transpose()?,
    })
}

fn artifact_from_row(row: &PgRow) -> Result<ArtifactEnvelope, StoreError> {
    let output = output_from_row(row)?;
    let blob = match (
        row.get::<Option<String>, _>("blob_sha256"),
        row.get::<Option<i64>, _>("blob_length"),
    ) {
        (Some(sha256), Some(length)) => Some(DeclaredBlob {
            sha256,
            length: to_u64(length, "blob length")?,
        }),
        (None, None) => None,
        _ => return Err(StoreError::Integrity("partial blob binding".into())),
    };
    Ok(ArtifactEnvelope {
        artifact_id: row.get("id"),
        scope_id: row.get("scope_id"),
        publication_id: row.get("publication_id"),
        publication_ordinal: to_u32(row.get("publication_ordinal"), "publication ordinal")?,
        scope_sequence: row.get("scope_sequence"),
        type_key: TypeKey::new(row.get::<String, _>("type_key"))
            .map_err(|error| StoreError::Integrity(error.to_string()))?,
        type_version: to_u32(row.get("type_version"), "type version")?,
        type_definition_sha256: row.get("type_definition_sha256"),
        payload: serde_json::from_value(row.get("payload"))?,
        blob,
        artifact_sha256: row.get("artifact_sha256"),
        producer_run_id: row.get("producer_run_id"),
        output,
        committed_at: row.get("committed_at"),
    })
}

fn feed_artifact_from_row(row: &PgRow) -> Result<FeedArtifact, StoreError> {
    Ok(FeedArtifact {
        artifact_id: row.get("id"),
        local_key: aven_artifact_store_contract::LocalKey::new(row.get::<String, _>("local_key"))
            .map_err(|error| StoreError::Integrity(error.to_string()))?,
        publication_ordinal: to_u32(row.get("publication_ordinal"), "publication ordinal")?,
        type_key: TypeKey::new(row.get::<String, _>("type_key"))
            .map_err(|error| StoreError::Integrity(error.to_string()))?,
        type_version: to_u32(row.get("type_version"), "type version")?,
        artifact_sha256: row.get("artifact_sha256"),
        producer_run_id: row.get("producer_run_id"),
        output: output_from_row(row)?,
    })
}

fn run_input_from_row(row: &PgRow) -> Result<RunInput, StoreError> {
    Ok(RunInput {
        role: aven_artifact_store_contract::Role::new(row.get::<String, _>("role"))
            .map_err(|error| StoreError::Integrity(error.to_string()))?,
        ordinal: to_u32(row.get("ordinal"), "run input ordinal")?,
        artifact_id: row.get("input_artifact_id"),
    })
}

fn evidence_from_row(row: &PgRow) -> Result<ArtifactEvidence, StoreError> {
    Ok(ArtifactEvidence {
        ordinal: to_u32(row.get("ordinal"), "evidence ordinal")?,
        output_artifact_id: row.get("output_artifact_id"),
        output_locator: serde_json::from_value(row.get("output_locator"))?,
        input_role: aven_artifact_store_contract::Role::new(row.get::<String, _>("input_role"))
            .map_err(|error| StoreError::Integrity(error.to_string()))?,
        input_ordinal: to_u32(row.get("input_ordinal"), "evidence input ordinal")?,
        input_artifact_id: row.get("input_artifact_id"),
        input_locator: serde_json::from_value(row.get("input_locator"))?,
    })
}

fn output_from_row(row: &PgRow) -> Result<Option<OutputBinding>, StoreError> {
    match (
        row.get::<Option<String>, _>("output_role"),
        row.get::<Option<i32>, _>("output_ordinal"),
    ) {
        (Some(role), Some(ordinal)) => Ok(Some(OutputBinding {
            role: aven_artifact_store_contract::Role::new(role)
                .map_err(|error| StoreError::Integrity(error.to_string()))?,
            ordinal: to_u32(ordinal, "output ordinal")?,
        })),
        (None, None) => Ok(None),
        _ => Err(StoreError::Integrity("partial output binding".into())),
    }
}

fn to_i64(value: u64, label: &str) -> Result<i64, StoreError> {
    i64::try_from(value).map_err(|_| StoreError::Integrity(format!("{label} exceeds SQL bigint")))
}

fn to_u64(value: i64, label: &str) -> Result<u64, StoreError> {
    u64::try_from(value).map_err(|_| StoreError::Integrity(format!("negative {label}")))
}

fn to_u32(value: i32, label: &str) -> Result<u32, StoreError> {
    u32::try_from(value).map_err(|_| StoreError::Integrity(format!("negative {label}")))
}
