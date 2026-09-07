use aven_voice_core::{MonoTimeNs, RouteGeneration, VoiceConfigV1};
use aven_voice_protocol::EchoStatus;

use crate::{AudioFrame48k, PROCESSING_RATE_HZ};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EchoProcessorKind {
    SoftwareAec3,
    External,
    Fake,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProcessingFormat {
    pub sample_rate_hz: u32,
    pub channels: u16,
}

impl Default for ProcessingFormat {
    fn default() -> Self {
        Self {
            sample_rate_hz: PROCESSING_RATE_HZ,
            channels: 1,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EchoError(pub &'static str);

impl std::fmt::Display for EchoError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.0)
    }
}

impl std::error::Error for EchoError {}

#[derive(Clone, Debug, PartialEq)]
pub struct EchoReport {
    pub state: EchoStatus,
    pub route: RouteGeneration,
    pub delay_hint_ms: u32,
    pub raw_rms: f32,
    pub raw_peak: f32,
    pub render_rms: f32,
    pub render_peak: f32,
    pub clean_rms: f32,
    pub clean_peak: f32,
    pub clipped_fraction: f32,
    pub echo_return_loss_db: Option<f64>,
    pub echo_return_loss_enhancement_db: Option<f64>,
    pub residual_echo_likelihood: Option<f64>,
    /// The route has completed the minimum fault-free timing and delay
    /// adaptation, independently of the stricter residual-echo qualification.
    pub adaptation_ready: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EchoSnapshot {
    pub state: EchoStatus,
    pub route: RouteGeneration,
    pub contiguous_frames: u64,
    pub delay_hint_ms: u32,
    pub faulted: bool,
}

pub trait EchoProcessor: Send + 'static {
    fn kind(&self) -> EchoProcessorKind;
    fn reset(&mut self, format: ProcessingFormat, route: RouteGeneration);
    fn process_render(
        &mut self,
        frame: &AudioFrame48k,
        time: MonoTimeNs,
        delay_hint_ms: u32,
    ) -> Result<(), EchoError>;
    fn process_capture(
        &mut self,
        frame: &AudioFrame48k,
        time: MonoTimeNs,
        delay_hint_ms: u32,
        output: &mut AudioFrame48k,
    ) -> Result<EchoReport, EchoError>;
    fn snapshot(&self) -> EchoSnapshot;
}

#[derive(Debug)]
struct EchoHealth {
    config: VoiceConfigV1,
    route: RouteGeneration,
    state: EchoStatus,
    active_since: Option<MonoTimeNs>,
    stable_since: Option<MonoTimeNs>,
    residual_healthy_since: Option<MonoTimeNs>,
    silent_since: Option<MonoTimeNs>,
    contiguous_frames: u64,
    saturation_streak: u32,
    faulted: bool,
    render_rms: f32,
    delay_hint_ms: u32,
    delay_initialized: bool,
}

impl EchoHealth {
    fn new(config: VoiceConfigV1) -> Self {
        Self {
            config,
            route: RouteGeneration(0),
            state: EchoStatus::Bypassed,
            active_since: None,
            stable_since: None,
            residual_healthy_since: None,
            silent_since: None,
            contiguous_frames: 0,
            saturation_streak: 0,
            faulted: false,
            render_rms: 0.0,
            delay_hint_ms: 0,
            delay_initialized: false,
        }
    }

    fn reset(&mut self, route: RouteGeneration) {
        self.route = route;
        self.state = EchoStatus::Bypassed;
        self.active_since = None;
        self.stable_since = None;
        self.residual_healthy_since = None;
        self.silent_since = None;
        self.contiguous_frames = 0;
        self.saturation_streak = 0;
        self.faulted = false;
        self.render_rms = 0.0;
        self.delay_hint_ms = 0;
        self.delay_initialized = false;
    }

    fn render(&mut self, frame: &AudioFrame48k, time: MonoTimeNs) {
        self.render_rms = frame.rms();
        if self.render_rms < self.config.render_silence_rms {
            let silent_since = *self.silent_since.get_or_insert(time);
            self.residual_healthy_since = None;
            if time.elapsed_since(silent_since)
                >= u64::from(self.config.aec_stable_delay_ms) * 1_000_000
            {
                self.state = EchoStatus::Bypassed;
                self.active_since = None;
                self.stable_since = None;
            }
        } else if self.state == EchoStatus::Bypassed {
            self.silent_since = None;
            self.state = EchoStatus::Adapting;
            self.active_since = Some(time);
            self.stable_since = Some(time);
            self.contiguous_frames = 0;
        } else {
            self.silent_since = None;
        }
    }

    fn capture(
        &mut self,
        frame: &AudioFrame48k,
        time: MonoTimeNs,
        delay_hint_ms: u32,
        residual_health: Option<bool>,
    ) -> (f32, EchoStatus) {
        let delay_changed =
            self.delay_initialized && self.delay_hint_ms.abs_diff(delay_hint_ms) > 2;
        self.delay_hint_ms = delay_hint_ms;
        self.delay_initialized = true;
        self.contiguous_frames += 1;
        let clipped = frame
            .0
            .iter()
            .filter(|sample| sample.abs() >= 0.999)
            .count() as f32
            / frame.0.len() as f32;
        if clipped >= self.config.saturation_fraction {
            self.saturation_streak += 1;
        } else {
            self.saturation_streak = 0;
        }
        if self.saturation_streak >= self.config.saturation_frames {
            self.degrade();
        }
        if delay_changed {
            self.stable_since = Some(time);
            self.residual_healthy_since = None;
            if self.state != EchoStatus::Bypassed {
                self.state = EchoStatus::Adapting;
            }
        }
        if self.state == EchoStatus::Adapting && self.render_rms >= self.config.render_silence_rms {
            match residual_health {
                Some(true) => {
                    self.residual_healthy_since.get_or_insert(time);
                }
                Some(false) => self.residual_healthy_since = None,
                None => {}
            }
        }
        let residual_health_stable = residual_health.is_none()
            || self.residual_healthy_since.is_some_and(|start| {
                time.elapsed_since(start) >= u64::from(self.config.aec_stable_delay_ms) * 1_000_000
            });
        if !self.faulted
            && self.state == EchoStatus::Adapting
            && residual_health_stable
            && self.active_since.is_some_and(|start| {
                time.elapsed_since(start)
                    >= u64::from(self.config.aec_min_adaptation_ms) * 1_000_000
            })
            && self.stable_since.is_some_and(|start| {
                time.elapsed_since(start) >= u64::from(self.config.aec_stable_delay_ms) * 1_000_000
            })
        {
            self.state = EchoStatus::Converged;
        }
        (clipped, self.state)
    }

    fn degrade(&mut self) {
        self.faulted = true;
        self.state = EchoStatus::Degraded;
    }

    fn adaptation_ready(&self, time: MonoTimeNs) -> bool {
        !self.faulted
            && matches!(self.state, EchoStatus::Adapting | EchoStatus::Converged)
            && self.active_since.is_some_and(|start| {
                time.elapsed_since(start)
                    >= u64::from(self.config.aec_min_adaptation_ms) * 1_000_000
            })
            && self.stable_since.is_some_and(|start| {
                time.elapsed_since(start) >= u64::from(self.config.aec_stable_delay_ms) * 1_000_000
            })
    }

    fn snapshot(&self) -> EchoSnapshot {
        EchoSnapshot {
            state: self.state,
            route: self.route,
            contiguous_frames: self.contiguous_frames,
            delay_hint_ms: self.delay_hint_ms,
            faulted: self.faulted,
        }
    }
}

/// Deterministic echo processor for semantic and pipeline tests.
pub struct FakeEchoProcessor {
    health: EchoHealth,
    attenuation: f32,
    render: AudioFrame48k,
}

impl FakeEchoProcessor {
    pub fn new(config: VoiceConfigV1, attenuation: f32) -> Self {
        Self {
            health: EchoHealth::new(config),
            attenuation,
            render: AudioFrame48k::default(),
        }
    }
}

impl EchoProcessor for FakeEchoProcessor {
    fn kind(&self) -> EchoProcessorKind {
        EchoProcessorKind::Fake
    }

    fn reset(&mut self, _format: ProcessingFormat, route: RouteGeneration) {
        self.health.reset(route);
        self.render = AudioFrame48k::default();
    }

    fn process_render(
        &mut self,
        frame: &AudioFrame48k,
        time: MonoTimeNs,
        _delay_hint_ms: u32,
    ) -> Result<(), EchoError> {
        self.render = frame.clone();
        self.health.render(frame, time);
        Ok(())
    }

    fn process_capture(
        &mut self,
        frame: &AudioFrame48k,
        time: MonoTimeNs,
        delay_hint_ms: u32,
        output: &mut AudioFrame48k,
    ) -> Result<EchoReport, EchoError> {
        for ((clean, capture), render) in output.0.iter_mut().zip(&frame.0).zip(&self.render.0) {
            *clean = (*capture - *render * self.attenuation).clamp(-1.0, 1.0);
        }
        let (clipped_fraction, state) = self.health.capture(frame, time, delay_hint_ms, None);
        Ok(EchoReport {
            state,
            route: self.health.route,
            delay_hint_ms,
            raw_rms: frame.rms(),
            raw_peak: frame.peak(),
            render_rms: self.render.rms(),
            render_peak: self.render.peak(),
            clean_rms: output.rms(),
            clean_peak: output.peak(),
            clipped_fraction,
            echo_return_loss_db: None,
            echo_return_loss_enhancement_db: None,
            residual_echo_likelihood: None,
            adaptation_ready: self.health.adaptation_ready(time),
        })
    }

    fn snapshot(&self) -> EchoSnapshot {
        self.health.snapshot()
    }
}

#[cfg(feature = "software-aec")]
pub struct SoftwareAec3 {
    apm: sonora::AudioProcessing,
    health: EchoHealth,
    render_scratch: AudioFrame48k,
}

#[cfg(feature = "software-aec")]
impl SoftwareAec3 {
    pub fn new(config: VoiceConfigV1) -> Self {
        use sonora::config::{EchoCanceller, HighPassFilter};
        use sonora::{Config, StreamConfig};
        let pipeline = Config {
            echo_canceller: Some(EchoCanceller::default()),
            high_pass_filter: Some(HighPassFilter::default()),
            noise_suppression: None,
            gain_controller2: None,
            ..Default::default()
        };
        Self {
            apm: sonora::AudioProcessing::builder()
                .config(pipeline)
                .capture_config(StreamConfig::new(PROCESSING_RATE_HZ, 1))
                .render_config(StreamConfig::new(PROCESSING_RATE_HZ, 1))
                .echo_detector(true)
                .build(),
            health: EchoHealth::new(config),
            render_scratch: AudioFrame48k::default(),
        }
    }
}

#[cfg(feature = "software-aec")]
impl EchoProcessor for SoftwareAec3 {
    fn kind(&self) -> EchoProcessorKind {
        EchoProcessorKind::SoftwareAec3
    }

    fn reset(&mut self, _format: ProcessingFormat, route: RouteGeneration) {
        let config = self.apm.config().clone();
        *self = Self::new(self.health.config.clone());
        self.apm.apply_config(config);
        self.health.reset(route);
    }

    fn process_render(
        &mut self,
        frame: &AudioFrame48k,
        time: MonoTimeNs,
        _delay_hint_ms: u32,
    ) -> Result<(), EchoError> {
        self.health.render(frame, time);
        self.apm
            .process_render_f32(&[&frame.0], &mut [&mut self.render_scratch.0])
            .map_err(|_| EchoError("AEC render processing failed"))
    }

    fn process_capture(
        &mut self,
        frame: &AudioFrame48k,
        time: MonoTimeNs,
        delay_hint_ms: u32,
        output: &mut AudioFrame48k,
    ) -> Result<EchoReport, EchoError> {
        self.apm
            .set_stream_delay_ms(delay_hint_ms as i32)
            .map_err(|_| EchoError("AEC delay is outside the supported history"))?;
        self.apm
            .process_capture_f32(&[&frame.0], &mut [&mut output.0])
            .map_err(|_| EchoError("AEC capture processing failed"))?;
        let stats = self.apm.statistics();
        let residual_health = Some(stats.echo_return_loss_enhancement.is_some_and(|value| {
            value >= self.health.config.minimum_echo_return_loss_enhancement_db
        }));
        let (clipped_fraction, state) =
            self.health
                .capture(frame, time, delay_hint_ms, residual_health);
        Ok(EchoReport {
            state,
            route: self.health.route,
            delay_hint_ms,
            raw_rms: frame.rms(),
            raw_peak: frame.peak(),
            render_rms: self.health.render_rms,
            render_peak: self.render_scratch.peak(),
            clean_rms: output.rms(),
            clean_peak: output.peak(),
            clipped_fraction,
            echo_return_loss_db: stats.echo_return_loss,
            echo_return_loss_enhancement_db: stats.echo_return_loss_enhancement,
            residual_echo_likelihood: stats.residual_echo_likelihood,
            adaptation_ready: self.health.adaptation_ready(time),
        })
    }

    fn snapshot(&self) -> EchoSnapshot {
        self.health.snapshot()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(feature = "software-aec")]
    use std::collections::VecDeque;

    #[test]
    fn convergence_needs_contiguous_adaptation_and_stable_delay() {
        let mut echo = FakeEchoProcessor::new(VoiceConfigV1::default(), 1.0);
        echo.reset(ProcessingFormat::default(), RouteGeneration(1));
        let render = AudioFrame48k([0.25; 480]);
        let capture = render.clone();
        let mut clean = AudioFrame48k::default();
        echo.process_render(&render, MonoTimeNs::from_millis(0), 10)
            .unwrap();
        let adapting = echo
            .process_capture(&capture, MonoTimeNs::from_millis(299), 10, &mut clean)
            .unwrap();
        assert_eq!(adapting.state, EchoStatus::Adapting);
        assert!(!adapting.adaptation_ready);
        let converged = echo
            .process_capture(&capture, MonoTimeNs::from_millis(300), 10, &mut clean)
            .unwrap();
        assert_eq!(converged.state, EchoStatus::Converged);
        assert!(converged.adaptation_ready);
        assert!(clean.rms() < 1.0e-6);
    }

    #[test]
    fn measured_residual_health_must_be_stable_before_convergence() {
        let mut health = EchoHealth::new(VoiceConfigV1::default());
        health.reset(RouteGeneration(1));
        let render = AudioFrame48k([0.25; 480]);
        let capture = render.clone();
        health.render(&render, MonoTimeNs::from_millis(0));
        assert_eq!(
            health
                .capture(&capture, MonoTimeNs::from_millis(300), 10, Some(false))
                .1,
            EchoStatus::Adapting
        );
        assert_eq!(
            health
                .capture(&capture, MonoTimeNs::from_millis(400), 10, Some(true))
                .1,
            EchoStatus::Adapting
        );
        assert_eq!(
            health
                .capture(&capture, MonoTimeNs::from_millis(599), 10, Some(true))
                .1,
            EchoStatus::Adapting
        );
        assert_eq!(
            health
                .capture(&capture, MonoTimeNs::from_millis(600), 10, Some(true))
                .1,
            EchoStatus::Converged
        );
    }

    #[test]
    fn sustained_saturation_degrades_immediately() {
        let mut echo = FakeEchoProcessor::new(VoiceConfigV1::default(), 0.0);
        echo.reset(ProcessingFormat::default(), RouteGeneration(1));
        let render = AudioFrame48k([0.25; 480]);
        let clipped = AudioFrame48k([1.0; 480]);
        let mut clean = AudioFrame48k::default();
        echo.process_render(&render, MonoTimeNs(0), 0).unwrap();
        let mut state = EchoStatus::Adapting;
        for frame in 0..3 {
            state = echo
                .process_capture(&clipped, MonoTimeNs::from_millis(frame * 10), 0, &mut clean)
                .unwrap()
                .state;
        }
        assert_eq!(state, EchoStatus::Degraded);
    }

    #[test]
    fn delay_change_restarts_the_stability_interval() {
        let mut echo = FakeEchoProcessor::new(VoiceConfigV1::default(), 1.0);
        echo.reset(ProcessingFormat::default(), RouteGeneration(1));
        let render = AudioFrame48k([0.25; 480]);
        let mut clean = AudioFrame48k::default();
        echo.process_render(&render, MonoTimeNs::from_millis(0), 10)
            .unwrap();
        echo.process_capture(&render, MonoTimeNs::from_millis(100), 10, &mut clean)
            .unwrap();
        let report = echo
            .process_capture(&render, MonoTimeNs::from_millis(300), 30, &mut clean)
            .unwrap();
        assert_eq!(report.state, EchoStatus::Adapting);
        let report = echo
            .process_capture(&render, MonoTimeNs::from_millis(499), 30, &mut clean)
            .unwrap();
        assert_eq!(report.state, EchoStatus::Adapting);
        let report = echo
            .process_capture(&render, MonoTimeNs::from_millis(500), 30, &mut clean)
            .unwrap();
        assert_eq!(report.state, EchoStatus::Converged);
    }

    #[test]
    fn brief_word_gaps_preserve_convergence_but_sustained_silence_bypasses() {
        let mut echo = FakeEchoProcessor::new(VoiceConfigV1::default(), 1.0);
        echo.reset(ProcessingFormat::default(), RouteGeneration(1));
        let render = AudioFrame48k([0.25; 480]);
        let silence = AudioFrame48k::default();
        let mut clean = AudioFrame48k::default();
        echo.process_render(&render, MonoTimeNs::from_millis(0), 10)
            .unwrap();
        let converged = echo
            .process_capture(&render, MonoTimeNs::from_millis(300), 10, &mut clean)
            .unwrap();
        assert_eq!(converged.state, EchoStatus::Converged);

        echo.process_render(&silence, MonoTimeNs::from_millis(310), 10)
            .unwrap();
        let brief_gap = echo
            .process_capture(&silence, MonoTimeNs::from_millis(450), 10, &mut clean)
            .unwrap();
        assert_eq!(brief_gap.state, EchoStatus::Converged);

        echo.process_render(&silence, MonoTimeNs::from_millis(520), 10)
            .unwrap();
        let sustained = echo
            .process_capture(&silence, MonoTimeNs::from_millis(520), 10, &mut clean)
            .unwrap();
        assert_eq!(sustained.state, EchoStatus::Bypassed);
    }

    #[test]
    fn sustained_silence_bypasses_an_adapter_that_never_converged() {
        let mut echo = FakeEchoProcessor::new(VoiceConfigV1::default(), 1.0);
        echo.reset(ProcessingFormat::default(), RouteGeneration(1));
        let render = AudioFrame48k([0.25; 480]);
        let silence = AudioFrame48k::default();
        let mut clean = AudioFrame48k::default();
        echo.process_render(&render, MonoTimeNs::from_millis(0), 10)
            .unwrap();
        let adapting = echo
            .process_capture(&render, MonoTimeNs::from_millis(100), 10, &mut clean)
            .unwrap();
        assert_eq!(adapting.state, EchoStatus::Adapting);

        echo.process_render(&silence, MonoTimeNs::from_millis(110), 10)
            .unwrap();
        echo.process_render(&silence, MonoTimeNs::from_millis(320), 10)
            .unwrap();
        let bypassed = echo
            .process_capture(&silence, MonoTimeNs::from_millis(320), 10, &mut clean)
            .unwrap();
        assert_eq!(bypassed.state, EchoStatus::Bypassed);
    }

    #[cfg(feature = "software-aec")]
    #[test]
    fn software_aec_attenuates_a_deterministic_delayed_echo_path() {
        let mut aec = SoftwareAec3::new(VoiceConfigV1::default());
        aec.reset(ProcessingFormat::default(), RouteGeneration(1));
        let mut delay = VecDeque::<AudioFrame48k>::new();
        let mut phase = 0.0_f32;
        let mut raw_energy = 0.0_f64;
        let mut clean_energy = 0.0_f64;
        for frame_index in 0..600_u64 {
            let mut render = AudioFrame48k::default();
            for sample in &mut render.0 {
                phase += 2.0 * std::f32::consts::PI * 173.0 / PROCESSING_RATE_HZ as f32;
                if phase > 2.0 * std::f32::consts::PI {
                    phase -= 2.0 * std::f32::consts::PI;
                }
                *sample =
                    0.35 * phase.sin() + 0.12 * (phase * 2.37).sin() + 0.06 * (phase * 4.11).sin();
            }
            let time = MonoTimeNs::from_millis(frame_index * 10);
            aec.process_render(&render, time, 50).unwrap();
            delay.push_back(render);
            let source = if delay.len() > 5 {
                delay.pop_front().unwrap()
            } else {
                AudioFrame48k::default()
            };
            let mut capture = AudioFrame48k::default();
            for (sample, echo) in capture.0.iter_mut().zip(source.0) {
                *sample = echo * 0.55;
            }
            let mut clean = AudioFrame48k::default();
            aec.process_capture(&capture, time, 50, &mut clean).unwrap();
            if frame_index >= 400 {
                raw_energy += capture
                    .0
                    .iter()
                    .map(|sample| f64::from(sample * sample))
                    .sum::<f64>();
                clean_energy += clean
                    .0
                    .iter()
                    .map(|sample| f64::from(sample * sample))
                    .sum::<f64>();
            }
        }
        let attenuation_db = 10.0 * (raw_energy / clean_energy.max(1.0e-20)).log10();
        assert!(
            attenuation_db >= 15.0,
            "expected at least 15 dB echo attenuation, measured {attenuation_db:.2} dB"
        );
    }
}
