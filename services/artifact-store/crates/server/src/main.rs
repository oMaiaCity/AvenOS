use std::env;
use std::net::SocketAddr;

use aven_artifact_store_contract::StablePublisher;
use aven_artifact_store_core::{builtin_type_definitions, TypeCatalog};
use aven_artifact_store_postgres::{PostgresStore, UploadAdmission};
use aven_artifact_store_server::{
    provisioner_router, router, AppState, FixedServiceAuth, ProvisionerState, TenantStoreRegistry,
};
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "aven_artifact_store=info,tower_http=info".into()),
        )
        .init();

    let command = env::args().nth(1).unwrap_or_else(|| "serve".to_owned());
    let catalog = TypeCatalog::from_definitions(builtin_type_definitions()?)?;

    match command.as_str() {
        "migrate" => {
            let database_url = required_env("ARTIFACT_STORE_DATABASE_URL")?;
            let store = PostgresStore::connect(&database_url, 1).await?;
            store.migrate().await?;
            store.register_types(catalog.definitions()).await?;
            if let Ok(scope_id) = env::var("ARTIFACT_STORE_SCOPE_ID") {
                store.ensure_scope(scope_id.parse::<Uuid>()?).await?;
            }
            if let Ok(runtime_role) = env::var("ARTIFACT_STORE_RUNTIME_ROLE") {
                store.grant_runtime_role(&runtime_role).await?;
            }
            tracing::info!("artifact-store schema and built-in types are current");
        }
        "verify" => {
            let database_url = required_env("ARTIFACT_STORE_DATABASE_URL")?;
            let store = PostgresStore::connect(&database_url, 1).await?;
            let context = store.context().await?;
            tracing::info!(
                store_epoch = %context.store_epoch,
                write_mode = %context.write_mode,
                "artifact-store database is reachable"
            );
        }
        "serve" => {
            let database_url = required_env("ARTIFACT_STORE_DATABASE_URL")?;
            let token = required_env("ARTIFACT_STORE_BEARER_TOKEN")?;
            let publisher = StablePublisher {
                issuer: required_env("ARTIFACT_STORE_PUBLISHER_ISSUER")?,
                subject: required_env("ARTIFACT_STORE_PUBLISHER_SUBJECT")?,
            };
            let tenant_mode = env::var("ARTIFACT_STORE_TENANT_MODE").as_deref() == Ok("true");
            let (state, scope_label) = if tenant_mode {
                let max_stores = optional_positive_env("ARTIFACT_STORE_MAX_TENANT_POOLS", 64)?;
                let connections =
                    optional_positive_env("ARTIFACT_STORE_CONNECTIONS_PER_TENANT", 2)?;
                let registry = TenantStoreRegistry::new(
                    &database_url,
                    &required_env("ARTIFACT_STORE_API_DB_CREDENTIAL_ROOT")?,
                    max_stores as usize,
                    connections,
                )?;
                let mut auth = FixedServiceAuth::for_tenants(token, publisher)?;
                if let Ok(actor_token) = env::var("ARTIFACT_STORE_ACTOR_RUNNER_BEARER_TOKEN") {
                    auth = auth.with_credential(
                        actor_token,
                        StablePublisher {
                            issuer: "os.aven".to_owned(),
                            subject: "service:actor-runner".to_owned(),
                        },
                    )?;
                }
                (
                    AppState::for_tenants(registry, catalog, auth),
                    "per-customer".to_owned(),
                )
            } else {
                let scope_id = required_env("ARTIFACT_STORE_SCOPE_ID")?.parse::<Uuid>()?;
                let store = PostgresStore::connect(&database_url, 10).await?;
                let auth = FixedServiceAuth::new(token, publisher, scope_id)?;
                store.ensure_scope(scope_id).await?;
                (AppState::new(store, catalog, auth), scope_id.to_string())
            };
            let state = configure_upload_admission(state)?;
            let address = env::var("ARTIFACT_STORE_LISTEN")
                .unwrap_or_else(|_| "127.0.0.1:8087".to_owned())
                .parse::<SocketAddr>()?;
            let listener = tokio::net::TcpListener::bind(address).await?;
            tracing::info!(%address, scope = %scope_label, "artifact-store listening");
            axum::serve(listener, router(state))
                .with_graceful_shutdown(shutdown_signal())
                .await?;
        }
        "serve-provisioner" => {
            let state = ProvisionerState::new(
                &required_env("ARTIFACT_STORE_PROVISIONER_DATABASE_URL")?,
                required_env("ARTIFACT_STORE_PROVISIONER_BEARER_TOKEN")?,
                catalog,
            )?;
            let address = env::var("ARTIFACT_STORE_PROVISIONER_LISTEN")
                .unwrap_or_else(|_| "127.0.0.1:8088".to_owned())
                .parse::<SocketAddr>()?;
            let listener = tokio::net::TcpListener::bind(address).await?;
            tracing::info!(%address, "artifact-store provisioner listening");
            axum::serve(listener, provisioner_router(state))
                .with_graceful_shutdown(shutdown_signal())
                .await?;
        }
        other => {
            return Err(format!(
                "unknown command {other:?}; expected serve, serve-provisioner, migrate, or verify"
            )
            .into())
        }
    }
    Ok(())
}

fn optional_positive_env(name: &str, default: u32) -> Result<u32, Box<dyn std::error::Error>> {
    let value = match env::var(name) {
        Ok(value) => value.parse::<u32>()?,
        Err(_) => default,
    };
    if value == 0 {
        return Err(format!("environment variable {name} must be positive").into());
    }
    Ok(value)
}

fn configure_upload_admission(state: AppState) -> Result<AppState, Box<dyn std::error::Error>> {
    let max_upload_bytes =
        optional_positive_u64_env("ARTIFACT_STORE_MAX_UPLOAD_BYTES", 25 * 1024 * 1024)?;
    let max_concurrent_uploads = optional_positive_env("ARTIFACT_STORE_MAX_CONCURRENT_UPLOADS", 2)?;
    let max_live_claims = optional_positive_env("ARTIFACT_STORE_MAX_LIVE_CLAIMS_PER_SCOPE", 32)?;
    let max_staged_bytes = optional_positive_u64_env(
        "ARTIFACT_STORE_MAX_STAGED_BYTES_PER_SCOPE",
        100 * 1024 * 1024,
    )?;
    let max_logical_bytes = optional_positive_u64_env(
        "ARTIFACT_STORE_MAX_LOGICAL_BYTES_PER_SCOPE",
        1024 * 1024 * 1024,
    )?;
    if max_upload_bytes > max_staged_bytes || max_upload_bytes > max_logical_bytes {
        return Err(
            "the per-upload limit must not exceed staging or logical storage quotas".into(),
        );
    }
    if max_concurrent_uploads > 64 {
        return Err("ARTIFACT_STORE_MAX_CONCURRENT_UPLOADS must not exceed 64".into());
    }
    Ok(state.with_upload_admission(
        usize::try_from(max_upload_bytes)?,
        usize::try_from(max_concurrent_uploads)?,
        UploadAdmission {
            max_live_claims_per_scope: i64::from(max_live_claims),
            max_staged_bytes_per_scope: i64::try_from(max_staged_bytes)?,
            max_logical_bytes_per_scope: i64::try_from(max_logical_bytes)?,
        },
    ))
}

fn optional_positive_u64_env(name: &str, default: u64) -> Result<u64, Box<dyn std::error::Error>> {
    let value = match env::var(name) {
        Ok(value) => value.parse::<u64>()?,
        Err(_) => default,
    };
    if value == 0 {
        return Err(format!("environment variable {name} must be positive").into());
    }
    Ok(value)
}

fn required_env(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    env::var(name).map_err(|_| format!("required environment variable {name} is missing").into())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
