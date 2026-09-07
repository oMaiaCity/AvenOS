fn main() {
    let fixture =
        aven_voice_runtime::silent_fixture::generate_silent_duplex_conversation_fixture()
            .expect("silent duplex fixture should pass through the production input state machine");
    println!(
        "{}",
        serde_json::to_string(&fixture).expect("silent duplex fixture should serialize")
    );
}
