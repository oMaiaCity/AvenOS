use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    MalformedRequest,
    AuthenticationRequired,
    ScopeDenied,
    ResourceUnavailable,
    UploadConflict,
    PublicationConflict,
    LocalReferenceOrder,
    InputUnavailable,
    StoreEpochChanged,
    FeedRebootstrapRequired,
    UploadExpired,
    PublicationDataLost,
    LimitExceeded,
    ContentRangeNotSatisfiable,
    UploadDigestMismatch,
    SchemaValidationFailed,
    InvalidEvidence,
    StagingQuotaExceeded,
    IntegrityFailure,
    StoreReconciliationRequired,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Problem {
    pub problem_type: String,
    pub title: String,
    pub status: u16,
    pub code: ErrorCode,
    pub detail: String,
    pub instance: Option<String>,
}

impl Problem {
    #[must_use]
    pub fn new(status: u16, code: ErrorCode, title: impl Into<String>) -> Self {
        let title = title.into();
        Self {
            problem_type: format!("urn:aven:artifact-store:problem:{code:?}"),
            detail: title.clone(),
            title,
            status,
            code,
            instance: None,
        }
    }
}
