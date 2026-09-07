# Minimal Artifact Store Implementation Plan

Status: implementation in progress; root vertical developer preview is executable

Date: 22 August 2026

Authority:

- [Core contract](artifact-store-spec/CORE-CONTRACT.md)
- [Security and recovery contract](artifact-store-spec/SECURITY-AND-RECOVERY.md)
- [SDK contract](artifact-store-spec/SDK-CONTRACT.md)
- [Conformance plan](artifact-store-spec/CONFORMANCE.md)

## Implementation status

Implemented on `feat/artifact-store` as of 22 August 2026:

- the reduced four-crate Rust workspace and standalone `serve`/`migrate`/`verify`
  binary;
- raw duplicate-preserving `artifact-json-v1` parsing, canonical serialization,
  schema validation and domain-separated type/artifact/publication digests;
- exact source-controlled `core.file@1` and `core.bundle@1` definitions;
- the first immutable PostgreSQL schema, including roots, runs, references, evidence,
  upload claims, recovery exclusions, store epoch/mode and scope-local feed sequence;
- upload claim creation/replay and digest/length/byte verification;
- atomic root and run publication persistence, blob-authority rechecks, permanent
  publication replay/conflict handling and upload consumption;
- exact artifact and whole/ranged content reads plus complete scope publication feed;
- a fixed-scope standalone adapter plus a shared per-customer runtime that accepts only
  validated internal `cust_*` routing, uses bounded database pools, and has no anonymous
  or JSON-supplied publisher fallback;
- customer-environment provisioning that installs the schema, built-in types, stable
  scope and preview runtime grants before readiness, including upgrade jobs for existing
  databases and connection revocation on suspension; and
- the independent `@avenos/artifact-store` TypeScript canonicalizer and root HTTP
  client, with passing Bun tests.

Verified against a disposable PostgreSQL 17 instance through context → upload → root
publication → exact replay → artifact/content read → feed replay. Equal content still
creates distinct occurrence UUIDs in the core tests.

Still required before the root milestone exit gate:

- frozen shared digest/DTO/OpenAPI fixtures and broader C-number coverage;
- constrained security-definer SQL functions, separate role grants and privilege
  inspection tests (the preview adapter currently uses direct table SQL);
- streaming upload admission, aggregate quotas, expiry cleanup, response bounds and
  failure/concurrency injection;
- artifact list/batch/reference/referrer/lineage reads with high-water cursors;
- TypeScript prepared-intent outbox/result verification/projector lifecycle; and
- short-lived signed `aven-api` authorization decisions (the current private routing
  header is bound by Aven API but authenticated by one shared coordinator token).

Complete run/graph read routes and the divergent recovery ceremony remain Slices 2 and
3. Therefore this implementation remains explicitly non-production despite the
working end-to-end root path.

This plan replaces the earlier broad service scaffold. It targets the finalized minimal
version-1 kernel and deliberately separates a fast developer-usable slice from a
conformant release.

## Outcome

Build one standalone Rust service backed by PostgreSQL that implements exactly:

1. immutable source-controlled type versions;
2. exact bounded blobs and expiring upload claims;
3. immutable scoped artifact occurrences with ordered structural references;
4. successful production runs with ordered pre-existing inputs and evidence;
5. permanent atomic publication identity; and
6. a complete scope-local publication feed.

The implementation is complete only when the real PostgreSQL roles/functions, real HTTP
server, reference SDK, shared fixtures, and divergent-restore drill pass C-001 through
C-051 in [CONFORMANCE.md](artifact-store-spec/CONFORMANCE.md).

There are two useful milestones:

| Milestone | Meaning | Production status |
| --- | --- | --- |
| Root vertical | Upload → root publication → exact read/content → feed replay | Developer/integration preview only |
| Core v1 | Roots, runs, evidence, graph reads, SDK/projector helpers and divergent recovery | Kernel-conformant; surrounding AvenOS production gates still apply |

The root vertical should arrive quickly. It must not be marketed as production-ready or
used for customer content before recovery, coordinator, authorization, backup and
content-lifecycle work is complete.

## Explicitly outside this implementation

Do not implement these while building the core:

- search, ranking, search mappings or vector retrieval;
- mutable current/preferred heads, todo state, cases, gates, jobs or attempts;
- cross-scope copy, personal-to-team movement or declassification;
- retention, erasure, holds or purge;
- payment, mail, calendar or other external execution;
- a server-side procedure registry;
- arbitrary external JSON Schema references;
- direct worker upload/publication capabilities;
- an alternative blob backend;
- Tauri embedded PostgreSQL or a Tauri-specific artifact-store crate; or
- deployment integration before the root vertical is stable.

Those capabilities remain application responsibilities or documented extensions. In
particular, the AvenOS coordinator and lifecycle extension are required for product
rollout but are not part of the core service implementation.

## Minimal repository structure

Recreate the service workspace with four Rust crates, not the previous five-crate
transport matrix:

```text
services/artifact-store/
  Cargo.toml
  Cargo.lock
  PLAN.md
  artifact-store-spec/
  crates/
    contract/
      src/
    core/
      src/
    postgres/
      migrations/
      src/
    server/
      src/
  conformance/
    fixtures/
      canonical-json/
      schema-profile/
      digests/
      locators/
      protocol/
      cursors/
    sql/
    tests/
```

| Crate | Responsibility |
| --- | --- |
| `aven-artifact-store-contract` | Closed wire DTOs, canonical value representation, limits, actor/publisher/scope identifiers, stable problem codes, cursor shapes and digest preimages. No HTTP or SQL. |
| `aven-artifact-store-core` | Type/profile validation, publication preparation, topological/local-key checks, canonical hashing, application use cases and narrow persistence/authorization ports. |
| `aven-artifact-store-postgres` | Immutable migrations, role/grant scripts, constrained publication/upload/read functions, transaction implementation and recovery administration. |
| `aven-artifact-store-server` | Standalone binary, configuration, authentication adapter, streaming HTTP, range responses, health/readiness and process subcommands. |

Dependency direction is one-way:

```text
server -> postgres -> core -> contract
   |                    ^
   +--------------------+
```

Add one TypeScript package after the wire contract is stable:

```text
libs/aven-artifact-store/
  src/client/
  src/schema/
  src/projector/
  tests/
```

Package name: `@avenos/artifact-store`. It is the first independent implementation of
canonicalization and the reference SDK required by the conformance plan. It shares
OpenAPI/JSON Schema output and golden fixtures, not Rust source code. Optional workflow
recipes wait until application integration.

No Rust HTTP client is required for the core milestone. Server tests can exercise the
wire contract directly, and the AvenOS coordinator will use the TypeScript SDK. Add a
Rust client later only when another Rust consumer exists.

## Boundary design

### Contract crate

The contract crate owns values whose exact shape can never be inferred from framework
defaults:

- `CanonicalValue`, with objects, arrays, strings, booleans, null and signed safe
  integers only;
- type definitions and closed ordered reference rules;
- `PublicationIntent` and replaceable `PublicationSubmission.blobAuthorities`;
- root/run command variants using closed tagged unions;
- upload declarations and claim results;
- artifact/run/feed/read envelopes;
- stable problem details and codes;
- pagination cursors and high-water boundaries; and
- domain-separated digest input builders.

Do not deserialize arbitrary payloads first into ordinary `serde_json::Value`. The
ingress parser must reject duplicate keys and unsafe numbers before information is
lost. Framework JSON extractors may be used only after their behavior is proven to call
the frozen parser without pre-normalization.

All wire structs reject unknown fields. API times are RFC 3339 UTC strings; exact
database timestamp conversion is tested. Digests use one frozen lowercase-hex lexical
form and are never accepted as content authority.

### Core crate

The core exposes use cases rather than a generic repository:

```text
context
list/get types
stage upload
publish roots or one successful run
list/get artifacts and content capability
read run/graph/evidence directions
read complete publications
```

Use separate ports for publication transactions, scoped reads, upload staging, type
administration and clocks/UUIDs. Publication gets one transaction-capable command port;
it must not assemble an atomic operation through a sequence of unrestricted CRUD
repositories.

The core prepares all bounded work before the scope sequence lock:

1. bind stable publisher and one authorized scope;
2. parse and freeze the exact intent;
3. resolve permanent publication replay/conflict identity;
4. load exact types, inputs, reference targets and byte-reuse sources;
5. validate payloads, reference rules, same-scope access and local-key order;
6. resolve upload/source authority to exact declared bytes;
7. allocate run/artifact UUIDs;
8. compute type/artifact/publication digests and immutable row set; and
9. call the single PostgreSQL publication command.

### PostgreSQL crate

The PostgreSQL adapter owns one `artifact_store` schema in the customer database. Use
separate credentials/roles for:

```text
migration and source-controlled type administration
runtime publication/upload
runtime scoped reads
recovery administration
```

Role creation/bootstrap may be a separately executed SQL file when the migration
connection cannot create roles. Schema migrations remain embedded and immutable.

Runtime roles receive no direct access to immutable tables or the global blob table.
Expose narrow constrained functions. The publication path should converge on one
security-definer function or equivalently constrained database command that inserts the
prepared publication/run/artifact/graph row set and rechecks every relational invariant
inside one transaction.

Rust performs canonical JSON, JSON Schema and digest validation. PostgreSQL independently
enforces:

- scope-local composite foreign keys;
- publication/publisher/semantic-digest uniqueness;
- final non-null immutable scope sequence;
- root versus derived shape;
- one run per publication and one producer per output;
- contiguous role/ordinal constraints validated by the publication function;
- blob digest/length binding;
- local reference/input/evidence ownership;
- recovery mode and publication-ID exclusions; and
- restrictive history foreign keys with no cascades.

### Server crate

The server is the only production composition root. It should expose subcommands from
one image while receiving distinct credentials:

```text
serve
migrate
verify
recover
```

`serve` never gets migration or recovery credentials. `migrate` never starts an HTTP
listener. `recover` refuses normal application credentials and operates only while
ordinary traffic is fenced.

The authentication adapter returns a server-created context containing stable
`issuer + subject`, one allowed scope, namespace grants, request/deadline metadata and
policy decision expiry. Request bodies cannot provide publisher or database context.
Use a deterministic test adapter only in integration-test builds; do not ship an
anonymous/default-scope fallback.

## Decisions to freeze in Slice 0

Make these decisions once, encode them as fixtures, and do not start the first migration
until server and TypeScript implementations agree:

1. UUID version and lower-case textual form.
2. Stable publisher representation as separate bounded `issuer` and `subject` values.
3. Actor envelope and identifier bounds.
4. Exact `artifact-json-v1` object-key order and safe-integer rules.
5. Exact allowed JSON Schema 2020-12 keyword/format subset.
6. Type-definition, artifact and publication digest domains and preimages.
7. Exact root/run/upload/read/feed DTO schemas and error bodies.
8. Every JSON, identifier, blob, upload, publication, graph, page and response bound.
9. Upload-claim lifetime, logical-byte quotas, cleanup grace and concurrency limits.
10. Cursor encodings and keyset ordering.
11. UTF-8 byte-range and integer page-region locator envelopes.
12. Exact `core.file@1` and `core.bundle@1` definitions and digests.
13. Scope-sequence allocation and transaction isolation behavior.
14. Recovery journal/exclusion payloads and supported restore horizon.

Use deliberately conservative initial limits. Version 1 stores blobs in PostgreSQL and
may buffer a bounded upload once after streaming/hash verification; do not adopt the old
100 MiB ceiling without measurement. A one-day upload spike should establish the first
blob maximum and memory/WAL behavior.

## Implementation sequence

### Slice 0 — executable contract

Goal: remove semantic uncertainty before SQL exists.

Deliver:

- OpenAPI and closed JSON Schemas for every v1 command/result/error;
- canonical JSON parser/serializer in Rust;
- the schema-profile validator wrapper;
- domain-separated digest implementations;
- exact built-in definitions;
- all golden fixtures required by Conformance section 2;
- the TypeScript canonicalizer and fixture runner; and
- short ADRs for the 14 decisions above.

Exit gate:

- Rust and TypeScript agree byte-for-byte on every valid vector;
- both reject every invalid vector for the same stable reason category;
- built-in type digests are frozen; and
- no migration exists yet.

Expected effort: roughly 3–5 focused engineering days. This is the highest-leverage
place to avoid later migration and SDK rewrites.

### Slice 1A — root artifact vertical

Goal: one real path through HTTP and PostgreSQL.

Deliver the minimal relations and functions for:

- `store_state`, scopes and per-scope sequence head;
- immutable type versions and migration-time built-in registration;
- blobs and publisher/scope-bound upload claims;
- publications and permanent replay/conflict identity;
- artifact records/contents and ordered structural references;
- publication-ID exclusions from the first schema;
- context and exact type reads;
- staged upload with streaming hash/length verification;
- root publication for `core.file` and `core.bundle`;
- exact artifact/content reads, including HEAD and byte ranges; and
- complete publication feed from sequence zero.

The first end-to-end fixture is:

```text
GET context
  -> PUT exact file upload
  -> durably prepared root PublicationIntent
  -> PUT root publication
  -> GET artifact and ranged content
  -> GET publication feed and hydrate exact artifact
  -> replay same publication UUID and receive original result
```

Add a second fixture that publishes two equal-byte file occurrences plus a bundle with
backward local references. This proves occurrence identity, physical deduplication,
reference digest semantics and atomic feed membership without runs yet.

Exit gate:

- the real database and HTTP stack pass C-001 through C-023 where applicable to roots,
  C-026 through C-028, C-035 through C-040 for root resources, and all negative scope/
  authority tests;
- runtime SQL cannot mutate history or read blobs globally; and
- an ambiguous disconnect replays one permanent publication.

Expected effort after Slice 0: roughly 7–10 focused engineering days. This is the first
developer-usable milestone, not the conformant release.

### Slice 1B — complete root reads, limits and SDK lifecycle

Goal: remove shortcuts from the preview slice.

Deliver:

- all exact artifact collection and batch-get filters;
- reference/referrer and bounded lineage pagination;
- upload admission reservations, aggregate quotas, expiry and cleanup;
- fixed high-water cursors and response-size enforcement;
- TypeScript prepared intent, outbox interface and result verification;
- universal publication replay and artifact-oriented projector bootstrap helpers; and
- fault injection around every root publication phase.

Exit gate:

- all root-applicable C-001 through C-042 tests pass;
- a single publication can always fit in one configured feed response; and
- the SDK never puts transient upload/source authority into semantic identity.

Expected effort: roughly 5–8 focused engineering days.

### Slice 2 — successful runs and evidence

Goal: complete the provenance kernel.

Deliver:

- production run, ordered input and evidence relations;
- run publication variant with one run and one or more outputs;
- output producer role/ordinal enforcement;
- `artifact-root`, `json-pointer`, `byte-range` and `page-region` validation;
- run, producer, producer-input, sibling-output, consuming-run, direct-derivation,
  supporting-evidence and evidence-usage routes;
- bounded directional lineage; and
- TypeScript procedure descriptors and typed evidence builder.

Use one small domain test family, not the 52-type inventory:

```text
core.file@1 root
  -> document classification output
  -> OCR text output with byte/page evidence
  -> one multi-output run fixture
```

Fractional confidence uses a scaled integer or constrained decimal string under the
final JSON profile. OCR text locators use UTF-8 byte offsets, not NFC/code-point offsets.

Exit gate:

- every run/evidence assertion C-017 through C-034 passes;
- a failure at any point exposes no run/output/feed state;
- production inputs always come from earlier publications; and
- every graph direction paginates without later-history drift.

Expected effort: roughly 5–8 focused engineering days.

### Slice 3 — divergent recovery

Goal: make permanent publication identity true after restore, not only during normal
operation.

Deliver:

- `normal`/`reconciling` writer fence in every mutation path;
- fresh epoch transition under recovery credentials;
- authenticated publisher journal import and completion watermarks;
- exact publication restoration with original IDs/sequence/time;
- immutable publication-ID/result-ID exclusions when exact restoration is impossible;
- causal dependency ordering and dependent exclusion;
- cursor invalidation and pending-old-epoch behavior;
- integrity verification and atomic reopening; and
- a scripted PostgreSQL snapshot/restore drill predating an acknowledged publication.

Do not simulate this only with mocked repository calls. The test must restore a real
database snapshot while traffic credentials are disabled.

Exit gate: C-043 through C-051 pass, including missing-publisher watermark, exact
restore, permanent exclusion and corruption fencing cases.

Expected effort: roughly 7–12 focused engineering days. This is on the critical path to
a conformant core release.

### Slice 4 — release hardening

Goal: produce repeatable release evidence rather than a green developer machine.

Deliver:

- CI against the supported PostgreSQL version;
- migration-up and privilege inspection tests;
- bounded concurrency/load tests for upload, publication, graph and feed limits;
- dependency/license/security checks;
- reproducible server image with non-root/read-only defaults;
- `serve`, `migrate`, `verify` and recovery smoke tests using distinct credentials; and
- a conformance report listing every C-001 through C-051 result and fixture version.

Exit gate:

```text
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
bun test libs/aven-artifact-store/tests
real PostgreSQL conformance suite C-001..C-051
snapshot/restore recovery drill
```

Expected effort: roughly 5–8 focused engineering days, with much of it developed
incrementally in earlier slices.

## Fastest staffing and sequencing

For one experienced Rust/PostgreSQL engineer:

- first real root-artifact vertical: approximately 2–3 working weeks;
- full core through runs/evidence: approximately 4–6 working weeks; and
- conformance including divergent recovery and release evidence: approximately 6–9
  working weeks.

These are planning ranges, not delivery promises. Recovery, driver byte behavior and
canonicalization library behavior are the largest uncertainties.

With two engineers, parallelize only after Slice 0 freezes the contract:

| Stream | Work |
| --- | --- |
| Core/database | Migrations, roles, constrained functions, publication transaction and recovery |
| Protocol/SDK | HTTP handlers, TypeScript client/schema/projector and cross-language fixtures |

Both streams share the same conformance fixtures. Avoid separate interpretations of
the command, digest or cursor contract.

## Testing strategy

Treat every normative C-number as a test ID in source. Organize tests by owned layer:

```text
contract tests
  duplicate keys, integers, canonical bytes, schema profile, digest vectors, DTO closure

core tests
  command shape, local ordering, ordinals, locators, semantic intent, response limits

PostgreSQL tests
  roles, immutable grants/triggers, scope FKs, concurrency, sequence, replay, rollback

HTTP tests
  authentication, streaming, range, problem codes, pagination, non-disclosure

SDK/projector tests
  outbox lifecycle, authority replacement, result verification, replay/checkpoint

recovery tests
  real snapshot restore, journal watermark, exact restore, exclusions, epoch fencing
```

Use two scopes and two stable publishers in the fixture database from the beginning.
Rotate credentials for one stable publisher. This prevents a single-scope happy path
from hiding authorization and idempotency errors until late in development.

## Implementation rules that preserve speed

- Write one root vertical end to end before adding all read routes.
- Register only exact built-ins and the types required by the current test slice.
- Keep one bounded PostgreSQL blob backend and measure before abstracting it.
- Use one publication command; do not add per-domain endpoints.
- Keep all structural roles ordered; do not implement a set mode.
- Require backward local references; do not implement recursive cycle detection.
- Keep inputs pre-existing; do not support same-publication production chains.
- Use transparent scope-local cursors for v1; sealed multi-scope cursors are deferred.
- Use migration-time type administration only.
- Reject unknown/unsupported values rather than adding compatibility coercion.
- Keep all long-running computation and byte acquisition outside the publication
  transaction.
- Allocate the scope sequence only in the final short locked phase.
- Add no application convenience that cannot compile to the exact publication intent.

## Risks and early spikes

| Risk | Spike/mitigation |
| --- | --- |
| Duplicate-key and exact-integer parsing is lost by a framework extractor | Parse raw request bytes through the contract parser before framework DTO conversion |
| JSON Schema library behavior differs across Rust/TypeScript | Freeze the subset and run shared invalid/valid fixtures before migrations |
| PostgreSQL driver duplicates large `BYTEA` memory | Measure stream → hash/count → bounded buffer → insert; set the initial blob limit from evidence |
| Publication SQL becomes an untestable giant function | Pass a prepared bounded row set, keep canonical logic in Rust, and give relational checks focused SQL tests |
| Sequence allocation serializes too much work | Resolve/validate/hash before locking the scope counter; instrument lock duration |
| Pagination drifts under concurrent writes | Bind every collection cursor to epoch, scope, filters and first-page high-water |
| Recovery is postponed behind product features | Create state/exclusion schema in Slice 1 and schedule the real restore drill as Slice 3 release-blocking work |
| UI mock drives kernel features back in | Test UI through projector/client fixtures; keep search, gates and current state outside the service |

## Immediate first pull request

The first implementation PR should contain only:

1. the four-crate workspace and dependency direction checks;
2. the conformance fixture directory and C-test naming convention;
3. ADRs/decision records for UUID, publisher/actor, JSON, schema profile, digests, DTOs,
   cursors and limits;
4. Rust canonical JSON plus type/artifact/publication digest vectors;
5. the independent TypeScript vector runner;
6. exact `core.file@1` and `core.bundle@1` source definitions; and
7. CI for formatting, linting and those fixture tests.

It should not contain a database migration, HTTP route, Tauri command, search API,
artifact projector or domain catalog migration. The first migration starts only after
that PR proves the frozen bytes and schemas in two implementations.

## Core handoff boundary

After C-001 through C-051 pass, the next application work is intentionally separate:

1. provision the artifact store and AvenOS coordinator in each customer environment;
2. add the stable coordinator service publisher and `aven-api` scope decision contract;
3. implement the coordinator outbox, acknowledgment journal and byte spool;
4. build AvenOS projections/search from the publication feed;
5. connect Tauri through typed coordinator commands; and
6. install the lifecycle extension before real customer ingestion.

Keeping this boundary explicit lets the core ship quickly without pretending that a
standalone immutable database alone completes the AvenOS product safety model.
