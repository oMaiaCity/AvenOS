use aven_voice_core::{MonoTimeNs, VoiceConfigV1};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClockFault {
    TimestampRegression,
    DelayOutsideHistory,
    DriftOutsideRange,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ClockReport {
    pub delay_hint_ms: u32,
    pub correction_ppm: f64,
    pub stable: bool,
    pub fault: Option<ClockFault>,
}

/// Aligns independent device clocks. It never changes semantic state itself;
/// faults are observations for the coordinator and echo-health evaluator.
#[derive(Debug)]
pub struct ClockAligner {
    config: VoiceConfigV1,
    last_capture: Option<MonoTimeNs>,
    last_render: Option<MonoTimeNs>,
    delay_hint_ms: u32,
    correction_ppm: f64,
    stable_since: Option<MonoTimeNs>,
}

impl ClockAligner {
    pub fn new(config: VoiceConfigV1) -> Self {
        Self {
            config,
            last_capture: None,
            last_render: None,
            delay_hint_ms: 0,
            correction_ppm: 0.0,
            stable_since: None,
        }
    }

    pub fn reset(&mut self) {
        self.last_capture = None;
        self.last_render = None;
        self.delay_hint_ms = 0;
        self.correction_ppm = 0.0;
        self.stable_since = None;
    }

    pub fn observe_render(&mut self, at: MonoTimeNs) -> Result<(), ClockFault> {
        if self.last_render.is_some_and(|last| at < last) {
            self.reset();
            return Err(ClockFault::TimestampRegression);
        }
        self.last_render = Some(at);
        Ok(())
    }

    pub fn observe_capture(
        &mut self,
        at: MonoTimeNs,
        queue_error_frames: i32,
        elapsed_ms: u32,
    ) -> ClockReport {
        if self.last_capture.is_some_and(|last| at < last) {
            self.reset();
            return self.report(Some(ClockFault::TimestampRegression), false);
        }
        self.last_capture = Some(at);
        let Some(render) = self.last_render else {
            return self.report(None, false);
        };

        let delay_ns = at.0.saturating_sub(render.0);
        let delay_ms = (delay_ns / 1_000_000).min(u64::from(u32::MAX)) as u32;
        if delay_ms > self.config.aec_history_ms {
            self.stable_since = None;
            return self.report(Some(ClockFault::DelayOutsideHistory), false);
        }
        let delay_changed = self.delay_hint_ms.abs_diff(delay_ms) > 2;
        self.delay_hint_ms = delay_ms;

        let desired_ppm = (f64::from(queue_error_frames) * 5.0).clamp(
            -(self.config.maximum_drift_ppm as f64),
            self.config.maximum_drift_ppm as f64,
        );
        let maximum_step =
            self.config.drift_slew_ppm_per_second as f64 * f64::from(elapsed_ms) / 1_000.0;
        let delta = (desired_ppm - self.correction_ppm).clamp(-maximum_step, maximum_step);
        self.correction_ppm += delta;
        if desired_ppm.abs() >= self.config.maximum_drift_ppm as f64
            && queue_error_frames.unsigned_abs() > 200
        {
            self.stable_since = None;
            return self.report(Some(ClockFault::DriftOutsideRange), false);
        }

        if delay_changed || self.stable_since.is_none() {
            self.stable_since = Some(at);
        }
        let stable = self.stable_since.is_some_and(|since| {
            at.elapsed_since(since) >= u64::from(self.config.aec_stable_delay_ms) * 1_000_000
        });
        self.report(None, stable)
    }

    /// Align callback-only duplex streams without inferring oscillator drift
    /// from their independently scheduled callback queue depths. The first
    /// shared-clock offset is a stable route-delay hint; continuity is guarded
    /// by timestamp regression and the bounded capture/reference ports.
    pub fn observe_capture_callback_clock(
        &mut self,
        at: MonoTimeNs,
        calibrated_delay_hint_ms: Option<u32>,
    ) -> ClockReport {
        if self.last_capture.is_some_and(|last| at < last) {
            self.reset();
            return self.report(Some(ClockFault::TimestampRegression), false);
        }
        self.last_capture = Some(at);
        let Some(render) = self.last_render else {
            return self.report(None, false);
        };
        if !self.delay_initialized() {
            let delay_ms = calibrated_delay_hint_ms.unwrap_or_else(|| {
                let delay_ns = at.0.saturating_sub(render.0);
                (delay_ns / 1_000_000).min(u64::from(u32::MAX)) as u32
            });
            if delay_ms > self.config.aec_history_ms {
                return self.report(Some(ClockFault::DelayOutsideHistory), false);
            }
            self.delay_hint_ms = delay_ms;
            self.stable_since = Some(at);
        }
        self.correction_ppm = 0.0;
        let stable = self.stable_since.is_some_and(|since| {
            at.elapsed_since(since) >= u64::from(self.config.aec_stable_delay_ms) * 1_000_000
        });
        self.report(None, stable)
    }

    fn delay_initialized(&self) -> bool {
        self.stable_since.is_some()
    }

    pub fn resample_ratio(&self) -> f64 {
        1.0 + self.correction_ppm / 1_000_000.0
    }

    fn report(&self, fault: Option<ClockFault>, stable: bool) -> ClockReport {
        ClockReport {
            delay_hint_ms: self.delay_hint_ms,
            correction_ppm: self.correction_ppm,
            stable,
            fault,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correction_is_bounded_and_slewed() {
        let mut aligner = ClockAligner::new(VoiceConfigV1::default());
        aligner.observe_render(MonoTimeNs::from_millis(0)).unwrap();
        let report = aligner.observe_capture(MonoTimeNs::from_millis(50), 100, 100);
        assert_eq!(report.correction_ppm, 5.0);
        assert_eq!(aligner.resample_ratio(), 1.000_005);
    }

    #[test]
    fn timestamp_regression_is_an_immediate_fault() {
        let mut aligner = ClockAligner::new(VoiceConfigV1::default());
        aligner.observe_render(MonoTimeNs(10)).unwrap();
        assert_eq!(
            aligner.observe_render(MonoTimeNs(9)),
            Err(ClockFault::TimestampRegression)
        );
    }

    #[test]
    fn delay_beyond_reference_history_is_never_silently_clamped() {
        let mut aligner = ClockAligner::new(VoiceConfigV1::default());
        aligner.observe_render(MonoTimeNs::from_millis(0)).unwrap();
        let report = aligner.observe_capture(MonoTimeNs::from_millis(501), 0, 10);
        assert_eq!(report.fault, Some(ClockFault::DelayOutsideHistory));
        assert!(!report.stable);
    }

    #[test]
    fn callback_clock_freezes_route_delay_and_does_not_invent_drift_from_jitter() {
        let mut aligner = ClockAligner::new(VoiceConfigV1::default());
        aligner
            .observe_render(MonoTimeNs::from_millis(100))
            .unwrap();
        let first = aligner.observe_capture_callback_clock(MonoTimeNs::from_millis(132), None);
        assert_eq!(first.delay_hint_ms, 32);
        aligner
            .observe_render(MonoTimeNs::from_millis(250))
            .unwrap();
        let jittered = aligner.observe_capture_callback_clock(MonoTimeNs::from_millis(340), None);
        assert_eq!(jittered.delay_hint_ms, 32);
        assert_eq!(jittered.correction_ppm, 0.0);
        assert_eq!(jittered.fault, None);
    }

    #[test]
    fn callback_clock_accepts_a_hardware_calibrated_delay_hint() {
        let mut aligner = ClockAligner::new(VoiceConfigV1::default());
        aligner
            .observe_render(MonoTimeNs::from_millis(100))
            .unwrap();
        let report = aligner.observe_capture_callback_clock(MonoTimeNs::from_millis(101), Some(25));
        assert_eq!(report.delay_hint_ms, 25);
        assert_eq!(report.correction_ppm, 0.0);
        assert_eq!(report.fault, None);
    }
}
