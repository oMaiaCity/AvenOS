fn main() {
    let fixture = aven_voice_runtime::silent_fixture::generate_silent_contribution_fixture()
        .expect("silent audio fixture must complete");
    println!(
        "{}",
        serde_json::to_string(&fixture).expect("silent audio fixture must serialize")
    );
}
