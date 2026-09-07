//! Frozen protocol values for Artifact Store v1.

mod canonical;
mod digest;
mod dto;
mod error;
mod identifiers;

pub use canonical::{parse_canonical, CanonicalError, CanonicalValue, MAX_SAFE_INTEGER};
pub use digest::{
    artifact_digest, publication_request_digest, sha256_hex, type_definition_digest, DigestError,
};
pub use dto::*;
pub use error::{ErrorCode, Problem};
pub use identifiers::{Actor, LocalKey, Role, StablePublisher, TokenError, TypeKey};

/// Version of the HTTP publication command and canonical semantic envelope.
pub const COMMAND_VERSION: u32 = 1;
/// Canonical JSON profile implemented by this crate.
pub const JSON_PROFILE_ID: &str = "artifact-json-v1";
/// JSON Schema subset used for artifact payloads.
pub const SCHEMA_PROFILE_ID: &str = "artifact-json-schema-profile-v1";
