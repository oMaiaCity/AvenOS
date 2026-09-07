//! Stand-alone HTTP adapter for the artifact-store kernel.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use aven_artifact_store_contract::{
    parse_canonical, BlobAuthority, ErrorCode, Problem, PublicationBody, PublicationSubmission,
    RequestContext, StablePublisher, TypeKey, UploadDeclaration,
};
use aven_artifact_store_core::{prepare_publication, Limits, TypeCatalog};
use aven_artifact_store_postgres::{PostgresStore, StoreError, UploadAdmission};
use axum::body::{to_bytes, Body, Bytes};
use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use time::{Duration, OffsetDateTime};
use tokio::sync::{RwLock, Semaphore};
use url::Url;
use uuid::Uuid;

const DEFAULT_MAX_UPLOAD_BYTES: usize = 25 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_UPLOADS: usize = 2;
const DEFAULT_MAX_LIVE_CLAIMS_PER_SCOPE: i64 = 32;
const DEFAULT_MAX_STAGED_BYTES_PER_SCOPE: i64 = 100 * 1024 * 1024;
const DEFAULT_MAX_LOGICAL_BYTES_PER_SCOPE: i64 = 1024 * 1024 * 1024;
pub const TENANT_DATABASE_HEADER: &str = "x-aven-artifact-database";
const TENANT_ENVIRONMENT_HEADER: &str = "x-aven-environment";
const TENANT_GENERATION_HEADER: &str = "x-aven-routing-generation";
const ARTIFACT_ROLE_KIND: &str = "ceo.aven:db-role:artifacts:api@1";

#[derive(Clone)]
pub struct FixedServiceAuth {
    credentials: Arc<[ServiceCredential]>,
    scope_id: Option<Uuid>,
}

#[derive(Clone)]
struct ServiceCredential {
    bearer_token: Arc<str>,
    publisher: StablePublisher,
}

impl FixedServiceAuth {
    /// Create the explicit fixed-publisher preview authentication adapter.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty credential or invalid stable publisher.
    pub fn new(
        bearer_token: impl Into<Arc<str>>,
        publisher: StablePublisher,
        scope_id: Uuid,
    ) -> Result<Self, ApiError> {
        publisher
            .validate()
            .map_err(|error| ApiError::malformed(error.to_string()))?;
        let bearer_token = bearer_token.into();
        if bearer_token.is_empty() {
            return Err(ApiError::malformed("bearer token cannot be empty"));
        }
        Ok(Self {
            credentials: vec![ServiceCredential {
                bearer_token,
                publisher,
            }]
            .into(),
            scope_id: Some(scope_id),
        })
    }

    /// Create an adapter for trusted per-customer routing. The route scope is
    /// still checked against the scope provisioned in the selected database.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty credential or invalid stable publisher.
    pub fn for_tenants(
        bearer_token: impl Into<Arc<str>>,
        publisher: StablePublisher,
    ) -> Result<Self, ApiError> {
        publisher
            .validate()
            .map_err(|error| ApiError::malformed(error.to_string()))?;
        let bearer_token = bearer_token.into();
        if bearer_token.is_empty() {
            return Err(ApiError::malformed("bearer token cannot be empty"));
        }
        Ok(Self {
            credentials: vec![ServiceCredential {
                bearer_token,
                publisher,
            }]
            .into(),
            scope_id: None,
        })
    }

    /// Add another independently authenticated publisher to the same tenant router.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty, duplicate credential or invalid publisher.
    pub fn with_credential(
        mut self,
        bearer_token: impl Into<Arc<str>>,
        publisher: StablePublisher,
    ) -> Result<Self, ApiError> {
        publisher
            .validate()
            .map_err(|error| ApiError::malformed(error.to_string()))?;
        let bearer_token = bearer_token.into();
        if bearer_token.is_empty()
            || self
                .credentials
                .iter()
                .any(|credential| credential.bearer_token == bearer_token)
        {
            return Err(ApiError::malformed(
                "bearer credential must be non-empty and unique",
            ));
        }
        let mut credentials = self.credentials.to_vec();
        credentials.push(ServiceCredential {
            bearer_token,
            publisher,
        });
        self.credentials = credentials.into();
        Ok(self)
    }

    fn authenticate(&self, headers: &HeaderMap) -> Result<StablePublisher, ApiError> {
        let supplied = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok());
        self.credentials
            .iter()
            .find(|credential| {
                supplied == Some(format!("Bearer {}", credential.bearer_token).as_str())
            })
            .map(|credential| credential.publisher.clone())
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNAUTHORIZED,
                    ErrorCode::AuthenticationRequired,
                    "a valid bearer credential is required",
                )
            })
    }

    fn authorize(
        &self,
        headers: &HeaderMap,
        route_scope: Uuid,
    ) -> Result<RequestContext, ApiError> {
        let publisher = self.authenticate(headers)?;
        if self.scope_id.is_some_and(|scope| scope != route_scope) {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                ErrorCode::ScopeDenied,
                "the authenticated service cannot use this scope",
            ));
        }
        Ok(RequestContext {
            publisher,
            scope_id: route_scope,
            decision_expires_at: OffsetDateTime::now_utc() + Duration::minutes(1),
        })
    }
}

#[derive(Clone)]
enum StoreRouter {
    Fixed(PostgresStore),
    Tenants(TenantStoreRegistry),
}

impl StoreRouter {
    async fn resolve(&self, headers: &HeaderMap) -> Result<PostgresStore, ApiError> {
        match self {
            Self::Fixed(store) => Ok(store.clone()),
            Self::Tenants(stores) => stores.resolve(headers).await,
        }
    }

    async fn ready(&self) -> Result<(), ApiError> {
        match self {
            Self::Fixed(store) => {
                store.context().await?;
            }
            Self::Tenants(stores) => stores.ready().await?,
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct TenantStoreRegistry {
    cluster_url: Arc<Url>,
    credential_root: Arc<[u8]>,
    stores: Arc<RwLock<BTreeMap<String, CachedStore>>>,
    use_sequence: Arc<AtomicU64>,
    max_stores: usize,
    connections_per_store: u32,
}

#[derive(Clone)]
struct CachedStore {
    store: PostgresStore,
    last_used: u64,
}

impl TenantStoreRegistry {
    /// Configure a bounded set of lazy per-database pools.
    ///
    /// # Errors
    ///
    /// Returns an error for a non-PostgreSQL URL or a zero pool bound.
    pub fn new(
        cluster_url: &str,
        credential_root: &str,
        max_stores: usize,
        connections_per_store: u32,
    ) -> Result<Self, ApiError> {
        let cluster_url = Url::parse(cluster_url)
            .map_err(|_| ApiError::malformed("tenant database URL is invalid"))?;
        if !matches!(cluster_url.scheme(), "postgres" | "postgresql") {
            return Err(ApiError::malformed(
                "tenant database URL must use PostgreSQL",
            ));
        }
        if max_stores == 0 || connections_per_store == 0 {
            return Err(ApiError::malformed("tenant pool limits must be positive"));
        }
        let credential_root = URL_SAFE_NO_PAD
            .decode(credential_root)
            .map_err(|_| ApiError::malformed("artifact credential root is invalid"))?;
        if credential_root.len() < 32 {
            return Err(ApiError::malformed("artifact credential root is too short"));
        }
        Ok(Self {
            cluster_url: Arc::new(cluster_url),
            credential_root: credential_root.into(),
            stores: Arc::new(RwLock::new(BTreeMap::new())),
            use_sequence: Arc::new(AtomicU64::new(0)),
            max_stores,
            connections_per_store,
        })
    }

    async fn ready(&self) -> Result<(), ApiError> {
        Ok(())
    }

    async fn resolve(&self, headers: &HeaderMap) -> Result<PostgresStore, ApiError> {
        let database = required_header(headers, TENANT_DATABASE_HEADER)?;
        validate_tenant_database(database)?;
        let environment_id = required_header(headers, TENANT_ENVIRONMENT_HEADER)?
            .parse::<Uuid>()
            .map_err(|_| ApiError::malformed("tenant environment is invalid"))?;
        validate_database_scope(database, environment_id)?;
        let routing_generation = required_header(headers, TENANT_GENERATION_HEADER)?
            .parse::<u64>()
            .map_err(|_| ApiError::malformed("tenant routing generation is invalid"))?;
        if routing_generation == 0 {
            return Err(ApiError::malformed("tenant routing generation is invalid"));
        }
        let cache_key = format!("{database}:{routing_generation}");
        let last_used = self.use_sequence.fetch_add(1, Ordering::Relaxed);
        if let Some(cached) = self.stores.write().await.get_mut(&cache_key) {
            cached.last_used = last_used;
            return Ok(cached.store.clone());
        }

        let database_url = tenant_database_url(
            &self.cluster_url,
            database,
            environment_id,
            routing_generation,
            &self.credential_root,
        )?;
        let store = PostgresStore::connect(&database_url, self.connections_per_store).await?;
        let mut stores = self.stores.write().await;
        if let Some(existing) = stores.get_mut(&cache_key) {
            existing.last_used = last_used;
            return Ok(existing.store.clone());
        }
        if stores.len() >= self.max_stores {
            if let Some(oldest) = stores
                .iter()
                .min_by_key(|(_, cached)| cached.last_used)
                .map(|(database, _)| database.clone())
            {
                stores.remove(&oldest);
            }
        }
        stores.insert(
            cache_key,
            CachedStore {
                store: store.clone(),
                last_used,
            },
        );
        Ok(store)
    }
}

#[derive(Clone)]
pub struct ProvisionerState {
    cluster_url: Arc<Url>,
    bearer_token: Arc<str>,
    catalog: TypeCatalog,
}

impl ProvisionerState {
    /// Configure the internal database provisioning endpoint.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid database URL, empty credential, or unsafe role.
    pub fn new(
        cluster_url: &str,
        bearer_token: impl Into<Arc<str>>,
        catalog: TypeCatalog,
    ) -> Result<Self, ApiError> {
        let cluster_url = Url::parse(cluster_url)
            .map_err(|_| ApiError::malformed("provisioner database URL is invalid"))?;
        if !matches!(cluster_url.scheme(), "postgres" | "postgresql") {
            return Err(ApiError::malformed(
                "provisioner database URL must use PostgreSQL",
            ));
        }
        let bearer_token = bearer_token.into();
        if bearer_token.is_empty() {
            return Err(ApiError::malformed("provisioner configuration is invalid"));
        }
        Ok(Self {
            cluster_url: Arc::new(cluster_url),
            bearer_token,
            catalog,
        })
    }
}

#[derive(Clone)]
pub struct AppState {
    store: StoreRouter,
    catalog: TypeCatalog,
    limits: Limits,
    auth: FixedServiceAuth,
    upload_slots: Arc<Semaphore>,
    max_upload_bytes: usize,
    upload_admission: UploadAdmission,
}

impl AppState {
    #[must_use]
    pub fn new(store: PostgresStore, catalog: TypeCatalog, auth: FixedServiceAuth) -> Self {
        Self {
            store: StoreRouter::Fixed(store),
            catalog,
            limits: Limits::default(),
            auth,
            upload_slots: Arc::new(Semaphore::new(DEFAULT_MAX_CONCURRENT_UPLOADS)),
            max_upload_bytes: DEFAULT_MAX_UPLOAD_BYTES,
            upload_admission: UploadAdmission {
                max_live_claims_per_scope: DEFAULT_MAX_LIVE_CLAIMS_PER_SCOPE,
                max_staged_bytes_per_scope: DEFAULT_MAX_STAGED_BYTES_PER_SCOPE,
                max_logical_bytes_per_scope: DEFAULT_MAX_LOGICAL_BYTES_PER_SCOPE,
            },
        }
    }

    #[must_use]
    pub fn for_tenants(
        stores: TenantStoreRegistry,
        catalog: TypeCatalog,
        auth: FixedServiceAuth,
    ) -> Self {
        Self {
            store: StoreRouter::Tenants(stores),
            catalog,
            limits: Limits::default(),
            auth,
            upload_slots: Arc::new(Semaphore::new(DEFAULT_MAX_CONCURRENT_UPLOADS)),
            max_upload_bytes: DEFAULT_MAX_UPLOAD_BYTES,
            upload_admission: UploadAdmission {
                max_live_claims_per_scope: DEFAULT_MAX_LIVE_CLAIMS_PER_SCOPE,
                max_staged_bytes_per_scope: DEFAULT_MAX_STAGED_BYTES_PER_SCOPE,
                max_logical_bytes_per_scope: DEFAULT_MAX_LOGICAL_BYTES_PER_SCOPE,
            },
        }
    }

    #[must_use]
    pub fn with_upload_admission(
        mut self,
        max_upload_bytes: usize,
        max_concurrent_uploads: usize,
        admission: UploadAdmission,
    ) -> Self {
        self.max_upload_bytes = max_upload_bytes;
        self.upload_slots = Arc::new(Semaphore::new(max_concurrent_uploads));
        self.upload_admission = admission;
        self
    }
}

pub fn router(state: AppState) -> Router {
    let max_upload_bytes = state.max_upload_bytes;
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/v1/context", get(context))
        .route("/v1/types/{type_key}/versions/{version}", get(get_type))
        .route(
            "/v1/scopes/{scope_id}/uploads/{claim_id}",
            put(stage_upload),
        )
        .route(
            "/v1/scopes/{scope_id}/publications/{publication_id}",
            put(publish).get(read_publication),
        )
        .route("/v1/scopes/{scope_id}/publications", get(read_feed))
        .route("/v1/scopes/{scope_id}/artifacts", get(query_artifacts))
        .route(
            "/v1/scopes/{scope_id}/artifacts/{artifact_id}",
            get(get_artifact),
        )
        .route(
            "/v1/scopes/{scope_id}/artifacts/{artifact_id}/producer-inputs",
            get(get_producer_inputs),
        )
        .route(
            "/v1/scopes/{scope_id}/artifacts/{artifact_id}/supporting-evidence",
            get(get_supporting_evidence),
        )
        .route(
            "/v1/scopes/{scope_id}/artifacts/{artifact_id}/content",
            get(get_content).head(head_content),
        )
        .layer(DefaultBodyLimit::max(max_upload_bytes))
        .with_state(state)
}

pub fn provisioner_router(state: ProvisionerState) -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(provisioner_ready))
        .route(
            "/internal/v1/databases/{database}/scopes/{scope_id}",
            put(provision_database),
        )
        .with_state(state)
}

async fn live() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn ready(State(state): State<AppState>) -> Result<StatusCode, ApiError> {
    state.store.ready().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn provisioner_ready(State(state): State<ProvisionerState>) -> Result<StatusCode, ApiError> {
    let store = PostgresStore::connect(state.cluster_url.as_str(), 1).await?;
    sqlx::query("SELECT 1")
        .execute(store.pool())
        .await
        .map_err(StoreError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn context(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    state.auth.authenticate(&headers)?;
    let store = state.store.resolve(&headers).await?;
    Ok(Json(store.context().await?))
}

async fn get_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((type_key, version)): Path<(String, u32)>,
) -> Result<Response, ApiError> {
    state.auth.authenticate(&headers)?;
    let type_key =
        TypeKey::new(type_key).map_err(|error| ApiError::malformed(error.to_string()))?;
    let registered = state
        .catalog
        .get(&type_key, version)
        .ok_or_else(ApiError::unavailable)?;
    Ok(Json(registered).into_response())
}

async fn stage_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, claim_id)): Path<(Uuid, Uuid)>,
    body: Body,
) -> Result<Response, ApiError> {
    let _permit = state
        .upload_slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::staging_quota())?;
    let context = state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let sha256 = required_header(&headers, "x-expected-sha256")?.to_owned();
    let length = required_header(&headers, "content-length")?
        .parse::<u64>()
        .map_err(|_| ApiError::malformed("Content-Length must be an unsigned integer"))?;
    let declared_media_type = required_header(&headers, "content-type")?.to_owned();
    let declaration = UploadDeclaration {
        sha256,
        length,
        declared_media_type,
    };
    let body = to_bytes(body, state.max_upload_bytes)
        .await
        .map_err(|_| ApiError::limit("upload body exceeds the configured limit"))?;
    let result = store
        .stage_upload(
            OffsetDateTime::now_utc(),
            &context.publisher,
            scope_id,
            claim_id,
            &declaration,
            &body,
            Duration::hours(24),
            state.upload_admission,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(result)).into_response())
}

async fn publish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, publication_id)): Path<(Uuid, Uuid)>,
    body: Bytes,
) -> Result<Response, ApiError> {
    let context = state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let expected_epoch = required_header(&headers, "if-artifact-store-epoch")?
        .parse::<Uuid>()
        .map_err(|_| ApiError::malformed("If-Artifact-Store-Epoch must be a UUID"))?;
    let canonical =
        parse_canonical(&body, true).map_err(|error| ApiError::malformed(error.to_string()))?;
    let submission: PublicationSubmission = serde_json::from_slice(&canonical.canonical_bytes())
        .map_err(|error| ApiError::malformed(error.to_string()))?;
    if submission.intent.scope_id != scope_id || submission.intent.publication_id != publication_id
    {
        return Err(ApiError::malformed(
            "route scope/publication identity differs from the intent",
        ));
    }
    let ids = external_artifact_ids(&submission);
    let existing = store.existing_artifacts(scope_id, ids).await?;
    let prepared = prepare_publication(
        OffsetDateTime::now_utc(),
        context,
        submission,
        &state.catalog,
        &existing,
        &state.limits,
    )
    .map_err(|error| ApiError::from_core(&error))?;
    let result = store
        .publish(
            OffsetDateTime::now_utc(),
            expected_epoch,
            &prepared,
            state.upload_admission,
        )
        .await?;
    let mut response = Json(result.clone()).into_response();
    response.headers_mut().insert(
        "artifact-store-epoch",
        result
            .committed_store_epoch
            .to_string()
            .parse()
            .expect("UUID is a valid header value"),
    );
    Ok(response)
}

async fn get_artifact(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, artifact_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let artifact = store
        .get_artifact(scope_id, artifact_id)
        .await?
        .ok_or_else(ApiError::unavailable)?;
    Ok(Json(artifact).into_response())
}

async fn get_producer_inputs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, artifact_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let inputs = store
        .get_producer_inputs(scope_id, artifact_id)
        .await?
        .ok_or_else(ApiError::unavailable)?;
    Ok(Json(inputs).into_response())
}

async fn get_supporting_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, artifact_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let evidence = store
        .get_supporting_evidence(scope_id, artifact_id)
        .await?
        .ok_or_else(ApiError::unavailable)?;
    Ok(Json(evidence).into_response())
}

async fn get_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, artifact_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let content = store
        .get_content(scope_id, artifact_id)
        .await?
        .ok_or_else(ApiError::unavailable)?;
    let full_length = content.len();
    let range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(|value| parse_byte_range(value, full_length))
        .transpose()?;
    let (status, selected, content_range) = if let Some((start, end_exclusive)) = range {
        (
            StatusCode::PARTIAL_CONTENT,
            content[start..end_exclusive].to_vec(),
            Some(format!("bytes {start}-{}/{full_length}", end_exclusive - 1)),
        )
    } else {
        (StatusCode::OK, content, None)
    };
    let mut response = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CACHE_CONTROL, "private, no-store")
        .header(header::CONTENT_DISPOSITION, "attachment")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, selected.len())
        .body(Body::from(selected))
        .expect("static response headers are valid");
    if let Some(content_range) = content_range {
        response.headers_mut().insert(
            header::CONTENT_RANGE,
            content_range
                .parse()
                .expect("validated byte range is a valid header"),
        );
    }
    Ok(response)
}

async fn head_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, artifact_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let artifact = store
        .get_artifact(scope_id, artifact_id)
        .await?
        .ok_or_else(ApiError::unavailable)?;
    let length = artifact.blob.ok_or_else(ApiError::unavailable)?.length;
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CACHE_CONTROL, "private, no-store")
        .header(header::CONTENT_DISPOSITION, "attachment")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, length)
        .body(Body::empty())
        .expect("static response headers are valid"))
}

fn parse_byte_range(value: &str, length: usize) -> Result<(usize, usize), ApiError> {
    let range = value.strip_prefix("bytes=").ok_or_else(ApiError::range)?;
    if range.contains(',') {
        return Err(ApiError::range());
    }
    let (start, end) = range.split_once('-').ok_or_else(ApiError::range)?;
    let (start, end_exclusive) = if start.is_empty() {
        let suffix = end.parse::<usize>().map_err(|_| ApiError::range())?;
        if suffix == 0 || length == 0 {
            return Err(ApiError::range());
        }
        (length.saturating_sub(suffix), length)
    } else {
        let start = start.parse::<usize>().map_err(|_| ApiError::range())?;
        let end_exclusive = if end.is_empty() {
            length
        } else {
            end.parse::<usize>()
                .map_err(|_| ApiError::range())?
                .checked_add(1)
                .ok_or_else(ApiError::range)?
        };
        (start, end_exclusive.min(length))
    };
    if start >= end_exclusive || start >= length {
        return Err(ApiError::range());
    }
    Ok((start, end_exclusive))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FeedQuery {
    store_epoch: Uuid,
    #[serde(default)]
    after_sequence: i64,
    #[serde(default = "default_feed_limit")]
    limit: u32,
}

const fn default_feed_limit() -> u32 {
    100
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArtifactQuery {
    type_key: String,
    snapshot_sequence: Option<i64>,
    after: Option<Uuid>,
    #[serde(default = "default_feed_limit")]
    limit: u32,
}

async fn query_artifacts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope_id): Path<Uuid>,
    Query(query): Query<ArtifactQuery>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let page = store
        .query_artifacts(
            scope_id,
            &query.type_key,
            query.snapshot_sequence,
            query.after,
            query.limit,
        )
        .await?;
    Ok(Json(page).into_response())
}

async fn read_publication(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope_id, publication_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let publication = store
        .read_publication(scope_id, publication_id)
        .await?
        .ok_or_else(ApiError::unavailable)?;
    Ok(Json(publication).into_response())
}

async fn read_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope_id): Path<Uuid>,
    Query(query): Query<FeedQuery>,
) -> Result<Response, ApiError> {
    state.auth.authorize(&headers, scope_id)?;
    let store = scoped_store(&state, &headers, scope_id).await?;
    let page = store
        .read_feed(
            scope_id,
            query.store_epoch,
            query.after_sequence,
            query.limit,
        )
        .await
        .map_err(|error| match error {
            StoreError::EpochChanged { expected, actual } => ApiError::new(
                StatusCode::CONFLICT,
                ErrorCode::FeedRebootstrapRequired,
                format!("feed epoch {expected} differs from current epoch {actual}"),
            ),
            other => ApiError::from(other),
        })?;
    Ok(Json(page).into_response())
}

async fn scoped_store(
    state: &AppState,
    headers: &HeaderMap,
    scope_id: Uuid,
) -> Result<PostgresStore, ApiError> {
    let store = state.store.resolve(headers).await?;
    if !store.has_scope(scope_id).await? {
        return Err(ApiError::unavailable());
    }
    Ok(store)
}

async fn provision_database(
    State(state): State<ProvisionerState>,
    headers: HeaderMap,
    Path((database, scope_id)): Path<(String, Uuid)>,
) -> Result<StatusCode, ApiError> {
    let expected = format!("Bearer {}", state.bearer_token);
    let supplied = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    if supplied != Some(expected.as_str()) {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            ErrorCode::AuthenticationRequired,
            "a valid provisioning credential is required",
        ));
    }
    validate_tenant_database(&database)?;
    validate_database_scope(&database, scope_id)?;
    let store = PostgresStore::connect(&database_url(&state.cluster_url, &database), 1).await?;
    sqlx::query(
        "INSERT INTO artifact_store.store_state(singleton,store_epoch,write_mode) \
         VALUES(true,$1,'normal') ON CONFLICT(singleton) DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .execute(store.pool())
    .await
    .map_err(StoreError::from)?;
    store.register_types(state.catalog.definitions()).await?;
    store.ensure_scope(scope_id).await?;
    store
        .grant_runtime_role(&artifact_runtime_role(scope_id))
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

fn validate_tenant_database(database: &str) -> Result<(), ApiError> {
    if database.len() > 63
        || !database.starts_with("cust_")
        || !database
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(ApiError::malformed("tenant database identifier is invalid"));
    }
    Ok(())
}

fn validate_database_scope(database: &str, scope_id: Uuid) -> Result<(), ApiError> {
    let expected = format!("cust_{}", scope_id.simple());
    if database != expected {
        return Err(ApiError::malformed(
            "tenant database does not match the environment scope",
        ));
    }
    Ok(())
}

fn artifact_runtime_role(scope_id: Uuid) -> String {
    format!("c_{}_art_api", scope_id.simple())
}

fn tenant_database_url(
    cluster_url: &Url,
    database: &str,
    environment_id: Uuid,
    routing_generation: u64,
    credential_root: &[u8],
) -> Result<String, ApiError> {
    let mut mac = Hmac::<Sha256>::new_from_slice(credential_root)
        .map_err(|_| ApiError::malformed("artifact credential root is invalid"))?;
    mac.update(b"aven/postgres-role/v1\0");
    mac.update(environment_id.to_string().as_bytes());
    mac.update(b"\0");
    mac.update(routing_generation.to_string().as_bytes());
    mac.update(b"\0");
    mac.update(ARTIFACT_ROLE_KIND.as_bytes());
    let password = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    let mut target = cluster_url.clone();
    target
        .set_username(&artifact_runtime_role(environment_id))
        .map_err(|_| ApiError::malformed("artifact runtime role is invalid"))?;
    target
        .set_password(Some(&password))
        .map_err(|_| ApiError::malformed("artifact runtime password is invalid"))?;
    target.set_path(&format!("/{database}"));
    Ok(target.to_string())
}

fn database_url(cluster_url: &Url, database: &str) -> String {
    let mut target = cluster_url.clone();
    target.set_path(&format!("/{database}"));
    target.to_string()
}

fn external_artifact_ids(submission: &PublicationSubmission) -> BTreeSet<Uuid> {
    let mut ids = BTreeSet::new();
    if let PublicationBody::Run { run } = &submission.intent.body {
        ids.extend(run.inputs.iter().map(|input| input.artifact_id));
    }
    for artifact in &submission.intent.artifacts {
        for reference in &artifact.references {
            if let aven_artifact_store_contract::ReferenceTarget::Existing { artifact_id } =
                reference.target
            {
                ids.insert(artifact_id);
            }
        }
    }
    for authority in submission.blob_authorities.values() {
        if let BlobAuthority::SourceArtifact { artifact_id } = authority {
            ids.insert(*artifact_id);
        }
    }
    ids
}

fn required_header<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, ApiError> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::malformed(format!("missing or invalid {name} header")))
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    problem: Problem,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.problem.detail)
    }
}

impl std::error::Error for ApiError {}

impl ApiError {
    fn new(status: StatusCode, code: ErrorCode, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        let mut problem = Problem::new(
            status.as_u16(),
            code,
            status.canonical_reason().unwrap_or("request failed"),
        );
        problem.detail = detail;
        Self { status, problem }
    }

    fn malformed(detail: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, ErrorCode::MalformedRequest, detail)
    }

    fn unavailable() -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            ErrorCode::ResourceUnavailable,
            "resource is unknown or unavailable",
        )
    }

    fn range() -> Self {
        Self::new(
            StatusCode::RANGE_NOT_SATISFIABLE,
            ErrorCode::ContentRangeNotSatisfiable,
            "requested byte range is outside the exact content",
        )
    }

    fn staging_quota() -> Self {
        Self::new(
            StatusCode::TOO_MANY_REQUESTS,
            ErrorCode::StagingQuotaExceeded,
            "upload admission is temporarily exhausted",
        )
    }

    fn limit(detail: impl Into<String>) -> Self {
        Self::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            ErrorCode::LimitExceeded,
            detail,
        )
    }

    fn from_core(error: &aven_artifact_store_core::CoreError) -> Self {
        use aven_artifact_store_core::CoreError;
        match error {
            CoreError::Schema { .. } => Self::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::SchemaValidationFailed,
                error.to_string(),
            ),
            CoreError::ArtifactUnavailable(_) => Self::new(
                StatusCode::CONFLICT,
                ErrorCode::InputUnavailable,
                "input or reference is unavailable",
            ),
            _ => Self::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::MalformedRequest,
                error.to_string(),
            ),
        }
    }
}

impl From<StoreError> for ApiError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::Reconciling => Self::new(
                StatusCode::SERVICE_UNAVAILABLE,
                ErrorCode::StoreReconciliationRequired,
                error.to_string(),
            ),
            StoreError::EpochChanged { .. } => Self::new(
                StatusCode::CONFLICT,
                ErrorCode::StoreEpochChanged,
                error.to_string(),
            ),
            StoreError::PublicationConflict => Self::new(
                StatusCode::CONFLICT,
                ErrorCode::PublicationConflict,
                error.to_string(),
            ),
            StoreError::PublicationDataLost => Self::new(
                StatusCode::GONE,
                ErrorCode::PublicationDataLost,
                error.to_string(),
            ),
            StoreError::UploadConflict => Self::new(
                StatusCode::CONFLICT,
                ErrorCode::UploadConflict,
                error.to_string(),
            ),
            StoreError::UploadExpired => Self::new(
                StatusCode::GONE,
                ErrorCode::UploadExpired,
                error.to_string(),
            ),
            StoreError::UploadDigestMismatch => Self::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::UploadDigestMismatch,
                error.to_string(),
            ),
            StoreError::StagingQuotaExceeded => Self::staging_quota(),
            StoreError::StorageQuotaExceeded => Self::new(
                StatusCode::PAYLOAD_TOO_LARGE,
                ErrorCode::LimitExceeded,
                error.to_string(),
            ),
            StoreError::InputUnavailable => Self::new(
                StatusCode::CONFLICT,
                ErrorCode::InputUnavailable,
                error.to_string(),
            ),
            StoreError::Database(_)
            | StoreError::Migration(_)
            | StoreError::Json(_)
            | StoreError::Integrity(_) => Self::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::IntegrityFailure,
                "the store could not safely complete the operation",
            ),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            [
                (header::CONTENT_TYPE, "application/problem+json"),
                (header::CACHE_CONTROL, "private, no-store"),
                (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            ],
            Json(self.problem),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authenticates_independent_service_publishers() {
        let api = StablePublisher {
            issuer: "api.aven.ceo".to_owned(),
            subject: "service:aven-api".to_owned(),
        };
        let runner = StablePublisher {
            issuer: "os.aven".to_owned(),
            subject: "service:actor-runner".to_owned(),
        };
        let auth = FixedServiceAuth::for_tenants("api-token", api)
            .unwrap()
            .with_credential("runner-token", runner.clone())
            .unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            "Bearer runner-token".parse().unwrap(),
        );

        let context = auth.authorize(&headers, Uuid::nil()).unwrap();

        assert_eq!(context.publisher, runner);
    }

    #[test]
    fn rejects_duplicate_service_credentials() {
        let publisher = StablePublisher {
            issuer: "api.aven.ceo".to_owned(),
            subject: "service:aven-api".to_owned(),
        };
        let result = FixedServiceAuth::for_tenants("same-token", publisher.clone())
            .unwrap()
            .with_credential("same-token", publisher);

        assert!(result.is_err());
    }
}
