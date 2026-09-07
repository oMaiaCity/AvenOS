use aven_voice_protocol::VoiceErrorCode;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CoreError {
    pub code: VoiceErrorCode,
    pub message: &'static str,
}

impl CoreError {
    pub const fn new(code: VoiceErrorCode, message: &'static str) -> Self {
        Self { code, message }
    }
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message)
    }
}

impl std::error::Error for CoreError {}
