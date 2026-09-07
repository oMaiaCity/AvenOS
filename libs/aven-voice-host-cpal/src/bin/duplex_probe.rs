use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use aven_voice_core::{OutputGeneration, RouteGeneration};
use aven_voice_host_cpal::calibration::{analyze_calibration, generate_stimulus, TimedMonoTrack};
use aven_voice_host_cpal::CpalDuplexHost;
use aven_voice_runtime::{
    AudioPorts, CapturePort, DuplexHost, HostCallbackFaultCode, HostEvent, HostEventPort,
    RenderChunk, RenderPort, RouteRequest, MAX_CALLBACK_SAMPLES,
};

fn main() {
    let mode = parse_mode();
    let generation = RouteGeneration(1);
    let mut host = CpalDuplexHost::new();
    let identity = host.diagnostic_identity();
    let (input, output) = match host.default_route_descriptors() {
        Ok(descriptors) => descriptors,
        Err(error) => fail("describe", &error.to_string()),
    };
    let stimulus = match mode {
        ProbeMode::Silent { .. } => None,
        ProbeMode::Calibrate { level_dbfs } => {
            Some(generate_stimulus(output.sample_rate_hz, level_dbfs))
        }
    };
    let ready_chunks = stimulus
        .as_ref()
        .map(|stimulus| stimulus.samples.len().div_ceil(MAX_CALLBACK_SAMPLES) + 16)
        .unwrap_or(100);
    let capture = CapturePort::new(700, input);
    let (render, producer) = RenderPort::new(ready_chunks, 700);
    render.configure_output_rate(output.sample_rate_hz);
    if let Some(stimulus) = &stimulus {
        for values in stimulus.samples.chunks(MAX_CALLBACK_SAMPLES) {
            let chunk = RenderChunk::from_slice(values, OutputGeneration(0))
                .expect("calibration chunks are non-empty and bounded");
            if producer.push(chunk).is_err() {
                fail(
                    "queue_calibration",
                    "calibration render queue was too small",
                );
            }
        }
        eprintln!(
            "Active calibration starts in two seconds at {:.1} dBFS. Keep the room quiet and do not move the laptop.",
            match mode {
                ProbeMode::Calibrate { level_dbfs } => level_dbfs.clamp(-36.0, -18.0),
                ProbeMode::Silent { .. } => unreachable!(),
            }
        );
        std::thread::sleep(Duration::from_secs(2));
    }
    let events = HostEventPort::new(16, 16);
    let consumer = events.consumer();
    let route = match host.open(
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
    ) {
        Ok(route) => route,
        Err(error) => fail("open", &error.to_string()),
    };
    if let Err(error) = host.start(&route.route_id) {
        fail("start", &error.to_string());
    }

    let duration = stimulus
        .as_ref()
        .map(|stimulus| {
            Duration::from_secs_f64(
                stimulus.samples.len() as f64 / f64::from(stimulus.sample_rate_hz) + 1.0,
            )
        })
        .unwrap_or_else(|| match mode {
            ProbeMode::Silent { duration } => duration,
            ProbeMode::Calibrate { .. } => unreachable!(),
        });
    let deadline = Instant::now() + duration;
    let mut capture_chunks = 0_u64;
    let mut capture_frames = 0_u64;
    let mut render_reference_frames = 0_u64;
    let mut captured_samples = Vec::<f32>::new();
    let mut rendered_samples = Vec::<f32>::new();
    let mut capture_first_frame_ns = None;
    let mut render_first_frame_ns = None;
    let mut callback_faults = BTreeMap::<String, u64>::new();
    let mut fatal_faults = 0_u64;
    while Instant::now() < deadline {
        while let Some(chunk) = capture.pop() {
            capture_chunks += 1;
            capture_frames += u64::from(chunk.len) / u64::from(chunk.channels.max(1));
            if stimulus.is_some() {
                capture_first_frame_ns.get_or_insert(
                    chunk
                        .time
                        .first_frame_at
                        .unwrap_or(chunk.time.callback_at)
                        .0,
                );
                for frame in chunk.samples[..usize::from(chunk.len)]
                    .chunks(usize::from(chunk.channels.max(1)))
                {
                    captured_samples.push(frame.iter().sum::<f32>() / frame.len() as f32);
                }
            }
        }
        while let Some(reference) = render.pop_reference() {
            render_reference_frames += reference.values().len() as u64;
            if stimulus.is_some() {
                render_first_frame_ns.get_or_insert(
                    reference
                        .time
                        .first_frame_at
                        .unwrap_or(reference.time.callback_at)
                        .0,
                );
                rendered_samples.extend_from_slice(reference.values());
            }
        }
        while let Some(event) = consumer.pop() {
            match event {
                HostEvent::CallbackFault {
                    direction,
                    code,
                    count,
                    ..
                } => {
                    *callback_faults
                        .entry(format!("{direction:?}:{code:?}"))
                        .or_default() += count;
                    if !matches!(
                        code,
                        HostCallbackFaultCode::Xrun | HostCallbackFaultCode::RealtimeDenied
                    ) {
                        fatal_faults += count;
                    }
                }
                HostEvent::StreamFault { .. } | HostEvent::RouteInvalidated { .. } => {
                    fatal_faults += 1;
                }
                HostEvent::Started { .. } | HostEvent::DeviceSetChanged => {}
            }
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let _ = host.close(&route.route_id);

    let capture_callbacks = capture.callbacks();
    let expected_capture_frames = input.sample_rate_hz as f64 * duration.as_secs_f64();
    let capture_realtime_ratio = capture_frames as f64 / expected_capture_frames.max(1.0);
    let expected_render_frames = output.sample_rate_hz as f64 * duration.as_secs_f64();
    let render_realtime_ratio = render_reference_frames as f64 / expected_render_frames.max(1.0);
    let route_usable = capture_callbacks > 0
        && (0.8..=1.2).contains(&capture_realtime_ratio)
        && (0.8..=1.2).contains(&render_realtime_ratio)
        && fatal_faults == 0;
    let strict_pass = route_usable && callback_faults.is_empty();
    let callback_faults_json = callback_faults
        .iter()
        .map(|(code, count)| format!("\"{code}\":{count}"))
        .collect::<Vec<_>>()
        .join(",");
    if let Some(stimulus) = &stimulus {
        let Some(capture_first_frame_ns) = capture_first_frame_ns else {
            fail("calibrate", "capture timestamps were unavailable");
        };
        let Some(render_first_frame_ns) = render_first_frame_ns else {
            fail("calibrate", "render timestamps were unavailable");
        };
        let report = match analyze_calibration(
            stimulus,
            &TimedMonoTrack {
                samples: rendered_samples,
                sample_rate_hz: output.sample_rate_hz,
                first_frame_ns: render_first_frame_ns,
            },
            &TimedMonoTrack {
                samples: captured_samples,
                sample_rate_hz: input.sample_rate_hz,
                first_frame_ns: capture_first_frame_ns,
            },
        ) {
            Ok(report) => report,
            Err(error) => fail("calibrate", error),
        };
        let probe_signal_to_ambient_db = report
            .streams
            .iter()
            .find(|stream| stream.name == "prbs")
            .map(|stream| stream.signal_to_ambient_db)
            .unwrap_or(f64::NEG_INFINITY);
        let calibrated = route_usable
            && report.estimated_echo_delay_ms <= 500.0
            && report.correlation >= 0.15
            && probe_signal_to_ambient_db >= 3.0
            && report.clipped_fraction < 0.01;
        let selected_level_dbfs = match mode {
            ProbeMode::Calibrate { level_dbfs } => level_dbfs.clamp(-36.0, -18.0),
            ProbeMode::Silent { .. } => unreachable!(),
        };
        let recommended_delay_hint_ms = report.estimated_echo_delay_ms.round() as u32;
        let streams = report
            .streams
            .iter()
            .map(|stream| format!(
                "{{\"name\":\"{}\",\"rendered_rms_dbfs\":{:.2},\"captured_rms_dbfs\":{:.2},\"signal_to_ambient_db\":{:.2}}}",
                json_escape(stream.name),
                stream.rendered_rms_dbfs,
                stream.captured_rms_dbfs,
                stream.signal_to_ambient_db,
            ))
            .collect::<Vec<_>>()
            .join(",");
        println!(
            "{{\"mode\":\"calibrate\",\"calibrated\":{calibrated},\"route_usable\":{route_usable},\"backend\":\"{}\",\"input_device\":{},\"output_device\":{},\"selected_level_dbfs\":{selected_level_dbfs:.1},\"capture_realtime_ratio\":{capture_realtime_ratio:.3},\"render_realtime_ratio\":{render_realtime_ratio:.3},\"estimated_echo_delay_ms\":{:.2},\"recommended_delay_hint_ms\":{recommended_delay_hint_ms},\"correlation\":{:.4},\"ambient_rms_dbfs\":{:.2},\"captured_peak_dbfs\":{:.2},\"clipped_fraction\":{:.6},\"probe_signal_to_ambient_db\":{probe_signal_to_ambient_db:.2},\"streams\":[{streams}],\"callback_faults\":{{{callback_faults_json}}},\"fatal_faults\":{fatal_faults}}}",
            json_escape(identity.backend),
            json_optional(identity.input_device.as_deref()),
            json_optional(identity.output_device.as_deref()),
            report.estimated_echo_delay_ms,
            report.correlation,
            report.ambient_rms_dbfs,
            report.captured_peak_dbfs,
            report.clipped_fraction,
        );
        if !calibrated {
            std::process::exit(1);
        }
    } else {
        println!(
            "{{\"mode\":\"silent\",\"route_usable\":{route_usable},\"strict_pass\":{strict_pass},\"backend\":\"{}\",\"input_device\":{},\"output_device\":{},\"duration_ms\":{},\"input_rate_hz\":{},\"input_channels\":{},\"output_rate_hz\":{},\"output_channels\":{},\"capture_callbacks\":{capture_callbacks},\"capture_chunks\":{capture_chunks},\"capture_frames\":{capture_frames},\"capture_realtime_ratio\":{capture_realtime_ratio:.3},\"render_reference_frames\":{render_reference_frames},\"render_realtime_ratio\":{render_realtime_ratio:.3},\"callback_faults\":{{{callback_faults_json}}},\"fatal_faults\":{fatal_faults}}}",
            json_escape(identity.backend),
            json_optional(identity.input_device.as_deref()),
            json_optional(identity.output_device.as_deref()),
            duration.as_millis(),
            input.sample_rate_hz,
            input.channels,
            output.sample_rate_hz,
            output.channels,
        );
        if !route_usable {
            std::process::exit(1);
        }
    }
}

#[derive(Clone, Copy)]
enum ProbeMode {
    Silent { duration: Duration },
    Calibrate { level_dbfs: f32 },
}

fn parse_mode() -> ProbeMode {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args
        .first()
        .is_some_and(|argument| argument == "--calibrate")
    {
        let level_dbfs = args
            .windows(2)
            .find(|pair| pair[0] == "--level-dbfs")
            .and_then(|pair| pair[1].parse::<f32>().ok())
            .unwrap_or(-24.0);
        return ProbeMode::Calibrate { level_dbfs };
    }
    let duration = args
        .first()
        .and_then(|value| value.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(Duration::from_secs(15));
    ProbeMode::Silent { duration }
}

fn fail(stage: &str, message: &str) -> ! {
    let escaped = json_escape(message);
    println!(
        "{{\"route_usable\":false,\"strict_pass\":false,\"stage\":\"{stage}\",\"error\":\"{escaped}\"}}"
    );
    std::process::exit(1);
}

fn json_optional(value: Option<&str>) -> String {
    value
        .map(|value| format!("\"{}\"", json_escape(value)))
        .unwrap_or_else(|| "null".into())
}

fn json_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
