use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use aven_voice_protocol::CandidateId;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelError {
    pub safe_message: &'static str,
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.safe_message)
    }
}

impl std::error::Error for ModelError {}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RecognizerUpdate {
    pub cumulative_text: String,
    pub final_text: Option<String>,
}

pub trait VoiceActivityDetector: Send {
    fn reset(&mut self);
    fn probability(&mut self, frame: &[f32; 512]) -> Result<f32, ModelError>;
}

impl<T: VoiceActivityDetector + ?Sized> VoiceActivityDetector for Box<T> {
    fn reset(&mut self) {
        (**self).reset();
    }

    fn probability(&mut self, frame: &[f32; 512]) -> Result<f32, ModelError> {
        (**self).probability(frame)
    }
}

pub trait StreamingRecognizer: Send {
    fn begin(&mut self, candidate: &CandidateId) -> Result<(), ModelError>;
    fn push(&mut self, pcm_16k: &[f32]) -> Result<RecognizerUpdate, ModelError>;
    fn finish(&mut self) -> Result<RecognizerUpdate, ModelError>;
    fn cancel(&mut self);
}

impl<T: StreamingRecognizer + ?Sized> StreamingRecognizer for Box<T> {
    fn begin(&mut self, candidate: &CandidateId) -> Result<(), ModelError> {
        (**self).begin(candidate)
    }

    fn push(&mut self, pcm_16k: &[f32]) -> Result<RecognizerUpdate, ModelError> {
        (**self).push(pcm_16k)
    }

    fn finish(&mut self) -> Result<RecognizerUpdate, ModelError> {
        (**self).finish()
    }

    fn cancel(&mut self) {
        (**self).cancel();
    }
}

#[derive(Clone, Debug)]
pub struct SynthesisRequest {
    pub text: String,
    pub language: String,
    pub voice: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthesizedPcm {
    pub samples: Vec<f32>,
    pub sample_rate_hz: u32,
}

impl SynthesizedPcm {
    pub fn sanitize(&mut self) -> u64 {
        let mut replaced = 0;
        for sample in &mut self.samples {
            if !sample.is_finite() {
                *sample = 0.0;
                replaced += 1;
            } else {
                *sample = sample.clamp(-1.0, 1.0);
            }
        }
        replaced
    }
}

struct CancellationInner {
    cancelled: AtomicBool,
    hook: Mutex<Option<Arc<dyn Fn() + Send + Sync>>>,
}

#[derive(Clone)]
pub struct CancellationToken(Arc<CancellationInner>);

impl Default for CancellationToken {
    fn default() -> Self {
        Self(Arc::new(CancellationInner {
            cancelled: AtomicBool::new(false),
            hook: Mutex::new(None),
        }))
    }
}

impl std::fmt::Debug for CancellationToken {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CancellationToken")
            .field("cancelled", &self.is_cancelled())
            .finish_non_exhaustive()
    }
}

impl CancellationToken {
    pub fn cancel(&self) {
        self.0.cancelled.store(true, Ordering::Release);
        let hook = self
            .0
            .hook
            .lock()
            .expect("cancellation hook mutex poisoned")
            .clone();
        if let Some(hook) = hook {
            hook();
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }

    /// Publish a model-specific termination hook. A concurrent earlier cancel
    /// invokes it immediately, closing the registration race.
    pub fn register(&self, hook: Arc<dyn Fn() + Send + Sync>) {
        *self
            .0
            .hook
            .lock()
            .expect("cancellation hook mutex poisoned") = Some(Arc::clone(&hook));
        if self.is_cancelled() {
            hook();
        }
    }

    pub fn clear_hook(&self) {
        *self
            .0
            .hook
            .lock()
            .expect("cancellation hook mutex poisoned") = None;
    }
}

pub trait SpeechSynthesizer: Send {
    fn synthesize(
        &mut self,
        request: SynthesisRequest,
        cancellation: CancellationToken,
    ) -> Result<SynthesizedPcm, ModelError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn cancellation_is_shared_and_lock_free() {
        let first = CancellationToken::default();
        let second = first.clone();
        assert!(!second.is_cancelled());
        first.cancel();
        assert!(second.is_cancelled());
    }

    #[test]
    fn cancellation_terminates_registered_model_work_without_polling() {
        let token = CancellationToken::default();
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&calls);
        token.register(Arc::new(move || {
            observed.fetch_add(1, Ordering::Relaxed);
        }));
        token.cancel();
        assert_eq!(calls.load(Ordering::Relaxed), 1);

        let already_cancelled = CancellationToken::default();
        already_cancelled.cancel();
        let late_calls = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&late_calls);
        already_cancelled.register(Arc::new(move || {
            observed.fetch_add(1, Ordering::Relaxed);
        }));
        assert_eq!(late_calls.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn synthesized_pcm_never_exports_non_finite_audio() {
        let mut pcm = SynthesizedPcm {
            samples: vec![f32::NAN, 2.0, -2.0, 0.5],
            sample_rate_hz: 44_100,
        };
        assert_eq!(pcm.sanitize(), 1);
        assert_eq!(pcm.samples, [0.0, 1.0, -1.0, 0.5]);
    }
}
