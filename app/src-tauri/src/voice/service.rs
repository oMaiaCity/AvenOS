use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Condvar, Mutex};

use aven_voice_core::{
    Action, CachedResult, Command, Observation, OutputGeneration, RouteGeneration, VoiceConfigV1,
};
use aven_voice_models::{NemotronRecognizerAdapter, SileroVadAdapter, WeSpeakerEmbedder};
#[cfg(feature = "software-voice-cpal")]
use aven_voice_protocol::{DecimalU64, RouteSnapshot};
use aven_voice_protocol::{
    PreparationSnapshot, RuntimeStatus, SessionId, SessionStatus, TurnId, VoiceErrorCode,
    VoiceEventEnvelope, VoiceFeature, VoiceSnapshot,
};
use aven_voice_runtime::{
    CapturePort, DuplexMetrics, DuplexPipeline, InputModels, OutputWork, OutputWorker,
    OutputWorkerEvent, PassThroughEnvironment, ProductionClock, RenderActivity, RenderPort,
    RuntimeObserver, TtsWork, TtsWorker, TtsWorkerEvent, VoiceRuntime, VoiceRuntimeHandle,
};
#[cfg(feature = "software-voice-cpal")]
use aven_voice_runtime::{DuplexPipelineConfig, HostEventPort, RouteRequest};
use tauri::Emitter;

use super::tts_adapter::SupertonicSynthesizerAdapter;

#[cfg(feature = "software-voice-cpal")]
const CAPTURE_CHUNKS: usize = 25;
#[cfg(feature = "software-voice-cpal")]
const RENDER_READY_CHUNKS: usize = 25;
#[cfg(feature = "software-voice-cpal")]
const RENDER_REFERENCE_CHUNKS: usize = 50;
const FULL_DUPLEX_BARGE_IN_ENV: &str = "AVEN_VOICE_FULL_DUPLEX_BARGE_IN";
const TESTER_ADAPTING_BARGE_IN_ENV: &str = "AVEN_VOICE_TESTER_ADAPTING_BARGE_IN";
type LiveCapture = (CapturePort, SessionId, RouteGeneration);

#[derive(Clone)]
struct DiagnosticSources {
    generation: RouteGeneration,
    capture: CapturePort,
    render: RenderPort,
    pipeline: DuplexMetrics,
    output: Arc<Mutex<OutputLevels>>,
}

#[derive(Clone, Copy, Debug, Default)]
struct OutputLevels {
    queued_seconds: f32,
    buffered_seconds: f32,
}

#[derive(Clone)]
pub struct VoiceService(Arc<VoiceServiceInner>);

struct VoiceServiceInner {
    runtime: VoiceRuntimeHandle,
    latest: Arc<(Mutex<VoiceSnapshot>, Condvar)>,
    preparation: Arc<(Mutex<PreparationSnapshot>, Condvar)>,
    diagnostics: Arc<(Mutex<Option<SessionId>>, Condvar)>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ServiceError {
    pub code: VoiceErrorCode,
    pub message: String,
}

impl VoiceService {
    pub fn new(app: tauri::AppHandle) -> Self {
        let config = VoiceConfigV1 {
            allow_full_duplex_barge_in: full_duplex_barge_in_enabled(),
            allow_tester_adapting_barge_in: tester_adapting_barge_in_enabled(),
            ..VoiceConfigV1::default()
        };
        if config.allow_full_duplex_barge_in {
            log::info!(
                target: "avenos::voice",
                "full-duplex barge-in enabled for the tester deployment"
            );
        } else {
            log::info!(
                target: "avenos::voice",
                "full-duplex barge-in disabled via {FULL_DUPLEX_BARGE_IN_ENV}"
            );
        }
        if config.allow_tester_adapting_barge_in {
            log::warn!(
                target: "avenos::voice",
                "tester adapting-AEC barge-in enabled via {TESTER_ADAPTING_BARGE_IN_ENV}"
            );
        }
        let nonce = format!("{:016x}", rand::random::<u64>());
        let clock = Arc::new(ProductionClock::default());
        let runtime = VoiceRuntime::spawn(nonce, config.clone(), clock.clone());
        let initial = runtime
            .snapshot(None)
            .expect("new voice runtime accepts a snapshot query")
            .recv()
            .expect("new voice coordinator answers a snapshot query")
            .expect("unscoped initial snapshot is valid");
        let latest = Arc::new((Mutex::new(initial), Condvar::new()));
        let preparation = Arc::new((
            Mutex::new(PreparationSnapshot {
                runtime: RuntimeStatus::Dormant,
                input_ready: false,
                output_ready: false,
            }),
            Condvar::new(),
        ));
        let diagnostics = Arc::new((Mutex::new(None), Condvar::new()));
        let diagnostic_sources = Arc::new((Mutex::new(None::<DiagnosticSources>), Condvar::new()));
        let liveness = Arc::new((Mutex::new(None::<LiveCapture>), Condvar::new()));
        let observer = runtime.observer();

        spawn_event_bridge(
            app.clone(),
            runtime.events().clone(),
            runtime.snapshotter(),
            Arc::clone(&latest),
        );
        spawn_action_executor(ActionExecutorContext {
            app,
            config,
            actions: runtime.actions().clone(),
            observer: observer.clone(),
            clock,
            preparation: Arc::clone(&preparation),
            liveness: Arc::clone(&liveness),
            diagnostic_sources: Arc::clone(&diagnostic_sources),
        });

        spawn_diagnostics_worker(observer, Arc::clone(&diagnostics), diagnostic_sources);
        spawn_liveness_worker(runtime.observer(), liveness);

        Self(Arc::new(VoiceServiceInner {
            runtime,
            latest,
            preparation,
            diagnostics,
        }))
    }

    pub fn command(&self, command: Command) -> Result<CachedResult, ServiceError> {
        self.0
            .runtime
            .command(command)
            .map_err(|_| ServiceError {
                code: VoiceErrorCode::QueueFull,
                message: "The voice command queue is full.".into(),
            })?
            .recv()
            .map_err(|_| ServiceError {
                code: VoiceErrorCode::Internal,
                message: "The voice runtime stopped.".into(),
            })?
            .map_err(|error| {
                log::warn!(
                    target: "avenos::voice",
                    "voice command rejected ({:?}): {}",
                    error.code,
                    error.message
                );
                ServiceError {
                    code: error.code,
                    message: error.message.into(),
                }
            })
    }

    pub fn snapshot(&self, session_id: Option<SessionId>) -> Result<VoiceSnapshot, ServiceError> {
        self.0
            .runtime
            .snapshot(session_id)
            .map_err(|_| ServiceError {
                code: VoiceErrorCode::QueueFull,
                message: "The voice command queue is full.".into(),
            })?
            .recv()
            .map_err(|_| ServiceError {
                code: VoiceErrorCode::Internal,
                message: "The voice runtime stopped.".into(),
            })?
            .map_err(|error| ServiceError {
                code: error.code,
                message: error.message.into(),
            })
    }

    pub fn wait_for_preparation(&self, features: &[VoiceFeature]) -> PreparationSnapshot {
        let wants_input = features.contains(&VoiceFeature::Input);
        let wants_output = features.contains(&VoiceFeature::Output);
        let (lock, changed) = &*self.0.preparation;
        let mut snapshot = lock.lock().expect("voice preparation mutex poisoned");
        while snapshot.runtime != RuntimeStatus::Failed
            && ((wants_input && !snapshot.input_ready) || (wants_output && !snapshot.output_ready))
        {
            snapshot = changed
                .wait(snapshot)
                .expect("voice preparation mutex poisoned while waiting");
        }
        snapshot.clone()
    }

    pub fn wait_for_session(&self, session_id: &SessionId) -> Result<VoiceSnapshot, ServiceError> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        let (lock, changed) = &*self.0.latest;
        let mut snapshot = lock.lock().expect("voice snapshot mutex poisoned");
        loop {
            if snapshot.session.session_id.as_ref() == Some(session_id)
                && matches!(
                    snapshot.session.status,
                    SessionStatus::Active | SessionStatus::Suspended
                )
            {
                return if snapshot.session.status == SessionStatus::Active {
                    Ok(snapshot.clone())
                } else {
                    Err(ServiceError {
                        code: VoiceErrorCode::RouteOpenFailed,
                        message: "The audio route could not be opened.".into(),
                    })
                };
            }
            let now = std::time::Instant::now();
            if now >= deadline {
                return Err(ServiceError {
                    code: VoiceErrorCode::RouteOpenFailed,
                    message: "Timed out while opening the audio route.".into(),
                });
            }
            let (next, timeout) = changed
                .wait_timeout(snapshot, deadline.saturating_duration_since(now))
                .expect("voice snapshot mutex poisoned while waiting");
            snapshot = next;
            if timeout.timed_out() {
                return Err(ServiceError {
                    code: VoiceErrorCode::RouteOpenFailed,
                    message: "Timed out while opening the audio route.".into(),
                });
            }
        }
    }

    pub fn set_diagnostics(&self, session_id: SessionId, enabled: bool) {
        let (lock, changed) = &*self.0.diagnostics;
        *lock.lock().expect("voice diagnostics mutex poisoned") = enabled.then_some(session_id);
        changed.notify_all();
    }
}

fn full_duplex_barge_in_enabled() -> bool {
    match std::env::var(FULL_DUPLEX_BARGE_IN_ENV) {
        Ok(value) => parse_boolean_override(&value).unwrap_or_else(|| {
            log::warn!(
                target: "avenos::voice",
                "unknown {FULL_DUPLEX_BARGE_IN_ENV}={value:?}; using default-on full duplex"
            );
            true
        }),
        Err(std::env::VarError::NotPresent) => true,
        Err(std::env::VarError::NotUnicode(_)) => {
            log::warn!(
                target: "avenos::voice",
                "non-Unicode {FULL_DUPLEX_BARGE_IN_ENV}; using default-on full duplex"
            );
            true
        }
    }
}

fn tester_adapting_barge_in_enabled() -> bool {
    match std::env::var(TESTER_ADAPTING_BARGE_IN_ENV) {
        Ok(value) => parse_boolean_override(&value).unwrap_or_else(|| {
            log::warn!(
                target: "avenos::voice",
                "unknown {TESTER_ADAPTING_BARGE_IN_ENV}={value:?}; keeping tester fallback off"
            );
            false
        }),
        Err(_) => false,
    }
}

fn parse_boolean_override(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "" | "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn spawn_diagnostics_worker(
    observer: RuntimeObserver,
    state: Arc<(Mutex<Option<SessionId>>, Condvar)>,
    sources: Arc<(Mutex<Option<DiagnosticSources>>, Condvar)>,
) {
    std::thread::Builder::new()
        .name("aven-voice-diagnostics".into())
        .spawn(move || loop {
            let source = {
                let (lock, changed) = &*sources;
                let mut source = lock
                    .lock()
                    .expect("voice diagnostic sources mutex poisoned");
                while source.is_none() {
                    source = changed
                        .wait(source)
                        .expect("voice diagnostic sources mutex poisoned while sleeping");
                }
                source.clone().expect("checked diagnostic sources")
            };
            std::thread::sleep(std::time::Duration::from_millis(500));
            if sources
                .0
                .lock()
                .expect("voice diagnostic sources mutex poisoned")
                .as_ref()
                .is_none_or(|current| current.generation != source.generation)
            {
                continue;
            }
            let pipeline = source.pipeline.snapshot();
            let (capture_queue_fill, capture_queue_capacity) = source.capture.queue_levels();
            let (reference_queue_fill, reference_queue_capacity) =
                source.render.reference_queue_levels();
            let (render_queue_fill, render_queue_capacity) = source.render.ready_queue_levels();
            let output = *source
                .output
                .lock()
                .expect("voice output metrics mutex poisoned");
            let _ = observer.publish(Observation::MetricsUpdated {
                generation: source.generation,
                metrics: aven_voice_core::RuntimeMetrics {
                    capture_overruns: source.capture.overruns(),
                    reference_overruns: source.render.reference_overruns(),
                    render_underruns: source.render.underruns(),
                    delay_hint_ms: Some(pipeline.delay_hint_ms),
                    drift_correction_ppm: pipeline.drift_correction_ppm,
                    render_rms: pipeline.render_rms,
                    render_peak: pipeline.render_peak,
                    raw_rms: pipeline.raw_rms,
                    raw_peak: pipeline.raw_peak,
                    clean_rms: pipeline.clean_rms,
                    clean_peak: pipeline.clean_peak,
                    clipped_fraction: pipeline.clipped_fraction,
                    echo_return_loss_db: pipeline.echo_return_loss_db,
                    echo_return_loss_enhancement_db: pipeline.echo_return_loss_enhancement_db,
                    residual_echo_likelihood: pipeline.residual_echo_likelihood,
                    vad_probability: pipeline.vad_probability,
                    queued_seconds: output.queued_seconds,
                    buffered_seconds: output.buffered_seconds,
                    capture_queue_fill: capture_queue_fill as u32,
                    capture_queue_capacity: capture_queue_capacity as u32,
                    reference_queue_fill: reference_queue_fill as u32,
                    reference_queue_capacity: reference_queue_capacity as u32,
                    render_queue_fill: render_queue_fill as u32,
                    render_queue_capacity: render_queue_capacity as u32,
                },
            });
            if state
                .0
                .lock()
                .expect("voice diagnostics mutex poisoned")
                .is_some()
            {
                let _ = observer.publish(Observation::DiagnosticsTick);
            }
        })
        .expect("voice diagnostics worker must start");
}

fn spawn_liveness_worker(
    observer: RuntimeObserver,
    state: Arc<(Mutex<Option<LiveCapture>>, Condvar)>,
) {
    std::thread::Builder::new()
        .name("aven-voice-liveness".into())
        .spawn(move || {
            let mut tracker = LivenessTracker::default();
            loop {
                let current = {
                    let (lock, changed) = &*state;
                    let mut route = lock.lock().expect("voice liveness mutex poisoned");
                    while route.is_none() {
                        route = changed
                            .wait(route)
                            .expect("voice liveness mutex poisoned while sleeping");
                    }
                    route.clone().expect("checked live capture")
                };
                if tracker.generation != Some(current.2) {
                    tracker.observe(current.2, current.0.callbacks());
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
                let still_current = state
                    .0
                    .lock()
                    .expect("voice liveness mutex poisoned")
                    .as_ref()
                    .is_some_and(|(_, _, generation)| *generation == current.2);
                if !still_current {
                    tracker.reset();
                    continue;
                }
                let callbacks = current.0.callbacks();
                if tracker.observe(current.2, callbacks) {
                    log::warn!(
                        target: "avenos::voice",
                        "capture callbacks stalled for route generation {} after {callbacks} callbacks",
                        current.2.0
                    );
                    let _ = observer.publish(Observation::CallbacksStalled {
                        session_id: current.1.clone(),
                        generation: current.2,
                    });
                }
            }
        })
        .expect("voice liveness worker must start");
}

#[derive(Default)]
struct LivenessTracker {
    generation: Option<RouteGeneration>,
    callbacks: u64,
    unchanged_seconds: u8,
    reported: bool,
}

impl LivenessTracker {
    fn reset(&mut self) {
        *self = Self::default();
    }

    fn observe(&mut self, generation: RouteGeneration, callbacks: u64) -> bool {
        if self.generation != Some(generation) {
            self.generation = Some(generation);
            self.callbacks = callbacks;
            self.unchanged_seconds = 0;
            self.reported = false;
            return false;
        }
        if callbacks != self.callbacks {
            self.callbacks = callbacks;
            self.unchanged_seconds = 0;
            self.reported = false;
            return false;
        }
        self.unchanged_seconds = self.unchanged_seconds.saturating_add(1);
        if self.unchanged_seconds >= 3 && !self.reported {
            self.reported = true;
            return true;
        }
        false
    }
}

fn spawn_event_bridge(
    app: tauri::AppHandle,
    events: crossbeam_channel::Receiver<VoiceEventEnvelope>,
    snapshots: aven_voice_runtime::RuntimeSnapshotter,
    latest: Arc<(Mutex<VoiceSnapshot>, Condvar)>,
) {
    std::thread::Builder::new()
        .name("aven-voice-events".into())
        .spawn(move || {
            while let Ok(event) = events.recv() {
                if let Ok(reply) = snapshots.snapshot(None) {
                    if let Ok(Ok(snapshot)) = reply.recv() {
                        let (lock, changed) = &*latest;
                        *lock.lock().expect("voice snapshot mutex poisoned") = snapshot;
                        changed.notify_all();
                    }
                }
                let _ = app.emit("voice-event", event);
            }
        })
        .expect("voice event bridge must start");
}

#[allow(dead_code)]
enum ExecutorFeedback {
    Tts(TtsWorkerEvent),
    Render(RenderActivity),
    Output(OutputWorkerEvent),
    Host(aven_voice_runtime::HostEvent),
    HostCriticalOverflow(RouteGeneration),
}

#[derive(Debug)]
struct OutputTurnState {
    turn_id: TurnId,
    finished: bool,
    pending_synthesis: usize,
    finish_enqueued: bool,
    output_finished: bool,
}

impl OutputTurnState {
    fn new(turn_id: TurnId) -> Self {
        Self {
            turn_id,
            finished: false,
            pending_synthesis: 0,
            finish_enqueued: false,
            output_finished: false,
        }
    }

    fn synthesis_enqueued(&mut self) {
        self.pending_synthesis = self.pending_synthesis.saturating_add(1);
    }

    fn synthesis_terminal(&mut self) {
        self.pending_synthesis = self.pending_synthesis.saturating_sub(1);
    }

    fn can_complete(&self, output_empty: bool) -> bool {
        self.finished && self.pending_synthesis == 0 && self.output_finished && output_empty
    }
}

struct ActionExecutorContext {
    app: tauri::AppHandle,
    config: VoiceConfigV1,
    actions: crossbeam_channel::Receiver<Action>,
    observer: RuntimeObserver,
    clock: Arc<ProductionClock>,
    preparation: Arc<(Mutex<PreparationSnapshot>, Condvar)>,
    liveness: Arc<(Mutex<Option<LiveCapture>>, Condvar)>,
    diagnostic_sources: Arc<(Mutex<Option<DiagnosticSources>>, Condvar)>,
}

fn spawn_action_executor(context: ActionExecutorContext) {
    std::thread::Builder::new()
        .name("aven-voice-actions".into())
        .spawn(move || action_executor(context))
        .expect("voice action executor must start");
}

fn action_executor(context: ActionExecutorContext) {
    let ActionExecutorContext {
        app,
        config,
        actions,
        observer,
        clock,
        preparation,
        liveness,
        diagnostic_sources,
    } = context;
    let (feedback_tx, feedback_rx) = crossbeam_channel::bounded::<ExecutorFeedback>(64);
    let mut environment = PassThroughEnvironment;
    let mut input_models: Option<InputModels> = None;
    let mut input_prepared = false;
    let mut pipeline: Option<DuplexPipeline> = None;
    let mut tts_worker: Option<TtsWorker> = None;
    let mut output_prepared = false;
    let mut render: Option<RenderPort> = None;
    let mut output: Option<OutputWorker> = None;
    let mut output_levels: Option<Arc<Mutex<OutputLevels>>> = None;
    #[allow(unused_mut)]
    let mut output_rate_hz = 48_000;
    let mut active_output_generation = OutputGeneration(0);
    let mut turns = HashMap::<OutputGeneration, OutputTurnState>::new();
    let mut reported_callback_fault_generation = None;
    let mut reported_callback_faults =
        HashSet::<(bool, aven_voice_runtime::HostCallbackFaultCode)>::new();
    let fade_completions = Arc::new((
        Mutex::new(HashSet::<OutputGeneration>::new()),
        Condvar::new(),
    ));

    #[cfg(feature = "software-voice-cpal")]
    let mut host = aven_voice_host_cpal::CpalDuplexHost::new();
    #[cfg(feature = "software-voice-cpal")]
    {
        let identity = host.diagnostic_identity();
        log::info!(
            target: "avenos::voice",
            "audio host selected: backend={}, input={:?}, output={:?}",
            identity.backend,
            identity.input_device,
            identity.output_device
        );
    }
    #[cfg(feature = "software-voice-cpal")]
    let mut open_route: Option<(
        aven_voice_protocol::RouteId,
        aven_voice_core::RouteGeneration,
        SessionId,
    )> = None;

    loop {
        crossbeam_channel::select! {
            recv(actions) -> action => {
                let Ok(action) = action else { break };
                match action {
                    Action::PrepareModels(features) => {
                        {
                            let (lock, changed) = &*preparation;
                            lock.lock()
                                .expect("voice preparation mutex poisoned")
                                .runtime = RuntimeStatus::Preparing;
                            changed.notify_all();
                        }
                        let wants_input = features.contains(&VoiceFeature::Input);
                        let wants_output = features.contains(&VoiceFeature::Output);
                        let mut input_failed = false;
                        let mut output_failed = false;
                        if wants_input && input_models.is_none() {
                            let loaded = (|| {
                                let paths = crate::asr::prepare_model_paths(&app)?;
                                let vad = aven_voice_models::vad::Vad::open(&paths.vad_path)?;
                                let recognizer = NemotronRecognizerAdapter::open(
                                    &paths.model_dir,
                                    config.target_asr_peak,
                                    config.max_asr_gain,
                                )?;
                                let speaker = paths.speaker_path.as_deref().and_then(|path| {
                                    match WeSpeakerEmbedder::open(path) {
                                        Ok(embedder) => {
                                            log::info!(
                                                target: "avenos::voice",
                                                "anonymous speaker diarization ready"
                                            );
                                            Some(Box::new(embedder) as Box<dyn aven_voice_runtime::SpeakerEmbedder>)
                                        }
                                        Err(error) => {
                                            log::warn!(
                                                target: "avenos::voice",
                                                "speaker model failed to load; continuing without diarization: {error:#}"
                                            );
                                            None
                                        }
                                    }
                                });
                                anyhow::Ok(InputModels {
                                    vad: Box::new(SileroVadAdapter(vad)),
                                    recognizer: Box::new(recognizer),
                                    speaker,
                                })
                            })();
                            match loaded {
                                Ok(models) => {
                                    input_models = Some(models);
                                    input_prepared = true;
                                }
                                Err(error) => {
                                    input_failed = true;
                                    log::error!(target: "avenos::voice", "input model preparation failed: {error:#}");
                                }
                            }
                        }
                        if wants_output && tts_worker.is_none() {
                            match SupertonicSynthesizerAdapter::open(app.clone()) {
                                Ok(synthesizer) => {
                                    let worker = TtsWorker::spawn(Box::new(synthesizer));
                                    let events = worker.events().clone();
                                    let feedback = feedback_tx.clone();
                                    std::thread::Builder::new()
                                        .name("aven-voice-tts-events".into())
                                        .spawn(move || {
                                            while let Ok(event) = events.recv() {
                                                if feedback.send(ExecutorFeedback::Tts(event)).is_err() {
                                                    break;
                                                }
                                            }
                                        })
                                        .expect("TTS event bridge must start");
                                    tts_worker = Some(worker);
                                    output_prepared = true;
                                }
                                Err(error) => {
                                    output_failed = true;
                                    log::error!(target: "avenos::voice", "output model preparation failed: {error:#}");
                                }
                            }
                        }
                        if input_failed || output_failed {
                            let _ = observer.publish(Observation::ModelsFailed {
                                input: input_failed,
                                output: output_failed,
                            });
                        } else {
                            let _ = observer.publish(Observation::ModelsPrepared {
                                input: input_prepared,
                                output: output_prepared,
                            });
                        }
                        {
                            let (lock, changed) = &*preparation;
                            let mut snapshot =
                                lock.lock().expect("voice preparation mutex poisoned");
                            snapshot.runtime = if input_failed || output_failed {
                                RuntimeStatus::Failed
                            } else {
                                RuntimeStatus::Ready
                            };
                            snapshot.input_ready = input_prepared;
                            snapshot.output_ready = output_prepared;
                            changed.notify_all();
                        }
                    }
                    Action::ActivateEnvironment(session_id) => {
                        use aven_voice_runtime::{AudioEnvironment, EnvironmentEventPort, EnvironmentMode, EnvironmentRequest, EnvironmentState};
                        let state = environment.activate(
                            EnvironmentRequest { session_id: session_id.clone(), mode: EnvironmentMode::Conversation },
                            EnvironmentEventPort::new(8),
                        );
                        if matches!(state, Ok(EnvironmentState::Active)) {
                            let _ = observer.publish(Observation::EnvironmentActivated { session_id });
                        } else {
                            let _ = observer.publish(Observation::RouteFault {
                                generation: aven_voice_core::RouteGeneration(0),
                                recoverable: false,
                            });
                        }
                    }
                    Action::OpenRoute { session_id, generation, preferred_input, preferred_output } => {
                        #[cfg(feature = "software-voice-cpal")]
                        {
                            use aven_voice_runtime::DuplexHost;
                            match host.default_route_descriptors() {
                                Ok((input_descriptor, output_descriptor)) => {
                                    let capture = CapturePort::new(CAPTURE_CHUNKS, input_descriptor);
                                    let liveness_capture = capture.clone();
                                    let (render_port, producer) = RenderPort::new(
                                        RENDER_READY_CHUNKS,
                                        RENDER_REFERENCE_CHUNKS,
                                    );
                                    let diagnostic_render = render_port.clone();
                                    render_port.configure_output_rate(output_descriptor.sample_rate_hz);
                                    let render_activity = render_port.activity();
                                    let host_events = HostEventPort::new(8, 8);
                                    let host_events_consumer = host_events.consumer();
                                    let ports = aven_voice_runtime::AudioPorts {
                                        capture: capture.clone(),
                                        render: render_port.clone(),
                                        events: host_events,
                                    };
                                    let request = RouteRequest {
                                        generation,
                                        preferred_input: preferred_input.map(aven_voice_runtime::OpaqueDevicePreference),
                                        preferred_output: preferred_output.map(aven_voice_runtime::OpaqueDevicePreference),
                                        require_duplex: true,
                                    };
                                    match host.open(request, ports) {
                                        Ok(descriptor) => {
                                            let Some(models) = input_models.take() else {
                                                let _ = host.close(&descriptor.route_id);
                                                let _ = observer.publish(Observation::RouteFault { generation, recoverable: false });
                                                continue;
                                            };
                                            let echo = Box::new(aven_voice_runtime::SoftwareAec3::new(config.clone()));
                                            let pipeline_metrics = match DuplexPipeline::spawn(
                                                DuplexPipelineConfig {
                                                    session_id: session_id.clone(),
                                                    route_generation: generation,
                                                    input_rate_hz: descriptor.input.sample_rate_hz,
                                                    input_channels: descriptor.input.channels,
                                                    output_rate_hz: descriptor.output.sample_rate_hz,
                                                    input_timestamp_quality: descriptor.input_timestamp_quality,
                                                    output_timestamp_quality: descriptor.output_timestamp_quality,
                                                    callback_only_delay_hint_ms: None,
                                                    diagnostic_audio_tap: None,
                                                    id_prefix: format!("route{}", generation.0),
                                                },
                                                config.clone(),
                                                capture,
                                                render_port.clone(),
                                                echo,
                                                models,
                                                observer.clone(),
                                            ) {
                                                Ok(created) => {
                                                    let metrics = created.metrics();
                                                    pipeline = Some(created);
                                                    metrics
                                                },
                                                Err(_) => {
                                                    let _ = host.close(&descriptor.route_id);
                                                    let _ = observer.publish(Observation::RouteFault { generation, recoverable: false });
                                                    continue;
                                                }
                                            };
                                            output_rate_hz = descriptor.output.sample_rate_hz;
                                            let prepared_output = match OutputWorker::spawn(
                                                output_rate_hz,
                                                producer,
                                                active_output_generation,
                                                config.max_synthesized_lead_ms,
                                            ) {
                                                Ok(worker) => worker,
                                                Err(_) => {
                                                    let _ = host.close(&descriptor.route_id);
                                                    let _ = observer.publish(Observation::RouteFault {
                                                        generation,
                                                        recoverable: false,
                                                    });
                                                    continue;
                                                }
                                            };
                                            let output_events = prepared_output.events().clone();
                                            let feedback = feedback_tx.clone();
                                            std::thread::Builder::new()
                                                .name("aven-voice-output-events".into())
                                                .spawn(move || {
                                                    while let Ok(event) = output_events.recv() {
                                                        if feedback.send(ExecutorFeedback::Output(event)).is_err() {
                                                            break;
                                                        }
                                                    }
                                                })
                                                .expect("output event bridge must start");
                                            output = Some(prepared_output);
                                            let levels = Arc::new(Mutex::new(OutputLevels::default()));
                                            output_levels = Some(Arc::clone(&levels));
                                            render = Some(render_port);
                                            open_route = Some((descriptor.route_id.clone(), generation, session_id.clone()));
                                            {
                                                let (lock, changed) = &*liveness;
                                                *lock.lock().expect("voice liveness mutex poisoned") = Some((
                                                    liveness_capture.clone(),
                                                    session_id.clone(),
                                                    generation,
                                                ));
                                                changed.notify_all();
                                            }
                                            {
                                                let (lock, changed) = &*diagnostic_sources;
                                                *lock
                                                    .lock()
                                                    .expect("voice diagnostic sources mutex poisoned") =
                                                    Some(DiagnosticSources {
                                                        generation,
                                                        capture: liveness_capture.clone(),
                                                        render: diagnostic_render,
                                                        pipeline: pipeline_metrics,
                                                        output: levels,
                                                    });
                                                changed.notify_all();
                                            }

                                            let feedback = feedback_tx.clone();
                                            let completed_fades = Arc::clone(&fade_completions);
                                            std::thread::Builder::new()
                                                .name("aven-voice-render-events".into())
                                                .spawn(move || {
                                                    while let Ok(event) = render_activity.recv() {
                                                        if let RenderActivity::FadeComplete(generation) = event {
                                                            let (lock, changed) = &*completed_fades;
                                                            lock.lock()
                                                                .expect("voice fade completion mutex poisoned")
                                                                .insert(generation);
                                                            changed.notify_all();
                                                        }
                                                        if feedback.send(ExecutorFeedback::Render(event)).is_err() {
                                                            break;
                                                        }
                                                    }
                                                })
                                                .expect("render event bridge must start");
                                            let feedback = feedback_tx.clone();
                                            std::thread::Builder::new()
                                                .name("aven-voice-host-events".into())
                                                .spawn(move || {
                                                    while let Some(event) = host_events_consumer.recv() {
                                                        if feedback.send(ExecutorFeedback::Host(event)).is_err() {
                                                            break;
                                                        }
                                                        if host_events_consumer.take_critical_overflowed()
                                                            && feedback
                                                                .send(ExecutorFeedback::HostCriticalOverflow(generation))
                                                                .is_err()
                                                        {
                                                            break;
                                                        }
                                                    }
                                                })
                                                .expect("host event bridge must start");
                                            let route = RouteSnapshot {
                                                route_id: descriptor.route_id,
                                                generation: DecimalU64::new(generation.0),
                                                input_rate_hz: descriptor.input.sample_rate_hz,
                                                input_channels: descriptor.input.channels,
                                                output_rate_hz: descriptor.output.sample_rate_hz,
                                                output_channels: descriptor.output.channels,
                                                input_callback_frames: descriptor.input.nominal_callback_frames,
                                                output_callback_frames: descriptor.output.nominal_callback_frames,
                                                input_timestamp_quality: protocol_timestamp_quality(descriptor.input_timestamp_quality),
                                                output_timestamp_quality: protocol_timestamp_quality(descriptor.output_timestamp_quality),
                                                full_duplex_barge_in: false,
                                            };
                                            let _ = observer.publish(Observation::RouteOpened {
                                                session_id,
                                                generation,
                                                route,
                                            });
                                        }
                                        Err(error) => {
                                            log::warn!(target: "avenos::voice", "audio route open failed: {}", error);
                                            let _ = observer.publish(Observation::RouteFault { generation, recoverable: error.recoverable });
                                        }
                                    }
                                }
                                Err(error) => {
                                    let _ = observer.publish(Observation::RouteFault { generation, recoverable: error.recoverable });
                                }
                            }
                        }
                        #[cfg(not(feature = "software-voice-cpal"))]
                        {
                            let _ = (session_id, preferred_input, preferred_output);
                            let _ = observer.publish(Observation::RouteFault { generation, recoverable: false });
                        }
                    }
                    Action::StartRoute(generation) => {
                        #[cfg(not(feature = "software-voice-cpal"))]
                        let _ = generation;
                        #[cfg(feature = "software-voice-cpal")]
                        {
                            use aven_voice_runtime::DuplexHost;
                            if let Some((route, _, session_id)) = open_route.as_ref().filter(|(_, value, _)| *value == generation) {
                                match host.start(route) {
                                    Ok(()) => {
                                        let _ = observer.publish(Observation::RouteStarted { session_id: session_id.clone(), generation });
                                    }
                                    Err(error) => {
                                        log::warn!(target: "avenos::voice", "audio route start failed: {error}");
                                        let _ = observer.publish(Observation::RouteFault {
                                            generation,
                                            recoverable: error.recoverable,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    Action::CloseRoute(generation) => {
                        {
                            let (lock, changed) = &*liveness;
                            let mut live = lock.lock().expect("voice liveness mutex poisoned");
                            if live
                                .as_ref()
                                .is_some_and(|(_, _, active_generation)| *active_generation == generation)
                            {
                                *live = None;
                                changed.notify_all();
                            }
                        }
                        {
                            let (lock, changed) = &*diagnostic_sources;
                            let mut sources = lock
                                .lock()
                                .expect("voice diagnostic sources mutex poisoned");
                            if sources
                                .as_ref()
                                .is_some_and(|source| source.generation == generation)
                            {
                                *sources = None;
                                changed.notify_all();
                            }
                        }
                        // The render callback owns the exact fade timeline.
                        // Keep the stream alive until it acknowledges the fade;
                        // a short timeout covers a route whose callbacks died.
                        let retiring: Vec<_> = turns.keys().copied().collect();
                        if !retiring.is_empty() {
                            let deadline = std::time::Instant::now()
                                + std::time::Duration::from_millis(
                                    u64::from(config.output_fade_ms) + 50,
                                );
                            let (lock, changed) = &*fade_completions;
                            let mut completed = lock
                                .lock()
                                .expect("voice fade completion mutex poisoned");
                            while !retiring.iter().all(|generation| completed.contains(generation)) {
                                let now = std::time::Instant::now();
                                if now >= deadline {
                                    break;
                                }
                                let (next, timeout) = changed
                                    .wait_timeout(completed, deadline.saturating_duration_since(now))
                                    .expect("voice fade completion mutex poisoned while waiting");
                                completed = next;
                                if timeout.timed_out() {
                                    break;
                                }
                            }
                            let callback_completed = retiring
                                .iter()
                                .all(|generation| completed.contains(generation));
                            for generation in &retiring {
                                completed.remove(generation);
                            }
                            drop(completed);
                            if !callback_completed {
                                let retiring: Vec<_> = turns.drain().collect();
                                for (output_generation, turn) in retiring {
                                    let _ = observer.publish(Observation::FadeDrained {
                                        turn_id: turn.turn_id,
                                        generation: output_generation,
                                    });
                                }
                            }
                        }
                        #[cfg(feature = "software-voice-cpal")]
                        {
                            use aven_voice_runtime::DuplexHost;
                            if let Some((route, _, _)) = open_route.take().filter(|(_, value, _)| *value == generation) {
                                let _ = host.close(&route);
                            }
                        }
                        render = None;
                        output = None;
                        output_levels = None;
                        if let Some(active) = pipeline.take() {
                            input_models = Some(active.stop());
                        }
                    }
                    Action::StopSession(_) => {
                        use aven_voice_runtime::AudioEnvironment;
                        let _ = environment.deactivate();
                    }
                    Action::SetOutputGeneration(generation) => {
                        active_output_generation = generation;
                        if let Some(render) = &render { render.set_active_generation(generation); }
                        if let Some(output) = &output { output.set_generation(generation); }
                        refresh_output_levels(&output, &output_levels);
                    }
                    Action::EnqueueTts { turn_id, segment_index, text, language, voice, generation } => {
                        let work = TtsWork {
                            turn_id: turn_id.clone(),
                            segment_index,
                            generation,
                            request: aven_voice_runtime::SynthesisRequest { text, language, voice },
                        };
                        let enqueued = tts_worker
                            .as_ref()
                            .is_some_and(|worker| worker.enqueue(work).is_ok());
                        if enqueued {
                            turns
                                .entry(generation)
                                .or_insert_with(|| OutputTurnState::new(turn_id))
                                .synthesis_enqueued();
                        } else {
                            let _ = observer.publish(Observation::SynthesisFailed { turn_id, generation });
                        }
                    }
                    Action::FinishTts(turn_id) => {
                        let generation = turns.iter_mut().find_map(|(generation, turn)| {
                            if turn.turn_id == turn_id {
                                turn.finished = true;
                                Some(*generation)
                            } else {
                                None
                            }
                        });
                        if let Some(generation) = generation {
                            publish_playback_drained_if_ready(
                                generation,
                                active_output_generation,
                                &mut turns,
                                &mut output,
                                &observer,
                            );
                            refresh_output_levels(&output, &output_levels);
                        }
                    }
                    Action::CancelTts(turn_id) => {
                        if let Some(worker) = &tts_worker { worker.cancel(Some(&turn_id)); }
                    }
                    Action::RetireOutput { retiring, active } => {
                        active_output_generation = active;
                        if let Some(render) = &render { render.retire(retiring, active, config.output_fade_ms, output_rate_hz); }
                        if let Some(output) = &output { output.set_generation(active); }
                        refresh_output_levels(&output, &output_levels);
                    }
                    Action::FadeOutput { turn_id, generation, .. } => {
                        turns
                            .entry(generation)
                            .or_insert_with(|| OutputTurnState::new(turn_id));
                    }
                    Action::ResetInput => {
                        if let Some(pipeline) = &pipeline { pipeline.reset_input(); }
                    }
                    Action::ScheduleRouteRetry { generation, attempt, at } => {
                        use aven_voice_runtime::ClockSource;
                        let delay = at.0.saturating_sub(clock.now().0);
                        let retry_observer = observer.clone();
                        std::thread::Builder::new()
                            .name("aven-voice-route-retry".into())
                            .spawn(move || {
                                std::thread::sleep(std::time::Duration::from_nanos(delay));
                                let _ = retry_observer.publish(Observation::RouteRetryDue {
                                    generation,
                                    attempt,
                                });
                            })
                            .expect("route retry timer must start");
                    }
                    Action::DropOutput(_) | Action::BeginRecognizer(_)
                    | Action::CandidateDiscarded { .. } | Action::SpeechCancelled { .. }
                    | Action::Emit(_) => {}
                }
            },
            recv(feedback_rx) -> feedback => {
                let Ok(feedback) = feedback else { break };
                match feedback {
                    ExecutorFeedback::Tts(TtsWorkerEvent::Started { turn_id, segment_index, generation }) => {
                        let _ = observer.publish(Observation::SynthesisStarted { turn_id, segment_index, generation });
                    }
                    ExecutorFeedback::Tts(TtsWorkerEvent::Completed { turn_id, segment_index, generation, pcm }) => {
                        let enqueued = output.as_ref().is_some_and(|output| {
                            output.enqueue(OutputWork {
                                turn_id: turn_id.clone(),
                                segment_index,
                                generation,
                                pcm,
                            }).is_ok()
                        });
                        if !enqueued {
                            if let Some(turn) = turns.get_mut(&generation) {
                                turn.synthesis_terminal();
                            }
                            let _ = observer.publish(Observation::SynthesisFailed { turn_id, generation });
                            publish_playback_drained_if_ready(
                                generation,
                                active_output_generation,
                                &mut turns,
                                &mut output,
                                &observer,
                            );
                        }
                    }
                    ExecutorFeedback::Tts(TtsWorkerEvent::Failed { turn_id, generation, .. }) => {
                        if let Some(turn) = turns.get_mut(&generation) {
                            turn.synthesis_terminal();
                        }
                        let _ = observer.publish(Observation::SynthesisFailed { turn_id, generation });
                        publish_playback_drained_if_ready(
                            generation,
                            active_output_generation,
                            &mut turns,
                            &mut output,
                            &observer,
                        );
                    }
                    ExecutorFeedback::Tts(TtsWorkerEvent::Cancelled { generation, .. }) => {
                        if let Some(turn) = turns.get_mut(&generation) {
                            turn.synthesis_terminal();
                        }
                        publish_playback_drained_if_ready(
                            generation,
                            active_output_generation,
                            &mut turns,
                            &mut output,
                            &observer,
                        );
                    }
                    ExecutorFeedback::Render(RenderActivity::Audible(generation)) => {
                        if let Some(turn) = turns.get(&generation) {
                            let _ = observer.publish(Observation::PlaybackAudible { turn_id: turn.turn_id.clone(), generation });
                        }
                    }
                    ExecutorFeedback::Render(RenderActivity::FadeComplete(generation)) => {
                        if let Some(turn) = turns.remove(&generation) {
                            let _ = observer.publish(Observation::FadeDrained { turn_id: turn.turn_id, generation });
                        }
                    }
                    ExecutorFeedback::Render(RenderActivity::Silent) => {
                        publish_playback_drained_if_ready(
                            active_output_generation,
                            active_output_generation,
                            &mut turns,
                            &mut output,
                            &observer,
                        );
                        refresh_output_levels(&output, &output_levels);
                    }
                    ExecutorFeedback::Output(event) => {
                        match event {
                            OutputWorkerEvent::Prepared { turn_id, segment_index, generation, .. } => {
                                if let Some(turn) = turns.get_mut(&generation) {
                                    turn.synthesis_terminal();
                                }
                                let _ = observer.publish(Observation::SynthesisCompleted {
                                    turn_id,
                                    segment_index,
                                    generation,
                                });
                            }
                            OutputWorkerEvent::Cancelled { generation, .. } => {
                                if let Some(turn) = turns.get_mut(&generation) {
                                    turn.synthesis_terminal();
                                }
                            }
                            OutputWorkerEvent::Failed { turn_id, generation, .. }
                            | OutputWorkerEvent::FinishFailed { turn_id, generation, .. } => {
                                if let Some(turn) = turns.get_mut(&generation) {
                                    turn.synthesis_terminal();
                                }
                                let _ = observer.publish(Observation::SynthesisFailed {
                                    turn_id,
                                    generation,
                                });
                            }
                            OutputWorkerEvent::Finished { turn_id, generation } => {
                                if let Some(turn) = turns.get_mut(&generation).filter(|turn| turn.turn_id == turn_id) {
                                    turn.output_finished = true;
                                }
                            }
                            OutputWorkerEvent::Capacity => {}
                        }
                        refresh_output_levels(&output, &output_levels);
                        publish_playback_drained_if_ready(
                            active_output_generation,
                            active_output_generation,
                            &mut turns,
                            &mut output,
                            &observer,
                        );
                    }
                    ExecutorFeedback::Host(aven_voice_runtime::HostEvent::Started { .. }) => {}
                    ExecutorFeedback::Host(aven_voice_runtime::HostEvent::StreamFault {
                        route,
                        generation,
                        direction,
                        code,
                        recoverable,
                    }) => {
                        log::warn!(
                            target: "avenos::voice",
                            "audio callback fault on {route:?} generation {} ({direction:?}, {code:?}, recoverable={recoverable})",
                            generation.0
                        );
                        let _ = observer.publish(Observation::RouteFault { generation, recoverable });
                    }
                    ExecutorFeedback::Host(aven_voice_runtime::HostEvent::RouteInvalidated { route, generation, reason }) => {
                        log::warn!(
                            target: "avenos::voice",
                            "audio route {route:?} generation {} invalidated ({reason:?})",
                            generation.0
                        );
                        let _ = observer.publish(Observation::RouteFault { generation, recoverable: true });
                    }
                    ExecutorFeedback::Host(aven_voice_runtime::HostEvent::CallbackFault {
                        route,
                        generation,
                        direction,
                        code,
                        count,
                    }) => {
                        let render = matches!(direction, aven_voice_runtime::StreamDirection::Render);
                        if reported_callback_fault_generation != Some(generation.0) {
                            reported_callback_fault_generation = Some(generation.0);
                            reported_callback_faults.clear();
                        }
                        if reported_callback_faults.insert((render, code)) {
                            log::warn!(
                                target: "avenos::voice",
                                "audio callback reported {code:?} on {route:?} generation {} ({direction:?}, first batch={count})",
                                generation.0
                            );
                        }
                        if code.requires_route_rebuild() {
                            let _ = observer.publish(Observation::RouteFault {
                                generation,
                                recoverable: code.recoverable(),
                            });
                        }
                    }
                    ExecutorFeedback::Host(aven_voice_runtime::HostEvent::DeviceSetChanged) => {}
                    ExecutorFeedback::HostCriticalOverflow(generation) => {
                        let _ = observer.publish(Observation::RouteFault {
                            generation,
                            recoverable: true,
                        });
                    }
                }
            }
        }
    }
}

#[cfg(feature = "software-voice-cpal")]
fn protocol_timestamp_quality(
    quality: aven_voice_runtime::TimestampQuality,
) -> aven_voice_protocol::TimestampQuality {
    match quality {
        aven_voice_runtime::TimestampQuality::Hardware => {
            aven_voice_protocol::TimestampQuality::Hardware
        }
        aven_voice_runtime::TimestampQuality::HostEstimated => {
            aven_voice_protocol::TimestampQuality::HostEstimated
        }
        aven_voice_runtime::TimestampQuality::CallbackOnly => {
            aven_voice_protocol::TimestampQuality::CallbackOnly
        }
    }
}

fn refresh_output_levels(output: &Option<OutputWorker>, levels: &Option<Arc<Mutex<OutputLevels>>>) {
    let Some(levels) = levels else {
        return;
    };
    let current = output
        .as_ref()
        .map(|output| OutputLevels {
            queued_seconds: output.queued_seconds(),
            buffered_seconds: output.buffered_seconds(),
        })
        .unwrap_or_default();
    *levels.lock().expect("voice output metrics mutex poisoned") = current;
}

fn publish_playback_drained_if_ready(
    generation: OutputGeneration,
    active_generation: OutputGeneration,
    turns: &mut HashMap<OutputGeneration, OutputTurnState>,
    output: &mut Option<OutputWorker>,
    observer: &RuntimeObserver,
) {
    if generation != active_generation {
        return;
    }
    let should_finish = turns
        .get(&generation)
        .is_some_and(|turn| turn.finished && turn.pending_synthesis == 0 && !turn.finish_enqueued);
    if should_finish {
        if let (Some(output), Some(turn)) = (output.as_ref(), turns.get_mut(&generation)) {
            if output.finish(turn.turn_id.clone(), generation).is_ok() {
                turn.finish_enqueued = true;
            } else {
                let _ = observer.publish(Observation::SynthesisFailed {
                    turn_id: turn.turn_id.clone(),
                    generation,
                });
            }
        }
    }
    let output_empty = output.as_ref().is_some_and(OutputWorker::is_empty);
    if turns
        .get(&generation)
        .is_some_and(|turn| turn.can_complete(output_empty))
    {
        let turn = turns
            .remove(&generation)
            .expect("checked output turn exists");
        let _ = observer.publish(Observation::PlaybackDrained {
            turn_id: turn.turn_id,
            generation,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_duplex_override_requires_an_explicit_boolean_value() {
        for enabled in ["1", "true", "TRUE", " yes ", "on"] {
            assert_eq!(parse_boolean_override(enabled), Some(true));
        }
        for disabled in ["", "0", "false", "FALSE", " no ", "off"] {
            assert_eq!(parse_boolean_override(disabled), Some(false));
        }
        assert_eq!(parse_boolean_override("automatic"), None);
    }

    #[test]
    fn finished_turn_waits_for_all_synthesis_and_native_output() {
        let mut turn = OutputTurnState::new(TurnId::parse("turn").unwrap());
        turn.synthesis_enqueued();
        turn.synthesis_enqueued();
        turn.finished = true;

        assert!(!turn.can_complete(true));
        turn.synthesis_terminal();
        assert!(!turn.can_complete(true));
        turn.synthesis_terminal();
        assert!(!turn.can_complete(false));
        turn.output_finished = true;
        assert!(turn.can_complete(true));
    }

    #[test]
    fn liveness_reports_once_after_three_unchanged_seconds_and_rearms() {
        let generation = RouteGeneration(4);
        let mut tracker = LivenessTracker::default();
        assert!(!tracker.observe(generation, 10));
        assert!(!tracker.observe(generation, 10));
        assert!(!tracker.observe(generation, 10));
        assert!(tracker.observe(generation, 10));
        assert!(!tracker.observe(generation, 10));
        assert!(!tracker.observe(generation, 11));
        assert!(!tracker.observe(generation, 11));
        assert!(!tracker.observe(generation, 11));
        assert!(tracker.observe(generation, 11));
        assert!(!tracker.observe(RouteGeneration(5), 0));
    }

    #[test]
    fn duplicate_terminal_feedback_cannot_underflow_pending_work() {
        let mut turn = OutputTurnState::new(TurnId::parse("turn").unwrap());
        turn.synthesis_terminal();
        assert_eq!(turn.pending_synthesis, 0);
    }
}
