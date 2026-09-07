use aven_voice_protocol::{
    CandidateId, InputDiscardReason, SessionId, SpeechCancelReason, TurnId, VoiceEvent,
    VoiceFeature,
};

use crate::{MonoTimeNs, OutputGeneration, RouteGeneration};

#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    PrepareModels(Vec<VoiceFeature>),
    ActivateEnvironment(SessionId),
    OpenRoute {
        session_id: SessionId,
        generation: RouteGeneration,
        preferred_input: Option<String>,
        preferred_output: Option<String>,
    },
    StartRoute(RouteGeneration),
    CloseRoute(RouteGeneration),
    StopSession(SessionId),
    BeginRecognizer(CandidateId),
    ResetInput,
    EnqueueTts {
        turn_id: TurnId,
        segment_index: u32,
        text: String,
        language: String,
        voice: String,
        generation: OutputGeneration,
    },
    FinishTts(TurnId),
    SetOutputGeneration(OutputGeneration),
    RetireOutput {
        retiring: OutputGeneration,
        active: OutputGeneration,
    },
    CancelTts(TurnId),
    FadeOutput {
        turn_id: TurnId,
        generation: OutputGeneration,
        duration_ms: u32,
    },
    DropOutput(OutputGeneration),
    ScheduleRouteRetry {
        generation: RouteGeneration,
        attempt: usize,
        at: MonoTimeNs,
    },
    Emit(VoiceEvent),
    CandidateDiscarded {
        candidate_id: CandidateId,
        reason: InputDiscardReason,
    },
    SpeechCancelled {
        turn_id: TurnId,
        reason: SpeechCancelReason,
    },
}
