use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, Runtime};

#[cfg(target_os = "android")]
use tauri::{plugin::PluginHandle, Manager};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "ceo.aven.androidpasskey";

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginRequest {
	domain: String,
	challenge: Vec<u8>,
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Serialize)]
struct PermissionRequest {
	permissions: Vec<&'static str>,
}

#[cfg(target_os = "android")]
struct AndroidPasskey<R: Runtime>(PluginHandle<R>);

#[tauri::command]
async fn login<R: Runtime>(
	app: tauri::AppHandle<R>,
	domain: String,
	challenge: Vec<u8>,
	salt: Vec<u8>,
) -> Result<serde_json::Value, String> {
	#[cfg(target_os = "android")]
	{
		let _ = salt;
		return app
			.state::<AndroidPasskey<R>>()
			.0
			.run_mobile_plugin("login", LoginRequest { domain, challenge })
			.map_err(|error| error.to_string());
	}

	#[cfg(not(target_os = "android"))]
	{
		let _ = (app, domain, challenge, salt);
		Err("Native Android passkeys are unavailable on this platform.".to_string())
	}
}

#[tauri::command]
async fn request_microphone<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
	#[cfg(target_os = "android")]
	{
		let permissions = app
			.state::<AndroidPasskey<R>>()
			.0
			.run_mobile_plugin::<serde_json::Value>(
				"requestPermissions",
				PermissionRequest {
					permissions: vec!["microphone"],
				},
			)
			.map_err(|error| error.to_string())?;
		return match permissions.get("microphone").and_then(|state| state.as_str()) {
			Some("granted") => Ok(()),
			_ => Err("Microphone permission is required for voice input.".to_string()),
		};
	}

	#[cfg(not(target_os = "android"))]
	{
		let _ = app;
		Ok(())
	}
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
	tauri::plugin::Builder::new("android-passkey")
		.setup(|app, api| {
			#[cfg(target_os = "android")]
			app.manage(AndroidPasskey(api.register_android_plugin(
				PLUGIN_IDENTIFIER,
				"AndroidPasskeyPlugin",
			)?));
			#[cfg(not(target_os = "android"))]
			let _ = (app, api);
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![login, request_microphone])
		.build()
}
