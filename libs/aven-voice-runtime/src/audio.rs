use aven_voice_core::{MonoTimeNs, OutputGeneration, RouteGeneration};

pub const PROCESSING_RATE_HZ: u32 = 48_000;
pub const PROCESSING_CHANNELS: usize = 1;
pub const PROCESSING_FRAME_MS: u32 = 10;
pub const PROCESSING_FRAME_SAMPLES: usize = 480;
pub const ASR_RATE_HZ: u32 = 16_000;
pub const VAD_WINDOW_SAMPLES: usize = 512;
pub const ASR_CHUNK_SAMPLES: usize = 8_960;
pub const ASR_PREROLL_SAMPLES: usize = 8_192;

/// Maximum scalar samples stored in one callback slot. Larger callbacks are
/// split into multiple preallocated values by the port.
pub const MAX_CALLBACK_SAMPLES: usize = 4_096;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TimestampQuality {
    Hardware,
    HostEstimated,
    CallbackOnly,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CallbackTime {
    pub callback_at: MonoTimeNs,
    pub first_frame_at: Option<MonoTimeNs>,
    pub frame_position: Option<i64>,
    pub quality: TimestampQuality,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AudioFormat {
    pub sample_rate_hz: u32,
    pub channels: u16,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioFrame48k(pub [f32; PROCESSING_FRAME_SAMPLES]);

impl Default for AudioFrame48k {
    fn default() -> Self {
        Self([0.0; PROCESSING_FRAME_SAMPLES])
    }
}

impl AudioFrame48k {
    pub fn sanitize(&mut self) -> u32 {
        let mut replaced = 0;
        for sample in &mut self.0 {
            if !sample.is_finite() {
                *sample = 0.0;
                replaced += 1;
            } else {
                *sample = sample.clamp(-1.0, 1.0);
            }
        }
        replaced
    }

    pub fn rms(&self) -> f32 {
        (self.0.iter().map(|sample| sample * sample).sum::<f32>() / PROCESSING_FRAME_SAMPLES as f32)
            .sqrt()
    }

    pub fn peak(&self) -> f32 {
        self.0
            .iter()
            .fold(0.0_f32, |peak, sample| peak.max(sample.abs()))
    }
}

#[derive(Clone, Debug)]
pub struct AudioChunk {
    pub samples: [f32; MAX_CALLBACK_SAMPLES],
    pub len: u16,
    pub channels: u16,
    pub time: CallbackTime,
    pub route: RouteGeneration,
}

impl AudioChunk {
    pub fn silence(time: CallbackTime, route: RouteGeneration) -> Self {
        Self {
            samples: [0.0; MAX_CALLBACK_SAMPLES],
            len: 0,
            channels: 1,
            time,
            route,
        }
    }

    pub fn values(&self) -> &[f32] {
        &self.samples[..usize::from(self.len)]
    }
}

#[derive(Clone, Debug)]
pub struct RenderChunk {
    pub samples: [f32; MAX_CALLBACK_SAMPLES],
    pub len: u16,
    pub generation: OutputGeneration,
}

impl RenderChunk {
    pub fn from_slice(samples: &[f32], generation: OutputGeneration) -> Option<Self> {
        if samples.is_empty() || samples.len() > MAX_CALLBACK_SAMPLES {
            return None;
        }
        let mut chunk = Self {
            samples: [0.0; MAX_CALLBACK_SAMPLES],
            len: samples.len() as u16,
            generation,
        };
        for (output, input) in chunk.samples.iter_mut().zip(samples) {
            *output = if input.is_finite() {
                input.clamp(-1.0, 1.0)
            } else {
                0.0
            };
        }
        Some(chunk)
    }
}

#[derive(Clone, Debug)]
pub struct ReferenceChunk {
    pub samples: [f32; MAX_CALLBACK_SAMPLES],
    pub len: u16,
    pub time: CallbackTime,
    pub route: RouteGeneration,
}

impl ReferenceChunk {
    pub fn values(&self) -> &[f32] {
        &self.samples[..usize::from(self.len)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_replace_non_finite_samples_and_clamp_host_values() {
        let mut frame = AudioFrame48k::default();
        frame.0[0] = f32::NAN;
        frame.0[1] = f32::INFINITY;
        frame.0[2] = 2.0;
        assert_eq!(frame.sanitize(), 2);
        assert_eq!(&frame.0[..3], &[0.0, 0.0, 1.0]);
    }
}
