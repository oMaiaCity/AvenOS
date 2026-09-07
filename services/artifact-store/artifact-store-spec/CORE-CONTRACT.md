# Artifact Store Core Contract

Status: proposed normative contract for Slices 0–2

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

This document is the implementation-facing kernel contract derived from
[the reviewed design record](ARTIFACT-STORE-MINIMAL-CORE.md). SDK behavior is specified
in [SDK-CONTRACT.md](SDK-CONTRACT.md), deployment trust and divergent recovery in
[SECURITY-AND-RECOVERY.md](SECURITY-AND-RECOVERY.md), and release tests in
[CONFORMANCE.md](CONFORMANCE.md).

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. All limits,
lexical forms, schemas, canonicalization vectors, and locator envelopes named here
MUST be frozen before the first public SDK or migration is released.

## 1. Kernel boundary

Version 1 provides exactly these durable concepts:

1. immutable artifact type versions;
2. exact bounded blobs;
3. immutable typed artifact occurrences;
4. immutable ordered structural references;
5. successful production runs with ordered inputs and evidence;
6. atomic publications with permanent client identity; and
7. one scope-local ordered publication feed.

Search, mutable current/preferred state, jobs, attempts, cross-scope transfer, a
procedure registry, legal-policy decisions, holds, purge, external execution, and
portable signing are not kernel concepts.

One database is assumed to be one customer or equivalently strong isolation boundary.
Every operation names one scope. Inputs, reference targets, byte-reuse sources, graph
reads, and feed reads MUST remain in that scope.

## 2. Identity and immutability

The store exposes three independent identities:

| Identity | Meaning | Authority |
| --- | --- | --- |
| Blob SHA-256 plus length | Exact bytes | Never grants read or reuse by itself |
| Artifact SHA-256 | Canonical typed content | Equality diagnostic, never occurrence authority |
| Artifact UUID | One immutable occurrence | Scope-authorized durable graph identity |

Equal bytes or equal artifact digests MUST NOT collapse occurrences. A new publication
ID MAY intentionally create a new occurrence with identical content.

Each artifact has at most one primary blob. Multipart values are typed artifacts that
structurally reference exact member artifacts, not rows in a generic attachment table.

Runtime credentials MUST NOT update or delete committed types, publications, runs,
artifact records, artifact content, references, inputs, evidence, or blobs still in
use. Historical foreign keys MUST use restrictive, non-cascading behavior.

Each occurrence is represented by a stable `artifact_records` envelope and exactly one
`artifact_contents` row. Version 1 creates both atomically and provides no content
removal operation. A missing content row is `INTEGRITY_FAILURE`, not an ordinary
tombstone.

## 3. Type versions

A type is identified by `(type_key, integer_version)`. Its immutable definition MUST
contain:

```text
type_key
version
schema_profile_id
payload_schema
blob_policy
reference_rules
type_definition_sha256
created_at
```

`blob_policy` is `forbidden`, `optional`, or `required`. A repeated registration of an
existing key/version succeeds only when its definition digest is identical.

Types are registered through source-controlled deployment administration. Runtime
publishers MUST NOT register or mutate them.

### 3.1 Schema profile

All version-1 payloads use the frozen `artifact-json-schema-profile-v1` subset of JSON
Schema 2020-12. The root MUST be an object. Local `$defs` and acyclic local fragment
references of the form `#/$defs/...` are allowed. Network, file, external, dynamic,
anchor-based, and recursive references are forbidden.

Registered schemas MUST be self-contained. A future common-type compiler MAY expand a
versioned source package into local `$defs` before registration; the expanded schema
and its digest remain authoritative.

Validation MUST NOT coerce, strip, normalize, or insert defaults. Implementations MUST
pass the shared profile conformance suite. The type digest includes the profile ID,
schema, blob policy, and reference rules—not a validator library version.

### 3.2 Reference rules

Every declared reference role MUST define minimum/maximum count, allowed exact target
type versions or an explicit unrestricted set, and a closed bounded schema for edge
attributes.

Every version-1 structural role is ordered. Ordinals MUST be contiguous from zero per
role. There is no unordered role mode. Applications that model a set MUST choose and
document a deterministic order before publication.

### 3.3 Built-in types

The first release registers only two generic built-ins:

- `core.file@1` requires one primary blob, forbids references, and has a small payload
  for bounded display/original name, declared media type, and source kind. A detected
  media type is operational serving data or a later versioned evaluation, never an
  unversioned mutation of this payload.
- `core.bundle@1` forbids a blob and has one ordered `member` role with bounded path or
  label attributes. Its payload contains only purpose and optional bounded display
  name. It is not tags, case state, semantic relations, or a mutable collection.

Applications SHOULD define domain email, corpus, dataset, release, invoice, decision,
request, and receipt types when `core.bundle` would erase domain meaning.

## 4. Canonical values and digests

`artifact-json-v1` applies to every retained or hashed JSON value. It MUST:

- accept UTF-8 and reject duplicate object keys and invalid scalar sequences;
- apply no global Unicode normalization;
- sort object keys using the frozen profile order and preserve arrays exactly;
- distinguish absent from explicit `null`;
- insert no defaults and perform no coercion;
- permit numeric literals only as signed interoperable 53-bit integers; and
- require exact decimal, monetary, percentage, coordinate, and rate values to use
  schema-constrained strings or scaled integers.

The server is digest-authoritative. SDK hashes are diagnostics.

Version 1 persists four domain-separated digests:

1. blob SHA-256;
2. type-definition SHA-256;
3. artifact SHA-256; and
4. publication-request SHA-256.

An artifact digest covers the exact type and type-definition digest, canonical
payload, optional blob digest/length, and each structural reference in role/ordinal
order using the target artifact digest and canonical edge attributes. It excludes all
occurrence, scope, publication, actor, time, and production-run identity.

The reference row separately binds the exact target UUID and snapshots its artifact
digest. Thus composites that reference distinct but content-equal occurrences MAY have
the same `artifactSha256`, while traversal still returns the exact different UUIDs.

## 5. Persistence model

The first migration targets these relations:

| Relation | Required invariant |
| --- | --- |
| `artifact_scopes` | One transactional sequence head per scope |
| `artifact_type_versions` | Exact key/version never changes |
| `artifact_blobs` | Stored bytes match digest and length |
| `upload_claims` | Expiring publisher/scope-bound transfer authority |
| `publications` | Permanent unique scope/publication identity and non-null feed sequence |
| `production_runs` | At most one successful run per publication |
| `artifact_records` | Stable UUID, publication/local position, optional producer/output role |
| `artifact_contents` | Exactly one immutable typed value per core occurrence |
| `artifact_references` | Same-scope exact target UUID and digest snapshot |
| `artifact_run_inputs` | Same-scope, ordered, pre-existing inputs |
| `artifact_evidence` | Output-to-declared-input grounding within one run |
| `publication_id_exclusions` | Acknowledged or ambiguous old-epoch IDs can never be reclaimed |
| `store_state` | Store epoch and `normal`/`reconciling` write mode |

There is no run-output table: each derived artifact carries its producer run and unique
output role/ordinal. There is no generic idempotency table or generic feed-item table:
the publication is both.

Required uniqueness includes:

```text
(scope_id, publication_id)
(scope_id, scope_sequence)
(scope_id, publication_id, local_key)
(scope_id, publication_id, publication_ordinal)
(scope_id, producer_run_id, output_role, output_ordinal)
(scope_id, source_artifact_id, role, reference_ordinal)
(scope_id, run_id, input_role, input_ordinal)
(scope_id, run_id, evidence_ordinal)
```

`production_runs` is unique by `(scope_id, publication_id)` and
`artifact_contents.artifact_id` is its primary one-to-one occurrence key.

### 5.1 Required row content

The exact SQL types and names are frozen with the first migration, but the relational
content MUST be equivalent to:

```text
publications
  scope_id, publication_id, scope_sequence, committed_store_epoch,
  command_version, kind, publisher_subject_id, root_actor?,
  publication_request_sha256, committed_at

production_runs
  id, scope_id, publication_id, procedure_key, procedure_version,
  initiator_actor, executor_actor, parameters, implementation, receipt, created_at

artifact_records
  id, scope_id, publication_id, publication_ordinal, local_key,
  producer_run_id?, output_role?, output_ordinal?, created_at

artifact_contents
  artifact_id, scope_id, type_key, type_version, payload,
  blob_sha256?, blob_length?, artifact_sha256

artifact_references
  scope_id, source_artifact_id, target_artifact_id,
  role, ordinal, attributes, target_artifact_sha256

artifact_run_inputs
  scope_id, run_id, role, ordinal, input_artifact_id

artifact_evidence
  scope_id, run_id, output_artifact_id, output_locator,
  input_role, input_ordinal, input_locator, ordinal
```

Root publications set every producer/output field to null. Run publications set those
fields on every output to that publication's sole run. `artifact_contents` binds blob
digest and length together. Each reference snapshots the authoritative target digest.
Each evidence row can resolve its input only through the same run's role/ordinal.

Upload claims additionally retain upload UUID, stable publisher, scope, declared
digest/length, expiry, consumption state, and quota accounting. Recovery exclusions
retain publisher, scope/publication UUID, semantic digest, known original
epoch/sequence/result IDs, reason, and reconciliation time—but no artifact content or
transfer authority.

Composite scope foreign keys MUST enforce graph locality in the database wherever SQL
can express it.

The UUID allocator MUST also reject run/artifact UUIDs retained in an exclusion's
bounded original result mapping. An implementation MAY normalize those mappings into
child rows to make that check relational.

## 6. Staged uploads

```http
PUT /v1/scopes/{scopeId}/uploads/{uploadId}
```

`uploadId` is a client UUID persisted before streaming. The authenticated request
binds scope, stable publisher subject, expected SHA-256, expected length, and bounded
bytes. The server MUST stream, hash, count, and compare the bytes itself.

A same-ID/same-declaration replay returns the same live claim. A changed declaration is
`UPLOAD_CONFLICT`; an expired/consumed record is `UPLOAD_EXPIRED` and replacement uses
a new upload UUID; mismatching bytes are `UPLOAD_DIGEST_MISMATCH`. Upload identity has
an advertised operational retention window, not permanent publication semantics. The
response MUST not reveal whether physical deduplication occurred.

The server MUST reserve and enforce:

- maximum live claims per principal;
- staged bytes per principal;
- staged bytes per scope; and
- concurrent uploads globally and per principal.

Exhaustion is `STAGING_QUOTA_EXCEEDED`. Expiry and object-size limits do not replace
aggregate quotas. Staging quotas count declared logical bytes per live claim rather
than incremental physical bytes after deduplication.

## 7. Publication intent and submission

```http
PUT /v1/scopes/{scopeId}/publications/{publicationId}
If-Artifact-Store-Epoch: <epoch>
```

The request body has two distinct objects:

```ts
interface PublicationIntent {
  readonly commandVersion: 1;
  readonly publicationId: string;
  readonly scopeId: string;
  readonly kind: "roots" | "run";
  readonly rootActor?: Actor;
  readonly artifacts: readonly IntentArtifact[];
  readonly run?: RunIntent;
  readonly evidence: readonly EvidenceIntent[];
}

interface PublicationSubmission {
  readonly intent: PublicationIntent;
  readonly blobAuthorities: Readonly<Record<string, BlobAuthority>>;
}

interface DeclaredBlob {
  readonly sha256: string;
  readonly length: number;
}

type BlobAuthority =
  | {readonly kind: "upload-claim"; readonly claimId: string}
  | {readonly kind: "source-artifact"; readonly artifactId: string};
```

The wire schema is a closed discriminated union. `kind="roots"` requires `rootActor`,
forbids `run`, and requires empty evidence. `kind="run"` requires `run` and forbids
`rootActor`.

The intent scope/publication ID MUST equal the route. The authenticated stable
publisher is transport context, never caller-asserted JSON.

The semantic digest covers that publisher plus the entire exact intent, including
actors, types, payloads, declared blobs, references, run fields, roles, and evidence.
It excludes blob authorities, credentials, trace IDs, and expected store epoch.

Every blob-bearing artifact MUST have one matching authority keyed by `localKey` at
submission time. An authority may be replaced with equivalent authority between
retries. One upload claim MAY bind its exact bytes to several artifacts within the same
publication; successful publication consumes it for that publication and it MUST NOT
authorize a later publication. A bare digest is never authority.

### 7.1 Keys, artifacts, and references

`localKey` and role values MUST match `^[a-z][a-z0-9_-]{0,63}$`. They MUST be treated
as low-sensitivity opaque protocol tokens, not filenames, paths, customer identifiers,
email addresses, invoice numbers, or free text.

Each artifact definition declares exact type, payload, optional `{sha256, length}`
blob, and references. It carries no upload claim. A reference targets an existing
same-scope UUID or an earlier local key. New artifacts MUST be supplied in topological
order. Forward and self local references are invalid.

A root publication contains one or more related root occurrences and no run. A run
publication contains exactly one successful run and at least one output. Every output
definition carries its sole output role/ordinal. Unrelated roots or outputs from
different runs MUST use different publications.

### 7.2 Permanent idempotency

Identity is `(scope_id, publication_id)` and is permanently bound to the stable
publisher, semantic digest, result UUID mapping, sequence, and commit time while the
logical history is supported.

- Same publisher, ID, and intent returns the original result and creates no feed item.
- A semantic change is `PUBLICATION_CONFLICT`.
- Another publisher cannot take over the ID or learn the prior result.
- Credential rotation preserves replay only when it authenticates the same stable
  security subject.
- An exclusion created by divergent recovery permanently blocks reuse as specified in
  the recovery contract.

Success and replay responses MUST return the server-authoritative
`publicationRequestSha256` together with committed epoch/sequence/time and the exact
run/artifact result mapping. The `Artifact-Store-Epoch` response header reports the
current epoch; after exact recovery it may differ from the publication's retained
`committedStoreEpoch`.

## 8. Runs and evidence

A run records exact procedure key/version, initiator, executor, ordered inputs,
`parameters`, `implementation`, `receipt`, and its outputs. Inputs MUST already exist,
be readable, and belong to the publication scope. Therefore production edges strictly
decrease publication sequence and cannot cycle.

A zero-input run is allowed when a capture/generation receipt is meaningful. A failed
or interrupted attempt creates no run; operational attempt history remains outside the
store.

Run JSON fields are bounded objects. The kernel enforces canonical syntax and global
byte/depth/property/key/string/array limits, reserved fields, logging exclusion, and
procedure-namespace authorization. It does not enforce procedure-specific schemas or
claim to detect secrets. Trusted adapters and SDK descriptors own those contracts.

Evidence may connect only a location in an output to a location in a declared input of
the same run. Version 1 locator kinds are:

```text
artifact-root
json-pointer
byte-range
page-region
```

Byte ranges are `[start, endExclusive)` over exact blob bytes; text producers use UTF-8
byte offsets. Page regions use one-based pages and integer millionths of page
width/height. Evidence is part of publication identity but not artifact content
identity.

## 9. Atomic transaction and sequence

Before taking the scope counter lock, the server MUST bind authorization, check normal
mode/epoch, lock publication identity, validate/replay identity, load and validate
types and same-scope resources, resolve authority, allocate UUIDs, calculate digests,
and prepare the bounded immutable row set without external work.

It then MUST:

1. lock the scope counter;
2. allocate the next sequence;
3. insert the publication with that final non-null sequence and all run/artifact/graph
   rows; and
4. commit immediately.

There is no provisional publication row or finalization state. Sequence is immutable
after insert. Rollback exposes no row, feed item, or counter change. Failed publication
never creates a successful run. Consumers treat sequence as an opaque increasing
position, not a contiguous count; recovery exclusions may leave permanent gaps.

## 10. Reads and graph directions

```text
GET  /v1/context
GET  /v1/types
GET  /v1/types/{typeKey}/versions/{version}
GET  /v1/scopes/{scopeId}/artifacts
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}
HEAD /v1/scopes/{scopeId}/artifacts/{artifactId}/content
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/content
POST /v1/scopes/{scopeId}/artifacts/batch-get
GET  /v1/scopes/{scopeId}/runs/{runId}
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/producer
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/producer-inputs
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/sibling-outputs
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/consuming-runs
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/direct-derivations
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/references
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/referrers
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/supporting-evidence
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/evidence-usages
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/lineage
```

`GET /v1/context` returns frozen command/profile versions, current store epoch and
mode, supported features, hard limits, and upload quotas. Exact type retrieval returns
the immutable definition and digest.

The artifact collection supports only exact/indexable filters: exact type
key/version, publication-sequence range, committed-time range, producer procedure
key/version, and root versus derived. It does not accept payload predicates, text,
ranking, similarity, “current”, or “latest”. Its first page captures
`throughSequence`; every subsequent page repeats the same filters/boundary.

`batch-get` accepts a bounded ordered UUID list and returns a position-preserving
result per input ID. It is not a query language.

`producer` is the run that produced the artifact, with explicit null for roots.
`producer-inputs` and `sibling-outputs` describe that run. `consuming-runs` returns one
entry per later consuming run with all matching input role/ordinals.
`direct-derivations` returns one entry per output occurrence of those runs with all
matching bindings. Reference routes are composition;
evidence routes distinguish evidence supporting this output from later evidence using
this artifact as an input.

`GET /runs/{runId}` returns the exact bounded run receipt, ordered inputs, output
summaries, and evidence.

Configured write/read limits MUST guarantee that every accepted artifact envelope and
complete run resource fits its maximum single-resource response. Publication MUST
reject a row set that would create a valid but unreadable resource.

Every collection MUST use keyset pagination with a bounded limit, deterministic order,
and cursor bound to scope, epoch, direction, filters, and a first-page
`throughSequence` high-water. Later pages retain that boundary. The orders are:

| Collection | Keyset order |
| --- | --- |
| artifact lists and direct derivations | `(publication_sequence, publication_ordinal, artifact_id)` |
| consuming runs | `(publication_sequence, run_id)` |
| producer inputs | `(input_role, input_ordinal, input_artifact_id)` |
| sibling outputs | `(output_role, output_ordinal, artifact_id)` |
| references | `(role, ordinal, target_artifact_id)` |
| referrers | `(source_publication_sequence, source_publication_ordinal, role, ordinal, source_artifact_id)` |
| supporting evidence | `(evidence_ordinal)` |
| evidence usages | `(output_publication_sequence, output_publication_ordinal, evidence_ordinal)` |

Offset pagination is forbidden.

The type collection is likewise keyset-paginated by `(type_key, version)`. Exact type
definitions never change and clients never resolve “latest”.

Lineage additionally requires edge kinds, direction, maximum depth, and maximum nodes,
and MUST return an explicit truncation marker on exhaustion.

Content reads MUST authorize the occurrence before resolving a blob. There is no
public blob-by-digest route. Safe serving defaults to attachment and
`application/octet-stream` unless a separate serving policy approves more.

## 11. Publication feed and rebuild

```http
GET /v1/scopes/{scopeId}/publications?afterSequence=<n>&storeEpoch=<epoch>&limit=<n>
```

The feed returns increasing whole publications. Each item contains publication
identity, authoritative request digest, sequence, commit time, kind, stable publisher
and logical actors, optional run ID, and every artifact's
ID/local key/type/digest/producer summary. Payloads, blob
bytes, full run receipts, references, and evidence are hydrated through exact reads.

The feed is at least once and never splits a publication. Limits MUST satisfy:

```text
maxSerializedPublicationFeedItem <= maxFeedResponseBytes
```

The write API MUST reject a publication that could not be returned whole. Version 1
MUST NOT prune publication history.

Replay from sequence zero plus exact hydration is the universal rebuild contract for
all projection shapes. Hydration uses each feed item's own artifact envelopes and
optional run resource; it MUST NOT use inbound referrer/consumer/evidence-usage routes
that may include later history. The high-water artifact scan is only an optimization for
artifact-oriented projections:

1. read epoch and high-water `H` (`limit=0` is allowed);
2. scan artifacts through `H` in publication order under fixed exact filters; and
3. consume publications strictly after `H`.

It MUST NOT be advertised as sufficient for a projection that needs historical
publication actors, fan-out, run receipts, input/output structure, references, or
evidence.

## 12. Error contract

Errors use problem JSON and stable codes:

| HTTP | Code | Contract |
| --- | --- | --- |
| 400 | `MALFORMED_REQUEST` | Closed protocol syntax failed |
| 401 | `AUTHENTICATION_REQUIRED` | No valid principal |
| 403 | `SCOPE_DENIED` | Principal cannot use route scope |
| 404 | `RESOURCE_UNAVAILABLE` | Unknown or inaccessible without disclosure |
| 409 | `UPLOAD_CONFLICT` | Upload ID has another declaration |
| 409 | `PUBLICATION_CONFLICT` | Publication ID has another intent or publisher |
| 409 | `LOCAL_REFERENCE_ORDER` | Local target is not earlier |
| 409 | `INPUT_UNAVAILABLE` | Input/reference/reuse source is unavailable |
| 409 | `STORE_EPOCH_CHANGED` | Write precondition names another epoch |
| 409 | `FEED_REBOOTSTRAP_REQUIRED` | Cursor names another epoch |
| 410 | `UPLOAD_EXPIRED` | Replace equivalent transfer authority |
| 410 | `PUBLICATION_DATA_LOST` | Recovery quarantined identity but its original result is unavailable |
| 413 | `LIMIT_EXCEEDED` | Object/publication/read response exceeds a hard bound |
| 416 | `CONTENT_RANGE_NOT_SATISFIABLE` | Requested byte range is invalid/outside exact blob length |
| 422 | `UPLOAD_DIGEST_MISMATCH` | Stream differs from declared digest/length |
| 422 | `SCHEMA_VALIDATION_FAILED` | Exact type/reference contract failed |
| 422 | `INVALID_EVIDENCE` | Evidence relation or locator failed |
| 429 | `STAGING_QUOTA_EXCEEDED` | Staging or upload concurrency quota exhausted |
| 500 | `INTEGRITY_FAILURE` | Corruption/invariant failure; operation is not retryable |
| 503 | `STORE_RECONCILIATION_REQUIRED` | Divergent recovery fences mutations |

Errors MUST NOT disclose another scope's existence, hidden content, credentials,
internal paths, SQL, or another publisher's prior result.
