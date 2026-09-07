use std::collections::VecDeque;

use aven_voice_core::VoiceConfigV1;
use aven_voice_protocol::CandidateId;

use crate::{
    ModelError, RecognizerUpdate, StreamingRecognizer, VoiceActivityDetector, ASR_CHUNK_SAMPLES,
    ASR_PREROLL_SAMPLES, VAD_WINDOW_SAMPLES,
};

const MAX_PENDING_ASR_SAMPLES: usize = ASR_PREROLL_SAMPLES + ASR_CHUNK_SAMPLES * 3;

#[derive(Clone, Debug, PartialEq)]
pub enum InputModelEvent {
    CandidateStarted {
        candidate_id: CandidateId,
        peak: f32,
    },
    Partial {
        candidate_id: CandidateId,
        text: String,
    },
    Ended {
        candidate_id: CandidateId,
        text: String,
    },
    DiscardedOverflow {
        candidate_id: CandidateId,
    },
    ModelFailed {
        candidate_id: Option<CandidateId>,
        error: ModelError,
    },
}

/// The model-owned input pipeline. It is synchronous by design and is called
/// only from the blocking input worker.
pub struct InputProcessor<V, R> {
    config: VoiceConfigV1,
    vad: V,
    recognizer: R,
    vad_window: [f32; VAD_WINDOW_SAMPLES],
    vad_len: usize,
    preroll: VecDeque<f32>,
    asr_pending: VecDeque<f32>,
    candidate: Option<CandidateId>,
    speech_windows: u32,
    silence_windows: u32,
    peak: f32,
    partial: String,
    last_vad_probability: f32,
}

impl<V: VoiceActivityDetector, R: StreamingRecognizer> InputProcessor<V, R> {
    pub fn new(config: VoiceConfigV1, vad: V, recognizer: R) -> Self {
        Self {
            config,
            vad,
            recognizer,
            vad_window: [0.0; VAD_WINDOW_SAMPLES],
            vad_len: 0,
            preroll: VecDeque::with_capacity(ASR_PREROLL_SAMPLES),
            asr_pending: VecDeque::with_capacity(MAX_PENDING_ASR_SAMPLES),
            candidate: None,
            speech_windows: 0,
            silence_windows: 0,
            peak: 0.0,
            partial: String::new(),
            last_vad_probability: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.recognizer.cancel();
        self.vad.reset();
        self.vad_len = 0;
        self.preroll.clear();
        self.asr_pending.clear();
        self.candidate = None;
        self.speech_windows = 0;
        self.silence_windows = 0;
        self.peak = 0.0;
        self.partial.clear();
        self.last_vad_probability = 0.0;
    }

    pub fn candidate_id(&self) -> Option<&CandidateId> {
        self.candidate.as_ref()
    }

    pub fn last_vad_probability(&self) -> f32 {
        self.last_vad_probability
    }

    pub fn overflow(&mut self) -> Option<InputModelEvent> {
        let candidate_id = self.candidate.take()?;
        self.recognizer.cancel();
        self.asr_pending.clear();
        self.speech_windows = 0;
        self.silence_windows = 0;
        self.partial.clear();
        Some(InputModelEvent::DiscardedOverflow { candidate_id })
    }

    pub fn into_models(self) -> (V, R) {
        (self.vad, self.recognizer)
    }

    pub fn push_clean_16k(
        &mut self,
        samples: &[f32],
        mut next_candidate: impl FnMut() -> CandidateId,
    ) -> Vec<InputModelEvent> {
        let mut events = Vec::new();
        for &raw_sample in samples {
            let sample = if raw_sample.is_finite() {
                raw_sample.clamp(-1.0, 1.0)
            } else {
                0.0
            };
            self.peak = self.peak.max(sample.abs());
            if self.preroll.len() == ASR_PREROLL_SAMPLES {
                self.preroll.pop_front();
            }
            self.preroll.push_back(sample);
            self.vad_window[self.vad_len] = sample;
            self.vad_len += 1;
            if self.candidate.is_some() && self.asr_pending.len() < MAX_PENDING_ASR_SAMPLES {
                self.asr_pending.push_back(sample);
            }
            if self.candidate.is_some() && self.asr_pending.len() == MAX_PENDING_ASR_SAMPLES {
                let candidate_id = self.candidate.take().unwrap();
                self.recognizer.cancel();
                self.asr_pending.clear();
                events.push(InputModelEvent::DiscardedOverflow { candidate_id });
            }
            if self.vad_len == VAD_WINDOW_SAMPLES {
                self.vad_len = 0;
                match self.vad.probability(&self.vad_window) {
                    Ok(probability) => {
                        self.last_vad_probability = probability;
                        self.handle_vad(probability, &mut next_candidate, &mut events)
                    }
                    Err(error) => {
                        let candidate_id = self.candidate.take();
                        self.recognizer.cancel();
                        events.push(InputModelEvent::ModelFailed {
                            candidate_id,
                            error,
                        });
                    }
                }
            }
            self.drain_asr(&mut events);
        }
        events
    }

    fn handle_vad(
        &mut self,
        probability: f32,
        next_candidate: &mut impl FnMut() -> CandidateId,
        events: &mut Vec<InputModelEvent>,
    ) {
        if probability >= self.config.speech_threshold {
            self.speech_windows += 1;
            self.silence_windows = 0;
            if self.candidate.is_none() && self.speech_windows >= self.config.start_windows {
                let candidate_id = next_candidate();
                if let Err(error) = self.recognizer.begin(&candidate_id) {
                    events.push(InputModelEvent::ModelFailed {
                        candidate_id: Some(candidate_id),
                        error,
                    });
                    self.speech_windows = 0;
                    return;
                }
                self.candidate = Some(candidate_id.clone());
                self.asr_pending.clear();
                self.asr_pending.extend(self.preroll.iter().copied());
                events.push(InputModelEvent::CandidateStarted {
                    candidate_id,
                    peak: self.peak,
                });
            }
        } else {
            self.speech_windows = 0;
            if self.candidate.is_some() {
                self.silence_windows += 1;
                if self.silence_windows >= self.config.end_windows {
                    self.finish(events);
                }
            }
        }
    }

    fn drain_asr(&mut self, events: &mut Vec<InputModelEvent>) {
        while self.candidate.is_some() && self.asr_pending.len() >= ASR_CHUNK_SAMPLES {
            let chunk: Vec<f32> = self.asr_pending.drain(..ASR_CHUNK_SAMPLES).collect();
            match self.recognizer.push(&chunk) {
                Ok(update) => self.publish_update(update, false, events),
                Err(error) => {
                    let candidate_id = self.candidate.take();
                    self.recognizer.cancel();
                    self.asr_pending.clear();
                    events.push(InputModelEvent::ModelFailed {
                        candidate_id,
                        error,
                    });
                }
            }
        }
    }

    fn finish(&mut self, events: &mut Vec<InputModelEvent>) {
        let Some(candidate_id) = self.candidate.clone() else {
            return;
        };
        if !self.asr_pending.is_empty() {
            let mut tail: Vec<f32> = self.asr_pending.drain(..).collect();
            tail.resize(ASR_CHUNK_SAMPLES, 0.0);
            match self.recognizer.push(&tail) {
                Ok(update) => self.publish_update(update, false, events),
                Err(error) => {
                    self.candidate = None;
                    events.push(InputModelEvent::ModelFailed {
                        candidate_id: Some(candidate_id),
                        error,
                    });
                    return;
                }
            }
        }
        match self.recognizer.finish() {
            Ok(update) => self.publish_update(update, true, events),
            Err(error) => events.push(InputModelEvent::ModelFailed {
                candidate_id: Some(candidate_id),
                error,
            }),
        }
        self.candidate = None;
        self.silence_windows = 0;
        self.peak = 0.0;
        self.partial.clear();
    }

    fn publish_update(
        &mut self,
        update: RecognizerUpdate,
        final_update: bool,
        events: &mut Vec<InputModelEvent>,
    ) {
        let Some(candidate_id) = self.candidate.clone() else {
            return;
        };
        if update.cumulative_text != self.partial {
            self.partial = update.cumulative_text.clone();
            events.push(InputModelEvent::Partial {
                candidate_id: candidate_id.clone(),
                text: update.cumulative_text,
            });
        }
        if final_update {
            events.push(InputModelEvent::Ended {
                candidate_id,
                text: update.final_text.unwrap_or_else(|| self.partial.clone()),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeVad {
        values: VecDeque<f32>,
    }

    impl VoiceActivityDetector for FakeVad {
        fn reset(&mut self) {}
        fn probability(&mut self, _frame: &[f32; 512]) -> Result<f32, ModelError> {
            Ok(self.values.pop_front().unwrap_or(0.0))
        }
    }

    #[derive(Default)]
    struct FakeRecognizer {
        pushes: Vec<usize>,
        cancelled: bool,
    }

    impl StreamingRecognizer for FakeRecognizer {
        fn begin(&mut self, _candidate: &CandidateId) -> Result<(), ModelError> {
            Ok(())
        }
        fn push(&mut self, pcm_16k: &[f32]) -> Result<RecognizerUpdate, ModelError> {
            self.pushes.push(pcm_16k.len());
            Ok(RecognizerUpdate {
                cumulative_text: "Hallo".into(),
                final_text: None,
            })
        }
        fn finish(&mut self) -> Result<RecognizerUpdate, ModelError> {
            Ok(RecognizerUpdate {
                cumulative_text: "Hallo".into(),
                final_text: Some("Hallo Welt".into()),
            })
        }
        fn cancel(&mut self) {
            self.cancelled = true;
        }
    }

    #[test]
    fn two_vad_windows_start_candidate_without_semantic_interruption() {
        let vad = FakeVad {
            values: VecDeque::from([0.9, 0.9]),
        };
        let mut input =
            InputProcessor::new(VoiceConfigV1::default(), vad, FakeRecognizer::default());
        let events = input.push_clean_16k(&[0.25; 1_024], || {
            CandidateId::parse("candidate-1").unwrap()
        });
        assert!(events
            .iter()
            .any(|event| matches!(event, InputModelEvent::CandidateStarted { .. })));
        assert!(!events
            .iter()
            .any(|event| matches!(event, InputModelEvent::Ended { .. })));
    }

    #[test]
    fn recognizer_only_receives_exact_streaming_chunks_and_padded_tail() {
        let mut probabilities = VecDeque::from([0.9, 0.9]);
        probabilities.extend(std::iter::repeat_n(0.0, 28));
        let vad = FakeVad {
            values: probabilities,
        };
        let mut input =
            InputProcessor::new(VoiceConfigV1::default(), vad, FakeRecognizer::default());
        let events = input.push_clean_16k(&[0.1; 512 * 30], || {
            CandidateId::parse("candidate-1").unwrap()
        });
        assert!(input
            .recognizer
            .pushes
            .iter()
            .all(|size| *size == ASR_CHUNK_SAMPLES));
        assert!(events.iter().any(
            |event| matches!(event, InputModelEvent::Ended { text, .. } if text == "Hallo Welt")
        ));
    }

    #[test]
    fn input_overflow_cancels_and_discards_the_open_candidate() {
        let vad = FakeVad {
            values: VecDeque::from([0.9, 0.9]),
        };
        let mut input =
            InputProcessor::new(VoiceConfigV1::default(), vad, FakeRecognizer::default());
        input.push_clean_16k(&[0.25; 1_024], || {
            CandidateId::parse("overflow-candidate").unwrap()
        });
        assert!(matches!(
            input.overflow(),
            Some(InputModelEvent::DiscardedOverflow { candidate_id })
                if candidate_id.as_str() == "overflow-candidate"
        ));
        assert!(input.recognizer.cancelled);
        assert!(input.candidate_id().is_none());
    }
}
