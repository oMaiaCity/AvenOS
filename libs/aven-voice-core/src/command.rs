use aven_voice_protocol::{
    CandidateId, ClientTurnKey, InputResetReason, RequestId, RouteSnapshot, SessionId,
    SpeechCancelReason, TurnId, VoiceFeature,
};

use crate::{MonoTimeNs, RouteGeneration};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RuntimeMetrics {
    pub capture_overruns: u64,
    pub reference_overruns: u64,
    pub render_underruns: u64,
    pub delay_hint_ms: Option<u32>,
    pub drift_correction_ppm: f32,
    pub render_rms: f32,
    pub render_peak: f32,
    pub raw_rms: f32,
    pub raw_peak: f32,
    pub clean_rms: f32,
    pub clean_peak: f32,
    pub clipped_fraction: f32,
    pub echo_return_loss_db: Option<f64>,
    pub echo_return_loss_enhancement_db: Option<f64>,
    pub residual_echo_likelihood: Option<f64>,
    pub vad_probability: f32,
    pub queued_seconds: f32,
    pub buffered_seconds: f32,
    pub capture_queue_fill: u32,
    pub capture_queue_capacity: u32,
    pub reference_queue_fill: u32,
    pub reference_queue_capacity: u32,
    pub render_queue_fill: u32,
    pub render_queue_capacity: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    Prepare {
        request_id: RequestId,
        features: Vec<VoiceFeature>,
    },
    StartSession {
        request_id: RequestId,
        preferred_input: Option<String>,
        preferred_output: Option<String>,
    },
    StopSession {
        request_id: RequestId,
        session_id: SessionId,
    },
    BeginSpeech {
        request_id: RequestId,
        session_id: SessionId,
        client_turn_key: Option<ClientTurnKey>,
        language: String,
        voice: String,
    },
    EnqueueSpeech {
        request_id: RequestId,
        session_id: SessionId,
        turn_id: TurnId,
        segment_index: u32,
        text: String,
    },
    FinishSpeech {
        request_id: RequestId,
        session_id: SessionId,
        turn_id: TurnId,
    },
    CancelSpeech {
        request_id: RequestId,
        session_id: SessionId,
        turn_id: Option<TurnId>,
        reason: SpeechCancelReason,
    },
    ResetInput {
        request_id: RequestId,
        session_id: SessionId,
        reason: InputResetReason,
    },
    SetDiagnostics {
        request_id: RequestId,
        session_id: SessionId,
        enabled: bool,
    },
    RetryRoute {
        request_id: RequestId,
        session_id: SessionId,
    },
}

impl Command {
    pub fn request_id(&self) -> &RequestId {
        match self {
            Self::Prepare { request_id, .. }
            | Self::StartSession { request_id, .. }
            | Self::StopSession { request_id, .. }
            | Self::BeginSpeech { request_id, .. }
            | Self::EnqueueSpeech { request_id, .. }
            | Self::FinishSpeech { request_id, .. }
            | Self::CancelSpeech { request_id, .. }
            | Self::ResetInput { request_id, .. }
            | Self::SetDiagnostics { request_id, .. }
            | Self::RetryRoute { request_id, .. } => request_id,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Observation {
    ModelsPrepared {
        input: bool,
        output: bool,
    },
    ModelsFailed {
        input: bool,
        output: bool,
    },
    EnvironmentActivated {
        session_id: SessionId,
    },
    RouteOpened {
        session_id: SessionId,
        generation: RouteGeneration,
        route: RouteSnapshot,
    },
    RouteStarted {
        session_id: SessionId,
        generation: RouteGeneration,
    },
    CaptureArrived {
        session_id: SessionId,
        generation: RouteGeneration,
        at: MonoTimeNs,
    },
    EchoChanged {
        generation: RouteGeneration,
        status: aven_voice_protocol::EchoStatus,
    },
    VadStarted {
        candidate_id: CandidateId,
        generation: RouteGeneration,
        far_end_active: bool,
        echo_status: aven_voice_protocol::EchoStatus,
        at: MonoTimeNs,
    },
    RecognizerPartial {
        candidate_id: CandidateId,
        generation: RouteGeneration,
        text: String,
        far_end_active: bool,
        safe_echo_continuous: bool,
    },
    RecognizerFinal {
        candidate_id: CandidateId,
        generation: RouteGeneration,
        text: String,
        far_end_active: bool,
        safe_echo_continuous: bool,
    },
    SpeakerEmbedding {
        candidate_id: CandidateId,
        generation: RouteGeneration,
        embedding: Vec<f32>,
    },
    NearEndEvidence {
        candidate_id: CandidateId,
        generation: RouteGeneration,
    },
    CandidateAdaptationReady {
        candidate_id: CandidateId,
        generation: RouteGeneration,
    },
    CandidateOverflow {
        candidate_id: CandidateId,
        generation: RouteGeneration,
    },
    InputModelFailed {
        candidate_id: Option<CandidateId>,
        generation: RouteGeneration,
    },
    PlaybackAudible {
        turn_id: TurnId,
        generation: crate::OutputGeneration,
    },
    SynthesisStarted {
        turn_id: TurnId,
        segment_index: u32,
        generation: crate::OutputGeneration,
    },
    SynthesisCompleted {
        turn_id: TurnId,
        segment_index: u32,
        generation: crate::OutputGeneration,
    },
    SynthesisFailed {
        turn_id: TurnId,
        generation: crate::OutputGeneration,
    },
    PlaybackDrained {
        turn_id: TurnId,
        generation: crate::OutputGeneration,
    },
    FadeDrained {
        turn_id: TurnId,
        generation: crate::OutputGeneration,
    },
    RouteFault {
        generation: RouteGeneration,
        recoverable: bool,
    },
    CallbacksStalled {
        session_id: SessionId,
        generation: RouteGeneration,
    },
    MetricsUpdated {
        generation: RouteGeneration,
        metrics: RuntimeMetrics,
    },
    RouteRetryDue {
        generation: RouteGeneration,
        attempt: usize,
    },
    DiagnosticsTick,
}
