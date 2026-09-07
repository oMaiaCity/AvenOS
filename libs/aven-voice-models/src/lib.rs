//! Reusable local speech-model adapters shared by the app and standalone labs.

pub mod asr;
pub mod speaker;
pub mod supertonic;
pub mod tts;
pub mod vad;

pub use asr::{NemotronRecognizerAdapter, SileroVadAdapter};
pub use speaker::WeSpeakerEmbedder;
pub use tts::DirectSupertonicSynthesizer;

/// Install the ONNX Runtime used by all local speech models before opening a
/// session. Linux deliberately loads the same manylinux-compatible shared
/// runtime that the desktop app bundles.
#[cfg(target_os = "linux")]
pub fn initialize_onnxruntime(path: &std::path::Path) -> anyhow::Result<()> {
    if !path.is_file() {
        anyhow::bail!(
            "ONNX Runtime shared library not found at {}",
            path.display()
        );
    }
    ort::init_from(path)?
        .with_name("avenos-voice-lab")
        .with_telemetry(false)
        .commit();
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn initialize_onnxruntime(_path: &std::path::Path) -> anyhow::Result<()> {
    ort::init()
        .with_name("avenos-voice-lab")
        .with_telemetry(false)
        .commit();
    Ok(())
}
