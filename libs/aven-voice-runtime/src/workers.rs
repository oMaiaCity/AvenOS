use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use aven_voice_core::OutputGeneration;
use aven_voice_protocol::{TurnId, VoiceErrorCode};
use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};

use crate::{CancellationToken, ModelError, SpeechSynthesizer, SynthesisRequest, SynthesizedPcm};

#[derive(Clone, Debug)]
pub struct TtsWork {
    pub turn_id: TurnId,
    pub segment_index: u32,
    pub generation: OutputGeneration,
    pub request: SynthesisRequest,
}

#[derive(Clone, Debug)]
pub enum TtsWorkerEvent {
    Started {
        turn_id: TurnId,
        segment_index: u32,
        generation: OutputGeneration,
    },
    Completed {
        turn_id: TurnId,
        segment_index: u32,
        generation: OutputGeneration,
        pcm: SynthesizedPcm,
    },
    Cancelled {
        turn_id: TurnId,
        segment_index: u32,
        generation: OutputGeneration,
    },
    Failed {
        turn_id: TurnId,
        segment_index: u32,
        generation: OutputGeneration,
        error: ModelError,
    },
}

enum TtsWorkerCommand {
    Synthesize(TtsWork),
    Stop,
}

struct ActiveTts {
    turn_id: TurnId,
    token: CancellationToken,
}

pub struct TtsWorker {
    commands: Sender<TtsWorkerCommand>,
    events: Receiver<TtsWorkerEvent>,
    active: Arc<Mutex<Option<ActiveTts>>>,
    cancelled: Arc<Mutex<VecDeque<TurnId>>>,
    shutdown: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl TtsWorker {
    pub fn spawn(mut synthesizer: Box<dyn SpeechSynthesizer>) -> Self {
        let (command_tx, command_rx) = bounded(8);
        let (event_tx, event_rx) = bounded(8);
        let active = Arc::new(Mutex::new(None));
        let shutdown = Arc::new(AtomicBool::new(false));
        let cancelled = Arc::new(Mutex::new(VecDeque::<TurnId>::with_capacity(16)));
        let worker_active = Arc::clone(&active);
        let worker_shutdown = Arc::clone(&shutdown);
        let worker_cancelled = Arc::clone(&cancelled);
        let thread = std::thread::Builder::new()
            .name("aven-voice-tts".into())
            .spawn(move || {
                while let Ok(command) = command_rx.recv() {
                    if worker_shutdown.load(Ordering::Acquire) {
                        break;
                    }
                    let TtsWorkerCommand::Synthesize(work) = command else {
                        break;
                    };
                    if worker_cancelled
                        .lock()
                        .expect("TTS cancellation mutex poisoned")
                        .contains(&work.turn_id)
                    {
                        if event_tx
                            .send(TtsWorkerEvent::Cancelled {
                                turn_id: work.turn_id,
                                segment_index: work.segment_index,
                                generation: work.generation,
                            })
                            .is_err()
                        {
                            break;
                        }
                        continue;
                    }
                    let token = CancellationToken::default();
                    *worker_active.lock().expect("TTS active mutex poisoned") = Some(ActiveTts {
                        turn_id: work.turn_id.clone(),
                        token: token.clone(),
                    });
                    if event_tx
                        .send(TtsWorkerEvent::Started {
                            turn_id: work.turn_id.clone(),
                            segment_index: work.segment_index,
                            generation: work.generation,
                        })
                        .is_err()
                    {
                        break;
                    }
                    let result = synthesizer.synthesize(work.request, token.clone());
                    let was_cancelled = token.is_cancelled();
                    {
                        let mut guard = worker_active.lock().expect("TTS active mutex poisoned");
                        if guard
                            .as_ref()
                            .is_some_and(|active| active.turn_id == work.turn_id)
                        {
                            *guard = None;
                        }
                    }
                    let event = if was_cancelled {
                        TtsWorkerEvent::Cancelled {
                            turn_id: work.turn_id,
                            segment_index: work.segment_index,
                            generation: work.generation,
                        }
                    } else {
                        match result {
                            Ok(pcm) => TtsWorkerEvent::Completed {
                                turn_id: work.turn_id,
                                segment_index: work.segment_index,
                                generation: work.generation,
                                pcm,
                            },
                            Err(error) => TtsWorkerEvent::Failed {
                                turn_id: work.turn_id,
                                segment_index: work.segment_index,
                                generation: work.generation,
                                error,
                            },
                        }
                    };
                    if event_tx.send(event).is_err() {
                        break;
                    }
                }
            })
            .expect("TTS worker thread must start");
        Self {
            commands: command_tx,
            events: event_rx,
            active,
            cancelled,
            shutdown,
            thread: Some(thread),
        }
    }

    pub fn enqueue(&self, work: TtsWork) -> Result<(), VoiceErrorCode> {
        self.commands
            .try_send(TtsWorkerCommand::Synthesize(work))
            .map_err(|error| match error {
                TrySendError::Full(_) => VoiceErrorCode::QueueFull,
                TrySendError::Disconnected(_) => VoiceErrorCode::TtsFailed,
            })
    }

    /// Cancels active inference directly; it does not wait behind queued work.
    pub fn cancel(&self, turn_id: Option<&TurnId>) {
        if let Some(turn_id) = turn_id {
            let mut cancelled = self
                .cancelled
                .lock()
                .expect("TTS cancellation mutex poisoned");
            if !cancelled.contains(turn_id) {
                if cancelled.len() == 16 {
                    cancelled.pop_front();
                }
                cancelled.push_back(turn_id.clone());
            }
        }
        let guard = self.active.lock().expect("TTS active mutex poisoned");
        if let Some(active) = guard
            .as_ref()
            .filter(|active| turn_id.is_none_or(|turn| turn == &active.turn_id))
        {
            active.token.cancel();
        }
    }

    pub fn events(&self) -> &Receiver<TtsWorkerEvent> {
        &self.events
    }

    pub fn stop(mut self) {
        self.shutdown.store(true, Ordering::Release);
        self.cancel(None);
        let _ = self.commands.send(TtsWorkerCommand::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for TtsWorker {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        self.cancel(None);
        let _ = self.commands.try_send(TtsWorkerCommand::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::sync::Condvar;

    struct BlockingSynthesizer {
        entered: Arc<(Mutex<bool>, Condvar)>,
    }

    impl SpeechSynthesizer for BlockingSynthesizer {
        fn synthesize(
            &mut self,
            _request: SynthesisRequest,
            cancellation: CancellationToken,
        ) -> Result<SynthesizedPcm, ModelError> {
            let (lock, condition) = &*self.entered;
            *lock.lock().unwrap() = true;
            condition.notify_all();
            let released = Arc::new((Mutex::new(false), Condvar::new()));
            let wake = Arc::clone(&released);
            cancellation.register(Arc::new(move || {
                *wake.0.lock().unwrap() = true;
                wake.1.notify_all();
            }));
            let mut cancelled = released.0.lock().unwrap();
            while !*cancelled {
                cancelled = released.1.wait(cancelled).unwrap();
            }
            Err(ModelError {
                safe_message: "cancelled",
            })
        }
    }

    #[test]
    fn cancellation_wakes_active_inference_without_waiting_for_the_command_queue() {
        let entered = Arc::new((Mutex::new(false), Condvar::new()));
        let worker = TtsWorker::spawn(Box::new(BlockingSynthesizer {
            entered: Arc::clone(&entered),
        }));
        let turn = TurnId::parse("turn").unwrap();
        worker
            .enqueue(TtsWork {
                turn_id: turn.clone(),
                segment_index: 0,
                generation: OutputGeneration(1),
                request: SynthesisRequest {
                    text: "Hallo".into(),
                    language: "de".into(),
                    voice: "M5".into(),
                },
            })
            .unwrap();
        let mut ready = entered.0.lock().unwrap();
        while !*ready {
            ready = entered.1.wait(ready).unwrap();
        }
        drop(ready);
        worker.cancel(Some(&turn));
        assert!(matches!(
            worker.events().recv().unwrap(),
            TtsWorkerEvent::Started { .. }
        ));
        assert!(matches!(
            worker.events().recv().unwrap(),
            TtsWorkerEvent::Cancelled { .. }
        ));
        worker.stop();
    }

    struct CountingBlockingSynthesizer {
        entered: Arc<(Mutex<bool>, Condvar)>,
        calls: Arc<AtomicUsize>,
    }

    impl SpeechSynthesizer for CountingBlockingSynthesizer {
        fn synthesize(
            &mut self,
            _request: SynthesisRequest,
            cancellation: CancellationToken,
        ) -> Result<SynthesizedPcm, ModelError> {
            self.calls.fetch_add(1, Ordering::Relaxed);
            *self.entered.0.lock().unwrap() = true;
            self.entered.1.notify_all();
            let released = Arc::new((Mutex::new(false), Condvar::new()));
            let wake = Arc::clone(&released);
            cancellation.register(Arc::new(move || {
                *wake.0.lock().unwrap() = true;
                wake.1.notify_all();
            }));
            let mut cancelled = released.0.lock().unwrap();
            while !*cancelled {
                cancelled = released.1.wait(cancelled).unwrap();
            }
            Err(ModelError {
                safe_message: "cancelled",
            })
        }
    }

    #[test]
    fn cancellation_skips_queued_segments_for_the_same_turn() {
        let entered = Arc::new((Mutex::new(false), Condvar::new()));
        let calls = Arc::new(AtomicUsize::new(0));
        let worker = TtsWorker::spawn(Box::new(CountingBlockingSynthesizer {
            entered: Arc::clone(&entered),
            calls: Arc::clone(&calls),
        }));
        let turn = TurnId::parse("queued-turn").unwrap();
        for segment_index in 0..2 {
            worker
                .enqueue(TtsWork {
                    turn_id: turn.clone(),
                    segment_index,
                    generation: OutputGeneration(1),
                    request: SynthesisRequest {
                        text: "Hallo".into(),
                        language: "de".into(),
                        voice: "M5".into(),
                    },
                })
                .unwrap();
        }
        let mut ready = entered.0.lock().unwrap();
        while !*ready {
            ready = entered.1.wait(ready).unwrap();
        }
        drop(ready);
        worker.cancel(Some(&turn));
        let events: Vec<_> = (0..3).map(|_| worker.events().recv().unwrap()).collect();
        assert!(matches!(
            events[0],
            TtsWorkerEvent::Started {
                segment_index: 0,
                ..
            }
        ));
        assert!(matches!(
            events[1],
            TtsWorkerEvent::Cancelled {
                segment_index: 0,
                ..
            }
        ));
        assert!(matches!(
            events[2],
            TtsWorkerEvent::Cancelled {
                segment_index: 1,
                ..
            }
        ));
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        worker.stop();
    }
}
use std::collections::VecDeque;
