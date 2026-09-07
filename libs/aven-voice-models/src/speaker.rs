//! WeSpeaker ResNet34 ONNX speaker embeddings.
//!
//! The frontend mirrors WeSpeaker's published inference path: 16 kHz mono PCM,
//! 25 ms Hamming-windowed Kaldi-style filterbanks at a 10 ms shift, 80 mel
//! bins, and per-utterance cepstral mean normalization. Inference stays on the
//! blocking native input worker.

use std::f32::consts::PI;

use anyhow::{Context, Result};
use aven_voice_runtime::{ModelError, SpeakerEmbedder};
use ndarray::Array3;
use ort::{session::Session, value::Value};
use rustfft::{num_complex::Complex, Fft, FftPlanner};

pub const MODEL_URL: &str = "https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34/resolve/main/voxceleb_resnet34.onnx?download=true";
pub const MODEL_FILE: &str = "voxceleb_resnet34.onnx";
pub const MODEL_SHA256: &str = "9fea6516d7ad6bf0a76c7689f5a49b65d330fad6dde96c91bb4435ffbfe056a1";

const SAMPLE_RATE: usize = 16_000;
const FRAME_SAMPLES: usize = 400;
const FRAME_SHIFT: usize = 160;
const FFT_SIZE: usize = 512;
const MEL_BINS: usize = 80;
const PREEMPHASIS: f32 = 0.97;

pub struct WeSpeakerEmbedder {
    session: Session,
    frontend: FbankFrontend,
}

impl WeSpeakerEmbedder {
    pub fn open(model_path: &std::path::Path) -> Result<Self> {
        let session = Session::builder()?
            .with_intra_threads(1)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .with_inter_threads(1)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .with_intra_op_spinning(false)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .with_inter_op_spinning(false)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .commit_from_file(model_path)
            .context("failed to open the WeSpeaker embedding model")?;
        Ok(Self {
            session,
            frontend: FbankFrontend::new(),
        })
    }
}

impl SpeakerEmbedder for WeSpeakerEmbedder {
    fn embedding(&mut self, pcm_16k: &[f32]) -> Result<Vec<f32>, ModelError> {
        let (frames, features) = self.frontend.compute(pcm_16k);
        if frames == 0 {
            return Err(ModelError {
                safe_message: "There was not enough speech for speaker detection.",
            });
        }
        let input =
            Array3::from_shape_vec((1, frames, MEL_BINS), features).map_err(|_| ModelError {
                safe_message: "Speaker features could not be prepared.",
            })?;
        let outputs = self
            .session
            .run(ort::inputs! {
                "feats" => &Value::from_array(input).map_err(|_| ModelError {
                    safe_message: "Speaker features could not be loaded.",
                })?
            })
            .map_err(|_| ModelError {
                safe_message: "Speaker detection failed.",
            })?;
        let (_, embedding) =
            outputs["embs"]
                .try_extract_tensor::<f32>()
                .map_err(|_| ModelError {
                    safe_message: "Speaker detection returned an invalid result.",
                })?;
        Ok(embedding.to_vec())
    }
}

struct FbankFrontend {
    fft: std::sync::Arc<dyn Fft<f32>>,
    window: [f32; FRAME_SAMPLES],
    filters: Vec<Vec<f32>>,
}

impl FbankFrontend {
    fn new() -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let window = std::array::from_fn(|index| {
            0.54 - 0.46 * (2.0 * PI * index as f32 / (FRAME_SAMPLES - 1) as f32).cos()
        });
        Self {
            fft,
            window,
            filters: mel_filters(),
        }
    }

    fn compute(&self, pcm: &[f32]) -> (usize, Vec<f32>) {
        if pcm.len() < FRAME_SAMPLES {
            return (0, Vec::new());
        }
        let frames = 1 + (pcm.len() - FRAME_SAMPLES) / FRAME_SHIFT;
        let mut features = Vec::with_capacity(frames * MEL_BINS);
        let mut spectrum = vec![Complex::new(0.0, 0.0); FFT_SIZE];
        for frame_index in 0..frames {
            let offset = frame_index * FRAME_SHIFT;
            let source = &pcm[offset..offset + FRAME_SAMPLES];
            let mean = source.iter().sum::<f32>() / FRAME_SAMPLES as f32;
            spectrum.fill(Complex::new(0.0, 0.0));
            let mut previous = (source[0] - mean) * 32_768.0;
            for index in 0..FRAME_SAMPLES {
                let current = (source[index] - mean) * 32_768.0;
                let emphasized = if index == 0 {
                    current * (1.0 - PREEMPHASIS)
                } else {
                    current - PREEMPHASIS * previous
                };
                spectrum[index].re = emphasized * self.window[index];
                previous = current;
            }
            self.fft.process(&mut spectrum);
            for filter in &self.filters {
                let energy = filter
                    .iter()
                    .zip(&spectrum[..=FFT_SIZE / 2])
                    .map(|(weight, value)| weight * value.norm_sqr())
                    .sum::<f32>();
                features.push(energy.max(f32::EPSILON).ln());
            }
        }
        for bin in 0..MEL_BINS {
            let mean = (0..frames)
                .map(|frame| features[frame * MEL_BINS + bin])
                .sum::<f32>()
                / frames as f32;
            for frame in 0..frames {
                features[frame * MEL_BINS + bin] -= mean;
            }
        }
        (frames, features)
    }
}

fn mel_filters() -> Vec<Vec<f32>> {
    let low_mel = hz_to_mel(20.0);
    let high_mel = hz_to_mel(SAMPLE_RATE as f32 / 2.0);
    let points = (0..MEL_BINS + 2)
        .map(|index| {
            let mel = low_mel + (high_mel - low_mel) * index as f32 / (MEL_BINS + 1) as f32;
            mel_to_hz(mel)
        })
        .collect::<Vec<_>>();
    (0..MEL_BINS)
        .map(|filter| {
            let left = points[filter];
            let center = points[filter + 1];
            let right = points[filter + 2];
            (0..=FFT_SIZE / 2)
                .map(|bin| {
                    let hz = bin as f32 * SAMPLE_RATE as f32 / FFT_SIZE as f32;
                    if hz <= left || hz >= right {
                        0.0
                    } else if hz < center {
                        (hz - left) / (center - left)
                    } else {
                        (right - hz) / (right - center)
                    }
                })
                .collect()
        })
        .collect()
}

fn hz_to_mel(hz: f32) -> f32 {
    1_127.0 * (1.0 + hz / 700.0).ln()
}

fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (mel / 1_127.0).exp_m1()
}

#[cfg(test)]
mod tests {
    use super::*;
    use aven_voice_runtime::{CancellationToken, StreamingSincResampler};

    #[test]
    fn frontend_matches_published_window_shape_and_cmn() {
        let pcm = (0..24_000)
            .map(|sample| (2.0 * PI * 220.0 * sample as f32 / SAMPLE_RATE as f32).sin() * 0.1)
            .collect::<Vec<_>>();
        let (frames, features) = FbankFrontend::new().compute(&pcm);
        assert_eq!(frames, 148);
        assert_eq!(features.len(), frames * MEL_BINS);
        assert!(features.iter().all(|value| value.is_finite()));
        for bin in 0..MEL_BINS {
            let mean = (0..frames)
                .map(|frame| features[frame * MEL_BINS + bin])
                .sum::<f32>()
                / frames as f32;
            assert!(mean.abs() < 1.0e-3, "bin {bin} mean was {mean}");
        }
    }

    #[test]
    fn silence_is_finite_and_zero_after_mean_normalization() {
        let (frames, features) = FbankFrontend::new().compute(&vec![0.0; 16_000]);
        assert!(frames > 0);
        assert!(features.iter().all(|value| value.abs() < 1.0e-6));
    }

    #[test]
    #[ignore = "needs downloaded WeSpeaker and Supertonic models"]
    fn real_model_separates_two_synthetic_speakers() {
        let runtime = std::env::var("ORT_DYLIB_PATH").expect("set ORT_DYLIB_PATH");
        crate::initialize_onnxruntime(std::path::Path::new(&runtime)).unwrap();
        let model = std::env::var("SPEAKER_MODEL").expect("set SPEAKER_MODEL");
        let tts = std::env::var("TTS_MODEL_DIR").expect("set TTS_MODEL_DIR");
        let mut synthesizer =
            crate::DirectSupertonicSynthesizer::open(std::path::Path::new(&tts), &["F3", "M3"])
                .unwrap();
        let first = synthesizer
            .synthesize(
                "Kannst du mir die Termine für morgen zeigen?",
                "de",
                "F3",
                &CancellationToken::default(),
            )
            .unwrap();
        let same = synthesizer
            .synthesize(
                "Danach möchte ich noch die wichtigsten Aufgaben sehen.",
                "de",
                "F3",
                &CancellationToken::default(),
            )
            .unwrap();
        let different = synthesizer
            .synthesize(
                "Kannst du mir die Termine für morgen zeigen?",
                "de",
                "M3",
                &CancellationToken::default(),
            )
            .unwrap();
        let to_16k = |pcm: aven_voice_runtime::SynthesizedPcm| {
            let mut resampler = StreamingSincResampler::new(pcm.sample_rate_hz, 16_000).unwrap();
            let mut samples = Vec::new();
            resampler.process(&pcm.samples, &mut samples);
            resampler.flush(&mut samples);
            samples
        };
        let mut embedder = WeSpeakerEmbedder::open(std::path::Path::new(&model)).unwrap();
        let first = embedder.embedding(&to_16k(first)).unwrap();
        let same = embedder.embedding(&to_16k(same)).unwrap();
        let different = embedder.embedding(&to_16k(different)).unwrap();
        let similarity = |left: &[f32], right: &[f32]| {
            let dot = left.iter().zip(right).map(|(a, b)| a * b).sum::<f32>();
            let left_norm = left.iter().map(|value| value * value).sum::<f32>().sqrt();
            let right_norm = right.iter().map(|value| value * value).sum::<f32>().sqrt();
            dot / (left_norm * right_norm)
        };
        let same_score = similarity(&first, &same);
        let different_score = similarity(&first, &different);
        println!("same={same_score:.3} different={different_score:.3}");
        assert_eq!(first.len(), 256);
        assert!(same_score > different_score + 0.1);
    }
}
