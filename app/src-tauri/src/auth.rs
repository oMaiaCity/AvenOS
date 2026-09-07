use base64::{
	engine::general_purpose::URL_SAFE_NO_PAD,
	Engine as _,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read as _;
use std::net::{SocketAddr, ToSocketAddrs as _};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const DEVICE_CLIENT_ID: &str = "ceo.aven.os";
const DEVICE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";
const PASSKEY_RP_ID: &str = match option_env!("AVEN_PASSKEY_RP_ID") {
	Some(rp_id) => rp_id,
	None => "aven.id",
};
const PASSKEY_ORIGIN: &str = match option_env!("AVEN_PASSKEY_ORIGIN") {
	Some(origin) => origin,
	None => "https://aven.id",
};
const IDENTITY_BASE_URL: &str = match option_env!("AVEN_IDENTITY_BASE_URL") {
	Some(url) => url,
	None => "https://aven.id",
};
const API_BASE_URL: &str = match option_env!("AVEN_API_BASE_URL") {
	Some(url) => url,
	None => "https://api.aven.ceo",
};

#[derive(Default)]
pub struct AuthState(Mutex<AuthInner>);

#[derive(Default)]
struct AuthInner {
	pending: Option<PendingAuthorization>,
	pending_passkey: Option<PendingPasskeyAuthentication>,
	session: Option<NativeSession>,
}

#[derive(Clone)]
struct PendingAuthorization {
	device_code: String,
	verification_uri_complete: String,
	user_code: String,
	expires_at: Instant,
	interval_seconds: u64,
}

struct PendingPasskeyAuthentication {
	cookie: String,
	expires_at: Instant,
}

struct NativeSession {
	token: String,
	user: AuthUser,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
	id: String,
	name: String,
	email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
	authenticated: bool,
	user: Option<AuthUser>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginAuthorization {
	verification_uri_complete: String,
	user_code: String,
	expires_in: u64,
	interval: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollAuthorization {
	status: &'static str,
	user: Option<AuthUser>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginPasskeyAuthentication {
	available: bool,
	command: String,
	rp_id: String,
	challenge: Vec<u8>,
}

#[derive(Deserialize)]
pub struct NativePasskeyAssertion {
	id: String,
	raw_id: String,
	client_data_json: String,
	authenticator_data: String,
	signature: String,
	user_handle: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PasskeyAuthenticationOptions {
	challenge: String,
	rp_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProofOfWorkChallenge {
	id: String,
	nonce: String,
	purpose: String,
	difficulty_bits: u32,
	expires_at: u64,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
	device_code: String,
	verification_uri_complete: String,
	user_code: String,
	expires_in: u64,
	interval: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
	access_token: String,
	token_type: String,
}

#[derive(Deserialize)]
struct ServiceTokenResponse {
	token: String,
}

#[derive(Deserialize)]
struct SessionResponse {
	user: AuthUser,
}

/// `/api/names/mine` returns the rows themselves, not bare strings — the extra
/// columns are ignored here, the settings pane only shows which name it is.
#[derive(Deserialize)]
struct NamesResponse {
	names: Vec<OwnedName>,
}

#[derive(Deserialize)]
struct OwnedName {
	name: String,
}

#[derive(Deserialize)]
struct ErrorResponse {
	error: Option<String>,
	code: Option<String>,
	error_description: Option<String>,
	message: Option<String>,
}

enum TokenExchange {
	Pending,
	Authenticated { token: String, user: AuthUser },
}

fn endpoint(path: &str) -> String {
	format!("{}/api/auth{path}", IDENTITY_BASE_URL.trim_end_matches('/'))
}

fn identity_endpoint(path: &str) -> String {
	format!("{}{path}", IDENTITY_BASE_URL.trim_end_matches('/'))
}

pub(crate) fn api_endpoint(path: &str) -> String {
	format!("{}{path}", API_BASE_URL.trim_end_matches('/'))
}

#[cfg(target_os = "macos")]
fn macos_supports_native_passkeys() -> bool {
	std::process::Command::new("/usr/bin/sw_vers")
		.arg("-productVersion")
		.output()
		.ok()
		.filter(|output| output.status.success())
		.and_then(|output| String::from_utf8(output.stdout).ok())
		.and_then(|version| version.split('.').next()?.parse::<u32>().ok())
		.is_some_and(|major| major >= 15)
}

/// AuthenticationServices refuses to run for a process without an
/// `application-identifier` entitlement — it fails with "The calling process
/// does not have an application identifier", which the passkey plugin reports
/// as a bare "Login failed". `tauri dev` runs an ad-hoc, linker-signed binary
/// with no team and no entitlements, so this is never satisfied in dev.
///
/// Ask the running process's own code signature, via the same Security
/// framework AuthenticationServices consults. Two tempting shortcuts are both
/// wrong: shelling out to `codesign` can be blocked by the App Sandbox, and
/// looking for `Contents/embedded.provisionprofile` fails on exactly the
/// builds that matter — Apple strips the profile from App Store and TestFlight
/// copies while keeping the entitlements in the signature, so a perfectly
/// entitled build would be pushed onto the browser fallback.
#[cfg(target_os = "macos")]
fn has_application_identifier() -> bool {
	use core_foundation::base::{CFType, CFTypeRef, TCFType};
	use core_foundation::string::{CFString, CFStringRef};
	use std::ffi::c_void;

	type SecTaskRef = *mut c_void;

	#[link(name = "Security", kind = "framework")]
	unsafe extern "C" {
		fn SecTaskCreateFromSelf(allocator: CFTypeRef) -> SecTaskRef;
		fn SecTaskCopyValueForEntitlement(
			task: SecTaskRef,
			entitlement: CFStringRef,
			error: *mut CFTypeRef,
		) -> CFTypeRef;
	}

	unsafe {
		let task = SecTaskCreateFromSelf(std::ptr::null());
		if task.is_null() {
			return false;
		}
		// Owns the task: released when this wrapper drops.
		let _task = CFType::wrap_under_create_rule(task as CFTypeRef);
		let key = CFString::new("com.apple.application-identifier");
		let mut error: CFTypeRef = std::ptr::null();
		let value = SecTaskCopyValueForEntitlement(task, key.as_concrete_TypeRef(), &mut error);
		if !error.is_null() {
			let _error = CFType::wrap_under_create_rule(error);
		}
		if value.is_null() {
			return false;
		}
		let _value = CFType::wrap_under_create_rule(value);
		true
	}
}

#[cfg(target_os = "macos")]
fn native_passkeys_available() -> bool {
	macos_supports_native_passkeys() && has_application_identifier()
}

#[cfg(target_os = "ios")]
fn native_passkeys_available() -> bool {
	true
}

#[cfg(target_os = "android")]
fn native_passkeys_available() -> bool {
	true
}

#[cfg(not(any(target_os = "android", target_os = "ios", target_os = "macos")))]
fn native_passkeys_available() -> bool {
	false
}

/// How long ONE address may take to connect before the next is tried. ureq
/// halves this when several addresses are known, so even a completely dead
/// address family costs at most half of it — well inside the overall timeout.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(6);

/// How long the reachability race may take before we give up and hand ureq
/// the addresses in the order the resolver produced them. Short on purpose:
/// this runs before the real request, and a healthy path answers in
/// milliseconds on any network worth using.
const PROBE_TIMEOUT: Duration = Duration::from_millis(400);

/// How long a winning order stays good. Long enough that the device-code
/// poll (every few seconds) races once rather than every time, short enough
/// that walking from Wi-Fi to cellular re-decides on its own.
const PROBE_CACHE_TTL: Duration = Duration::from_secs(60);

/// netloc → (ordered addresses, when the race ran).
static PROBE_CACHE: Mutex<Option<Vec<(String, Vec<SocketAddr>, Instant)>>> = Mutex::new(None);

/// Resolve, then hand ureq whichever address family actually answers FIRST.
///
/// The identity host publishes an A *and* an AAAA record, and macOS
/// `getaddrinfo` returns the AAAA first — but nothing is listening on IPv6:
/// the Caddy container publishes `"443:443"`, which Docker binds on
/// `0.0.0.0` only, and Docker's daemon IPv6 is not enabled. So the first
/// address every client is handed is one that can never accept a connection.
///
/// ureq has no Happy Eyeballs. It walks the list in order (`stream.rs:382`)
/// and gives the first address half the connect deadline — 15s by default,
/// exactly the overall timeout — so the dead attempt could burn the WHOLE
/// budget before the second address was tried. That surfaced as ureq's
/// generic expired-deadline message, "timed out reading response", which
/// reads like the server hung though it had never been contacted. curl, the
/// browser and `gh` hide the same broken record by racing the two families.
///
/// Rather than hard-code a preference — which would only move the problem to
/// whoever is IPv6-only — this races them, exactly as Happy Eyeballs
/// (RFC 8305) prescribes: probe every resolved address at once and order them
/// by who answered. Whatever works on THIS network goes first, whether that
/// is v4, v6, or a different one after the user changes network. If nothing
/// answers in time we keep the resolver's own order and let ureq try them all
/// under `CONNECT_TIMEOUT`, so a slow link still connects, just not as fast.
fn resolve_reachable_first(netloc: &str) -> std::io::Result<Vec<SocketAddr>> {
	let addrs: Vec<SocketAddr> = netloc.to_socket_addrs()?.collect();
	// One address is not a race, and zero is the resolver's problem to report.
	if addrs.len() < 2 {
		return Ok(addrs);
	}
	if let Some(cached) = cached_order(netloc) {
		return Ok(cached);
	}
	let ordered = race_addresses(&addrs);
	remember_order(netloc, &ordered);
	Ok(ordered)
}

/// Probe every address concurrently and return them ordered by who completed
/// a TCP connection first. Addresses that never answer keep their original
/// relative order at the back — still tried, just no longer deciding.
fn race_addresses(addrs: &[SocketAddr]) -> Vec<SocketAddr> {
	let (sender, receiver) = std::sync::mpsc::channel::<SocketAddr>();
	for addr in addrs.iter().copied() {
		let sender = sender.clone();
		// Detached on purpose: a probe against a blackholed address stays
		// blocked until PROBE_TIMEOUT, and nothing may wait on it. The send
		// simply fails once the receiver is gone.
		std::thread::spawn(move || {
			if std::net::TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).is_ok() {
				let _ = sender.send(addr);
			}
		});
	}
	// Our own handle must go, or the recv below would never see a disconnect.
	drop(sender);

	// The FIRST answer decides it — that is the whole point of racing. Waiting
	// for the rest would mean paying the full PROBE_TIMEOUT on every network
	// that has a dead family, which is exactly the cost we are removing.
	let winner = receiver.recv_timeout(PROBE_TIMEOUT).ok();

	// The winner first, then everything else in the order the resolver gave
	// it — still tried, just no longer deciding the request.
	let mut ordered: Vec<SocketAddr> = winner.into_iter().collect();
	let rest: Vec<SocketAddr> = addrs
		.iter()
		.copied()
		.filter(|addr| !ordered.contains(addr))
		.collect();
	ordered.extend(rest);
	ordered
}

fn cached_order(netloc: &str) -> Option<Vec<SocketAddr>> {
	let guard = PROBE_CACHE.lock().ok()?;
	let entries = guard.as_ref()?;
	entries.iter().find_map(|(host, addrs, at)| {
		(host == netloc && at.elapsed() < PROBE_CACHE_TTL).then(|| addrs.clone())
	})
}

fn remember_order(netloc: &str, addrs: &[SocketAddr]) {
	let Ok(mut guard) = PROBE_CACHE.lock() else {
		return;
	};
	let entries = guard.get_or_insert_with(Vec::new);
	entries.retain(|(host, _, at)| host != netloc && at.elapsed() < PROBE_CACHE_TTL);
	entries.push((netloc.to_string(), addrs.to_vec(), Instant::now()));
}

fn agent() -> ureq::Agent {
	ureq::AgentBuilder::new()
		.timeout(Duration::from_secs(15))
		.timeout_connect(CONNECT_TIMEOUT)
		.resolver(resolve_reachable_first)
		.build()
}

fn parse_json<T: for<'de> Deserialize<'de>>(response: ureq::Response) -> Result<T, String> {
	let body = response
		.into_string()
		.map_err(|error| format!("Could not read identity response: {error}"))?;
	serde_json::from_str(&body).map_err(|error| format!("Invalid identity response: {error}"))
}

fn error_message(response: ureq::Response, fallback: &str) -> (Option<String>, String) {
	let parsed = response
		.into_string()
		.ok()
		.and_then(|body| serde_json::from_str::<ErrorResponse>(&body).ok());
	let code = parsed
		.as_ref()
		.and_then(|body| body.error.clone().or_else(|| body.code.clone()));
	let message = parsed
		.and_then(|body| body.error_description.or(body.message))
		.unwrap_or_else(|| fallback.to_string());
	(code, message)
}

fn now_millis() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.unwrap_or_default()
		.as_millis() as u64
}

fn has_leading_zero_bits(digest: &[u8], bits: u32) -> bool {
	let complete_bytes = (bits / 8) as usize;
	if digest.iter().take(complete_bytes).any(|byte| *byte != 0) {
		return false;
	}
	let remaining_bits = bits % 8;
	remaining_bits == 0
		|| digest
			.get(complete_bytes)
			.is_some_and(|byte| byte & (0xff << (8 - remaining_bits)) == 0)
}

fn solve_proof_of_work(challenge: &ProofOfWorkChallenge) -> Result<String, String> {
	if challenge.purpose != "sign-in" || challenge.difficulty_bits > 28 {
		return Err(
			"The identity service returned an invalid proof-of-work challenge.".to_string(),
		);
	}
	let prefix = format!(
		"{}:{}:{}:",
		challenge.id, challenge.nonce, challenge.purpose
	);
	for counter in 0_u64.. {
		if now_millis() >= challenge.expires_at {
			return Err("The sign-in challenge expired. Try again.".to_string());
		}
		let digest = Sha256::digest(format!("{prefix}{counter}").as_bytes());
		if has_leading_zero_bits(&digest, challenge.difficulty_bits) {
			return Ok(format!("{}.{counter}", challenge.id));
		}
	}
	unreachable!()
}

fn proof_of_work() -> Result<String, String> {
	let response = agent()
		.get(&identity_endpoint("/api/pow/challenge?purpose=sign-in"))
		.call()
		.map_err(|error| match error {
			ureq::Error::Status(_, response) => {
				error_message(response, "Could not create a sign-in challenge.").1
			}
			ureq::Error::Transport(error) => format!("Identity service unavailable: {error}"),
		})?;
	let challenge: ProofOfWorkChallenge = parse_json(response)?;
	solve_proof_of_work(&challenge)
}

fn passkey_cookie(response: &ureq::Response) -> Option<String> {
	response
		.all("set-cookie")
		.into_iter()
		.filter_map(|header| header.split(';').next())
		.find(|cookie| cookie.contains("better-auth-passkey="))
		.map(str::to_string)
}

fn request_passkey_authentication() -> Result<(BeginPasskeyAuthentication, String), String> {
	if IDENTITY_BASE_URL.trim_end_matches('/') != PASSKEY_ORIGIN {
		return Err(format!(
			"Native passkeys require the identity origin {PASSKEY_ORIGIN}."
		));
	}
	let response = agent()
		.get(&endpoint("/passkey/generate-authenticate-options"))
		.set("origin", PASSKEY_ORIGIN)
		.call()
		.map_err(|error| match error {
			ureq::Error::Status(_, response) => {
				error_message(response, "Could not request a passkey challenge.").1
			}
			ureq::Error::Transport(error) => format!("Identity service unavailable: {error}"),
		})?;
	let cookie = passkey_cookie(&response).ok_or_else(|| {
		"The identity service did not return passkey challenge state.".to_string()
	})?;
	let options: PasskeyAuthenticationOptions = parse_json(response)?;
	if options.rp_id != PASSKEY_RP_ID {
		return Err(format!(
			"The identity service returned RP ID {}, expected {PASSKEY_RP_ID}.",
			options.rp_id
		));
	}
	let challenge = URL_SAFE_NO_PAD
		.decode(options.challenge)
		.map_err(|_| "The identity service returned an invalid passkey challenge.".to_string())?;
	Ok((
		BeginPasskeyAuthentication {
			available: true,
			command: String::new(),
			rp_id: PASSKEY_RP_ID.to_string(),
			challenge,
		},
		cookie,
	))
}

fn passkey_response(assertion: &NativePasskeyAssertion) -> serde_json::Value {
	serde_json::json!({
		"id": assertion.id,
		"rawId": assertion.raw_id,
		"type": "public-key",
		"response": {
			"clientDataJSON": assertion.client_data_json,
			"authenticatorData": assertion.authenticator_data,
			"signature": assertion.signature,
			"userHandle": assertion.user_handle
		},
		"clientExtensionResults": {},
		"authenticatorAttachment": "platform"
	})
}

fn verify_passkey_authentication(
	pending: PendingPasskeyAuthentication,
	assertion: NativePasskeyAssertion,
) -> Result<(String, AuthUser), String> {
	if Instant::now() >= pending.expires_at {
		return Err("The passkey challenge expired. Try again.".to_string());
	}
	let proof = proof_of_work()?;
	let body = serde_json::json!({ "response": passkey_response(&assertion) }).to_string();
	let response = agent()
		.post(&endpoint("/passkey/verify-authentication"))
		.set("content-type", "application/json")
		.set("origin", PASSKEY_ORIGIN)
		.set("cookie", &pending.cookie)
		.set("x-proof-of-work", &proof)
		.send_string(&body)
		.map_err(|error| match error {
			ureq::Error::Status(_, response) => {
				error_message(response, "The passkey could not be verified.").1
			}
			ureq::Error::Transport(error) => format!("Identity service unavailable: {error}"),
		})?;
	let token = response
		.header("set-auth-token")
		.filter(|token| !token.is_empty())
		.map(str::to_string)
		.ok_or_else(|| "The identity service did not return an app session.".to_string())?;
	let user = parse_json::<SessionResponse>(response)?.user;
	Ok((token, user))
}

fn issue_device_code() -> Result<PendingAuthorization, String> {
	let body = serde_json::json!({ "client_id": DEVICE_CLIENT_ID }).to_string();
	let response = agent()
		.post(&endpoint("/device/code"))
		.set("content-type", "application/json")
		.send_string(&body)
		.map_err(|error| match error {
			ureq::Error::Status(status, response) => {
				let (code, message) =
					error_message(response, "Could not start device authorization.");
				if status == 404 || code.as_deref() == Some("ORIGIN_NOT_ALLOWED") {
					"The identity service has not been updated for avenOS authentication yet."
						.to_string()
				} else {
					message
				}
			}
			ureq::Error::Transport(error) => format!("Identity service unavailable: {error}"),
		})?;
	let issued: DeviceCodeResponse = parse_json(response)?;
	Ok(PendingAuthorization {
		device_code: issued.device_code,
		verification_uri_complete: issued.verification_uri_complete,
		user_code: issued.user_code,
		expires_at: Instant::now() + Duration::from_secs(issued.expires_in),
		interval_seconds: issued.interval.max(1),
	})
}

fn verify_session(token: &str) -> Result<AuthUser, String> {
	let response = agent()
		.get(&endpoint("/get-session"))
		.set("authorization", &format!("Bearer {token}"))
		.call()
		.map_err(|error| match error {
			ureq::Error::Status(_, response) => {
				error_message(response, "The new session could not be verified.").1
			}
			ureq::Error::Transport(error) => format!("Identity service unavailable: {error}"),
		})?;
	Ok(parse_json::<SessionResponse>(response)?.user)
}

fn exchange_device_code(pending: &PendingAuthorization) -> Result<TokenExchange, String> {
	if Instant::now() >= pending.expires_at {
		return Err("The device authorization expired. Start again.".to_string());
	}
	let body = serde_json::json!({
		"grant_type": DEVICE_GRANT_TYPE,
		"device_code": pending.device_code,
		"client_id": DEVICE_CLIENT_ID
	})
	.to_string();
	let result = agent()
		.post(&endpoint("/device/token"))
		.set("content-type", "application/json")
		.send_string(&body);
	let response = match result {
		Ok(response) => response,
		Err(ureq::Error::Status(_, response)) => {
			let (code, message) = error_message(response, "Device authorization failed.");
			return match code.as_deref() {
				Some("authorization_pending" | "slow_down") => Ok(TokenExchange::Pending),
				_ => Err(message),
			};
		}
		Err(ureq::Error::Transport(error)) => {
			return Err(format!("Identity service unavailable: {error}"));
		}
	};
	let token: TokenResponse = parse_json(response)?;
	if !token.token_type.eq_ignore_ascii_case("bearer") || token.access_token.is_empty() {
		return Err("Identity service returned an invalid session token.".to_string());
	}
	let user = verify_session(&token.access_token)?;
	Ok(TokenExchange::Authenticated {
		token: token.access_token,
		user,
	})
}

#[tauri::command]
pub fn auth_status(state: tauri::State<'_, AuthState>) -> Result<AuthStatus, String> {
	let inner = state
		.0
		.lock()
		.map_err(|_| "Authentication state is unavailable.".to_string())?;
	Ok(AuthStatus {
		authenticated: inner.session.is_some(),
		user: inner.session.as_ref().map(|session| session.user.clone()),
	})
}

pub(crate) fn session_token(state: &tauri::State<'_, AuthState>) -> Result<String, String> {
	state
		.0
		.lock()
		.map_err(|_| "Authentication state is unavailable.".to_string())?
		.session
		.as_ref()
		.map(|session| session.token.clone())
		.ok_or_else(|| "No session is signed in.".to_string())
}

/// Exchange the long-lived, revocable Better Auth session for a short-lived,
/// audience-bound JWT before crossing the identity boundary. Product services
/// never receive the session credential and can verify the JWT from public JWKS.
static SERVICE_TOKENS: crate::service_token::ServiceTokenCache = crate::service_token::ServiceTokenCache::new();

pub(crate) fn service_access_token(session_token: &str) -> Result<String, String> {
	SERVICE_TOKENS.get(session_token, || exchange_service_access_token(session_token))
}

fn exchange_service_access_token(session_token: &str) -> Result<String, String> {
	let response = agent()
		.get(&endpoint("/token"))
		.set("authorization", &format!("Bearer {session_token}"))
		.call()
		.map_err(|error| match error {
			ureq::Error::Status(_, response) => {
				error_message(response, "Could not authorize the product request.").1
			}
			ureq::Error::Transport(error) => format!("Identity service unavailable: {error}"),
		})?;
	let token = parse_json::<ServiceTokenResponse>(response)?.token;
	if token.split('.').count() != 3 {
		return Err("The identity service returned an invalid service token.".to_string());
	}
	Ok(token)
}

/// One authenticated round-trip to the product API. Every billing command
/// goes through here with a HARDCODED path — the webview never chooses URLs,
/// and the Polar key never leaves the checkout service at all.
fn application_api_call(
	session_token: String,
	method: &'static str,
	path: &str,
	body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
	let token = service_access_token(&session_token)?;
	let request = agent()
		.request(method, &api_endpoint(path))
		.set("authorization", &format!("Bearer {token}"));
	let response = match body {
		Some(json) => request
			.set("content-type", "application/json")
			.send_string(&json.to_string()),
		None => request.call(),
	}
	.map_err(|error| match error {
		ureq::Error::Status(_, response) => error_message(response, "The request failed.").1,
		ureq::Error::Transport(error) => format!("Product API unavailable: {error}"),
	})?;
	parse_json::<serde_json::Value>(response)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostingDraft {
	hostname: String,
	repository: String,
	source_branch: String,
	deployment_branch: String,
}

fn hosting_body(input: HostingDraft) -> serde_json::Value {
	serde_json::json!({
		"hostname": input.hostname,
		"repository": input.repository,
		"sourceBranch": input.source_branch,
		"deploymentBranch": input.deployment_branch,
	})
}

fn valid_uuid(value: &str) -> bool {
	let bytes = value.as_bytes();
	bytes.len() == 36
		&& [8, 13, 18, 23]
			.into_iter()
			.all(|index| bytes[index] == b'-')
		&& bytes.iter().enumerate().all(|(index, byte)| {
			[8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit()
		})
}

/// Static hosting is managed from the installed aven.ceo application. The
/// webview can choose field values, but it cannot choose an origin or API
/// route: every call below is pinned to the product facade.
#[tauri::command]
pub async fn hosting_list(
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(token, "GET", "/api/sites", None)
	})
	.await
	.map_err(|error| format!("Could not load static sites: {error}"))?
}

#[tauri::command]
pub async fn hosting_create(
	input: HostingDraft,
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(token, "POST", "/api/sites", Some(hosting_body(input)))
	})
	.await
	.map_err(|error| format!("Could not create the static site: {error}"))?
}

#[tauri::command]
pub async fn hosting_update(
	site_id: String,
	input: HostingDraft,
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	if !valid_uuid(&site_id) {
		return Err("The site id is invalid.".to_string());
	}
	let token = session_token(&state)?;
	let path = format!("/api/sites/{site_id}");
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(token, "PUT", &path, Some(hosting_body(input)))
	})
	.await
	.map_err(|error| format!("Could not update the static site: {error}"))?
}

#[tauri::command]
pub async fn hosting_remove(
	site_id: String,
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	if !valid_uuid(&site_id) {
		return Err("The site id is invalid.".to_string());
	}
	let token = session_token(&state)?;
	let path = format!("/api/sites/{site_id}");
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(token, "DELETE", &path, None)
	})
	.await
	.map_err(|error| format!("Could not remove the static site: {error}"))?
}

/// The signed-in member's standing per tier (an array — the tiers are
/// independent products and can stand at once).
#[tauri::command]
pub async fn billing_me(state: tauri::State<'_, AuthState>) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(token, "GET", "/api/billing/me", None)
	})
	.await
	.map_err(|error| format!("Could not load your subscription: {error}"))?
}

/// Open a checkout for a tier; the optional embed origin is the pane's own
/// origin, so Polar accepts the page as the embedding frame.
#[tauri::command]
pub async fn billing_subscribe(
	tier: String,
	embed_origin: Option<String>,
	locale: Option<String>,
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(
			token,
			"POST",
			"/api/billing/subscribe",
			Some(
				serde_json::json!({ "tier": tier, "embedOrigin": embed_origin, "locale": locale }),
			),
		)
	})
	.await
	.map_err(|error| format!("Could not start the checkout: {error}"))?
}

/// Cancel ONE tier at period end (Kündigungsbutton semantics — never
/// silently immediate).
#[tauri::command]
pub async fn billing_cancel(
	tier: String,
	immediate: bool,
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(
			token,
			"POST",
			"/api/billing/cancel",
			Some(serde_json::json!({ "tier": tier, "immediate": immediate })),
		)
	})
	.await
	.map_err(|error| format!("Could not cancel: {error}"))?
}

/// Undo a scheduled cancel of ONE tier — the plan simply keeps running.
#[tauri::command]
pub async fn billing_resume(
	tier: String,
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(
			token,
			"POST",
			"/api/billing/resume",
			Some(serde_json::json!({ "tier": tier })),
		)
	})
	.await
	.map_err(|error| format!("Could not resume: {error}"))?
}

/// Fallback for the inline checkout: when the provider refuses to be framed
/// inside the app, the same checkout opens in a dedicated avenOS window —
/// never the system browser. The URL was minted by the identity service;
/// this only re-opens it, and only if it really is the provider's checkout.
#[tauri::command]
pub async fn billing_checkout_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
	use tauri::Manager as _;
	let parsed = url
		.parse::<tauri::Url>()
		.map_err(|error| format!("The checkout link is invalid: {error}"))?;
	let host = parsed.host_str().unwrap_or_default();
	if parsed.scheme() != "https" || !(host == "polar.sh" || host.ends_with(".polar.sh")) {
		return Err("Only the payment provider's checkout may open here.".to_string());
	}
	if let Some(existing) = app.get_webview_window("billing-checkout") {
		let _ = existing.set_focus();
		return Ok(());
	}
	tauri::WebviewWindowBuilder::new(&app, "billing-checkout", tauri::WebviewUrl::External(parsed))
		.title("Checkout · avenOS")
		.inner_size(960.0, 760.0)
		.build()
		.map_err(|error| format!("Could not open the checkout window: {error}"))?;
	Ok(())
}

/// Meine Bestellungen — the signed-in member's orders.
#[tauri::command]
pub async fn billing_orders(
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(token, "GET", "/api/billing/orders", None)
	})
	.await
	.map_err(|error| format!("Could not load your orders: {error}"))?
}

/// Where the member's latest checkout stands — polled while the inline
/// embed runs; the id stays server-side.
#[tauri::command]
pub async fn billing_checkout(
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		application_api_call(token, "GET", "/api/billing/checkout", None)
	})
	.await
	.map_err(|error| format!("Could not read the checkout status: {error}"))?
}

/// A downloaded invoice may not exceed this — an official PDF is small.
const MAX_INVOICE_BYTES: u64 = 20 * 1024 * 1024;

/// The local artifact shelf — for now the downloaded invoice PDFs; later
/// this folds into the artifact store proper.
fn artifacts_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
	use tauri::Manager as _;
	let dir = app
		.path()
		.app_data_dir()
		.map_err(|error| format!("No app data dir: {error}"))?
		.join("artifacts");
	std::fs::create_dir_all(&dir).map_err(|error| format!("Could not create {dir:?}: {error}"))?;
	Ok(dir)
}

/// The official invoice PDF for ONE of the member's own orders: the id
/// service resolves the order against the session and asks Polar (generating
/// the document on first ask — that can take a while), then the PDF is
/// downloaded into local app storage and its PATH returned. No window, no
/// system browser: the caller feeds that path straight into the artifact
/// ingest, so the invoice lands in the store as an intent rather than on a
/// second, parallel shelf that knew nothing about provenance.
#[tauri::command]
pub async fn billing_invoice_download(
	app: tauri::AppHandle,
	order_id: String,
	state: tauri::State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
	let token = session_token(&state)?;
	let dir = artifacts_dir(&app)?;
	tauri::async_runtime::spawn_blocking(move || {
		let answer = application_api_call(
			token,
			"POST",
			"/api/billing/invoices",
			Some(serde_json::json!({ "orderId": order_id })),
		)?;
		let url = answer
			.get("url")
			.and_then(|value| value.as_str())
			.ok_or_else(|| "The invoice response carried no URL.".to_string())?;
		if !url.starts_with("https://") {
			return Err("Only a secure invoice link may be downloaded.".to_string());
		}
		let response = agent()
			.get(url)
			.call()
			.map_err(|error| format!("Could not download the invoice: {error}"))?;
		let mut bytes = Vec::new();
		response
			.into_reader()
			.take(MAX_INVOICE_BYTES + 1)
			.read_to_end(&mut bytes)
			.map_err(|error| format!("Could not read the invoice: {error}"))?;
		if bytes.len() as u64 > MAX_INVOICE_BYTES {
			return Err("The invoice is unreasonably large.".to_string());
		}
		// The order id names the file; only its filesystem-safe part does.
		let safe: String = order_id
			.chars()
			.filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
			.collect();
		let file_name = format!("rechnung-{safe}.pdf");
		let path = dir.join(&file_name);
		std::fs::write(&path, &bytes)
			.map_err(|error| format!("Could not store the invoice: {error}"))?;
		// The PATH is the point: the pane does not show this file itself, it
		// hands it to the same ingest the window's drop handler uses, so an
		// invoice becomes an intent with a skill flow and lineage like any
		// other document. The file on disk is just the handover.
		Ok(serde_json::json!({
			"fileName": file_name,
			"path": path.to_string_lossy(),
		}))
	})
	.await
	.map_err(|error| format!("Could not load the invoice: {error}"))?
}

/// The names reserved for whoever is signed in. Settings shows them so the
/// account you are looking at is the account you are actually in — the session
/// alone answers "who", not "which aven".
#[tauri::command]
pub async fn auth_names(state: tauri::State<'_, AuthState>) -> Result<Vec<String>, String> {
	let token = session_token(&state)?;
	tauri::async_runtime::spawn_blocking(move || {
		let response = application_api_call(token, "GET", "/api/names/mine", None)?;
		let names: NamesResponse = serde_json::from_value(response)
			.map_err(|_| "The product API returned invalid reserved names.".to_string())?;
		Ok::<Vec<String>, String>(
			names
				.names
				.into_iter()
				.map(|owned| owned.name)
				.collect(),
		)
	})
	.await
	.map_err(|error| format!("Could not load your reserved names: {error}"))?
}

#[tauri::command]
pub async fn auth_passkey_begin(
	state: tauri::State<'_, AuthState>,
) -> Result<BeginPasskeyAuthentication, String> {
	if !native_passkeys_available() {
		return Ok(BeginPasskeyAuthentication {
			available: false,
			command: String::new(),
			rp_id: PASSKEY_RP_ID.to_string(),
			challenge: Vec::new(),
		});
	}
	let (response, cookie) = tauri::async_runtime::spawn_blocking(request_passkey_authentication)
		.await
		.map_err(|error| format!("Could not start native passkey authentication: {error}"))??;
	let mut inner = state
		.0
		.lock()
		.map_err(|_| "Authentication state is unavailable.".to_string())?;
	inner.pending = None;
	inner.pending_passkey = Some(PendingPasskeyAuthentication {
		cookie,
		expires_at: Instant::now() + Duration::from_secs(300),
	});
	inner.session = None;
	SERVICE_TOKENS.clear();
	Ok(BeginPasskeyAuthentication {
		command: if cfg!(target_os = "android") {
			"plugin:android-passkey|login".to_string()
		} else if cfg!(target_os = "ios") {
			"plugin:ios-passkey|login".to_string()
		} else {
			"plugin:macos-passkey|login_passkey".to_string()
		},
		..response
	})
}

#[tauri::command]
pub async fn auth_passkey_finish(
	assertion: NativePasskeyAssertion,
	state: tauri::State<'_, AuthState>,
) -> Result<AuthStatus, String> {
	let pending = state
		.0
		.lock()
		.map_err(|_| "Authentication state is unavailable.".to_string())?
		.pending_passkey
		.take()
		.ok_or_else(|| "No native passkey authentication is pending.".to_string())?;
	let (token, user) = tauri::async_runtime::spawn_blocking(move || {
		verify_passkey_authentication(pending, assertion)
	})
	.await
	.map_err(|error| format!("Could not finish native passkey authentication: {error}"))??;
	let mut inner = state
		.0
		.lock()
		.map_err(|_| "Authentication state is unavailable.".to_string())?;
	inner.session = Some(NativeSession {
		token,
		user: user.clone(),
	});
	Ok(AuthStatus {
		authenticated: true,
		user: Some(user),
	})
}

#[tauri::command]
pub async fn auth_begin(state: tauri::State<'_, AuthState>) -> Result<BeginAuthorization, String> {
	let pending = tauri::async_runtime::spawn_blocking(issue_device_code)
		.await
		.map_err(|error| format!("Could not start authentication: {error}"))??;
	let response = BeginAuthorization {
		verification_uri_complete: pending.verification_uri_complete.clone(),
		user_code: pending.user_code.clone(),
		expires_in: pending
			.expires_at
			.saturating_duration_since(Instant::now())
			.as_secs(),
		interval: pending.interval_seconds,
	};
	let mut inner = state
		.0
		.lock()
		.map_err(|_| "Authentication state is unavailable.".to_string())?;
	inner.pending = Some(pending);
	inner.pending_passkey = None;
	inner.session = None;
	SERVICE_TOKENS.clear();
	Ok(response)
}

#[tauri::command]
pub async fn auth_poll(state: tauri::State<'_, AuthState>) -> Result<PollAuthorization, String> {
	let pending = state
		.0
		.lock()
		.map_err(|_| "Authentication state is unavailable.".to_string())?
		.pending
		.clone()
		.ok_or_else(|| "No device authorization is pending.".to_string())?;
	let exchange = tauri::async_runtime::spawn_blocking(move || exchange_device_code(&pending))
		.await
		.map_err(|error| format!("Could not finish authentication: {error}"))??;
	match exchange {
		TokenExchange::Pending => Ok(PollAuthorization {
			status: "pending",
			user: None,
		}),
		TokenExchange::Authenticated { token, user } => {
			let mut inner = state
				.0
				.lock()
				.map_err(|_| "Authentication state is unavailable.".to_string())?;
			inner.pending = None;
			inner.session = Some(NativeSession {
				token,
				user: user.clone(),
			});
			Ok(PollAuthorization {
				status: "authenticated",
				user: Some(user),
			})
		}
	}
}

#[tauri::command]
pub async fn auth_logout(state: tauri::State<'_, AuthState>) -> Result<(), String> {
	let token = {
		let mut inner = state
			.0
			.lock()
			.map_err(|_| "Authentication state is unavailable.".to_string())?;
		inner.pending = None;
		inner.pending_passkey = None;
		inner.session.take().map(|session| session.token)
	};
	SERVICE_TOKENS.clear();
	if let Some(token) = token {
		tauri::async_runtime::spawn_blocking(move || {
			let _ = agent()
				.post(&endpoint("/sign-out"))
				.set("authorization", &format!("Bearer {token}"))
				.set("content-type", "application/json")
				.send_string("{}");
		})
		.await
		.map_err(|error| format!("Could not finish logout: {error}"))?;
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	/// The regression this guards: the identity host publishes an A and an
	/// AAAA, macOS returns the AAAA first, and nothing listens on IPv6 — so
	/// the first address every client was handed could never connect, and
	/// ureq (no Happy Eyeballs) let it consume the whole request budget.
	///
	/// A live listener wins the race against a black hole. `192.0.2.1` is
	/// TEST-NET-1 (RFC 5737): reserved, routed nowhere, so it can only ever
	/// time out — the same shape as the dead IPv6 address in production.
	#[test]
	fn the_reachable_address_is_tried_first() {
		let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind a local listener");
		let reachable: SocketAddr = listener.local_addr().unwrap();
		let black_hole: SocketAddr = "192.0.2.1:443".parse().unwrap();

		// Dead address FIRST, exactly how getaddrinfo hands us production.
		let ordered = race_addresses(&[black_hole, reachable]);

		assert_eq!(ordered[0], reachable, "the address that answers must go first");
		assert!(
			ordered.contains(&black_hole),
			"the unreachable address must still be kept as a fallback, got {ordered:?}"
		);
		assert_eq!(ordered.len(), 2, "no address may be invented or dropped");
	}

	/// The race must not hard-code a family. Whichever answers wins — that is
	/// what makes this work on an IPv6-only network too, rather than trading
	/// one broken preference for another.
	#[test]
	fn ordering_follows_reachability_not_address_family() {
		let v6 = std::net::TcpListener::bind("[::1]:0");
		let v4 = std::net::TcpListener::bind("127.0.0.1:0").expect("bind v4");
		let v4_addr: SocketAddr = v4.local_addr().unwrap();

		// Where this machine has IPv6 loopback, a LIVE v6 must beat a dead v4.
		if let Ok(v6) = v6 {
			let v6_addr: SocketAddr = v6.local_addr().unwrap();
			let dead_v4: SocketAddr = "192.0.2.1:443".parse().unwrap();
			let ordered = race_addresses(&[dead_v4, v6_addr]);
			assert_eq!(ordered[0], v6_addr, "a live IPv6 must win over a dead IPv4");
		}

		// ...and symmetrically, a live v4 beats a dead v6.
		let dead_v6: SocketAddr = "[100::1]:443".parse().unwrap();
		let ordered = race_addresses(&[dead_v6, v4_addr]);
		assert_eq!(ordered[0], v4_addr, "a live IPv4 must win over a dead IPv6");
	}

	/// When nothing answers we must still hand back every address, in the
	/// order we got them, so ureq can try them all under CONNECT_TIMEOUT.
	#[test]
	fn an_all_dead_race_preserves_every_address() {
		let a: SocketAddr = "192.0.2.1:443".parse().unwrap();
		let b: SocketAddr = "[100::1]:443".parse().unwrap();
		let ordered = race_addresses(&[a, b]);
		assert_eq!(ordered, vec![a, b], "order preserved when nothing answers");
	}

	/// A dead first address must not be able to eat the overall budget.
	#[test]
	fn connect_timeout_leaves_room_for_the_second_address() {
		// ureq halves the connect deadline when several addresses are known,
		// so one bad family costs at most half of CONNECT_TIMEOUT.
		assert!(
			CONNECT_TIMEOUT / 2 < Duration::from_secs(15),
			"a dead address must leave time inside the 15s request timeout"
		);
		// And the race itself must be far cheaper than a single connect.
		assert!(PROBE_TIMEOUT < CONNECT_TIMEOUT / 2, "the probe must be the cheap path");
	}

	#[test]
	fn native_assertion_matches_webauthn_json_shape() {
		let response = passkey_response(&NativePasskeyAssertion {
			id: "credential".to_string(),
			raw_id: "credential".to_string(),
			client_data_json: "client".to_string(),
			authenticator_data: "authenticator".to_string(),
			signature: "signature".to_string(),
			user_handle: "user".to_string(),
		});
		assert_eq!(response["type"], "public-key");
		assert_eq!(response["rawId"], "credential");
		assert_eq!(response["response"]["userHandle"], "user");
	}

	#[test]
	fn proof_of_work_bit_check_handles_partial_bytes() {
		assert!(has_leading_zero_bits(&[0, 0b0000_1111], 12));
		assert!(!has_leading_zero_bits(&[0, 0b0001_0000], 12));
	}

	#[test]
	fn hosting_route_ids_cannot_choose_an_api_path() {
		assert!(valid_uuid("00000000-0000-4000-8000-000000000001"));
		assert!(!valid_uuid("../../billing/me"));
		assert!(!valid_uuid("00000000-0000-4000-8000-000000000001/sites"));
	}
}
