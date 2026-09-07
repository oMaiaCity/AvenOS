use std::collections::{BTreeMap, BTreeSet};

use aven_artifact_store_contract::{
    artifact_digest, parse_canonical, publication_request_digest, AllowedTargetTypes, BlobPolicy,
    CanonicalValue, PublicationBody, PublicationSubmission, ReferenceTarget, RequestContext,
    TypeKey, COMMAND_VERSION,
};
use serde::Serialize;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{CoreError, Limits, TypeCatalog};

#[derive(Clone, Debug)]
pub struct ExistingArtifact {
    pub id: Uuid,
    pub scope_id: Uuid,
    pub type_key: TypeKey,
    pub type_version: u32,
    pub artifact_sha256: String,
    pub blob_sha256: Option<String>,
    pub blob_length: Option<u64>,
}

#[derive(Clone, Debug)]
pub struct PreparedReference {
    pub role: aven_artifact_store_contract::Role,
    pub ordinal: u32,
    pub target_artifact_id: Uuid,
    pub target_artifact_sha256: String,
    pub attributes: CanonicalValue,
}

#[derive(Clone, Debug)]
pub struct PreparedArtifact {
    pub id: Uuid,
    pub publication_ordinal: u32,
    pub local_key: aven_artifact_store_contract::LocalKey,
    pub type_key: TypeKey,
    pub type_version: u32,
    pub type_definition_sha256: String,
    pub payload: CanonicalValue,
    pub blob_sha256: Option<String>,
    pub blob_length: Option<u64>,
    pub artifact_sha256: String,
    pub output: Option<aven_artifact_store_contract::OutputBinding>,
    pub references: Vec<PreparedReference>,
}

#[derive(Clone, Debug)]
pub struct PreparedPublication {
    pub context: RequestContext,
    pub submission: PublicationSubmission,
    pub publication_request_sha256: String,
    pub run_id: Option<Uuid>,
    pub artifacts: Vec<PreparedArtifact>,
}

/// Validate and freeze one semantic publication before opening its database transaction.
///
/// # Errors
///
/// Returns an error when identity, limits, types, payloads, authorities, references,
/// inputs, output bindings, or evidence violate the frozen v1 contract.
#[allow(clippy::too_many_lines)]
pub fn prepare_publication(
    now: OffsetDateTime,
    context: RequestContext,
    submission: PublicationSubmission,
    catalog: &TypeCatalog,
    existing: &BTreeMap<Uuid, ExistingArtifact>,
    limits: &Limits,
) -> Result<PreparedPublication, CoreError> {
    let intent = &submission.intent;
    if context.decision_expires_at <= now {
        return Err(CoreError::InvalidPublication(
            "authorization decision is expired".to_owned(),
        ));
    }
    context
        .publisher
        .validate()
        .map_err(|error| CoreError::InvalidPublication(error.to_string()))?;
    if context.scope_id != intent.scope_id {
        return Err(CoreError::InvalidPublication(
            "route/authentication scope differs from intent scope".to_owned(),
        ));
    }
    if intent.command_version != COMMAND_VERSION {
        return Err(CoreError::InvalidPublication(format!(
            "unsupported commandVersion {}",
            intent.command_version
        )));
    }
    if intent.artifacts.is_empty() || intent.artifacts.len() > limits.max_artifacts_per_publication
    {
        return Err(CoreError::InvalidPublication(
            "publication artifact count is outside the configured bound".to_owned(),
        ));
    }
    if intent.evidence.len() > limits.max_evidence_per_publication {
        return Err(CoreError::InvalidPublication(
            "publication evidence count exceeds the configured bound".to_owned(),
        ));
    }

    match &intent.body {
        PublicationBody::Roots { root_actor } => {
            root_actor
                .validate()
                .map_err(|error| CoreError::InvalidPublication(error.to_string()))?;
            if !intent.evidence.is_empty()
                || intent
                    .artifacts
                    .iter()
                    .any(|artifact| artifact.output.is_some())
            {
                return Err(CoreError::InvalidPublication(
                    "root publications forbid evidence and output bindings".to_owned(),
                ));
            }
        }
        PublicationBody::Run { run } => {
            run.initiator
                .validate()
                .map_err(|error| CoreError::InvalidPublication(error.to_string()))?;
            run.executor
                .validate()
                .map_err(|error| CoreError::InvalidPublication(error.to_string()))?;
            if intent
                .artifacts
                .iter()
                .any(|artifact| artifact.output.is_none())
            {
                return Err(CoreError::InvalidPublication(
                    "every run artifact requires an output binding".to_owned(),
                ));
            }
            validate_contiguous(
                run.inputs.iter().map(|input| (&input.role, input.ordinal)),
                "run input",
            )?;
            for input in &run.inputs {
                let artifact = existing
                    .get(&input.artifact_id)
                    .ok_or(CoreError::ArtifactUnavailable(input.artifact_id))?;
                if artifact.scope_id != intent.scope_id {
                    return Err(CoreError::ArtifactUnavailable(input.artifact_id));
                }
            }
            validate_contiguous(
                intent
                    .artifacts
                    .iter()
                    .filter_map(|artifact| artifact.output.as_ref())
                    .map(|output| (&output.role, output.ordinal)),
                "run output",
            )?;
        }
    }

    let request_digest = publication_request_digest(&context.publisher, intent)?;
    let mut local = BTreeMap::new();
    let mut prepared = Vec::with_capacity(intent.artifacts.len());

    for (publication_ordinal, artifact) in intent.artifacts.iter().enumerate() {
        if local.contains_key(&artifact.local_key) {
            return Err(CoreError::InvalidPublication(format!(
                "duplicate local key {}",
                artifact.local_key
            )));
        }
        if artifact.references.len() > limits.max_references_per_artifact {
            return Err(CoreError::InvalidPublication(format!(
                "artifact {} has too many references",
                artifact.local_key
            )));
        }
        if artifact.payload.canonical_bytes().len() > limits.max_payload_bytes {
            return Err(CoreError::InvalidPublication(format!(
                "artifact {} payload exceeds limit",
                artifact.local_key
            )));
        }

        let registered = catalog
            .get(&artifact.type_key, artifact.type_version)
            .ok_or_else(|| {
                CoreError::TypeUnavailable(artifact.type_key.clone(), artifact.type_version)
            })?;
        catalog.validate_payload(registered, &artifact.payload)?;
        match (registered.definition.blob_policy, &artifact.blob) {
            (BlobPolicy::Forbidden, Some(_)) => {
                return Err(CoreError::InvalidPublication(format!(
                    "{} forbids a primary blob",
                    artifact.local_key
                )));
            }
            (BlobPolicy::Required, None) => {
                return Err(CoreError::InvalidPublication(format!(
                    "{} requires a primary blob",
                    artifact.local_key
                )));
            }
            _ => {}
        }
        if artifact.blob.is_some()
            != submission
                .blob_authorities
                .contains_key(&artifact.local_key)
        {
            return Err(CoreError::InvalidPublication(format!(
                "{} must have exactly one blob authority when and only when it declares a blob",
                artifact.local_key
            )));
        }

        validate_contiguous(
            artifact
                .references
                .iter()
                .map(|reference| (&reference.role, reference.ordinal)),
            "reference",
        )?;

        let mut references = Vec::with_capacity(artifact.references.len());
        for reference in &artifact.references {
            catalog.validate_attributes(registered, &reference.role, &reference.attributes)?;
            let (target_id, target_digest, target_type, target_version) = match &reference.target {
                ReferenceTarget::Existing { artifact_id } => {
                    let target = existing
                        .get(artifact_id)
                        .ok_or(CoreError::ArtifactUnavailable(*artifact_id))?;
                    if target.scope_id != intent.scope_id {
                        return Err(CoreError::ArtifactUnavailable(*artifact_id));
                    }
                    (
                        target.id,
                        target.artifact_sha256.clone(),
                        target.type_key.clone(),
                        target.type_version,
                    )
                }
                ReferenceTarget::Local { local_key } => {
                    let target: &PreparedArtifact = local.get(local_key).ok_or_else(|| {
                        CoreError::InvalidPublication(format!(
                            "local reference {local_key} must point to an earlier artifact"
                        ))
                    })?;
                    (
                        target.id,
                        target.artifact_sha256.clone(),
                        target.type_key.clone(),
                        target.type_version,
                    )
                }
            };
            let rule = registered
                .definition
                .reference_rules
                .iter()
                .find(|rule| rule.role == reference.role)
                .ok_or_else(|| {
                    CoreError::InvalidPublication(format!(
                        "reference role {} is not declared",
                        reference.role
                    ))
                })?;
            if let AllowedTargetTypes::Exact { types } = &rule.allowed_target_types {
                if !types.iter().any(|allowed| {
                    allowed.type_key == target_type && allowed.version == target_version
                }) {
                    return Err(CoreError::InvalidPublication(format!(
                        "reference {} target type is not allowed",
                        reference.role
                    )));
                }
            }
            references.push(PreparedReference {
                role: reference.role.clone(),
                ordinal: reference.ordinal,
                target_artifact_id: target_id,
                target_artifact_sha256: target_digest,
                attributes: reference.attributes.clone(),
            });
        }

        for rule in &registered.definition.reference_rules {
            let count = references
                .iter()
                .filter(|reference| reference.role == rule.role)
                .count();
            if count < rule.minimum as usize || count > rule.maximum as usize {
                return Err(CoreError::InvalidPublication(format!(
                    "reference role {} count {count} is outside {}..={}",
                    rule.role, rule.minimum, rule.maximum
                )));
            }
        }

        let preimage = ArtifactPreimage {
            type_key: &artifact.type_key,
            type_version: artifact.type_version,
            type_definition_sha256: &registered.type_definition_sha256,
            payload: &artifact.payload,
            blob: artifact.blob.as_ref(),
            references: &references,
        };
        let bytes = serde_json::to_vec(&preimage)?;
        let canonical = parse_canonical(&bytes, true)?;
        let id = Uuid::new_v4();
        let prepared_artifact = PreparedArtifact {
            id,
            publication_ordinal: u32::try_from(publication_ordinal)
                .map_err(|_| CoreError::InvalidPublication("too many artifacts".to_owned()))?,
            local_key: artifact.local_key.clone(),
            type_key: artifact.type_key.clone(),
            type_version: artifact.type_version,
            type_definition_sha256: registered.type_definition_sha256.clone(),
            payload: artifact.payload.clone(),
            blob_sha256: artifact.blob.as_ref().map(|blob| blob.sha256.clone()),
            blob_length: artifact.blob.as_ref().map(|blob| blob.length),
            artifact_sha256: artifact_digest(&canonical),
            output: artifact.output.clone(),
            references,
        };
        local.insert(artifact.local_key.clone(), prepared_artifact.clone());
        prepared.push(prepared_artifact);
    }

    validate_evidence(&submission, existing, &prepared)?;

    Ok(PreparedPublication {
        context,
        run_id: matches!(intent.body, PublicationBody::Run { .. }).then(Uuid::new_v4),
        submission,
        publication_request_sha256: request_digest,
        artifacts: prepared,
    })
}

fn validate_contiguous<'a>(
    values: impl IntoIterator<Item = (&'a aven_artifact_store_contract::Role, u32)>,
    label: &str,
) -> Result<(), CoreError> {
    let mut expected = BTreeMap::new();
    for (role, ordinal) in values {
        let next = expected.entry(role.clone()).or_insert(0_u32);
        if ordinal != *next {
            return Err(CoreError::InvalidPublication(format!(
                "{label} role {role} expected ordinal {next}, got {ordinal}"
            )));
        }
        *next += 1;
    }
    Ok(())
}

fn validate_evidence(
    submission: &PublicationSubmission,
    _existing: &BTreeMap<Uuid, ExistingArtifact>,
    prepared: &[PreparedArtifact],
) -> Result<(), CoreError> {
    let PublicationBody::Run { run } = &submission.intent.body else {
        return Ok(());
    };
    let outputs: BTreeSet<_> = prepared
        .iter()
        .map(|artifact| &artifact.local_key)
        .collect();
    let inputs: BTreeSet<_> = run
        .inputs
        .iter()
        .map(|input| (&input.role, input.ordinal))
        .collect();
    for (expected, evidence) in submission.intent.evidence.iter().enumerate() {
        let expected_ordinal = u32::try_from(expected)
            .map_err(|_| CoreError::InvalidPublication("too much evidence".to_owned()))?;
        if evidence.ordinal != expected_ordinal {
            return Err(CoreError::InvalidPublication(format!(
                "evidence expected ordinal {expected}, got {}",
                evidence.ordinal
            )));
        }
        if !outputs.contains(&evidence.output_local_key) {
            return Err(CoreError::InvalidPublication(
                "evidence names a foreign output".to_owned(),
            ));
        }
        if !inputs.contains(&(&evidence.input_role, evidence.input_ordinal)) {
            return Err(CoreError::InvalidPublication(
                "evidence names an undeclared input".to_owned(),
            ));
        }
        validate_locator(&evidence.output_locator)?;
        validate_locator(&evidence.input_locator)?;
    }
    Ok(())
}

fn validate_locator(locator: &aven_artifact_store_contract::Locator) -> Result<(), CoreError> {
    use aven_artifact_store_contract::Locator;
    match locator {
        Locator::ArtifactRoot => Ok(()),
        Locator::JsonPointer { pointer } => {
            if pointer.is_empty() || pointer.starts_with('/') {
                Ok(())
            } else {
                Err(CoreError::InvalidPublication(
                    "JSON pointer must be empty or start with '/'".to_owned(),
                ))
            }
        }
        Locator::ByteRange {
            start,
            end_exclusive,
        } if start < end_exclusive => Ok(()),
        Locator::ByteRange { .. } => Err(CoreError::InvalidPublication(
            "byte range must be non-empty".to_owned(),
        )),
        Locator::PageRegion {
            page,
            x,
            y,
            width,
            height,
        } if *page > 0
            && *width > 0
            && *height > 0
            && *x <= 1_000_000
            && *y <= 1_000_000
            && x.saturating_add(*width) <= 1_000_000
            && y.saturating_add(*height) <= 1_000_000 =>
        {
            Ok(())
        }
        Locator::PageRegion { .. } => Err(CoreError::InvalidPublication(
            "page region is outside integer-millionth bounds".to_owned(),
        )),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactPreimage<'a> {
    type_key: &'a TypeKey,
    type_version: u32,
    type_definition_sha256: &'a str,
    payload: &'a CanonicalValue,
    blob: Option<&'a aven_artifact_store_contract::DeclaredBlob>,
    references: &'a [PreparedReference],
}

impl Serialize for PreparedReference {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct DigestReference<'a> {
            role: &'a aven_artifact_store_contract::Role,
            ordinal: u32,
            target_artifact_sha256: &'a str,
            attributes: &'a CanonicalValue,
        }
        DigestReference {
            role: &self.role,
            ordinal: self.ordinal,
            target_artifact_sha256: &self.target_artifact_sha256,
            attributes: &self.attributes,
        }
        .serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aven_artifact_store_contract::{
        Actor, BlobAuthority, DeclaredBlob, IntentArtifact, LocalKey, PublicationIntent,
        PublicationSubmission, StablePublisher, TypeKey,
    };

    #[test]
    fn equal_content_keeps_equal_digest_and_distinct_occurrences() {
        let catalog =
            TypeCatalog::from_definitions(crate::builtin_type_definitions().unwrap()).unwrap();
        let scope_id = Uuid::new_v4();
        let publisher = StablePublisher {
            issuer: "test".into(),
            subject: "publisher-a".into(),
        };
        let build = |publication_id, claim_id| {
            PublicationSubmission {
            intent: PublicationIntent {
                command_version: 1,
                publication_id,
                scope_id,
                body: PublicationBody::Roots { root_actor: Actor { kind: TypeKey::new("user").unwrap(), id: "user-1".into() } },
                artifacts: vec![IntentArtifact {
                    local_key: LocalKey::new("file").unwrap(),
                    type_key: TypeKey::new("core.file").unwrap(),
                    type_version: 1,
                    payload: parse_canonical(br#"{"declaredMediaType":"text/plain","originalName":"a.txt","sourceKind":"upload"}"#, true).unwrap(),
                    blob: Some(DeclaredBlob { sha256: "a".repeat(64), length: 1 }),
                    references: vec![],
                    output: None,
                }],
                evidence: vec![],
            },
            blob_authorities: BTreeMap::from([(LocalKey::new("file").unwrap(), BlobAuthority::UploadClaim { claim_id })]),
        }
        };
        let context = RequestContext {
            publisher,
            scope_id,
            decision_expires_at: OffsetDateTime::now_utc() + time::Duration::minutes(5),
        };
        let first = prepare_publication(
            OffsetDateTime::now_utc(),
            context.clone(),
            build(Uuid::new_v4(), Uuid::new_v4()),
            &catalog,
            &BTreeMap::new(),
            &Limits::default(),
        )
        .unwrap();
        let second = prepare_publication(
            OffsetDateTime::now_utc(),
            context,
            build(Uuid::new_v4(), Uuid::new_v4()),
            &catalog,
            &BTreeMap::new(),
            &Limits::default(),
        )
        .unwrap();
        assert_ne!(first.artifacts[0].id, second.artifacts[0].id);
        assert_eq!(
            first.artifacts[0].artifact_sha256,
            second.artifacts[0].artifact_sha256
        );
        assert_ne!(
            first.publication_request_sha256,
            second.publication_request_sha256
        );
    }
}
