mod duplex_lab {
    pub mod scenario;
}

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, bail, Context, Result};
use aven_voice_core::{
    Action, CachedResult, Command, Observation, OutputGeneration, SpeakerClusters, VoiceConfigV1,
};
use aven_voice_host_cpal::{CpalDuplexHost, OutputInjection};
use aven_voice_models::{
    initialize_onnxruntime, DirectSupertonicSynthesizer, NemotronRecognizerAdapter,
    SileroVadAdapter, WeSpeakerEmbedder,
};
use aven_voice_protocol::{
    DecimalU64, EchoStatus, InputDiscardReason, RequestId, RouteSnapshot, SessionId,
    TimestampQuality as ProtocolTimestampQuality, VoiceEvent, VoiceFeature,
};
use aven_voice_runtime::{
    normalize_speaker_embedding, speaker_window, AudioPorts, CapturePort, DuplexHost,
    DuplexPipeline, DuplexPipelineConfig, HostEvent, HostEventPort, InputModels, ProductionClock,
    RenderActivity, RenderChunk, RenderPort, RouteDescriptor, RouteRequest, SoftwareAec3,
    StreamingSincResampler, SynthesizedPcm, VoiceRuntime, VoiceRuntimeHandle, MAX_CALLBACK_SAMPLES,
};
use serde::Serialize;

use duplex_lab::scenario::{
    build_tracks, built_in_scenarios, resample, Expectation, Injection, Scenario, ScenarioTracks,
};

const CAPTURE_CHUNKS: usize = 128;
const REFERENCE_CHUNKS: usize = 256;

fn main() {
    if let Err(error) = run() {
        eprintln!("duplex lab failed: {error:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();
    let options = Options::parse()?;
    let all = built_in_scenarios();
    if options.list {
        for scenario in all {
            println!(
                "{}\t{}",
                scenario.name,
                if scenario.required {
                    "required"
                } else {
                    "extended"
                }
            );
        }
        return Ok(());
    }
    let selected = select_scenarios(all, &options)?;
    std::fs::create_dir_all(&options.output_dir)
        .with_context(|| format!("create {}", options.output_dir.display()))?;

    initialize_onnxruntime(&options.onnxruntime)?;
    eprintln!(
        "loading Supertonic from {}",
        options.tts_model_dir.display()
    );
    let voices = selected
        .iter()
        .flat_map(|scenario| {
            let mut voices = vec![scenario.assistant_voice];
            if let Injection::Speech { voice, .. } = &scenario.injection {
                voices.push(*voice);
            }
            voices
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let mut synthesizer = DirectSupertonicSynthesizer::open(&options.tts_model_dir, &voices)?;
    let synthesized = synthesize_scenario_audio(&selected, &mut synthesizer)?;

    eprintln!("loading Silero VAD, Nemotron ASR, and WeSpeaker diarization");
    let vad = aven_voice_models::vad::Vad::open(&options.vad_model)?;
    let recognizer = NemotronRecognizerAdapter::open(&options.asr_model_dir, 0.7, 8.0)?;
    let speaker = WeSpeakerEmbedder::open(&options.speaker_model)?;
    let mut models = InputModels {
        vad: Box::new(SileroVadAdapter(vad)),
        recognizer: Box::new(recognizer),
        speaker: Some(Box::new(speaker)),
    };

    eprintln!(
        "The autonomous duplex suite will now play {} two-track scenario(s) through the default laptop speakers.",
        selected.len()
    );
    eprintln!(
        "It plays both the assistant and the synthetic interrupting user; you do not need to speak. Starting in two seconds."
    );
    std::thread::sleep(Duration::from_secs(2));

    let mut reports = Vec::new();
    let mut lab_speaker_clusters = SpeakerClusters::default();
    for scenario in selected {
        eprintln!("\n=== {} ===", scenario.name);
        let assistant = synthesized
            .get(&ClipKey::new(
                scenario.assistant_text,
                scenario.assistant_voice,
            ))
            .expect("assistant clip was synthesized");
        let user = match &scenario.injection {
            Injection::Speech { text, voice, .. } => Some(
                synthesized
                    .get(&ClipKey::new(text, voice))
                    .expect("user clip was synthesized"),
            ),
            Injection::None | Injection::HouseholdNoise { .. } => None,
        };
        let probe_host = CpalDuplexHost::new();
        let (_, output) = probe_host.default_route_descriptors()?;
        let tracks = build_tracks(&scenario, output.sample_rate_hz, assistant, user);
        write_tracks(
            &options.output_dir,
            &scenario,
            output.sample_rate_hz,
            &tracks,
        )?;
        let (report, returned_models) = run_scenario(
            &options.output_dir,
            &scenario,
            tracks,
            models,
            &mut lab_speaker_clusters,
            ScenarioRunOptions {
                acoustic_near_end: options.acoustic_near_end,
                capture_input_gain_db: options.capture_input_gain_db,
                callback_delay_hint_ms: options.callback_delay_hint_ms,
                tester_adapting_barge_in: options.tester_adapting_barge_in,
            },
        )?;
        models = returned_models;
        eprintln!(
            "{}: {} ({})",
            report.name,
            if report.passed { "PASS" } else { "FAIL" },
            report.reason
        );
        reports.push(report);
        std::thread::sleep(Duration::from_millis(750));
    }

    let required_passed = reports
        .iter()
        .filter(|report| report.required)
        .all(|report| report.passed);
    let extended_passed = reports.iter().all(|report| report.passed);
    let speaker_detection = evaluate_speaker_detection(&reports);
    let speaker_detection_passed = !speaker_detection.evaluated || speaker_detection.passed;
    let report = SuiteReport {
        near_end_mode: if options.acoustic_near_end {
            "same_speaker_acoustic"
        } else {
            "capture_boundary"
        },
        tester_adapting_barge_in: options.tester_adapting_barge_in,
        required_passed,
        extended_passed,
        speaker_detection,
        scenarios: reports,
    };
    let report_path = options.output_dir.join("report.json");
    std::fs::write(&report_path, serde_json::to_vec_pretty(&report)?)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    eprintln!("report: {}", report_path.display());
    if !required_passed || !speaker_detection_passed {
        std::process::exit(2);
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct ClipKey {
    text: String,
    voice: String,
}

impl ClipKey {
    fn new(text: &str, voice: &str) -> Self {
        Self {
            text: text.to_owned(),
            voice: voice.to_owned(),
        }
    }
}

fn synthesize_scenario_audio(
    scenarios: &[Scenario],
    synthesizer: &mut DirectSupertonicSynthesizer,
) -> Result<BTreeMap<ClipKey, SynthesizedPcm>> {
    let mut wanted = BTreeSet::new();
    for scenario in scenarios {
        wanted.insert(ClipKey::new(
            scenario.assistant_text,
            scenario.assistant_voice,
        ));
        if let Injection::Speech { text, voice, .. } = &scenario.injection {
            wanted.insert(ClipKey::new(text, voice));
        }
    }
    let mut clips = BTreeMap::new();
    for key in wanted {
        eprintln!("synthesizing {}: {:?}", key.voice, key.text);
        let pcm = synthesizer.synthesize(
            &key.text,
            "de",
            &key.voice,
            &aven_voice_runtime::CancellationToken::default(),
        )?;
        clips.insert(key, pcm);
    }
    Ok(clips)
}

#[derive(Clone, Copy)]
struct ScenarioRunOptions {
    acoustic_near_end: bool,
    capture_input_gain_db: f32,
    callback_delay_hint_ms: u32,
    tester_adapting_barge_in: bool,
}

fn run_scenario(
    output_dir: &Path,
    scenario: &Scenario,
    tracks: ScenarioTracks,
    models: InputModels,
    lab_speaker_clusters: &mut SpeakerClusters,
    options: ScenarioRunOptions,
) -> Result<(ScenarioReport, InputModels)> {
    let config = VoiceConfigV1 {
        allow_full_duplex_barge_in: true,
        allow_tester_adapting_barge_in: options.tester_adapting_barge_in,
        ..VoiceConfigV1::default()
    };
    let runtime = VoiceRuntime::spawn(
        "duplex-lab",
        config.clone(),
        std::sync::Arc::new(ProductionClock::default()),
    );
    let observer = runtime.observer();

    expect_accepted(command(
        &runtime,
        Command::Prepare {
            request_id: request_id(scenario, "prepare"),
            features: vec![VoiceFeature::Input, VoiceFeature::Output],
        },
    )?)?;
    expect_action(
        &runtime,
        |action| matches!(action, Action::PrepareModels(_)),
        "prepare models",
    )?;
    publish(
        &observer,
        Observation::ModelsPrepared {
            input: true,
            output: true,
        },
    )?;
    wait_for_runtime_ready(&runtime)?;

    let session_id = match command(
        &runtime,
        Command::StartSession {
            request_id: request_id(scenario, "start"),
            preferred_input: None,
            preferred_output: None,
        },
    )? {
        CachedResult::Session(session_id) => session_id,
        other => bail!("start session returned {other:?}"),
    };
    let activated = expect_action(
        &runtime,
        |action| matches!(action, Action::ActivateEnvironment(_)),
        "activate environment",
    )?;
    match activated {
        Action::ActivateEnvironment(observed) if observed == session_id => {}
        other => bail!("unexpected environment action: {other:?}"),
    }
    publish(
        &observer,
        Observation::EnvironmentActivated {
            session_id: session_id.clone(),
        },
    )?;
    let open = expect_action(
        &runtime,
        |action| matches!(action, Action::OpenRoute { .. }),
        "open route",
    )?;
    let generation = match open {
        Action::OpenRoute {
            session_id: observed,
            generation,
            ..
        } if observed == session_id => generation,
        other => bail!("unexpected open action: {other:?}"),
    };

    let probe = CpalDuplexHost::new();
    let (input_descriptor, output_descriptor) = probe.default_route_descriptors()?;
    let capture_injection_samples = resample(
        &SynthesizedPcm {
            samples: tracks.injection.clone(),
            sample_rate_hz: output_descriptor.sample_rate_hz,
        },
        input_descriptor.sample_rate_hz,
    );
    let injection = OutputInjection::new(if options.acoustic_near_end {
        tracks.injection.clone()
    } else {
        capture_injection_samples
    });
    let (output_injection, capture_injection) = if options.acoustic_near_end {
        (Some(injection.clone()), None)
    } else {
        (None, Some(injection.clone()))
    };
    let injection_clock_rate = if options.acoustic_near_end {
        output_descriptor.sample_rate_hz
    } else {
        input_descriptor.sample_rate_hz
    };
    let capture_input_gain = 10.0_f32.powf(options.capture_input_gain_db / 20.0);
    let mut host = CpalDuplexHost::with_lab_injections(
        output_injection,
        capture_injection,
        capture_input_gain,
    );
    let capture = CapturePort::new(CAPTURE_CHUNKS, input_descriptor);
    let render_chunk_frames =
        (output_descriptor.sample_rate_hz as usize / 100).clamp(1, MAX_CALLBACK_SAMPLES);
    let ready_chunks = tracks.assistant.len().div_ceil(render_chunk_frames).max(32) + 32;
    let (render, producer) = RenderPort::new(ready_chunks, REFERENCE_CHUNKS);
    render.configure_output_rate(output_descriptor.sample_rate_hz);
    let render_activity = render.activity();
    let host_events = HostEventPort::new(32, 32);
    let host_consumer = host_events.consumer();
    let descriptor = host.open(
        RouteRequest {
            generation,
            preferred_input: None,
            preferred_output: None,
            require_duplex: true,
        },
        AudioPorts {
            capture: capture.clone(),
            render: render.clone(),
            events: host_events,
        },
    )?;
    let diagnostic_tap =
        aven_voice_runtime::PipelineAudioTap::new(tracks.assistant.len().div_ceil(480) + 400);
    let pipeline = DuplexPipeline::spawn(
        DuplexPipelineConfig {
            session_id: session_id.clone(),
            route_generation: generation,
            input_rate_hz: descriptor.input.sample_rate_hz,
            input_channels: descriptor.input.channels,
            output_rate_hz: descriptor.output.sample_rate_hz,
            input_timestamp_quality: descriptor.input_timestamp_quality,
            output_timestamp_quality: descriptor.output_timestamp_quality,
            callback_only_delay_hint_ms: Some(options.callback_delay_hint_ms),
            diagnostic_audio_tap: Some(diagnostic_tap.clone()),
            id_prefix: format!("lab-{}", scenario.name),
        },
        config.clone(),
        capture.clone(),
        render.clone(),
        Box::new(SoftwareAec3::new(config.clone())),
        models,
        observer.clone(),
    )
    .map_err(|error| anyhow!(error))?;
    publish(
        &observer,
        Observation::RouteOpened {
            session_id: session_id.clone(),
            generation,
            route: route_snapshot(&descriptor),
        },
    )?;
    expect_action(
        &runtime,
        |action| matches!(action, Action::StartRoute(value) if *value == generation),
        "start route",
    )?;
    host.start(&descriptor.route_id)?;
    publish(
        &observer,
        Observation::RouteStarted {
            session_id: session_id.clone(),
            generation,
        },
    )?;
    wait_for_active_session(&runtime, &session_id)?;

    let turn_id = match command(
        &runtime,
        Command::BeginSpeech {
            request_id: request_id(scenario, "begin-speech"),
            session_id: session_id.clone(),
            client_turn_key: None,
            language: "de".into(),
            voice: scenario.assistant_voice.into(),
        },
    )? {
        CachedResult::Turn(turn_id) => turn_id,
        other => bail!("begin speech returned {other:?}"),
    };
    let output_generation = match expect_action(
        &runtime,
        |action| matches!(action, Action::SetOutputGeneration(_)),
        "set output generation",
    )? {
        Action::SetOutputGeneration(generation) => generation,
        _ => unreachable!(),
    };
    render.set_active_generation(output_generation);

    expect_enqueued(command(
        &runtime,
        Command::EnqueueSpeech {
            request_id: request_id(scenario, "enqueue-speech"),
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
            segment_index: 0,
            text: scenario.assistant_text.into(),
        },
    )?)?;
    expect_action(
        &runtime,
        |action| matches!(action, Action::EnqueueTts { .. }),
        "enqueue TTS",
    )?;
    publish(
        &observer,
        Observation::SynthesisStarted {
            turn_id: turn_id.clone(),
            segment_index: 0,
            generation: output_generation,
        },
    )?;
    enqueue_track(
        &producer,
        &tracks.assistant,
        output_descriptor.sample_rate_hz,
        output_generation,
    )?;
    publish(
        &observer,
        Observation::SynthesisCompleted {
            turn_id: turn_id.clone(),
            segment_index: 0,
            generation: output_generation,
        },
    )?;
    expect_accepted(command(
        &runtime,
        Command::FinishSpeech {
            request_id: request_id(scenario, "finish-speech"),
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
        },
    )?)?;
    expect_action(
        &runtime,
        |action| matches!(action, Action::FinishTts(_)),
        "finish TTS",
    )?;

    let started = Instant::now();
    let duration = Duration::from_secs_f64(
        tracks.assistant.len() as f64 / f64::from(output_descriptor.sample_rate_hz) + 0.5,
    );
    let deadline = started + duration;
    let mut observed = Observed::default();
    let mut retired = false;
    let mut playback_drained = false;
    while Instant::now() < deadline {
        while let Ok(activity) = render_activity.try_recv() {
            match activity {
                RenderActivity::Audible(generation) if generation == output_generation => {
                    publish(
                        &observer,
                        Observation::PlaybackAudible {
                            turn_id: turn_id.clone(),
                            generation,
                        },
                    )?;
                }
                RenderActivity::FadeComplete(generation) => {
                    observed.fade_completed_at_ms =
                        Some(frame_ms(injection.consumed_frames(), injection_clock_rate));
                    publish(
                        &observer,
                        Observation::FadeDrained {
                            turn_id: turn_id.clone(),
                            generation,
                        },
                    )?;
                }
                RenderActivity::Silent if !retired && !playback_drained => {
                    playback_drained = true;
                    publish(
                        &observer,
                        Observation::PlaybackDrained {
                            turn_id: turn_id.clone(),
                            generation: output_generation,
                        },
                    )?;
                }
                RenderActivity::Audible(_) | RenderActivity::Silent => {}
            }
        }
        while let Ok(action) = runtime.actions().try_recv() {
            match action {
                Action::RetireOutput { retiring, active } => {
                    retired = true;
                    render.retire(
                        retiring,
                        active,
                        config.output_fade_ms,
                        output_descriptor.sample_rate_hz,
                    );
                }
                Action::FadeOutput { duration_ms, .. } => {
                    observed.fade_started_at_ms =
                        Some(frame_ms(injection.consumed_frames(), injection_clock_rate));
                    observed.fade_duration_ms = Some(duration_ms);
                }
                Action::CandidateDiscarded { reason, .. } => {
                    observed.action_discards.push(format!("{reason:?}"));
                }
                Action::SpeechCancelled { reason, .. } => {
                    observed.cancellations.push(format!("{reason:?}"));
                }
                Action::ResetInput => pipeline.reset_input(),
                Action::BeginRecognizer(_)
                | Action::CancelTts(_)
                | Action::DropOutput(_)
                | Action::Emit(_) => {}
                other => observed.unexpected_actions.push(format!("{other:?}")),
            }
        }
        while let Ok(envelope) = runtime.events().try_recv() {
            let at_ms = frame_ms(injection.consumed_frames(), injection_clock_rate);
            match envelope.event {
                VoiceEvent::StatusEcho {
                    status: EchoStatus::Converged,
                    full_duplex_barge_in,
                } => {
                    observed.echo_converged_at_ms.get_or_insert(at_ms);
                    observed.full_duplex_enabled |= full_duplex_barge_in;
                }
                VoiceEvent::StatusEcho { status, .. } => {
                    observed.echo_states.push(format!("{status:?}"));
                }
                VoiceEvent::InputCandidateStarted { far_end_active, .. } => {
                    observed.candidates += 1;
                    observed.candidate_far_end.push(far_end_active);
                }
                VoiceEvent::InputPartial { text, .. } => observed.partials.push(text),
                VoiceEvent::InputConfirmed {
                    barge_in_started, ..
                } => observed.confirmations.push(Confirmation {
                    at_ms,
                    barge_in_started,
                }),
                VoiceEvent::InputSpeakerIdentified { speaker, .. } => {
                    observed.speakers.push(SpeakerObservation {
                        speaker_id: speaker.speaker_id.0,
                        confidence: speaker.confidence,
                    });
                }
                VoiceEvent::InputFinal { text, .. } => observed.finals.push(text),
                VoiceEvent::InputDiscarded { reason, .. } => {
                    observed.event_discards.push(format!("{reason:?}"));
                }
                VoiceEvent::PlaybackFading { .. } => {
                    observed.playback_fading_events += 1;
                }
                VoiceEvent::PlaybackCancelled { reason, .. } => {
                    observed.playback_cancellations.push(format!("{reason:?}"));
                }
                VoiceEvent::ErrorRaised { error } => {
                    observed
                        .errors
                        .push(format!("{:?}: {}", error.code, error.message));
                }
                _ => {}
            }
        }
        while let Some(event) = host_consumer.pop() {
            match event {
                HostEvent::Started { .. } | HostEvent::DeviceSetChanged => {}
                other => observed.host_faults.push(format!("{other:?}")),
            }
        }
        std::thread::sleep(Duration::from_millis(5));
    }

    let metrics = pipeline.metrics().snapshot();
    let capture_overruns = capture.overruns();
    let render_underruns = render.underruns();
    let reference_overruns = render.reference_overruns();
    host.close(&descriptor.route_id)?;
    let mut returned_models = pipeline.stop();
    runtime.stop();
    let mut raw_capture = Vec::new();
    let mut clean_capture = Vec::new();
    while let Some(frame) = diagnostic_tap.pop() {
        raw_capture.extend_from_slice(&frame.raw.0);
        clean_capture.extend_from_slice(&frame.clean.0);
    }
    let artifact_dir = output_dir.join(scenario.name);
    write_wav(
        &artifact_dir.join("microphone-raw.wav"),
        48_000,
        &raw_capture,
    )?;
    write_wav(
        &artifact_dir.join("microphone-after-aec.wav"),
        48_000,
        &clean_capture,
    )?;
    let lab_speaker = classify_injected_speaker(
        scenario,
        &tracks,
        output_descriptor.sample_rate_hz,
        &clean_capture,
        &mut returned_models,
        lab_speaker_clusters,
    )?;

    let (passed, reason) = evaluate(
        scenario,
        &tracks,
        &observed,
        output_descriptor.sample_rate_hz,
    );
    Ok((
        ScenarioReport {
            name: scenario.name,
            required: scenario.required,
            expectation: format!("{:?}", scenario.expectation),
            expected_speaker_voice: expected_speaker_voice(scenario),
            passed,
            reason,
            assistant_duration_ms: frame_ms(
                (tracks.assistant_end_frame - tracks.assistant_start_frame) as u64,
                output_descriptor.sample_rate_hz,
            ),
            injection_start_ms: tracks
                .injection_start_frame
                .map(|frame| frame_ms(frame as u64, output_descriptor.sample_rate_hz)),
            candidates: observed.candidates,
            confirmations: observed.confirmations,
            partials: observed.partials,
            finals: observed.finals,
            speakers: observed.speakers,
            lab_speaker,
            discards: observed.event_discards,
            fade_started_at_ms: observed.fade_started_at_ms,
            fade_completed_at_ms: observed.fade_completed_at_ms,
            fade_duration_ms: observed.fade_duration_ms,
            echo_converged_at_ms: observed.echo_converged_at_ms,
            full_duplex_enabled: observed.full_duplex_enabled,
            echo_states: observed.echo_states,
            cancellations: observed.playback_cancellations,
            errors: observed.errors,
            host_faults: observed.host_faults,
            capture_overruns,
            render_underruns,
            reference_overruns,
            capture_input_gain_db: options.capture_input_gain_db,
            callback_delay_hint_ms: options.callback_delay_hint_ms,
            delay_hint_ms: metrics.delay_hint_ms,
            render_rms: metrics.render_rms,
            raw_rms: metrics.raw_rms,
            clean_rms: metrics.clean_rms,
            clipped_fraction: metrics.clipped_fraction,
            max_clipped_fraction: metrics.max_clipped_fraction,
            echo_return_loss_db: metrics.echo_return_loss_db,
            echo_return_loss_enhancement_db: metrics.echo_return_loss_enhancement_db,
            residual_echo_likelihood: metrics.residual_echo_likelihood,
            timestamp_regressions: metrics.timestamp_regressions,
            delay_history_faults: metrics.delay_history_faults,
            drift_range_faults: metrics.drift_range_faults,
            capture_discontinuities: metrics.capture_discontinuities,
            echo_processing_faults: metrics.echo_processing_faults,
            max_alignment_error_frames: metrics.max_alignment_error_frames,
            drift_correction_ppm: metrics.drift_correction_ppm,
        },
        returned_models,
    ))
}

fn evaluate(
    scenario: &Scenario,
    tracks: &ScenarioTracks,
    observed: &Observed,
    output_rate_hz: u32,
) -> (bool, String) {
    if !observed.errors.is_empty() || !observed.host_faults.is_empty() {
        return (false, "runtime or host fault".into());
    }
    let transcript = observed
        .partials
        .iter()
        .chain(&observed.finals)
        .map(|text| text.to_lowercase())
        .collect::<Vec<_>>()
        .join(" ");
    let injection_ms = tracks
        .injection_start_frame
        .map(|frame| frame_ms(frame as u64, output_rate_hz));
    match &scenario.expectation {
        Expectation::NoConfirmation => {
            let passed = observed.confirmations.is_empty()
                && observed.fade_started_at_ms.is_none()
                && observed.playback_cancellations.is_empty();
            (
                passed,
                if passed {
                    format!(
                        "no semantic interruption ({} VAD candidate(s))",
                        observed.candidates
                    )
                } else {
                    "noise or far-end speech caused a semantic interruption".into()
                },
            )
        }
        Expectation::Interrupt { keywords } => {
            let barge = observed
                .confirmations
                .iter()
                .find(|confirmation| confirmation.barge_in_started);
            let keyword = keywords.iter().any(|keyword| transcript.contains(keyword));
            let latency_ok = barge
                .zip(injection_ms)
                .is_some_and(|(confirmation, injected)| {
                    confirmation.at_ms.saturating_sub(injected) <= 2_200
                });
            let passed = barge.is_some()
                && keyword
                && latency_ok
                && observed.fade_started_at_ms.is_some()
                && observed.fade_duration_ms == Some(80)
                && observed.fade_completed_at_ms.is_some();
            (
                passed,
                format!(
                    "barge={}, lexical={}, latency_ok={}, fade={}→{:?}",
                    barge.is_some(),
                    keyword,
                    latency_ok,
                    observed
                        .fade_started_at_ms
                        .map_or_else(|| "none".into(), |value| format!("{value} ms")),
                    observed.fade_completed_at_ms
                ),
            )
        }
        Expectation::FollowUp { keywords } => {
            let follow_up = observed
                .confirmations
                .iter()
                .find(|confirmation| !confirmation.barge_in_started);
            let keyword = keywords.iter().any(|keyword| transcript.contains(keyword));
            let passed = follow_up.is_some()
                && keyword
                && observed.fade_started_at_ms.is_none()
                && observed.playback_cancellations.is_empty();
            (
                passed,
                format!(
                    "follow_up={}, lexical={}, no_fade={}",
                    follow_up.is_some(),
                    keyword,
                    observed.fade_started_at_ms.is_none()
                ),
            )
        }
        Expectation::UnsafeEarlySpeech => {
            let discarded_unsafe = observed
                .event_discards
                .iter()
                .chain(&observed.action_discards)
                .any(|reason| reason == &format!("{:?}", InputDiscardReason::UnsafeEcho));
            let passed = observed.confirmations.is_empty()
                && observed.fade_started_at_ms.is_none()
                && observed.playback_cancellations.is_empty()
                && (discarded_unsafe || observed.candidates == 0);
            (
                passed,
                format!(
                    "conservative_no_barge={}, unsafe_discard={discarded_unsafe}",
                    observed.confirmations.is_empty()
                ),
            )
        }
    }
}

fn enqueue_track(
    producer: &aven_voice_runtime::RenderProducer,
    samples: &[f32],
    output_rate_hz: u32,
    generation: OutputGeneration,
) -> Result<()> {
    let frames = (output_rate_hz as usize / 100).clamp(1, MAX_CALLBACK_SAMPLES);
    for values in samples.chunks(frames) {
        let chunk = RenderChunk::from_slice(values, generation)
            .ok_or_else(|| anyhow!("invalid render chunk"))?;
        producer
            .push(chunk)
            .map_err(|_| anyhow!("bounded render queue was too small for scenario"))?;
    }
    Ok(())
}

fn route_snapshot(descriptor: &RouteDescriptor) -> RouteSnapshot {
    RouteSnapshot {
        route_id: descriptor.route_id.clone(),
        generation: DecimalU64::new(descriptor.generation.0),
        input_rate_hz: descriptor.input.sample_rate_hz,
        input_channels: descriptor.input.channels,
        output_rate_hz: descriptor.output.sample_rate_hz,
        output_channels: descriptor.output.channels,
        input_callback_frames: descriptor.input.nominal_callback_frames,
        output_callback_frames: descriptor.output.nominal_callback_frames,
        input_timestamp_quality: protocol_timestamp(descriptor.input_timestamp_quality),
        output_timestamp_quality: protocol_timestamp(descriptor.output_timestamp_quality),
        full_duplex_barge_in: false,
    }
}

fn protocol_timestamp(value: aven_voice_runtime::TimestampQuality) -> ProtocolTimestampQuality {
    match value {
        aven_voice_runtime::TimestampQuality::Hardware => ProtocolTimestampQuality::Hardware,
        aven_voice_runtime::TimestampQuality::HostEstimated => {
            ProtocolTimestampQuality::HostEstimated
        }
        aven_voice_runtime::TimestampQuality::CallbackOnly => {
            ProtocolTimestampQuality::CallbackOnly
        }
    }
}

fn command(runtime: &VoiceRuntimeHandle, command: Command) -> Result<CachedResult> {
    runtime
        .command(command)
        .map_err(|error| anyhow!("command queue: {error:?}"))?
        .recv_timeout(Duration::from_secs(5))
        .context("voice command timed out")?
        .map_err(|error| {
            anyhow!(
                "voice command rejected: {:?}: {}",
                error.code,
                error.message
            )
        })
}

fn wait_for_active_session(runtime: &VoiceRuntimeHandle, session_id: &SessionId) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        let snapshot = runtime
            .snapshot(Some(session_id.clone()))
            .map_err(|error| anyhow!("snapshot queue: {error:?}"))?
            .recv_timeout(Duration::from_secs(1))
            .context("voice snapshot timed out")?
            .map_err(|error| {
                anyhow!("voice snapshot failed: {:?}: {}", error.code, error.message)
            })?;
        if snapshot.session.status == aven_voice_protocol::SessionStatus::Active {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    bail!("voice session did not become active")
}

fn wait_for_runtime_ready(runtime: &VoiceRuntimeHandle) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        let snapshot = runtime
            .snapshot(None)
            .map_err(|error| anyhow!("snapshot queue: {error:?}"))?
            .recv_timeout(Duration::from_secs(1))
            .context("voice snapshot timed out")?
            .map_err(|error| {
                anyhow!("voice snapshot failed: {:?}: {}", error.code, error.message)
            })?;
        if snapshot.runtime == aven_voice_protocol::RuntimeStatus::Ready {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    bail!("voice runtime did not become ready")
}

fn publish(observer: &aven_voice_runtime::RuntimeObserver, observation: Observation) -> Result<()> {
    observer
        .publish(observation)
        .map_err(|error| anyhow!("observation queue: {error:?}"))
}

fn expect_action(
    runtime: &VoiceRuntimeHandle,
    predicate: impl Fn(&Action) -> bool,
    description: &str,
) -> Result<Action> {
    let action = runtime
        .actions()
        .recv_timeout(Duration::from_secs(5))
        .with_context(|| format!("waiting for {description}"))?;
    if predicate(&action) {
        Ok(action)
    } else {
        bail!("expected {description}, received {action:?}")
    }
}

fn expect_accepted(result: CachedResult) -> Result<()> {
    if matches!(result, CachedResult::Accepted) {
        Ok(())
    } else {
        bail!("expected accepted result, received {result:?}")
    }
}

fn expect_enqueued(result: CachedResult) -> Result<()> {
    if matches!(result, CachedResult::Enqueued { .. }) {
        Ok(())
    } else {
        bail!("expected enqueued result, received {result:?}")
    }
}

fn request_id(scenario: &Scenario, operation: &str) -> RequestId {
    RequestId::parse(format!("{}-{operation}", scenario.name))
        .expect("built-in scenario names make valid request IDs")
}

fn frame_ms(frame: u64, rate: u32) -> u64 {
    frame.saturating_mul(1_000) / u64::from(rate)
}

fn write_tracks(
    output_dir: &Path,
    scenario: &Scenario,
    sample_rate_hz: u32,
    tracks: &ScenarioTracks,
) -> Result<()> {
    let dir = output_dir.join(scenario.name);
    std::fs::create_dir_all(&dir)?;
    write_wav(
        &dir.join("assistant-reference.wav"),
        sample_rate_hz,
        &tracks.assistant,
    )?;
    write_wav(
        &dir.join("injected-near-end.wav"),
        sample_rate_hz,
        &tracks.injection,
    )?;
    let physical = tracks
        .assistant
        .iter()
        .zip(&tracks.injection)
        .map(|(assistant, injection)| (assistant + injection).clamp(-1.0, 1.0))
        .collect::<Vec<_>>();
    write_wav(
        &dir.join("planned-speaker-mix.wav"),
        sample_rate_hz,
        &physical,
    )?;
    Ok(())
}

fn write_wav(path: &Path, sample_rate_hz: u32, samples: &[f32]) -> Result<()> {
    let mut writer = hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 1,
            sample_rate: sample_rate_hz,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        },
    )?;
    for sample in samples {
        writer.write_sample(*sample)?;
    }
    writer.finalize()?;
    Ok(())
}

#[derive(Default)]
struct Observed {
    candidates: usize,
    candidate_far_end: Vec<bool>,
    confirmations: Vec<Confirmation>,
    partials: Vec<String>,
    finals: Vec<String>,
    speakers: Vec<SpeakerObservation>,
    event_discards: Vec<String>,
    action_discards: Vec<String>,
    cancellations: Vec<String>,
    playback_cancellations: Vec<String>,
    fade_started_at_ms: Option<u64>,
    fade_completed_at_ms: Option<u64>,
    fade_duration_ms: Option<u32>,
    playback_fading_events: usize,
    echo_converged_at_ms: Option<u64>,
    full_duplex_enabled: bool,
    echo_states: Vec<String>,
    errors: Vec<String>,
    host_faults: Vec<String>,
    unexpected_actions: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
struct Confirmation {
    at_ms: u64,
    barge_in_started: bool,
}

#[derive(Clone, Debug, Serialize)]
struct SpeakerObservation {
    speaker_id: String,
    confidence: f32,
}

#[derive(Debug, Serialize)]
struct ScenarioReport {
    name: &'static str,
    required: bool,
    expectation: String,
    expected_speaker_voice: Option<&'static str>,
    passed: bool,
    reason: String,
    assistant_duration_ms: u64,
    injection_start_ms: Option<u64>,
    candidates: usize,
    confirmations: Vec<Confirmation>,
    partials: Vec<String>,
    finals: Vec<String>,
    speakers: Vec<SpeakerObservation>,
    lab_speaker: Option<SpeakerObservation>,
    discards: Vec<String>,
    fade_started_at_ms: Option<u64>,
    fade_completed_at_ms: Option<u64>,
    fade_duration_ms: Option<u32>,
    echo_converged_at_ms: Option<u64>,
    full_duplex_enabled: bool,
    echo_states: Vec<String>,
    cancellations: Vec<String>,
    errors: Vec<String>,
    host_faults: Vec<String>,
    capture_overruns: u64,
    render_underruns: u64,
    reference_overruns: u64,
    capture_input_gain_db: f32,
    callback_delay_hint_ms: u32,
    delay_hint_ms: u32,
    render_rms: f32,
    raw_rms: f32,
    clean_rms: f32,
    clipped_fraction: f32,
    max_clipped_fraction: f32,
    echo_return_loss_db: Option<f64>,
    echo_return_loss_enhancement_db: Option<f64>,
    residual_echo_likelihood: Option<f64>,
    timestamp_regressions: u64,
    delay_history_faults: u64,
    drift_range_faults: u64,
    capture_discontinuities: u64,
    echo_processing_faults: u64,
    max_alignment_error_frames: u64,
    drift_correction_ppm: f32,
}

#[derive(Debug, Serialize)]
struct SuiteReport {
    near_end_mode: &'static str,
    tester_adapting_barge_in: bool,
    required_passed: bool,
    extended_passed: bool,
    speaker_detection: SpeakerDetectionReport,
    scenarios: Vec<ScenarioReport>,
}

#[derive(Debug, Serialize)]
struct SpeakerDetectionReport {
    evaluated: bool,
    passed: bool,
    reason: String,
    assignments: BTreeMap<String, Vec<String>>,
}

fn expected_speaker_voice(scenario: &Scenario) -> Option<&'static str> {
    if !matches!(
        scenario.expectation,
        Expectation::Interrupt { .. } | Expectation::FollowUp { .. }
    ) {
        return None;
    }
    match scenario.injection {
        Injection::Speech { voice, .. } => Some(voice),
        Injection::None | Injection::HouseholdNoise { .. } => None,
    }
}

fn evaluate_speaker_detection(reports: &[ScenarioReport]) -> SpeakerDetectionReport {
    let mut assignments = BTreeMap::<String, BTreeSet<String>>::new();
    let mut missing = Vec::new();
    for report in reports {
        let Some(voice) = report.expected_speaker_voice else {
            continue;
        };
        if report.lab_speaker.is_none() {
            missing.push(report.name);
        }
        assignments.entry(voice.to_owned()).or_default().extend(
            report
                .lab_speaker
                .iter()
                .map(|speaker| speaker.speaker_id.clone()),
        );
    }
    let stable = assignments.values().all(|labels| labels.len() == 1);
    let distinct = assignments
        .values()
        .filter_map(|labels| labels.first())
        .collect::<BTreeSet<_>>()
        .len()
        == assignments.len();
    let evaluated = assignments.len() >= 2;
    let passed = !evaluated || (missing.is_empty() && stable && distinct);
    let reason = if !evaluated {
        "not evaluated; select scenarios containing at least two ground-truth voices".into()
    } else if !missing.is_empty() {
        format!("missing speaker attribution in {}", missing.join(", "))
    } else if !stable {
        "one synthetic voice fragmented into multiple speaker labels".into()
    } else if !distinct {
        "different synthetic voices collapsed into one speaker label".into()
    } else {
        "ground-truth voices received stable, distinct anonymous labels".into()
    };
    SpeakerDetectionReport {
        evaluated,
        passed,
        reason,
        assignments: assignments
            .into_iter()
            .map(|(voice, labels)| (voice, labels.into_iter().collect()))
            .collect(),
    }
}

fn classify_injected_speaker(
    scenario: &Scenario,
    tracks: &ScenarioTracks,
    output_rate_hz: u32,
    clean_capture_48k: &[f32],
    models: &mut InputModels,
    clusters: &mut SpeakerClusters,
) -> Result<Option<SpeakerObservation>> {
    if expected_speaker_voice(scenario).is_none() {
        return Ok(None);
    }
    let Some(active_start) = tracks
        .injection
        .iter()
        .position(|sample| sample.abs() >= 1.0e-5)
    else {
        return Ok(None);
    };
    let active_end = tracks
        .injection
        .iter()
        .rposition(|sample| sample.abs() >= 1.0e-5)
        .unwrap_or(active_start)
        + 1;
    let capture_scale = 48_000.0 / f64::from(output_rate_hz);
    let margin = 48_000 / 2;
    let start = ((active_start as f64 * capture_scale) as usize).saturating_sub(margin);
    let end = ((active_end as f64 * capture_scale) as usize + margin).min(clean_capture_48k.len());
    if start >= end {
        return Ok(None);
    }

    let mut resampler = StreamingSincResampler::new(48_000, 16_000)
        .map_err(|_| anyhow!("could not create the lab speaker resampler"))?;
    let mut pcm_16k = Vec::new();
    resampler.process(&clean_capture_48k[start..end], &mut pcm_16k);
    resampler.flush(&mut pcm_16k);
    let Some(window) = speaker_window(&pcm_16k) else {
        return Ok(None);
    };
    let Some(model) = models.speaker.as_mut() else {
        return Ok(None);
    };
    let mut embedding = model
        .embedding(window)
        .map_err(|error| anyhow!(error.to_string()))?;
    if !normalize_speaker_embedding(&mut embedding) {
        return Ok(None);
    }
    Ok(clusters
        .assign(embedding)
        .map(|speaker| SpeakerObservation {
            speaker_id: speaker.speaker_id.0,
            confidence: speaker.confidence,
        }))
}

struct Options {
    list: bool,
    required_only: bool,
    acoustic_near_end: bool,
    capture_input_gain_db: f32,
    callback_delay_hint_ms: u32,
    tester_adapting_barge_in: bool,
    scenarios: Vec<String>,
    tts_model_dir: PathBuf,
    asr_model_dir: PathBuf,
    vad_model: PathBuf,
    speaker_model: PathBuf,
    onnxruntime: PathBuf,
    output_dir: PathBuf,
}

impl Options {
    fn parse() -> Result<Self> {
        let cache = default_cache_dir()?;
        let mut options = Self {
            list: false,
            required_only: false,
            acoustic_near_end: true,
            capture_input_gain_db: -6.0,
            callback_delay_hint_ms: 25,
            tester_adapting_barge_in: false,
            scenarios: Vec::new(),
            tts_model_dir: cache.join("tts/supertonic-3"),
            asr_model_dir: cache.join("asr/nemotron-3.5-streaming"),
            vad_model: cache.join("asr/silero-vad/silero_vad.onnx"),
            speaker_model: cache.join("asr/wespeaker-resnet34/voxceleb_resnet34.onnx"),
            onnxruntime: std::env::var_os("ORT_DYLIB_PATH")
                .map(PathBuf::from)
                .unwrap_or_default(),
            output_dir: default_output_dir(),
        };
        let args = std::env::args().skip(1).collect::<Vec<_>>();
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "--list" => options.list = true,
                "--required-only" => options.required_only = true,
                "--acoustic-near-end" => options.acoustic_near_end = true,
                "--capture-boundary-near-end" => options.acoustic_near_end = false,
                "--tester-adapting-barge-in" => options.tester_adapting_barge_in = true,
                "--capture-input-gain-db" => {
                    options.capture_input_gain_db =
                        value(&args, &mut index, "--capture-input-gain-db")?
                            .parse()
                            .context("--capture-input-gain-db must be a number")?;
                }
                "--callback-delay-hint-ms" => {
                    options.callback_delay_hint_ms =
                        value(&args, &mut index, "--callback-delay-hint-ms")?
                            .parse()
                            .context("--callback-delay-hint-ms must be an integer")?;
                }
                "--scenario" => options
                    .scenarios
                    .push(value(&args, &mut index, "--scenario")?),
                "--tts-model-dir" => {
                    options.tts_model_dir = value(&args, &mut index, "--tts-model-dir")?.into()
                }
                "--asr-model-dir" => {
                    options.asr_model_dir = value(&args, &mut index, "--asr-model-dir")?.into()
                }
                "--vad-model" => {
                    options.vad_model = value(&args, &mut index, "--vad-model")?.into()
                }
                "--speaker-model" => {
                    options.speaker_model = value(&args, &mut index, "--speaker-model")?.into()
                }
                "--onnxruntime" => {
                    options.onnxruntime = value(&args, &mut index, "--onnxruntime")?.into()
                }
                "--output-dir" => {
                    options.output_dir = value(&args, &mut index, "--output-dir")?.into()
                }
                "--help" | "-h" => {
                    println!("aven-voice-duplex-lab [--required-only] [--scenario NAME] [--capture-boundary-near-end] [--tester-adapting-barge-in] [--capture-input-gain-db DB] [--callback-delay-hint-ms MS] [--speaker-model PATH] [--onnxruntime PATH] [--output-dir DIR]");
                    std::process::exit(0);
                }
                other => bail!("unknown argument {other}"),
            }
            index += 1;
        }
        if !options.list && options.onnxruntime.as_os_str().is_empty() && cfg!(target_os = "linux")
        {
            bail!("set ORT_DYLIB_PATH or pass --onnxruntime /path/to/libonnxruntime.so");
        }
        if !options.capture_input_gain_db.is_finite() || options.capture_input_gain_db > 0.0 {
            bail!("--capture-input-gain-db must be finite and no greater than 0 dB");
        }
        if options.callback_delay_hint_ms > 500 {
            bail!("--callback-delay-hint-ms must be between 0 and 500 ms");
        }
        Ok(options)
    }
}

fn value(args: &[String], index: &mut usize, option: &str) -> Result<String> {
    *index += 1;
    args.get(*index)
        .cloned()
        .ok_or_else(|| anyhow!("{option} needs a value"))
}

fn select_scenarios(all: Vec<Scenario>, options: &Options) -> Result<Vec<Scenario>> {
    if !options.scenarios.is_empty() {
        let selected = all
            .into_iter()
            .filter(|scenario| options.scenarios.iter().any(|name| name == scenario.name))
            .collect::<Vec<_>>();
        if selected.len() != options.scenarios.len() {
            bail!("one or more requested scenario names are unknown; use --list");
        }
        return Ok(selected);
    }
    if options.required_only {
        Ok(all
            .into_iter()
            .filter(|scenario| scenario.required)
            .collect())
    } else {
        Ok(all)
    }
}

fn default_cache_dir() -> Result<PathBuf> {
    let home = std::env::var_os("HOME").context("HOME is not set")?;
    #[cfg(target_os = "macos")]
    return Ok(PathBuf::from(home).join("Library/Caches/ceo.aven.os"));
    #[cfg(not(target_os = "macos"))]
    Ok(PathBuf::from(home).join(".cache/ceo.aven.os"))
}

fn default_output_dir() -> PathBuf {
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    std::env::temp_dir().join(format!("aven-voice-duplex-lab-{epoch}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_confirmation_rejects_any_semantic_barge_in() {
        let scenario = built_in_scenarios()
            .into_iter()
            .find(|scenario| scenario.name == "assistant_only")
            .unwrap();
        let (passed, _) = evaluate(
            &scenario,
            &ScenarioTracks {
                assistant: vec![],
                injection: vec![],
                injection_start_frame: None,
                assistant_start_frame: 0,
                assistant_end_frame: 0,
            },
            &Observed::default(),
            48_000,
        );
        assert!(passed);
    }

    #[test]
    fn lexical_interrupt_needs_barge_and_complete_fade() {
        let scenario = built_in_scenarios()
            .into_iter()
            .find(|scenario| scenario.name == "clear_mid_sentence_interrupt")
            .unwrap();
        let mut observed = Observed::default();
        observed.confirmations.push(Confirmation {
            at_ms: 2_400,
            barge_in_started: true,
        });
        observed.partials.push("Stopp".into());
        observed.fade_started_at_ms = Some(2_400);
        observed.fade_completed_at_ms = Some(2_480);
        observed.fade_duration_ms = Some(80);
        let (passed, _) = evaluate(
            &scenario,
            &ScenarioTracks {
                assistant: vec![],
                injection: vec![],
                injection_start_frame: Some(48_000),
                assistant_start_frame: 0,
                assistant_end_frame: 0,
            },
            &observed,
            48_000,
        );
        assert!(passed);
    }
}
