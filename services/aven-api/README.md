# Aven API facade (`api.aven.ceo`)

The facade has no user database, credential ceremony, checkout, or business
storage. It verifies short-lived `aven-services` JWTs from `aven.id`, selects a
configured route, replaces the end-user credential with a service credential,
and forwards the verified subject, role, and session identifiers. It also
carries the original signed token in `x-aven-identity-token`, so a downstream
can independently apply `@avenos/aven-identity` verification before enforcing
its resource policy.

Routes are an explicit prefix allowlist in `DOWNSTREAMS_JSON`. Each entry fixes
the external prefix, target origin/path prefix, service bearer token, and
allowed coarse identity roles. Arbitrary target URLs are never accepted from
requests. Product entitlements and resource authorization remain downstream or
in a future grant-issuing control-plane component; they do not move into
`aven.id`.

The server actor runtime is one such fixed downstream. Configure the exact public
prefix `/api/actor-runs`, a fixed `os.aven` runner origin, and a dedicated service
bearer. The runner independently verifies `x-aven-identity-token`; the facade's
projected headers alone never authorize actor execution.
