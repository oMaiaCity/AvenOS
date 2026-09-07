use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

use aven_voice_core::{MonoTimeNs, Observation, RouteGeneration, VoiceConfigV1};
use aven_voice_protocol::{CandidateId, EchoStatus, SessionId};
use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};

use crate::{
    normalize_speaker_embedding, speaker_window, AudioFrame48k, CapturePort, ClockAligner,
    ClockFault, EchoProcessor, InputModelEvent, InputProcessor, ProcessingFormat, RenderPort,
    RuntimeObserver, SpeakerEmbedder, StreamingRecognizer, StreamingSincResampler,
    TimestampQuality, VoiceActivityDetector, ASR_RATE_HZ, MAX_CALLBACK_SAMPLES,
    MAX_SPEAKER_SAMPLES, PROCESSING_FRAME_SAMPLES, PROCESSING_RATE_HZ, TARGET_SPEAKER_SAMPLES,
};

const CLEAN_QUEUE_FRAMES: usize = 64;
const MAX_RESAMPLED_SAMPLES: usize = MAX_CALLBACK_SAMPLES * 8;

#[derive(Clone, Default)]
pub struct DuplexMetrics(Arc<DuplexMetricsInner>);

struct DuplexMetricsInner {
    delay_hint_ms: AtomicU32,
    drift_correction_ppm: AtomicU32,
    render_rms: AtomicU32,
    render_peak: AtomicU32,
    raw_rms: AtomicU32,
    raw_peak: AtomicU32,
    clean_rms: AtomicU32,
    clean_peak: AtomicU32,
    clipped_fraction: AtomicU32,
    max_clipped_fraction: AtomicU32,
    echo_return_loss_db: AtomicU64,
    echo_return_loss_enhancement_db: AtomicU64,
    residual_echo_likelihood: AtomicU64,
    vad_probability: AtomicU32,
    timestamp_regressions: AtomicU64,
    delay_history_faults: AtomicU64,
    drift_range_faults: AtomicU64,
    capture_discontinuities: AtomicU64,
    echo_processing_faults: AtomicU64,
    max_alignment_error_frames: AtomicU64,
}

impl Default for DuplexMetricsInner {
    fn default() -> Self {
        Self {
            delay_hint_ms: AtomicU32::new(0),
            drift_correction_ppm: AtomicU32::new(0),
            render_rms: AtomicU32::new(0),
            render_peak: AtomicU32::new(0),
            raw_rms: AtomicU32::new(0),
            raw_peak: AtomicU32::new(0),
            clean_rms: AtomicU32::new(0),
            clean_peak: AtomicU32::new(0),
            clipped_fraction: AtomicU32::new(0),
            max_clipped_fraction: AtomicU32::new(0),
            echo_return_loss_db: AtomicU64::new(f64::NAN.to_bits()),
            echo_return_loss_enhancement_db: AtomicU64::new(f64::NAN.to_bits()),
            residual_echo_likelihood: AtomicU64::new(f64::NAN.to_bits()),
            vad_probability: AtomicU32::new(0),
            timestamp_regressions: AtomicU64::new(0),
            delay_history_faults: AtomicU64::new(0),
            drift_range_faults: AtomicU64::new(0),
            capture_discontinuities: AtomicU64::new(0),
            echo_processing_faults: AtomicU64::new(0),
            max_alignment_error_frames: AtomicU64::new(0),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct DuplexMetricsSnapshot {
    pub delay_hint_ms: u32,
    pub drift_correction_ppm: f32,
    pub render_rms: f32,
    pub render_peak: f32,
    pub raw_rms: f32,
    pub raw_peak: f32,
    pub clean_rms: f32,
    pub clean_peak: f32,
    pub clipped_fraction: f32,
    pub max_clipped_fraction: f32,
    pub echo_return_loss_db: Option<f64>,
    pub echo_return_loss_enhancement_db: Option<f64>,
    pub residual_echo_likelihood: Option<f64>,
    pub vad_probability: f32,
    pub timestamp_regressions: u64,
    pub delay_history_faults: u64,
    pub drift_range_faults: u64,
    pub capture_discontinuities: u64,
    pub echo_processing_faults: u64,
    pub max_alignment_error_frames: u64,
}

impl DuplexMetrics {
    fn update_echo(&self, report: &crate::EchoReport) {
        self.0
            .delay_hint_ms
            .store(report.delay_hint_ms, Ordering::Relaxed);
        self.0
            .render_rms
            .store(report.render_rms.to_bits(), Ordering::Relaxed);
        self.0
            .render_peak
            .store(report.render_peak.to_bits(), Ordering::Relaxed);
        self.0
            .raw_rms
            .store(report.raw_rms.to_bits(), Ordering::Relaxed);
        self.0
            .raw_peak
            .store(report.raw_peak.to_bits(), Ordering::Relaxed);
        self.0
            .clean_rms
            .store(report.clean_rms.to_bits(), Ordering::Relaxed);
        self.0
            .clean_peak
            .store(report.clean_peak.to_bits(), Ordering::Relaxed);
        self.0
            .clipped_fraction
            .store(report.clipped_fraction.to_bits(), Ordering::Relaxed);
        self.0
            .max_clipped_fraction
            .fetch_max(report.clipped_fraction.to_bits(), Ordering::Relaxed);
        store_optional_f64(&self.0.echo_return_loss_db, report.echo_return_loss_db);
        store_optional_f64(
            &self.0.echo_return_loss_enhancement_db,
            report.echo_return_loss_enhancement_db,
        );
        store_optional_f64(
            &self.0.residual_echo_likelihood,
            report.residual_echo_likelihood,
        );
    }

    fn update_vad(&self, probability: f32) {
        self.0
            .vad_probability
            .store(probability.to_bits(), Ordering::Relaxed);
    }

    fn update_clock(&self, correction_ppm: f64) {
        self.0
            .drift_correction_ppm
            .store((correction_ppm as f32).to_bits(), Ordering::Relaxed);
    }

    fn record_clock_fault(&self, fault: ClockFault) {
        let counter = match fault {
            ClockFault::TimestampRegression => &self.0.timestamp_regressions,
            ClockFault::DelayOutsideHistory => &self.0.delay_history_faults,
            ClockFault::DriftOutsideRange => &self.0.drift_range_faults,
        };
        counter.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> DuplexMetricsSnapshot {
        DuplexMetricsSnapshot {
            delay_hint_ms: self.0.delay_hint_ms.load(Ordering::Relaxed),
            drift_correction_ppm: f32::from_bits(
                self.0.drift_correction_ppm.load(Ordering::Relaxed),
            ),
            render_rms: f32::from_bits(self.0.render_rms.load(Ordering::Relaxed)),
            render_peak: f32::from_bits(self.0.render_peak.load(Ordering::Relaxed)),
            raw_rms: f32::from_bits(self.0.raw_rms.load(Ordering::Relaxed)),
            raw_peak: f32::from_bits(self.0.raw_peak.load(Ordering::Relaxed)),
            clean_rms: f32::from_bits(self.0.clean_rms.load(Ordering::Relaxed)),
            clean_peak: f32::from_bits(self.0.clean_peak.load(Ordering::Relaxed)),
            clipped_fraction: f32::from_bits(self.0.clipped_fraction.load(Ordering::Relaxed)),
            max_clipped_fraction: f32::from_bits(
                self.0.max_clipped_fraction.load(Ordering::Relaxed),
            ),
            echo_return_loss_db: load_optional_f64(&self.0.echo_return_loss_db),
            echo_return_loss_enhancement_db: load_optional_f64(
                &self.0.echo_return_loss_enhancement_db,
            ),
            residual_echo_likelihood: load_optional_f64(&self.0.residual_echo_likelihood),
            vad_probability: f32::from_bits(self.0.vad_probability.load(Ordering::Relaxed)),
            timestamp_regressions: self.0.timestamp_regressions.load(Ordering::Relaxed),
            delay_history_faults: self.0.delay_history_faults.load(Ordering::Relaxed),
            drift_range_faults: self.0.drift_range_faults.load(Ordering::Relaxed),
            capture_discontinuities: self.0.capture_discontinuities.load(Ordering::Relaxed),
            echo_processing_faults: self.0.echo_processing_faults.load(Ordering::Relaxed),
            max_alignment_error_frames: self.0.max_alignment_error_frames.load(Ordering::Relaxed),
        }
    }
}

fn store_optional_f64(slot: &AtomicU64, value: Option<f64>) {
    slot.store(value.unwrap_or(f64::NAN).to_bits(), Ordering::Relaxed);
}

fn load_optional_f64(slot: &AtomicU64) -> Option<f64> {
    let value = f64::from_bits(slot.load(Ordering::Relaxed));
    value.is_finite().then_some(value)
}

fn near_end_evidence(
    config: &VoiceConfigV1,
    adaptation_ready: bool,
    raw_rms: f32,
    clean_rms: f32,
) -> bool {
    let minimum_ratio = 10.0_f32.powf(-config.tester_near_end_max_attenuation_db / 20.0);
    adaptation_ready
        && clean_rms >= config.tester_near_end_min_clean_rms
        && clean_rms >= raw_rms.max(f32::EPSILON) * minimum_ratio
}

pub struct InputModels {
    pub vad: Box<dyn VoiceActivityDetector>,
    pub recognizer: Box<dyn StreamingRecognizer>,
    pub speaker: Option<Box<dyn SpeakerEmbedder>>,
}

#[derive(Clone, Debug)]
pub struct DiagnosticAudioFrame {
    pub at: MonoTimeNs,
    pub raw: AudioFrame48k,
    pub clean: AudioFrame48k,
}

/// Optional native-only tap for qualification tools. It never runs in an audio
/// callback, never crosses IPC, and overwrites the oldest complete frame if a
/// diagnostic consumer falls behind.
#[derive(Clone, Debug)]
pub struct PipelineAudioTap {
    frames: crate::BoundedRing<DiagnosticAudioFrame>,
}

impl PipelineAudioTap {
    pub fn new(capacity_frames: usize) -> Self {
        Self {
            frames: crate::BoundedRing::new(capacity_frames),
        }
    }

    pub fn pop(&self) -> Option<DiagnosticAudioFrame> {
        self.frames.pop()
    }

    fn record(&self, frame: DiagnosticAudioFrame) {
        self.frames.push_overwrite_oldest(frame);
    }
}

#[derive(Clone, Copy)]
struct CleanFrame {
    samples: [f32; 160],
    at: MonoTimeNs,
    far_end_active: bool,
    echo_status: EchoStatus,
    safe_echo_continuous: bool,
    adaptation_ready: bool,
    near_end_evidence: bool,
}

enum InputControl {
    Reset,
    Overflow,
    Stop,
}

enum DspControl {
    Reset,
    Stop,
}

pub struct DuplexPipeline {
    dsp_control: Sender<DspControl>,
    input_control: Sender<InputControl>,
    dsp_thread: Option<JoinHandle<()>>,
    input_thread: Option<JoinHandle<InputModels>>,
    metrics: DuplexMetrics,
}

pub struct DuplexPipelineConfig {
    pub session_id: SessionId,
    pub route_generation: RouteGeneration,
    pub input_rate_hz: u32,
    pub input_channels: u16,
    pub output_rate_hz: u32,
    pub input_timestamp_quality: TimestampQuality,
    pub output_timestamp_quality: TimestampQuality,
    /// Optional route-specific acoustic delay for callback-only timestamp
    /// backends. Hardware and host-estimated clocks ignore this override.
    pub callback_only_delay_hint_ms: Option<u32>,
    pub diagnostic_audio_tap: Option<PipelineAudioTap>,
    pub id_prefix: String,
}

impl DuplexPipeline {
    #[allow(clippy::too_many_arguments)]
    pub fn spawn(
        config: DuplexPipelineConfig,
        voice_config: VoiceConfigV1,
        capture: CapturePort,
        render: RenderPort,
        mut echo: Box<dyn EchoProcessor>,
        models: InputModels,
        observer: RuntimeObserver,
    ) -> Result<Self, &'static str> {
        let capture_resampler =
            StreamingSincResampler::new(config.input_rate_hz, PROCESSING_RATE_HZ)
                .map_err(|_| "invalid capture sample rate")?;
        let render_resampler =
            StreamingSincResampler::new(config.output_rate_hz, PROCESSING_RATE_HZ)
                .map_err(|_| "invalid render sample rate")?;
        let clean_resampler = StreamingSincResampler::new(PROCESSING_RATE_HZ, ASR_RATE_HZ)
            .map_err(|_| "invalid clean sample rate")?;
        echo.reset(ProcessingFormat::default(), config.route_generation);

        let (clean_tx, clean_rx) = bounded::<CleanFrame>(CLEAN_QUEUE_FRAMES);
        let metrics = DuplexMetrics::default();
        let (input_control_tx, input_control_rx) = bounded::<InputControl>(4);
        let input_observer = observer.clone();
        let input_generation = config.route_generation;
        let input_prefix = config.id_prefix.clone();
        let input_voice_config = voice_config.clone();
        let clock_config = voice_config.clone();
        let input_metrics = metrics.clone();
        let input_thread = std::thread::Builder::new()
            .name("aven-voice-input".into())
            .spawn(move || {
                input_loop(
                    input_voice_config,
                    models,
                    clean_rx,
                    input_control_rx,
                    input_observer,
                    input_generation,
                    input_prefix,
                    input_metrics,
                )
            })
            .map_err(|_| "input worker could not start")?;

        let (dsp_control_tx, dsp_control_rx) = bounded::<DspControl>(2);
        let input_overflow = input_control_tx.clone();
        let dsp_metrics = metrics.clone();
        let dsp_thread = std::thread::Builder::new()
            .name("aven-voice-dsp".into())
            .spawn(move || {
                let mut worker = DspWorker {
                    config,
                    voice_config,
                    capture: capture.clone(),
                    render: render.clone(),
                    echo,
                    aligner: ClockAligner::new(clock_config),
                    capture_resampler,
                    render_resampler,
                    clean_resampler,
                    capture_mono: Vec::with_capacity(MAX_CALLBACK_SAMPLES),
                    render_mono: Vec::with_capacity(MAX_CALLBACK_SAMPLES),
                    resampled: Vec::with_capacity(MAX_RESAMPLED_SAMPLES),
                    capture_48k: VecDeque::with_capacity(PROCESSING_FRAME_SAMPLES * 4),
                    capture_48k_at: None,
                    render_48k: VecDeque::with_capacity(PROCESSING_FRAME_SAMPLES * 4),
                    render_48k_at: None,
                    capture_resampled_frames: 0,
                    render_resampled_frames: 0,
                    last_render_end_at: None,
                    alignment_baseline_frames: None,
                    clean_16k: VecDeque::with_capacity(160 * 4),
                    clean_16k_at: None,
                    clean_tx,
                    input_overflow,
                    observer,
                    last_echo: EchoStatus::Bypassed,
                    last_render_rms: 0.0,
                    metrics: dsp_metrics,
                };
                worker.run(
                    capture.activity(),
                    render.reference_activity(),
                    dsp_control_rx,
                );
            })
            .map_err(|_| "DSP worker could not start")?;

        Ok(Self {
            dsp_control: dsp_control_tx,
            input_control: input_control_tx,
            dsp_thread: Some(dsp_thread),
            input_thread: Some(input_thread),
            metrics,
        })
    }

    pub fn reset_input(&self) {
        let _ = self.input_control.try_send(InputControl::Reset);
        let _ = self.dsp_control.try_send(DspControl::Reset);
    }

    pub fn metrics(&self) -> DuplexMetrics {
        self.metrics.clone()
    }

    pub fn stop(mut self) -> InputModels {
        let _ = self.dsp_control.send(DspControl::Stop);
        if let Some(thread) = self.dsp_thread.take() {
            let _ = thread.join();
        }
        let _ = self.input_control.send(InputControl::Stop);
        self.input_thread
            .take()
            .expect("input worker exists")
            .join()
            .expect("input worker must not panic")
    }
}

impl Drop for DuplexPipeline {
    fn drop(&mut self) {
        let _ = self.dsp_control.try_send(DspControl::Stop);
        let _ = self.input_control.try_send(InputControl::Stop);
        if let Some(thread) = self.dsp_thread.take() {
            let _ = thread.join();
        }
        if let Some(thread) = self.input_thread.take() {
            let _ = thread.join();
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn input_loop(
    config: VoiceConfigV1,
    models: InputModels,
    clean: Receiver<CleanFrame>,
    controls: Receiver<InputControl>,
    observer: RuntimeObserver,
    generation: RouteGeneration,
    id_prefix: String,
    metrics: DuplexMetrics,
) -> InputModels {
    let near_end_frames_required = config.tester_near_end_frames.max(1);
    let InputModels {
        vad,
        recognizer,
        mut speaker,
    } = models;
    let mut processor = InputProcessor::new(config, vad, recognizer);
    let mut speaker_preroll = VecDeque::with_capacity(TARGET_SPEAKER_SAMPLES);
    let mut speaker_audio: Option<(CandidateId, VecDeque<f32>)> = None;
    let mut speaker_samples_seen = 0_usize;
    let mut next_speaker_attempt = TARGET_SPEAKER_SAMPLES;
    let mut speaker_identified = false;
    let mut next_id = 0_u64;
    let mut candidate_echo_safe = true;
    let mut candidate_near_end_frames = 0_u32;
    let mut candidate_near_end_confident = false;
    let mut candidate_near_end_published = false;
    loop {
        crossbeam_channel::select! {
            recv(controls) -> control => match control {
                Ok(InputControl::Reset) => {
                    processor.reset();
                    speaker_preroll.clear();
                    speaker_audio = None;
                    speaker_samples_seen = 0;
                    next_speaker_attempt = TARGET_SPEAKER_SAMPLES;
                    speaker_identified = false;
                    candidate_echo_safe = true;
                    candidate_near_end_frames = 0;
                    candidate_near_end_confident = false;
                    candidate_near_end_published = false;
                },
                Ok(InputControl::Overflow) => {
                    if let Some(InputModelEvent::DiscardedOverflow { candidate_id }) = processor.overflow() {
                        speaker_preroll.clear();
                        speaker_audio = None;
                        speaker_samples_seen = 0;
                        next_speaker_attempt = TARGET_SPEAKER_SAMPLES;
                        speaker_identified = false;
                        candidate_echo_safe = true;
                        candidate_near_end_frames = 0;
                        candidate_near_end_confident = false;
                        candidate_near_end_published = false;
                        let _ = observer.publish(Observation::CandidateOverflow { candidate_id, generation });
                    }
                }
                Ok(InputControl::Stop) | Err(_) => break,
            },
            recv(clean) -> frame => {
                let Ok(frame) = frame else { break };
                for sample in frame.samples {
                    if speaker_preroll.len() == TARGET_SPEAKER_SAMPLES {
                        speaker_preroll.pop_front();
                    }
                    speaker_preroll.push_back(sample);
                    if let Some((_, audio)) = speaker_audio.as_mut() {
                        if audio.len() == MAX_SPEAKER_SAMPLES {
                            audio.pop_front();
                        }
                        audio.push_back(sample);
                        speaker_samples_seen = speaker_samples_seen.saturating_add(1);
                    }
                }
                if !speaker_identified
                    && speaker.is_some()
                    && speaker_samples_seen >= next_speaker_attempt
                {
                    next_speaker_attempt = next_speaker_attempt
                        .saturating_add(TARGET_SPEAKER_SAMPLES / 2);
                    if let Some((candidate_id, audio)) = speaker_audio.as_ref() {
                        if let Some(embedding) = extract_speaker_embedding(&mut speaker, audio) {
                            let _ = observer.publish(Observation::SpeakerEmbedding {
                                candidate_id: candidate_id.clone(),
                                generation,
                                embedding,
                            });
                            speaker_identified = true;
                        }
                    }
                }
                if processor.candidate_id().is_some()
                    && frame.far_end_active
                    && !frame.safe_echo_continuous
                {
                    candidate_echo_safe = false;
                }
                if processor.candidate_id().is_some() && !candidate_near_end_confident {
                    if frame.near_end_evidence {
                        candidate_near_end_frames = candidate_near_end_frames.saturating_add(1);
                        candidate_near_end_confident =
                            candidate_near_end_frames >= near_end_frames_required;
                    } else {
                        candidate_near_end_frames = 0;
                    }
                }
                if candidate_near_end_confident && !candidate_near_end_published {
                    if let Some(candidate_id) = processor.candidate_id().cloned() {
                        let _ = observer.publish(Observation::NearEndEvidence {
                            candidate_id,
                            generation,
                        });
                        candidate_near_end_published = true;
                    }
                }
                let events = processor.push_clean_16k(&frame.samples, || {
                    next_id = next_id.saturating_add(1);
                    CandidateId::parse(format!("{id_prefix}-c-{next_id}"))
                        .expect("bounded pipeline prefix creates a valid candidate ID")
                });
                metrics.update_vad(processor.last_vad_probability());
                for event in events {
                    let mut started_candidate = None;
                    let observation = match event {
                        InputModelEvent::CandidateStarted { candidate_id, .. } => {
                            speaker_audio = Some((
                                candidate_id.clone(),
                                speaker_preroll.iter().copied().collect(),
                            ));
                            // Pre-roll improves the eventual embedding window, but it must not
                            // make inference fire before the current candidate has supplied the
                            // target amount of speech.
                            speaker_samples_seen = 0;
                            next_speaker_attempt = TARGET_SPEAKER_SAMPLES;
                            speaker_identified = false;
                            candidate_echo_safe = !frame.far_end_active
                                || frame.safe_echo_continuous;
                            candidate_near_end_frames = u32::from(frame.near_end_evidence);
                            candidate_near_end_confident =
                                candidate_near_end_frames >= near_end_frames_required;
                            candidate_near_end_published = false;
                            started_candidate = Some(candidate_id.clone());
                            Observation::VadStarted {
                                candidate_id,
                                generation,
                                far_end_active: frame.far_end_active,
                                echo_status: frame.echo_status,
                                at: frame.at,
                            }
                        },
                        InputModelEvent::Partial { candidate_id, text } => Observation::RecognizerPartial {
                            candidate_id,
                            generation,
                            text,
                            far_end_active: frame.far_end_active,
                            safe_echo_continuous: candidate_echo_safe,
                        },
                        InputModelEvent::Ended { candidate_id, text } => {
                            let candidate_speaker_audio = speaker_audio
                                .take()
                                .filter(|(audio_candidate, _)| audio_candidate == &candidate_id)
                                .map(|(_, audio)| audio.into_iter().collect::<Vec<_>>());
                            let embedding = if speaker_identified || text.trim().is_empty() {
                                None
                            } else if let Some(audio) = candidate_speaker_audio.as_deref() {
                                extract_speaker_embedding_slice(&mut speaker, audio)
                            } else {
                                None
                            };
                            if let Some(embedding) = embedding {
                                let _ = observer.publish(Observation::SpeakerEmbedding {
                                    candidate_id: candidate_id.clone(),
                                    generation,
                                    embedding,
                                });
                            }
                            let observation = Observation::RecognizerFinal {
                                candidate_id,
                                generation,
                                text,
                                far_end_active: frame.far_end_active,
                                safe_echo_continuous: candidate_echo_safe,
                            };
                            candidate_echo_safe = true;
                            candidate_near_end_frames = 0;
                            candidate_near_end_confident = false;
                            candidate_near_end_published = false;
                            speaker_samples_seen = 0;
                            next_speaker_attempt = TARGET_SPEAKER_SAMPLES;
                            speaker_identified = false;
                            observation
                        },
                        InputModelEvent::DiscardedOverflow { candidate_id } => {
                            speaker_audio = None;
                            speaker_samples_seen = 0;
                            next_speaker_attempt = TARGET_SPEAKER_SAMPLES;
                            speaker_identified = false;
                            candidate_echo_safe = true;
                            candidate_near_end_frames = 0;
                            candidate_near_end_confident = false;
                            candidate_near_end_published = false;
                            Observation::CandidateOverflow {
                                candidate_id,
                                generation,
                            }
                        },
                        InputModelEvent::ModelFailed { candidate_id, .. } => {
                            speaker_audio = None;
                            speaker_samples_seen = 0;
                            next_speaker_attempt = TARGET_SPEAKER_SAMPLES;
                            speaker_identified = false;
                            candidate_echo_safe = true;
                            candidate_near_end_frames = 0;
                            candidate_near_end_confident = false;
                            candidate_near_end_published = false;
                            Observation::InputModelFailed {
                                candidate_id,
                                generation,
                            }
                        },
                    };
                    let _ = observer.publish(observation);
                    if frame.adaptation_ready {
                        if let Some(candidate_id) = started_candidate {
                            let _ = observer.publish(Observation::CandidateAdaptationReady {
                                candidate_id,
                                generation,
                            });
                        }
                    }
                    if candidate_near_end_confident && !candidate_near_end_published {
                        if let Some(candidate_id) = processor.candidate_id().cloned() {
                            let _ = observer.publish(Observation::NearEndEvidence {
                                candidate_id,
                                generation,
                            });
                            candidate_near_end_published = true;
                        }
                    }
                }
            }
        }
    }
    let (vad, recognizer) = processor.into_models();
    InputModels {
        vad,
        recognizer,
        speaker,
    }
}

fn extract_speaker_embedding(
    speaker: &mut Option<Box<dyn SpeakerEmbedder>>,
    audio: &VecDeque<f32>,
) -> Option<Vec<f32>> {
    let contiguous = audio.iter().copied().collect::<Vec<_>>();
    extract_speaker_embedding_slice(speaker, &contiguous)
}

fn extract_speaker_embedding_slice(
    speaker: &mut Option<Box<dyn SpeakerEmbedder>>,
    audio: &[f32],
) -> Option<Vec<f32>> {
    let window = speaker_window(audio)?;
    let result = speaker.as_mut()?.embedding(window);
    match result {
        Ok(mut embedding) => normalize_speaker_embedding(&mut embedding).then_some(embedding),
        Err(error) => {
            log::warn!(
                target: "avenos::voice",
                "speaker diarization disabled after inference failure: {error}"
            );
            *speaker = None;
            None
        }
    }
}

#[cfg(feature = "silent-audio-e2e")]
pub(crate) fn silent_fixture_observations(
    generation: RouteGeneration,
) -> Result<Vec<Observation>, String> {
    scripted_fixture_observations(
        generation,
        "silent-e2e",
        "Guten Tag vom stillen Audiotest",
        vec![1.0, 0.0, 0.0],
        false,
    )
}

#[cfg(feature = "silent-audio-e2e")]
pub(crate) fn scripted_fixture_observations(
    generation: RouteGeneration,
    scope: &str,
    text: &str,
    embedding: Vec<f32>,
    far_end_active: bool,
) -> Result<Vec<Observation>, String> {
    struct FixtureVad;

    impl VoiceActivityDetector for FixtureVad {
        fn reset(&mut self) {}

        fn probability(&mut self, frame: &[f32; 512]) -> Result<f32, crate::ModelError> {
            Ok(if frame.iter().any(|sample| sample.abs() > 0.01) {
                0.9
            } else {
                0.0
            })
        }
    }

    struct FixtureRecognizer {
        text: String,
    }

    impl StreamingRecognizer for FixtureRecognizer {
        fn begin(&mut self, _candidate: &CandidateId) -> Result<(), crate::ModelError> {
            Ok(())
        }

        fn push(&mut self, _pcm_16k: &[f32]) -> Result<crate::RecognizerUpdate, crate::ModelError> {
            Ok(crate::RecognizerUpdate {
                cumulative_text: self.text.clone(),
                final_text: None,
            })
        }

        fn finish(&mut self) -> Result<crate::RecognizerUpdate, crate::ModelError> {
            Ok(crate::RecognizerUpdate {
                cumulative_text: self.text.clone(),
                final_text: Some(self.text.clone()),
            })
        }

        fn cancel(&mut self) {}
    }

    struct FixtureSpeaker {
        embedding: Vec<f32>,
    }

    impl SpeakerEmbedder for FixtureSpeaker {
        fn embedding(&mut self, pcm_16k: &[f32]) -> Result<Vec<f32>, crate::ModelError> {
            if pcm_16k.iter().all(|sample| sample.abs() <= 0.01) {
                return Err(crate::ModelError {
                    safe_message: "silent fixture contained no voiced PCM",
                });
            }
            Ok(self.embedding.clone())
        }
    }

    let config = VoiceConfigV1 {
        start_windows: 1,
        end_windows: 2,
        ..VoiceConfigV1::default()
    };
    let scope = scope.to_owned();
    let text = text.to_owned();
    let (clean_tx, clean_rx) = bounded(256);
    let (control_tx, control_rx) = bounded(4);
    let (observer, observations) = RuntimeObserver::test_pair(256);
    let worker = std::thread::spawn(move || {
        input_loop(
            config,
            InputModels {
                vad: Box::new(FixtureVad),
                recognizer: Box::new(FixtureRecognizer { text }),
                speaker: Some(Box::new(FixtureSpeaker { embedding })),
            },
            clean_rx,
            control_rx,
            observer,
            generation,
            scope,
            DuplexMetrics::default(),
        )
    });
    let frame = |index: u64, sample: f32| CleanFrame {
        samples: [sample; 160],
        at: MonoTimeNs::from_millis(index * 10),
        far_end_active,
        echo_status: if far_end_active {
            EchoStatus::Converged
        } else {
            EchoStatus::Bypassed
        },
        safe_echo_continuous: true,
        adaptation_ready: true,
        near_end_evidence: true,
    };
    for index in 0..160 {
        clean_tx
            .send(frame(index, 0.1))
            .map_err(|_| "silent fixture input worker stopped early".to_owned())?;
    }
    for index in 160..172 {
        clean_tx
            .send(frame(index, 0.0))
            .map_err(|_| "silent fixture input worker stopped early".to_owned())?;
    }

    let mut produced = Vec::new();
    loop {
        let observation = observations
            .recv_timeout(std::time::Duration::from_secs(2))
            .map_err(|_| "silent fixture timed out before final recognition".to_owned())?;
        let finished = matches!(observation, Observation::RecognizerFinal { .. });
        produced.push(observation);
        if finished {
            break;
        }
    }
    control_tx
        .send(InputControl::Stop)
        .map_err(|_| "silent fixture could not stop its input worker".to_owned())?;
    worker
        .join()
        .map_err(|_| "silent fixture input worker panicked".to_owned())?;
    Ok(produced)
}

struct DspWorker {
    config: DuplexPipelineConfig,
    voice_config: VoiceConfigV1,
    capture: CapturePort,
    render: RenderPort,
    echo: Box<dyn EchoProcessor>,
    aligner: ClockAligner,
    capture_resampler: StreamingSincResampler,
    render_resampler: StreamingSincResampler,
    clean_resampler: StreamingSincResampler,
    capture_mono: Vec<f32>,
    render_mono: Vec<f32>,
    resampled: Vec<f32>,
    capture_48k: VecDeque<f32>,
    capture_48k_at: Option<MonoTimeNs>,
    render_48k: VecDeque<f32>,
    render_48k_at: Option<MonoTimeNs>,
    capture_resampled_frames: u64,
    render_resampled_frames: u64,
    last_render_end_at: Option<MonoTimeNs>,
    alignment_baseline_frames: Option<f64>,
    clean_16k: VecDeque<f32>,
    clean_16k_at: Option<MonoTimeNs>,
    clean_tx: Sender<CleanFrame>,
    input_overflow: Sender<InputControl>,
    observer: RuntimeObserver,
    last_echo: EchoStatus,
    last_render_rms: f32,
    metrics: DuplexMetrics,
}

impl DspWorker {
    fn run(
        &mut self,
        capture_activity: Receiver<MonoTimeNs>,
        render_activity: Receiver<MonoTimeNs>,
        controls: Receiver<DspControl>,
    ) {
        loop {
            crossbeam_channel::select! {
                recv(controls) -> control => match control {
                    Ok(DspControl::Reset) => self.reset(),
                    Ok(DspControl::Stop) | Err(_) => break,
                },
                recv(capture_activity) -> wake => {
                    if wake.is_err() { break; }
                    self.drain_render();
                    self.drain_capture();
                },
                recv(render_activity) -> wake => {
                    if wake.is_err() { break; }
                    self.drain_render();
                }
            }
        }
    }

    fn reset(&mut self) {
        self.aligner.reset();
        self.echo
            .reset(ProcessingFormat::default(), self.config.route_generation);
        self.capture_resampler
            .reset(self.config.input_rate_hz, PROCESSING_RATE_HZ)
            .expect("validated capture rates");
        self.render_resampler
            .reset(self.config.output_rate_hz, PROCESSING_RATE_HZ)
            .expect("validated render rates");
        self.clean_resampler
            .reset(PROCESSING_RATE_HZ, ASR_RATE_HZ)
            .expect("fixed clean rates");
        self.capture_48k.clear();
        self.capture_48k_at = None;
        self.render_48k.clear();
        self.render_48k_at = None;
        self.capture_resampled_frames = 0;
        self.render_resampled_frames = 0;
        self.last_render_end_at = None;
        self.alignment_baseline_frames = None;
        self.clean_16k.clear();
        self.clean_16k_at = None;
        self.last_echo = EchoStatus::Bypassed;
        self.last_render_rms = 0.0;
    }

    fn drain_render(&mut self) {
        if self.render.take_reference_degraded() {
            self.publish_echo(EchoStatus::Degraded);
            self.reset();
        }
        while let Some(chunk) = self.render.pop_reference() {
            let at = chunk.time.first_frame_at.unwrap_or(chunk.time.callback_at);
            if let Err(fault) = self.aligner.observe_render(at) {
                self.metrics.record_clock_fault(fault);
                self.publish_echo(EchoStatus::Degraded);
                self.reset();
                continue;
            }
            self.render_mono.clear();
            self.render_mono.extend_from_slice(chunk.values());
            self.resampled.clear();
            self.render_resampler
                .process(&self.render_mono, &mut self.resampled);
            if self.resampled.len() > MAX_RESAMPLED_SAMPLES {
                self.publish_echo(EchoStatus::Degraded);
                self.reset();
                continue;
            }
            if self.render_48k.is_empty() {
                self.render_48k_at = Some(at);
            }
            self.render_resampled_frames = self
                .render_resampled_frames
                .saturating_add(self.resampled.len() as u64);
            self.last_render_end_at = Some(advance_samples(at, self.resampled.len()));
            self.render_48k.extend(self.resampled.drain(..));
            while self.render_48k.len() >= PROCESSING_FRAME_SAMPLES {
                let frame_at = self.render_48k_at.unwrap_or(at);
                let mut frame = AudioFrame48k::default();
                for sample in &mut frame.0 {
                    *sample = self.render_48k.pop_front().unwrap();
                }
                self.last_render_rms = frame.rms();
                if self.echo.process_render(&frame, frame_at, 0).is_err() {
                    self.metrics
                        .0
                        .echo_processing_faults
                        .fetch_add(1, Ordering::Relaxed);
                    self.publish_echo(EchoStatus::Degraded);
                    self.reset();
                    return;
                }
                self.render_48k_at = Some(advance_processing_frame(frame_at));
            }
        }
    }

    fn drain_capture(&mut self) {
        if self.capture.take_discontinuity() {
            self.metrics
                .0
                .capture_discontinuities
                .fetch_add(1, Ordering::Relaxed);
            self.publish_echo(EchoStatus::Degraded);
            self.reset();
            let _ = self.input_overflow.try_send(InputControl::Overflow);
        }
        while let Some(chunk) = self.capture.pop() {
            let at = chunk.time.first_frame_at.unwrap_or(chunk.time.callback_at);
            let _ = self.observer.publish(Observation::CaptureArrived {
                session_id: self.config.session_id.clone(),
                generation: self.config.route_generation,
                at,
            });
            self.capture_mono.clear();
            downmix(chunk.values(), chunk.channels, &mut self.capture_mono);
            self.resampled.clear();
            self.capture_resampler
                .process(&self.capture_mono, &mut self.resampled);
            if self.resampled.len() > MAX_RESAMPLED_SAMPLES {
                let _ = self.input_overflow.try_send(InputControl::Overflow);
                self.publish_echo(EchoStatus::Degraded);
                self.reset();
                continue;
            }
            if self.capture_48k.is_empty() {
                self.capture_48k_at = Some(at);
            }
            self.capture_resampled_frames = self
                .capture_resampled_frames
                .saturating_add(self.resampled.len() as u64);
            let capture_end_at = advance_samples(at, self.resampled.len());
            let callback_clock_only = self.config.input_timestamp_quality
                == TimestampQuality::CallbackOnly
                || self.config.output_timestamp_quality == TimestampQuality::CallbackOnly;
            let queue_error_frames = if callback_clock_only {
                0
            } else {
                let error = alignment_error_frames(
                    self.capture_resampled_frames,
                    capture_end_at,
                    self.render_resampled_frames,
                    self.last_render_end_at,
                    &mut self.alignment_baseline_frames,
                );
                self.metrics
                    .0
                    .max_alignment_error_frames
                    .fetch_max(u64::from(error.unsigned_abs()), Ordering::Relaxed);
                error
            };
            self.capture_48k.extend(self.resampled.drain(..));
            while self.capture_48k.len() >= PROCESSING_FRAME_SAMPLES {
                let frame_at = self.capture_48k_at.unwrap_or(at);
                let mut raw = AudioFrame48k::default();
                for sample in &mut raw.0 {
                    *sample = self.capture_48k.pop_front().unwrap();
                }
                let clock = if callback_clock_only {
                    self.aligner.observe_capture_callback_clock(
                        frame_at,
                        self.config.callback_only_delay_hint_ms,
                    )
                } else {
                    self.aligner
                        .observe_capture(frame_at, queue_error_frames, 10)
                };
                self.metrics.update_clock(clock.correction_ppm);
                if let Some(fault) = clock.fault {
                    self.metrics.record_clock_fault(fault);
                    self.publish_echo(EchoStatus::Degraded);
                    self.reset();
                    break;
                }
                if self
                    .capture_resampler
                    .set_relative_ratio(1.0 + clock.correction_ppm / 1_000_000.0)
                    .is_err()
                {
                    self.publish_echo(EchoStatus::Degraded);
                    self.reset();
                    break;
                }
                let mut clean = AudioFrame48k::default();
                match self
                    .echo
                    .process_capture(&raw, frame_at, clock.delay_hint_ms, &mut clean)
                {
                    Ok(report) => {
                        if let Some(tap) = &self.config.diagnostic_audio_tap {
                            tap.record(DiagnosticAudioFrame {
                                at: frame_at,
                                raw: raw.clone(),
                                clean: clean.clone(),
                            });
                        }
                        self.metrics.update_echo(&report);
                        self.publish_echo(report.state);
                        self.resampled.clear();
                        self.clean_resampler.process(&clean.0, &mut self.resampled);
                        if self.clean_16k.is_empty() {
                            self.clean_16k_at = Some(frame_at);
                        }
                        self.clean_16k.extend(self.resampled.drain(..));
                        while self.clean_16k.len() >= 160 {
                            let clean_at = self.clean_16k_at.unwrap_or(frame_at);
                            let mut samples = [0.0; 160];
                            for sample in &mut samples {
                                *sample = self.clean_16k.pop_front().unwrap();
                            }
                            let message = CleanFrame {
                                samples,
                                at: clean_at,
                                far_end_active: self.last_render_rms
                                    >= self.voice_config.render_silence_rms,
                                echo_status: report.state,
                                safe_echo_continuous: report.state == EchoStatus::Converged,
                                adaptation_ready: report.adaptation_ready,
                                near_end_evidence: near_end_evidence(
                                    &self.voice_config,
                                    report.adaptation_ready,
                                    report.raw_rms,
                                    report.clean_rms,
                                ),
                            };
                            if let Err(error) = self.clean_tx.try_send(message) {
                                if matches!(error, TrySendError::Full(_)) {
                                    let _ = self.input_overflow.try_send(InputControl::Overflow);
                                }
                            }
                            self.clean_16k_at = Some(advance_processing_frame(clean_at));
                        }
                    }
                    Err(_) => {
                        self.metrics
                            .0
                            .echo_processing_faults
                            .fetch_add(1, Ordering::Relaxed);
                        self.publish_echo(EchoStatus::Degraded);
                        self.reset();
                        break;
                    }
                }
                self.capture_48k_at = Some(advance_processing_frame(frame_at));
            }
        }
    }

    fn publish_echo(&mut self, status: EchoStatus) {
        if status != self.last_echo {
            self.last_echo = status;
            let _ = self.observer.publish(Observation::EchoChanged {
                generation: self.config.route_generation,
                status,
            });
        }
    }
}

fn advance_processing_frame(at: MonoTimeNs) -> MonoTimeNs {
    MonoTimeNs(at.0.saturating_add(u64::from(crate::PROCESSING_FRAME_MS) * 1_000_000))
}

fn advance_samples(at: MonoTimeNs, samples: usize) -> MonoTimeNs {
    MonoTimeNs(
        at.0.saturating_add(
            (samples as u64)
                .saturating_mul(1_000_000_000)
                .div_ceil(u64::from(PROCESSING_RATE_HZ)),
        ),
    )
}

/// Difference between capture output and the render timeline at the same
/// monotonic instant. The first paired callback establishes the route's fixed
/// phase/delay; subsequent movement is queue-fill error for the drift servo.
fn alignment_error_frames(
    capture_frames: u64,
    capture_end_at: MonoTimeNs,
    render_frames: u64,
    render_end_at: Option<MonoTimeNs>,
    baseline: &mut Option<f64>,
) -> i32 {
    let Some(render_end_at) = render_end_at else {
        return 0;
    };
    let time_delta_ns = capture_end_at.0 as i128 - render_end_at.0 as i128;
    let predicted_render = render_frames as f64
        + time_delta_ns as f64 * f64::from(PROCESSING_RATE_HZ) / 1_000_000_000.0;
    let phase = capture_frames as f64 - predicted_render;
    let initial = *baseline.get_or_insert(phase);
    (initial - phase)
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

fn downmix(interleaved: &[f32], channels: u16, output: &mut Vec<f32>) {
    let channels = usize::from(channels);
    if channels == 0 {
        return;
    }
    for frame in interleaved.chunks_exact(channels) {
        output.push(frame.iter().copied().sum::<f32>() / channels as f32);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CallbackTime, FakeEchoProcessor, HostSampleFormat, ModelError, RecognizerUpdate,
        SpeakerEmbedder, StreamDescriptor, TimestampQuality,
    };

    #[test]
    fn near_end_evidence_preserves_double_talk_but_rejects_suppressed_echo() {
        let config = VoiceConfigV1::default();
        assert!(near_end_evidence(&config, true, 0.035, 0.029));
        assert!(!near_end_evidence(&config, true, 0.0125, 0.0034));
        assert!(!near_end_evidence(&config, true, 0.002, 0.002));
        assert!(!near_end_evidence(&config, false, 0.035, 0.029));
    }

    struct SpeechVad;

    #[test]
    fn alignment_error_tracks_relative_clock_queue_fill() {
        let mut baseline = None;
        assert_eq!(
            alignment_error_frames(
                480,
                MonoTimeNs::from_millis(60),
                2_880,
                Some(MonoTimeNs::from_millis(60)),
                &mut baseline,
            ),
            0
        );
        // The capture callback now spans 10.1 ms for 480 nominal frames while
        // render remains at 10 ms. It needs positive resampler correction.
        assert_eq!(
            alignment_error_frames(
                960,
                MonoTimeNs(70_100_000),
                3_360,
                Some(MonoTimeNs::from_millis(70)),
                &mut baseline,
            ),
            5
        );
    }

    impl VoiceActivityDetector for SpeechVad {
        fn reset(&mut self) {}

        fn probability(&mut self, _frame: &[f32; 512]) -> Result<f32, ModelError> {
            Ok(0.9)
        }
    }

    #[derive(Default)]
    struct Recognizer;

    impl StreamingRecognizer for Recognizer {
        fn begin(&mut self, _candidate: &CandidateId) -> Result<(), ModelError> {
            Ok(())
        }

        fn push(&mut self, _pcm_16k: &[f32]) -> Result<RecognizerUpdate, ModelError> {
            Ok(RecognizerUpdate::default())
        }

        fn finish(&mut self) -> Result<RecognizerUpdate, ModelError> {
            Ok(RecognizerUpdate::default())
        }

        fn cancel(&mut self) {}
    }

    #[test]
    fn callback_audio_reaches_vad_on_a_sleeping_bounded_pipeline() {
        let descriptor = StreamDescriptor {
            sample_rate_hz: 48_000,
            channels: 1,
            sample_format: HostSampleFormat::Float { bits: 32 },
            nominal_callback_frames: Some(480),
        };
        let capture = CapturePort::new(25, descriptor);
        let (render, _producer) = RenderPort::new(25, 50);
        let route = RouteGeneration(1);
        capture.activate(route);
        render.activate_route(route, aven_voice_core::OutputGeneration(0));
        let (observer, observations) = RuntimeObserver::test_pair(64);
        let pipeline = DuplexPipeline::spawn(
            DuplexPipelineConfig {
                session_id: SessionId::parse("session").unwrap(),
                route_generation: route,
                input_rate_hz: 48_000,
                input_channels: 1,
                output_rate_hz: 48_000,
                input_timestamp_quality: TimestampQuality::Hardware,
                output_timestamp_quality: TimestampQuality::Hardware,
                callback_only_delay_hint_ms: None,
                diagnostic_audio_tap: None,
                id_prefix: "pipeline".into(),
            },
            VoiceConfigV1::default(),
            capture.clone(),
            render,
            Box::new(FakeEchoProcessor::new(VoiceConfigV1::default(), 0.0)),
            InputModels {
                vad: Box::new(SpeechVad),
                recognizer: Box::new(Recognizer),
                speaker: None,
            },
            observer,
        )
        .unwrap();
        capture.write_f32(
            &[0.1; 4_800],
            1,
            CallbackTime {
                callback_at: MonoTimeNs(0),
                first_frame_at: Some(MonoTimeNs(0)),
                frame_position: Some(0),
                quality: TimestampQuality::Hardware,
            },
            route,
        );

        let mut candidate_at = None;
        for _ in 0..16 {
            let observation = observations
                .recv_timeout(std::time::Duration::from_secs(1))
                .expect("pipeline should publish bounded observations");
            if let Observation::VadStarted { at, .. } = observation {
                candidate_at = Some(at);
                break;
            }
        }
        assert!(candidate_at.is_some_and(|at| at > MonoTimeNs(0)));
        let _models = pipeline.stop();
    }

    struct LevelVad;

    impl VoiceActivityDetector for LevelVad {
        fn reset(&mut self) {}

        fn probability(&mut self, frame: &[f32; 512]) -> Result<f32, ModelError> {
            Ok(if frame.iter().any(|sample| sample.abs() > 0.01) {
                0.9
            } else {
                0.0
            })
        }
    }

    struct FinalRecognizer;

    impl StreamingRecognizer for FinalRecognizer {
        fn begin(&mut self, _candidate: &CandidateId) -> Result<(), ModelError> {
            Ok(())
        }

        fn push(&mut self, _pcm_16k: &[f32]) -> Result<RecognizerUpdate, ModelError> {
            Ok(RecognizerUpdate {
                cumulative_text: "Guten Tag".into(),
                final_text: None,
            })
        }

        fn finish(&mut self) -> Result<RecognizerUpdate, ModelError> {
            Ok(RecognizerUpdate {
                cumulative_text: "Guten Tag".into(),
                final_text: Some("Guten Tag".into()),
            })
        }

        fn cancel(&mut self) {}
    }

    struct FixedSpeaker;

    impl SpeakerEmbedder for FixedSpeaker {
        fn embedding(&mut self, _pcm_16k: &[f32]) -> Result<Vec<f32>, ModelError> {
            Ok(vec![1.0, 0.0, 0.0])
        }
    }

    #[test]
    fn accepted_post_aec_candidate_is_attributed_before_its_final_text() {
        let config = VoiceConfigV1 {
            start_windows: 1,
            end_windows: 2,
            ..VoiceConfigV1::default()
        };
        let (clean_tx, clean_rx) = bounded(256);
        let (control_tx, control_rx) = bounded(4);
        let (observer, observations) = RuntimeObserver::test_pair(256);
        let generation = RouteGeneration(7);
        let worker = std::thread::spawn(move || {
            input_loop(
                config,
                InputModels {
                    vad: Box::new(LevelVad),
                    recognizer: Box::new(FinalRecognizer),
                    speaker: Some(Box::new(FixedSpeaker)),
                },
                clean_rx,
                control_rx,
                observer,
                generation,
                "speaker-test".into(),
                DuplexMetrics::default(),
            )
        });
        let frame = |index: u64, sample: f32| CleanFrame {
            samples: [sample; 160],
            at: MonoTimeNs::from_millis(index * 10),
            far_end_active: false,
            echo_status: EchoStatus::Bypassed,
            safe_echo_continuous: true,
            adaptation_ready: true,
            near_end_evidence: true,
        };
        for index in 0..160 {
            clean_tx.send(frame(index, 0.1)).unwrap();
        }
        for index in 160..172 {
            clean_tx.send(frame(index, 0.0)).unwrap();
        }

        let mut ordered = Vec::new();
        for _ in 0..128 {
            let observation = observations
                .recv_timeout(std::time::Duration::from_secs(1))
                .expect("input worker should finish the candidate");
            match observation {
                Observation::SpeakerEmbedding { .. } => ordered.push("speaker"),
                Observation::RecognizerFinal { .. } => {
                    ordered.push("final");
                    break;
                }
                _ => {}
            }
        }
        assert_eq!(ordered, ["speaker", "final"]);
        control_tx.send(InputControl::Stop).unwrap();
        let returned = worker.join().unwrap();
        assert!(returned.speaker.is_some());
    }
}
