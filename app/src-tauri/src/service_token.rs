//! Bounded, native-memory reuse of identity-issued service credentials.
//! This is not an authorization cache: downstream services still verify every JWT.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAX_REUSE: Duration = Duration::from_secs(60);
const EXPIRY_MARGIN: u64 = 15;

struct Entry {
    session_key: [u8; 32],
    token: String,
    expires_at: u64,
    refresh_at: Instant,
}

#[derive(Default)]
pub(crate) struct ServiceTokenCache(Mutex<Option<Entry>>);

impl ServiceTokenCache {
    pub(crate) const fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub(crate) fn clear(&self) {
        if let Ok(mut entry) = self.0.lock() {
            *entry = None;
        }
    }

    pub(crate) fn get(
        &self,
        session: &str,
        exchange: impl FnOnce() -> Result<String, String>,
    ) -> Result<String, String> {
        // Keep the refresh serialized. Calls already run on native blocking workers;
        // releasing this lock before exchange would mint once per concurrent reader.
        let mut cache = self
            .0
            .lock()
            .map_err(|_| "Service credential state is unavailable.")?;
        let session_key: [u8; 32] = Sha256::digest(session.as_bytes()).into();
        if let Some(entry) = cache.as_ref() {
            if entry.session_key == session_key
                && Instant::now() < entry.refresh_at
                && unix_seconds().saturating_add(EXPIRY_MARGIN) < entry.expires_at
            {
                return Ok(entry.token.clone());
            }
        }
        // A failed refresh never falls back to a previous session or stale token.
        *cache = None;
        let token = exchange()?;
        let expires_at = token_expiry(&token)?;
        let reusable_seconds = expires_at
            .checked_sub(unix_seconds().saturating_add(EXPIRY_MARGIN))
            .filter(|remaining| *remaining > 0)
            .ok_or_else(|| "The identity service returned an expired service token.".to_string())?;
        *cache = Some(Entry {
            session_key,
            token: token.clone(),
            expires_at,
            refresh_at: Instant::now() + MAX_REUSE.min(Duration::from_secs(reusable_seconds)),
        });
        Ok(token)
    }
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn token_expiry(token: &str) -> Result<u64, String> {
    let invalid = || "The identity service returned an invalid service token.".to_string();
    let parts: Vec<_> = token.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|part| part.is_empty()) {
        return Err(invalid());
    }
    // Parse only to shorten local reuse. Signature, issuer, audience, session and
    // entitlement verification remain mandatory at the product service boundary.
    let payload = URL_SAFE_NO_PAD.decode(parts[1]).map_err(|_| invalid())?;
    let claims: serde_json::Value = serde_json::from_slice(&payload).map_err(|_| invalid())?;
    claims
        .get("exp")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(invalid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    fn token(expires_at: u64) -> String {
        format!(
            "header.{}.signature",
            URL_SAFE_NO_PAD.encode(format!(r#"{{"exp":{expires_at}}}"#))
        )
    }

    #[test]
    fn service_token_single_flight_handles_more_than_the_identity_rate_limit() {
        let cache = Arc::new(ServiceTokenCache::new());
        let exchanges = Arc::new(AtomicUsize::new(0));
        let expected = token(unix_seconds() + 300);
        let readers: Vec<_> = (0..80)
            .map(|_| {
                let cache = cache.clone();
                let exchanges = exchanges.clone();
                let expected = expected.clone();
                std::thread::spawn(move || {
                    cache
                        .get("session-a", || {
                            exchanges.fetch_add(1, Ordering::SeqCst);
                            Ok(expected)
                        })
                        .unwrap()
                })
            })
            .collect();
        for reader in readers {
            assert_eq!(reader.join().unwrap(), expected);
        }
        assert_eq!(exchanges.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn service_token_is_session_bound_and_clear_discards_credentials() {
        let cache = ServiceTokenCache::new();
        let first = token(unix_seconds() + 300);
        let second = token(unix_seconds() + 301);
        assert_eq!(cache.get("a", || Ok(first.clone())).unwrap(), first);
        assert_eq!(cache.get("b", || Ok(second.clone())).unwrap(), second);
        cache.clear();
        assert!(cache.get("b", || Err("revoked".into())).is_err());
        assert!(cache.0.lock().unwrap().is_none());
    }

    #[test]
    fn service_token_refreshes_on_either_clock_and_never_serves_stale_on_failure() {
        let cache = ServiceTokenCache::new();
        for wall_expired in [false, true] {
            cache.get("a", || Ok(token(unix_seconds() + 300))).unwrap();
            {
                let mut entry = cache.0.lock().unwrap();
                let entry = entry.as_mut().unwrap();
                if wall_expired {
                    entry.expires_at = unix_seconds();
                } else {
                    entry.refresh_at = Instant::now();
                }
            }
            assert_eq!(
                cache
                    .get("a", || Err("identity unavailable".into()))
                    .unwrap_err(),
                "identity unavailable"
            );
            assert!(cache.0.lock().unwrap().is_none());
        }
    }

    #[test]
    fn service_token_rejects_malformed_missing_or_expired_expiry() {
        let cache = ServiceTokenCache::new();
        for invalid in [
            "not-a-token".to_string(),
            "x.e30.y".to_string(),
            token(unix_seconds()),
        ] {
            assert!(cache.get("a", || Ok(invalid)).is_err());
            assert!(cache.0.lock().unwrap().is_none());
        }
    }
}
