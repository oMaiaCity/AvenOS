use aven_voice_protocol::{CandidateId, SessionId, TurnId};

#[derive(Clone, Copy, Debug, Default, Eq, Ord, PartialEq, PartialOrd)]
pub struct MonoTimeNs(pub u64);

impl MonoTimeNs {
    pub const fn from_millis(milliseconds: u64) -> Self {
        Self(milliseconds.saturating_mul(1_000_000))
    }

    pub const fn elapsed_since(self, earlier: Self) -> u64 {
        self.0.saturating_sub(earlier.0)
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct RouteGeneration(pub u64);

#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct OutputGeneration(pub u64);

#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct EventSequence(pub u64);

/// Collision-safe when constructed with a random per-process ASCII nonce.
#[derive(Debug)]
pub struct IdGenerator {
    boot_nonce: String,
    next: u64,
}

impl IdGenerator {
    pub fn new(boot_nonce: impl Into<String>) -> Result<Self, &'static str> {
        let boot_nonce = boot_nonce.into();
        if boot_nonce.is_empty() || boot_nonce.len() > 24 || !boot_nonce.is_ascii() {
            return Err("boot nonce must be 1..=24 ASCII bytes");
        }
        Ok(Self {
            boot_nonce,
            next: 0,
        })
    }

    fn value(&mut self, kind: &str) -> String {
        self.next = self
            .next
            .checked_add(1)
            .expect("voice ID counter exhausted");
        format!("{}-{kind}-{}", self.boot_nonce, self.next)
    }

    pub fn session(&mut self) -> SessionId {
        SessionId::parse(self.value("s")).expect("validated boot nonce makes a valid ID")
    }

    pub fn candidate(&mut self) -> CandidateId {
        CandidateId::parse(self.value("c")).expect("validated boot nonce makes a valid ID")
    }

    pub fn turn(&mut self) -> TurnId {
        TurnId::parse(self.value("t")).expect("validated boot nonce makes a valid ID")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_across_types_and_monotonic() {
        let mut ids = IdGenerator::new("boot42").unwrap();
        assert_eq!(ids.session().as_str(), "boot42-s-1");
        assert_eq!(ids.turn().as_str(), "boot42-t-2");
        assert_eq!(ids.candidate().as_str(), "boot42-c-3");
    }
}
