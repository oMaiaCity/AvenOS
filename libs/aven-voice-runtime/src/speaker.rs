use crate::ModelError;

pub const SPEAKER_SAMPLE_RATE_HZ: usize = 16_000;
pub const MIN_SPEAKER_SAMPLES: usize = SPEAKER_SAMPLE_RATE_HZ * 4 / 5;
pub const TARGET_SPEAKER_SAMPLES: usize = SPEAKER_SAMPLE_RATE_HZ * 3 / 2;
pub const MAX_SPEAKER_SAMPLES: usize = SPEAKER_SAMPLE_RATE_HZ * 3;

/// Model seam for local speaker embeddings. Implementations run only on the
/// blocking input worker and never on an audio callback.
pub trait SpeakerEmbedder: Send {
    fn embedding(&mut self, pcm_16k: &[f32]) -> Result<Vec<f32>, ModelError>;
}

impl<T: SpeakerEmbedder + ?Sized> SpeakerEmbedder for Box<T> {
    fn embedding(&mut self, pcm_16k: &[f32]) -> Result<Vec<f32>, ModelError> {
        (**self).embedding(pcm_16k)
    }
}

/// Remove VAD pre-roll and trailing hangover before speaker inference while
/// retaining a small acoustic margin. The returned slice is bounded to the
/// most recent three seconds.
pub fn speaker_window(pcm: &[f32]) -> Option<&[f32]> {
    const LEVEL_FRAME: usize = SPEAKER_SAMPLE_RATE_HZ / 50;
    const MARGIN: usize = SPEAKER_SAMPLE_RATE_HZ / 10;
    if pcm.len() < LEVEL_FRAME {
        return None;
    }
    let levels = pcm
        .chunks(LEVEL_FRAME)
        .map(|frame| {
            (frame.iter().map(|sample| sample * sample).sum::<f32>() / frame.len() as f32).sqrt()
        })
        .collect::<Vec<_>>();
    let maximum = levels.iter().copied().fold(0.0_f32, f32::max);
    let threshold = (maximum * 0.1).max(0.0005);
    let first = levels.iter().position(|level| *level >= threshold)?;
    let last = levels.iter().rposition(|level| *level >= threshold)? + 1;
    let speech_start = (first * LEVEL_FRAME).saturating_sub(MARGIN);
    let speech_end = (last * LEVEL_FRAME + MARGIN).min(pcm.len());
    if speech_end - speech_start < MIN_SPEAKER_SAMPLES {
        return None;
    }
    let start = speech_start.max(speech_end.saturating_sub(MAX_SPEAKER_SAMPLES));
    Some(&pcm[start..speech_end])
}

pub fn normalize_speaker_embedding(values: &mut [f32]) -> bool {
    if values.is_empty() || values.iter().any(|value| !value.is_finite()) {
        return false;
    }
    let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm <= f32::EPSILON {
        return false;
    }
    for value in values {
        *value /= norm;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_padding_is_trimmed_to_a_bounded_speech_window() {
        let mut padded = vec![0.0; 8_000];
        padded.extend(vec![0.1; 16_000]);
        padded.extend(vec![0.0; 8_000]);
        assert_eq!(speaker_window(&padded).unwrap().len(), 19_200);
    }

    #[test]
    fn short_silence_and_invalid_embeddings_are_rejected() {
        assert!(speaker_window(&[0.0; 1_000]).is_none());
        assert!(!normalize_speaker_embedding(&mut [f32::NAN, 0.0]));
        assert!(!normalize_speaker_embedding(&mut [0.0, 0.0]));
    }
}
