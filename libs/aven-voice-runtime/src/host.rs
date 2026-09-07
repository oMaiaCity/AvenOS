use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use aven_voice_core::{MonoTimeNs, OutputGeneration, RouteGeneration};
use aven_voice_protocol::{RouteId, SessionId};
use crossbeam_channel::{bounded, Receiver, Sender};

use crate::{
    AudioChunk, BoundedRing, CallbackTime, ReferenceChunk, RenderChunk, TimestampQuality,
    MAX_CALLBACK_SAMPLES,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostSampleFormat {
    Float { bits: u8 },
    SignedInteger { bits: u8 },
    UnsignedInteger { bits: u8 },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StreamDescriptor {
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub sample_format: HostSampleFormat,
    pub nominal_callback_frames: Option<u32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OpaqueDevicePreference(pub String);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureConditioning {
    Raw,
    ExternallyProcessed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouteDescriptor {
    pub route_id: RouteId,
    pub generation: RouteGeneration,
    pub input: StreamDescriptor,
    pub output: StreamDescriptor,
    pub input_timestamp_quality: TimestampQuality,
    pub output_timestamp_quality: TimestampQuality,
    pub capture_conditioning: CaptureConditioning,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouteRequest {
    pub generation: RouteGeneration,
    pub preferred_input: Option<OpaqueDevicePreference>,
    pub preferred_output: Option<OpaqueDevicePreference>,
    pub require_duplex: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StreamDirection {
    Capture,
    Render,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostFaultCode {
    DeviceUnavailable,
    StreamInvalidated,
    Backend,
    CallbackStalled,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum HostCallbackFaultCode {
    DeviceBusy,
    DeviceChanged,
    DeviceNotAvailable,
    HostUnavailable,
    InvalidInput,
    PermissionDenied,
    RealtimeDenied,
    ResourceExhausted,
    StreamInvalidated,
    UnsupportedConfig,
    UnsupportedOperation,
    Xrun,
    Backend,
    Other,
}

impl HostCallbackFaultCode {
    const ALL: [Self; 14] = [
        Self::DeviceBusy,
        Self::DeviceChanged,
        Self::DeviceNotAvailable,
        Self::HostUnavailable,
        Self::InvalidInput,
        Self::PermissionDenied,
        Self::RealtimeDenied,
        Self::ResourceExhausted,
        Self::StreamInvalidated,
        Self::UnsupportedConfig,
        Self::UnsupportedOperation,
        Self::Xrun,
        Self::Backend,
        Self::Other,
    ];

    const fn index(self) -> usize {
        self as usize
    }

    pub const fn requires_route_rebuild(self) -> bool {
        !matches!(self, Self::Xrun | Self::RealtimeDenied)
    }

    pub const fn recoverable(self) -> bool {
        !matches!(
            self,
            Self::InvalidInput | Self::UnsupportedConfig | Self::UnsupportedOperation | Self::Other
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RouteInvalidationReason {
    DeviceRemoved,
    FormatChanged,
    Environment,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HostEvent {
    Started {
        route: RouteId,
        generation: RouteGeneration,
    },
    StreamFault {
        route: RouteId,
        generation: RouteGeneration,
        direction: StreamDirection,
        code: HostFaultCode,
        recoverable: bool,
    },
    RouteInvalidated {
        route: RouteId,
        generation: RouteGeneration,
        reason: RouteInvalidationReason,
    },
    CallbackFault {
        route: RouteId,
        generation: RouteGeneration,
        direction: StreamDirection,
        code: HostCallbackFaultCode,
        count: u64,
    },
    DeviceSetChanged,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostError {
    pub code: HostFaultCode,
    pub user_message: String,
    pub recoverable: bool,
}

impl std::fmt::Display for HostError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.user_message)
    }
}

impl std::error::Error for HostError {}

#[derive(Clone)]
pub struct HostEventPort {
    critical: BoundedRing<HostEvent>,
    normal: BoundedRing<HostEvent>,
    device_changed: Arc<AtomicBool>,
    critical_overflow: Arc<AtomicBool>,
    callback_fault_capture: Arc<[AtomicU64; HostCallbackFaultCode::ALL.len()]>,
    callback_fault_render: Arc<[AtomicU64; HostCallbackFaultCode::ALL.len()]>,
    callback_fault_generation: Arc<AtomicU64>,
    bound_route: Arc<Mutex<Option<RouteId>>>,
    wake_tx: Sender<()>,
    wake_rx: Receiver<()>,
}

impl HostEventPort {
    pub fn new(critical_capacity: usize, normal_capacity: usize) -> Self {
        let (wake_tx, wake_rx) = bounded(1);
        Self {
            critical: BoundedRing::new(critical_capacity),
            normal: BoundedRing::new(normal_capacity),
            device_changed: Arc::new(AtomicBool::new(false)),
            critical_overflow: Arc::new(AtomicBool::new(false)),
            callback_fault_capture: Arc::new(std::array::from_fn(|_| AtomicU64::new(0))),
            callback_fault_render: Arc::new(std::array::from_fn(|_| AtomicU64::new(0))),
            callback_fault_generation: Arc::new(AtomicU64::new(0)),
            bound_route: Arc::new(Mutex::new(None)),
            wake_tx,
            wake_rx,
        }
    }

    pub fn bind_route(&self, route: RouteId) {
        *self.bound_route.lock().expect("host route mutex poisoned") = Some(route);
    }

    /// Callback-safe fault publication: atomics only. The coordinator adds the
    /// bound route identity when it consumes the observation.
    pub fn publish_callback_fault(
        &self,
        generation: RouteGeneration,
        direction: StreamDirection,
        code: HostCallbackFaultCode,
    ) {
        self.callback_fault_generation
            .store(generation.0.saturating_add(1), Ordering::Release);
        let counters = match direction {
            StreamDirection::Capture => &self.callback_fault_capture,
            StreamDirection::Render => &self.callback_fault_render,
        };
        counters[code.index()].fetch_add(1, Ordering::Relaxed);
        let _ = self.wake_tx.try_send(());
    }

    pub fn publish(&self, event: HostEvent) {
        match event {
            HostEvent::DeviceSetChanged => self.device_changed.store(true, Ordering::Release),
            critical @ (HostEvent::StreamFault { .. } | HostEvent::RouteInvalidated { .. }) => {
                if self.critical.push(critical).is_err() {
                    self.critical_overflow.store(true, Ordering::Release);
                }
            }
            ordinary => {
                let _ = self.normal.push_overwrite_oldest(ordinary);
            }
        }
        let _ = self.wake_tx.try_send(());
    }

    pub fn pop(&self) -> Option<HostEvent> {
        self.critical
            .pop()
            .or_else(|| self.pop_callback_fault(StreamDirection::Capture))
            .or_else(|| self.pop_callback_fault(StreamDirection::Render))
            .or_else(|| self.normal.pop())
            .or_else(|| {
                self.device_changed
                    .swap(false, Ordering::AcqRel)
                    .then_some(HostEvent::DeviceSetChanged)
            })
    }

    pub fn critical_overflowed(&self) -> bool {
        self.critical_overflow.load(Ordering::Acquire)
    }

    pub fn consumer(&self) -> HostEventConsumer {
        HostEventConsumer {
            critical: self.critical.clone(),
            normal: self.normal.clone(),
            device_changed: Arc::clone(&self.device_changed),
            critical_overflow: Arc::clone(&self.critical_overflow),
            callback_fault_capture: Arc::clone(&self.callback_fault_capture),
            callback_fault_render: Arc::clone(&self.callback_fault_render),
            callback_fault_generation: Arc::clone(&self.callback_fault_generation),
            bound_route: Arc::clone(&self.bound_route),
            wake_rx: self.wake_rx.clone(),
        }
    }

    fn pop_callback_fault(&self, direction: StreamDirection) -> Option<HostEvent> {
        callback_fault_event(
            direction,
            &self.callback_fault_capture,
            &self.callback_fault_render,
            &self.callback_fault_generation,
            &self.bound_route,
        )
    }
}

pub struct HostEventConsumer {
    critical: BoundedRing<HostEvent>,
    normal: BoundedRing<HostEvent>,
    device_changed: Arc<AtomicBool>,
    critical_overflow: Arc<AtomicBool>,
    callback_fault_capture: Arc<[AtomicU64; HostCallbackFaultCode::ALL.len()]>,
    callback_fault_render: Arc<[AtomicU64; HostCallbackFaultCode::ALL.len()]>,
    callback_fault_generation: Arc<AtomicU64>,
    bound_route: Arc<Mutex<Option<RouteId>>>,
    wake_rx: Receiver<()>,
}

impl HostEventConsumer {
    pub fn recv(&self) -> Option<HostEvent> {
        loop {
            if let Some(event) = self.pop() {
                return Some(event);
            }
            self.wake_rx.recv().ok()?;
        }
    }

    pub fn pop(&self) -> Option<HostEvent> {
        self.critical
            .pop()
            .or_else(|| self.pop_callback_fault(StreamDirection::Capture))
            .or_else(|| self.pop_callback_fault(StreamDirection::Render))
            .or_else(|| self.normal.pop())
            .or_else(|| {
                self.device_changed
                    .swap(false, Ordering::AcqRel)
                    .then_some(HostEvent::DeviceSetChanged)
            })
    }

    pub fn critical_overflowed(&self) -> bool {
        self.critical_overflow.load(Ordering::Acquire)
    }

    pub fn take_critical_overflowed(&self) -> bool {
        self.critical_overflow.swap(false, Ordering::AcqRel)
    }

    fn pop_callback_fault(&self, direction: StreamDirection) -> Option<HostEvent> {
        callback_fault_event(
            direction,
            &self.callback_fault_capture,
            &self.callback_fault_render,
            &self.callback_fault_generation,
            &self.bound_route,
        )
    }
}

fn callback_fault_event(
    direction: StreamDirection,
    capture: &[AtomicU64; HostCallbackFaultCode::ALL.len()],
    render: &[AtomicU64; HostCallbackFaultCode::ALL.len()],
    generation: &AtomicU64,
    bound_route: &Mutex<Option<RouteId>>,
) -> Option<HostEvent> {
    let counters = match direction {
        StreamDirection::Capture => capture,
        StreamDirection::Render => render,
    };
    let (code, count) = HostCallbackFaultCode::ALL.iter().find_map(|code| {
        let count = counters[code.index()].swap(0, Ordering::AcqRel);
        (count > 0).then_some((*code, count))
    })?;
    let generation = RouteGeneration(generation.load(Ordering::Acquire).saturating_sub(1));
    bound_route
        .lock()
        .expect("host route mutex poisoned")
        .clone()
        .map(|route| HostEvent::CallbackFault {
            route,
            generation,
            direction,
            code,
            count,
        })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureWriteStatus {
    Accepted,
    DroppedStaleRoute,
    DroppedInvalidLayout,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CaptureWrite {
    pub status: CaptureWriteStatus,
    pub accepted_chunks: u16,
    pub overwritten_chunks: u16,
    pub non_finite_samples: u32,
}

#[derive(Clone)]
pub struct CapturePort {
    ring: BoundedRing<AudioChunk>,
    active_route: Arc<AtomicU64>,
    expected_channels: u16,
    sample_rate_hz: u32,
    overruns: Arc<AtomicU64>,
    callbacks: Arc<AtomicU64>,
    discontinuity: Arc<AtomicBool>,
    activity_tx: Sender<MonoTimeNs>,
    activity_rx: Receiver<MonoTimeNs>,
}

impl CapturePort {
    pub fn new(capacity_chunks: usize, descriptor: StreamDescriptor) -> Self {
        let (activity_tx, activity_rx) = bounded(1);
        Self {
            ring: BoundedRing::new(capacity_chunks),
            active_route: Arc::new(AtomicU64::new(u64::MAX)),
            expected_channels: descriptor.channels,
            sample_rate_hz: descriptor.sample_rate_hz,
            overruns: Arc::new(AtomicU64::new(0)),
            callbacks: Arc::new(AtomicU64::new(0)),
            discontinuity: Arc::new(AtomicBool::new(false)),
            activity_tx,
            activity_rx,
        }
    }

    pub fn activate(&self, route: RouteGeneration) {
        self.active_route.store(route.0, Ordering::Release);
    }

    pub fn deactivate(&self) {
        self.active_route.store(u64::MAX, Ordering::Release);
    }

    pub fn write_f32(
        &self,
        interleaved: &[f32],
        channels: u16,
        time: CallbackTime,
        route: RouteGeneration,
    ) -> CaptureWrite {
        if self.active_route.load(Ordering::Acquire) != route.0 {
            return CaptureWrite {
                status: CaptureWriteStatus::DroppedStaleRoute,
                accepted_chunks: 0,
                overwritten_chunks: 0,
                non_finite_samples: 0,
            };
        }
        if channels == 0
            || channels != self.expected_channels
            || !interleaved.len().is_multiple_of(usize::from(channels))
        {
            return CaptureWrite {
                status: CaptureWriteStatus::DroppedInvalidLayout,
                accepted_chunks: 0,
                overwritten_chunks: 0,
                non_finite_samples: 0,
            };
        }

        let channels_usize = usize::from(channels);
        let ten_ms_interleaved = self.sample_rate_hz as usize / 100 * channels_usize;
        let samples_per_slot = ten_ms_interleaved.clamp(channels_usize, MAX_CALLBACK_SAMPLES)
            / channels_usize
            * channels_usize;
        let mut result = CaptureWrite {
            status: CaptureWriteStatus::Accepted,
            accepted_chunks: 0,
            overwritten_chunks: 0,
            non_finite_samples: 0,
        };
        for (slot_index, values) in interleaved.chunks(samples_per_slot).enumerate() {
            let frame_offset = slot_index * samples_per_slot / usize::from(channels);
            let mut chunk =
                AudioChunk::silence(offset_time(time, frame_offset, self.sample_rate_hz), route);
            chunk.channels = channels;
            chunk.len = values.len() as u16;
            for (output, input) in chunk.samples.iter_mut().zip(values) {
                if input.is_finite() {
                    *output = input.clamp(-1.0, 1.0);
                } else {
                    *output = 0.0;
                    result.non_finite_samples += 1;
                }
            }
            if self.ring.push_overwrite_oldest(chunk).is_some() {
                result.overwritten_chunks = result.overwritten_chunks.saturating_add(1);
                self.overruns.fetch_add(1, Ordering::Relaxed);
                self.discontinuity.store(true, Ordering::Release);
            }
            result.accepted_chunks = result.accepted_chunks.saturating_add(1);
        }
        let _ = self.activity_tx.try_send(time.callback_at);
        self.callbacks.fetch_add(1, Ordering::Relaxed);
        result
    }

    pub fn pop(&self) -> Option<AudioChunk> {
        self.ring.pop()
    }

    pub fn take_discontinuity(&self) -> bool {
        self.discontinuity.swap(false, Ordering::AcqRel)
    }

    pub fn overruns(&self) -> u64 {
        self.overruns.load(Ordering::Relaxed)
    }

    pub fn callbacks(&self) -> u64 {
        self.callbacks.load(Ordering::Relaxed)
    }

    pub fn queue_levels(&self) -> (usize, usize) {
        (self.ring.len(), self.ring.capacity())
    }

    /// Coalesced callback notification for the sleeping DSP worker. Sending is
    /// non-blocking and uses storage allocated with the port.
    pub fn activity(&self) -> Receiver<MonoTimeNs> {
        self.activity_rx.clone()
    }
}

fn offset_time(time: CallbackTime, frame_offset: usize, sample_rate_hz: u32) -> CallbackTime {
    let offset_ns = (frame_offset as u64)
        .saturating_mul(1_000_000_000)
        .checked_div(u64::from(sample_rate_hz))
        .unwrap_or(0);
    CallbackTime {
        callback_at: time.callback_at,
        first_frame_at: time
            .first_frame_at
            .map(|value| MonoTimeNs(value.0.saturating_add(offset_ns))),
        frame_position: time
            .frame_position
            .map(|position| position.saturating_add(frame_offset as i64)),
        quality: time.quality,
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RenderWrite {
    pub frames: usize,
    pub audible_frames: usize,
    pub underrun_frames: usize,
    pub stale_chunks: u32,
    pub reference_dropped: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RenderActivity {
    Audible(OutputGeneration),
    Silent,
    FadeComplete(OutputGeneration),
}

struct RenderCursor {
    chunk: Option<RenderChunk>,
    index: usize,
}

struct RenderCallbackState {
    ready: BoundedRing<RenderChunk>,
    reference: BoundedRing<ReferenceChunk>,
    active_route: AtomicU64,
    active_generation: AtomicU64,
    retiring_generation: AtomicU64,
    fade_total: AtomicU64,
    fade_remaining: AtomicU64,
    cursor: UnsafeCell<RenderCursor>,
    reference_overruns: AtomicU64,
    reference_degraded: AtomicBool,
    reference_activity_tx: Sender<MonoTimeNs>,
    reference_activity_rx: Receiver<MonoTimeNs>,
    output_rate_hz: AtomicU64,
    underruns: AtomicU64,
    speaking: AtomicBool,
    activity_tx: Sender<RenderActivity>,
    activity_rx: Receiver<RenderActivity>,
    capacity_tx: Sender<()>,
    capacity_rx: Receiver<()>,
    active_consumed_frames: AtomicU64,
}

// Exactly one device callback may call `fill_f32`; all other fields are atomic
// or lock-free. The `UnsafeCell` exists solely to retain a partial chunk between
// invocations without a callback-time mutex.
unsafe impl Sync for RenderCallbackState {}

#[derive(Clone)]
pub struct RenderPort {
    state: Arc<RenderCallbackState>,
}

#[derive(Clone)]
pub struct RenderProducer {
    state: Arc<RenderCallbackState>,
}

impl RenderPort {
    pub fn new(ready_chunks: usize, reference_chunks: usize) -> (Self, RenderProducer) {
        let (activity_tx, activity_rx) = bounded(16);
        let (reference_activity_tx, reference_activity_rx) = bounded(1);
        let (capacity_tx, capacity_rx) = bounded(1);
        let state = Arc::new(RenderCallbackState {
            ready: BoundedRing::new(ready_chunks),
            reference: BoundedRing::new(reference_chunks),
            active_route: AtomicU64::new(u64::MAX),
            active_generation: AtomicU64::new(0),
            retiring_generation: AtomicU64::new(u64::MAX),
            fade_total: AtomicU64::new(0),
            fade_remaining: AtomicU64::new(0),
            cursor: UnsafeCell::new(RenderCursor {
                chunk: None,
                index: 0,
            }),
            reference_overruns: AtomicU64::new(0),
            reference_degraded: AtomicBool::new(false),
            reference_activity_tx,
            reference_activity_rx,
            output_rate_hz: AtomicU64::new(48_000),
            underruns: AtomicU64::new(0),
            speaking: AtomicBool::new(false),
            activity_tx,
            activity_rx,
            capacity_tx,
            capacity_rx,
            active_consumed_frames: AtomicU64::new(0),
        });
        (
            Self {
                state: Arc::clone(&state),
            },
            RenderProducer { state },
        )
    }

    pub fn activate_route(&self, route: RouteGeneration, generation: OutputGeneration) {
        self.state
            .active_generation
            .store(generation.0, Ordering::Release);
        self.state.active_route.store(route.0, Ordering::Release);
    }

    /// Start a newly opened device route without resetting a generation that
    /// semantic commands may already have selected while the streams opened.
    pub fn activate_route_current_generation(&self, route: RouteGeneration) {
        self.state.active_route.store(route.0, Ordering::Release);
    }

    pub fn deactivate_route(&self) {
        self.state.active_route.store(u64::MAX, Ordering::Release);
    }

    pub fn set_active_generation(&self, generation: OutputGeneration) {
        self.state
            .active_generation
            .store(generation.0, Ordering::Release);
    }

    pub fn configure_output_rate(&self, sample_rate_hz: u32) {
        self.state
            .output_rate_hz
            .store(u64::from(sample_rate_hz.max(1)), Ordering::Release);
    }

    pub fn retire(
        &self,
        retiring: OutputGeneration,
        active: OutputGeneration,
        fade_ms: u32,
        output_rate_hz: u32,
    ) {
        self.state
            .active_generation
            .store(active.0, Ordering::Release);
        self.state
            .retiring_generation
            .store(retiring.0, Ordering::Release);
        let samples = u64::from(output_rate_hz).saturating_mul(u64::from(fade_ms)) / 1_000;
        self.state.fade_total.store(samples, Ordering::Release);
        self.state.fade_remaining.store(samples, Ordering::Release);
    }

    pub fn fill_f32(
        &self,
        interleaved_output: &mut [f32],
        channels: u16,
        time: CallbackTime,
        route: RouteGeneration,
    ) -> RenderWrite {
        interleaved_output.fill(0.0);
        if channels == 0
            || !interleaved_output
                .len()
                .is_multiple_of(usize::from(channels))
        {
            return RenderWrite {
                frames: 0,
                audible_frames: 0,
                underrun_frames: 0,
                stale_chunks: 0,
                reference_dropped: false,
            };
        }
        let frames = interleaved_output.len() / usize::from(channels);
        if self.state.active_route.load(Ordering::Acquire) != route.0 {
            return RenderWrite {
                frames,
                audible_frames: 0,
                underrun_frames: frames,
                stale_chunks: 0,
                reference_dropped: false,
            };
        }

        let active = self.state.active_generation.load(Ordering::Acquire);
        let retiring = self.state.retiring_generation.load(Ordering::Acquire);
        let cursor = unsafe { &mut *self.state.cursor.get() };
        let mut reference = ReferenceChunk {
            samples: [0.0; MAX_CALLBACK_SAMPLES],
            len: 0,
            time,
            route,
        };
        let reference_chunk_frames = self
            .state
            .output_rate_hz
            .load(Ordering::Acquire)
            .div_ceil(100)
            .clamp(1, MAX_CALLBACK_SAMPLES as u64) as usize;
        let mut write = RenderWrite {
            frames,
            audible_frames: 0,
            underrun_frames: 0,
            stale_chunks: 0,
            reference_dropped: false,
        };
        let mut audible_generation = None;
        let mut active_consumed = 0_usize;

        for (frame_index, output) in interleaved_output
            .chunks_mut(usize::from(channels))
            .enumerate()
        {
            let mut sample = 0.0;
            let mut sample_generation = None;
            let fade_remaining = self.state.fade_remaining.load(Ordering::Acquire);
            let fade_total = self.state.fade_total.load(Ordering::Acquire);
            loop {
                if cursor
                    .chunk
                    .as_ref()
                    .is_none_or(|chunk| cursor.index >= usize::from(chunk.len))
                {
                    cursor.chunk = self.state.ready.pop();
                    cursor.index = 0;
                }
                let Some(chunk) = cursor.chunk.as_ref() else {
                    write.underrun_frames += 1;
                    break;
                };
                if chunk.generation.0 != active && chunk.generation.0 != retiring {
                    cursor.chunk = None;
                    write.stale_chunks += 1;
                    continue;
                }
                sample = chunk.samples[cursor.index];
                let generation = chunk.generation;
                sample_generation = Some(generation);
                cursor.index += 1;
                if chunk.generation.0 == retiring {
                    if fade_remaining == 0 || fade_total == 0 {
                        sample = 0.0;
                    } else {
                        let gain = if fade_total <= 1 {
                            0.0
                        } else {
                            (fade_remaining - 1) as f32 / (fade_total - 1) as f32
                        };
                        sample *= gain;
                    }
                }
                break;
            }
            if !sample.is_finite() {
                sample = 0.0;
            }
            sample = sample.clamp(-1.0, 1.0);
            output.fill(sample);
            if sample_generation.is_some_and(|generation| generation.0 == active) {
                active_consumed += 1;
            }
            if fade_remaining > 0 {
                self.state
                    .fade_remaining
                    .store(fade_remaining - 1, Ordering::Release);
                if fade_remaining == 1 {
                    self.state
                        .retiring_generation
                        .store(u64::MAX, Ordering::Release);
                    let _ = self
                        .state
                        .activity_tx
                        .try_send(RenderActivity::FadeComplete(OutputGeneration(retiring)));
                }
            }
            if sample.abs() > 1.0e-6 {
                write.audible_frames += 1;
                audible_generation = audible_generation.or(Some(
                    cursor
                        .chunk
                        .as_ref()
                        .map(|chunk| chunk.generation)
                        .unwrap_or(OutputGeneration(active)),
                ));
            }

            reference.samples[usize::from(reference.len)] = sample;
            reference.len += 1;
            if usize::from(reference.len) == reference_chunk_frames || frame_index + 1 == frames {
                reference.time = offset_time(
                    time,
                    frame_index + 1 - usize::from(reference.len),
                    self.state.output_rate_hz.load(Ordering::Acquire) as u32,
                );
                let next = ReferenceChunk {
                    samples: [0.0; MAX_CALLBACK_SAMPLES],
                    len: 0,
                    time,
                    route,
                };
                let completed = std::mem::replace(&mut reference, next);
                if self.state.reference.push(completed).is_err() {
                    write.reference_dropped = true;
                    self.state
                        .reference_overruns
                        .fetch_add(1, Ordering::Relaxed);
                    self.state.reference_degraded.store(true, Ordering::Release);
                }
                let _ = self
                    .state
                    .reference_activity_tx
                    .try_send(reference.time.callback_at);
            }
        }
        if write.underrun_frames > 0 {
            self.state
                .underruns
                .fetch_add(write.underrun_frames as u64, Ordering::Relaxed);
        }
        if active_consumed > 0 {
            self.state
                .active_consumed_frames
                .fetch_add(active_consumed as u64, Ordering::Relaxed);
            let _ = self.state.capacity_tx.try_send(());
        }
        let now_speaking = write.audible_frames > 0;
        let was_speaking = self.state.speaking.swap(now_speaking, Ordering::AcqRel);
        if now_speaking != was_speaking {
            let activity = audible_generation
                .map(RenderActivity::Audible)
                .unwrap_or(RenderActivity::Silent);
            let _ = self.state.activity_tx.try_send(activity);
        }
        write
    }

    pub fn pop_reference(&self) -> Option<ReferenceChunk> {
        self.state.reference.pop()
    }

    pub fn take_reference_degraded(&self) -> bool {
        self.state.reference_degraded.swap(false, Ordering::AcqRel)
    }

    pub fn reference_activity(&self) -> Receiver<MonoTimeNs> {
        self.state.reference_activity_rx.clone()
    }

    pub fn speaking(&self) -> bool {
        self.state.speaking.load(Ordering::Acquire)
    }

    pub fn underruns(&self) -> u64 {
        self.state.underruns.load(Ordering::Relaxed)
    }

    pub fn reference_overruns(&self) -> u64 {
        self.state.reference_overruns.load(Ordering::Relaxed)
    }

    pub fn reference_queue_levels(&self) -> (usize, usize) {
        (self.state.reference.len(), self.state.reference.capacity())
    }

    pub fn ready_queue_levels(&self) -> (usize, usize) {
        (self.state.ready.len(), self.state.ready.capacity())
    }

    pub fn activity(&self) -> Receiver<RenderActivity> {
        self.state.activity_rx.clone()
    }
}

impl RenderProducer {
    /// The rejected fixed-capacity chunk is returned so the sleeping output
    /// worker can retry it after a capacity notification without copying PCM.
    #[allow(clippy::result_large_err)]
    pub fn push(&self, chunk: RenderChunk) -> Result<(), RenderChunk> {
        if chunk.generation.0 != self.state.active_generation.load(Ordering::Acquire) {
            return Err(chunk);
        }
        self.state.ready.push(chunk)
    }

    pub fn remaining_chunks(&self) -> usize {
        self.state.ready.capacity() - self.state.ready.len()
    }

    pub fn capacity_activity(&self) -> Receiver<()> {
        self.state.capacity_rx.clone()
    }

    pub fn take_consumed_frames(&self) -> usize {
        self.state.active_consumed_frames.swap(0, Ordering::AcqRel) as usize
    }
}

#[derive(Clone)]
pub struct AudioPorts {
    pub capture: CapturePort,
    pub render: RenderPort,
    pub events: HostEventPort,
}

pub trait DuplexHost: Send + 'static {
    fn open(
        &mut self,
        request: RouteRequest,
        ports: AudioPorts,
    ) -> Result<RouteDescriptor, HostError>;
    fn start(&mut self, route: &RouteId) -> Result<(), HostError>;
    fn close(&mut self, route: &RouteId) -> Result<(), HostError>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EnvironmentMode {
    Conversation,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnvironmentRequest {
    pub session_id: SessionId,
    pub mode: EnvironmentMode,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EnvironmentState {
    Active,
    Suspended,
    Denied,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EnvironmentEvent {
    Suspended,
    Resumed,
    PermissionRevoked,
    Invalidated,
}

pub type EnvironmentEventPort = BoundedRing<EnvironmentEvent>;

pub trait AudioEnvironment: Send + 'static {
    fn activate(
        &mut self,
        request: EnvironmentRequest,
        events: EnvironmentEventPort,
    ) -> Result<EnvironmentState, HostError>;
    fn deactivate(&mut self) -> Result<(), HostError>;
}

#[derive(Default)]
pub struct PassThroughEnvironment;

impl AudioEnvironment for PassThroughEnvironment {
    fn activate(
        &mut self,
        _request: EnvironmentRequest,
        _events: EnvironmentEventPort,
    ) -> Result<EnvironmentState, HostError> {
        Ok(EnvironmentState::Active)
    }

    fn deactivate(&mut self) -> Result<(), HostError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn time() -> CallbackTime {
        CallbackTime {
            callback_at: MonoTimeNs(10),
            first_frame_at: Some(MonoTimeNs(10)),
            frame_position: Some(0),
            quality: TimestampQuality::Hardware,
        }
    }

    #[test]
    fn capture_splits_oversized_callbacks_and_overwrites_oldest() {
        let descriptor = StreamDescriptor {
            sample_rate_hz: 48_000,
            channels: 1,
            sample_format: HostSampleFormat::Float { bits: 32 },
            nominal_callback_frames: None,
        };
        let port = CapturePort::new(1, descriptor);
        port.activate(RouteGeneration(4));
        let input = vec![0.25; MAX_CALLBACK_SAMPLES + 10];
        let result = port.write_f32(&input, 1, time(), RouteGeneration(4));
        assert_eq!(result.accepted_chunks, 9);
        assert_eq!(result.overwritten_chunks, 8);
        assert!(port.take_discontinuity());
        assert_eq!(port.pop().unwrap().values().len(), 266);
    }

    #[test]
    fn stale_capture_is_rejected_as_one_callback() {
        let descriptor = StreamDescriptor {
            sample_rate_hz: 48_000,
            channels: 1,
            sample_format: HostSampleFormat::Float { bits: 32 },
            nominal_callback_frames: None,
        };
        let port = CapturePort::new(4, descriptor);
        port.activate(RouteGeneration(2));
        assert_eq!(
            port.write_f32(&[1.0], 1, time(), RouteGeneration(1)).status,
            CaptureWriteStatus::DroppedStaleRoute
        );
        assert!(port.pop().is_none());
    }

    #[test]
    fn render_reference_is_exactly_post_fade_and_stale_audio_never_plays() {
        let (port, producer) = RenderPort::new(8, 8);
        let activity = port.activity();
        port.activate_route(RouteGeneration(1), OutputGeneration(1));
        producer
            .push(RenderChunk::from_slice(&[1.0; 8], OutputGeneration(1)).unwrap())
            .unwrap();
        port.retire(OutputGeneration(1), OutputGeneration(2), 1, 4_000);
        let mut output = [0.0; 4];
        let write = port.fill_f32(&mut output, 1, time(), RouteGeneration(1));
        assert_eq!(write.audible_frames, 3);
        assert_eq!(output, [1.0, 2.0 / 3.0, 1.0 / 3.0, 0.0]);
        assert_eq!(
            activity.try_iter().collect::<Vec<_>>(),
            [
                RenderActivity::FadeComplete(OutputGeneration(1)),
                RenderActivity::Audible(OutputGeneration(1))
            ]
        );
        let reference = port.pop_reference().unwrap();
        assert_eq!(reference.values(), &output);

        assert!(producer
            .push(RenderChunk::from_slice(&[1.0], OutputGeneration(1)).unwrap())
            .is_err());
    }

    #[test]
    fn reference_overflow_during_double_talk_latches_echo_degradation() {
        let (port, producer) = RenderPort::new(4, 1);
        port.activate_route(RouteGeneration(1), OutputGeneration(1));
        producer
            .push(RenderChunk::from_slice(&[0.5; 480], OutputGeneration(1)).unwrap())
            .unwrap();
        producer
            .push(RenderChunk::from_slice(&[0.5; 480], OutputGeneration(1)).unwrap())
            .unwrap();
        let mut first = [0.0; 480];
        let mut second = [0.0; 480];
        assert!(
            !port
                .fill_f32(&mut first, 1, time(), RouteGeneration(1))
                .reference_dropped
        );
        assert!(
            port.fill_f32(&mut second, 1, time(), RouteGeneration(1))
                .reference_dropped
        );
        assert_eq!(port.reference_overruns(), 1);
        assert!(port.take_reference_degraded());
        assert!(!port.take_reference_degraded());
    }

    #[test]
    fn missing_render_is_silence_now_and_not_replayed() {
        let (port, _producer) = RenderPort::new(2, 2);
        port.activate_route(RouteGeneration(1), OutputGeneration(1));
        let mut output = [9.0; 8];
        let write = port.fill_f32(&mut output, 2, time(), RouteGeneration(1));
        assert_eq!(output, [0.0; 8]);
        assert_eq!(write.underrun_frames, 4);
        assert!(!port.speaking());
    }

    #[test]
    fn callback_faults_are_categorized_and_coalesced_without_overflow() {
        let events = HostEventPort::new(1, 1);
        events.bind_route(RouteId::parse("route-xrun").unwrap());
        let consumer = events.consumer();
        for _ in 0..3 {
            events.publish_callback_fault(
                RouteGeneration(7),
                StreamDirection::Render,
                HostCallbackFaultCode::Xrun,
            );
        }
        events.publish_callback_fault(
            RouteGeneration(7),
            StreamDirection::Render,
            HostCallbackFaultCode::Backend,
        );
        assert!(matches!(
            consumer.pop(),
            Some(HostEvent::CallbackFault {
                generation: RouteGeneration(7),
                direction: StreamDirection::Render,
                code: HostCallbackFaultCode::Xrun,
                count: 3,
                ..
            })
        ));
        assert!(matches!(
            consumer.pop(),
            Some(HostEvent::CallbackFault {
                code: HostCallbackFaultCode::Backend,
                count: 1,
                ..
            })
        ));
        assert!(!consumer.take_critical_overflowed());
    }

    #[test]
    fn callback_fault_policy_only_keeps_self_recovering_streams_alive() {
        assert!(!HostCallbackFaultCode::Xrun.requires_route_rebuild());
        assert!(!HostCallbackFaultCode::RealtimeDenied.requires_route_rebuild());
        assert!(HostCallbackFaultCode::DeviceChanged.requires_route_rebuild());
        assert!(HostCallbackFaultCode::Backend.requires_route_rebuild());
        assert!(HostCallbackFaultCode::Backend.recoverable());
        assert!(!HostCallbackFaultCode::Other.recoverable());
    }

    #[test]
    fn fade_completes_on_the_output_timeline_even_without_retiring_pcm() {
        let (port, _producer) = RenderPort::new(2, 2);
        port.activate_route(RouteGeneration(1), OutputGeneration(1));
        port.retire(OutputGeneration(1), OutputGeneration(2), 1, 4_000);
        let mut output = [1.0; 4];
        port.fill_f32(&mut output, 1, time(), RouteGeneration(1));
        assert_eq!(output, [0.0; 4]);
        assert!(port
            .activity()
            .try_iter()
            .any(|event| event == RenderActivity::FadeComplete(OutputGeneration(1))));
    }

    #[test]
    fn starting_a_route_preserves_a_generation_selected_while_opening() {
        let (render, producer) = RenderPort::new(4, 4);
        let route = RouteGeneration(3);
        let generation = OutputGeneration(9);
        render.set_active_generation(generation);
        render.activate_route_current_generation(route);
        producer
            .push(RenderChunk::from_slice(&[0.4; 4], generation).unwrap())
            .unwrap();
        let mut output = [0.0; 4];
        render.fill_f32(&mut output, 1, time(), route);
        assert_eq!(output, [0.4; 4]);
    }
}
