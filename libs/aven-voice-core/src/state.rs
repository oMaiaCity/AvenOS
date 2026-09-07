use std::collections::{HashMap, VecDeque};

use aven_voice_protocol::{
    CandidateId, CaptureSnapshot, CaptureStatus, DecimalU64, EchoSnapshot, EchoStatus,
    ErrorSeverity, InputDiscardReason, NamedWorkerSnapshot, PlaybackSnapshot, PlaybackStatus,
    QueueSnapshot, RequestId, RouteSnapshot, RuntimeStatus, SessionId, SessionSnapshot,
    SessionStatus, SpeechCancelReason, SynthesisSnapshot, TurnId, UtteranceSnapshot,
    UtteranceStatus, VoiceError, VoiceErrorCode, VoiceEvent, VoiceSnapshot, WorkerSnapshot,
    WorkerStatus,
};
use unicode_normalization::UnicodeNormalization;

use crate::{
    Action, Command, CoreError, EventSequence, IdGenerator, MonoTimeNs, Observation,
    OutputGeneration, RouteGeneration, VoiceConfigV1,
};

const REQUEST_HISTORY: usize = 256;
const RETRY_DELAYS_MS: [u64; 5] = [100, 250, 500, 1_000, 2_000];

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CachedResult {
    Accepted,
    Session(SessionId),
    Turn(TurnId),
    Enqueued {
        idempotent: bool,
        remaining_capacity: usize,
    },
}

#[derive(Clone, Debug)]
struct RequestEntry {
    fingerprint: String,
    result: Result<CachedResult, CoreError>,
}

#[derive(Clone, Debug, Default)]
pub struct RequestLedger {
    order: VecDeque<RequestId>,
    entries: HashMap<RequestId, RequestEntry>,
}

impl RequestLedger {
    pub fn lookup(
        &self,
        request_id: &RequestId,
        fingerprint: &str,
    ) -> Option<Result<CachedResult, CoreError>> {
        self.entries.get(request_id).map(|entry| {
            if entry.fingerprint == fingerprint {
                entry.result.clone()
            } else {
                Err(CoreError::new(
                    VoiceErrorCode::RequestConflict,
                    "request ID was reused for a different command",
                ))
            }
        })
    }

    pub fn record(
        &mut self,
        request_id: RequestId,
        fingerprint: String,
        result: Result<CachedResult, CoreError>,
    ) {
        if self.entries.contains_key(&request_id) {
            return;
        }
        if self.order.len() == REQUEST_HISTORY {
            if let Some(oldest) = self.order.pop_front() {
                self.entries.remove(&oldest);
            }
        }
        self.order.push_back(request_id.clone());
        self.entries.insert(
            request_id,
            RequestEntry {
                fingerprint,
                result,
            },
        );
    }
}

#[derive(Clone, Debug)]
pub struct CandidateState {
    pub id: CandidateId,
    pub generation: RouteGeneration,
    pub unsafe_at_start: bool,
    pub unsafe_since_start: bool,
    pub confirmed: bool,
    pub partial: String,
    assistant_text: String,
    near_end_confident: bool,
    adaptation_ready_at_start: bool,
    speaker_embedding: Option<Vec<f32>>,
    speaker_published: bool,
}

#[derive(Clone, Debug)]
pub struct TurnState {
    pub id: TurnId,
    pub generation: OutputGeneration,
    pub segments: Vec<String>,
    pub started_segments: usize,
    pub finished: bool,
    pub speaking: bool,
    pub language: String,
    pub voice: String,
}

#[derive(Clone, Debug)]
pub struct RetiringTurnState {
    pub id: TurnId,
    pub generation: OutputGeneration,
    outcome: RetiringOutcome,
}

#[derive(Clone, Debug)]
enum RetiringOutcome {
    Cancelled(SpeechCancelReason),
    Failed(VoiceError),
}

#[derive(Debug)]
pub struct VoiceState {
    pub config: VoiceConfigV1,
    pub runtime: RuntimeStatus,
    pub session_status: SessionStatus,
    pub capture_status: CaptureStatus,
    pub playback_status: PlaybackStatus,
    pub utterance_status: UtteranceStatus,
    pub echo_status: EchoStatus,
    pub session_id: Option<SessionId>,
    last_session_id: Option<SessionId>,
    pub route_generation: RouteGeneration,
    pub output_generation: OutputGeneration,
    pub route: Option<RouteSnapshot>,
    pub event_sequence: EventSequence,
    pub candidate: Option<CandidateState>,
    pub turn: Option<TurnState>,
    last_turn_id: Option<TurnId>,
    pub retiring_turn: Option<RetiringTurnState>,
    pub retry_attempt: usize,
    pub input_ready: bool,
    pub output_ready: bool,
    requested_input: bool,
    requested_output: bool,
    last_capture_at: Option<MonoTimeNs>,
    preferred_input: Option<String>,
    preferred_output: Option<String>,
    diagnostics_enabled: bool,
    metrics: crate::RuntimeMetrics,
    recent_errors: VecDeque<VoiceError>,
    speaker_clusters: crate::SpeakerClusters,
    pub requests: RequestLedger,
    ids: IdGenerator,
}

impl VoiceState {
    pub fn new(boot_nonce: impl Into<String>, config: VoiceConfigV1) -> Self {
        Self {
            config,
            runtime: RuntimeStatus::Dormant,
            session_status: SessionStatus::Closed,
            capture_status: CaptureStatus::Closed,
            playback_status: PlaybackStatus::Silent,
            utterance_status: UtteranceStatus::Idle,
            echo_status: EchoStatus::Bypassed,
            session_id: None,
            last_session_id: None,
            route_generation: RouteGeneration(0),
            output_generation: OutputGeneration(0),
            route: None,
            event_sequence: EventSequence(0),
            candidate: None,
            turn: None,
            last_turn_id: None,
            retiring_turn: None,
            retry_attempt: 0,
            input_ready: false,
            output_ready: false,
            requested_input: false,
            requested_output: false,
            last_capture_at: None,
            preferred_input: None,
            preferred_output: None,
            diagnostics_enabled: false,
            metrics: crate::RuntimeMetrics::default(),
            recent_errors: VecDeque::with_capacity(8),
            speaker_clusters: crate::SpeakerClusters::default(),
            requests: RequestLedger::default(),
            ids: IdGenerator::new(boot_nonce).expect("voice boot nonce must be valid"),
        }
    }

    pub fn command(
        &mut self,
        command: Command,
        now: MonoTimeNs,
    ) -> (Result<CachedResult, CoreError>, Vec<Action>) {
        let request_id = command.request_id().clone();
        let fingerprint = format!("{command:?}");
        if let Some(result) = self.requests.lookup(&request_id, &fingerprint) {
            return (result, Vec::new());
        }
        let (result, actions) = self.apply_command(command, now);
        self.record_errors(&actions);
        self.requests
            .record(request_id, fingerprint, result.clone());
        (result, actions)
    }

    fn apply_command(
        &mut self,
        command: Command,
        _now: MonoTimeNs,
    ) -> (Result<CachedResult, CoreError>, Vec<Action>) {
        match command {
            Command::Prepare { features, .. } => {
                self.requested_input |=
                    features.contains(&aven_voice_protocol::VoiceFeature::Input);
                self.requested_output |=
                    features.contains(&aven_voice_protocol::VoiceFeature::Output);
                self.runtime = RuntimeStatus::Preparing;
                (
                    Ok(CachedResult::Accepted),
                    vec![
                        Action::Emit(VoiceEvent::StatusRuntime {
                            status: self.runtime,
                        }),
                        Action::PrepareModels(features),
                    ],
                )
            }
            Command::StartSession {
                preferred_input,
                preferred_output,
                ..
            } => {
                if !self.input_ready || !self.output_ready {
                    return (
                        Err(CoreError::new(
                            VoiceErrorCode::ModelNotPrepared,
                            "input and output models must be prepared before starting a voice session",
                        )),
                        Vec::new(),
                    );
                }
                let mut actions = Vec::new();
                if let Some(old) = self.session_id.take() {
                    let old_generation = self.route_generation;
                    self.last_session_id = Some(old.clone());
                    actions.extend(self.cancel_active_turn(SpeechCancelReason::Superseded));
                    actions.push(Action::CloseRoute(old_generation));
                    actions.push(Action::StopSession(old));
                }
                let session_id = self.ids.session();
                self.session_id = Some(session_id.clone());
                self.session_status = SessionStatus::Opening;
                self.capture_status = CaptureStatus::Starting;
                self.route_generation.0 += 1;
                self.candidate = None;
                self.speaker_clusters.reset();
                self.utterance_status = UtteranceStatus::Idle;
                self.echo_status = EchoStatus::Bypassed;
                self.metrics = crate::RuntimeMetrics::default();
                self.route = None;
                self.retry_attempt = 0;
                self.preferred_input = preferred_input;
                self.preferred_output = preferred_output;
                actions.push(Action::Emit(VoiceEvent::StatusSession {
                    status: self.session_status,
                }));
                actions.push(Action::ActivateEnvironment(session_id.clone()));
                (Ok(CachedResult::Session(session_id)), actions)
            }
            Command::StopSession { session_id, .. } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    if self.last_session_id.as_ref() == Some(&session_id) {
                        return (Ok(CachedResult::Accepted), Vec::new());
                    }
                    return self.stale_session();
                }
                let mut actions = self.cancel_active_turn(SpeechCancelReason::SessionStopped);
                self.discard_candidate(InputDiscardReason::Reset, &mut actions);
                self.speaker_clusters.reset();
                actions.push(Action::CloseRoute(self.route_generation));
                actions.push(Action::StopSession(session_id));
                self.last_session_id = self.session_id.take();
                self.session_status = SessionStatus::Closed;
                self.capture_status = CaptureStatus::Closed;
                self.echo_status = EchoStatus::Bypassed;
                self.metrics = crate::RuntimeMetrics::default();
                self.route = None;
                actions.push(Action::Emit(VoiceEvent::StatusSession {
                    status: SessionStatus::Closed,
                }));
                (Ok(CachedResult::Accepted), actions)
            }
            Command::BeginSpeech {
                session_id,
                language,
                voice,
                ..
            } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    return self.stale_session();
                }
                if self.session_status != SessionStatus::Active {
                    return (
                        Err(CoreError::new(
                            VoiceErrorCode::RouteOpenFailed,
                            "voice session is not active",
                        )),
                        Vec::new(),
                    );
                }
                if language.trim().is_empty() || voice.trim().is_empty() {
                    return (
                        Err(CoreError::new(
                            VoiceErrorCode::InvalidText,
                            "language and voice are required",
                        )),
                        Vec::new(),
                    );
                }
                let mut actions = self.cancel_active_turn(SpeechCancelReason::Superseded);
                let turn_id = self.ids.turn();
                self.output_generation.0 += 1;
                self.turn = Some(TurnState {
                    id: turn_id.clone(),
                    generation: self.output_generation,
                    segments: Vec::new(),
                    started_segments: 0,
                    finished: false,
                    speaking: false,
                    language,
                    voice,
                });
                self.playback_status = PlaybackStatus::Synthesizing;
                actions.push(Action::SetOutputGeneration(self.output_generation));
                actions.push(Action::Emit(VoiceEvent::PlaybackTurnStarted {
                    turn_id: turn_id.clone(),
                }));
                (Ok(CachedResult::Turn(turn_id)), actions)
            }
            Command::EnqueueSpeech {
                session_id,
                turn_id,
                segment_index,
                text,
                ..
            } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    return self.stale_session();
                }
                let Some(turn) = self.turn.as_mut().filter(|turn| turn.id == turn_id) else {
                    return self.stale_turn();
                };
                if turn.finished {
                    return self.stale_turn();
                }
                if text.trim().is_empty() || text.chars().count() > self.config.max_segment_chars {
                    return (
                        Err(CoreError::new(
                            VoiceErrorCode::InvalidText,
                            "speech segment is empty or too long",
                        )),
                        Vec::new(),
                    );
                }
                let index = segment_index as usize;
                if index < turn.segments.len() {
                    return if turn.segments[index] == text {
                        (
                            Ok(CachedResult::Enqueued {
                                idempotent: true,
                                remaining_capacity: self.config.max_queued_segments.saturating_sub(
                                    turn.segments.len().saturating_sub(turn.started_segments),
                                ),
                            }),
                            Vec::new(),
                        )
                    } else {
                        (
                            Err(CoreError::new(
                                VoiceErrorCode::SegmentConflict,
                                "segment index has different text",
                            )),
                            Vec::new(),
                        )
                    };
                }
                if index != turn.segments.len() {
                    return (
                        Err(CoreError::new(
                            VoiceErrorCode::SegmentOutOfOrder,
                            "segment index is not contiguous",
                        )),
                        Vec::new(),
                    );
                }
                let pending_segments = turn.segments.len().saturating_sub(turn.started_segments);
                if pending_segments == self.config.max_queued_segments {
                    return (
                        Err(CoreError::new(
                            VoiceErrorCode::QueueFull,
                            "speech segment queue is full",
                        )),
                        Vec::new(),
                    );
                }
                turn.segments.push(text.clone());
                let pending_segments = pending_segments + 1;
                let generation = turn.generation;
                let language = turn.language.clone();
                let voice = turn.voice.clone();
                (
                    Ok(CachedResult::Enqueued {
                        idempotent: false,
                        remaining_capacity: self
                            .config
                            .max_queued_segments
                            .saturating_sub(pending_segments),
                    }),
                    vec![
                        Action::EnqueueTts {
                            turn_id: turn_id.clone(),
                            segment_index,
                            text,
                            language,
                            voice,
                            generation,
                        },
                        Action::Emit(VoiceEvent::PlaybackSegmentAccepted {
                            turn_id,
                            segment_index,
                        }),
                        Action::Emit(VoiceEvent::CapacityChanged {
                            pending_segments: pending_segments.min(u16::MAX as usize) as u16,
                            synthesized_lead_ms: ((self.metrics.queued_seconds
                                + self.metrics.buffered_seconds)
                                * 1_000.0)
                                .max(0.0) as u32,
                        }),
                    ],
                )
            }
            Command::FinishSpeech {
                session_id,
                turn_id,
                ..
            } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    return self.stale_session();
                }
                let Some(turn) = self.turn.as_mut().filter(|turn| turn.id == turn_id) else {
                    if self.last_turn_id.as_ref() == Some(&turn_id) {
                        return (Ok(CachedResult::Accepted), Vec::new());
                    }
                    return self.stale_turn();
                };
                if turn.finished {
                    return (Ok(CachedResult::Accepted), Vec::new());
                }
                turn.finished = true;
                (Ok(CachedResult::Accepted), vec![Action::FinishTts(turn_id)])
            }
            Command::CancelSpeech {
                session_id,
                turn_id,
                reason,
                ..
            } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    if self.last_session_id.as_ref() == Some(&session_id) {
                        return (Ok(CachedResult::Accepted), Vec::new());
                    }
                    return self.stale_session();
                }
                if let Some(requested) = &turn_id {
                    if self
                        .turn
                        .as_ref()
                        .is_some_and(|active| requested == &active.id)
                    {
                        // matching active turn
                    } else if self.last_turn_id.as_ref() == Some(requested) {
                        return (Ok(CachedResult::Accepted), Vec::new());
                    } else {
                        return self.stale_turn();
                    }
                }
                let actions = self.cancel_active_turn(reason);
                (Ok(CachedResult::Accepted), actions)
            }
            Command::ResetInput { session_id, .. } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    return self.stale_session();
                }
                let mut actions = Vec::new();
                self.discard_candidate(InputDiscardReason::Reset, &mut actions);
                self.speaker_clusters.reset();
                actions.push(Action::ResetInput);
                (Ok(CachedResult::Accepted), actions)
            }
            Command::SetDiagnostics {
                session_id,
                enabled,
                ..
            } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    return self.stale_session();
                }
                self.diagnostics_enabled = enabled;
                (Ok(CachedResult::Accepted), Vec::new())
            }
            Command::RetryRoute { session_id, .. } => {
                if self.session_id.as_ref() != Some(&session_id) {
                    return self.stale_session();
                }
                self.retry_attempt = 0;
                self.route_generation.0 += 1;
                self.session_status = SessionStatus::Recovering;
                (
                    Ok(CachedResult::Accepted),
                    vec![Action::OpenRoute {
                        session_id,
                        generation: self.route_generation,
                        preferred_input: self.preferred_input.clone(),
                        preferred_output: self.preferred_output.clone(),
                    }],
                )
            }
        }
    }

    pub fn observe(&mut self, observation: Observation, now: MonoTimeNs) -> Vec<Action> {
        let mut actions = Vec::new();
        match observation {
            Observation::ModelsPrepared { input, output } => {
                self.input_ready |= input;
                self.output_ready |= output;
                let ready = (!self.requested_input || self.input_ready)
                    && (!self.requested_output || self.output_ready);
                if ready && self.runtime != RuntimeStatus::Ready {
                    self.runtime = RuntimeStatus::Ready;
                    actions.push(Action::Emit(VoiceEvent::StatusRuntime {
                        status: RuntimeStatus::Ready,
                    }));
                }
            }
            Observation::ModelsFailed { input, output } => {
                if (input && self.requested_input) || (output && self.requested_output) {
                    self.runtime = RuntimeStatus::Failed;
                    actions.push(Action::Emit(VoiceEvent::StatusRuntime {
                        status: RuntimeStatus::Failed,
                    }));
                    actions.push(Action::Emit(VoiceEvent::ErrorRaised {
                        error: VoiceError {
                            code: if output {
                                VoiceErrorCode::TtsFailed
                            } else {
                                VoiceErrorCode::AsrFailed
                            },
                            severity: ErrorSeverity::Error,
                            retryable: true,
                            session_id: self.session_id.clone(),
                            turn_id: self.turn.as_ref().map(|turn| turn.id.clone()),
                            candidate_id: self
                                .candidate
                                .as_ref()
                                .map(|candidate| candidate.id.clone()),
                            message: "On-device voice models could not be prepared.".into(),
                        },
                    }));
                }
            }
            Observation::EnvironmentActivated { session_id } => {
                if self.session_id.as_ref() == Some(&session_id) {
                    actions.push(Action::OpenRoute {
                        session_id,
                        generation: self.route_generation,
                        preferred_input: self.preferred_input.clone(),
                        preferred_output: self.preferred_output.clone(),
                    });
                }
            }
            Observation::RouteOpened {
                session_id,
                generation,
                route,
            } => {
                if self.session_id.as_ref() == Some(&session_id)
                    && generation == self.route_generation
                {
                    self.route = Some(route.clone());
                    actions.push(Action::Emit(VoiceEvent::StatusRoute { route: Some(route) }));
                    actions.push(Action::StartRoute(generation));
                }
            }
            Observation::RouteStarted {
                session_id,
                generation,
            } => {
                if self.session_id.as_ref() == Some(&session_id)
                    && generation == self.route_generation
                {
                    self.session_status = SessionStatus::Active;
                    self.retry_attempt = 0;
                    actions.push(Action::Emit(VoiceEvent::StatusSession {
                        status: SessionStatus::Active,
                    }));
                }
            }
            Observation::CaptureArrived {
                session_id,
                generation,
                at,
            } => {
                if self.session_id.as_ref() == Some(&session_id)
                    && generation == self.route_generation
                {
                    self.last_capture_at = Some(at);
                    if self.capture_status != CaptureStatus::Live {
                        self.capture_status = CaptureStatus::Live;
                        actions.push(Action::Emit(VoiceEvent::StatusCapture {
                            status: CaptureStatus::Live,
                        }));
                    }
                }
            }
            Observation::EchoChanged { generation, status } => {
                if generation == self.route_generation && self.echo_status != status {
                    self.echo_status = status;
                    let full_duplex_barge_in =
                        self.config.allow_full_duplex_barge_in && status == EchoStatus::Converged;
                    if let Some(route) = &mut self.route {
                        route.full_duplex_barge_in = full_duplex_barge_in;
                    }
                    actions.push(Action::Emit(VoiceEvent::StatusEcho {
                        status,
                        full_duplex_barge_in,
                    }));
                }
            }
            Observation::VadStarted {
                candidate_id,
                generation,
                far_end_active,
                echo_status,
                ..
            } => {
                if generation == self.route_generation && self.candidate.is_none() {
                    let unsafe_at_start = self.far_end_interval_is_unsafe(
                        far_end_active,
                        echo_status == EchoStatus::Converged,
                    );
                    self.candidate = Some(CandidateState {
                        id: candidate_id.clone(),
                        generation,
                        unsafe_at_start,
                        unsafe_since_start: unsafe_at_start,
                        confirmed: false,
                        partial: String::new(),
                        assistant_text: self
                            .turn
                            .as_ref()
                            .map(|turn| turn.segments.join(" "))
                            .unwrap_or_default(),
                        near_end_confident: false,
                        adaptation_ready_at_start: false,
                        speaker_embedding: None,
                        speaker_published: false,
                    });
                    self.utterance_status = UtteranceStatus::Candidate;
                    actions.push(Action::Emit(VoiceEvent::InputCandidateStarted {
                        candidate_id,
                        far_end_active,
                    }));
                }
            }
            Observation::NearEndEvidence {
                candidate_id,
                generation,
            } => {
                if self.candidate_matches(&candidate_id, generation) {
                    self.candidate.as_mut().unwrap().near_end_confident = true;
                }
            }
            Observation::CandidateAdaptationReady {
                candidate_id,
                generation,
            } => {
                if self.candidate_matches(&candidate_id, generation) {
                    self.candidate.as_mut().unwrap().adaptation_ready_at_start = true;
                }
            }
            Observation::RecognizerPartial {
                candidate_id,
                generation,
                text,
                far_end_active,
                safe_echo_continuous,
            } => {
                if self.candidate_matches(&candidate_id, generation) {
                    if self.far_end_interval_is_unsafe(far_end_active, safe_echo_continuous) {
                        self.candidate.as_mut().unwrap().unsafe_since_start = true;
                    }
                    let changed = self
                        .candidate
                        .as_ref()
                        .is_some_and(|candidate| candidate.partial != text);
                    if changed {
                        self.candidate.as_mut().unwrap().partial = text.clone();
                        actions.push(Action::Emit(VoiceEvent::InputPartial {
                            candidate_id: candidate_id.clone(),
                            text: text.clone(),
                        }));
                    }
                    if has_lexical_seed(&text)
                        && self.candidate_can_confirm(&text, far_end_active, safe_echo_continuous)
                    {
                        self.confirm_candidate(candidate_id, &mut actions);
                    }
                }
            }
            Observation::RecognizerFinal {
                candidate_id,
                generation,
                text,
                far_end_active,
                safe_echo_continuous,
            } => {
                if self.candidate_matches(&candidate_id, generation) {
                    if self.far_end_interval_is_unsafe(far_end_active, safe_echo_continuous) {
                        self.candidate.as_mut().unwrap().unsafe_since_start = true;
                    }
                    if !has_lexical_seed(&text) {
                        self.discard_candidate(InputDiscardReason::Empty, &mut actions);
                    } else if self
                        .candidate
                        .as_ref()
                        .is_some_and(|candidate| candidate.confirmed)
                        || self.candidate_can_confirm(&text, far_end_active, safe_echo_continuous)
                    {
                        if !self.candidate.as_ref().unwrap().confirmed {
                            self.confirm_candidate(candidate_id.clone(), &mut actions);
                        }
                        self.publish_candidate_speaker(&candidate_id, &mut actions);
                        actions.push(Action::Emit(VoiceEvent::InputFinal {
                            candidate_id,
                            text: text.nfkc().collect::<String>().trim().to_owned(),
                        }));
                        self.candidate = None;
                        self.utterance_status = UtteranceStatus::Idle;
                    } else {
                        self.discard_candidate(InputDiscardReason::UnsafeEcho, &mut actions);
                    }
                }
            }
            Observation::SpeakerEmbedding {
                candidate_id,
                generation,
                embedding,
            } => {
                if self.candidate_matches(&candidate_id, generation)
                    && !self.candidate.as_ref().unwrap().speaker_published
                {
                    self.candidate.as_mut().unwrap().speaker_embedding = Some(embedding);
                    self.publish_candidate_speaker(&candidate_id, &mut actions);
                }
            }
            Observation::CandidateOverflow {
                candidate_id,
                generation,
            } => {
                if self.candidate_matches(&candidate_id, generation) {
                    self.discard_candidate(InputDiscardReason::Overflow, &mut actions);
                }
            }
            Observation::InputModelFailed {
                candidate_id,
                generation,
            } => {
                if generation == self.route_generation
                    && candidate_id
                        .as_ref()
                        .is_none_or(|candidate_id| self.candidate_matches(candidate_id, generation))
                {
                    self.discard_candidate(InputDiscardReason::ModelFailed, &mut actions);
                }
            }
            Observation::PlaybackAudible {
                turn_id,
                generation,
            } => {
                if let Some(turn) = self
                    .turn
                    .as_mut()
                    .filter(|turn| turn.id == turn_id && turn.generation == generation)
                {
                    if !turn.speaking {
                        turn.speaking = true;
                        self.playback_status = PlaybackStatus::Playing;
                        actions.push(Action::Emit(VoiceEvent::PlaybackStarted { turn_id }));
                    }
                }
            }
            Observation::SynthesisStarted {
                turn_id,
                segment_index,
                generation,
            } => {
                if let Some(turn) = self
                    .turn
                    .as_mut()
                    .filter(|turn| turn.id == turn_id && turn.generation == generation)
                {
                    if turn.started_segments == segment_index as usize {
                        turn.started_segments += 1;
                    }
                    let pending_segments =
                        turn.segments.len().saturating_sub(turn.started_segments);
                    self.playback_status = PlaybackStatus::Synthesizing;
                    actions.push(Action::Emit(VoiceEvent::PlaybackSynthesisStarted {
                        turn_id,
                        segment_index,
                    }));
                    actions.push(Action::Emit(VoiceEvent::CapacityChanged {
                        pending_segments: pending_segments.min(u16::MAX as usize) as u16,
                        synthesized_lead_ms: ((self.metrics.queued_seconds
                            + self.metrics.buffered_seconds)
                            * 1_000.0)
                            .max(0.0) as u32,
                    }));
                }
            }
            Observation::SynthesisCompleted {
                turn_id,
                segment_index,
                generation,
            } => {
                if self
                    .turn
                    .as_ref()
                    .is_some_and(|turn| turn.id == turn_id && turn.generation == generation)
                {
                    self.playback_status = PlaybackStatus::Buffered;
                    actions.push(Action::Emit(VoiceEvent::PlaybackSynthesisCompleted {
                        turn_id,
                        segment_index,
                    }));
                }
            }
            Observation::SynthesisFailed {
                turn_id,
                generation,
            } => {
                if self
                    .turn
                    .as_ref()
                    .is_some_and(|turn| turn.id == turn_id && turn.generation == generation)
                {
                    actions.extend(self.fail_active_turn());
                }
            }
            Observation::PlaybackDrained {
                turn_id,
                generation,
            } => {
                if self.turn.as_ref().is_some_and(|turn| {
                    turn.id == turn_id && turn.generation == generation && turn.finished
                }) {
                    self.last_turn_id = self.turn.take().map(|turn| turn.id);
                    self.playback_status = PlaybackStatus::Silent;
                    actions.push(Action::Emit(VoiceEvent::PlaybackCompleted { turn_id }));
                }
            }
            Observation::FadeDrained {
                turn_id,
                generation,
            } => {
                if self
                    .retiring_turn
                    .as_ref()
                    .is_some_and(|turn| turn.id == turn_id && turn.generation == generation)
                {
                    let retired = self.retiring_turn.take().unwrap();
                    match retired.outcome {
                        RetiringOutcome::Cancelled(reason) => {
                            if self.turn.is_none() {
                                self.playback_status = PlaybackStatus::Silent;
                            }
                            actions.push(Action::Emit(VoiceEvent::PlaybackCancelled {
                                turn_id: retired.id,
                                reason,
                            }));
                        }
                        RetiringOutcome::Failed(error) => {
                            if self.turn.is_none() {
                                self.playback_status = PlaybackStatus::Failed;
                            }
                            actions.push(Action::Emit(VoiceEvent::PlaybackFailed {
                                turn_id: retired.id,
                                error,
                            }));
                        }
                    }
                }
            }
            Observation::RouteFault {
                generation,
                recoverable,
            } => {
                self.handle_route_fault(generation, recoverable, now, &mut actions);
            }
            Observation::CallbacksStalled {
                session_id,
                generation,
            } => {
                if self.session_id.as_ref() == Some(&session_id)
                    && generation == self.route_generation
                {
                    actions.push(Action::Emit(VoiceEvent::ErrorRaised {
                        error: VoiceError {
                            code: VoiceErrorCode::CallbacksStalled,
                            severity: ErrorSeverity::Error,
                            retryable: true,
                            session_id: Some(session_id),
                            turn_id: self.turn.as_ref().map(|turn| turn.id.clone()),
                            candidate_id: self
                                .candidate
                                .as_ref()
                                .map(|candidate| candidate.id.clone()),
                            message: "The microphone stopped delivering audio.".into(),
                        },
                    }));
                    self.handle_route_fault(generation, true, now, &mut actions);
                }
            }
            Observation::MetricsUpdated {
                generation,
                metrics,
            } => {
                if generation == self.route_generation {
                    self.metrics = metrics;
                }
            }
            Observation::RouteRetryDue {
                generation,
                attempt,
            } => {
                if generation == self.route_generation
                    && attempt == self.retry_attempt
                    && self.session_status == SessionStatus::Recovering
                {
                    if let Some(session_id) = self.session_id.clone() {
                        actions.push(Action::OpenRoute {
                            session_id,
                            generation,
                            preferred_input: self.preferred_input.clone(),
                            preferred_output: self.preferred_output.clone(),
                        });
                    }
                }
            }
            Observation::DiagnosticsTick => {
                if self.diagnostics_enabled && self.session_id.is_some() {
                    actions.push(Action::Emit(VoiceEvent::DiagnosticsSnapshot {
                        snapshot: Box::new(self.snapshot(now)),
                    }));
                }
            }
        }
        self.record_errors(&actions);
        actions
    }

    /// A coherent semantic snapshot taken by the coordinator thread.
    /// Device descriptors and detailed DSP metrics are filled by the runtime
    /// composition layer, which owns those facts but not semantic state.
    pub fn snapshot(&self, now: MonoTimeNs) -> VoiceSnapshot {
        let worker = |status| WorkerSnapshot {
            status,
            last_duration_ms: None,
        };
        VoiceSnapshot {
            runtime: self.runtime,
            session: SessionSnapshot {
                status: self.session_status,
                session_id: self.session_id.clone(),
            },
            route: self.route.clone(),
            capture: CaptureSnapshot {
                status: self.capture_status,
                callback_age_ms: self
                    .last_capture_at
                    .map(|at| now.elapsed_since(at) as f64 / 1_000_000.0),
                overruns: DecimalU64::new(self.metrics.capture_overruns),
            },
            echo: EchoSnapshot {
                status: self.echo_status,
                delay_hint_ms: self.metrics.delay_hint_ms,
                drift_correction_ppm: self.metrics.drift_correction_ppm,
                render_rms: self.metrics.render_rms,
                render_peak: self.metrics.render_peak,
                raw_rms: self.metrics.raw_rms,
                raw_peak: self.metrics.raw_peak,
                clean_rms: self.metrics.clean_rms,
                clean_peak: self.metrics.clean_peak,
                clipped_fraction: self.metrics.clipped_fraction,
                echo_return_loss_db: self.metrics.echo_return_loss_db,
                echo_return_loss_enhancement_db: self.metrics.echo_return_loss_enhancement_db,
                residual_echo_likelihood: self.metrics.residual_echo_likelihood,
                reference_overruns: DecimalU64::new(self.metrics.reference_overruns),
            },
            utterance: UtteranceSnapshot {
                status: self.utterance_status,
                candidate_id: self
                    .candidate
                    .as_ref()
                    .map(|candidate| candidate.id.clone()),
                vad_probability: self.metrics.vad_probability,
                partial: self
                    .candidate
                    .as_ref()
                    .map(|candidate| candidate.partial.clone())
                    .unwrap_or_default(),
            },
            recognizer: worker(if self.candidate.is_some() {
                WorkerStatus::Processing
            } else {
                WorkerStatus::Sleeping
            }),
            synthesis: SynthesisSnapshot {
                worker: worker(if self.turn.is_some() {
                    WorkerStatus::Processing
                } else {
                    WorkerStatus::Sleeping
                }),
                turn_id: self.turn.as_ref().map(|turn| turn.id.clone()),
                segment_index: self
                    .turn
                    .as_ref()
                    .and_then(|turn| turn.segments.len().checked_sub(1))
                    .map(|index| index as u32),
            },
            playback: PlaybackSnapshot {
                status: self.playback_status,
                speaking: self.turn.as_ref().is_some_and(|turn| turn.speaking),
                queued_seconds: self.metrics.queued_seconds,
                buffered_seconds: self.metrics.buffered_seconds,
                underruns: DecimalU64::new(self.metrics.render_underruns),
            },
            queues: self.queue_snapshots(),
            workers: self.worker_snapshots(),
            recent_errors: self.recent_errors.iter().cloned().collect(),
        }
    }

    fn queue_snapshots(&self) -> Vec<QueueSnapshot> {
        let queue = |name: &str, fill: u32, capacity: u32, milliseconds| QueueSnapshot {
            name: name.into(),
            fill,
            capacity,
            milliseconds,
        };
        vec![
            queue(
                "capture",
                self.metrics.capture_queue_fill,
                self.metrics.capture_queue_capacity,
                Some(self.metrics.capture_queue_fill.saturating_mul(10)),
            ),
            queue(
                "render-reference",
                self.metrics.reference_queue_fill,
                self.metrics.reference_queue_capacity,
                Some(self.metrics.reference_queue_fill.saturating_mul(10)),
            ),
            queue(
                "device-ready-render",
                self.metrics.render_queue_fill,
                self.metrics.render_queue_capacity,
                Some(self.metrics.render_queue_fill.saturating_mul(10)),
            ),
            queue(
                "synthesized-lead-ms",
                (self.metrics.buffered_seconds.max(0.0) * 1_000.0) as u32,
                self.config.max_synthesized_lead_ms,
                Some((self.metrics.buffered_seconds.max(0.0) * 1_000.0) as u32),
            ),
        ]
    }

    fn worker_snapshots(&self) -> Vec<NamedWorkerSnapshot> {
        let active = self.session_id.is_some() && self.session_status != SessionStatus::Closed;
        let named = |name: &str, status| NamedWorkerSnapshot {
            name: name.into(),
            status,
        };
        vec![
            named("coordinator", WorkerStatus::Processing),
            named(
                "host-control",
                if matches!(
                    self.session_status,
                    SessionStatus::Opening | SessionStatus::Recovering
                ) {
                    WorkerStatus::Processing
                } else {
                    WorkerStatus::Sleeping
                },
            ),
            named(
                "dsp",
                if active {
                    WorkerStatus::Processing
                } else {
                    WorkerStatus::Sleeping
                },
            ),
            named(
                "input-model",
                if self.candidate.is_some() {
                    WorkerStatus::Processing
                } else {
                    WorkerStatus::Sleeping
                },
            ),
            named(
                "tts",
                if self.turn.is_some() {
                    WorkerStatus::Processing
                } else {
                    WorkerStatus::Sleeping
                },
            ),
            named(
                "output-preparation",
                if self.turn.is_some() {
                    WorkerStatus::Processing
                } else {
                    WorkerStatus::Sleeping
                },
            ),
        ]
    }

    fn record_errors(&mut self, actions: &[Action]) {
        for error in actions.iter().filter_map(|action| match action {
            Action::Emit(VoiceEvent::ErrorRaised { error }) => Some(error.clone()),
            _ => None,
        }) {
            if self.recent_errors.len() == 8 {
                self.recent_errors.pop_front();
            }
            self.recent_errors.push_back(error);
        }
    }

    fn confirm_candidate(&mut self, candidate_id: CandidateId, actions: &mut Vec<Action>) {
        if self
            .candidate
            .as_ref()
            .is_none_or(|candidate| candidate.confirmed)
        {
            return;
        }
        self.candidate.as_mut().unwrap().confirmed = true;
        self.utterance_status = UtteranceStatus::Confirmed;
        let barge_in_started = self.turn.is_some();
        if barge_in_started {
            actions.extend(self.cancel_active_turn(SpeechCancelReason::BargeIn));
        }
        actions.push(Action::Emit(VoiceEvent::InputConfirmed {
            candidate_id: candidate_id.clone(),
            barge_in_started,
        }));
        self.publish_candidate_speaker(&candidate_id, actions);
    }

    fn publish_candidate_speaker(&mut self, candidate_id: &CandidateId, actions: &mut Vec<Action>) {
        let embedding = self.candidate.as_mut().and_then(|candidate| {
            (candidate.id == *candidate_id && candidate.confirmed && !candidate.speaker_published)
                .then(|| candidate.speaker_embedding.take())
                .flatten()
        });
        let Some(embedding) = embedding else {
            return;
        };
        if let Some(speaker) = self.speaker_clusters.assign(embedding) {
            self.candidate.as_mut().unwrap().speaker_published = true;
            actions.push(Action::Emit(VoiceEvent::InputSpeakerIdentified {
                candidate_id: candidate_id.clone(),
                speaker,
            }));
        }
    }

    fn candidate_matches(&self, candidate_id: &CandidateId, generation: RouteGeneration) -> bool {
        generation == self.route_generation
            && self.candidate.as_ref().is_some_and(|candidate| {
                &candidate.id == candidate_id && candidate.generation == generation
            })
    }

    fn candidate_can_confirm(
        &self,
        text: &str,
        far_end_active: bool,
        safe_echo_continuous: bool,
    ) -> bool {
        let output_turn_active = self.turn.is_some() || far_end_active;
        self.candidate.as_ref().is_some_and(|candidate| {
            let strictly_safe = !candidate.unsafe_at_start
                && !candidate.unsafe_since_start
                && (!output_turn_active
                    || (self.config.allow_full_duplex_barge_in && safe_echo_continuous));
            strictly_safe
                || (self.config.allow_full_duplex_barge_in
                    && self.config.allow_tester_adapting_barge_in
                    && candidate.unsafe_since_start
                    && candidate.adaptation_ready_at_start
                    && candidate.near_end_confident
                    && self.echo_status == EchoStatus::Adapting
                    && !looks_like_narration_echo(text, &candidate.assistant_text))
        })
    }

    fn far_end_interval_is_unsafe(&self, far_end_active: bool, safe_echo_continuous: bool) -> bool {
        // Guard the whole semantic output turn. A brief silent render frame is
        // only a word gap; it must not open a feedback path while narration is
        // still active.
        let output_turn_active = self.turn.is_some() || far_end_active;
        if !self.config.allow_full_duplex_barge_in {
            output_turn_active
        } else {
            output_turn_active && !safe_echo_continuous
        }
    }

    fn discard_candidate(&mut self, reason: InputDiscardReason, actions: &mut Vec<Action>) {
        if let Some(candidate) = self.candidate.take() {
            self.utterance_status = UtteranceStatus::Idle;
            actions.push(Action::CandidateDiscarded {
                candidate_id: candidate.id.clone(),
                reason,
            });
            actions.push(Action::Emit(VoiceEvent::InputDiscarded {
                candidate_id: candidate.id,
                reason,
            }));
        }
    }

    fn cancel_active_turn(&mut self, reason: SpeechCancelReason) -> Vec<Action> {
        let Some(turn) = self.turn.take() else {
            return Vec::new();
        };
        self.last_turn_id = Some(turn.id.clone());
        let retiring = turn.generation;
        self.output_generation.0 += 1;
        self.playback_status = PlaybackStatus::Fading;
        self.retiring_turn = Some(RetiringTurnState {
            id: turn.id.clone(),
            generation: retiring,
            outcome: RetiringOutcome::Cancelled(reason),
        });
        vec![
            Action::RetireOutput {
                retiring,
                active: self.output_generation,
            },
            Action::CancelTts(turn.id.clone()),
            Action::FadeOutput {
                turn_id: turn.id.clone(),
                generation: retiring,
                duration_ms: self.config.output_fade_ms,
            },
            Action::Emit(VoiceEvent::PlaybackFading {
                turn_id: turn.id.clone(),
                duration_ms: self.config.output_fade_ms,
            }),
            Action::SpeechCancelled {
                turn_id: turn.id,
                reason,
            },
        ]
    }

    fn fail_active_turn(&mut self) -> Vec<Action> {
        let Some(turn) = self.turn.take() else {
            return Vec::new();
        };
        self.last_turn_id = Some(turn.id.clone());
        let retiring = turn.generation;
        self.output_generation.0 += 1;
        self.playback_status = PlaybackStatus::Fading;
        self.retiring_turn = Some(RetiringTurnState {
            id: turn.id.clone(),
            generation: retiring,
            outcome: RetiringOutcome::Failed(VoiceError {
                code: VoiceErrorCode::TtsFailed,
                severity: ErrorSeverity::Error,
                retryable: true,
                session_id: self.session_id.clone(),
                turn_id: Some(turn.id.clone()),
                candidate_id: None,
                message: "Speech synthesis failed.".into(),
            }),
        });
        vec![
            Action::RetireOutput {
                retiring,
                active: self.output_generation,
            },
            Action::CancelTts(turn.id.clone()),
            Action::FadeOutput {
                turn_id: turn.id.clone(),
                generation: retiring,
                duration_ms: self.config.output_fade_ms,
            },
            Action::Emit(VoiceEvent::PlaybackFading {
                turn_id: turn.id,
                duration_ms: self.config.output_fade_ms,
            }),
        ]
    }

    fn schedule_retry(&mut self, now: MonoTimeNs, actions: &mut Vec<Action>) {
        if self.retry_attempt >= RETRY_DELAYS_MS.len() {
            self.session_status = SessionStatus::Suspended;
            self.capture_status = CaptureStatus::Failed;
            actions.push(Action::Emit(VoiceEvent::StatusSession {
                status: SessionStatus::Suspended,
            }));
            actions.push(Action::Emit(VoiceEvent::StatusCapture {
                status: CaptureStatus::Failed,
            }));
            actions.push(Action::Emit(VoiceEvent::ErrorRaised {
                error: VoiceError {
                    code: VoiceErrorCode::RouteOpenFailed,
                    severity: ErrorSeverity::Error,
                    retryable: true,
                    session_id: self.session_id.clone(),
                    turn_id: None,
                    candidate_id: None,
                    message: "The audio route could not be recovered.".into(),
                },
            }));
            return;
        }
        let attempt = self.retry_attempt;
        self.retry_attempt += 1;
        actions.push(Action::ScheduleRouteRetry {
            generation: self.route_generation,
            attempt: self.retry_attempt,
            at: MonoTimeNs(now.0 + RETRY_DELAYS_MS[attempt] * 1_000_000),
        });
    }

    fn handle_route_fault(
        &mut self,
        generation: RouteGeneration,
        recoverable: bool,
        now: MonoTimeNs,
        actions: &mut Vec<Action>,
    ) {
        if generation != self.route_generation
            || self.session_id.is_none()
            || self.session_status == SessionStatus::Closed
        {
            return;
        }
        self.route_generation.0 += 1;
        self.session_status = if recoverable {
            SessionStatus::Recovering
        } else {
            SessionStatus::Suspended
        };
        self.capture_status = if recoverable {
            CaptureStatus::Starting
        } else {
            CaptureStatus::Failed
        };
        self.echo_status = EchoStatus::Degraded;
        self.metrics = crate::RuntimeMetrics::default();
        self.route = None;
        actions.push(Action::Emit(VoiceEvent::StatusRoute { route: None }));
        actions.push(Action::Emit(VoiceEvent::StatusSession {
            status: self.session_status,
        }));
        actions.push(Action::Emit(VoiceEvent::StatusCapture {
            status: self.capture_status,
        }));
        self.discard_candidate(InputDiscardReason::RouteChanged, actions);
        actions.extend(self.cancel_active_turn(SpeechCancelReason::RouteFault));
        actions.push(Action::CloseRoute(generation));
        if recoverable {
            self.schedule_retry(now, actions);
        }
    }

    fn stale_session(&self) -> (Result<CachedResult, CoreError>, Vec<Action>) {
        (
            Err(CoreError::new(
                VoiceErrorCode::StaleSession,
                "session is stale",
            )),
            Vec::new(),
        )
    }

    fn stale_turn(&self) -> (Result<CachedResult, CoreError>, Vec<Action>) {
        (
            Err(CoreError::new(VoiceErrorCode::StaleTurn, "turn is stale")),
            Vec::new(),
        )
    }
}

pub fn has_lexical_seed(text: &str) -> bool {
    text.nfkc()
        .collect::<String>()
        .split_whitespace()
        .any(|token| {
            token
                .chars()
                .filter(|character| character.is_alphabetic())
                .take(2)
                .count()
                >= 2
        })
}

fn looks_like_narration_echo(text: &str, narration: &str) -> bool {
    let heard = compact_lexical(text);
    let spoken = compact_lexical(narration);
    if heard.is_empty() || spoken.is_empty() {
        return false;
    }
    if spoken.windows(heard.len()).any(|window| window == heard) {
        return true;
    }
    if heard.len() < 6 {
        return false;
    }
    let window_len = heard.len().min(spoken.len());
    spoken.windows(window_len).any(|window| {
        let distance = levenshtein(&heard, window);
        1.0 - distance as f32 / heard.len().max(window.len()) as f32 >= 0.68
    })
}

fn compact_lexical(text: &str) -> Vec<char> {
    text.nfkc()
        .flat_map(|character| character.to_lowercase())
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn levenshtein(left: &[char], right: &[char]) -> usize {
    let mut previous = (0..=right.len()).collect::<Vec<_>>();
    let mut current = vec![0; right.len() + 1];
    for (left_index, left_character) in left.iter().enumerate() {
        current[0] = left_index + 1;
        for (right_index, right_character) in right.iter().enumerate() {
            current[right_index + 1] = (current[right_index] + 1)
                .min(previous[right_index + 1] + 1)
                .min(previous[right_index] + usize::from(left_character != right_character));
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[right.len()]
}

#[cfg(test)]
mod tests {
    use super::*;
    use aven_voice_protocol::{ClientTurnKey, RequestId};
    use proptest::prelude::*;

    fn request(value: &str) -> RequestId {
        RequestId::parse(value).unwrap()
    }

    fn active_state() -> (VoiceState, SessionId) {
        let config = VoiceConfigV1 {
            allow_full_duplex_barge_in: true,
            ..VoiceConfigV1::default()
        };
        let mut state = VoiceState::new("test", config);
        let (prepared, _) = state.command(
            Command::Prepare {
                request_id: request("prepare"),
                features: vec![
                    aven_voice_protocol::VoiceFeature::Input,
                    aven_voice_protocol::VoiceFeature::Output,
                ],
            },
            MonoTimeNs(0),
        );
        prepared.expect("prepare command should be accepted");
        state.observe(
            Observation::ModelsPrepared {
                input: true,
                output: true,
            },
            MonoTimeNs(0),
        );
        let (result, _) = state.command(
            Command::StartSession {
                request_id: request("start"),
                preferred_input: None,
                preferred_output: None,
            },
            MonoTimeNs(0),
        );
        let CachedResult::Session(session) = result.unwrap() else {
            panic!("expected session")
        };
        state.observe(
            Observation::RouteStarted {
                session_id: session.clone(),
                generation: state.route_generation,
            },
            MonoTimeNs(0),
        );
        (state, session)
    }

    fn begin_turn(state: &mut VoiceState, session: &SessionId) -> TurnId {
        begin_turn_with(state, session, "begin")
    }

    fn begin_turn_with(state: &mut VoiceState, session: &SessionId, request_id: &str) -> TurnId {
        let (result, _) = state.command(
            Command::BeginSpeech {
                request_id: request(request_id),
                session_id: session.clone(),
                client_turn_key: Some(ClientTurnKey::parse("client-turn").unwrap()),
                language: "de".into(),
                voice: "M1".into(),
            },
            MonoTimeNs(0),
        );
        let CachedResult::Turn(turn) = result.unwrap() else {
            panic!("expected turn")
        };
        turn
    }

    #[test]
    fn vad_never_interrupts_but_safe_lexical_evidence_does_in_order() {
        let (mut state, session) = active_state();
        let turn = begin_turn(&mut state, &session);
        let vad = state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-safe").unwrap(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Converged,
                at: MonoTimeNs(1),
            },
            MonoTimeNs(1),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();
        assert!(!vad
            .iter()
            .any(|action| matches!(action, Action::CancelTts(_))));

        let confirmed = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Hallo".into(),
                far_end_active: true,
                safe_echo_continuous: true,
            },
            MonoTimeNs(2),
        );
        let retire = confirmed
            .iter()
            .position(|action| matches!(action, Action::RetireOutput { .. }))
            .unwrap();
        assert_eq!(confirmed[retire + 1], Action::CancelTts(turn));
        assert!(matches!(
            confirmed[retire + 2],
            Action::FadeOutput {
                duration_ms: 80,
                ..
            }
        ));
        assert!(matches!(
            confirmed.last(),
            Some(Action::Emit(VoiceEvent::InputConfirmed { .. }))
        ));
    }

    #[test]
    fn candidate_opened_under_unsafe_echo_can_never_promote() {
        let (mut state, _) = active_state();
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-unsafe").unwrap(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Adapting,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();
        let partial = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Das ist Sprache".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(1),
        );
        assert!(!partial
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::InputConfirmed { .. }))));
        let final_actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Das ist Sprache".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(2),
        );
        assert!(final_actions.iter().any(|action| matches!(
            action,
            Action::CandidateDiscarded {
                reason: InputDiscardReason::UnsafeEcho,
                ..
            }
        )));
    }

    #[test]
    fn one_unsafe_far_end_interval_poisoned_the_candidate_until_it_ends() {
        let (mut state, _) = active_state();
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-before-output").unwrap(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Bypassed,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();
        let unsafe_partial = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Hallo dort".into(),
                far_end_active: true,
                safe_echo_continuous: false,
            },
            MonoTimeNs(1),
        );
        assert!(!unsafe_partial
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::InputConfirmed { .. }))));

        let safe_partial = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Hallo dort!".into(),
                far_end_active: true,
                safe_echo_continuous: true,
            },
            MonoTimeNs(2),
        );
        assert!(!safe_partial
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::InputConfirmed { .. }))));
    }

    #[test]
    fn release_gate_blocks_far_end_barge_in_even_when_echo_reports_converged() {
        let (mut state, _) = active_state();
        state.config.allow_full_duplex_barge_in = false;
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-gated").unwrap(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Converged,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();
        let actions = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Hallo dort".into(),
                far_end_active: true,
                safe_echo_continuous: true,
            },
            MonoTimeNs(1),
        );
        assert!(!actions
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::InputConfirmed { .. }))));
    }

    #[test]
    fn release_gate_discards_far_end_candidate_after_output_becomes_silent() {
        let (mut state, _) = active_state();
        state.config.allow_full_duplex_barge_in = false;
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-delayed-gate").unwrap(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Converged,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();

        let actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Narrated answer picked up by the microphone".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(1),
        );

        assert!(!actions.iter().any(|action| matches!(
            action,
            Action::Emit(VoiceEvent::InputConfirmed { .. } | VoiceEvent::InputFinal { .. })
        )));
        assert!(actions.iter().any(|action| matches!(
            action,
            Action::CandidateDiscarded {
                reason: InputDiscardReason::UnsafeEcho,
                ..
            }
        )));
    }

    #[test]
    fn release_gate_latches_far_end_overlap_until_candidate_ends() {
        let (mut state, _) = active_state();
        state.config.allow_full_duplex_barge_in = false;
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-overlap-gate").unwrap(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Converged,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();

        state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Narrated answer".into(),
                far_end_active: true,
                safe_echo_continuous: true,
            },
            MonoTimeNs(1),
        );
        let actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Narrated answer continued".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(2),
        );

        assert!(!actions.iter().any(|action| matches!(
            action,
            Action::Emit(VoiceEvent::InputConfirmed { .. } | VoiceEvent::InputFinal { .. })
        )));
        assert!(actions.iter().any(|action| matches!(
            action,
            Action::CandidateDiscarded {
                reason: InputDiscardReason::UnsafeEcho,
                ..
            }
        )));
    }

    #[test]
    fn release_gate_treats_render_silence_inside_an_active_turn_as_guarded() {
        let (mut state, session) = active_state();
        state.config.allow_full_duplex_barge_in = false;
        let turn = begin_turn(&mut state, &session);
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-render-gap").unwrap(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Bypassed,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();

        let actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Words captured during a narration pause".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(1),
        );

        assert!(!actions.iter().any(|action| matches!(
            action,
            Action::CancelTts(_) | Action::Emit(VoiceEvent::InputFinal { .. })
        )));
        assert_eq!(state.turn.as_ref().map(|active| &active.id), Some(&turn));
        assert!(actions.iter().any(|action| matches!(
            action,
            Action::CandidateDiscarded {
                reason: InputDiscardReason::UnsafeEcho,
                ..
            }
        )));
    }

    #[test]
    fn unsafe_echo_cannot_confirm_during_a_render_gap_with_full_duplex_enabled() {
        let (mut state, session) = active_state();
        state.config.allow_full_duplex_barge_in = true;
        let turn = begin_turn(&mut state, &session);
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-unsafe-render-gap").unwrap(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Bypassed,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();

        let partial = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Das klingt wie ein echtes Wort".into(),
                far_end_active: false,
                safe_echo_continuous: false,
            },
            MonoTimeNs(1),
        );
        assert!(!partial.iter().any(|action| matches!(
            action,
            Action::CancelTts(_) | Action::Emit(VoiceEvent::InputConfirmed { .. })
        )));
        assert_eq!(state.turn.as_ref().map(|active| &active.id), Some(&turn));

        let final_actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Das klingt wie ein echtes Wort".into(),
                far_end_active: false,
                safe_echo_continuous: false,
            },
            MonoTimeNs(2),
        );
        assert!(final_actions.iter().any(|action| matches!(
            action,
            Action::CandidateDiscarded {
                reason: InputDiscardReason::UnsafeEcho,
                ..
            }
        )));
        assert_eq!(state.turn.as_ref().map(|active| &active.id), Some(&turn));
    }

    #[test]
    fn explicit_tester_fallback_interrupts_on_non_echo_near_end_speech() {
        let (mut state, session) = active_state();
        state.config.allow_tester_adapting_barge_in = true;
        let turn = begin_turn(&mut state, &session);
        state
            .command(
                Command::EnqueueSpeech {
                    request_id: request("tester-segment"),
                    session_id: session,
                    turn_id: turn.clone(),
                    segment_index: 0,
                    text: "Gern. Ich fasse zuerst die wichtigsten Aufgaben zusammen.".into(),
                },
                MonoTimeNs(0),
            )
            .0
            .unwrap();
        state.observe(
            Observation::EchoChanged {
                generation: state.route_generation,
                status: EchoStatus::Adapting,
            },
            MonoTimeNs(0),
        );
        let candidate = CandidateId::parse("candidate-tester-user").unwrap();
        state.observe(
            Observation::VadStarted {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Adapting,
                at: MonoTimeNs(1),
            },
            MonoTimeNs(1),
        );
        state.observe(
            Observation::CandidateAdaptationReady {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
            },
            MonoTimeNs(1),
        );
        state.observe(
            Observation::NearEndEvidence {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
            },
            MonoTimeNs(2),
        );

        let actions = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Stopp, wie meinst du das?".into(),
                far_end_active: true,
                safe_echo_continuous: false,
            },
            MonoTimeNs(3),
        );

        assert!(actions
            .iter()
            .any(|action| matches!(action, Action::CancelTts(observed) if observed == &turn)));
        assert!(actions.iter().any(|action| matches!(
            action,
            Action::Emit(VoiceEvent::InputConfirmed {
                barge_in_started: true,
                ..
            })
        )));
    }

    #[test]
    fn explicit_tester_fallback_rejects_fuzzy_narration_echo() {
        let (mut state, session) = active_state();
        state.config.allow_tester_adapting_barge_in = true;
        let turn = begin_turn(&mut state, &session);
        state
            .command(
                Command::EnqueueSpeech {
                    request_id: request("echo-segment"),
                    session_id: session,
                    turn_id: turn.clone(),
                    segment_index: 0,
                    text: "Gern. Ich fasse zuerst die wichtigsten Aufgaben zusammen.".into(),
                },
                MonoTimeNs(0),
            )
            .0
            .unwrap();
        state.observe(
            Observation::EchoChanged {
                generation: state.route_generation,
                status: EchoStatus::Adapting,
            },
            MonoTimeNs(0),
        );
        let candidate = CandidateId::parse("candidate-tester-echo").unwrap();
        state.observe(
            Observation::VadStarted {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Adapting,
                at: MonoTimeNs(1),
            },
            MonoTimeNs(1),
        );
        state.observe(
            Observation::CandidateAdaptationReady {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
            },
            MonoTimeNs(1),
        );
        state.observe(
            Observation::NearEndEvidence {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
            },
            MonoTimeNs(2),
        );

        let partial = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Was er zuerst".into(),
                far_end_active: true,
                safe_echo_continuous: false,
            },
            MonoTimeNs(3),
        );
        assert!(!partial
            .iter()
            .any(|action| matches!(action, Action::CancelTts(_))));
        let final_actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Was er zuerst".into(),
                far_end_active: true,
                safe_echo_continuous: false,
            },
            MonoTimeNs(4),
        );
        assert!(final_actions.iter().any(|action| matches!(
            action,
            Action::CandidateDiscarded {
                reason: InputDiscardReason::UnsafeEcho,
                ..
            }
        )));
        assert_eq!(state.turn.as_ref().map(|active| &active.id), Some(&turn));
    }

    #[test]
    fn tester_fallback_never_promotes_a_candidate_started_before_adaptation() {
        let (mut state, session) = active_state();
        state.config.allow_tester_adapting_barge_in = true;
        let turn = begin_turn(&mut state, &session);
        state.observe(
            Observation::EchoChanged {
                generation: state.route_generation,
                status: EchoStatus::Adapting,
            },
            MonoTimeNs(0),
        );
        let candidate = CandidateId::parse("candidate-too-early").unwrap();
        state.observe(
            Observation::VadStarted {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Adapting,
                at: MonoTimeNs(1),
            },
            MonoTimeNs(1),
        );
        state.observe(
            Observation::NearEndEvidence {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
            },
            MonoTimeNs(400),
        );

        let actions = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Stopp, einen Moment bitte".into(),
                far_end_active: true,
                safe_echo_continuous: false,
            },
            MonoTimeNs(500),
        );

        assert!(!actions
            .iter()
            .any(|action| matches!(action, Action::CancelTts(_))));
        assert_eq!(state.turn.as_ref().map(|active| &active.id), Some(&turn));
    }

    #[test]
    fn narration_echo_matching_tolerates_streaming_asr_errors() {
        assert!(looks_like_narration_echo(
            "Was er zuerst",
            "Gern. Ich fasse zuerst die wichtigsten Aufgaben zusammen."
        ));
        assert!(looks_like_narration_echo(
            "Schauen wir heute Abend in den",
            "Schauen wir heute Abend in den Sternenhimmel."
        ));
        assert!(!looks_like_narration_echo(
            "Stopp, wie meinst du das?",
            "Gern. Ich fasse zuerst die wichtigsten Aufgaben zusammen."
        ));
    }

    #[test]
    fn cancellation_is_complete_only_after_the_callback_drains_the_fade() {
        let (mut state, session) = active_state();
        let turn = begin_turn(&mut state, &session);
        let retiring = state.turn.as_ref().unwrap().generation;
        let (_, actions) = state.command(
            Command::CancelSpeech {
                request_id: request("cancel"),
                session_id: session,
                turn_id: Some(turn.clone()),
                reason: SpeechCancelReason::Manual,
            },
            MonoTimeNs(0),
        );
        assert!(actions
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::PlaybackFading { .. }))));
        assert!(!actions
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::PlaybackCancelled { .. }))));

        let drained = state.observe(
            Observation::FadeDrained {
                turn_id: turn,
                generation: retiring,
            },
            MonoTimeNs::from_millis(80),
        );
        assert!(matches!(
            drained.as_slice(),
            [Action::Emit(VoiceEvent::PlaybackCancelled {
                reason: SpeechCancelReason::Manual,
                ..
            })]
        ));
    }

    #[test]
    fn synthesis_failure_retires_audio_before_publishing_failure() {
        let (mut state, session) = active_state();
        let turn = begin_turn(&mut state, &session);
        let generation = state.turn.as_ref().unwrap().generation;
        let actions = state.observe(
            Observation::SynthesisFailed {
                turn_id: turn.clone(),
                generation,
            },
            MonoTimeNs(0),
        );
        assert!(matches!(actions[0], Action::RetireOutput { .. }));
        assert!(actions
            .iter()
            .all(|action| !matches!(action, Action::Emit(VoiceEvent::PlaybackFailed { .. }))));

        let drained = state.observe(
            Observation::FadeDrained {
                turn_id: turn,
                generation,
            },
            MonoTimeNs::from_millis(80),
        );
        assert!(matches!(
            drained.as_slice(),
            [Action::Emit(VoiceEvent::PlaybackFailed { .. })]
        ));
    }

    #[test]
    fn final_confirmation_is_published_before_final_text() {
        let (mut state, _) = active_state();
        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("candidate-final").unwrap(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Bypassed,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();
        let actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Ｇuten Tag".into(),
                far_end_active: false,
                safe_echo_continuous: false,
            },
            MonoTimeNs(1),
        );
        assert!(matches!(
            actions[0],
            Action::Emit(VoiceEvent::InputConfirmed { .. })
        ));
        assert!(matches!(
            actions[1],
            Action::Emit(VoiceEvent::InputFinal { .. })
        ));
    }

    #[test]
    fn accepted_speaker_attribution_is_ordered_before_final_text() {
        let (mut state, _) = active_state();
        let candidate = CandidateId::parse("candidate-speaker").unwrap();
        state.observe(
            Observation::VadStarted {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Bypassed,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        state.observe(
            Observation::SpeakerEmbedding {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                embedding: vec![1.0, 0.0],
            },
            MonoTimeNs(1),
        );
        let actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Guten Tag".into(),
                far_end_active: false,
                safe_echo_continuous: false,
            },
            MonoTimeNs(2),
        );
        assert!(matches!(
            actions.as_slice(),
            [
                Action::Emit(VoiceEvent::InputConfirmed { .. }),
                Action::Emit(VoiceEvent::InputSpeakerIdentified { .. }),
                Action::Emit(VoiceEvent::InputFinal { .. })
            ]
        ));
    }

    #[test]
    fn unsafe_discard_never_exposes_a_speaker_attribution() {
        let (mut state, _) = active_state();
        let candidate = CandidateId::parse("candidate-unsafe-speaker").unwrap();
        state.observe(
            Observation::VadStarted {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                far_end_active: true,
                echo_status: EchoStatus::Adapting,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        state.observe(
            Observation::SpeakerEmbedding {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                embedding: vec![1.0, 0.0],
            },
            MonoTimeNs(1),
        );
        let actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Das war nur die Ausgabe".into(),
                far_end_active: true,
                safe_echo_continuous: false,
            },
            MonoTimeNs(2),
        );
        assert!(actions.iter().all(|action| !matches!(
            action,
            Action::Emit(VoiceEvent::InputSpeakerIdentified { .. })
        )));
        assert!(actions
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::InputDiscarded { .. }))));

        let safe = CandidateId::parse("candidate-safe-speaker").unwrap();
        state.observe(
            Observation::VadStarted {
                candidate_id: safe.clone(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Bypassed,
                at: MonoTimeNs(3),
            },
            MonoTimeNs(3),
        );
        state.observe(
            Observation::SpeakerEmbedding {
                candidate_id: safe.clone(),
                generation: state.route_generation,
                embedding: vec![0.0, 1.0],
            },
            MonoTimeNs(4),
        );
        let safe_actions = state.observe(
            Observation::RecognizerFinal {
                candidate_id: safe,
                generation: state.route_generation,
                text: "Das ist eine echte Person".into(),
                far_end_active: false,
                safe_echo_continuous: false,
            },
            MonoTimeNs(5),
        );
        assert!(safe_actions.iter().any(|action| matches!(
            action,
            Action::Emit(VoiceEvent::InputSpeakerIdentified { speaker, .. })
                if speaker.speaker_id.as_str() == "speaker-1"
        )));
    }

    #[test]
    fn embedding_that_arrives_after_confirmation_is_published_once() {
        let (mut state, _) = active_state();
        let candidate = CandidateId::parse("candidate-online-speaker").unwrap();
        state.observe(
            Observation::VadStarted {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Bypassed,
                at: MonoTimeNs(0),
            },
            MonoTimeNs(0),
        );
        state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Hallo zusammen".into(),
                far_end_active: false,
                safe_echo_continuous: false,
            },
            MonoTimeNs(1),
        );
        let attributed = state.observe(
            Observation::SpeakerEmbedding {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                embedding: vec![1.0, 0.0],
            },
            MonoTimeNs(2),
        );
        assert!(matches!(
            attributed.as_slice(),
            [Action::Emit(VoiceEvent::InputSpeakerIdentified { .. })]
        ));
        let duplicate = state.observe(
            Observation::SpeakerEmbedding {
                candidate_id: candidate,
                generation: state.route_generation,
                embedding: vec![1.0, 0.0],
            },
            MonoTimeNs(3),
        );
        assert!(duplicate.is_empty());
    }

    #[test]
    fn segment_order_conflicts_and_duplicate_text_are_deterministic() {
        let (mut state, session) = active_state();
        let turn = begin_turn(&mut state, &session);
        let enqueue = |id: &str, index, text: &str| Command::EnqueueSpeech {
            request_id: request(id),
            session_id: session.clone(),
            turn_id: turn.clone(),
            segment_index: index,
            text: text.into(),
        };
        assert_eq!(
            state.command(enqueue("e0", 0, "Hallo."), MonoTimeNs(0)).0,
            Ok(CachedResult::Enqueued {
                idempotent: false,
                remaining_capacity: 7,
            })
        );
        assert_eq!(
            state
                .command(enqueue("e0-copy", 0, "Hallo."), MonoTimeNs(0))
                .0,
            Ok(CachedResult::Enqueued {
                idempotent: true,
                remaining_capacity: 7,
            })
        );
        assert_eq!(
            state
                .command(enqueue("e0-conflict", 0, "Anders."), MonoTimeNs(0))
                .0
                .unwrap_err()
                .code,
            VoiceErrorCode::SegmentConflict
        );
        assert_eq!(
            state
                .command(enqueue("e2", 2, "Später."), MonoTimeNs(0))
                .0
                .unwrap_err()
                .code,
            VoiceErrorCode::SegmentOutOfOrder
        );
    }

    #[test]
    fn segment_capacity_tracks_pending_synthesis_instead_of_turn_history() {
        let (mut state, session) = active_state();
        let turn = begin_turn(&mut state, &session);
        let generation = state.turn.as_ref().unwrap().generation;
        for index in 0..8 {
            state
                .command(
                    Command::EnqueueSpeech {
                        request_id: request(&format!("pending-{index}")),
                        session_id: session.clone(),
                        turn_id: turn.clone(),
                        segment_index: index,
                        text: format!("Segment {index}."),
                    },
                    MonoTimeNs(0),
                )
                .0
                .unwrap();
        }
        assert_eq!(
            state
                .command(
                    Command::EnqueueSpeech {
                        request_id: request("pending-full"),
                        session_id: session.clone(),
                        turn_id: turn.clone(),
                        segment_index: 8,
                        text: "Noch nicht.".into(),
                    },
                    MonoTimeNs(0),
                )
                .0
                .unwrap_err()
                .code,
            VoiceErrorCode::QueueFull
        );

        let actions = state.observe(
            Observation::SynthesisStarted {
                turn_id: turn.clone(),
                segment_index: 0,
                generation,
            },
            MonoTimeNs(1),
        );
        assert!(actions.iter().any(|action| matches!(
            action,
            Action::Emit(VoiceEvent::CapacityChanged {
                pending_segments: 7,
                ..
            })
        )));
        assert_eq!(
            state
                .command(
                    Command::EnqueueSpeech {
                        request_id: request("pending-after-start"),
                        session_id: session,
                        turn_id: turn,
                        segment_index: 8,
                        text: "Jetzt passt es.".into(),
                    },
                    MonoTimeNs(2),
                )
                .0,
            Ok(CachedResult::Enqueued {
                idempotent: false,
                remaining_capacity: 0,
            })
        );
    }

    #[test]
    fn duplicate_request_is_side_effect_free_and_conflicting_reuse_fails() {
        let mut state = VoiceState::new("test", VoiceConfigV1::default());
        let command = Command::StartSession {
            request_id: request("same"),
            preferred_input: None,
            preferred_output: None,
        };
        let first = state.command(command.clone(), MonoTimeNs(0));
        let second = state.command(command, MonoTimeNs(1));
        assert_eq!(first.0, second.0);
        assert!(second.1.is_empty());
        let conflict = state.command(
            Command::Prepare {
                request_id: request("same"),
                features: vec![],
            },
            MonoTimeNs(2),
        );
        assert_eq!(
            conflict.0.unwrap_err().code,
            VoiceErrorCode::RequestConflict
        );
        assert!(conflict.1.is_empty());
    }

    #[test]
    fn session_start_requires_both_models_and_has_no_partial_side_effects() {
        let mut state = VoiceState::new("test", VoiceConfigV1::default());
        state.input_ready = true;
        let (result, actions) = state.command(
            Command::StartSession {
                request_id: request("start-unprepared"),
                preferred_input: None,
                preferred_output: None,
            },
            MonoTimeNs(0),
        );
        assert_eq!(result.unwrap_err().code, VoiceErrorCode::ModelNotPrepared);
        assert!(actions.is_empty());
        assert!(state.session_id.is_none());
        assert_eq!(state.session_status, SessionStatus::Closed);
    }

    #[test]
    fn session_supersession_closes_the_old_route_before_stopping_its_environment() {
        let (mut state, old_session) = active_state();
        let old_generation = state.route_generation;
        let (result, actions) = state.command(
            Command::StartSession {
                request_id: request("supersede-session"),
                preferred_input: None,
                preferred_output: None,
            },
            MonoTimeNs(1),
        );
        assert!(matches!(result, Ok(CachedResult::Session(_))));
        let close = actions
            .iter()
            .position(|action| *action == Action::CloseRoute(old_generation))
            .expect("old route must close");
        let stop = actions
            .iter()
            .position(
                |action| matches!(action, Action::StopSession(session) if session == &old_session),
            )
            .expect("old environment must stop");
        assert!(close < stop);
    }

    #[test]
    fn exhausted_route_retries_publish_a_stable_failure_state() {
        let (mut state, _) = active_state();
        let mut last = Vec::new();
        for attempt in 0..=RETRY_DELAYS_MS.len() {
            let generation = state.route_generation;
            last = state.observe(
                Observation::RouteFault {
                    generation,
                    recoverable: true,
                },
                MonoTimeNs::from_millis(attempt as u64),
            );
        }
        assert_eq!(state.session_status, SessionStatus::Suspended);
        assert_eq!(state.capture_status, CaptureStatus::Failed);
        assert!(last.iter().any(|action| matches!(
            action,
            Action::Emit(VoiceEvent::StatusSession {
                status: SessionStatus::Suspended
            })
        )));
        assert!(last.iter().any(|action| matches!(
            action,
            Action::Emit(VoiceEvent::ErrorRaised {
                error: VoiceError {
                    code: VoiceErrorCode::RouteOpenFailed,
                    ..
                }
            })
        )));
    }

    #[test]
    fn stalled_callbacks_raise_a_typed_error_and_enter_recovery_once() {
        let (mut state, session) = active_state();
        let generation = state.route_generation;
        let actions = state.observe(
            Observation::CallbacksStalled {
                session_id: session,
                generation,
            },
            MonoTimeNs::from_millis(3_000),
        );
        assert!(matches!(
            actions.first(),
            Some(Action::Emit(VoiceEvent::ErrorRaised {
                error: VoiceError {
                    code: VoiceErrorCode::CallbacksStalled,
                    ..
                }
            }))
        ));
        assert_eq!(state.session_status, SessionStatus::Recovering);
        assert_eq!(state.capture_status, CaptureStatus::Starting);
        assert!(actions.contains(&Action::CloseRoute(generation)));
    }

    #[test]
    fn diagnostics_snapshot_uses_latest_generation_metrics() {
        let (mut state, _) = active_state();
        state.observe(
            Observation::MetricsUpdated {
                generation: state.route_generation,
                metrics: crate::RuntimeMetrics {
                    capture_overruns: 2,
                    reference_overruns: 3,
                    render_underruns: 4,
                    delay_hint_ms: Some(37),
                    drift_correction_ppm: 125.0,
                    render_rms: 0.4,
                    raw_rms: 0.3,
                    clean_rms: 0.1,
                    vad_probability: 0.8,
                    queued_seconds: 0.2,
                    buffered_seconds: 0.5,
                    capture_queue_fill: 2,
                    capture_queue_capacity: 25,
                    reference_queue_fill: 3,
                    reference_queue_capacity: 50,
                    render_queue_fill: 4,
                    render_queue_capacity: 25,
                    ..crate::RuntimeMetrics::default()
                },
            },
            MonoTimeNs(0),
        );
        let snapshot = state.snapshot(MonoTimeNs(0));
        assert_eq!(snapshot.capture.overruns.parse(), Ok(2));
        assert_eq!(snapshot.echo.delay_hint_ms, Some(37));
        assert_eq!(snapshot.echo.drift_correction_ppm, 125.0);
        assert_eq!(snapshot.echo.clean_rms, 0.1);
        assert_eq!(snapshot.utterance.vad_probability, 0.8);
        assert_eq!(snapshot.playback.underruns.parse(), Ok(4));
        assert_eq!(snapshot.playback.buffered_seconds, 0.5);
        assert_eq!(snapshot.queues[0].fill, 2);
        assert_eq!(snapshot.queues[1].capacity, 50);
    }

    #[test]
    fn stale_model_work_after_route_change_is_ignored() {
        let (mut state, _) = active_state();
        let old = state.route_generation;
        state.observe(
            Observation::RouteFault {
                generation: old,
                recoverable: true,
            },
            MonoTimeNs(0),
        );
        let actions = state.observe(
            Observation::RecognizerPartial {
                candidate_id: CandidateId::parse("old-candidate").unwrap(),
                generation: old,
                text: "should be stale".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(1),
        );
        assert!(actions.is_empty());
    }

    #[test]
    fn late_tts_results_after_cancellation_or_session_supersession_are_ignored() {
        let (mut state, session) = active_state();
        let cancelled = begin_turn(&mut state, &session);
        let cancelled_generation = state.turn.as_ref().unwrap().generation;
        state
            .command(
                Command::CancelSpeech {
                    request_id: request("cancel-before-result"),
                    session_id: session.clone(),
                    turn_id: Some(cancelled.clone()),
                    reason: SpeechCancelReason::Manual,
                },
                MonoTimeNs(1),
            )
            .0
            .unwrap();
        assert!(state
            .observe(
                Observation::SynthesisCompleted {
                    turn_id: cancelled,
                    segment_index: 0,
                    generation: cancelled_generation,
                },
                MonoTimeNs(2),
            )
            .is_empty());

        let current = begin_turn_with(&mut state, &session, "begin-before-supersession");
        let current_generation = state.turn.as_ref().unwrap().generation;
        state
            .command(
                Command::StartSession {
                    request_id: request("supersede-before-result"),
                    preferred_input: None,
                    preferred_output: None,
                },
                MonoTimeNs(3),
            )
            .0
            .unwrap();
        assert!(state
            .observe(
                Observation::SynthesisCompleted {
                    turn_id: current,
                    segment_index: 0,
                    generation: current_generation,
                },
                MonoTimeNs(4),
            )
            .is_empty());
    }

    #[test]
    fn duplicate_confirmation_and_old_fade_completion_do_not_touch_a_new_turn() {
        let (mut state, session) = active_state();
        let first = begin_turn(&mut state, &session);
        let first_generation = state.turn.as_ref().unwrap().generation;
        state
            .command(
                Command::CancelSpeech {
                    request_id: request("cancel-first"),
                    session_id: session.clone(),
                    turn_id: Some(first.clone()),
                    reason: SpeechCancelReason::Superseded,
                },
                MonoTimeNs(1),
            )
            .0
            .unwrap();
        let second = begin_turn_with(&mut state, &session, "begin-second");
        let second_generation = state.turn.as_ref().unwrap().generation;
        let old_fade = state.observe(
            Observation::FadeDrained {
                turn_id: first,
                generation: first_generation,
            },
            MonoTimeNs::from_millis(81),
        );
        assert!(matches!(
            old_fade.as_slice(),
            [Action::Emit(VoiceEvent::PlaybackCancelled { .. })]
        ));
        assert_eq!(state.turn.as_ref().map(|turn| &turn.id), Some(&second));
        assert!(matches!(
            state
                .observe(
                    Observation::PlaybackAudible {
                        turn_id: second,
                        generation: second_generation,
                    },
                    MonoTimeNs::from_millis(82),
                )
                .as_slice(),
            [Action::Emit(VoiceEvent::PlaybackStarted { .. })]
        ));

        state.observe(
            Observation::VadStarted {
                candidate_id: CandidateId::parse("duplicate-confirmation").unwrap(),
                generation: state.route_generation,
                far_end_active: false,
                echo_status: EchoStatus::Converged,
                at: MonoTimeNs(100),
            },
            MonoTimeNs(100),
        );
        let candidate = state.candidate.as_ref().unwrap().id.clone();
        let first = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate.clone(),
                generation: state.route_generation,
                text: "Hallo Welt".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(101),
        );
        assert_eq!(
            first
                .iter()
                .filter(|action| matches!(action, Action::Emit(VoiceEvent::InputConfirmed { .. })))
                .count(),
            1
        );
        let duplicate = state.observe(
            Observation::RecognizerPartial {
                candidate_id: candidate,
                generation: state.route_generation,
                text: "Hallo Welt!".into(),
                far_end_active: false,
                safe_echo_continuous: true,
            },
            MonoTimeNs(102),
        );
        assert!(!duplicate
            .iter()
            .any(|action| matches!(action, Action::Emit(VoiceEvent::InputConfirmed { .. }))));
    }

    #[test]
    fn stop_and_route_fault_are_order_independent_and_never_reopen_a_closed_session() {
        let (mut stop_first, session) = active_state();
        let generation = stop_first.route_generation;
        stop_first
            .command(
                Command::StopSession {
                    request_id: request("stop-first"),
                    session_id: session,
                },
                MonoTimeNs(1),
            )
            .0
            .unwrap();
        assert!(stop_first
            .observe(
                Observation::RouteFault {
                    generation,
                    recoverable: true,
                },
                MonoTimeNs(2),
            )
            .is_empty());
        assert_eq!(stop_first.session_status, SessionStatus::Closed);

        let (mut fault_first, session) = active_state();
        let generation = fault_first.route_generation;
        fault_first.observe(
            Observation::RouteFault {
                generation,
                recoverable: true,
            },
            MonoTimeNs(1),
        );
        let (_, stop_actions) = fault_first.command(
            Command::StopSession {
                request_id: request("stop-after-fault"),
                session_id: session,
            },
            MonoTimeNs(2),
        );
        assert_eq!(fault_first.session_status, SessionStatus::Closed);
        assert!(stop_actions
            .iter()
            .any(|action| matches!(action, Action::StopSession(_))));
    }

    proptest! {
        #[test]
        fn lexical_seed_requires_two_alphabetic_codepoints(text in ".{0,80}") {
            let normalized = text.nfkc().collect::<String>();
            let reference = normalized.split_whitespace().any(|token| token.chars().filter(|c| c.is_alphabetic()).count() >= 2);
            prop_assert_eq!(has_lexical_seed(&text), reference);
        }
    }
}
