//! On-device German text to speech.
//!
//! Supertonic-3 (~99M params, 31 languages) run through ONNX Runtime. Nothing
//! leaves the machine and no API key exists: the models are downloaded once and
//! every synthesis after that is local.
//!
//! Why this and not the alternatives we tried first: Moonshine has no German
//! STT at all and licenses its non-English models non-commercially, and its
//! browser build cannot start Piper (the only vocoder with German) because the
//! WASM binding hands assets from memory while Piper insists on a real
//! directory. FluidAudio wraps these same Supertonic weights in CoreML, but
//! only from Swift — going straight to the upstream ONNX build keeps the whole
//! thing in Rust and works on Linux and Windows too.
//!
//! Measured on this machine (M-series, CPU only, no GPU/ANE): 9.23s of audio
//! synthesized in 2.09s, i.e. ~4.4x realtime. The webview splits replies into
//! sentences, so a sentence lands well inside the gap while the model writes
//! the next one.

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::{Context, Result};
use aven_voice_models::supertonic;

use crate::assets::{cache_dir, ensure_file, ensure_files, stage};

/// Everything the synthesizer needs, published as one HuggingFace revision.
/// `vector_estimator` is by far the largest at ~245 MB.
const MODEL_FILES: &[&str] = &[
	"duration_predictor.onnx",
	"text_encoder.onnx",
	"vector_estimator.onnx",
	"vocoder.onnx",
	"tts.json",
	"unicode_indexer.json",
];

const MODEL_BASE: &str = "https://huggingface.co/Supertone/supertonic-3/resolve/main/onnx";
const VOICE_BASE: &str = "https://huggingface.co/Supertone/supertonic-3/resolve/main/voice_styles";

/// The ten presets Supertonic publishes. Each is a single JSON file fetched on
/// demand, so auditioning one costs ~290 KB rather than another model download.
pub const VOICES: &[&str] = &["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"];

/// M5 — the voice avenOS speaks with.
const DEFAULT_VOICE: &str = "M5";

/// Denoising steps. Upstream's default; lower trades quality for latency.
pub(crate) const TOTAL_STEPS: usize = 8;
/// Upstream's default speaking rate. 0.9-1.5 is the sane range.
pub(crate) const SPEED: f32 = 1.05;
/// Silence inserted between chunks of a long utterance, in seconds.
pub(crate) const CHUNK_SILENCE: f32 = 0.3;

pub(crate) struct Engine {
	tts: supertonic::TextToSpeech,
	/// Styles are cached per voice so switching back to one already auditioned
	/// costs nothing. The ONNX sessions above are shared by all of them.
	styles: HashMap<String, supertonic::Style>,
	dir: PathBuf,
}

impl Engine {
	/// Fetch and decode `voice` if it is not cached yet.
	///
	/// Deliberately returns nothing rather than a reference: the caller reads
	/// `self.styles` and `self.tts` as separate fields, which the borrow checker
	/// allows, whereas handing back a borrow of `self` would not.
	pub(crate) fn ensure_style(&mut self, app: &tauri::AppHandle, voice: &str) -> Result<()> {
		if self.styles.contains_key(voice) {
			return Ok(());
		}
		let path = self.dir.join(format!("{voice}.json"));
		ensure_file(app, "tts", &format!("{VOICE_BASE}/{voice}.json"), &path)?;
		let style = supertonic::load_voice_style(&[path.to_string_lossy().to_string()], false)
			.with_context(|| format!("failed to load voice style {voice}"))?;
		self.styles.insert(voice.to_string(), style);
		Ok(())
	}
}

pub(crate) fn load_engine(app: &tauri::AppHandle) -> Result<Engine> {
	stage(app, "tts", "download");
	let dir = cache_dir(app, "tts", "supertonic-3")?;
	let wanted: Vec<(String, PathBuf)> = MODEL_FILES
		.iter()
		.map(|name| (format!("{MODEL_BASE}/{name}"), dir.join(name)))
		.collect();
	ensure_files(app, "tts", &wanted)?;

	stage(app, "tts", "load");
	let tts = supertonic::load_text_to_speech(&dir.to_string_lossy())
		.context("failed to open the Supertonic ONNX sessions")?;

	let mut engine = Engine {
		tts,
		styles: HashMap::new(),
		dir,
	};
	// Warm the default so the first sentence does not pay for a fetch.
	engine.ensure_style(app, DEFAULT_VOICE)?;
	stage(app, "tts", "ready");
	Ok(engine)
}

pub(crate) fn synthesize_pcm_with_options(
	engine: &mut Engine,
	app: &tauri::AppHandle,
	text: &str,
	lang: &str,
	voice: &str,
	options: &ort::session::RunOptions,
) -> Result<(Vec<f32>, u32)> {
	if !VOICES.contains(&voice) {
		anyhow::bail!("unknown voice");
	}
	if text.trim().is_empty() {
		anyhow::bail!("nothing to say");
	}
	engine.ensure_style(app, voice)?;
	let style = &engine.styles[voice];
	let (samples, _) = engine.tts.call_with_options(
		text,
		lang,
		style,
		TOTAL_STEPS,
		SPEED,
		CHUNK_SILENCE,
		options,
	)?;
	Ok((samples, engine.tts.sample_rate as u32))
}

#[cfg(test)]
mod tests {
	use super::*;

	/// How long does one sentence take to synthesize, per denoising step?
	///
	/// This is the number that decides how quickly a reply starts speaking:
	/// nothing is heard until the first sentence exists as audio, and the cost is
	/// near-constant per sentence rather than proportional to its length. Ignored
	/// by default because it needs the downloaded weights.
	#[test]
	#[ignore = "needs the downloaded models"]
	fn measures_synthesis_latency() {
		let dir = std::env::var("TTS_MODEL_DIR").unwrap_or_else(|_| {
			let home = std::env::var("HOME").unwrap();
			format!("{home}/Library/Caches/ceo.aven.os/tts/supertonic-3")
		});
		let mut tts = supertonic::load_text_to_speech(&dir).expect("models should open");
		let style =
			supertonic::load_voice_style(&[format!("{dir}/{DEFAULT_VOICE}.json")], false).unwrap();

		for steps in [8usize, 4, 3, 2] {
			// First call warms the sessions; report the second.
			for round in 0..2 {
				let started = std::time::Instant::now();
				let (samples, _) = tts
					.call(
						"Klar, einen Moment.",
						"de",
						&style,
						steps,
						SPEED,
						CHUNK_SILENCE,
					)
					.expect("synthesis should work");
				if round == 1 {
					println!(
						"  {steps} steps -> {:.0} ms for {:.2}s of audio",
						started.elapsed().as_secs_f32() * 1000.0,
						samples.len() as f32 / tts.sample_rate as f32
					);
				}
			}
		}
	}
}
