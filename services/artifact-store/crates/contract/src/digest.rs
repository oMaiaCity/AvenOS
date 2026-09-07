use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::{CanonicalValue, PublicationIntent, StablePublisher, TypeDefinition};

const TYPE_DOMAIN: &[u8] = b"artifact-store/type-definition/v1\0";
const ARTIFACT_DOMAIN: &[u8] = b"artifact-store/artifact/v1\0";
const PUBLICATION_DOMAIN: &[u8] = b"artifact-store/publication-request/v1\0";

#[derive(Debug, Error)]
pub enum DigestError {
    #[error("digest input could not be represented as canonical JSON: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("digest input violated Artifact JSON v1: {0}")]
    Canonical(#[from] crate::CanonicalError),
}

#[must_use]
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn canonical_from<T: Serialize>(value: &T) -> Result<CanonicalValue, DigestError> {
    let bytes = serde_json::to_vec(value)?;
    Ok(crate::parse_canonical(&bytes, true)?)
}

fn domain_hash(domain: &[u8], canonical: &CanonicalValue) -> String {
    let mut hasher = Sha256::new();
    hasher.update(domain);
    hasher.update(canonical.canonical_bytes());
    hex::encode(hasher.finalize())
}

/// Hash one exact source-controlled type definition.
///
/// # Errors
///
/// Returns an error if the definition cannot be represented by Artifact JSON v1.
pub fn type_definition_digest(definition: &TypeDefinition) -> Result<String, DigestError> {
    Ok(domain_hash(TYPE_DOMAIN, &canonical_from(definition)?))
}

#[must_use]
pub fn artifact_digest(preimage: &CanonicalValue) -> String {
    domain_hash(ARTIFACT_DOMAIN, preimage)
}

/// Hash a semantic publication intent bound to its authenticated stable publisher.
///
/// # Errors
///
/// Returns an error if the envelope cannot be represented by Artifact JSON v1.
pub fn publication_request_digest(
    publisher: &StablePublisher,
    intent: &PublicationIntent,
) -> Result<String, DigestError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Envelope<'a> {
        publisher: &'a StablePublisher,
        intent: &'a PublicationIntent,
    }

    Ok(domain_hash(
        PUBLICATION_DOMAIN,
        &canonical_from(&Envelope { publisher, intent })?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{parse_canonical, PublicationIntent};
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DigestFixtures {
        artifact: DigestValue,
        publication: PublicationFixture,
    }

    #[derive(Deserialize)]
    struct DigestValue {
        preimage: serde_json::Value,
        sha256: String,
    }

    #[derive(Deserialize)]
    struct PublicationFixture {
        publisher: StablePublisher,
        intent: PublicationIntent,
        sha256: String,
    }

    #[test]
    fn matches_shared_digest_vectors() {
        let fixtures: DigestFixtures = serde_json::from_str(include_str!(
            "../../../conformance/fixtures/digests/v1.json"
        ))
        .expect("valid digest fixtures");
        let artifact_bytes = serde_json::to_vec(&fixtures.artifact.preimage).unwrap();
        let artifact = parse_canonical(&artifact_bytes, true).unwrap();
        assert_eq!(artifact_digest(&artifact), fixtures.artifact.sha256);
        assert_eq!(
            publication_request_digest(
                &fixtures.publication.publisher,
                &fixtures.publication.intent
            )
            .unwrap(),
            fixtures.publication.sha256
        );
    }

    #[test]
    fn freezes_builtin_type_digests() {
        let file: TypeDefinition = serde_json::from_slice(include_bytes!(
            "../../../conformance/fixtures/protocol/core.file.v1.json"
        ))
        .unwrap();
        let bundle: TypeDefinition = serde_json::from_slice(include_bytes!(
            "../../../conformance/fixtures/protocol/core.bundle.v1.json"
        ))
        .unwrap();
        assert_eq!(
            type_definition_digest(&file).unwrap(),
            "69a2366aceec8cbebb005218d13c47283ad54d50d42fbbb64b9e545cec8d0c69"
        );
        assert_eq!(
            type_definition_digest(&bundle).unwrap(),
            "6c47e92a394cc3c7db983556379c9b3cf0c3a7e8f5f94d28fe1cf3abcec3f7c3"
        );
    }
}
