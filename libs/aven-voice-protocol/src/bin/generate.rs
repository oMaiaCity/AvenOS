fn main() -> std::io::Result<()> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let generated = aven_voice_protocol::generate_typescript();
    let generated_path = root.join("generated/voice-protocol.ts");
    let app_path = root.join("../../app/src/lib/voice/protocol.ts");
    if std::env::args().any(|argument| argument == "--check") {
        for path in [&generated_path, &app_path] {
            if std::fs::read_to_string(path).ok().as_deref() != Some(&generated) {
                eprintln!("generated voice protocol is stale: {}", path.display());
                std::process::exit(1);
            }
        }
        return Ok(());
    }
    std::fs::create_dir_all(root.join("generated"))?;
    std::fs::write(generated_path, &generated)?;
    let app = root.join("../../app/src/lib/voice");
    std::fs::create_dir_all(&app)?;
    std::fs::write(app_path, generated)
}
