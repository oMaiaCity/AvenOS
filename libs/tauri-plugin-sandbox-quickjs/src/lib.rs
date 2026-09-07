//! `tauri-plugin-sandbox-quickjs` — QuickJS sandbox for actor fixture logic.

mod commands;
mod session;

pub use commands::STATE_EVENT;
pub use session::{InterfaceDef, SessionManager};

use tauri::{generate_handler, plugin::Builder, Manager};

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
	Builder::new("sandbox-quickjs")
		.invoke_handler(generate_handler![
			commands::session_mount,
			commands::session_dispatch,
			commands::session_unmount,
			commands::run_tool,
		])
		.setup(|app, _api| {
			app.manage(SessionManager::default());
			Ok(())
		})
		.build()
}
