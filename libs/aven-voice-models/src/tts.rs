use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use aven_voice_runtime::{
    CancellationToken, ModelError, SpeechSynthesizer, SynthesisRequest, SynthesizedPcm,
};
use ort::session::RunOptions;

use crate::supertonic;

const TOTAL_STEPS: usize = 8;
const SPEED: f32 = 1.05;
const CHUNK_SILENCE: f32 = 0.3;

/// Supertonic loaded directly from an existing model directory. Unlike the app
/// adapter this has no Tauri handle, download layer, or UI lifecycle, so it can
/// be used by standalone hardware verification tools.
pub struct DirectSupertonicSynthesizer {
    model: supertonic::TextToSpeech,
    styles: HashMap<String, supertonic::Style>,
    model_dir: PathBuf,
}

impl DirectSupertonicSynthesizer {
    pub fn open(model_dir: &Path, voices: &[&str]) -> anyhow::Result<Self> {
        let model = supertonic::load_text_to_speech(&model_dir.to_string_lossy())?;
        let mut styles = HashMap::new();
        for voice in voices {
            let path = model_dir.join(format!("{voice}.json"));
            let style =
                supertonic::load_voice_style(&[path.to_string_lossy().into_owned()], false)?;
            styles.insert((*voice).to_owned(), style);
        }
        Ok(Self {
            model,
            styles,
            model_dir: model_dir.to_owned(),
        })
    }

    pub fn ensure_voice(&mut self, voice: &str) -> anyhow::Result<()> {
        if self.styles.contains_key(voice) {
            return Ok(());
        }
        let path = self.model_dir.join(format!("{voice}.json"));
        let style = supertonic::load_voice_style(&[path.to_string_lossy().into_owned()], false)?;
        self.styles.insert(voice.to_owned(), style);
        Ok(())
    }

    pub fn synthesize(
        &mut self,
        text: &str,
        language: &str,
        voice: &str,
        cancellation: &CancellationToken,
    ) -> anyhow::Result<SynthesizedPcm> {
        self.ensure_voice(voice)?;
        if cancellation.is_cancelled() {
            anyhow::bail!("synthesis cancelled");
        }
        let options = Arc::new(RunOptions::new()?);
        let terminator = Arc::clone(&options);
        cancellation.register(Arc::new(move || {
            let _ = terminator.terminate();
        }));
        let result = self.model.call_with_options(
            text,
            language,
            &self.styles[voice],
            TOTAL_STEPS,
            SPEED,
            CHUNK_SILENCE,
            &options,
        );
        cancellation.clear_hook();
        let (samples, _) = result?;
        if cancellation.is_cancelled() {
            anyhow::bail!("synthesis cancelled");
        }
        Ok(SynthesizedPcm {
            samples,
            sample_rate_hz: self.model.sample_rate as u32,
        })
    }
}

impl SpeechSynthesizer for DirectSupertonicSynthesizer {
    fn synthesize(
        &mut self,
        request: SynthesisRequest,
        cancellation: CancellationToken,
    ) -> Result<SynthesizedPcm, ModelError> {
        DirectSupertonicSynthesizer::synthesize(
            self,
            &request.text,
            &request.language,
            &request.voice,
            &cancellation,
        )
        .map_err(|_| ModelError {
            safe_message: "Speech synthesis failed.",
        })
    }
}
