use audioadapter_buffers::direct::InterleavedSlice;
use aven_voice_core::OutputGeneration;
use aven_voice_protocol::TurnId;
use rubato::{
    Async, FixedAsync, Indexing, Resampler, SincInterpolationParameters, SincInterpolationType,
    WindowFunction,
};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use crate::{CancellationToken, RenderChunk, RenderProducer, SynthesizedPcm, MAX_CALLBACK_SAMPLES};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OutputError {
    Cancelled,
    InvalidRate,
    QueueFull,
    StaleGeneration,
}

/// Resample completed model PCM on the non-real-time output worker. State is
/// retained across calls so adjacent segments share one continuous timeline.
const RESAMPLER_CHUNK_FRAMES: usize = 480;
const MAX_RELATIVE_RATIO: f64 = 1.002;

pub struct StreamingSincResampler {
    source_rate_hz: u32,
    resampler: Async<f32>,
    input: Vec<f32>,
    output: Vec<f32>,
    delay_remaining: usize,
    expected_output_frames: f64,
    emitted_output_frames: usize,
}

impl StreamingSincResampler {
    pub fn new(source_rate_hz: u32, output_rate_hz: u32) -> Result<Self, OutputError> {
        if source_rate_hz == 0 || output_rate_hz == 0 {
            return Err(OutputError::InvalidRate);
        }
        let ratio = output_rate_hz as f64 / source_rate_hz as f64;
        let parameters = SincInterpolationParameters::new(128, WindowFunction::Blackman2)
            .oversampling_factor(256)
            .interpolation(SincInterpolationType::Cubic);
        let resampler = Async::<f32>::new_sinc(
            ratio,
            MAX_RELATIVE_RATIO,
            &parameters,
            RESAMPLER_CHUNK_FRAMES,
            1,
            FixedAsync::Input,
        )
        .map_err(|_| OutputError::InvalidRate)?;
        let output_frames_max = resampler.output_frames_max();
        let delay_remaining = resampler.output_delay();
        Ok(Self {
            source_rate_hz,
            resampler,
            input: Vec::with_capacity(RESAMPLER_CHUNK_FRAMES),
            output: vec![0.0; output_frames_max],
            delay_remaining,
            expected_output_frames: 0.0,
            emitted_output_frames: 0,
        })
    }

    pub fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        self.expected_output_frames += input.len() as f64 * self.resampler.resample_ratio();
        let mut offset = 0;
        while offset < input.len() {
            let needed = self.resampler.input_frames_next();
            let take = (needed - self.input.len()).min(input.len() - offset);
            self.input.extend_from_slice(&input[offset..offset + take]);
            offset += take;
            if self.input.len() == needed {
                self.process_buffer(None, output);
                self.input.clear();
            }
        }
    }

    /// Apply a bounded drift correction relative to the nominal device ratio.
    /// Rubato ramps the change over the next chunk, avoiding sample slips.
    pub fn set_relative_ratio(&mut self, relative_ratio: f64) -> Result<(), OutputError> {
        self.resampler
            .as_adjustable()
            .expect("asynchronous sinc resampler is adjustable")
            .set_resample_ratio_relative(relative_ratio, true)
            .map_err(|_| OutputError::InvalidRate)
    }

    /// Drain the filter delay at a true stream boundary. Segment boundaries do
    /// not call this, which keeps adjacent speech segments gapless.
    pub fn flush(&mut self, output: &mut Vec<f32>) {
        let partial = self.input.len();
        if partial > 0 {
            let needed = self.resampler.input_frames_next();
            self.input.resize(needed, 0.0);
            self.process_buffer(Some(partial), output);
            self.input.clear();
        }
        let target = self.expected_output_frames.round() as usize;
        for _ in 0..4 {
            if self.emitted_output_frames >= target {
                break;
            }
            let needed = self.resampler.input_frames_next();
            self.input.resize(needed, 0.0);
            self.process_buffer(Some(0), output);
            self.input.clear();
        }
    }

    pub fn reset(&mut self, source_rate_hz: u32, output_rate_hz: u32) -> Result<(), OutputError> {
        *self = Self::new(source_rate_hz, output_rate_hz)?;
        Ok(())
    }

    fn process_buffer(&mut self, partial_len: Option<usize>, destination: &mut Vec<f32>) {
        let input_frames = self.input.len();
        let output_frames = self.resampler.output_frames_max();
        let input = InterleavedSlice::new(&self.input, 1, input_frames)
            .expect("mono resampler input shape is valid");
        let mut output = InterleavedSlice::new_mut(&mut self.output, 1, output_frames)
            .expect("mono resampler output shape is valid");
        let indexing = Indexing {
            partial_len,
            ..Indexing::default()
        };
        let (_, written) = self
            .resampler
            .process_into_buffer(&input, &mut output, Some(&indexing))
            .expect("prevalidated resampler buffers remain valid");
        let skip = self.delay_remaining.min(written);
        self.delay_remaining -= skip;
        let available = &self.output[skip..written];
        let target = self.expected_output_frames.round() as usize;
        let remaining = target.saturating_sub(self.emitted_output_frames);
        let keep = available.len().min(remaining);
        destination.extend_from_slice(&available[..keep]);
        self.emitted_output_frames += keep;
    }
}

pub struct OutputPreparation {
    output_rate_hz: u32,
    producer: RenderProducer,
    resampler: Option<StreamingSincResampler>,
    active_generation: OutputGeneration,
    buffered_frames: usize,
    maximum_lead_frames: usize,
    pending: VecDeque<RenderChunk>,
    chunk_frames: usize,
}

impl OutputPreparation {
    pub fn new(
        output_rate_hz: u32,
        producer: RenderProducer,
        generation: OutputGeneration,
        maximum_lead_ms: u32,
    ) -> Result<Self, OutputError> {
        if output_rate_hz == 0 {
            return Err(OutputError::InvalidRate);
        }
        let maximum_lead_frames = output_rate_hz as usize * maximum_lead_ms as usize / 1_000;
        let chunk_frames = (output_rate_hz as usize / 100).clamp(1, MAX_CALLBACK_SAMPLES);
        Ok(Self {
            output_rate_hz,
            producer,
            resampler: None,
            active_generation: generation,
            buffered_frames: 0,
            maximum_lead_frames,
            pending: VecDeque::with_capacity(maximum_lead_frames.div_ceil(chunk_frames)),
            chunk_frames,
        })
    }

    pub fn set_generation(&mut self, generation: OutputGeneration) {
        self.active_generation = generation;
        self.buffered_frames = 0;
        self.resampler = None;
        self.pending.clear();
    }

    pub fn prepare(
        &mut self,
        turn_id: &TurnId,
        generation: OutputGeneration,
        mut pcm: SynthesizedPcm,
        cancellation: &CancellationToken,
    ) -> Result<PreparedSegment, OutputError> {
        if cancellation.is_cancelled() {
            return Err(OutputError::Cancelled);
        }
        if generation != self.active_generation {
            return Err(OutputError::StaleGeneration);
        }
        pcm.sanitize();
        if self
            .resampler
            .as_ref()
            .is_none_or(|resampler| resampler.source_rate_hz != pcm.sample_rate_hz)
        {
            self.resampler = Some(StreamingSincResampler::new(
                pcm.sample_rate_hz,
                self.output_rate_hz,
            )?);
        }
        let expected =
            pcm.samples.len() * self.output_rate_hz as usize / pcm.sample_rate_hz as usize + 2;
        let mut samples = Vec::with_capacity(expected);
        self.resampler
            .as_mut()
            .unwrap()
            .process(&pcm.samples, &mut samples);
        if self.buffered_frames + samples.len() > self.maximum_lead_frames {
            return Err(OutputError::QueueFull);
        }
        let frames = samples.len();
        for values in samples.chunks(self.chunk_frames) {
            if cancellation.is_cancelled() {
                return Err(OutputError::Cancelled);
            }
            let chunk = RenderChunk::from_slice(values, generation).expect("bounded output chunk");
            self.pending.push_back(chunk);
        }
        self.buffered_frames += frames;
        self.pump()?;
        Ok(PreparedSegment {
            turn_id: turn_id.clone(),
            generation,
            frames,
        })
    }

    /// Stream a completed model segment into the bounded synthesized lead.
    /// The output worker sleeps on render capacity or cancellation when the
    /// lead is full instead of rejecting long speech or growing memory.
    pub fn prepare_blocking(
        &mut self,
        turn_id: &TurnId,
        generation: OutputGeneration,
        mut pcm: SynthesizedPcm,
        cancellation: &CancellationToken,
    ) -> Result<PreparedSegment, OutputError> {
        if cancellation.is_cancelled() {
            return Err(OutputError::Cancelled);
        }
        if generation != self.active_generation {
            return Err(OutputError::StaleGeneration);
        }
        pcm.sanitize();
        if self
            .resampler
            .as_ref()
            .is_none_or(|resampler| resampler.source_rate_hz != pcm.sample_rate_hz)
        {
            self.resampler = Some(StreamingSincResampler::new(
                pcm.sample_rate_hz,
                self.output_rate_hz,
            )?);
        }
        let capacity = self.producer.capacity_activity();
        let (cancel_tx, cancel_rx) = crossbeam_channel::bounded(1);
        cancellation.register(Arc::new(move || {
            let _ = cancel_tx.try_send(());
        }));
        let result = (|| {
            let mut frames = 0;
            let mut resampled = Vec::with_capacity(
                RESAMPLER_CHUNK_FRAMES * self.output_rate_hz as usize / pcm.sample_rate_hz as usize
                    + 8,
            );
            for input in pcm.samples.chunks(RESAMPLER_CHUNK_FRAMES) {
                if cancellation.is_cancelled() {
                    return Err(OutputError::Cancelled);
                }
                resampled.clear();
                self.resampler
                    .as_mut()
                    .expect("initialized output resampler")
                    .process(input, &mut resampled);
                frames += resampled.len();
                self.enqueue_blocking(&resampled, cancellation, &capacity, &cancel_rx)?;
            }
            Ok(PreparedSegment {
                turn_id: turn_id.clone(),
                generation,
                frames,
            })
        })();
        cancellation.clear_hook();
        result
    }

    pub fn consumed(&mut self, frames: usize) {
        self.buffered_frames = self.buffered_frames.saturating_sub(frames);
    }

    pub fn capacity_activity(&self) -> crossbeam_channel::Receiver<()> {
        self.producer.capacity_activity()
    }

    pub fn service_capacity(&mut self) -> Result<(), OutputError> {
        self.consumed(self.producer.take_consumed_frames());
        self.pump()
    }

    pub fn finish(&mut self) -> Result<(), OutputError> {
        let Some(resampler) = &mut self.resampler else {
            return Ok(());
        };
        let mut samples = Vec::with_capacity(resampler.output.len() * 2);
        resampler.flush(&mut samples);
        if self.buffered_frames + samples.len() > self.maximum_lead_frames {
            return Err(OutputError::QueueFull);
        }
        for values in samples.chunks(self.chunk_frames) {
            let chunk = RenderChunk::from_slice(values, self.active_generation)
                .expect("bounded output chunk");
            self.pending.push_back(chunk);
        }
        self.buffered_frames += samples.len();
        self.pump()
    }

    pub fn finish_blocking(&mut self, cancellation: &CancellationToken) -> Result<(), OutputError> {
        let Some(resampler) = &mut self.resampler else {
            return Ok(());
        };
        let mut samples = Vec::with_capacity(resampler.output.len() * 2);
        resampler.flush(&mut samples);
        let capacity = self.producer.capacity_activity();
        let (cancel_tx, cancel_rx) = crossbeam_channel::bounded(1);
        cancellation.register(Arc::new(move || {
            let _ = cancel_tx.try_send(());
        }));
        let result = self.enqueue_blocking(&samples, cancellation, &capacity, &cancel_rx);
        cancellation.clear_hook();
        result
    }

    pub fn is_empty(&self) -> bool {
        self.buffered_frames == 0 && self.pending.is_empty()
    }

    pub fn buffered_seconds(&self) -> f32 {
        self.buffered_frames as f32 / self.output_rate_hz as f32
    }

    pub fn queued_seconds(&self) -> f32 {
        self.pending
            .iter()
            .map(|chunk| usize::from(chunk.len))
            .sum::<usize>() as f32
            / self.output_rate_hz as f32
    }

    fn pump(&mut self) -> Result<(), OutputError> {
        while self.producer.remaining_chunks() > 0 {
            let Some(chunk) = self.pending.pop_front() else {
                break;
            };
            if let Err(chunk) = self.producer.push(chunk) {
                if chunk.generation != self.active_generation {
                    return Err(OutputError::StaleGeneration);
                }
                self.pending.push_front(chunk);
                break;
            }
        }
        Ok(())
    }

    fn enqueue_blocking(
        &mut self,
        samples: &[f32],
        cancellation: &CancellationToken,
        capacity: &crossbeam_channel::Receiver<()>,
        cancel: &crossbeam_channel::Receiver<()>,
    ) -> Result<(), OutputError> {
        for values in samples.chunks(self.chunk_frames) {
            loop {
                if cancellation.is_cancelled() {
                    return Err(OutputError::Cancelled);
                }
                self.service_capacity()?;
                if self.buffered_frames + values.len() <= self.maximum_lead_frames {
                    break;
                }
                crossbeam_channel::select! {
                    recv(capacity) -> wake => {
                        if wake.is_err() { return Err(OutputError::QueueFull); }
                    },
                    recv(cancel) -> _ => return Err(OutputError::Cancelled),
                }
            }
            self.pending.push_back(
                RenderChunk::from_slice(values, self.active_generation)
                    .expect("bounded output chunk"),
            );
            self.buffered_frames += values.len();
            self.pump()?;
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedSegment {
    pub turn_id: TurnId,
    pub generation: OutputGeneration,
    pub frames: usize,
}

#[derive(Clone, Debug)]
pub struct OutputWork {
    pub turn_id: TurnId,
    pub segment_index: u32,
    pub generation: OutputGeneration,
    pub pcm: SynthesizedPcm,
}

#[derive(Clone, Debug, PartialEq)]
pub enum OutputWorkerEvent {
    Prepared {
        turn_id: TurnId,
        segment_index: u32,
        generation: OutputGeneration,
        frames: usize,
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
        error: OutputError,
    },
    Finished {
        turn_id: TurnId,
        generation: OutputGeneration,
    },
    FinishFailed {
        turn_id: TurnId,
        generation: OutputGeneration,
        error: OutputError,
    },
    Capacity,
}

enum OutputWorkerCommand {
    Prepare(OutputWork),
    Finish(TurnId, OutputGeneration),
    Stop,
}

#[derive(Default)]
struct OutputWorkerLevels {
    queued: AtomicU32,
    buffered: AtomicU32,
    empty: AtomicBool,
}

pub struct OutputWorker {
    commands: crossbeam_channel::Sender<OutputWorkerCommand>,
    events: crossbeam_channel::Receiver<OutputWorkerEvent>,
    active_generation: Arc<AtomicU64>,
    active: Arc<Mutex<Option<CancellationToken>>>,
    levels: Arc<OutputWorkerLevels>,
    shutdown: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl OutputWorker {
    pub fn spawn(
        output_rate_hz: u32,
        producer: RenderProducer,
        generation: OutputGeneration,
        maximum_lead_ms: u32,
    ) -> Result<Self, OutputError> {
        let preparation =
            OutputPreparation::new(output_rate_hz, producer, generation, maximum_lead_ms)?;
        let capacity = preparation.capacity_activity();
        let (commands, command_rx) = crossbeam_channel::bounded(8);
        let (event_tx, events) = crossbeam_channel::bounded(16);
        let active_generation = Arc::new(AtomicU64::new(generation.0));
        let active = Arc::new(Mutex::new(None::<CancellationToken>));
        let levels = Arc::new(OutputWorkerLevels {
            empty: AtomicBool::new(true),
            ..OutputWorkerLevels::default()
        });
        let shutdown = Arc::new(AtomicBool::new(false));
        let thread = std::thread::Builder::new()
            .name("aven-voice-output-preparation".into())
            .spawn({
                let active_generation = Arc::clone(&active_generation);
                let active = Arc::clone(&active);
                let levels = Arc::clone(&levels);
                let shutdown = Arc::clone(&shutdown);
                move || {
                    output_worker_loop(
                        preparation,
                        capacity,
                        command_rx,
                        event_tx,
                        active_generation,
                        active,
                        levels,
                        shutdown,
                    );
                }
            })
            .expect("output preparation worker must start");
        Ok(Self {
            commands,
            events,
            active_generation,
            active,
            levels,
            shutdown,
            thread: Some(thread),
        })
    }

    pub fn enqueue(&self, work: OutputWork) -> Result<(), OutputError> {
        self.commands
            .try_send(OutputWorkerCommand::Prepare(work))
            .map_err(|_| OutputError::QueueFull)
    }

    pub fn finish(&self, turn_id: TurnId, generation: OutputGeneration) -> Result<(), OutputError> {
        self.commands
            .try_send(OutputWorkerCommand::Finish(turn_id, generation))
            .map_err(|_| OutputError::QueueFull)
    }

    /// Generation publication and cancellation bypass the worker command
    /// queue so a full lead cannot delay retirement.
    pub fn set_generation(&self, generation: OutputGeneration) {
        self.active_generation
            .store(generation.0, Ordering::Release);
        self.levels.queued.store(0, Ordering::Release);
        self.levels.buffered.store(0, Ordering::Release);
        self.levels.empty.store(true, Ordering::Release);
        if let Some(token) = self
            .active
            .lock()
            .expect("output cancellation mutex poisoned")
            .as_ref()
        {
            token.cancel();
        }
    }

    pub fn events(&self) -> &crossbeam_channel::Receiver<OutputWorkerEvent> {
        &self.events
    }

    pub fn is_empty(&self) -> bool {
        self.levels.empty.load(Ordering::Acquire)
    }

    pub fn queued_seconds(&self) -> f32 {
        f32::from_bits(self.levels.queued.load(Ordering::Acquire))
    }

    pub fn buffered_seconds(&self) -> f32 {
        f32::from_bits(self.levels.buffered.load(Ordering::Acquire))
    }

    pub fn stop(mut self) {
        self.shutdown.store(true, Ordering::Release);
        self.set_generation(OutputGeneration(u64::MAX));
        let _ = self.commands.send(OutputWorkerCommand::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for OutputWorker {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        self.active_generation.store(u64::MAX, Ordering::Release);
        if let Some(token) = self
            .active
            .lock()
            .expect("output cancellation mutex poisoned")
            .as_ref()
        {
            token.cancel();
        }
        let _ = self.commands.try_send(OutputWorkerCommand::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn output_worker_loop(
    mut preparation: OutputPreparation,
    capacity: crossbeam_channel::Receiver<()>,
    commands: crossbeam_channel::Receiver<OutputWorkerCommand>,
    events: crossbeam_channel::Sender<OutputWorkerEvent>,
    active_generation: Arc<AtomicU64>,
    active: Arc<Mutex<Option<CancellationToken>>>,
    levels: Arc<OutputWorkerLevels>,
    shutdown: Arc<AtomicBool>,
) {
    loop {
        crossbeam_channel::select! {
            recv(commands) -> command => {
                let Ok(command) = command else { break };
                if shutdown.load(Ordering::Acquire) || matches!(command, OutputWorkerCommand::Stop) {
                    break;
                }
                let selected = OutputGeneration(active_generation.load(Ordering::Acquire));
                if preparation.active_generation != selected {
                    preparation.set_generation(selected);
                }
                match command {
                    OutputWorkerCommand::Prepare(work) => {
                        if work.generation != selected {
                            if events.send(OutputWorkerEvent::Cancelled {
                                turn_id: work.turn_id,
                                segment_index: work.segment_index,
                                generation: work.generation,
                            }).is_err() { break; }
                            continue;
                        }
                        let token = CancellationToken::default();
                        *active.lock().expect("output cancellation mutex poisoned") = Some(token.clone());
                        if active_generation.load(Ordering::Acquire) != work.generation.0 {
                            token.cancel();
                        }
                        let result = preparation.prepare_blocking(
                            &work.turn_id,
                            work.generation,
                            work.pcm,
                            &token,
                        );
                        *active.lock().expect("output cancellation mutex poisoned") = None;
                        let selected_after =
                            OutputGeneration(active_generation.load(Ordering::Acquire));
                        if preparation.active_generation != selected_after {
                            preparation.set_generation(selected_after);
                        }
                        update_output_levels(&preparation, &levels);
                        let event = match result {
                            Ok(prepared) => OutputWorkerEvent::Prepared {
                                turn_id: prepared.turn_id,
                                segment_index: work.segment_index,
                                generation: prepared.generation,
                                frames: prepared.frames,
                            },
                            Err(OutputError::Cancelled | OutputError::StaleGeneration) => {
                                OutputWorkerEvent::Cancelled {
                                    turn_id: work.turn_id,
                                    segment_index: work.segment_index,
                                    generation: work.generation,
                                }
                            }
                            Err(error) => OutputWorkerEvent::Failed {
                                turn_id: work.turn_id,
                                segment_index: work.segment_index,
                                generation: work.generation,
                                error,
                            },
                        };
                        if events.send(event).is_err() { break; }
                    }
                    OutputWorkerCommand::Finish(turn_id, generation) => {
                        if generation == selected {
                            let token = CancellationToken::default();
                            *active.lock().expect("output cancellation mutex poisoned") = Some(token.clone());
                            if active_generation.load(Ordering::Acquire) != generation.0 {
                                token.cancel();
                            }
                            let result = preparation.finish_blocking(&token);
                            *active.lock().expect("output cancellation mutex poisoned") = None;
                            let selected_after =
                                OutputGeneration(active_generation.load(Ordering::Acquire));
                            if preparation.active_generation != selected_after {
                                preparation.set_generation(selected_after);
                            }
                            update_output_levels(&preparation, &levels);
                            let event = match result {
                                Ok(()) => OutputWorkerEvent::Finished { turn_id, generation },
                                Err(error) => OutputWorkerEvent::FinishFailed {
                                    turn_id,
                                    generation,
                                    error,
                                },
                            };
                            if events.send(event).is_err() { break; }
                        }
                    }
                    OutputWorkerCommand::Stop => break,
                }
            },
            recv(capacity) -> wake => {
                if wake.is_err() { break; }
                let _ = preparation.service_capacity();
                update_output_levels(&preparation, &levels);
                let _ = events.try_send(OutputWorkerEvent::Capacity);
            }
        }
    }
}

fn update_output_levels(preparation: &OutputPreparation, levels: &OutputWorkerLevels) {
    levels
        .queued
        .store(preparation.queued_seconds().to_bits(), Ordering::Release);
    levels
        .buffered
        .store(preparation.buffered_seconds().to_bits(), Ordering::Release);
    levels
        .empty
        .store(preparation.is_empty(), Ordering::Release);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CallbackTime, RenderPort, TimestampQuality};
    use aven_voice_core::RouteGeneration;

    #[test]
    fn resampling_preserves_duration_within_one_frame() {
        let mut resampler = StreamingSincResampler::new(44_100, 48_000).unwrap();
        let input = vec![0.25; 44_100];
        let mut output = Vec::new();
        resampler.process(&input, &mut output);
        resampler.flush(&mut output);
        assert!(output.len().abs_diff(48_000) <= 1);
    }

    #[test]
    fn ratio_updates_are_bounded_and_preserve_continuity() {
        let mut resampler = StreamingSincResampler::new(48_000, 48_000).unwrap();
        let mut output = Vec::new();
        resampler.process(&[0.25; 960], &mut output);
        resampler.set_relative_ratio(1.000_5).unwrap();
        resampler.process(&[0.25; 960], &mut output);
        resampler.flush(&mut output);
        assert!(output.iter().all(|sample| sample.is_finite()));
        assert!(resampler.set_relative_ratio(1.01).is_err());
    }

    #[test]
    fn stale_or_cancelled_synthesis_never_reaches_render() {
        let (port, producer) = RenderPort::new(8, 8);
        port.activate_route(RouteGeneration(1), OutputGeneration(2));
        let mut preparation =
            OutputPreparation::new(48_000, producer, OutputGeneration(2), 4_000).unwrap();
        let pcm = SynthesizedPcm {
            samples: vec![0.5; 480],
            sample_rate_hz: 48_000,
        };
        let token = CancellationToken::default();
        assert_eq!(
            preparation.prepare(
                &TurnId::parse("turn").unwrap(),
                OutputGeneration(1),
                pcm.clone(),
                &token,
            ),
            Err(OutputError::StaleGeneration)
        );
        token.cancel();
        assert_eq!(
            preparation.prepare(
                &TurnId::parse("turn").unwrap(),
                OutputGeneration(2),
                pcm,
                &token,
            ),
            Err(OutputError::Cancelled)
        );
        let mut output = [9.0; 4];
        port.fill_f32(
            &mut output,
            1,
            CallbackTime {
                callback_at: aven_voice_core::MonoTimeNs(0),
                first_frame_at: None,
                frame_position: None,
                quality: TimestampQuality::CallbackOnly,
            },
            RouteGeneration(1),
        );
        assert_eq!(output, [0.0; 4]);
    }

    #[test]
    fn synthesized_lead_waits_outside_the_device_ready_ring_without_loss() {
        let (port, producer) = RenderPort::new(2, 120);
        port.activate_route(RouteGeneration(1), OutputGeneration(1));
        let mut preparation =
            OutputPreparation::new(48_000, producer, OutputGeneration(1), 4_000).unwrap();
        let frames = 48_000;
        preparation
            .prepare(
                &TurnId::parse("turn").unwrap(),
                OutputGeneration(1),
                SynthesizedPcm {
                    samples: vec![0.25; frames],
                    sample_rate_hz: 48_000,
                },
                &CancellationToken::default(),
            )
            .unwrap();
        preparation.finish().unwrap();

        let callback_time = CallbackTime {
            callback_at: aven_voice_core::MonoTimeNs(0),
            first_frame_at: None,
            frame_position: None,
            quality: TimestampQuality::CallbackOnly,
        };
        let mut rendered = 0;
        for _ in 0..100 {
            let mut output = [0.0; 480];
            port.fill_f32(&mut output, 1, callback_time, RouteGeneration(1));
            rendered += output.iter().filter(|sample| **sample != 0.0).count();
            preparation.service_capacity().unwrap();
        }
        assert_eq!(rendered, frames);
        assert!(preparation.is_empty());
    }

    #[test]
    fn output_worker_streams_segments_longer_than_the_lead_without_rejecting_them() {
        let (port, producer) = RenderPort::new(2, 120);
        let route = RouteGeneration(1);
        let generation = OutputGeneration(3);
        port.activate_route(route, generation);
        let worker = OutputWorker::spawn(48_000, producer, generation, 100).unwrap();
        worker
            .enqueue(OutputWork {
                turn_id: TurnId::parse("long-turn").unwrap(),
                segment_index: 0,
                generation,
                pcm: SynthesizedPcm {
                    samples: vec![0.25; 48_000],
                    sample_rate_hz: 48_000,
                },
            })
            .unwrap();
        let callback_time = CallbackTime {
            callback_at: aven_voice_core::MonoTimeNs(0),
            first_frame_at: None,
            frame_position: None,
            quality: TimestampQuality::CallbackOnly,
        };
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        let mut prepared = false;
        while std::time::Instant::now() < deadline {
            let mut output = [0.0; 480];
            port.fill_f32(&mut output, 1, callback_time, route);
            match worker.events().try_recv() {
                Ok(OutputWorkerEvent::Prepared { .. }) => {
                    prepared = true;
                    break;
                }
                Ok(OutputWorkerEvent::Capacity) | Err(crossbeam_channel::TryRecvError::Empty) => {}
                Ok(other) => panic!("unexpected output event: {other:?}"),
                Err(crossbeam_channel::TryRecvError::Disconnected) => {
                    panic!("output worker stopped")
                }
            }
            std::thread::sleep(std::time::Duration::from_micros(100));
        }
        assert!(prepared);
        assert!(worker.buffered_seconds() <= 0.1);
        worker.stop();
    }

    #[test]
    fn generation_change_wakes_output_worker_blocked_on_lead_capacity() {
        let (port, producer) = RenderPort::new(1, 2);
        let route = RouteGeneration(1);
        let generation = OutputGeneration(1);
        port.activate_route(route, generation);
        let worker = OutputWorker::spawn(48_000, producer, generation, 20).unwrap();
        worker
            .enqueue(OutputWork {
                turn_id: TurnId::parse("cancelled-output").unwrap(),
                segment_index: 0,
                generation,
                pcm: SynthesizedPcm {
                    samples: vec![0.25; 48_000],
                    sample_rate_hz: 48_000,
                },
            })
            .unwrap();
        for _ in 0..100 {
            if worker.buffered_seconds() >= 0.02 {
                break;
            }
            std::thread::yield_now();
        }
        worker.set_generation(OutputGeneration(2));
        assert!(matches!(
            worker
                .events()
                .recv_timeout(std::time::Duration::from_secs(1)),
            Ok(OutputWorkerEvent::Cancelled { .. })
        ));
        assert!(worker.is_empty());
        worker.stop();
    }
}
