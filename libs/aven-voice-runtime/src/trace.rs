use aven_voice_core::{MonoTimeNs, OutputGeneration, RouteGeneration};
use aven_voice_protocol::RouteId;
use std::collections::VecDeque;

use crate::{
    AudioPorts, CallbackTime, CaptureConditioning, DuplexHost, HostError, HostEvent, HostFaultCode,
    HostSampleFormat, RouteDescriptor, RouteRequest, StreamDescriptor, TimestampQuality,
};

#[derive(Clone, Debug)]
pub struct FakeHostConfig {
    pub input: StreamDescriptor,
    pub output: StreamDescriptor,
    pub input_timestamp_quality: TimestampQuality,
    pub output_timestamp_quality: TimestampQuality,
    pub input_clock_drift_ppm: i32,
    pub output_clock_drift_ppm: i32,
}

impl Default for FakeHostConfig {
    fn default() -> Self {
        Self {
            input: StreamDescriptor {
                sample_rate_hz: 48_000,
                channels: 1,
                sample_format: HostSampleFormat::Float { bits: 32 },
                nominal_callback_frames: Some(480),
            },
            output: StreamDescriptor {
                sample_rate_hz: 48_000,
                channels: 1,
                sample_format: HostSampleFormat::Float { bits: 32 },
                nominal_callback_frames: Some(480),
            },
            input_timestamp_quality: TimestampQuality::Hardware,
            output_timestamp_quality: TimestampQuality::Hardware,
            input_clock_drift_ppm: 0,
            output_clock_drift_ppm: 0,
        }
    }
}

pub struct FakeDuplexHost {
    config: FakeHostConfig,
    route: Option<RouteDescriptor>,
    ports: Option<AudioPorts>,
    started: bool,
    next_route: u64,
    next_open_error: Option<HostError>,
    next_start_error: Option<HostError>,
}

impl FakeDuplexHost {
    pub fn new(config: FakeHostConfig) -> Self {
        Self {
            config,
            route: None,
            ports: None,
            started: false,
            next_route: 0,
            next_open_error: None,
            next_start_error: None,
        }
    }

    pub fn capture(&self, samples: &[f32], at: MonoTimeNs) {
        let Some((route, ports)) = self.route.as_ref().zip(self.ports.as_ref()) else {
            return;
        };
        if self.started {
            ports.capture.write_f32(
                samples,
                self.config.input.channels,
                CallbackTime {
                    callback_at: drifted(at, self.config.input_clock_drift_ppm),
                    first_frame_at: Some(drifted(at, self.config.input_clock_drift_ppm)),
                    frame_position: None,
                    quality: self.config.input_timestamp_quality,
                },
                route.generation,
            );
        }
    }

    pub fn render(&self, frames: usize, at: MonoTimeNs) -> Vec<f32> {
        let mut output = vec![0.0; frames * usize::from(self.config.output.channels)];
        let Some((route, ports)) = self.route.as_ref().zip(self.ports.as_ref()) else {
            return output;
        };
        if self.started {
            ports.render.fill_f32(
                &mut output,
                self.config.output.channels,
                CallbackTime {
                    callback_at: drifted(at, self.config.output_clock_drift_ppm),
                    first_frame_at: Some(drifted(at, self.config.output_clock_drift_ppm)),
                    frame_position: None,
                    quality: self.config.output_timestamp_quality,
                },
                route.generation,
            );
        }
        output
    }

    pub fn invalidate(&self) {
        if let Some((route, ports)) = self.route.as_ref().zip(self.ports.as_ref()) {
            ports.events.publish(HostEvent::RouteInvalidated {
                route: route.route_id.clone(),
                generation: route.generation,
                reason: crate::RouteInvalidationReason::DeviceRemoved,
            });
        }
    }

    pub fn stream_fault(&self, direction: crate::StreamDirection, recoverable: bool) {
        if let Some((route, ports)) = self.route.as_ref().zip(self.ports.as_ref()) {
            ports.events.publish(HostEvent::StreamFault {
                route: route.route_id.clone(),
                generation: route.generation,
                direction,
                code: HostFaultCode::Backend,
                recoverable,
            });
        }
    }

    pub fn device_set_changed(&self) {
        if let Some(ports) = &self.ports {
            ports.events.publish(HostEvent::DeviceSetChanged);
        }
    }

    pub fn fail_next_open(&mut self, error: HostError) {
        self.next_open_error = Some(error);
    }

    pub fn fail_next_start(&mut self, error: HostError) {
        self.next_start_error = Some(error);
    }
}

impl DuplexHost for FakeDuplexHost {
    fn open(
        &mut self,
        request: RouteRequest,
        ports: AudioPorts,
    ) -> Result<RouteDescriptor, HostError> {
        if let Some(error) = self.next_open_error.take() {
            return Err(error);
        }
        if request.require_duplex
            && (self.config.input.channels == 0 || self.config.output.channels == 0)
        {
            return Err(HostError {
                code: HostFaultCode::DeviceUnavailable,
                user_message: "A duplex audio route is unavailable.".into(),
                recoverable: true,
            });
        }
        self.next_route += 1;
        let descriptor = RouteDescriptor {
            route_id: RouteId::parse(format!("fake-route-{}", self.next_route)).unwrap(),
            generation: request.generation,
            input: self.config.input,
            output: self.config.output,
            input_timestamp_quality: self.config.input_timestamp_quality,
            output_timestamp_quality: self.config.output_timestamp_quality,
            capture_conditioning: CaptureConditioning::Raw,
        };
        ports.events.bind_route(descriptor.route_id.clone());
        self.route = Some(descriptor.clone());
        self.ports = Some(ports);
        self.started = false;
        Ok(descriptor)
    }

    fn start(&mut self, route: &RouteId) -> Result<(), HostError> {
        if let Some(error) = self.next_start_error.take() {
            return Err(error);
        }
        let Some(descriptor) = self.route.as_ref().filter(|value| &value.route_id == route) else {
            return Err(HostError {
                code: HostFaultCode::StreamInvalidated,
                user_message: "The audio route is stale.".into(),
                recoverable: true,
            });
        };
        let ports = self.ports.as_ref().unwrap();
        ports.capture.activate(descriptor.generation);
        ports
            .render
            .activate_route_current_generation(descriptor.generation);
        ports.events.publish(HostEvent::Started {
            route: descriptor.route_id.clone(),
            generation: descriptor.generation,
        });
        self.started = true;
        Ok(())
    }

    fn close(&mut self, route: &RouteId) -> Result<(), HostError> {
        if self
            .route
            .as_ref()
            .is_some_and(|value| &value.route_id == route)
        {
            if let Some(ports) = &self.ports {
                ports.capture.deactivate();
                ports.render.deactivate_route();
            }
            self.route = None;
            self.ports = None;
            self.started = false;
        }
        Ok(())
    }
}

fn drifted(at: MonoTimeNs, ppm: i32) -> MonoTimeNs {
    let scale = 1.0 + f64::from(ppm) / 1_000_000.0;
    MonoTimeNs((at.0 as f64 * scale).max(0.0).round() as u64)
}

#[derive(Clone, Debug, PartialEq)]
pub struct AcousticPathConfig {
    pub delay_samples: usize,
    pub impulse_response: Vec<f32>,
    pub noise_amplitude: f32,
    pub nonlinear_drive: f32,
    pub seed: u64,
}

impl Default for AcousticPathConfig {
    fn default() -> Self {
        Self {
            delay_samples: 0,
            impulse_response: vec![1.0],
            noise_amplitude: 0.0,
            nonlinear_drive: 0.0,
            seed: 1,
        }
    }
}

/// Deterministic loudspeaker-to-microphone fixture. It provides delay, room
/// convolution, near-end double talk, noise, clipping, and nonlinear playback
/// without wall-clock time or platform audio APIs.
pub struct AcousticPath {
    config: AcousticPathConfig,
    history: VecDeque<f32>,
    noise_state: u64,
}

impl AcousticPath {
    pub fn new(config: AcousticPathConfig) -> Self {
        let history = VecDeque::from(vec![
            0.0;
            config.delay_samples
                + config.impulse_response.len().max(1)
        ]);
        Self {
            noise_state: config.seed.max(1),
            config,
            history,
        }
    }

    pub fn capture(&mut self, rendered: &[f32], near_end: &[f32]) -> Vec<f32> {
        let frames = rendered.len().max(near_end.len());
        let mut capture = Vec::with_capacity(frames);
        for index in 0..frames {
            let mut sample = rendered.get(index).copied().unwrap_or(0.0);
            if self.config.nonlinear_drive > 0.0 {
                let drive = self.config.nonlinear_drive;
                sample = (sample * drive).tanh() / drive.tanh().max(1.0e-6);
            }
            self.history.push_back(sample);
            let required = self.config.delay_samples + self.config.impulse_response.len().max(1);
            while self.history.len() > required {
                self.history.pop_front();
            }
            let echo = self
                .config
                .impulse_response
                .iter()
                .enumerate()
                .map(|(tap, gain)| {
                    let offset = self.config.delay_samples + tap;
                    let position = self.history.len().saturating_sub(1 + offset);
                    self.history.get(position).copied().unwrap_or(0.0) * gain
                })
                .sum::<f32>();
            self.noise_state ^= self.noise_state << 13;
            self.noise_state ^= self.noise_state >> 7;
            self.noise_state ^= self.noise_state << 17;
            let noise = ((self.noise_state >> 40) as f32 / (1_u32 << 24) as f32 * 2.0 - 1.0)
                * self.config.noise_amplitude;
            capture.push(
                (near_end.get(index).copied().unwrap_or(0.0) + echo + noise).clamp(-1.0, 1.0),
            );
        }
        capture
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum TraceStep {
    AdvanceTo(MonoTimeNs),
    Capture(Vec<f32>),
    QueueRender {
        samples: Vec<f32>,
        generation: OutputGeneration,
    },
    Render {
        frames: usize,
        expected: Vec<f32>,
    },
    InvalidateRoute,
    StreamFault {
        direction: crate::StreamDirection,
        recoverable: bool,
    },
    DeviceSetChanged,
    Command(aven_voice_core::Command),
    Observation(aven_voice_core::Observation),
    ExpectState(TraceStateExpectation),
    ExpectEvent(aven_voice_protocol::VoiceEvent),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TraceStateExpectation {
    pub runtime: Option<aven_voice_protocol::RuntimeStatus>,
    pub session: Option<aven_voice_protocol::SessionStatus>,
    pub capture: Option<aven_voice_protocol::CaptureStatus>,
    pub playback: Option<aven_voice_protocol::PlaybackStatus>,
    pub utterance: Option<aven_voice_protocol::UtteranceStatus>,
    pub echo: Option<aven_voice_protocol::EchoStatus>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct VoiceTrace {
    pub version: u16,
    pub seed: u64,
    pub steps: Vec<TraceStep>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct VoiceTraceReport {
    pub captured_frames: usize,
    pub rendered: Vec<Vec<f32>>,
    pub host_events: Vec<HostEvent>,
    pub capture_overruns: u64,
    pub reference_overruns: u64,
    pub command_results:
        Vec<Result<aven_voice_core::CachedResult, aven_voice_protocol::VoiceErrorCode>>,
    pub semantic_actions: Vec<aven_voice_core::Action>,
    pub semantic_events: Vec<aven_voice_protocol::VoiceEvent>,
}

impl VoiceTrace {
    /// Execute a versioned deterministic host trace without wall-clock sleeps
    /// or platform audio. Assertions are part of the trace so the same corpus
    /// runs identically on every target.
    pub fn execute(&self, config: FakeHostConfig) -> Result<VoiceTraceReport, String> {
        if self.version != 1 {
            return Err(format!("unsupported voice trace version {}", self.version));
        }
        let capture = crate::CapturePort::new(25, config.input);
        let (render, producer) = crate::RenderPort::new(25, 50);
        let events = crate::HostEventPort::new(8, 8);
        let consumer = events.consumer();
        let mut host = FakeDuplexHost::new(config.clone());
        let generation = RouteGeneration(1);
        let route = host
            .open(
                RouteRequest {
                    generation,
                    preferred_input: None,
                    preferred_output: None,
                    require_duplex: true,
                },
                AudioPorts {
                    capture: capture.clone(),
                    render: render.clone(),
                    events,
                },
            )
            .map_err(|error| error.user_message.clone())?;
        host.start(&route.route_id)
            .map_err(|error| error.user_message.clone())?;
        let mut now = MonoTimeNs(0);
        let mut report = VoiceTraceReport::default();
        let mut state = aven_voice_core::VoiceState::new(
            format!("trace{}", self.seed),
            aven_voice_core::VoiceConfigV1::default(),
        );
        for (index, step) in self.steps.iter().enumerate() {
            match step {
                TraceStep::AdvanceTo(next) => {
                    if *next < now {
                        return Err(format!("trace step {index} regressed virtual time"));
                    }
                    now = *next;
                }
                TraceStep::Capture(samples) => {
                    host.capture(samples, now);
                    while let Some(chunk) = capture.pop() {
                        report.captured_frames +=
                            chunk.values().len() / usize::from(chunk.channels.max(1));
                    }
                }
                TraceStep::QueueRender {
                    samples,
                    generation,
                } => {
                    let chunk = crate::RenderChunk::from_slice(samples, *generation)
                        .ok_or_else(|| format!("trace step {index} render chunk is too large"))?;
                    producer.push(chunk).map_err(|_| {
                        format!("trace step {index} render generation or capacity is stale")
                    })?;
                }
                TraceStep::Render { frames, expected } => {
                    let actual = host.render(*frames, now);
                    if actual != *expected {
                        return Err(format!("trace step {index} rendered unexpected samples"));
                    }
                    report.rendered.push(actual);
                }
                TraceStep::InvalidateRoute => host.invalidate(),
                TraceStep::StreamFault {
                    direction,
                    recoverable,
                } => host.stream_fault(*direction, *recoverable),
                TraceStep::DeviceSetChanged => host.device_set_changed(),
                TraceStep::Command(command) => {
                    let (result, actions) = state.command(command.clone(), now);
                    report
                        .command_results
                        .push(result.map_err(|error| error.code));
                    record_semantic_actions(&mut report, actions);
                }
                TraceStep::Observation(observation) => {
                    let actions = state.observe(observation.clone(), now);
                    record_semantic_actions(&mut report, actions);
                }
                TraceStep::ExpectState(expected) => {
                    let snapshot = state.snapshot(now);
                    let matches = expected
                        .runtime
                        .is_none_or(|value| snapshot.runtime == value)
                        && expected
                            .session
                            .is_none_or(|value| snapshot.session.status == value)
                        && expected
                            .capture
                            .is_none_or(|value| snapshot.capture.status == value)
                        && expected
                            .playback
                            .is_none_or(|value| snapshot.playback.status == value)
                        && expected
                            .utterance
                            .is_none_or(|value| snapshot.utterance.status == value)
                        && expected
                            .echo
                            .is_none_or(|value| snapshot.echo.status == value);
                    if !matches {
                        return Err(format!(
                            "trace step {index} semantic snapshot did not match: {snapshot:?}"
                        ));
                    }
                }
                TraceStep::ExpectEvent(expected) => {
                    if !report.semantic_events.contains(expected) {
                        return Err(format!(
                            "trace step {index} did not observe semantic event {expected:?}"
                        ));
                    }
                }
            }
            while let Some(event) = consumer.pop() {
                report.host_events.push(event);
            }
        }
        report.capture_overruns = capture.overruns();
        report.reference_overruns = render.reference_overruns();
        host.close(&route.route_id)
            .map_err(|error| error.user_message)?;
        Ok(report)
    }
}

fn record_semantic_actions(report: &mut VoiceTraceReport, actions: Vec<aven_voice_core::Action>) {
    for action in &actions {
        if let aven_voice_core::Action::Emit(event) = action {
            report.semantic_events.push(event.clone());
        }
    }
    report.semantic_actions.extend(actions);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CapturePort, HostEventPort, RenderChunk, RenderPort};
    use aven_voice_core::{Command, Observation, OutputGeneration, RouteGeneration};
    use aven_voice_protocol::{
        DecimalU64, PlaybackStatus, RequestId, RouteId, RouteSnapshot, SessionId, SessionStatus,
        TimestampQuality, TurnId, VoiceEvent, VoiceFeature,
    };

    fn request(value: &str) -> RequestId {
        RequestId::parse(value).unwrap()
    }

    #[test]
    fn fake_host_is_stopped_until_start_and_uses_virtual_time() {
        let config = FakeHostConfig::default();
        let capture = CapturePort::new(25, config.input);
        let (render, producer) = RenderPort::new(25, 50);
        let events = HostEventPort::new(8, 8);
        let ports = AudioPorts {
            capture: capture.clone(),
            render,
            events,
        };
        let mut host = FakeDuplexHost::new(config);
        let route = host
            .open(
                RouteRequest {
                    generation: RouteGeneration(7),
                    preferred_input: None,
                    preferred_output: None,
                    require_duplex: true,
                },
                ports,
            )
            .unwrap();
        host.capture(&[0.5; 480], MonoTimeNs(0));
        assert!(capture.pop().is_none());
        host.start(&route.route_id).unwrap();
        host.capture(&[0.5; 480], MonoTimeNs::from_millis(10));
        assert_eq!(
            capture.pop().unwrap().time.first_frame_at,
            Some(MonoTimeNs::from_millis(10))
        );
        producer
            .push(RenderChunk::from_slice(&[0.25; 4], OutputGeneration(0)).unwrap())
            .unwrap();
        assert_eq!(host.render(4, MonoTimeNs::from_millis(20)), [0.25; 4]);
    }

    #[test]
    fn fake_host_applies_independent_clock_drift_and_reports_faults() {
        let mut config = FakeHostConfig::default();
        config.input_clock_drift_ppm = 1_000;
        let capture = CapturePort::new(4, config.input);
        let (render, _) = RenderPort::new(4, 4);
        let events = HostEventPort::new(4, 4);
        let consumer = events.consumer();
        let mut host = FakeDuplexHost::new(config);
        let route = host
            .open(
                RouteRequest {
                    generation: RouteGeneration(2),
                    preferred_input: None,
                    preferred_output: None,
                    require_duplex: true,
                },
                AudioPorts {
                    capture: capture.clone(),
                    render,
                    events,
                },
            )
            .unwrap();
        host.start(&route.route_id).unwrap();
        host.capture(&[0.1; 480], MonoTimeNs::from_millis(1_000));
        assert_eq!(
            capture.pop().unwrap().time.first_frame_at,
            Some(MonoTimeNs::from_millis(1_001))
        );
        host.stream_fault(crate::StreamDirection::Capture, true);
        assert!(matches!(
            consumer.recv(),
            Some(HostEvent::StreamFault {
                generation: RouteGeneration(2),
                recoverable: true,
                ..
            })
        ));
    }

    #[test]
    fn acoustic_path_is_seeded_and_combines_delay_room_noise_and_double_talk() {
        let config = AcousticPathConfig {
            delay_samples: 2,
            impulse_response: vec![0.5, 0.25],
            noise_amplitude: 0.001,
            nonlinear_drive: 1.5,
            seed: 42,
        };
        let mut first = AcousticPath::new(config.clone());
        let mut second = AcousticPath::new(config);
        let rendered = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let near = [0.0, 0.0, 0.1, 0.1, 0.0, 0.0];
        let first_capture = first.capture(&rendered, &near);
        let second_capture = second.capture(&rendered, &near);
        assert_eq!(first_capture, second_capture);
        assert!(first_capture[2] > 0.1);
        assert!(first_capture.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn versioned_trace_executes_render_capture_and_faults_with_virtual_time() {
        let trace = VoiceTrace {
            version: 1,
            seed: 7,
            steps: vec![
                TraceStep::QueueRender {
                    samples: vec![0.3; 4],
                    generation: OutputGeneration(0),
                },
                TraceStep::AdvanceTo(MonoTimeNs::from_millis(10)),
                TraceStep::Render {
                    frames: 4,
                    expected: vec![0.3; 4],
                },
                TraceStep::Capture(vec![0.2; 480]),
                TraceStep::StreamFault {
                    direction: crate::StreamDirection::Capture,
                    recoverable: true,
                },
                TraceStep::InvalidateRoute,
                TraceStep::DeviceSetChanged,
            ],
        };
        let report = trace.execute(FakeHostConfig::default()).unwrap();
        assert_eq!(report.captured_frames, 480);
        assert_eq!(report.rendered, [vec![0.3; 4]]);
        assert!(report.host_events.iter().any(|event| matches!(
            event,
            HostEvent::StreamFault {
                recoverable: true,
                ..
            }
        )));
        assert!(report
            .host_events
            .iter()
            .any(|event| matches!(event, HostEvent::RouteInvalidated { .. })));
        assert!(report
            .host_events
            .iter()
            .any(|event| matches!(event, HostEvent::DeviceSetChanged)));
    }

    #[test]
    fn versioned_trace_drives_complete_semantic_session_and_tts_lifecycle() {
        let session = SessionId::parse("trace7-s-1").unwrap();
        let turn = TurnId::parse("trace7-t-2").unwrap();
        let generation = RouteGeneration(1);
        let output_generation = OutputGeneration(1);
        let trace = VoiceTrace {
            version: 1,
            seed: 7,
            steps: vec![
                TraceStep::Command(Command::Prepare {
                    request_id: request("prepare"),
                    features: vec![VoiceFeature::Input, VoiceFeature::Output],
                }),
                TraceStep::Observation(Observation::ModelsPrepared {
                    input: true,
                    output: true,
                }),
                TraceStep::Command(Command::StartSession {
                    request_id: request("start"),
                    preferred_input: None,
                    preferred_output: None,
                }),
                TraceStep::Observation(Observation::EnvironmentActivated {
                    session_id: session.clone(),
                }),
                TraceStep::Observation(Observation::RouteOpened {
                    session_id: session.clone(),
                    generation,
                    route: RouteSnapshot {
                        route_id: RouteId::parse("trace-route").unwrap(),
                        generation: DecimalU64::new(1),
                        input_rate_hz: 48_000,
                        input_channels: 1,
                        output_rate_hz: 48_000,
                        output_channels: 1,
                        input_callback_frames: Some(480),
                        output_callback_frames: Some(480),
                        input_timestamp_quality: TimestampQuality::Hardware,
                        output_timestamp_quality: TimestampQuality::Hardware,
                        full_duplex_barge_in: false,
                    },
                }),
                TraceStep::Observation(Observation::RouteStarted {
                    session_id: session.clone(),
                    generation,
                }),
                TraceStep::Observation(Observation::CaptureArrived {
                    session_id: session.clone(),
                    generation,
                    at: MonoTimeNs::from_millis(10),
                }),
                TraceStep::ExpectState(TraceStateExpectation {
                    session: Some(SessionStatus::Active),
                    capture: Some(aven_voice_protocol::CaptureStatus::Live),
                    ..TraceStateExpectation::default()
                }),
                TraceStep::Command(Command::BeginSpeech {
                    request_id: request("begin"),
                    session_id: session.clone(),
                    client_turn_key: None,
                    language: "de".into(),
                    voice: "M1".into(),
                }),
                TraceStep::Command(Command::EnqueueSpeech {
                    request_id: request("enqueue"),
                    session_id: session.clone(),
                    turn_id: turn.clone(),
                    segment_index: 0,
                    text: "Hallo Welt.".into(),
                }),
                TraceStep::Command(Command::FinishSpeech {
                    request_id: request("finish"),
                    session_id: session.clone(),
                    turn_id: turn.clone(),
                }),
                TraceStep::Observation(Observation::SynthesisStarted {
                    turn_id: turn.clone(),
                    segment_index: 0,
                    generation: output_generation,
                }),
                TraceStep::Observation(Observation::SynthesisCompleted {
                    turn_id: turn.clone(),
                    segment_index: 0,
                    generation: output_generation,
                }),
                TraceStep::Observation(Observation::PlaybackAudible {
                    turn_id: turn.clone(),
                    generation: output_generation,
                }),
                TraceStep::Observation(Observation::PlaybackDrained {
                    turn_id: turn.clone(),
                    generation: output_generation,
                }),
                TraceStep::ExpectEvent(VoiceEvent::PlaybackCompleted {
                    turn_id: turn.clone(),
                }),
                TraceStep::ExpectState(TraceStateExpectation {
                    playback: Some(PlaybackStatus::Silent),
                    ..TraceStateExpectation::default()
                }),
                TraceStep::Command(Command::StopSession {
                    request_id: request("stop"),
                    session_id: session,
                }),
                TraceStep::ExpectState(TraceStateExpectation {
                    session: Some(SessionStatus::Closed),
                    ..TraceStateExpectation::default()
                }),
            ],
        };
        let report = trace.execute(FakeHostConfig::default()).unwrap();
        assert_eq!(report.command_results.len(), 6);
        assert!(report
            .semantic_events
            .contains(&VoiceEvent::PlaybackCompleted { turn_id: turn }));
    }

    #[test]
    fn thirty_minute_virtual_callback_trace_stays_within_fixed_rings() {
        let config = FakeHostConfig::default();
        let capture = CapturePort::new(25, config.input);
        let (render, producer) = RenderPort::new(25, 50);
        let events = HostEventPort::new(8, 8);
        let mut host = FakeDuplexHost::new(config);
        let route = host
            .open(
                RouteRequest {
                    generation: RouteGeneration(1),
                    preferred_input: None,
                    preferred_output: None,
                    require_duplex: true,
                },
                AudioPorts {
                    capture: capture.clone(),
                    render: render.clone(),
                    events,
                },
            )
            .unwrap();
        host.start(&route.route_id).unwrap();
        for interval in 0..180_000_u64 {
            let at = MonoTimeNs::from_millis(interval * 10);
            producer
                .push(RenderChunk::from_slice(&[0.1], OutputGeneration(0)).unwrap())
                .unwrap();
            let rendered = host.render(1, at);
            assert_eq!(rendered, [0.1]);
            host.capture(&[0.05], at);
            assert!(capture.pop().is_some());
            assert!(render.pop_reference().is_some());
        }
        assert_eq!(capture.queue_levels(), (0, 25));
        assert_eq!(render.reference_queue_levels(), (0, 50));
        assert_eq!(capture.overruns(), 0);
        assert_eq!(render.reference_overruns(), 0);
    }
}
