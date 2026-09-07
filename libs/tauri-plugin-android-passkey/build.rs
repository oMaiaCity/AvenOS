fn main() {
	tauri_plugin::Builder::new(&["login", "request_microphone"])
		.android_path("android")
		.build();
}
