//! The avenCITY desktop/mobile shell.
//!
//! Card 0121 stripped this crate back to what hosting a webview game needs. The
//! game is entirely webview-side (three.js), so there are no commands, no managed
//! state, and no plugins beyond opening external URLs. The exit drain went with
//! avenDB — there is no store left to flush, so the process can just exit.
//!
//! Logging survives on purpose: a silent Rust side is what makes a TestFlight
//! build undebuggable.

mod artifacts;
mod asr;
mod assets;
mod auth;
mod service_token;
mod tts;
mod voice;

use tauri::Manager;

#[cfg(target_os = "linux")]
const ONNXRUNTIME_LIBRARY_NAME: &str = "libonnxruntime.so";

/// Load the official shared ONNX Runtime before either speech engine creates a
/// session. Linux uses dynamic loading because the crate's static distribution
/// requires a newer glibc/libstdc++ ABI than our Ubuntu 22.04 baseline.
///
/// CUDA is registered on the environment, so every ASR, VAD, and TTS session
/// attempts GPU execution first. ONNX Runtime keeps unsupported graph nodes on
/// CPU and falls back to CPU entirely when the CUDA provider or its libraries
/// are unavailable.
#[cfg(target_os = "linux")]
fn init_onnxruntime(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
	let bundled = app
		.path()
		.resource_dir()?
		.join("onnxruntime")
		.join(ONNXRUNTIME_LIBRARY_NAME);
	let path = std::env::var_os("ORT_DYLIB_PATH")
		.map(std::path::PathBuf::from)
		.filter(|path| path.is_file())
		.unwrap_or(bundled);
	if !path.is_file() {
		return Err(std::io::Error::new(
			std::io::ErrorKind::NotFound,
			format!(
				"ONNX Runtime shared library not found at {}",
				path.display()
			),
		)
		.into());
	}
	let gpu_mode = std::env::var("AVEN_SPEECH_GPU")
		.unwrap_or_else(|_| "auto".to_string())
		.to_ascii_lowercase();
	let request_cuda = match gpu_mode.as_str() {
		"auto" | "cuda" => true,
		"cpu" | "off" | "0" => false,
		other => {
			log::warn!(
				target: "avenos::voice",
				"unknown AVEN_SPEECH_GPU={other:?}; using auto"
			);
			true
		}
	};
	let runtime_has_cuda = path
		.parent()
		.is_some_and(|dir| dir.join("libonnxruntime_providers_cuda.so").is_file());
	let try_cuda = request_cuda && runtime_has_cuda;
	if request_cuda && !runtime_has_cuda {
		log::info!(
			target: "avenos::voice",
			"CUDA execution provider is not bundled; speech will use CPU"
		);
	}

	let mut runtime = ort::init_from(&path)?
		.with_name("avenos-speech")
		.with_telemetry(false);
	if try_cuda {
		runtime = runtime.with_execution_providers([ort::ep::CUDA::default().build()]);
	}
	runtime.commit();
	log::info!(
		target: "avenos::voice",
		"ONNX Runtime loaded from {}; speech compute preference: {}",
		path.display(),
		if try_cuda { "CUDA with CPU fallback" } else { "CPU" }
	);
	Ok(())
}

/// macOS/iOS route through `os_log` (subsystem `ceo.aven.os`) because iPhone
/// Console streaming is unreliable off-device.
#[cfg(any(target_os = "ios", target_os = "macos"))]
struct AppleLogger {
	subsystem: String,
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
impl log::Log for AppleLogger {
	fn enabled(&self, metadata: &log::Metadata) -> bool {
		metadata.level() <= log::max_level()
	}

	fn log(&self, record: &log::Record) {
		if !self.enabled(record.metadata()) {
			return;
		}
		let oslog = oslog::OsLog::new(&self.subsystem, record.target());
		oslog.with_level(record.level().into(), &format!("{}", record.args()));
	}

	fn flush(&self) {}
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn apple_os_log_raw(category: &str, message: &str) {
	use oslog::Level;
	oslog::OsLog::new("ceo.aven.os", category).with_level(Level::Fault, message);
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn init_apple_os_logging() -> Result<(), log::SetLoggerError> {
	use log::LevelFilter;
	log::set_max_level(LevelFilter::Debug);
	log::set_boxed_logger(Box::new(AppleLogger {
		subsystem: "ceo.aven.os".to_string(),
	}))
}

/// Install the global `log` subscriber. Without this every `log::*` call in this
/// crate is a no-op. Override the filter with `RUST_LOG` (env_logger semantics).
fn init_logging() {
	#[cfg(any(target_os = "ios", target_os = "macos"))]
	if let Err(e) = init_apple_os_logging() {
		eprintln!("avenos: oslog init failed: {e}");
	}

	#[cfg(not(any(target_os = "ios", target_os = "macos")))]
	{
		let _ = env_logger::Builder::from_env(
			env_logger::Env::default().default_filter_or("info,avenos=debug"),
		)
		.format_timestamp_millis()
		.try_init();
	}

	log::info!(target: "avenos", "avenCITY shell starting");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	#[cfg(any(target_os = "ios", target_os = "macos"))]
	apple_os_log_raw("boot", "avenCITY Rust runtime starting");

	init_logging();

	let builder = tauri::Builder::default()
		// Open external URLs in the system browser so the game window stays put.
		.plugin(tauri_plugin_opener::init());
	#[cfg(target_os = "macos")]
	let builder = builder.plugin(tauri_plugin_macos_passkey::init());
	#[cfg(target_os = "ios")]
	let builder = builder.plugin(tauri_plugin_ios_passkey::init());
	#[cfg(target_os = "android")]
	let builder = builder.plugin(tauri_plugin_android_passkey::init());

	builder
		// On-device German speech, both directions. Both engines are built lazily
		// on first use, so a session that never speaks or listens pays nothing.
		.manage(auth::AuthState::default())
		.manage(artifacts::LlmStreamState::default())
		.invoke_handler(tauri::generate_handler![
			artifacts::actor_run_start,
			artifacts::actor_run_status,
			artifacts::artifact_upload,
			artifacts::artifact_processing_status,
			artifacts::artifact_client_run_publish,
			artifacts::artifact_client_run_get,
			artifacts::artifact_query,
			artifacts::llm_model_list,
			artifacts::llm_complete,
			artifacts::llm_openai_complete,
			artifacts::llm_openai_stream,
			artifacts::llm_openai_stream_cancel,
			artifacts::intent_list,
			artifacts::intent_get,
			artifacts::intent_append_contribution,
			artifacts::intent_create,
			artifacts::intent_update,
			artifacts::intent_lifecycle,
			artifacts::intent_delete,
			artifacts::artifact_content_get,
			artifacts::artifact_get,
			artifacts::artifact_evidence_get,
			artifacts::artifact_store_list,
			auth::auth_status,
			 auth::auth_names,
			auth::hosting_list,
			auth::hosting_create,
			auth::hosting_update,
			auth::hosting_remove,
			auth::billing_me,
			auth::billing_subscribe,
			auth::billing_cancel,
			auth::billing_resume,
			auth::billing_invoice_download,
			auth::billing_orders,
			auth::billing_checkout,
			auth::billing_checkout_window,
			auth::auth_passkey_begin,
			auth::auth_passkey_finish,
			auth::auth_begin,
			auth::auth_poll,
			auth::auth_logout,
			voice::protocol::voice_prepare,
			voice::protocol::voice_session_start,
			voice::protocol::voice_session_stop,
			voice::protocol::voice_speech_begin,
			voice::protocol::voice_speech_enqueue,
			voice::protocol::voice_speech_finish,
			voice::protocol::voice_speech_cancel,
			voice::protocol::voice_input_reset,
			voice::protocol::voice_snapshot,
			voice::protocol::voice_diagnostics_subscribe,
			voice::protocol::voice_e2e_inject_silent_final,
			voice::protocol::voice_e2e_duplex_fixture,
			voice::protocol::voice_e2e_begin_narration,
			voice::protocol::voice_e2e_inject_interruption,
			voice::protocol::voice_e2e_inject_second_speaker
		])
		.setup(|app| {
			#[cfg(target_os = "linux")]
			{
				init_onnxruntime(app)?;
			}

			app.manage(voice::VoiceService::new(app.handle().clone()));

			// The webview is the whole surface, so give it focus on launch —
			// otherwise the first click is spent activating the window.
			if let Some(window) = app.get_webview_window("main") {
				let _ = window.set_focus();
			}
			Ok(())
		})
		.run(tauri::generate_context!())
		.expect("error while running avenCITY");
}
