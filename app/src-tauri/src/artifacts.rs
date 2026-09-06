use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::Emitter;

use crate::auth::{api_endpoint, service_access_token, session_token, AuthState};

const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;
const HASH_BUFFER_BYTES: usize = 256 * 1024;
const MODEL_REQUEST_TIMEOUT_SECONDS: u64 = 920;

#[derive(Default)]
pub struct LlmStreamState {
    requests: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadProgress {
    upload_id: String,
    phase: &'static str,
    sent: u64,
    total: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedArtifact {
    publication_id: String,
    intent_id: String,
    intent_declaration_artifact_id: String,
    artifact_id: String,
    original_name: String,
    media_type: String,
    sha256: String,
    length: u64,
    scope_sequence: u64,
    replayed: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactProcessingWarning {
    code: String,
    message: String,
    retryable: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactProcessingStage {
    key: String,
    state: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    depends_on: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    procedure_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    attempt_count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    terminal_code: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedArtifact {
    artifact_id: String,
    type_key: String,
    type_version: i32,
    stage_key: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactProcessingState {
    Active,
    Succeeded,
    NeedsReview,
    Failed,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactProcessingPresentation {
    case_id: String,
    state: ArtifactProcessingState,
    projection_version: String,
    preferred_type: String,
    label: String,
    summary: Option<String>,
    metadata: serde_json::Map<String, serde_json::Value>,
    warnings: Vec<ArtifactProcessingWarning>,
    stages: Vec<ArtifactProcessingStage>,
    derived_artifacts: Vec<DerivedArtifact>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactProcessingLookup {
    pending: bool,
    presentation: Option<ArtifactProcessingPresentation>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactContent {
    media_type: String,
    base64: String,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    message: Option<String>,
}

fn emit_progress(
    app: &tauri::AppHandle,
    upload_id: &str,
    phase: &'static str,
    sent: u64,
    total: u64,
) {
    let _ = app.emit(
        "artifact-upload-progress",
        UploadProgress {
            upload_id: upload_id.to_string(),
            phase,
            sent,
            total,
        },
    );
}

fn hash_file(path: &Path) -> Result<String, String> {
    let file =
        File::open(path).map_err(|error| format!("Could not open the dropped file: {error}"))?;
    let mut reader = BufReader::new(file);
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; HASH_BUFFER_BYTES];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Could not read the dropped file: {error}"))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

struct ProgressReader {
    file: File,
    app: tauri::AppHandle,
    upload_id: String,
    total: u64,
    sent: u64,
    last_percentage: u64,
}

impl Read for ProgressReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let read = self.file.read(buffer)?;
        self.sent += read as u64;
        let percentage = if self.total == 0 {
            100
        } else {
            self.sent.saturating_mul(100) / self.total
        };
        if percentage != self.last_percentage || self.sent == self.total {
            self.last_percentage = percentage;
            emit_progress(
                &self.app,
                &self.upload_id,
                if self.sent == self.total {
                    "finalizing"
                } else {
                    "uploading"
                },
                self.sent,
                self.total,
            );
        }
        Ok(read)
    }
}

fn response_error(response: ureq::Response, fallback: &str) -> String {
    response
        .into_string()
        .ok()
        .and_then(|body| serde_json::from_str::<ApiErrorBody>(&body).ok())
        .and_then(|body| body.message)
        .unwrap_or_else(|| fallback.to_string())
}

fn valid_artifact_id(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

fn processing_status(
    session: String,
    artifact_id: String,
) -> Result<ArtifactProcessingLookup, String> {
    if !valid_artifact_id(&artifact_id) {
        return Err("The artifact ID is invalid.".to_string());
    }
    let path = format!("/api/artifacts/{artifact_id}/processing");
    let (token, path) = customer_access(&session, ARTIFACT_COMPONENT, "artifacts", &path)?;
    let result = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .build()
        .get(&api_endpoint(&path))
        .set("authorization", &format!("Bearer {token}"))
        .call();
    let response = match result {
        Ok(response) => response,
        Err(ureq::Error::Status(404, _)) => {
            return Ok(ArtifactProcessingLookup {
                pending: true,
                presentation: None,
            });
        }
        Err(ureq::Error::Status(_, response)) => {
            return Err(response_error(
                response,
                "Artifact processing status is unavailable.",
            ));
        }
        Err(ureq::Error::Transport(error)) => {
            return Err(format!("Aven API unavailable: {error}"));
        }
    };
    let body = response
        .into_string()
        .map_err(|error| format!("Could not read artifact processing status: {error}"))?;
    let presentation = serde_json::from_str(&body)
        .map_err(|error| format!("Invalid artifact processing status: {error}"))?;
    Ok(ArtifactProcessingLookup {
        pending: false,
        presentation: Some(presentation),
    })
}

const INTENT_COMPONENT: &str = "ceo.aven:component:data:intents@1";
const ARTIFACT_COMPONENT: &str = "ceo.aven:component:data:artifacts@1";
const ACTOR_RUN_COMPONENT: &str = "os.aven:component:actors:run-repository@1";

fn customer_path(environment_id: &str, segment: &str, path: &str) -> Result<String, String> {
    let suffix = path
        .strip_prefix(&format!("/api/{segment}"))
        .ok_or_else(|| "The customer service path is invalid.".to_string())?;
    Ok(format!(
        "/api/environments/{environment_id}/{segment}{suffix}"
    ))
}

fn customer_access(
    session: &str,
    component_ref: &str,
    segment: &str,
    path: &str,
) -> Result<(String, String), String> {
    let token = service_access_token(session)?;
    let environments = api_json_with_timeout(
        token.clone(),
        "GET",
        "/api/environments".into(),
        None,
        Duration::from_secs(20),
    )?;
    let environments: CustomerEnvironments = serde_json::from_value(environments)
        .map_err(|error| format!("Invalid customer environment list: {error}"))?;
    let configured = option_env!("AVEN_ENVIRONMENT_ID");
    let eligible: Vec<&CustomerEnvironment> = environments
        .environments
        .iter()
        .filter(|environment| {
            environment.observed_state == "ready"
                && environment.components.iter().any(|component| {
                    component.component_ref == component_ref && component.observed_state == "ready"
                })
                && configured.is_none_or(|id| environment.id == id)
        })
        .collect();
    let environment = match eligible.as_slice() {
        [environment] => *environment,
        [] => {
            return Err(format!(
                "No ready customer environment with {segment} is available."
            ))
        }
        _ => {
            return Err(format!(
                "More than one customer environment provides {segment}; select one explicitly."
            ))
        }
    };
    Ok((token, customer_path(&environment.id, segment, path)?))
}

fn customer_json(
    session: String,
    component_ref: &str,
    segment: &str,
    method: &str,
    path: String,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    let (token, path) = customer_access(&session, component_ref, segment, &path)?;
    api_json_with_timeout(token, method, path, body, Duration::from_secs(20))
}

fn intent_json(
    session: String,
    method: &str,
    path: String,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    customer_json(session, INTENT_COMPONENT, "intents", method, path, body)
}

#[tauri::command]
pub async fn actor_run_start(
    command: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    let token = session_token(&state)?;
    let body = serde_json::to_string(&command)
        .map_err(|error| format!("Invalid Actor Runner command: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        customer_json(
            token,
            ACTOR_RUN_COMPONENT,
            "actor-runs",
            "POST",
            "/api/actor-runs".into(),
            Some(body),
        )
    })
    .await
    .map_err(|error| format!("Actor Runner start task failed: {error}"))?
}

#[tauri::command]
pub async fn actor_run_status(
    run_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&run_id) {
        return Err("The Actor Runner run ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        customer_json(
            token,
            ACTOR_RUN_COMPONENT,
            "actor-runs",
            "GET",
            format!("/api/actor-runs/{run_id}"),
            None,
        )
    })
    .await
    .map_err(|error| format!("Actor Runner status task failed: {error}"))?
}

fn artifact_json(
    session: String,
    method: &str,
    path: String,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    customer_json(session, ARTIFACT_COMPONENT, "artifacts", method, path, body)
}

fn service_json(
    session: String,
    method: &str,
    path: String,
    body: Option<String>,
    timeout: Duration,
) -> Result<serde_json::Value, String> {
    api_json_with_timeout(service_access_token(&session)?, method, path, body, timeout)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomerEnvironment {
    id: String,
    observed_state: String,
    components: Vec<CustomerComponent>,
}

#[derive(Deserialize)]
struct CustomerEnvironments {
    environments: Vec<CustomerEnvironment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomerComponent {
    component_ref: String,
    observed_state: String,
}

fn api_json_with_timeout(
    token: String,
    method: &str,
    path: String,
    body: Option<String>,
    timeout: Duration,
) -> Result<serde_json::Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(timeout).build();
    let url = api_endpoint(&path);
    let request = match method {
        "GET" => agent.get(&url),
        "POST" => agent
            .post(&url)
            .set("content-type", "application/json")
            .set("origin", &api_endpoint("")),
        "PATCH" => agent
            .patch(&url)
            .set("content-type", "application/json")
            .set("origin", &api_endpoint("")),
        "DELETE" => agent
            .delete(&url)
            .set("content-type", "application/json")
            .set("origin", &api_endpoint("")),
        _ => return Err("Unsupported intent request method.".to_string()),
    }
    .set("authorization", &format!("Bearer {token}"));
    let result = match body {
        Some(body) => request.send_string(&body),
        None => request.call(),
    };
    let response = result.map_err(|error| match error {
        ureq::Error::Status(_, response) => {
            response_error(response, "The intent request was rejected.")
        }
        ureq::Error::Transport(error) => format!("Aven API unavailable: {error}"),
    })?;
    if response.status() == 204 {
        return Ok(serde_json::Value::Null);
    }
    let body = response
        .into_string()
        .map_err(|error| format!("Could not read intent state: {error}"))?;
    serde_json::from_str(&body).map_err(|error| format!("Invalid intent state: {error}"))
}

fn artifact_content(session: String, artifact_id: String) -> Result<ArtifactContent, String> {
    let path = format!("/api/artifacts/{artifact_id}/content");
    let (token, path) = customer_access(&session, ARTIFACT_COMPONENT, "artifacts", &path)?;
    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(120))
        .build()
        .get(&api_endpoint(&path))
        .set("authorization", &format!("Bearer {token}"))
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(_, response) => {
                response_error(response, "Artifact content is unavailable.")
            }
            ureq::Error::Transport(error) => format!("Aven API unavailable: {error}"),
        })?;
    let media_type = response
        .header("content-type")
        .unwrap_or("application/octet-stream")
        .to_string();
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read artifact content: {error}"))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Artifact content exceeds the desktop preview limit.".to_string());
    }
    Ok(ArtifactContent {
        media_type,
        base64: STANDARD.encode(bytes),
    })
}

fn upload(
    app: tauri::AppHandle,
    upload_id: String,
    publication_id: String,
    intent_id: String,
    observed_at: String,
    execution_environment: String,
    path: PathBuf,
    session: String,
) -> Result<UploadedArtifact, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("Could not inspect the dropped file: {error}"))?;
    if !metadata.is_file() {
        return Err("Only one regular file can be uploaded at a time.".to_string());
    }
    let length = metadata.len();
    if length > MAX_FILE_BYTES {
        return Err("Files may not exceed 25 MiB.".to_string());
    }
    let original_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "The dropped file has no valid UTF-8 filename.".to_string())?
        .to_string();
    if original_name.len() > 512 {
        return Err("The dropped filename is longer than 512 bytes.".to_string());
    }
    let media_type = mime_guess::from_path(&path)
        .first_raw()
        .unwrap_or("application/octet-stream")
        .to_string();

    emit_progress(&app, &upload_id, "preparing", 0, length);
    let sha256 = hash_file(&path)?;
    let file = File::open(&path)
        .map_err(|error| format!("Could not reopen the dropped file for upload: {error}"))?;
    if file
        .metadata()
        .map_err(|error| format!("Could not recheck the dropped file: {error}"))?
        .len()
        != length
    {
        return Err("The dropped file changed while it was being prepared.".to_string());
    }
    emit_progress(&app, &upload_id, "uploading", 0, length);
    if length == 0 {
        emit_progress(&app, &upload_id, "finalizing", 0, 0);
    }

    let encoded_name = URL_SAFE_NO_PAD.encode(original_name.as_bytes());
    let reader = ProgressReader {
        file,
        app,
        upload_id,
        total: length,
        sent: 0,
        last_percentage: 0,
    };
    let path = format!("/api/artifacts/files/{publication_id}");
    let (token, path) = customer_access(&session, ARTIFACT_COMPONENT, "artifacts", &path)?;
    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(600))
        .build()
        .put(&api_endpoint(&path))
        // SvelteKit rejects safelisted content types such as text/plain on state-
        // changing requests without a same-origin marker. Native HTTP has no
        // browser-generated Origin header, so provide the API's own origin here.
        .set("origin", &api_endpoint(""))
        .set("authorization", &format!("Bearer {token}"))
        .set("content-type", &media_type)
        .set("content-length", &length.to_string())
        .set("x-expected-sha256", &sha256)
        .set("x-aven-original-name", &encoded_name)
        .set("x-aven-intent-id", &intent_id)
        .set("x-aven-observed-at", &observed_at)
        .set("x-aven-source-kind", "client-actor-ingest")
        .set("x-aven-execution-environment", &execution_environment)
        .send(reader)
        .map_err(|error| match error {
            ureq::Error::Status(_, response) => {
                response_error(response, "The artifact upload was rejected.")
            }
            ureq::Error::Transport(error) => format!("Aven API unavailable: {error}"),
        })?;
    let body = response
        .into_string()
        .map_err(|error| format!("Could not read the artifact receipt: {error}"))?;
    serde_json::from_str(&body).map_err(|error| format!("Invalid artifact receipt: {error}"))
}

#[tauri::command]
pub async fn artifact_upload(
    upload_id: String,
    publication_id: String,
    intent_id: String,
    observed_at: String,
    execution_environment: String,
    path: PathBuf,
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
) -> Result<UploadedArtifact, String> {
    if execution_environment != "local" && execution_environment != "server" {
        return Err("Execution environment must be local or server.".to_string());
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let first = upload(
            app.clone(),
            upload_id.clone(),
            publication_id.clone(),
            intent_id.clone(),
            observed_at.clone(),
            execution_environment.clone(),
            path.clone(),
            token.clone(),
        );
        if first
            .as_ref()
            .is_err_and(|error| error.starts_with("Aven API unavailable:"))
        {
            upload(
                app,
                upload_id,
                publication_id,
                intent_id,
                observed_at,
                execution_environment,
                path,
                token,
            )
        } else {
            first
        }
    })
    .await
    .map_err(|error| format!("Artifact upload task failed: {error}"))?
}

#[tauri::command]
pub async fn artifact_processing_status(
    artifact_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<ArtifactProcessingLookup, String> {
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || processing_status(token, artifact_id))
        .await
        .map_err(|error| format!("Artifact processing status task failed: {error}"))?
}

/// Lists public model descriptors matching every requested capability. Provider
/// coordinates and credentials remain server-side.
#[tauri::command]
pub async fn llm_model_list(
    capabilities: Vec<String>,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if capabilities.len() > 16
        || capabilities.iter().any(|capability| {
            capability.is_empty()
                || capability.len() > 64
                || !capability.bytes().all(|byte| {
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || b".-".contains(&byte)
                })
                || !capability
                    .as_bytes()
                    .first()
                    .is_some_and(u8::is_ascii_lowercase)
        })
    {
        return Err("An LLM capability is invalid.".to_string());
    }
    let query = capabilities
        .iter()
        .map(|capability| format!("capability={capability}"))
        .collect::<Vec<_>>()
        .join("&");
    let path = if query.is_empty() {
        "/api/llm/models".to_string()
    } else {
        format!("/api/llm/models?{query}")
    };
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        service_json(token, "GET", path, None, Duration::from_secs(20))
    })
    .await
    .map_err(|error| format!("LLM model discovery task failed: {error}"))?
}

/// Executes one request against the exact model id selected by the client.
#[tauri::command]
pub async fn llm_complete(
    request: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    let token = session_token(&state)?;
    let body =
        serde_json::to_string(&request).map_err(|error| format!("Invalid LLM request: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        service_json(
            token,
            "POST",
            "/api/llm/completions".into(),
            Some(body),
            Duration::from_secs(MODEL_REQUEST_TIMEOUT_SECONDS),
        )
    })
    .await
    .map_err(|error| format!("LLM completion task failed: {error}"))?
}

/// Executes one non-streaming OpenAI-compatible chat completion. The public
/// model id is resolved by Aven API; provider coordinates stay server-side.
#[tauri::command]
pub async fn llm_openai_complete(
    request: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    let token = session_token(&state)?;
    let body = serde_json::to_string(&request)
        .map_err(|error| format!("Invalid OpenAI-compatible LLM request: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        service_json(
            token,
            "POST",
            "/api/llm/v1/chat/completions".into(),
            Some(body),
            Duration::from_secs(MODEL_REQUEST_TIMEOUT_SECONDS),
        )
    })
    .await
    .map_err(|error| format!("OpenAI-compatible LLM completion task failed: {error}"))?
}

fn valid_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
}

/// Streams raw OpenAI-compatible SSE lines over a Tauri channel. The command
/// promise settles when the stream ends; channel messages arrive meanwhile.
#[tauri::command]
pub async fn llm_openai_stream(
    request_id: String,
    request: serde_json::Value,
    on_chunk: tauri::ipc::Channel<String>,
    auth: tauri::State<'_, AuthState>,
    streams: tauri::State<'_, LlmStreamState>,
) -> Result<(), String> {
    if !valid_request_id(&request_id) {
        return Err("The LLM stream request ID is invalid.".to_string());
    }
    let token = service_access_token(&session_token(&auth)?)?;
    let mut request = request;
    let object = request
        .as_object_mut()
        .ok_or_else(|| "The OpenAI-compatible LLM request must be an object.".to_string())?;
    object.insert("stream".to_string(), serde_json::Value::Bool(true));
    let body = serde_json::to_string(&request)
        .map_err(|error| format!("Invalid OpenAI-compatible LLM request: {error}"))?;
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut requests = streams
            .requests
            .lock()
            .map_err(|_| "The LLM stream registry is unavailable.".to_string())?;
        if requests.contains_key(&request_id) {
            return Err("The LLM stream request ID is already active.".to_string());
        }
        requests.insert(request_id.clone(), cancelled.clone());
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(MODEL_REQUEST_TIMEOUT_SECONDS))
            .build();
        let response = agent
            .post(&api_endpoint("/api/llm/v1/chat/completions"))
            .set("authorization", &format!("Bearer {token}"))
            .set("content-type", "application/json")
            .set("origin", &api_endpoint(""))
            .send_string(&body)
            .map_err(|error| match error {
                ureq::Error::Status(_, response) => {
                    response_error(response, "The LLM stream request was rejected.")
                }
                ureq::Error::Transport(error) => format!("Aven API unavailable: {error}"),
            })?;
        let mut reader = BufReader::new(response.into_reader());
        loop {
            if cancelled.load(Ordering::Relaxed) {
                break;
            }
            let mut line = String::new();
            let count = reader
                .read_line(&mut line)
                .map_err(|error| format!("Could not read the LLM stream: {error}"))?;
            if count == 0 {
                break;
            }
            on_chunk
                .send(line)
                .map_err(|error| format!("Could not deliver the LLM stream: {error}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("LLM stream task failed: {error}"));

    if let Ok(mut requests) = streams.requests.lock() {
        requests.remove(&request_id);
    }
    result?
}

#[tauri::command]
pub fn llm_openai_stream_cancel(
    request_id: String,
    streams: tauri::State<'_, LlmStreamState>,
) -> Result<bool, String> {
    if !valid_request_id(&request_id) {
        return Err("The LLM stream request ID is invalid.".to_string());
    }
    let requests = streams
        .requests
        .lock()
        .map_err(|_| "The LLM stream registry is unavailable.".to_string())?;
    let Some(cancelled) = requests.get(&request_id) else {
        return Ok(false);
    };
    cancelled.store(true, Ordering::Relaxed);
    Ok(true)
}

#[tauri::command]
pub async fn artifact_query(
    type_key: String,
    snapshot_sequence: Option<u64>,
    after: Option<String>,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if type_key.is_empty()
        || type_key.len() > 128
        || !type_key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err("The artifact type is invalid.".into());
    }
    if after.as_ref().is_some_and(|id| !valid_artifact_id(id)) {
        return Err("The artifact cursor is invalid.".into());
    }
    let mut path = format!("/api/artifacts/query?typeKey={type_key}");
    if let Some(snapshot) = snapshot_sequence {
        path.push_str(&format!("&snapshotSequence={snapshot}"));
    }
    if let Some(cursor) = after {
        path.push_str(&format!("&after={cursor}"));
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || artifact_json(token, "GET", path, None))
        .await
        .map_err(|error| format!("Artifact query task failed: {error}"))?
}

#[tauri::command]
pub async fn artifact_client_run_get(
    publication_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&publication_id) {
        return Err("The publication ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        artifact_json(
            token,
            "GET",
            format!("/api/artifacts/client-runs/{publication_id}"),
            None,
        )
    })
    .await
    .map_err(|error| format!("Client actor lookup task failed: {error}"))?
}

#[tauri::command]
pub async fn artifact_client_run_publish(
    publication_id: String,
    run: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&publication_id) {
        return Err("The publication ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    let body = serde_json::to_string(&run)
        .map_err(|error| format!("Invalid client actor run: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        artifact_json(
            token,
            "POST",
            format!("/api/artifacts/client-runs/{publication_id}"),
            Some(body),
        )
    })
    .await
    .map_err(|error| format!("Client actor publication task failed: {error}"))?
}

#[tauri::command]
pub async fn intent_list(state: tauri::State<'_, AuthState>) -> Result<serde_json::Value, String> {
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        intent_json(token, "GET", "/api/intents".into(), None)
    })
    .await
    .map_err(|error| format!("Intent list task failed: {error}"))?
}

#[tauri::command]
pub async fn intent_get(
    intent_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&intent_id) {
        return Err("The intent ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        intent_json(token, "GET", format!("/api/intents/{intent_id}"), None)
    })
    .await
    .map_err(|error| format!("Intent detail task failed: {error}"))?
}

#[tauri::command]
pub async fn intent_append_contribution(
    intent_id: String,
    contribution: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&intent_id) {
        return Err("The intent ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    let body = serde_json::to_string(&contribution)
        .map_err(|error| format!("Invalid contribution: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        intent_json(
            token,
            "POST",
            format!("/api/intents/{intent_id}"),
            Some(body),
        )
    })
    .await
    .map_err(|error| format!("Intent contribution task failed: {error}"))?
}

#[tauri::command]
pub async fn intent_create(
    intent: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    let token = session_token(&state)?;
    let body =
        serde_json::to_string(&intent).map_err(|error| format!("Invalid intent: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        intent_json(token, "POST", "/api/intents".into(), Some(body))
    })
    .await
    .map_err(|error| format!("Intent creation task failed: {error}"))?
}

#[tauri::command]
pub async fn intent_update(
    intent_id: String,
    update: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    intent_command(intent_id, "PATCH", None, update, &state).await
}

#[tauri::command]
pub async fn intent_lifecycle(
    intent_id: String,
    action: String,
    command: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !matches!(action.as_str(), "archive" | "restore" | "merge") {
        return Err("The intent action is invalid.".to_string());
    }
    intent_command(intent_id, "POST", Some(action), command, &state).await
}

#[tauri::command]
pub async fn intent_delete(
    intent_id: String,
    command: serde_json::Value,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    intent_command(intent_id, "DELETE", None, command, &state).await
}

async fn intent_command(
    intent_id: String,
    method: &'static str,
    action: Option<String>,
    command: serde_json::Value,
    state: &tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&intent_id) {
        return Err("The intent ID is invalid.".to_string());
    }
    let token = session_token(state)?;
    let body = serde_json::to_string(&command)
        .map_err(|error| format!("Invalid intent command: {error}"))?;
    let suffix = action.map_or_else(String::new, |value| format!("/{value}"));
    tauri::async_runtime::spawn_blocking(move || {
        intent_json(
            token,
            method,
            format!("/api/intents/{intent_id}{suffix}"),
            Some(body),
        )
    })
    .await
    .map_err(|error| format!("Intent command task failed: {error}"))?
}

#[tauri::command]
pub async fn artifact_content_get(
    artifact_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<ArtifactContent, String> {
    if !valid_artifact_id(&artifact_id) {
        return Err("The artifact ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || artifact_content(token, artifact_id))
        .await
        .map_err(|error| format!("Artifact content task failed: {error}"))?
}

#[tauri::command]
pub async fn artifact_get(
    artifact_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&artifact_id) {
        return Err("The artifact ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        artifact_json(token, "GET", format!("/api/artifacts/{artifact_id}"), None)
    })
    .await
    .map_err(|error| format!("Artifact lookup task failed: {error}"))?
}

#[tauri::command]
pub async fn artifact_evidence_get(
    artifact_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    if !valid_artifact_id(&artifact_id) {
        return Err("The artifact ID is invalid.".to_string());
    }
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        artifact_json(
            token,
            "GET",
            format!("/api/artifacts/{artifact_id}/evidence"),
            None,
        )
    })
    .await
    .map_err(|error| format!("Artifact evidence task failed: {error}"))?
}

#[tauri::command]
pub async fn artifact_store_list(
    state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
    let token = session_token(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        artifact_json(token, "GET", "/api/artifacts".into(), None)
    })
    .await
    .map_err(|error| format!("Artifact list task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_streamed_and_exact() {
        let path = std::env::temp_dir().join(format!(
            "aven-artifact-hash-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ));
        std::fs::write(&path, b"hello").unwrap();
        let digest = hash_file(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(
            digest,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn artifact_ids_are_restricted_to_one_uuid_path_segment() {
        assert!(valid_artifact_id("ce31a00e-5f10-4707-ac07-e3b0cbd43ba4"));
        assert!(valid_artifact_id("CE31A00E-5F10-4707-AC07-E3B0CBD43BA4"));
        assert!(!valid_artifact_id("../../api/auth/get-session"));
        assert!(!valid_artifact_id("ce31a00e5f104707ac07e3b0cbd43ba4"));
    }

    #[test]
    fn intent_paths_use_the_registered_customer_segment() {
        let environment_id = "b6089687-3bc0-4bcc-bf00-76c861848764";
        assert_eq!(
            customer_path(environment_id, "intents", "/api/intents").unwrap(),
            "/api/environments/b6089687-3bc0-4bcc-bf00-76c861848764/intents"
        );
        assert_eq!(
            customer_path(
                environment_id,
                "intents",
                "/api/intents/ce31a00e-5f10-4707-ac07-e3b0cbd43ba4"
            )
            .unwrap(),
            "/api/environments/b6089687-3bc0-4bcc-bf00-76c861848764/intents/ce31a00e-5f10-4707-ac07-e3b0cbd43ba4"
        );
        assert!(customer_path(environment_id, "intents", "/api/artifacts").is_err());
        assert_eq!(
            customer_path(environment_id, "artifacts", "/api/artifacts/files/one").unwrap(),
            "/api/environments/b6089687-3bc0-4bcc-bf00-76c861848764/artifacts/files/one"
        );
    }

    #[test]
    fn processing_stage_keeps_runtime_graph_metadata() {
        let stage: ArtifactProcessingStage = serde_json::from_value(serde_json::json!({
            "key": "decompose-pages",
            "state": "running",
            "dependsOn": ["inspect"],
            "procedureKey": "docs.decompose-pages",
            "attemptCount": 2,
            "terminalCode": null
        }))
        .unwrap();
        let encoded = serde_json::to_value(stage).unwrap();
        assert_eq!(encoded["dependsOn"][0], "inspect");
        assert_eq!(encoded["procedureKey"], "docs.decompose-pages");
        assert_eq!(encoded["attemptCount"], 2);
    }
}
