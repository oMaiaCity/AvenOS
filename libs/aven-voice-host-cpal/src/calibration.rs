use std::f32::consts::TAU;

#[derive(Clone, Copy, Debug)]
pub struct SignalWindow {
    pub name: &'static str,
    pub start_frame: usize,
    pub end_frame: usize,
}

#[derive(Clone, Debug)]
pub struct CalibrationStimulus {
    pub samples: Vec<f32>,
    pub sample_rate_hz: u32,
    pub probe_window: SignalWindow,
    pub windows: Vec<SignalWindow>,
}

#[derive(Clone, Debug)]
pub struct TimedMonoTrack {
    pub samples: Vec<f32>,
    pub sample_rate_hz: u32,
    pub first_frame_ns: u64,
}

#[derive(Clone, Debug)]
pub struct StreamMeasurement {
    pub name: &'static str,
    pub rendered_rms_dbfs: f64,
    pub captured_rms_dbfs: f64,
    pub signal_to_ambient_db: f64,
}

#[derive(Clone, Debug)]
pub struct CalibrationReport {
    pub estimated_echo_delay_ms: f64,
    pub correlation: f64,
    pub ambient_rms_dbfs: f64,
    pub captured_peak_dbfs: f64,
    pub clipped_fraction: f64,
    pub streams: Vec<StreamMeasurement>,
}

pub fn generate_stimulus(sample_rate_hz: u32, level_dbfs: f32) -> CalibrationStimulus {
    let level_dbfs = level_dbfs.clamp(-36.0, -18.0);
    let amplitude = 10.0_f32.powf(level_dbfs / 20.0);
    let mut samples = Vec::with_capacity(sample_rate_hz as usize * 6);
    append_silence(&mut samples, sample_rate_hz, 800);

    let probe_start = samples.len();
    append_prbs(&mut samples, sample_rate_hz, 800, amplitude);
    let probe_end = samples.len();
    apply_edge_fade(&mut samples[probe_start..probe_end], sample_rate_hz, 10);
    let probe_window = SignalWindow {
        name: "prbs",
        start_frame: probe_start,
        end_frame: probe_end,
    };

    append_silence(&mut samples, sample_rate_hz, 300);
    let chirp_start = samples.len();
    append_chirp(&mut samples, sample_rate_hz, 1_000, amplitude);
    let chirp_end = samples.len();
    apply_edge_fade(&mut samples[chirp_start..chirp_end], sample_rate_hz, 10);

    append_silence(&mut samples, sample_rate_hz, 300);
    let multitone_start = samples.len();
    append_multitone(&mut samples, sample_rate_hz, 800, amplitude);
    let multitone_end = samples.len();
    apply_edge_fade(
        &mut samples[multitone_start..multitone_end],
        sample_rate_hz,
        10,
    );
    append_silence(&mut samples, sample_rate_hz, 1_500);

    CalibrationStimulus {
        samples,
        sample_rate_hz,
        probe_window,
        windows: vec![
            probe_window,
            SignalWindow {
                name: "log_chirp",
                start_frame: chirp_start,
                end_frame: chirp_end,
            },
            SignalWindow {
                name: "multitone",
                start_frame: multitone_start,
                end_frame: multitone_end,
            },
        ],
    }
}

pub fn analyze_calibration(
    stimulus: &CalibrationStimulus,
    rendered: &TimedMonoTrack,
    captured: &TimedMonoTrack,
) -> Result<CalibrationReport, &'static str> {
    if rendered.samples.is_empty() || captured.samples.is_empty() {
        return Err("calibration did not receive both capture and render audio");
    }
    let analysis_rate_hz = 2_000;
    let probe =
        &stimulus.samples[stimulus.probe_window.start_frame..stimulus.probe_window.end_frame];
    let probe = resample_average(probe, stimulus.sample_rate_hz, analysis_rate_hz);
    let rendered_low =
        resample_average(&rendered.samples, rendered.sample_rate_hz, analysis_rate_hz);
    let captured_low =
        resample_average(&captured.samples, captured.sample_rate_hz, analysis_rate_hz);
    let (render_probe_frame, _) = locate(&probe, &rendered_low)
        .ok_or("calibration probe was not present in the rendered reference")?;
    let (capture_probe_frame, correlation) = locate(&probe, &captured_low)
        .ok_or("calibration probe was not detected by the microphone")?;

    let render_probe_ns = rendered.first_frame_ns as i128
        + frames_to_ns(render_probe_frame, analysis_rate_hz) as i128;
    let capture_probe_ns = captured.first_frame_ns as i128
        + frames_to_ns(capture_probe_frame, analysis_rate_hz) as i128;
    let delay_ns = capture_probe_ns - render_probe_ns;
    if delay_ns < 0 {
        return Err("microphone probe preceded the rendered probe");
    }
    let estimated_echo_delay_ms = delay_ns as f64 / 1_000_000.0;

    let ambient_end = capture_probe_frame.saturating_sub(100);
    let ambient_start = ambient_end.saturating_sub(600);
    let ambient_rms = rms(&captured_low[ambient_start..ambient_end]);
    let delay_capture_frames =
        ((estimated_echo_delay_ms / 1_000.0) * f64::from(captured.sample_rate_hz)).round() as isize;
    let render_track_offset = ((rendered.first_frame_ns as i128 - captured.first_frame_ns as i128)
        as f64
        * f64::from(captured.sample_rate_hz)
        / 1_000_000_000.0)
        .round() as isize;

    let streams = stimulus
        .windows
        .iter()
        .map(|window| {
            let render_start = scale_frame(
                window.start_frame,
                stimulus.sample_rate_hz,
                rendered.sample_rate_hz,
            );
            let render_end = scale_frame(
                window.end_frame,
                stimulus.sample_rate_hz,
                rendered.sample_rate_hz,
            );
            let capture_start = render_track_offset
                + scale_frame(
                    render_start,
                    rendered.sample_rate_hz,
                    captured.sample_rate_hz,
                ) as isize
                + delay_capture_frames;
            let capture_len = scale_frame(
                render_end.saturating_sub(render_start),
                rendered.sample_rate_hz,
                captured.sample_rate_hz,
            );
            let captured_window = bounded_window(&captured.samples, capture_start, capture_len);
            let rendered_window = bounded_window(
                &rendered.samples,
                render_start as isize,
                render_end.saturating_sub(render_start),
            );
            let captured_rms = rms(captured_window);
            let signal_power = (captured_rms * captured_rms - ambient_rms * ambient_rms).max(0.0);
            StreamMeasurement {
                name: window.name,
                rendered_rms_dbfs: dbfs(rms(rendered_window)),
                captured_rms_dbfs: dbfs(captured_rms),
                signal_to_ambient_db: 10.0
                    * (signal_power.max(1.0e-12) / (ambient_rms * ambient_rms).max(1.0e-12))
                        .log10(),
            }
        })
        .collect();

    let clipped = captured
        .samples
        .iter()
        .filter(|sample| sample.abs() >= 0.999)
        .count();
    Ok(CalibrationReport {
        estimated_echo_delay_ms,
        correlation,
        ambient_rms_dbfs: dbfs(ambient_rms),
        captured_peak_dbfs: dbfs(
            captured
                .samples
                .iter()
                .fold(0.0_f64, |peak, sample| peak.max(f64::from(sample.abs()))),
        ),
        clipped_fraction: clipped as f64 / captured.samples.len().max(1) as f64,
        streams,
    })
}

fn append_silence(samples: &mut Vec<f32>, rate: u32, duration_ms: u32) {
    samples.resize(samples.len() + frames(rate, duration_ms), 0.0);
}

fn append_prbs(samples: &mut Vec<f32>, rate: u32, duration_ms: u32, amplitude: f32) {
    let count = frames(rate, duration_ms);
    let chip_frames = (rate / 2_000).max(1) as usize;
    let mut state = 0x5a17_3c9d_u32;
    for frame in 0..count {
        if frame.is_multiple_of(chip_frames) {
            let feedback = (state ^ (state >> 2) ^ (state >> 3) ^ (state >> 5)) & 1;
            state = (state >> 1) | (feedback << 31);
        }
        samples.push(if state & 1 == 0 {
            -amplitude
        } else {
            amplitude
        });
    }
}

fn append_chirp(samples: &mut Vec<f32>, rate: u32, duration_ms: u32, amplitude: f32) {
    let count = frames(rate, duration_ms);
    let start_hz = 250.0_f32;
    let end_hz = 6_000.0_f32.min(rate as f32 * 0.4);
    let ratio = end_hz / start_hz;
    let mut phase = 0.0_f32;
    for frame in 0..count {
        let progress = frame as f32 / count.max(1) as f32;
        let frequency = start_hz * ratio.powf(progress);
        phase += TAU * frequency / rate as f32;
        samples.push(phase.sin() * amplitude);
    }
}

fn append_multitone(samples: &mut Vec<f32>, rate: u32, duration_ms: u32, amplitude: f32) {
    let count = frames(rate, duration_ms);
    for frame in 0..count {
        let at = frame as f32 / rate as f32;
        let value = [350.0_f32, 900.0, 1_800.0, 3_600.0]
            .iter()
            .map(|frequency| (TAU * frequency * at).sin())
            .sum::<f32>()
            / 4.0;
        samples.push(value * amplitude);
    }
}

fn apply_edge_fade(samples: &mut [f32], rate: u32, duration_ms: u32) {
    let fade = frames(rate, duration_ms).min(samples.len() / 2);
    for index in 0..fade {
        let gain = index as f32 / fade.max(1) as f32;
        samples[index] *= gain;
        let tail = samples.len() - 1 - index;
        samples[tail] *= gain;
    }
}

fn locate(probe: &[f32], track: &[f32]) -> Option<(usize, f64)> {
    if probe.is_empty() || track.len() < probe.len() {
        return None;
    }
    let probe_mean = probe.iter().map(|value| f64::from(*value)).sum::<f64>() / probe.len() as f64;
    let probe_energy = probe
        .iter()
        .map(|value| (f64::from(*value) - probe_mean).powi(2))
        .sum::<f64>();
    let mut best = None;
    for offset in 0..=track.len() - probe.len() {
        let window = &track[offset..offset + probe.len()];
        let mean = window.iter().map(|value| f64::from(*value)).sum::<f64>() / window.len() as f64;
        let mut covariance = 0.0;
        let mut energy = 0.0;
        for (expected, actual) in probe.iter().zip(window) {
            let expected = f64::from(*expected) - probe_mean;
            let actual = f64::from(*actual) - mean;
            covariance += expected * actual;
            energy += actual * actual;
        }
        let correlation = covariance.abs() / (probe_energy * energy).sqrt().max(1.0e-12);
        if best.is_none_or(|(_, best_correlation)| correlation > best_correlation) {
            best = Some((offset, correlation));
        }
    }
    best
}

fn resample_average(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    let output_len =
        samples.len().saturating_mul(target_rate as usize) / source_rate.max(1) as usize;
    (0..output_len)
        .map(|index| {
            let start = index.saturating_mul(source_rate as usize) / target_rate as usize;
            let end = ((index + 1).saturating_mul(source_rate as usize) / target_rate as usize)
                .max(start + 1)
                .min(samples.len());
            let window = &samples[start.min(samples.len())..end];
            window.iter().sum::<f32>() / window.len().max(1) as f32
        })
        .collect()
}

fn frames(rate: u32, duration_ms: u32) -> usize {
    rate as usize * duration_ms as usize / 1_000
}

fn frames_to_ns(frames: usize, rate: u32) -> u64 {
    (frames as u64).saturating_mul(1_000_000_000) / u64::from(rate.max(1))
}

fn scale_frame(frame: usize, source_rate: u32, target_rate: u32) -> usize {
    frame.saturating_mul(target_rate as usize) / source_rate.max(1) as usize
}

fn bounded_window(samples: &[f32], start: isize, len: usize) -> &[f32] {
    let start = start.max(0) as usize;
    let end = start.saturating_add(len).min(samples.len());
    samples.get(start..end).unwrap_or_default()
}

fn rms(samples: &[f32]) -> f64 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples
        .iter()
        .map(|sample| f64::from(*sample).powi(2))
        .sum::<f64>()
        / samples.len() as f64)
        .sqrt()
}

fn dbfs(value: f64) -> f64 {
    20.0 * value.max(1.0e-12).log10()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_echo_recovers_delay_and_stream_measurements() {
        let rate = 8_000;
        let stimulus = generate_stimulus(rate, -24.0);
        let delay_frames = rate as usize * 83 / 1_000;
        let rendered = TimedMonoTrack {
            samples: stimulus.samples.clone(),
            sample_rate_hz: rate,
            first_frame_ns: 10_000_000,
        };
        let mut microphone = vec![0.0001; delay_frames];
        microphone.extend(stimulus.samples.iter().map(|sample| sample * 0.2 + 0.0001));
        let captured = TimedMonoTrack {
            samples: microphone,
            sample_rate_hz: rate,
            first_frame_ns: 10_000_000,
        };
        let report = analyze_calibration(&stimulus, &rendered, &captured).unwrap();
        assert!((report.estimated_echo_delay_ms - 83.0).abs() <= 1.0);
        assert!(report.correlation > 0.9);
        assert_eq!(report.streams.len(), 3);
        assert!(report
            .streams
            .iter()
            .all(|stream| stream.signal_to_ambient_db > 20.0));
    }
}
