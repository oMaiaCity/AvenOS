use std::collections::{btree_map::Entry, BTreeMap};
use std::fmt;

use serde::de::{MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;

/// Largest integer accepted by the interoperable Artifact JSON v1 profile.
pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

/// JSON retained by the artifact store. Floats and out-of-profile integers cannot be
/// represented by this type.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CanonicalValue {
    Null,
    Bool(bool),
    Integer(i64),
    String(String),
    Array(Vec<Self>),
    Object(BTreeMap<String, Self>),
}

impl CanonicalValue {
    #[must_use]
    pub fn is_object(&self) -> bool {
        matches!(self, Self::Object(_))
    }

    /// Return the one canonical UTF-8 representation used by every digest domain.
    #[must_use]
    pub fn canonical_bytes(&self) -> Vec<u8> {
        let mut output = Vec::new();
        self.write_canonical(&mut output);
        output
    }

    fn write_canonical(&self, output: &mut Vec<u8>) {
        match self {
            Self::Null => output.extend_from_slice(b"null"),
            Self::Bool(true) => output.extend_from_slice(b"true"),
            Self::Bool(false) => output.extend_from_slice(b"false"),
            Self::Integer(value) => output.extend_from_slice(value.to_string().as_bytes()),
            Self::String(value) => {
                output.extend_from_slice(
                    serde_json::to_string(value)
                        .expect("serializing a valid Rust string cannot fail")
                        .as_bytes(),
                );
            }
            Self::Array(values) => {
                output.push(b'[');
                for (index, value) in values.iter().enumerate() {
                    if index > 0 {
                        output.push(b',');
                    }
                    value.write_canonical(output);
                }
                output.push(b']');
            }
            Self::Object(values) => {
                output.push(b'{');
                for (index, (key, value)) in values.iter().enumerate() {
                    if index > 0 {
                        output.push(b',');
                    }
                    output.extend_from_slice(
                        serde_json::to_string(key)
                            .expect("serializing a valid Rust string cannot fail")
                            .as_bytes(),
                    );
                    output.push(b':');
                    value.write_canonical(output);
                }
                output.push(b'}');
            }
        }
    }
}

impl Serialize for CanonicalValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Null => serializer.serialize_none(),
            Self::Bool(value) => serializer.serialize_bool(*value),
            Self::Integer(value) => serializer.serialize_i64(*value),
            Self::String(value) => serializer.serialize_str(value),
            Self::Array(values) => values.serialize(serializer),
            Self::Object(values) => values.serialize(serializer),
        }
    }
}

impl<'de> Deserialize<'de> for CanonicalValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(CanonicalVisitor)
    }
}

struct CanonicalVisitor;

impl<'de> Visitor<'de> for CanonicalVisitor {
    type Value = CanonicalValue;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Artifact JSON v1 value")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(CanonicalValue::Null)
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(CanonicalValue::Null)
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
        Ok(CanonicalValue::Bool(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&value) {
            Ok(CanonicalValue::Integer(value))
        } else {
            Err(E::custom("integer is outside the Artifact JSON safe range"))
        }
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if value <= MAX_SAFE_INTEGER as u64 {
            Ok(CanonicalValue::Integer(
                i64::try_from(value).expect("safe JSON integer fits i64"),
            ))
        } else {
            Err(E::custom("integer is outside the Artifact JSON safe range"))
        }
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Err(E::custom(
            "fractional or exponent JSON numbers are not allowed by Artifact JSON v1",
        ))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(CanonicalValue::String(value.to_owned()))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(CanonicalValue::String(value))
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element()? {
            values.push(value);
        }
        Ok(CanonicalValue::Array(values))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = BTreeMap::new();
        while let Some((key, value)) = map.next_entry::<String, CanonicalValue>()? {
            match values.entry(key) {
                Entry::Vacant(entry) => {
                    entry.insert(value);
                }
                Entry::Occupied(entry) => {
                    return Err(serde::de::Error::custom(format!(
                        "duplicate object key {:?}",
                        entry.key()
                    )));
                }
            }
        }
        Ok(CanonicalValue::Object(values))
    }
}

#[derive(Debug, Error)]
pub enum CanonicalError {
    #[error("invalid Artifact JSON v1: {0}")]
    Invalid(#[from] serde_json::Error),
    #[error("a top-level protocol or schema document must be an object")]
    RootNotObject,
}

/// Parse without losing duplicate-key or number-token information.
///
/// # Errors
///
/// Returns an error for malformed UTF-8/JSON, duplicate object keys, out-of-profile
/// numbers, trailing content, or a non-object root when `require_object` is true.
pub fn parse_canonical(
    bytes: &[u8],
    require_object: bool,
) -> Result<CanonicalValue, CanonicalError> {
    let mut deserializer = serde_json::Deserializer::from_slice(bytes);
    let value = CanonicalValue::deserialize(&mut deserializer)?;
    deserializer.end()?;
    if require_object && !value.is_object() {
        return Err(CanonicalError::RootNotObject);
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[test]
    fn sorts_keys_without_normalizing_strings() {
        let value = parse_canonical(br#"{"z":1,"a":"e\u0301","nested":{"b":2,"a":1}}"#, true)
            .expect("valid value");
        let expected = format!(r#"{{"a":"e{}","nested":{{"a":1,"b":2}},"z":1}}"#, '\u{301}');
        assert_eq!(value.canonical_bytes(), expected.as_bytes());
    }

    #[test]
    fn rejects_duplicate_keys_before_a_map_can_overwrite_them() {
        let error = parse_canonical(br#"{"a":1,"a":2}"#, true).expect_err("must reject");
        assert!(error.to_string().contains("duplicate object key"));
    }

    #[test]
    fn rejects_floats_exponents_and_unsafe_integers() {
        for input in ["1.0", "1e3", "9007199254740992", "-9007199254740992"] {
            assert!(parse_canonical(input.as_bytes(), false).is_err(), "{input}");
        }
    }

    #[derive(Deserialize)]
    struct FixtureFile {
        valid: Vec<ValidFixture>,
        invalid: Vec<InvalidFixture>,
    }

    #[derive(Deserialize)]
    struct ValidFixture {
        name: String,
        input: String,
        canonical: String,
    }

    #[derive(Deserialize)]
    struct InvalidFixture {
        name: String,
        input: String,
    }

    #[test]
    fn passes_shared_canonical_json_vectors() {
        let fixtures: FixtureFile = serde_json::from_str(include_str!(
            "../../../conformance/fixtures/canonical-json/artifact-json-v1.json"
        ))
        .expect("fixture file is valid JSON");
        for fixture in fixtures.valid {
            let value = parse_canonical(fixture.input.as_bytes(), false)
                .unwrap_or_else(|error| panic!("{}: {error}", fixture.name));
            assert_eq!(
                value.canonical_bytes(),
                fixture.canonical.as_bytes(),
                "{}",
                fixture.name
            );
        }
        for fixture in fixtures.invalid {
            assert!(
                parse_canonical(fixture.input.as_bytes(), false).is_err(),
                "{}",
                fixture.name
            );
        }
    }
}
