use std::sync::{Arc, Mutex};

use aven_voice_protocol::VoiceSnapshot;

/// Diagnostics are a single replaceable snapshot, never an accumulating queue.
#[derive(Clone, Default)]
pub struct DiagnosticsSlot {
    latest: Arc<Mutex<Option<VoiceSnapshot>>>,
}

impl DiagnosticsSlot {
    pub fn replace(&self, snapshot: VoiceSnapshot) {
        *self.latest.lock().expect("diagnostics mutex poisoned") = Some(snapshot);
    }

    pub fn latest(&self) -> Option<VoiceSnapshot> {
        self.latest
            .lock()
            .expect("diagnostics mutex poisoned")
            .clone()
    }

    pub fn clear(&self) {
        *self.latest.lock().expect("diagnostics mutex poisoned") = None;
    }
}
