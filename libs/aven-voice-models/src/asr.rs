use aven_voice_protocol::CandidateId;
use aven_voice_runtime::{
    ModelError, RecognizerUpdate, StreamingRecognizer, VoiceActivityDetector, ASR_CHUNK_SAMPLES,
};
use parakeet_rs::{ExecutionConfig, Nemotron, NemotronMode};

pub struct SileroVadAdapter(pub crate::vad::Vad);

impl VoiceActivityDetector for SileroVadAdapter {
    fn reset(&mut self) {
        self.0.reset();
    }

    fn probability(&mut self, frame: &[f32; 512]) -> Result<f32, ModelError> {
        self.0.predict(frame).map_err(|_| ModelError {
            safe_message: "Voice activity detection failed.",
        })
    }
}

pub struct NemotronRecognizerAdapter {
    model: Nemotron,
    active: Option<CandidateId>,
    peak: f32,
    target_peak: f32,
    max_gain: f32,
    flush_silence: Box<[f32; ASR_CHUNK_SAMPLES]>,
    chunk_index: u64,
}

impl NemotronRecognizerAdapter {
    pub fn open(
        model_dir: &std::path::Path,
        target_peak: f32,
        max_gain: f32,
    ) -> anyhow::Result<Self> {
        let execution = ExecutionConfig::default().with_custom_configure(|builder| {
            Ok(builder
                .with_intra_op_spinning(false)?
                .with_inter_op_spinning(false)?)
        });
        let mut model = Nemotron::from_pretrained(model_dir, Some(execution))?;
        if model.mode() != NemotronMode::Multilingual {
            anyhow::bail!("the multilingual recognizer model is required");
        }
        model.set_target_lang("de-DE")?;
        Ok(Self {
            model,
            active: None,
            peak: 0.0,
            target_peak,
            max_gain,
            flush_silence: Box::new([0.0; ASR_CHUNK_SAMPLES]),
            chunk_index: 0,
        })
    }

    fn normalized(&mut self, samples: &[f32]) -> Vec<f32> {
        self.peak = samples
            .iter()
            .fold(self.peak, |peak, sample| peak.max(sample.abs()));
        let gain = (self.target_peak / self.peak.max(1.0e-4)).min(self.max_gain);
        samples
            .iter()
            .map(|sample| (sample * gain).clamp(-1.0, 1.0))
            .collect()
    }

    fn update(&self, final_text: Option<String>) -> RecognizerUpdate {
        RecognizerUpdate {
            cumulative_text: self.model.get_transcript(),
            final_text,
        }
    }
}

impl StreamingRecognizer for NemotronRecognizerAdapter {
    fn begin(&mut self, candidate: &CandidateId) -> Result<(), ModelError> {
        self.model.reset();
        self.active = Some(candidate.clone());
        self.peak = 0.0;
        self.chunk_index = 0;
        log::debug!("ASR candidate {} began", candidate.as_str());
        Ok(())
    }

    fn push(&mut self, pcm_16k: &[f32]) -> Result<RecognizerUpdate, ModelError> {
        if self.active.is_none() || pcm_16k.len() != ASR_CHUNK_SAMPLES {
            return Err(ModelError {
                safe_message: "The recognizer received an invalid streaming chunk.",
            });
        }
        let normalized = self.normalized(pcm_16k);
        let started = std::time::Instant::now();
        self.model
            .transcribe_chunk(&normalized)
            .map_err(|_| ModelError {
                safe_message: "Speech recognition failed.",
            })?;
        self.chunk_index += 1;
        log::debug!(
            "ASR chunk {} processed {} ms of audio in {} ms; transcript={:?}",
            self.chunk_index,
            ASR_CHUNK_SAMPLES * 1_000 / 16_000,
            started.elapsed().as_millis(),
            self.model.get_transcript(),
        );
        Ok(self.update(None))
    }

    fn finish(&mut self) -> Result<RecognizerUpdate, ModelError> {
        if self.active.is_none() {
            return Err(ModelError {
                safe_message: "No recognition candidate is active.",
            });
        }
        let started = std::time::Instant::now();
        for _ in 0..3 {
            self.model
                .transcribe_chunk(&self.flush_silence[..])
                .map_err(|_| ModelError {
                    safe_message: "Speech recognition failed while finalizing.",
                })?;
        }
        self.active = None;
        let text = self.model.get_transcript();
        log::debug!(
            "ASR finalization processed {} ms of flush audio in {} ms; transcript={text:?}",
            ASR_CHUNK_SAMPLES * 3 * 1_000 / 16_000,
            started.elapsed().as_millis(),
        );
        Ok(self.update(Some(text)))
    }

    fn cancel(&mut self) {
        self.active = None;
        self.peak = 0.0;
        self.model.reset();
    }
}

#[cfg(test)]
mod real_model_tests {
    use super::*;
    use std::path::PathBuf;

    fn model_dir() -> PathBuf {
        std::env::var_os("ASR_MODEL_DIR")
            .map(PathBuf::from)
            .expect("set ASR_MODEL_DIR to the downloaded Nemotron model directory")
    }

    fn vad_path() -> PathBuf {
        std::env::var_os("ASR_VAD_MODEL")
            .map(PathBuf::from)
            .expect("set ASR_VAD_MODEL to silero_vad.onnx")
    }

    fn wav_16k() -> Vec<f32> {
        let path = std::env::var("ASR_TEST_WAV").expect("set ASR_TEST_WAV");
        let mut reader = hound::WavReader::open(path).expect("test WAV should open");
        let spec = reader.spec();
        let source: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Float => reader.samples::<f32>().map(Result::unwrap).collect(),
            hound::SampleFormat::Int => reader
                .samples::<i16>()
                .map(|sample| f32::from(sample.unwrap()) / 32_768.0)
                .collect(),
        };
        let mono: Vec<f32> = source
            .chunks(usize::from(spec.channels))
            .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
            .collect();
        let ratio = spec.sample_rate as f64 / 16_000.0;
        let output_len = (mono.len() as f64 / ratio) as usize;
        (0..output_len)
            .map(|index| mono[((index as f64 * ratio) as usize).min(mono.len() - 1)])
            .collect()
    }

    #[test]
    #[ignore = "needs downloaded ASR models"]
    fn measures_recognizer_load_time() {
        let started = std::time::Instant::now();
        NemotronRecognizerAdapter::open(&model_dir(), 0.7, 8.0).expect("recognizer should open");
        println!(
            "recognizer cold open: {:.2}s",
            started.elapsed().as_secs_f32()
        );
    }

    #[test]
    #[ignore = "needs the downloaded VAD model"]
    fn loads_silero_model() {
        let _adapter =
            SileroVadAdapter(crate::vad::Vad::open(&vad_path()).expect("VAD should open"));
    }

    #[test]
    #[ignore = "needs downloaded VAD model and ASR_TEST_WAV"]
    fn silero_detects_known_speech() {
        let mut vad =
            SileroVadAdapter(crate::vad::Vad::open(&vad_path()).expect("VAD should open"));
        let audio = wav_16k();
        let maximum = audio
            .chunks_exact(512)
            .map(|window| {
                let frame: &[f32; 512] = window.try_into().unwrap();
                vad.probability(frame).expect("VAD inference should work")
            })
            .fold(0.0_f32, f32::max);
        assert!(maximum >= 0.5, "maximum VAD probability was {maximum:.3}");
    }

    #[test]
    #[ignore = "needs downloaded ASR models and ASR_TEST_WAV"]
    fn transcribes_a_known_recording_through_the_streaming_adapter() {
        let mut recognizer = NemotronRecognizerAdapter::open(&model_dir(), 0.7, 8.0)
            .expect("recognizer should open");
        recognizer
            .begin(&CandidateId::parse("real-model-fixture").unwrap())
            .unwrap();
        let audio = wav_16k();
        for chunk in audio.chunks(ASR_CHUNK_SAMPLES) {
            let mut padded = vec![0.0; ASR_CHUNK_SAMPLES];
            padded[..chunk.len()].copy_from_slice(chunk);
            recognizer
                .push(&padded)
                .expect("streaming chunk should transcribe");
        }
        let final_text = recognizer
            .finish()
            .expect("recognizer should finalize")
            .final_text
            .unwrap_or_default();
        println!("recognized: {final_text:?}");
        assert!(!final_text.trim().is_empty(), "recognizer returned no text");
    }
}
