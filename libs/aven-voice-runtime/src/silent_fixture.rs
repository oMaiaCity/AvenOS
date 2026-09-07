use aven_voice_core::{
    Action, CachedResult, Command, MonoTimeNs, Observation, OutputGeneration, VoiceConfigV1,
    VoiceState,
};
use aven_voice_protocol::{
    ClientTurnKey, RequestId, SessionId, SpeechCancelReason, TurnId, VoiceEvent, VoiceFeature,
};
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SilentContributionFixture {
    pub text: String,
    pub session_id: String,
    pub speaker_id: String,
    pub confidence: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SilentDuplexConversationFixture {
    pub session_id: String,
    pub turn_id: String,
    pub narration_text: String,
    pub interrupted: SilentContributionFixture,
    pub follow_up: SilentContributionFixture,
    pub fade_duration_ms: u32,
}

/// Runs synthetic PCM through the production input worker and semantic state
/// machine without opening an audio device. The resulting value has the same
/// shape persisted by the application for a voice-authored contribution.
pub fn generate_silent_contribution_fixture() -> Result<SilentContributionFixture, String> {
    let (mut state, session_id) = active_state("silent-audio-e2e")?;
    let generation = state.route_generation;
    let captured = capture_candidate(
        &mut state,
        &session_id,
        super::pipeline::silent_fixture_observations(generation)?,
    )?;
    Ok(captured.contribution)
}

/// Runs two synthetic PCM utterances through one production input worker/state
/// session. The first arrives over an audible assistant turn and must derive a
/// lexical barge-in plus the configured fade; the second must receive a stable,
/// distinct anonymous speaker label after playback has stopped.
pub fn generate_silent_duplex_conversation_fixture(
) -> Result<SilentDuplexConversationFixture, String> {
    const NARRATION: &str = "Ich erkläre den Ablauf ausführlich und spreche noch weiter.";
    const INTERRUPTION: &str = "Stopp, bitte erkläre das anders.";
    const FOLLOW_UP: &str = "Und welche Aufgabe kommt danach?";

    let (mut state, session_id) = active_state("silent-duplex-e2e")?;
    let (begun, begin_actions) = state.command(
        Command::BeginSpeech {
            request_id: request("duplex-begin")?,
            session_id: session_id.clone(),
            client_turn_key: Some(
                ClientTurnKey::parse("duplex-client-turn").map_err(|error| error.to_string())?,
            ),
            language: "de".into(),
            voice: "M5".into(),
        },
        MonoTimeNs(0),
    );
    let CachedResult::Turn(turn_id) = begun.map_err(|error| error.message)? else {
        return Err("silent duplex fixture did not begin narration".into());
    };
    let output_generation = begin_actions
        .iter()
        .find_map(|action| match action {
            Action::SetOutputGeneration(generation) => Some(*generation),
            _ => None,
        })
        .ok_or_else(|| "silent duplex fixture produced no output generation".to_owned())?;
    state
        .command(
            Command::EnqueueSpeech {
                request_id: request("duplex-narration")?,
                session_id: session_id.clone(),
                turn_id: turn_id.clone(),
                segment_index: 0,
                text: NARRATION.into(),
            },
            MonoTimeNs(0),
        )
        .0
        .map_err(|error| error.message)?;
    let audible = state.observe(
        Observation::PlaybackAudible {
            turn_id: turn_id.clone(),
            generation: output_generation,
        },
        MonoTimeNs(0),
    );
    if !audible.iter().any(|action| {
        matches!(action, Action::Emit(VoiceEvent::PlaybackStarted { turn_id: observed }) if observed == &turn_id)
    }) {
        return Err("silent duplex fixture narration never became audible".into());
    }

    let generation = state.route_generation;
    let interrupted = capture_candidate(
        &mut state,
        &session_id,
        super::pipeline::scripted_fixture_observations(
            generation,
            "silent-duplex-interrupt",
            INTERRUPTION,
            vec![1.0, 0.0, 0.0],
            true,
        )?,
    )?;
    if !interrupted.barge_in_started || !interrupted.cancelled_turn {
        return Err("silent duplex fixture did not derive a lexical barge-in".into());
    }
    let (fade_turn, fade_generation, fade_duration_ms) = interrupted
        .fade
        .ok_or_else(|| "silent duplex fixture did not derive a cancellation fade".to_owned())?;
    let drained = state.observe(
        Observation::FadeDrained {
            turn_id: fade_turn,
            generation: fade_generation,
        },
        MonoTimeNs::from_millis(u64::from(fade_duration_ms)),
    );
    if !drained.iter().any(|action| {
        matches!(
            action,
            Action::Emit(VoiceEvent::PlaybackCancelled {
                turn_id: observed,
                reason: SpeechCancelReason::BargeIn,
            }) if observed == &turn_id
        )
    }) {
        return Err("silent duplex fixture fade did not complete the barge-in".into());
    }

    let follow_up = capture_candidate(
        &mut state,
        &session_id,
        super::pipeline::scripted_fixture_observations(
            generation,
            "silent-duplex-follow-up",
            FOLLOW_UP,
            vec![0.0, 1.0, 0.0],
            false,
        )?,
    )?;
    if interrupted.contribution.speaker_id == follow_up.contribution.speaker_id {
        return Err("silent duplex fixture collapsed two speakers into one label".into());
    }

    Ok(SilentDuplexConversationFixture {
        session_id: session_id.as_str().to_owned(),
        turn_id: turn_id.as_str().to_owned(),
        narration_text: NARRATION.into(),
        interrupted: interrupted.contribution,
        follow_up: follow_up.contribution,
        fade_duration_ms,
    })
}

struct CapturedCandidate {
    contribution: SilentContributionFixture,
    barge_in_started: bool,
    cancelled_turn: bool,
    fade: Option<(TurnId, OutputGeneration, u32)>,
}

fn capture_candidate(
    state: &mut VoiceState,
    session_id: &SessionId,
    observations: Vec<Observation>,
) -> Result<CapturedCandidate, String> {
    let mut speaker = None;
    let mut text = None;
    let mut barge_in_started = false;
    let mut cancelled_turn = false;
    let mut fade = None;
    for observation in observations {
        for action in state.observe(observation, MonoTimeNs(1)) {
            match action {
                Action::CancelTts(_) => cancelled_turn = true,
                Action::FadeOutput {
                    turn_id,
                    generation,
                    duration_ms,
                } => fade = Some((turn_id, generation, duration_ms)),
                Action::Emit(VoiceEvent::InputConfirmed {
                    barge_in_started: value,
                    ..
                }) => barge_in_started = value,
                Action::Emit(VoiceEvent::InputSpeakerIdentified { speaker: value, .. }) => {
                    if text.is_some() {
                        return Err("speaker attribution followed final text".into());
                    }
                    speaker = Some(value);
                }
                Action::Emit(VoiceEvent::InputFinal { text: value, .. }) => text = Some(value),
                _ => {}
            }
        }
    }

    let speaker = speaker.ok_or_else(|| "silent fixture produced no speaker attribution".to_owned())?;
    Ok(CapturedCandidate {
        contribution: SilentContributionFixture {
            text: text.ok_or_else(|| "silent fixture produced no final text".to_owned())?,
            session_id: session_id.as_str().to_owned(),
            speaker_id: speaker.speaker_id.as_str().to_owned(),
            confidence: speaker.confidence,
        },
        barge_in_started,
        cancelled_turn,
        fade,
    })
}

fn active_state(scope: &str) -> Result<(VoiceState, SessionId), String> {
    let config = VoiceConfigV1 {
        start_windows: 1,
        end_windows: 2,
        ..VoiceConfigV1::default()
    };
    let mut state = VoiceState::new(scope, config);
    let (prepared, _) = state.command(
        Command::Prepare {
            request_id: request("silent-prepare")?,
            features: vec![VoiceFeature::Input, VoiceFeature::Output],
        },
        MonoTimeNs(0),
    );
    prepared.map_err(|error| error.message)?;
    state.observe(
        Observation::ModelsPrepared {
            input: true,
            output: true,
        },
        MonoTimeNs(0),
    );
    let (started, _) = state.command(
        Command::StartSession {
            request_id: request("silent-start")?,
            preferred_input: None,
            preferred_output: None,
        },
        MonoTimeNs(0),
    );
    let CachedResult::Session(session_id) = started.map_err(|error| error.message)? else {
        return Err("silent fixture did not start a session".into());
    };
    let generation = state.route_generation;
    state.observe(
        Observation::RouteStarted {
            session_id: session_id.clone(),
            generation,
        },
        MonoTimeNs(0),
    );
    Ok((state, session_id))
}

fn request(value: &str) -> Result<RequestId, String> {
    RequestId::parse(value).map_err(|error| error.to_string())
}
