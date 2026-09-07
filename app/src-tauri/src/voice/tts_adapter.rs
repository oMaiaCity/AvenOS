use std::sync::Arc;

use aven_voice_runtime::{
	CancellationToken, ModelError, SpeechSynthesizer, SynthesisRequest, SynthesizedPcm,
};
use ort::session::RunOptions;

pub struct SupertonicSynthesizerAdapter {
	app: tauri::AppHandle,
	engine: crate::tts::Engine,
}

impl SupertonicSynthesizerAdapter {
	pub fn open(app: tauri::AppHandle) -> anyhow::Result<Self> {
		let engine = crate::tts::load_engine(&app)?;
		Ok(Self { app, engine })
	}
}

impl SpeechSynthesizer for SupertonicSynthesizerAdapter {
	fn synthesize(
		&mut self,
		request: SynthesisRequest,
		cancellation: CancellationToken,
	) -> Result<SynthesizedPcm, ModelError> {
		if cancellation.is_cancelled() {
			return Err(ModelError {
				safe_message: "Speech synthesis was cancelled.",
			});
		}
		let options = Arc::new(RunOptions::new().map_err(|_| ModelError {
			safe_message: "Speech synthesis could not start.",
		})?);
		let terminator = Arc::clone(&options);
		cancellation.register(Arc::new(move || {
			let _ = terminator.terminate();
		}));
		let result = crate::tts::synthesize_pcm_with_options(
			&mut self.engine,
			&self.app,
			&request.text,
			&request.language,
			&request.voice,
			&options,
		);
		cancellation.clear_hook();
		if cancellation.is_cancelled() {
			return Err(ModelError {
				safe_message: "Speech synthesis was cancelled.",
			});
		}
		let (samples, sample_rate_hz) = result.map_err(|_| ModelError {
			safe_message: "Speech synthesis failed.",
		})?;
		Ok(SynthesizedPcm {
			samples,
			sample_rate_hz,
		})
	}
}
