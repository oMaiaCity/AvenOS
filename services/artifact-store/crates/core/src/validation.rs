use std::collections::{BTreeMap, BTreeSet};

use aven_artifact_store_contract::{
    type_definition_digest, BlobPolicy, CanonicalError, CanonicalValue, DigestError,
    RegisteredTypeDefinition, TypeDefinition, TypeKey, SCHEMA_PROFILE_ID,
};
use thiserror::Error;

#[derive(Clone, Debug)]
pub struct Limits {
    pub max_artifacts_per_publication: usize,
    pub max_references_per_artifact: usize,
    pub max_evidence_per_publication: usize,
    pub max_payload_bytes: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_artifacts_per_publication: 64,
            max_references_per_artifact: 256,
            max_evidence_per_publication: 1_024,
            max_payload_bytes: 256 * 1_024,
        }
    }
}

#[derive(Debug, Error)]
pub enum CoreError {
    #[error(transparent)]
    Canonical(#[from] CanonicalError),
    #[error(transparent)]
    Digest(#[from] DigestError),
    #[error("JSON serialization failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid type definition: {0}")]
    InvalidType(String),
    #[error("schema validation failed for {type_key}@{version}: {detail}")]
    Schema {
        type_key: TypeKey,
        version: u32,
        detail: String,
    },
    #[error("publication is invalid: {0}")]
    InvalidPublication(String),
    #[error("exact type {0}@{1} is unavailable")]
    TypeUnavailable(TypeKey, u32),
    #[error("input/reference artifact {0} is unavailable")]
    ArtifactUnavailable(uuid::Uuid),
}

#[derive(Clone, Default)]
pub struct TypeCatalog {
    types: BTreeMap<(TypeKey, u32), RegisteredTypeDefinition>,
}

impl TypeCatalog {
    /// Build an immutable exact-version type catalog.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid or duplicate definition.
    pub fn from_definitions(
        definitions: impl IntoIterator<Item = TypeDefinition>,
    ) -> Result<Self, CoreError> {
        let mut types = BTreeMap::new();
        for definition in definitions {
            validate_type_definition(&definition)?;
            let digest = type_definition_digest(&definition)?;
            let key = (definition.type_key.clone(), definition.version);
            if types.contains_key(&key) {
                return Err(CoreError::InvalidType(format!(
                    "duplicate definition {}@{}",
                    key.0, key.1
                )));
            }
            types.insert(
                key,
                RegisteredTypeDefinition {
                    definition,
                    type_definition_sha256: digest,
                    created_at: time::OffsetDateTime::UNIX_EPOCH,
                },
            );
        }
        Ok(Self { types })
    }

    #[must_use]
    pub fn get(&self, key: &TypeKey, version: u32) -> Option<&RegisteredTypeDefinition> {
        self.types.get(&(key.clone(), version))
    }

    /// Validate one payload against an exact registered schema.
    ///
    /// # Errors
    ///
    /// Returns an error when the schema cannot compile or the payload does not match.
    pub fn validate_payload(
        &self,
        registered: &RegisteredTypeDefinition,
        payload: &CanonicalValue,
    ) -> Result<(), CoreError> {
        let schema = serde_json::to_value(&registered.definition.payload_schema)?;
        let payload = serde_json::to_value(payload)?;
        let validator = jsonschema::validator_for(&schema)
            .map_err(|error| CoreError::InvalidType(error.to_string()))?;
        if let Err(error) = validator.validate(&payload) {
            return Err(CoreError::Schema {
                type_key: registered.definition.type_key.clone(),
                version: registered.definition.version,
                detail: error.to_string(),
            });
        }
        Ok(())
    }

    /// Validate reference attributes against the exact source type's role rule.
    ///
    /// # Errors
    ///
    /// Returns an error for an undeclared role, invalid schema, or attribute mismatch.
    pub fn validate_attributes(
        &self,
        registered: &RegisteredTypeDefinition,
        role: &aven_artifact_store_contract::Role,
        attributes: &CanonicalValue,
    ) -> Result<(), CoreError> {
        let reference_rule = registered
            .definition
            .reference_rules
            .iter()
            .find(|rule| &rule.role == role)
            .ok_or_else(|| {
                CoreError::InvalidPublication(format!(
                    "reference role {role} is not declared by {}@{}",
                    registered.definition.type_key, registered.definition.version
                ))
            })?;
        let schema = serde_json::to_value(&reference_rule.attributes_schema)?;
        let attributes = serde_json::to_value(attributes)?;
        let validator = jsonschema::validator_for(&schema)
            .map_err(|error| CoreError::InvalidType(error.to_string()))?;
        validator
            .validate(&attributes)
            .map_err(|error| CoreError::Schema {
                type_key: registered.definition.type_key.clone(),
                version: registered.definition.version,
                detail: format!("reference role {role}: {error}"),
            })
    }

    pub fn definitions(&self) -> impl Iterator<Item = &RegisteredTypeDefinition> {
        self.types.values()
    }
}

/// Validate one immutable type definition against the v1 schema profile.
///
/// # Errors
///
/// Returns an error for invalid identifiers, versions, schemas, rules, or unsupported
/// schema features.
pub fn validate_type_definition(definition: &TypeDefinition) -> Result<(), CoreError> {
    if definition.version == 0 {
        return Err(CoreError::InvalidType(
            "version must be positive".to_owned(),
        ));
    }
    if definition.schema_profile_id != SCHEMA_PROFILE_ID {
        return Err(CoreError::InvalidType(format!(
            "unsupported schema profile {}",
            definition.schema_profile_id
        )));
    }
    if !definition.payload_schema.is_object() {
        return Err(CoreError::InvalidType(
            "payload schema root must be an object".to_owned(),
        ));
    }
    reject_forbidden_schema_features(&definition.payload_schema)?;
    let schema = serde_json::to_value(&definition.payload_schema)?;
    jsonschema::validator_for(&schema)
        .map_err(|error| CoreError::InvalidType(error.to_string()))?;

    let mut roles = BTreeSet::new();
    for rule in &definition.reference_rules {
        if !roles.insert(rule.role.clone()) {
            return Err(CoreError::InvalidType(format!(
                "duplicate reference role {}",
                rule.role
            )));
        }
        if rule.minimum > rule.maximum {
            return Err(CoreError::InvalidType(format!(
                "reference role {} has minimum greater than maximum",
                rule.role
            )));
        }
        if !rule.attributes_schema.is_object() {
            return Err(CoreError::InvalidType(format!(
                "reference role {} attributes schema must be an object",
                rule.role
            )));
        }
        reject_forbidden_schema_features(&rule.attributes_schema)?;
    }

    if matches!(definition.blob_policy, BlobPolicy::Required)
        && definition.type_key.as_str() == "core.bundle"
    {
        return Err(CoreError::InvalidType(
            "core.bundle cannot require a blob".to_owned(),
        ));
    }
    Ok(())
}

fn reject_forbidden_schema_features(value: &CanonicalValue) -> Result<(), CoreError> {
    match value {
        CanonicalValue::Object(object) => {
            for (key, value) in object {
                if matches!(
                    key.as_str(),
                    "$dynamicRef" | "$recursiveRef" | "$anchor" | "$dynamicAnchor"
                ) {
                    return Err(CoreError::InvalidType(format!(
                        "schema keyword {key} is forbidden in v1"
                    )));
                }
                if key == "$ref" {
                    let CanonicalValue::String(reference) = value else {
                        return Err(CoreError::InvalidType("$ref must be a string".to_owned()));
                    };
                    if !reference.starts_with("#/$defs/") {
                        return Err(CoreError::InvalidType(format!(
                            "external or unsupported $ref {reference}"
                        )));
                    }
                }
                reject_forbidden_schema_features(value)?;
            }
        }
        CanonicalValue::Array(values) => {
            for value in values {
                reject_forbidden_schema_features(value)?;
            }
        }
        _ => {}
    }
    Ok(())
}
