#![cfg(feature = "silent-audio-e2e")]

use aven_voice_runtime::silent_fixture::{
    generate_silent_contribution_fixture, generate_silent_duplex_conversation_fixture,
};

#[test]
fn in_memory_pcm_reaches_a_semantic_speaker_attributed_final() {
    let fixture = generate_silent_contribution_fixture().unwrap();
    assert_eq!(fixture.text, "Guten Tag vom stillen Audiotest");
    assert_eq!(fixture.speaker_id, "speaker-1");
    assert_eq!(fixture.confidence, 1.0);
    assert!(!fixture.session_id.is_empty());
}

#[test]
fn two_pcm_candidates_interrupt_once_and_keep_distinct_session_speakers() {
    let fixture = generate_silent_duplex_conversation_fixture().unwrap();
    assert_eq!(fixture.interrupted.text, "Stopp, bitte erkläre das anders.");
    assert_eq!(fixture.follow_up.text, "Und welche Aufgabe kommt danach?");
    assert_eq!(fixture.interrupted.speaker_id, "speaker-1");
    assert_eq!(fixture.follow_up.speaker_id, "speaker-2");
    assert_eq!(fixture.interrupted.session_id, fixture.session_id);
    assert_eq!(fixture.follow_up.session_id, fixture.session_id);
    assert_eq!(fixture.fade_duration_ms, 80);
}
