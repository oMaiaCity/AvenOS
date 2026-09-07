fn main() {
	for key in [
		"AVEN_IDENTITY_BASE_URL",
		"AVEN_API_BASE_URL",
		"AVEN_PASSKEY_ORIGIN",
		"AVEN_PASSKEY_RP_ID",
	] {
		println!("cargo:rerun-if-env-changed={key}");
	}
	// Card 0121 removed everything this script used to work around: the Google
	// OAuth creds baked in via `option_env!`, the sherpa-onnx iOS link directives,
	// and the llama.cpp static-archive dedupe (cargo bundles native libs into
	// `libapp.a` by object basename, and ggml's archives carried colliding ones).
	// With no native AI dependencies left there is nothing to patch.
	//
	// The macOS passkey plugin pulls in a Swift bridge (swift-rs), and Swift's
	// concurrency runtime lives in the OS at /usr/lib/swift. swift-rs links the
	// bridge but does not add that rpath, so the binary builds and then dies at
	// launch with `Library not loaded: @rpath/libswift_Concurrency.dylib`.
	if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
		println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
	}

	tauri_build::build()
}
