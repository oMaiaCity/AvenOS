# Runtime security controls

Status: authoritative

These controls limit the impact of a bad request or failing service without adding a
daily administration job. Changes to a limit belong with a regression test and this
document. They do not replace customer authorization, backups or incident response.

## Request budgets

Application readers count actual streamed bytes before JSON parsing or full buffering.
They also validate declared length, cancel an oversized stream, reject unsupported
content encoding, and stop a body that takes over 30 seconds. Oversize is 413,
unsupported encoding 415, and body deadline 408. Validation failures are 400; some
facade control handlers currently normalize body errors to 400 after enforcing the bound.

| Surface | Maximum input | Intended content |
| --- | --- | --- |
| Identity `/api/passkeys`, `/internal/v1/accounts` | 4 KiB | Credential metadata or verified email/source |
| Identity `/internal/v1/authorizations/roles` | 32 KiB | Bounded authorization update |
| Identity `/api/auth/device/*` | 16 KiB | Device approval/exchange fields |
| Other identity mutations, including WebAuthn | 128 KiB | Authentication protocol payloads, not documents |
| Checkout `/api/webhooks/polar` | 1 MiB | Exact signed raw webhook JSON |
| Checkout `/api/billing/*`, except local fake payment | 8 KiB | Purchase identifiers and commands |
| Other checkout mutations, including name hold and local fake payment | 16 KiB | Small form/command payloads |
| Checkout `/internal/v1/identity-mail` | 16 KiB | Environment-bound, authenticated fixed security events; no arbitrary HTML or caller-selected action URL |
| Facade LLM routes, including internal completion | 2 MiB | Text and artifact references; not bulk embedded files |
| Facade customer Intent routes and Intent Service | 256 KiB | Intent mutation payload |
| Facade Actor routes and Actor Runner commands | 1 MiB | Admission/control payload; large material belongs in Artifact Store |
| Other facade downstream proxy mutations | 1 MiB | Bounded service commands |
| Facade artifact client-run upload | 8 MiB | Client execution envelope |
| Facade artifact file upload | 25 MiB | Streaming binary file; Artifact Store enforces actual size |
| Facade hosting bindings and host reports | 64 KiB | Repository/host metadata |
| Facade internal entitlement event | 16 KiB | Customer lifecycle fact |

The reverse proxy adds whole-surface ceilings of 128 KiB for identity, 1 MiB for
checkout and 25 MiB for the facade. These are outer bounds, not permission to exceed
a smaller application limit. Downloads and bounded LLM response streams have separate
budgets. An internal model adapter's larger image limit does not enlarge public ingress.

## Proxy identity and boundary signals

Identity's setup-mail outbox retries through the provisioning environment's checkout
mail queue. This adds a post-start dependency, not a startup cycle: identity can start
before checkout, and failed/stale delivery makes capability health degraded. Relay
authentication is distinct from ordinary user JWTs and is derived automatically; a
next relay credential cannot authorize production mail. See the [identity component
contract](../../services/identity/README.md#pending-enrollment) for retry and retention limits.

Caddy overwrites `X-Forwarded-For` with its transport peer. The Svelte adapters trust
exactly one proxy hop (`ADDRESS_HEADER=X-Forwarded-For`, `XFF_DEPTH=1`); their ports
are not public. Do not add another proxy without updating and testing this chain.
Name-hold limits remain per client address, so people behind one NAT share that limit.

The facade's internal control surface, Intent Service and Actor Runner collect bounded
counts of denied authentication/authorization and request-budget failures. Once per
minute they emit a structured `boundary` summary with a maximum of eight transport-peer
addresses. No request bodies, tokens or caller-selected labels enter these summaries.
Use them as invariant violations during incident triage, not as an autonomous intrusion
detection or blocking system. There is no cross-host correlation or external log archive.

## Container and host containment

Long-running application containers use non-root users, read-only roots, dropped
capabilities, PID/memory/CPU limits, and size-bounded temporary filesystems. PostgreSQL
retains only the capabilities its entrypoint needs; Caddy retains low-port binding.
Each child-spawning container uses an init process to reap exited children. The local
full-stack harness applies the production policy rather than testing an unrestricted
equivalent. Read-write data volumes remain explicit exceptions.

PostgreSQL records connections and disconnections with database/user/client context,
but not statement text or bind values. Error statement logging is disabled for ordinary
errors. This is operational audit evidence, not a complete tamper-evident access audit.
Container and journal retention remain bounded as described in [Maintenance](maintenance.md).

Public HTTPS origins send host-only HSTS and content-type protection. HSTS deliberately
omits `includeSubDomains` and preload because unrelated subdomains remain outside this
installation. It does not configure DNSSEC or establish storage encryption at rest.

## Static repository materialization

Static hosting fetches only the configured repository/ref into a fresh disposable Git
directory, without tags or partial-clone lazy fetches. Each child command has a
120-second deadline and 8 MiB output cap; the whole job has a 180-second budget.
The repository tree is inspected before checkout: at most 10,000 files, 256 MiB regular
file content, depth 20 and path length 1,024. Symlinks and special objects are rejected.
Checkout is checked again and must contain the expected source revision.

Disk sampling runs every 250 ms with a bounded object/file budget. It is not an exact
filesystem quota: one interval's growth can overshoot. The container adds a per-file
512 MiB ceiling, PID/memory limits and at most two concurrent synchronizations. Failed
materializations are removed; only two successful releases are retained. A repository
exceeding these limits fails closed rather than publishing an incomplete site.

## Desktop permissions

The Tauri webview can listen to and unsubscribe from native events and ask the URL
opener to open HTTPS links or HTTP loopback links. These support native progress/events,
identity approval and local development. Blanket core/window/webview/event permissions,
file revelation and mail/telephone URL permissions are not granted.

Application-owned Rust commands still implement document import, artifacts, voice and
other native functions. Removing plugin permissions does not sandbox those commands;
their input validation remains part of review. E2E-only commands require a build feature
and must not enter distributed builds. HTTPS opening still permits external destinations;
it is not restricted to Aven origins because the product opens external document links.

## Deliberate remaining decisions

VPN enrollment, hardware-backed break-glass keys, independent immutable backups,
operator-independent recovery, full database encryption at rest, LLM spending quotas
and raw billing-data retention need separate product or operational decisions. Do not
describe these as implemented because adjacent automatic controls exist.
