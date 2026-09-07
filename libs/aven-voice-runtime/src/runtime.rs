use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Instant;

use aven_voice_core::{
    Action, CachedResult, Command, CoreError, MonoTimeNs, Observation, VoiceConfigV1, VoiceState,
};
use aven_voice_protocol::{
    DecimalU64, SessionId, VoiceErrorCode, VoiceEvent, VoiceEventEnvelope, VoiceSnapshot,
    PROTOCOL_VERSION,
};
use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};

pub const CONTROL_CAPACITY: usize = 64;
pub const OBSERVATION_CAPACITY: usize = 256;
pub const ACTION_CAPACITY: usize = 256;
pub const EVENT_CAPACITY: usize = 256;

pub trait ClockSource: Send + Sync + 'static {
    fn now(&self) -> MonoTimeNs;
}

pub struct ProductionClock {
    epoch: Instant,
}

impl Default for ProductionClock {
    fn default() -> Self {
        Self {
            epoch: Instant::now(),
        }
    }
}

impl ClockSource for ProductionClock {
    fn now(&self) -> MonoTimeNs {
        MonoTimeNs(self.epoch.elapsed().as_nanos().min(u128::from(u64::MAX)) as u64)
    }
}

#[derive(Default)]
pub struct VirtualClock(AtomicU64);

impl VirtualClock {
    pub fn set(&self, time: MonoTimeNs) {
        self.0.store(time.0, Ordering::Release);
    }

    pub fn advance_ms(&self, milliseconds: u64) {
        self.0
            .fetch_add(milliseconds.saturating_mul(1_000_000), Ordering::AcqRel);
    }
}

impl ClockSource for VirtualClock {
    fn now(&self) -> MonoTimeNs {
        MonoTimeNs(self.0.load(Ordering::Acquire))
    }
}

struct CommandEnvelope {
    command: Command,
    reply: Sender<Result<CachedResult, CoreError>>,
}

struct SnapshotEnvelope {
    session_id: Option<SessionId>,
    reply: Sender<Result<VoiceSnapshot, CoreError>>,
}

enum RuntimeSignal {
    Stop,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RuntimeSendError {
    QueueFull,
    Stopped,
}

pub struct VoiceRuntimeHandle {
    commands: Sender<CommandEnvelope>,
    snapshots: Sender<SnapshotEnvelope>,
    observations: Sender<Observation>,
    signals: Sender<RuntimeSignal>,
    events: Receiver<VoiceEventEnvelope>,
    actions: Receiver<Action>,
    thread: Option<JoinHandle<()>>,
}

#[derive(Clone)]
pub struct RuntimeObserver {
    observations: Sender<Observation>,
}

#[derive(Clone)]
pub struct RuntimeSnapshotter {
    snapshots: Sender<SnapshotEnvelope>,
}

impl RuntimeSnapshotter {
    pub fn snapshot(
        &self,
        session_id: Option<SessionId>,
    ) -> Result<Receiver<Result<VoiceSnapshot, CoreError>>, RuntimeSendError> {
        let (reply, response) = bounded(1);
        self.snapshots
            .try_send(SnapshotEnvelope { session_id, reply })
            .map_err(map_send_error)?;
        Ok(response)
    }
}

impl RuntimeObserver {
    pub fn publish(&self, observation: Observation) -> Result<(), RuntimeSendError> {
        publish_observation(&self.observations, observation)
    }

    #[cfg(any(test, feature = "silent-audio-e2e"))]
    pub(crate) fn test_pair(capacity: usize) -> (Self, Receiver<Observation>) {
        let (observations, receiver) = bounded(capacity);
        (Self { observations }, receiver)
    }
}

impl VoiceRuntimeHandle {
    pub fn command(
        &self,
        command: Command,
    ) -> Result<Receiver<Result<CachedResult, CoreError>>, RuntimeSendError> {
        let (reply, response) = bounded(1);
        self.commands
            .try_send(CommandEnvelope { command, reply })
            .map_err(map_send_error)?;
        Ok(response)
    }

    pub fn observe(&self, observation: Observation) -> Result<(), RuntimeSendError> {
        publish_observation(&self.observations, observation)
    }

    pub fn snapshot(
        &self,
        session_id: Option<SessionId>,
    ) -> Result<Receiver<Result<VoiceSnapshot, CoreError>>, RuntimeSendError> {
        let (reply, response) = bounded(1);
        self.snapshots
            .try_send(SnapshotEnvelope { session_id, reply })
            .map_err(map_send_error)?;
        Ok(response)
    }

    pub fn observer(&self) -> RuntimeObserver {
        RuntimeObserver {
            observations: self.observations.clone(),
        }
    }

    pub fn snapshotter(&self) -> RuntimeSnapshotter {
        RuntimeSnapshotter {
            snapshots: self.snapshots.clone(),
        }
    }

    pub fn events(&self) -> &Receiver<VoiceEventEnvelope> {
        &self.events
    }

    /// Composition owns the only consumer. Clones must not be used as a fanout.
    pub fn actions(&self) -> &Receiver<Action> {
        &self.actions
    }

    pub fn stop(mut self) {
        let _ = self.signals.try_send(RuntimeSignal::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for VoiceRuntimeHandle {
    fn drop(&mut self) {
        let _ = self.signals.try_send(RuntimeSignal::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn map_send_error<T>(error: TrySendError<T>) -> RuntimeSendError {
    match error {
        TrySendError::Full(_) => RuntimeSendError::QueueFull,
        TrySendError::Disconnected(_) => RuntimeSendError::Stopped,
    }
}

/// Critical state transitions use bounded backpressure on worker threads so
/// they cannot disappear. High-rate replaceable observations are coalesced by
/// dropping a redundant tick/sample notification when one is already queued.
/// Audio callbacks never call this API.
fn publish_observation(
    observations: &Sender<Observation>,
    observation: Observation,
) -> Result<(), RuntimeSendError> {
    if matches!(
        observation,
        Observation::CaptureArrived { .. }
            | Observation::DiagnosticsTick
            | Observation::MetricsUpdated { .. }
    ) {
        observations.try_send(observation).map_err(map_send_error)
    } else {
        observations
            .send(observation)
            .map_err(|_| RuntimeSendError::Stopped)
    }
}

pub struct VoiceRuntime;

impl VoiceRuntime {
    pub fn spawn(
        boot_nonce: impl Into<String>,
        config: VoiceConfigV1,
        clock: Arc<dyn ClockSource>,
    ) -> VoiceRuntimeHandle {
        let (command_tx, command_rx) = bounded::<CommandEnvelope>(CONTROL_CAPACITY);
        let (snapshot_tx, snapshot_rx) = bounded::<SnapshotEnvelope>(CONTROL_CAPACITY);
        let (observation_tx, observation_rx) = bounded::<Observation>(OBSERVATION_CAPACITY);
        let (signal_tx, signal_rx) = bounded::<RuntimeSignal>(1);
        let (event_tx, event_rx) = bounded::<VoiceEventEnvelope>(EVENT_CAPACITY);
        let (action_tx, action_rx) = bounded::<Action>(ACTION_CAPACITY);
        let boot_nonce = boot_nonce.into();
        let thread = std::thread::Builder::new()
            .name("aven-voice-coordinator".into())
            .spawn(move || {
                coordinator_loop(
                    VoiceState::new(boot_nonce, config),
                    clock,
                    command_rx,
                    snapshot_rx,
                    observation_rx,
                    signal_rx,
                    event_tx,
                    action_tx,
                )
            })
            .expect("voice coordinator thread must start");
        VoiceRuntimeHandle {
            commands: command_tx,
            snapshots: snapshot_tx,
            observations: observation_tx,
            signals: signal_tx,
            events: event_rx,
            actions: action_rx,
            thread: Some(thread),
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn coordinator_loop(
    mut state: VoiceState,
    clock: Arc<dyn ClockSource>,
    commands: Receiver<CommandEnvelope>,
    snapshots: Receiver<SnapshotEnvelope>,
    observations: Receiver<Observation>,
    signals: Receiver<RuntimeSignal>,
    events: Sender<VoiceEventEnvelope>,
    actions: Sender<Action>,
) {
    loop {
        crossbeam_channel::select! {
            recv(signals) -> _ => break,
            recv(commands) -> received => {
                let Ok(envelope) = received else { break };
                let (result, produced) = state.command(envelope.command, clock.now());
                let _ = envelope.reply.send(result);
                publish_actions(&mut state, clock.now(), produced, &events, &actions);
            },
            recv(snapshots) -> received => {
                let Ok(envelope) = received else { break };
                let result = if envelope.session_id.as_ref().is_some_and(|session| {
                    state.session_id.as_ref() != Some(session)
                }) {
                    Err(CoreError::new(VoiceErrorCode::StaleSession, "session is stale"))
                } else {
                    Ok(state.snapshot(clock.now()))
                };
                let _ = envelope.reply.send(result);
            },
            recv(observations) -> received => {
                let Ok(observation) = received else { break };
                let produced = state.observe(observation, clock.now());
                publish_actions(&mut state, clock.now(), produced, &events, &actions);
            }
        }
    }
}

fn publish_actions(
    state: &mut VoiceState,
    now: MonoTimeNs,
    produced: Vec<Action>,
    events: &Sender<VoiceEventEnvelope>,
    actions: &Sender<Action>,
) {
    for action in produced {
        if let Action::Emit(event) = action {
            state.event_sequence.0 = state.event_sequence.0.saturating_add(1);
            let envelope = VoiceEventEnvelope {
                protocol_version: PROTOCOL_VERSION,
                sequence: DecimalU64::new(state.event_sequence.0),
                session_id: state.session_id.clone(),
                route_generation: state
                    .session_id
                    .as_ref()
                    .map(|_| DecimalU64::new(state.route_generation.0)),
                at_mono_ms: now.0 as f64 / 1_000_000.0,
                event,
            };
            let replaceable = matches!(envelope.event, VoiceEvent::DiagnosticsSnapshot { .. });
            if replaceable {
                let _ = events.try_send(envelope);
            } else if events.send(envelope).is_err() {
                return;
            }
        } else if actions.send(action).is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aven_voice_protocol::RequestId;

    #[test]
    fn coordinator_blocks_and_sequences_all_semantic_events() {
        let clock = Arc::new(VirtualClock::default());
        clock.set(MonoTimeNs::from_millis(12));
        let runtime = VoiceRuntime::spawn("runtime-test", VoiceConfigV1::default(), clock);
        let prepared = runtime
            .command(Command::Prepare {
                request_id: RequestId::parse("prepare").unwrap(),
                features: vec![
                    aven_voice_protocol::VoiceFeature::Input,
                    aven_voice_protocol::VoiceFeature::Output,
                ],
            })
            .unwrap();
        assert!(matches!(
            prepared.recv().unwrap().unwrap(),
            CachedResult::Accepted
        ));
        assert!(matches!(
            runtime.events().recv().unwrap().event,
            VoiceEvent::StatusRuntime { .. }
        ));
        assert!(matches!(
            runtime.actions().recv().unwrap(),
            Action::PrepareModels(_)
        ));
        runtime
            .observe(Observation::ModelsPrepared {
                input: true,
                output: true,
            })
            .unwrap();
        assert!(matches!(
            runtime.events().recv().unwrap().event,
            VoiceEvent::StatusRuntime { .. }
        ));
        let response = runtime
            .command(Command::StartSession {
                request_id: RequestId::parse("start").unwrap(),
                preferred_input: None,
                preferred_output: None,
            })
            .unwrap();
        assert!(matches!(
            response.recv().unwrap().unwrap(),
            CachedResult::Session(_)
        ));
        let event = runtime.events().recv().unwrap();
        assert_eq!(event.sequence.parse(), Ok(3));
        assert_eq!(event.at_mono_ms, 12.0);
        assert!(matches!(event.event, VoiceEvent::StatusSession { .. }));
        assert!(matches!(
            runtime.actions().recv().unwrap(),
            Action::ActivateEnvironment(_)
        ));
        runtime.stop();
    }

    #[test]
    fn bounded_control_rail_reports_backpressure() {
        let (sender, _receiver) = bounded::<u8>(1);
        sender.try_send(1).unwrap();
        assert_eq!(
            map_send_error(sender.try_send(2).unwrap_err()),
            RuntimeSendError::QueueFull
        );
    }
}
