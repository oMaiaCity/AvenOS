//! Semantic Rust/Tauri/TypeScript contract for the avenOS voice runtime.
//!
//! Audio never appears in these types. Large internal counters are represented
//! as validated decimal strings so the JSON contract is safe in JavaScript.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_ID_BYTES: usize = 64;
pub const MAX_SEGMENT_CHARS: usize = 512;

macro_rules! opaque_id {
    ($name:ident) => {
        #[derive(
            Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Deserialize, Serialize, TS,
        )]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn parse(value: impl Into<String>) -> Result<Self, ValidationError> {
                let value = value.into();
                validate_id(stringify!($name), &value)?;
                Ok(Self(value))
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
    };
}

opaque_id!(RequestId);
opaque_id!(SessionId);
opaque_id!(RouteId);
opaque_id!(CandidateId);
opaque_id!(SpeakerId);
opaque_id!(TurnId);
opaque_id!(ClientTurnKey);

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(transparent)]
pub struct DecimalU64(pub String);

impl DecimalU64 {
    pub fn new(value: u64) -> Self {
        Self(value.to_string())
    }

    pub fn parse(&self) -> Result<u64, ValidationError> {
        if self.0.is_empty()
            || (self.0.len() > 1 && self.0.starts_with('0'))
            || !self.0.bytes().all(|byte| byte.is_ascii_digit())
        {
            return Err(ValidationError::InvalidDecimal);
        }
        self.0.parse().map_err(|_| ValidationError::InvalidDecimal)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValidationError {
    InvalidId(&'static str),
    InvalidDecimal,
    InvalidProtocolVersion,
    InvalidText,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidId(kind) => write!(formatter, "invalid {kind}"),
            Self::InvalidDecimal => formatter.write_str("invalid decimal u64"),
            Self::InvalidProtocolVersion => formatter.write_str("unsupported protocol version"),
            Self::InvalidText => formatter.write_str("invalid speech segment"),
        }
    }
}

impl std::error::Error for ValidationError {}

fn validate_id(kind: &'static str, value: &str) -> Result<(), ValidationError> {
    if value.is_empty() || value.len() > MAX_ID_BYTES || !value.is_ascii() {
        return Err(ValidationError::InvalidId(kind));
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct CommandMeta {
    pub protocol_version: u16,
    pub request_id: RequestId,
}

impl CommandMeta {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.protocol_version != PROTOCOL_VERSION {
            return Err(ValidationError::InvalidProtocolVersion);
        }
        validate_id("RequestId", self.request_id.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum VoiceFeature {
    Input,
    Output,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ConversationMode {
    Conversation,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoicePrepareRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub features: Vec<VoiceFeature>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSessionStartRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub mode: ConversationMode,
    pub preferred_input: Option<String>,
    pub preferred_output: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSessionStopRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: SessionId,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSpeechBeginRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: SessionId,
    pub client_turn_key: Option<ClientTurnKey>,
    pub language: String,
    pub voice: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSpeechEnqueueRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: SessionId,
    pub turn_id: TurnId,
    pub segment_index: u32,
    pub text: String,
}

impl VoiceSpeechEnqueueRequest {
    pub fn validate_text(&self) -> Result<(), ValidationError> {
        let count = self.text.chars().count();
        if self.text.trim().is_empty() || count > MAX_SEGMENT_CHARS {
            return Err(ValidationError::InvalidText);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSpeechFinishRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: SessionId,
    pub turn_id: TurnId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum SpeechCancelReason {
    BargeIn,
    Manual,
    Muted,
    SessionStopped,
    Superseded,
    RouteFault,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSpeechCancelRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: SessionId,
    pub turn_id: Option<TurnId>,
    pub reason: SpeechCancelReason,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum InputResetReason {
    ConversationCleared,
    Manual,
    ModelRecovery,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceInputResetRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: SessionId,
    pub reason: InputResetReason,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSnapshotRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: Option<SessionId>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceDiagnosticsSubscribeRequest {
    #[serde(flatten)]
    #[ts(flatten)]
    pub meta: CommandMeta,
    pub session_id: SessionId,
    pub enabled: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeStatus {
    Dormant,
    Preparing,
    Ready,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Closed,
    Opening,
    Active,
    Suspended,
    Recovering,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CaptureStatus {
    Closed,
    Starting,
    Live,
    Denied,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackStatus {
    Silent,
    Synthesizing,
    Buffered,
    Playing,
    Fading,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum UtteranceStatus {
    Idle,
    Candidate,
    Confirmed,
    Finalizing,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum EchoStatus {
    Bypassed,
    Adapting,
    Converged,
    Degraded,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorkerStatus {
    Sleeping,
    Processing,
    Cancelling,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct PreparationSnapshot {
    pub runtime: RuntimeStatus,
    pub input_ready: bool,
    pub output_ready: bool,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSessionStarted {
    pub session_id: SessionId,
    pub snapshot: VoiceSnapshot,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct SpeechTurnStarted {
    pub turn_id: TurnId,
    pub pending_segment_capacity: u16,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct EnqueueResult {
    pub accepted: bool,
    pub idempotent: bool,
    pub remaining_segment_capacity: u16,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct SpeakerAttribution {
    pub speaker_id: SpeakerId,
    /// Cosine-based model confidence in the range 0..=1. A newly created
    /// anonymous cluster starts at 1 because no competing identity exists yet.
    pub confidence: f32,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceSnapshot {
    pub runtime: RuntimeStatus,
    pub session: SessionSnapshot,
    pub route: Option<RouteSnapshot>,
    pub capture: CaptureSnapshot,
    pub echo: EchoSnapshot,
    pub utterance: UtteranceSnapshot,
    pub recognizer: WorkerSnapshot,
    pub synthesis: SynthesisSnapshot,
    pub playback: PlaybackSnapshot,
    pub queues: Vec<QueueSnapshot>,
    pub workers: Vec<NamedWorkerSnapshot>,
    pub recent_errors: Vec<VoiceError>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct SessionSnapshot {
    pub status: SessionStatus,
    pub session_id: Option<SessionId>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct RouteSnapshot {
    pub route_id: RouteId,
    pub generation: DecimalU64,
    pub input_rate_hz: u32,
    pub input_channels: u16,
    pub output_rate_hz: u32,
    pub output_channels: u16,
    pub input_callback_frames: Option<u32>,
    pub output_callback_frames: Option<u32>,
    pub input_timestamp_quality: TimestampQuality,
    pub output_timestamp_quality: TimestampQuality,
    pub full_duplex_barge_in: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum TimestampQuality {
    Hardware,
    HostEstimated,
    CallbackOnly,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct CaptureSnapshot {
    pub status: CaptureStatus,
    pub callback_age_ms: Option<f64>,
    pub overruns: DecimalU64,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct EchoSnapshot {
    pub status: EchoStatus,
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
    pub reference_overruns: DecimalU64,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct UtteranceSnapshot {
    pub status: UtteranceStatus,
    pub candidate_id: Option<CandidateId>,
    pub vad_probability: f32,
    pub partial: String,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct WorkerSnapshot {
    pub status: WorkerStatus,
    pub last_duration_ms: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct SynthesisSnapshot {
    pub worker: WorkerSnapshot,
    pub turn_id: Option<TurnId>,
    pub segment_index: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct PlaybackSnapshot {
    pub status: PlaybackStatus,
    pub speaking: bool,
    pub queued_seconds: f32,
    pub buffered_seconds: f32,
    pub underruns: DecimalU64,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct QueueSnapshot {
    pub name: String,
    pub fill: u32,
    pub capacity: u32,
    pub milliseconds: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct NamedWorkerSnapshot {
    pub name: String,
    pub status: WorkerStatus,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ErrorSeverity {
    Info,
    Warning,
    Error,
    Fatal,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum VoiceErrorCode {
    PermissionDenied,
    EnvironmentUnavailable,
    NoInputDevice,
    NoOutputDevice,
    RouteOpenFailed,
    RouteInvalidated,
    CallbacksStalled,
    UnsupportedFormat,
    CaptureOverrun,
    RenderUnderrun,
    ReferenceOverrun,
    ClockUnstable,
    EchoFailed,
    EchoNotConverged,
    ModelNotPrepared,
    AsrFailed,
    TtsFailed,
    QueueFull,
    InvalidText,
    SegmentOutOfOrder,
    SegmentConflict,
    StaleSession,
    StaleTurn,
    StaleRoute,
    RequestConflict,
    ProtocolMismatch,
    Internal,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceError {
    pub code: VoiceErrorCode,
    pub severity: ErrorSeverity,
    pub retryable: bool,
    pub session_id: Option<SessionId>,
    pub turn_id: Option<TurnId>,
    pub candidate_id: Option<CandidateId>,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum InputDiscardReason {
    Empty,
    UnsafeEcho,
    Reset,
    Stale,
    Overflow,
    RouteChanged,
    ModelFailed,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
#[serde(tag = "type")]
pub enum VoiceEvent {
    #[serde(rename = "status.runtime")]
    StatusRuntime { status: RuntimeStatus },
    #[serde(rename = "status.session")]
    StatusSession { status: SessionStatus },
    #[serde(rename = "status.route")]
    StatusRoute { route: Option<RouteSnapshot> },
    #[serde(rename = "status.capture")]
    StatusCapture { status: CaptureStatus },
    #[serde(rename = "status.echo")]
    StatusEcho {
        status: EchoStatus,
        full_duplex_barge_in: bool,
    },
    #[serde(rename = "input.candidate_started")]
    InputCandidateStarted {
        candidate_id: CandidateId,
        far_end_active: bool,
    },
    #[serde(rename = "input.partial")]
    InputPartial {
        candidate_id: CandidateId,
        text: String,
    },
    #[serde(rename = "input.confirmed")]
    InputConfirmed {
        candidate_id: CandidateId,
        barge_in_started: bool,
    },
    #[serde(rename = "input.speaker_identified")]
    InputSpeakerIdentified {
        candidate_id: CandidateId,
        speaker: SpeakerAttribution,
    },
    #[serde(rename = "input.final")]
    InputFinal {
        candidate_id: CandidateId,
        text: String,
    },
    #[serde(rename = "input.discarded")]
    InputDiscarded {
        candidate_id: CandidateId,
        reason: InputDiscardReason,
    },
    #[serde(rename = "playback.turn_started")]
    PlaybackTurnStarted { turn_id: TurnId },
    #[serde(rename = "playback.segment_accepted")]
    PlaybackSegmentAccepted { turn_id: TurnId, segment_index: u32 },
    #[serde(rename = "playback.synthesis_started")]
    PlaybackSynthesisStarted { turn_id: TurnId, segment_index: u32 },
    #[serde(rename = "playback.synthesis_completed")]
    PlaybackSynthesisCompleted { turn_id: TurnId, segment_index: u32 },
    #[serde(rename = "playback.started")]
    PlaybackStarted { turn_id: TurnId },
    #[serde(rename = "playback.fading")]
    PlaybackFading { turn_id: TurnId, duration_ms: u32 },
    #[serde(rename = "playback.completed")]
    PlaybackCompleted { turn_id: TurnId },
    #[serde(rename = "playback.cancelled")]
    PlaybackCancelled {
        turn_id: TurnId,
        reason: SpeechCancelReason,
    },
    #[serde(rename = "playback.failed")]
    PlaybackFailed { turn_id: TurnId, error: VoiceError },
    #[serde(rename = "capacity.changed")]
    CapacityChanged {
        pending_segments: u16,
        synthesized_lead_ms: u32,
    },
    #[serde(rename = "diagnostics.snapshot")]
    DiagnosticsSnapshot { snapshot: Box<VoiceSnapshot> },
    #[serde(rename = "error.raised")]
    ErrorRaised { error: VoiceError },
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
pub struct VoiceEventEnvelope {
    pub protocol_version: u16,
    pub sequence: DecimalU64,
    pub session_id: Option<SessionId>,
    pub route_generation: Option<DecimalU64>,
    pub at_mono_ms: f64,
    pub event: VoiceEvent,
}

/// Produce the checked TypeScript contract from these Rust declarations.
pub fn generate_typescript() -> String {
    let config = ts_rs::Config::default();
    macro_rules! declarations {
        ($($type:ty),+ $(,)?) => {{
            let mut output = String::from(
                "// Generated by aven-voice-protocol. Do not edit.\n\n",
            );
            $(
                output.push_str("export ");
                output.push_str(&<$type as TS>::decl(&config));
                output.push_str("\n\n");
            )+
            output.truncate(output.trim_end_matches('\n').len());
            let mut normalized = output
                .lines()
                .map(str::trim_end)
                .collect::<Vec<_>>()
                .join("\n");
            normalized.push('\n');
            normalized
        }};
    }

    declarations!(
        RequestId,
        SessionId,
        RouteId,
        CandidateId,
        SpeakerId,
        TurnId,
        ClientTurnKey,
        DecimalU64,
        CommandMeta,
        VoiceFeature,
        ConversationMode,
        VoicePrepareRequest,
        VoiceSessionStartRequest,
        VoiceSessionStopRequest,
        VoiceSpeechBeginRequest,
        VoiceSpeechEnqueueRequest,
        VoiceSpeechFinishRequest,
        SpeechCancelReason,
        VoiceSpeechCancelRequest,
        InputResetReason,
        VoiceInputResetRequest,
        VoiceSnapshotRequest,
        VoiceDiagnosticsSubscribeRequest,
        RuntimeStatus,
        SessionStatus,
        CaptureStatus,
        PlaybackStatus,
        UtteranceStatus,
        EchoStatus,
        WorkerStatus,
        PreparationSnapshot,
        VoiceSessionStarted,
        SpeechTurnStarted,
        EnqueueResult,
        SpeakerAttribution,
        VoiceSnapshot,
        SessionSnapshot,
        TimestampQuality,
        RouteSnapshot,
        CaptureSnapshot,
        EchoSnapshot,
        UtteranceSnapshot,
        WorkerSnapshot,
        SynthesisSnapshot,
        PlaybackSnapshot,
        QueueSnapshot,
        NamedWorkerSnapshot,
        ErrorSeverity,
        VoiceErrorCode,
        VoiceError,
        InputDiscardReason,
        VoiceEvent,
        VoiceEventEnvelope,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers_are_small_ascii_opaque_values() {
        assert!(SessionId::parse("session-1").is_ok());
        assert!(SessionId::parse("").is_err());
        assert!(SessionId::parse("ü").is_err());
        assert!(SessionId::parse("a".repeat(65)).is_err());
    }

    #[test]
    fn decimal_u64_is_canonical_and_safe_on_the_wire() {
        let value = DecimalU64::new(u64::MAX);
        assert_eq!(value.parse(), Ok(u64::MAX));
        assert_eq!(
            serde_json::to_string(&value).unwrap(),
            format!("\"{}\"", u64::MAX)
        );
        for invalid in ["", "01", "-1", "1.0", " 1"] {
            assert!(DecimalU64(invalid.into()).parse().is_err());
        }
    }

    #[test]
    fn event_is_a_discriminated_semantic_union() {
        let event = VoiceEvent::InputConfirmed {
            candidate_id: CandidateId::parse("candidate-1").unwrap(),
            barge_in_started: true,
        };
        let json = serde_json::to_value(event).unwrap();
        assert_eq!(json["type"], "input.confirmed");
        assert!(json.get("pcm").is_none());
    }

    #[test]
    fn checked_typescript_is_current() {
        let checked = include_str!("../generated/voice-protocol.ts");
        assert_eq!(checked, generate_typescript());
        let application = include_str!("../../../app/src/lib/voice/protocol.ts");
        assert_eq!(application, generate_typescript());
    }
}
