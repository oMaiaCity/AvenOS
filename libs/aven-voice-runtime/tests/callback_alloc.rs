use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

use aven_voice_core::{MonoTimeNs, OutputGeneration, RouteGeneration};
use aven_voice_runtime::{
    CallbackTime, CapturePort, HostSampleFormat, RenderChunk, RenderPort, StreamDescriptor,
    TimestampQuality,
};

struct CountingAllocator;

thread_local! {
    static COUNTING: Cell<bool> = const { Cell::new(false) };
    static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
}

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        COUNTING.with(|counting| {
            if counting.get() {
                ALLOCATIONS.with(|value| value.set(value.get() + 1));
            }
        });
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn measured<T>(operation: impl FnOnce() -> T) -> (T, usize) {
    ALLOCATIONS.with(|value| value.set(0));
    COUNTING.with(|value| value.set(true));
    let result = operation();
    COUNTING.with(|value| value.set(false));
    let allocations = ALLOCATIONS.with(Cell::get);
    (result, allocations)
}

fn time() -> CallbackTime {
    CallbackTime {
        callback_at: MonoTimeNs(0),
        first_frame_at: Some(MonoTimeNs(0)),
        frame_position: Some(0),
        quality: TimestampQuality::Hardware,
    }
}

#[test]
fn steady_state_capture_callback_allocates_zero() {
    let descriptor = StreamDescriptor {
        sample_rate_hz: 48_000,
        channels: 1,
        sample_format: HostSampleFormat::Float { bits: 32 },
        nominal_callback_frames: Some(480),
    };
    let port = CapturePort::new(25, descriptor);
    port.activate(RouteGeneration(1));
    let input = [0.25; 480];
    port.write_f32(&input, 1, time(), RouteGeneration(1));
    port.pop();
    let (_, allocations) = measured(|| {
        port.write_f32(&input, 1, time(), RouteGeneration(1));
    });
    assert_eq!(allocations, 0);
}

#[test]
fn steady_state_render_callback_allocates_zero() {
    let (port, producer) = RenderPort::new(25, 50);
    port.activate_route(RouteGeneration(1), OutputGeneration(1));
    producer
        .push(RenderChunk::from_slice(&[0.25; 480], OutputGeneration(1)).unwrap())
        .unwrap();
    let mut output = [0.0; 480];
    let (_, allocations) = measured(|| {
        port.fill_f32(&mut output, 1, time(), RouteGeneration(1));
    });
    assert_eq!(allocations, 0);
}
