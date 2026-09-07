use std::fmt;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum TokenError {
    #[error("{field} must match {pattern}")]
    Invalid {
        field: &'static str,
        pattern: &'static str,
    },
    #[error("{field} must contain between 1 and {max} UTF-8 bytes")]
    InvalidBound { field: &'static str, max: usize },
}

macro_rules! protocol_token {
    ($name:ident, $field:literal) => {
        #[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            /// Create a bounded protocol token.
            ///
            /// # Errors
            ///
            /// Returns an error when the value is outside the frozen lexical profile.
            pub fn new(value: impl Into<String>) -> Result<Self, TokenError> {
                let value = value.into();
                let valid = !value.is_empty()
                    && value.len() <= 64
                    && value.as_bytes()[0].is_ascii_lowercase()
                    && value.bytes().all(|byte| {
                        byte.is_ascii_lowercase()
                            || byte.is_ascii_digit()
                            || byte == b'_'
                            || byte == b'-'
                    });
                if valid {
                    Ok(Self(value))
                } else {
                    Err(TokenError::Invalid {
                        field: $field,
                        pattern: "^[a-z][a-z0-9_-]{0,63}$",
                    })
                }
            }

            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                let value = String::deserialize(deserializer)?;
                Self::new(value).map_err(serde::de::Error::custom)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

protocol_token!(LocalKey, "localKey");
protocol_token!(Role, "role");

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(transparent)]
pub struct TypeKey(String);

impl TypeKey {
    /// Create a bounded namespaced type key.
    ///
    /// # Errors
    ///
    /// Returns an error when the value is outside the frozen lexical profile.
    pub fn new(value: impl Into<String>) -> Result<Self, TokenError> {
        let value = value.into();
        let valid = !value.is_empty()
            && value.len() <= 128
            && value.as_bytes()[0].is_ascii_lowercase()
            && value.bytes().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'-')
            })
            && !value.ends_with(['.', '-'])
            && !value.contains("..")
            && !value.contains("--")
            && !value.contains(".-")
            && !value.contains("-.");
        if valid {
            Ok(Self(value))
        } else {
            Err(TokenError::Invalid {
                field: "typeKey",
                pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$",
            })
        }
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for TypeKey {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Self::new(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

impl fmt::Display for TypeKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StablePublisher {
    pub issuer: String,
    pub subject: String,
}

impl StablePublisher {
    /// Validate the bounded stable security-subject representation.
    ///
    /// # Errors
    ///
    /// Returns an error when either stable identifier is empty or too long.
    pub fn validate(&self) -> Result<(), TokenError> {
        validate_bounded("publisher.issuer", &self.issuer, 255)?;
        validate_bounded("publisher.subject", &self.subject, 255)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Actor {
    pub kind: TypeKey,
    pub id: String,
}

impl Actor {
    /// Validate a logical actor kind and its bounded identifier.
    ///
    /// # Errors
    ///
    /// Returns an error for an unsupported kind or invalid identifier bounds.
    pub fn validate(&self) -> Result<(), TokenError> {
        if !matches!(
            self.kind.as_str(),
            "user" | "service" | "agent" | "connector" | "device" | "external-system"
        ) {
            return Err(TokenError::Invalid {
                field: "actor.kind",
                pattern: "user|service|agent|connector|device|external-system",
            });
        }
        validate_bounded("actor.id", &self.id, 255)
    }
}

fn validate_bounded(field: &'static str, value: &str, max: usize) -> Result<(), TokenError> {
    if value.is_empty() || value.len() > max {
        Err(TokenError::InvalidBound { field, max })
    } else {
        Ok(())
    }
}
