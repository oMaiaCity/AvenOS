# Minimal Artifact Store Core Specification

Status: proposed first production core after repository and scenario backtesting

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

Companion documents:

- [Normative kernel contract](CORE-CONTRACT.md)
- [Normative SDK contract](SDK-CONTRACT.md)
- [Release conformance plan](CONFORMANCE.md)
- [Security and recovery contract](SECURITY-AND-RECOVERY.md)
- [Rationale and condensed backtests](RATIONALE-AND-BACKTESTS.md)
- [Extension seams](EXTENSION-SEAMS.md)
- [Full architecture](ARTIFACT-STORE.md)
- [Full external-interface proposal](ARTIFACT-STORE-EXTERNAL-INTERFACE.md)
- [avenCEO-tools backtest](ARTIFACT-STORE-REPOSITORY-BACKTEST.md)
- [AvenOS UI backtest](ARTIFACT-STORE-AVENOS-UI-BACKTEST.md)
- [avenAgent backtest](ARTIFACT-STORE-AVENAGENT-BACKTEST.md)

This document remains the full reviewed design record. The focused kernel, SDK,
security/recovery, and conformance documents are the implementation-facing normative
contracts. They are intended to agree; a conflict is a specification defect, not
permission to choose whichever behavior is convenient.

## Executive decision

The first artifact store should be a scope-local immutable artifact and provenance
kernel. It has five durable capabilities:

1. register exact, immutable artifact type versions during deployment;
2. stage exact bounded bytes under principal-bound authority;
3. atomically publish root occurrences or all outputs of one successful production
   run;
4. retrieve exact artifacts, content, structural references, causal lineage, and
   evidence;
5. bootstrap and consume a scope-local ordered feed of complete publications.

Everything else is either application state or an extension.

In particular, the core has no search engine, job scheduler, mutable business objects,
cross-scope graph, procedure registry, external-effect executor, legal policy engine,
hold state, or purge workflow. Corrections, decisions, requests, and receipts need no
special kernel concepts: they are typed artifacts and production runs.

This is not merely the smallest implementation that can store a file. It is the
smallest slice that survived replay through avenCEO-tools, AvenOS, avenAgent, and a
broader set of document, data, software, media, and agent workflows without forcing a
later change to the meanings of blob, artifact, reference, run, or publication.

The resulting core is deliberately boring:

```text
exact bytes                blob
immutable typed value      artifact occurrence
frozen composition         structural reference
successful derivation      production run
fine-grained grounding     evidence
atomic visibility/retry    publication
projection synchronization publication feed
```

That is enough foundation. The full architecture remains a destination catalogue, not
the first migration.

## Foundation review verdict

The proposed slice is sound, with six important boundaries made explicit by the final
review:

1. **Structural references stay.** Composition is not derivation. Email attachments,
   frozen corpora, packages, releases, and dataset manifests need exact membership
   even when the members were not produced by the bundle-building run.
2. **The feed stays publication-shaped.** All three applications need atomic fan-out
   and projection rebuilds. A generic event bus is unnecessary, but a durable ordered
   publication feed is not.
3. **Content is separate from the stable occurrence envelope.** This is one small
   normalization seam, not a retention subsystem. The core always creates both rows
   and exposes no removal operation. A later content-lifecycle extension can preserve
   IDs and non-cascading graph structure without redefining an artifact occurrence.
4. **Attempt ownership stays outside, with a required integration pattern.** In the
   first topology workers do not publish directly. The job coordinator validates the
   live attempt, persists the immutable semantic publication intent and UUID to an
   outbox, and is the sole store publisher. Replaceable transfer authority is stored
   separately. A future direct-worker topology needs a publication-guard extension.
5. **Semantic intent is distinct from transfer authority.** The durable outbox holds
   declared bytes and reacquisition information, never expiring claim IDs. Each retry
   binds current authority to the same immutable intent.
6. **Permanent identity includes divergent recovery.** A restore that may predate an
   acknowledged or ambiguous commit is write-disabled until publisher journals are
   reconciled. Missing identities are permanently excluded rather than accepted anew.

The prior draft put data-subject policy, restrictions, legal holds, purge planning,
maintenance audit, and backup erasure reconciliation into the kernel. That was too
far. Those concerns are important deployment capabilities, but not universal artifact
semantics. This core only preserves the identities, non-cascading relationships,
content boundary, and extension points required to implement such a capability
correctly beside it.

### Why the retained slice cannot usefully shrink further

| Retained capability | What breaks if it is removed | Backtest pressure |
| --- | --- | --- |
| Exact type versions | Old values silently change meaning as validators/models evolve | All three applications |
| Independent occurrence UUID | Equal bytes or business IDs collapse distinct arrivals/provenance | Uploads, Gmail, invoice `1001` |
| Principal-bound byte staging | A guessed digest becomes read/reuse authority or writes hold long transactions | File-heavy flows |
| Structural references | Frozen email/package/corpus membership is misrepresented as causation or mutable state | All three plus release/dataset cases |
| Successful production run | Outputs lose exact inputs, producer, parameters, and alternative-run history | Extraction, matching, fan-out |
| Narrow evidence | Invoice fields cannot be grounded in OCR/PDF regions without ad hoc payload conventions | avenCEO and avenAgent |
| Atomic publication UUID | Multi-output visibility and ambiguous retry recovery become application-specific races | Generated docs and AvenOS fan-out |
| Ordered publication feed | Search/UI/workflow projections cannot rebuild or follow commits without polling races | avenCEO and AvenOS |
| Scope-local enforcement | Every read and graph API must reinvent authorization filtering | All three trust boundaries |
| Typed SDK/conformance data | Canonicalization, local-reference, retry, and locator rules diverge per producer | TypeScript, Rust, and Scala integrations |

Search, jobs, lifecycle policy, cross-scope transfer, and external execution do not
appear in this table because their semantics can be implemented over these contracts
without weakening them.

## Scope and assumptions

Version 1 assumes:

- one artifact-store database is one customer or comparably strong isolation
  boundary;
- a database may contain several authorization scopes for that customer;
- each operation names exactly one scope;
- authentication and scope membership come from a trusted adapter;
- artifacts, inputs, and structural references never cross scopes in version 1;
- blobs are stored in PostgreSQL initially and have a measured hard size limit;
- types are owned by the deploying software and registered through migrations;
- the server and first-party SDK implement one frozen canonicalization profile;
- publications are never deleted or pruned by the core;
- ordinary runtime credentials cannot update or delete immutable rows.

If multiple customers share one database, every relevant row needs a tenant partition
key in addition to `scope_id`, and physical blob deduplication must not cross tenant
boundaries. That deployment model is outside this version's assumptions.

The core is suitable for immutable history, not for every kind of application data. It
does not replace a transactional domain database, job queue, collaboration engine,
time-series system, or general event log.

## Goals

The first core must provide:

- exact bounded byte storage with SHA-256 identity and integrity checks;
- immutable typed occurrences with IDs independent from content hashes;
- one optional primary blob per artifact;
- immutable ordered structural references with closed type-specific roles;
- successful production receipts separate from jobs and failed attempts;
- exact ordered run inputs that pre-exist their outputs;
- atomic multi-artifact and multi-output publication;
- permanent publication-ID idempotency;
- four useful evidence locator kinds;
- scope-local authorization and graph isolation;
- universal publication replay, a race-free artifact-oriented bootstrap, and an
  ordered complete-publication feed;
- fixed schema and canonical JSON behavior across server and SDK;
- database-enforced runtime immutability;
- a first-party typed SDK and conformance fixtures;
- stable extension seams for the larger architecture.

## Non-goals

The core does not provide:

- full-text, typed-field, vector, or federated search;
- dynamic search mappings or projection generations;
- jobs, attempts, leases, schedules, retries, progress, or human gates;
- current/preferred values, workflow state, mutable collections, tags, or ownership;
- cross-scope reads, inputs, references, transfers, or aggregate feeds;
- runtime schema registration, shared schema resolution, or network `$ref`;
- a server-side procedure catalogue;
- arbitrary semantic graph relationships;
- generic external-effect or shell execution;
- content-level run caching;
- portable signatures or export/import identity rewriting;
- legal-basis decisions, retention periods, holds, restrictions, purge, or blob garbage
  collection;
- a general security/compliance audit-event subsystem;
- alternative blob backends or multi-gigabyte objects.

The absence of a retention policy engine is not a claim that indefinite retention is
appropriate. The core itself makes no regulatory-compliance claim. A deployment whose
data requires erasure, retention holds, or controlled disposition must add a concrete
content-lifecycle extension and surrounding application discovery process before
accepting that data.

## Core boundary

```text
application database                   artifact-store core
--------------------                   -------------------
jobs / leases / retries  ----------->  atomic publication
current / preferred      <-----------  publication feed
review queue / UI state  ----------->  typed decision artifact
search projection        <-----------  publication feed
effect executor          <--- IDs ---> request + receipt artifacts
subject/record policy    ---extension-> stable occurrence/content boundary
```

The application owns mutable intent. The store owns immutable recorded values and how
derived values were produced. An application projection may point at an artifact; it
must never turn that pointer into permission to mutate the artifact.

## Core terminology

### Blob

A blob is one exact byte sequence identified by SHA-256 and length. Several artifact
occurrences may share it. A digest proves byte equality; it is never an artifact ID,
read capability, or reuse capability.

### Artifact occurrence

An artifact is one immutable recorded value or occurrence. It has:

- an independent UUID;
- one exact type key and integer version;
- a bounded JSON object payload;
- zero or one primary blob;
- zero or more ordered structural references;
- root attribution or exactly one producing run.

Two occurrences may have the same artifact digest and share the same blob. They remain
different occurrences with different source, actor, publication, or provenance.

An artifact is an immutable assertion that this value was recorded. It is not a claim
that every candidate, classification, model output, or human statement is true.

### Structural reference

A structural reference is part of the referencing artifact's immutable value. It
expresses frozen composition, for example:

- member 3 of an ordered bundle;
- an attachment in a captured email;
- a file at a path in a release;
- a segment in a frozen dataset.

It does not express causation, approval, equivalence, duplication, ownership, current
selection, workflow fan-out, or authorization. Those meanings belong in a production
run, typed artifact, or application projection.

### Production run

A production run is the immutable receipt for one successfully published
transformation. It exists only if all outputs commit. Jobs, attempts, logs, progress,
and failures are operational state outside the core.

Every input already exists. Every output is newly created and has exactly one producer.
This makes the production graph acyclic without a recursive cycle check.

### Evidence

Evidence grounds a part of a run output in a part of one of that run's declared inputs.
It does not create a structural reference and does not claim that the producer's
interpretation is correct.

### Publication

A publication is the atomic write, permanent retry identity, and ordered feed unit. It
contains either:

- one or more root artifacts supplied by one logical actor; or
- one production run and every newly created output of that run.

It cannot mix unrelated roots and run outputs. A zero-input run is permitted when a
capture or generation receipt is meaningful.

### Projection

A projection is mutable, rebuildable application state derived from publications. It
includes search indexes, inboxes, current/preferred selections, case status, UI cards,
workflow subscriptions, and caches. Projection mutation does not mutate history.

## Non-negotiable invariants

The following are the contract, not implementation advice:

1. Blob identity, artifact-content identity, and occurrence identity are different.
2. Artifact digest is not unique.
3. A bare blob digest grants no read or reuse authority.
4. Every artifact has at most one primary blob.
5. Type key/version definitions never drift.
6. Artifact payload, blob binding, and structural references never change through the
   runtime API.
7. A correction is another artifact, not an update.
8. Every derived artifact has exactly one producing run.
9. Run inputs pre-exist the publication that creates the outputs.
10. Local structural references target only an earlier local artifact; existing
    targets necessarily pre-exist.
11. Inputs, references, evidence, and traversal remain inside one scope.
12. A publication becomes completely visible or not visible at all.
13. Replaying one publication UUID cannot create a second occurrence.
14. Reusing that UUID for a changed semantic intent cannot succeed.
15. The feed exposes a whole publication as one ordered unit.
16. Runtime database roles cannot rewrite or delete immutable history.
17. Storage commit time never substitutes for domain event time.
18. Digest equality never implies semantic equivalence, truth, preference, or deletion
    authority.

## Identity and digests

### Three identities

| Question | Identity |
| --- | --- |
| Are these exact bytes equal? | Blob SHA-256 |
| Are these exact canonical typed values equal? | Artifact SHA-256 |
| Is this the same recorded occurrence and provenance path? | Artifact UUID |

Business identifiers such as invoice number, transaction ID, source path, Gmail part
ID, external event ID, or model call key are typed fields or receipt fields. They are
never storage identity.

### Four persisted digest domains

| Digest | Purpose |
| --- | --- |
| Blob SHA-256 | Exact byte identity and integrity |
| Type-definition SHA-256 | Exact immutable type contract |
| Artifact SHA-256 | Canonical typed-content equality |
| Publication-request SHA-256 | Permanent retry conflict detection |

All preimages have distinct domain prefixes and explicit profile versions. Version 1
does not persist parameter, input-set, run, locator, search-mapping, or catalogue
digests. A later cache, signing, or verification extension can derive them from retained
immutable values.

### Artifact digest preimage

The artifact digest covers:

- artifact canonicalization profile ID;
- exact type key/version and type-definition digest;
- canonical payload;
- optional primary blob digest and length;
- each structural reference in canonical role/ordinal order, including the target's
  artifact digest and canonical attributes.

It excludes occurrence ID, publication ID, scope, times, actors, producing run, and all
application projection state.

The immutable reference row binds the exact target occurrence UUID and snapshots its
artifact digest. The referencing artifact's digest uses the snapshotted target digest,
not the target UUID. Therefore two composite artifacts can have equal typed content
even when they name distinct occurrences with equal content, while reference traversal
still preserves exact occurrence provenance.

Accordingly, `artifactSha256` is a canonical typed-content digest, including
content-equivalent structural members. It is not an occurrence-envelope digest and
must never collapse, authorize, or replace occurrence UUIDs. An export or signature
extension that must commit to exact occurrence membership can derive a separate
occurrence-bound envelope digest; version 1 does not need both.

The snapshot also permits later integrity verification without recursively reading the
target. A content-lifecycle extension must treat that content-derived snapshot
explicitly: preserve it when permitted, or include the referrer in its dependency
closure. The kernel does not weaken content equality to pre-decide that policy.

Local references use request-local keys in the intent. After assigning occurrence IDs,
the server resolves those keys and calculates artifacts in declared topological order.

## Scope-local authorization model

Every publication belongs to exactly one scope. Every artifact, run, input, structural
reference, and evidence relation in it belongs to that scope.

The authenticated publisher identity is a stable security subject identifier issued by
the authorization system, conceptually `(issuer, subject)`. It is not an access token,
client secret, certificate serial number, deployment instance, process ID, or other
rotating credential. Credential and service-account key rotation preserves publication
replay only when it continues to authenticate the same stable subject. Logical root,
initiator, and executor actors remain separately attributed and must be authorized for
that publisher.

Composite foreign keys include `scope_id` wherever possible:

```sql
FOREIGN KEY (scope_id, target_artifact_id)
  REFERENCES artifact_records(scope_id, id)
```

The server binds one trusted scope context at the beginning of every transaction.
Missing context fails closed. All endpoint paths name that same scope, and graph
traversals cannot silently cross it.

This eliminates from version 1:

- cross-scope graph leakage;
- derived declassification rules;
- authorization-filtered global feeds;
- cursors bound to changing sets of allowed scopes;
- hidden global-sequence gaps.

The consequence is real: an AvenOS `me -> team` transition cannot be a mutable scope
change. The artifact must initially be captured in the intended scope, or a later
privileged copy/declassification operation must create a new target-scope occurrence
and an explicit origin receipt. That extension reads under source authority, discloses
only its approved source digest/origin fields into the target receipt, and does not
pretend an ordinary version-1 input/reference crossed scopes.

Blob bytes may be physically deduplicated inside the assumed customer database. That
implementation detail is invisible: upload and read behavior must not reveal whether
another scope already stores the same digest, and it never grants cross-scope access.

### Acyclicity proof

Give each artifact the lexicographic rank
`(publication_sequence, publication_ordinal)`.

- A production edge from an output to an input always decreases publication sequence,
  because every input was committed before the output publication.
- A structural edge to an existing artifact decreases publication sequence; an edge
  to a local artifact keeps the sequence but decreases publication ordinal.

Every traversed edge therefore strictly decreases rank. Neither graph can contain a
cycle, and publication needs no recursive graph scan. This proof depends on preserving
the pre-existing-input and backward-local-reference rules.

## Type system

### Type identity and definition

An artifact type version is identified directly by:

```text
(type_key, integer_version)
```

There is no type-version UUID. The immutable definition contains:

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

`blob_policy` is `forbidden`, `optional`, or `required`. Reference rules are a closed
map by role. A second registration of the same key/version succeeds only if the exact
definition digest matches; otherwise it is a conflict.

Registration occurs through source-controlled migrations or a build-time
administrative tool. Runtime publisher credentials cannot define or alter types.

### Schema profile

All version-1 definitions use `artifact-json-schema-profile-v1`, a frozen,
implementation-independent subset of JSON Schema 2020-12:

- the payload root is an object;
- local `$defs` and acyclic local `$ref` of the form `#/$defs/...` are allowed;
- external, file, HTTP, dynamic, anchor-based, and recursive references are forbidden;
- supported keywords, formats, regular-expression behavior, and limits are enumerated
  by the profile;
- validation does not coerce, strip, normalize, or insert defaults;
- unknown properties are accepted only when the schema explicitly permits them;
- server and SDK validators pass one shared conformance suite.

A local reference can reuse a definition embedded in the same registered schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "$defs": {
    "money": {
      "type": "object",
      "properties": {
        "currency": {"type": "string", "pattern": "^[A-Z]{3}$"},
        "minorUnits": {"type": "integer"}
      },
      "required": ["currency", "minorUnits"],
      "additionalProperties": false
    }
  },
  "properties": {
    "total": {"$ref": "#/$defs/money"}
  },
  "required": ["total"],
  "additionalProperties": false
}
```

A future common-type package can version source definitions such as
`common.money@2` and compile them into each consumer's local `$defs` at build or
registration time. The registered schema remains self-contained, and its resolved
bytes and digest remain the authority. The kernel does not need a dependency resolver
or mutable global common-type registry.

The type digest includes the schema profile, payload schema, blob policy, and reference
rules. It does not include a validator library name/version. An implementation update
that preserves the conformance profile does not create a new artifact type version.

### Reference rules

Each declared role specifies:

- minimum and maximum count;
- allowed exact target type versions, or an explicit unrestricted target set;
- a closed bounded JSON Schema for attributes.

All core references are ordered, and ordinals are contiguous from zero within each
role. A domain that conceptually has a set supplies its own canonical order; the kernel
does not add a second unordered-reference mode. Reference locators are not part of
version 1. If a selected slice is independently meaningful, publish it as another
artifact or ground a derivation with evidence.

### Initial built-in types

The kernel needs only two generic types.

#### `core.file@1`

- requires one primary blob;
- forbids structural references;
- has a small payload containing original/display name, declared media type, and
  bounded source kind;
- does not persist `detectedMediaType` as unversioned truth.

Media sniffing may protect serving operationally. A durable detected media type is a
producer-owned, versioned evaluation artifact.

#### `core.bundle@1`

- forbids a primary blob;
- has one ordered `member` role;
- has only purpose and optional bounded display name in its payload;
- permits a bounded member path or label in reference attributes;
- carries no tags, mutable membership, case state, semantic claim, or arbitrary
  metadata.

Domain-specific email, corpus, dataset, release, invoice, decision, request, and
receipt types should be used whenever `core.bundle` would erase important semantics.

## Canonical JSON profile

`artifact-json-v1` is frozen before the first migration and published as prose, shared
code, and golden vectors.

It applies to every JSON value that the store validates, retains, or places in a hash
preimage: type definitions, artifact payloads, reference attributes, actors, run
parameters/implementation/receipts, evidence locators, and publication commands.
Domain schemas may narrow it further but cannot opt into a different numeric or Unicode
interpretation inside command version 1.

It:

- accepts UTF-8 JSON and rejects duplicate object keys;
- rejects invalid Unicode scalar sequences but applies no global text normalization;
- sorts object keys using one explicitly defined ordering;
- preserves array order exactly;
- distinguishes an absent property from explicit `null`;
- inserts no defaults and performs no coercion;
- accepts JSON numbers only as signed integers in the interoperable 53-bit range;
- requires exact decimal, percentage, rate, coordinate, and monetary values to use
  schema-constrained strings, scaled integers, or integer minor units;
- fixes escaping and serialization behavior through golden vectors.

Protocol collections with explicit roles/ordinals are supplied in their defined
canonical order, and the server rejects a disagreement between position and ordinal.
Artifact definitions are the exception: their array order is the publication ordinal
and required topological order. Arrays inside domain payloads keep their authored
order.

Numeric literals inside JSON Schema definitions are subject to the same safe-integer
rule. Contracts for non-integral bounds use scaled integers or string patterns rather
than a floating-point schema literal.

The JSON Schema validator validates the supplied value. It does not create the value
that is hashed. The server calculates authoritative digests after parsing and
validation; SDK values are diagnostics and early error detection.

## Persistence kernel

### Tables

| Table | Purpose | Main invariant |
| --- | --- | --- |
| `artifact_scopes` | Scope identity and sequence head | One publication sequence per scope |
| `artifact_type_versions` | Exact type contracts | `(type_key, version)` never changes |
| `artifact_blobs` | Exact bounded bytes | SHA-256 and length match stored bytes |
| `upload_claims` | Staged principal-bound blob authority | Expiring operational state, never graph truth |
| `publications` | Atomic identity, idempotency, feed position | Permanent `(scope_id, publication_id)` |
| `production_runs` | Successful transformation receipt | At most one run per publication |
| `artifact_records` | Stable occurrence/provenance envelope | One UUID and publication position |
| `artifact_contents` | Type, payload, blob, artifact digest | Exactly one immutable row per core occurrence |
| `artifact_references` | Frozen composition | Exact target UUID and snapshotted target digest |
| `artifact_run_inputs` | Ordered causal dependencies | Same scope and pre-existing |
| `artifact_evidence` | Output-to-input grounding | Only an output/input of the same run |
| `publication_id_exclusions` | Recovered acknowledged or ambiguous identities whose result is unavailable | ID/digest/publisher can never be reclaimed |
| `store_state` | Recovery epoch and write mode | `normal` or write-disabled `reconciling` |

There is no general idempotency table, run-output table, generic change-item table,
search table, procedure table, job table, lifecycle-state table, tombstone table, or
audit-event table.

`publication_id_exclusions` is not a second synchronous idempotency service. It is a
small recovery safety table populated only while a divergent restore is reconciled
from producer acknowledgment journals and unresolved outboxes. The canonical
publication lock checks both it and `publications`. An excluded ID with the same
publisher/digest returns `PUBLICATION_DATA_LOST`; another intent or publisher
conflicts. The ID is never reusable and no feed item is fabricated for content the
restored store does not have.

Artifact and run UUIDs are server-generated and unique within the store. Composite
`(scope_id, id)` uniqueness is also retained for scope-bearing foreign keys.
Publication UUIDs are client-generated and unique only in combination with `scope_id`.

The publication row conceptually contains:

```text
scope_id
publication_id
scope_sequence
committed_store_epoch
command_version
kind                       roots | run
publisher_principal_id
root_actor                 nullable
publication_request_sha256
committed_at
```

The optional production run supplies initiator/executor attribution for `kind=run`.
Resolved artifact local-key mappings remain on `artifact_records`, allowing an
idempotent response to be reconstructed without storing arbitrary response JSON.

A recovery exclusion retains only the stable subject ID, scope/publication ID,
semantic request digest, original epoch/sequence when known, bounded original
artifact/run ID mapping when known, a reason code, and reconciliation time. It contains
no payload, blob, parameters, receipt, evidence, or transfer authority. Its purpose is
identity non-reuse, not a claim that acknowledged content was recovered. The canonical
UUID allocator checks the bounded excluded run/artifact mappings as well as live
primary keys; an implementation may normalize those mappings into child rows for
efficient uniqueness checks.

At minimum, `publications` has unique `(scope_id, publication_id)` and
`(scope_id, scope_sequence)`. `production_runs` has a global UUID primary key and
unique `(scope_id, publication_id)`. These constraints make “at most one run per
publication” structural rather than conventional.

### Occurrence and content split

The stable occurrence row conceptually contains:

```text
id
scope_id
publication_id
publication_ordinal
local_key
producer_run_id       nullable
output_role           nullable
output_ordinal        nullable
created_at
```

The exact content row contains:

```text
artifact_id
scope_id
type_key
type_version
payload
blob_sha256           nullable
blob_length           nullable
artifact_sha256
```

Core publications always insert both rows atomically. Core reads treat a missing
content row as an integrity failure; the core has no operation that creates such a
state.

The split keeps stable graph identity distinct from the exact value. Besides future
content-lifecycle policy, it permits later cold-storage or content-envelope extensions
without changing occurrence IDs or reference targets. It does not weaken the core's
append-only contract.

`artifact_records` has:

```sql
PRIMARY KEY (id)
UNIQUE (scope_id, id)
UNIQUE (scope_id, publication_id, local_key)
UNIQUE (scope_id, publication_id, publication_ordinal)
UNIQUE (scope_id, producer_run_id, output_role, output_ordinal)
```

For root publications every producer/output field is null. For run publications every
new artifact names that publication's run. Output ordinals are contiguous per role.
`created_at` is the publication's final-phase `committed_at`; source capture, business
event, validity, and effective times belong in explicitly typed payload/receipt fields.

Each `artifact_references` row contains `scope_id`, source and target artifact UUIDs,
role, ordinal, bounded attributes, and `target_artifact_sha256`. Publication verifies
that the snapshot equals the target's authoritative digest. The source artifact digest
then commits to these snapshots in canonical role/ordinal order.

### Runs

A production run contains bounded fields such as:

```text
id
scope_id
publication_id
procedure_key
procedure_version
initiator_actor
executor_actor
parameters
implementation
receipt
created_at
```

`parameters`, `implementation`, and `receipt` are bounded JSON objects. The kernel can
enforce only rules that are independent of a particular procedure:

- the value is an object under `artifact-json-v1`;
- byte size, depth, property count, key length, string length, and array length stay
  within advertised hard limits;
- globally reserved protocol fields are absent;
- the publisher may use the procedure-key namespace; and
- values are excluded from ordinary request and error logging.

The kernel has no procedure registry and therefore cannot know that an arbitrary field
is invalid for `invoice.extract@3`. It also cannot reliably detect secrets by scanning
field names. Trusted adapters and SDK procedure descriptors enforce the
procedure-specific parameter, implementation, and receipt schemas; input/output role
contracts; evidence conventions; and secret-handling policy. These objects should
contain bounded reproducibility and attribution facts, not secrets, hidden reasoning,
provider dumps, logs, stack traces, or unbounded output.

The server records the exact bounded procedure key/version and applies namespace
authorization. A later procedure-contract registry may add server-side validation for
new publications without changing existing receipts.

### No cascading history deletion

Foreign keys between immutable graph rows use `RESTRICT` semantics. The schema never
silently cascades from a domain row, projection, artifact, input, or reference into
historical content.

Operational upload-claim cleanup may delete expired, unconsumed claims. It may also
remove a staged blob that has no artifact-content reference and no live claim after a
grace period. That is cleanup of unpublished bytes, not artifact deletion.

## Blob upload and reuse

### Upload operation

```http
PUT /v1/scopes/{scopeId}/uploads/{uploadId}
```

`uploadId` is a client-generated UUID persisted before streaming. The request binds:

- authenticated principal;
- scope;
- expected SHA-256;
- expected byte length;
- content bytes;
- expiry subject to a published minimum.

The server streams into bounded storage, calculates digest and length itself, rejects a
mismatch, and returns an opaque upload claim. A repeated upload ID with the same
declaration returns the same result while its claim is live; a changed declaration
conflicts. An expired/consumed upload record returns `UPLOAD_EXPIRED` and replacement
authority uses a new upload UUID. Upload identity has an advertised operational
retention window, not the permanent semantics of a publication UUID.

Upload admission reserves quota before accepting bytes and releases it atomically on
failure, expiry cleanup, or successful publication. `GET /v1/context` advertises and
the server enforces at least:

- maximum live upload claims per principal;
- maximum staged bytes per principal;
- maximum staged bytes per scope; and
- maximum concurrent uploads, globally and per principal.

Per-object size and expiry do not replace these aggregate limits. Exceeding a staging
quota returns `429 STAGING_QUOTA_EXCEEDED` without revealing deduplication state.
Staged-byte accounting uses declared logical bytes per live claim, not incremental
physical storage after deduplication.

An implementation may deduplicate the physical blob, but the response does not reveal
whether the bytes existed already. On a digest-key collision, the write path verifies
length and exact bytes before reuse; any disagreement is an integrity failure, never a
second value hidden behind one SHA-256 key. Zero-byte blobs are valid.

### Publication authority

An artifact can bind its primary blob through:

- an unexpired upload claim belonging to the publisher and scope; or
- an authorized same-scope source artifact plus its expected blob digest and length.

The latter is byte-transfer convenience, not implied provenance. If the source
occurrence matters causally or structurally, the intent also declares it as a run
input or structural reference.

A bare digest never suffices. This prevents a caller who guesses a hash from probing,
reading, or republishing another caller's bytes.

One claim may authorize several blob bindings inside the same bounded publication when
every binding declares exactly the claim's digest and length. The successful
publication consumes the claim for that publication; it can never authorize a later
publication. A failed publication leaves it reusable until expiry. If the claim
expires before an ambiguous retry is resolved, the caller may upload the same declared
bytes under a new claim: transfer authority is excluded from the semantic publication
digest.

### Serving bytes

Content reads authorize the artifact occurrence, never the digest. Safe defaults are:

- `Content-Type: application/octet-stream` unless an explicit safe-serving policy
  chooses otherwise;
- `Content-Disposition: attachment` with a sanitized name;
- `X-Content-Type-Options: nosniff`;
- exact `Content-Length`, digest metadata, range behavior, and integrity failure on
  mismatch.

The declared media type is artifact content, not permission to execute or render
untrusted bytes inline.

## Canonical publication operation

### Endpoint

```http
PUT /v1/scopes/{scopeId}/publications/{publicationId}
If-Artifact-Store-Epoch: 7dddb210-58da-48c7-b54f-4bfda879f6ab
```

`publicationId` is a client-generated UUID stored durably before the first network
attempt. It is the permanent identity of one intended publication, not a short-lived
header token.

The request body is a `PublicationSubmission`: one immutable semantic intent plus
replaceable blob authorities. The scope and publication UUID inside the intent must
exactly match the route. This deliberate redundancy makes an outbox entry
self-describing and prevents it from being sent to the wrong route.

The expected epoch is obtained from `GET /v1/context` and stored with the outbox entry.
It is a recovery precondition, not semantic artifact content. The server rejects a
stale epoch before accepting a new publication. An authorized reconciliation may
deliberately update the precondition after determining whether the old publication or
an external effect survived.

### Permanent idempotency

Identity is `(scope_id, publication_id)`. The server permanently binds it to:

- authenticated publisher identity;
- publication-command version;
- semantic request digest;
- returned artifact/run IDs;
- scope sequence and commit time.

Semantics:

- same authorized publisher, publication ID, and semantic intent returns the
  original result;
- same ID with any semantic change returns `409 PUBLICATION_CONFLICT`;
- a different publisher receives no original-result disclosure;
- a new publication ID deliberately creates another occurrence even when content is
  identical;
- there is no advertised retry horizon while the logical store history remains
  retained.

The publication row is the idempotency record. Request-local artifact keys plus stored
resolved IDs reconstruct the original response; no arbitrary serialized response body
is required.

Permanent identity cannot be inferred from a database image that predates acknowledged
writes. Version 1 therefore uses the write-disabled reconciliation contract defined
below; changing `storeEpoch` alone is never sufficient to reopen publication.

### Divergent recovery contract

`store_state` has a database-enforced mode:

```text
normal
reconciling
```

A divergent restore starts without application credentials or traffic. The recovery
operator atomically chooses a new random store epoch and enters `reconciling`. In that
mode ordinary uploads, publications, type administration, and other mutations fail
with `STORE_RECONCILIATION_REQUIRED`. Verified reads may be enabled for recovery, but
no application publication can claim an apparently unused UUID.

Each authorized publisher retains a compact acknowledgment record for every publication
that the store may lose at a supported recovery point. It contains at least:

- stable publisher subject, scope, publication UUID, and semantic request digest;
- original committed epoch, scope sequence, and commit time;
- returned run/artifact UUID mapping;
- the exact semantic intent or a durable pointer to it for the declared recovery
  horizon;
- durable byte reacquisition information when full restoration is promised.

The publisher also retains every unresolved outbox intent. It MUST durably mark a
successful result before reporting final success to its own caller or using returned
IDs for consequential work. A crash can nevertheless leave an old-epoch entry
ambiguous, so recovery treats pending entries as potentially committed rather than as
permission to publish them anew.

During reconciliation, registered publishers submit every acknowledged record newer
than the restored high-water and every unresolved intent bound to the old epoch. For
each record the recovery tooling either:

1. restores the exact publication, including its original artifact/run UUIDs and
   verified semantic content, in dependency and original sequence order; or
2. inserts a permanent `publication_id_exclusions` row when the identity is known but
   complete content cannot be recovered.

An unresolved intent with no recoverable original result mapping takes the second,
conservative path. After recovery the application may deliberately retry the work with
a new publication UUID; the ambiguous old UUID remains unavailable forever.

The second outcome is an explicit unavailable historical identity and, for an
acknowledged commit, data loss. It preserves non-reuse and conflict behavior but cannot
make missing artifacts readable. The operator must surface that incident to affected
applications rather than manufacturing replacement history.

Normal mode resumes only after every configured publisher has submitted a signed or
otherwise authenticated reconciliation completion/watermark and the store has verified
that all acknowledged IDs are present or excluded. Recovery mode then advances scope
counters past every restored original sequence, runs integrity checks, and atomically
opens writes. A producer that cannot provide its required acknowledgment range blocks
reopening; it cannot be silently ignored.

Producer acknowledgment retention and backup policy must agree on a supported oldest
restore point. Once the store certifies a backup/WAL checkpoint covering a publication,
the producer may prune the full intent/bytes under application policy, but restoring to
an older point is then unsupported unless the compact identity record remains
available. The core makes no RPO-zero claim.

### Semantic request digest

The digest covers the canonical semantic envelope, including:

- command version, publication UUID, route scope, authenticated stable publisher, and
  logical actors;
- root or run kind;
- exact type key/version for every artifact;
- request-local keys;
- payloads and declared blob digests/lengths;
- structural references and attributes;
- run procedure key/version, inputs, parameters, implementation, and receipt;
- output roles and ordinals;
- evidence declarations.

It excludes transport-only authorization such as upload-claim ID, access token,
request trace ID, expected store epoch, or a refreshed equivalent blob-reuse
capability. Replacing an expired claim with authority for the same declared bytes
therefore does not change semantic identity.

If a source artifact is meaningful provenance, declaring it as input/reference makes
that identity part of the digest. Merely using it as authorization to obtain already
declared bytes does not.

### Semantic intent and transient authority

The wire model separates the value that receives permanent idempotent identity from
the credentials that happen to move its bytes:

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

For `kind="roots"`, `rootActor` is required, `run` is absent, and `evidence` is empty.
For `kind="run"`, `run` is required and `rootActor` is absent. These are a closed
discriminated union in the frozen wire schema even though the compact interface above
uses optional fields.

`blobAuthorities` is keyed by artifact `localKey`. It is submission state, not part of
the intent or semantic digest. Each blob-bearing artifact has exactly one matching
authority at validation time; artifacts without blobs have none. Equivalent authority
may be rebound between retries without changing the intent.

The authenticated publisher still comes only from trusted transport context. The
server hashes a canonical envelope containing that stable publisher together with the
exact intent. A model or caller cannot assert a different publisher in JSON.

The durable application outbox stores the exact `PublicationIntent`, its diagnostic
semantic digest, and durable byte-reacquisition information such as a local spool or
application object key. It does not treat an expiring claim ID as durable publication
state or part of the intent. Unknown intent, artifact, run, evidence, submission, or
authority fields are rejected. Limits on artifacts, references, inputs, evidence, JSON
bytes, depth, and total publication response size are advertised by `GET /v1/context`.

### Artifact definition and local ordering

Each artifact definition contains:

```json
{
  "localKey": "text",
  "type": {"key": "ocr.text", "version": 1},
  "payload": {},
  "blob": {
    "sha256": "...",
    "length": 14320
  },
  "references": [
    {
      "role": "member",
      "ordinal": 0,
      "target": {"localKey": "page-1"},
      "attributes": {"path": "pages/0001.txt"}
    }
  ]
}
```

`blob` is absent when forbidden or unused. It declares content but carries no
authority. A reference target is either an existing same-scope artifact UUID or an
earlier request-local key.

`localKey` is a low-sensitivity opaque token matching
`^[a-z][a-z0-9_-]{0,63}$`. It must not contain a filename, path, customer name, email
address, invoice number, or free text. Roles use the same lexical form. Type and
procedure identifiers use separately frozen bounded, namespaced ASCII forms and
likewise contain no tenant or customer data. Human meaning
belongs in typed content, not permanent protocol keys.

New artifacts are supplied in topological order. Any valid structural DAG has such an
order, so this removes no useful acyclic composition while avoiding a same-publication
cycle detector. Forward and self references are rejected.

### Root publication

A root publication records one or more values supplied or observed together:

```json
{
  "commandVersion": 1,
  "publicationId": "f475f006-ce40-4c25-aa60-2b51f9a8331a",
  "scopeId": "finance",
  "kind": "roots",
  "rootActor": {"kind": "user", "id": "user-opaque-42"},
  "artifacts": [
    {
      "localKey": "invoice-file",
      "type": {"key": "core.file", "version": 1},
      "payload": {
        "displayName": "invoice-1001.pdf",
        "declaredMediaType": "application/pdf",
        "sourceKind": "upload"
      },
      "blob": {
        "sha256": "...",
        "length": 82193
      },
      "references": []
    }
  ]
}
```

This is the durable intent. A submission supplies, for example,
`blobAuthorities.invoice-file = {kind: "upload-claim", claimId: "..."}`. The claim
may expire and be replaced while this JSON remains byte-for-byte identical.

All roots share one scope and logical supplying actor. Different actors or unrelated
atomic units use separate publication IDs. Batching is an atomicity decision, not a
bulk-import convenience: very large imports use bounded publications and a later
domain manifest or completion artifact.

### Run publication

```json
{
  "commandVersion": 1,
  "publicationId": "f475f006-ce40-4c25-aa60-2b51f9a8331a",
  "scopeId": "finance",
  "kind": "run",
  "run": {
    "procedure": {"key": "invoice.extract", "version": "3"},
    "initiator": {"kind": "service", "id": "ingest-coordinator"},
    "executor": {"kind": "service", "id": "extractor-v3"},
    "inputs": [
      {
        "role": "subject",
        "ordinal": 0,
        "artifactId": "8f196f93-6bd5-44ed-86f7-cc001a34b510"
      }
    ],
    "parameters": {"languageHint": "de"},
    "implementation": {
      "executableSha256": "...",
      "extractor": "invoice-parser-3.4.1"
    },
    "receipt": {"outcome": "succeeded"}
  },
  "artifacts": [
    {
      "localKey": "candidate",
      "output": {"role": "candidate", "ordinal": 0},
      "type": {"key": "bookkeeping.invoice-candidate", "version": 2},
      "payload": {
        "invoiceNumber": "1001",
        "total": {"currency": "EUR", "minorUnits": 11900}
      },
      "references": []
    }
  ],
  "evidence": []
}
```

Input ordinals are contiguous per role. Inputs must be existing readable artifacts in
the route scope; a request-local output cannot be an input. A multi-stage pipeline
therefore publishes one completed run at a time. One procedure may legitimately emit
several leaf artifacts and a final artifact that structurally references earlier
outputs.

A production publication has at least one output. A failed or interrupted attempt has
none and creates no production run.

### Transaction algorithm

The server performs one short transaction after computation and blob upload have
finished:

1. Bind the authenticated stable publisher and one scope context; verify that the
   store is in `normal` mode, the route matches the intent, and the expected epoch is
   current.
2. Claim or lock `(scope_id, publication_id)` across both `publications` and
   `publication_id_exclusions`.
3. If already successful, authorize and compare the semantic request digest, then
   return the original result or a conflict. If excluded by recovery, return
   `PUBLICATION_DATA_LOST` for the original publisher/digest or a conflict otherwise.
4. Load exact type versions and validate every payload, blob policy, reference rule,
   and bound.
5. Lock/validate all existing inputs, reference targets, and authorized blob-reuse
   sources in the same scope.
6. Resolve the submission's replaceable blob authorities to each exact declared blob
   digest/length without using authority IDs in semantic hashing.
7. Allocate optional run and artifact UUIDs not reserved by live or
   recovered-exclusion records, resolve earlier local references, validate target
   types, and calculate artifact digests in topological order.
8. Validate the optional run, ordered inputs, output roles, and evidence.
9. Prepare the complete immutable row set and response mapping without external work.
10. As the final serialized phase, lock the scope counter and allocate its next
    publication sequence.
11. Insert the finalized publication, optional run, artifact records/contents,
    references, inputs, and evidence, then commit immediately.

If any step fails, no publication, run, artifact, relation, evidence row, or feed entry
is visible. Previously uploaded unclaimed bytes remain inaccessible through artifact
reads and expire through operational cleanup.

Allocating the per-scope sequence at the final phase orders committed publications
without a global database serialization point. Consumers treat it as an opaque
monotonic position, not a business count or time. Retained publication items are
strictly increasing but consumers MUST NOT require contiguity: divergent recovery can
leave a permanently excluded original sequence with no fabricated feed item.

The publication row is first inserted with its final non-null sequence. There is no
committed or visible provisional/finalizing publication and no post-insert sequence
update. The counter lock covers only bounded database work prepared in steps 1–9; no
network, schema compilation, blob streaming, or other external work occurs in the
serialized tail. Rollback exposes neither the row nor the counter increment, and
database constraints/triggers make the sequence immutable after insertion.

`committed_at` is sampled in that final phase. It is diagnostic storage time, not the
ordering key, an exact durable-commit timestamp, or the artifact's domain event time.
Domain types carry their own captured/occurred/effective dates with explicit semantics.

Step 2 uses a transaction-scoped publication lock plus the final unique constraint; it
is not an unsafe check-then-insert. A competing request waits, then observes either the
committed publication or the first transaction's rollback.

### Result

```json
{
  "scopeId": "finance",
  "committedStoreEpoch": "7dddb210-58da-48c7-b54f-4bfda879f6ab",
  "publicationId": "f475f006-ce40-4c25-aa60-2b51f9a8331a",
  "publicationRequestSha256": "...",
  "sequence": 418,
  "committedAt": "2026-08-22T10:31:18.124Z",
  "runId": "2fa216ec-b9a2-45bc-bbbb-338917851605",
  "artifacts": [
    {
      "localKey": "candidate",
      "artifactId": "ef82a8e2-12dd-4d33-ab8e-43286ad88d92",
      "artifactSha256": "...",
      "typeDefinitionSha256": "..."
    }
  ]
}
```

The response contains the server-authoritative semantic request digest and exact
type-definition digests so a client can durably acknowledge the compared intent and
detect a broken deployment or stale local descriptor immediately. The
`Artifact-Store-Epoch` response header reports the current epoch; on an explicitly
reconciled replay after recovery it can differ from `committedStoreEpoch`, proving that
the original publication survived the restore.

## Evidence

### Initial locator kinds

Version 1 supports four closed locator kinds:

```text
artifact-root
json-pointer
byte-range
page-region
```

- `artifact-root` identifies the entire artifact.
- `json-pointer` uses RFC 6901 against the artifact payload.
- `byte-range` uses `[start, endExclusive)` byte offsets in the primary blob. Text
  producers use UTF-8 byte offsets, avoiding JavaScript/.NET UTF-16 disagreement.
- `page-region` identifies a one-based page and an integer normalized bounding box.
  Coordinates use millionths of page width/height rather than JSON floating point.

The server validates locator syntax and obvious bounds against retained JSON/blob
length. It does not become a PDF parser; producer/type tests validate media-specific
claims such as actual page geometry.

### Evidence relation

Conceptually:

```text
run_id
output_artifact_id
output_locator
input_role
input_ordinal
input_locator
ordinal
```

The input artifact ID is resolved through the run-input row. The database enforces
that the named output belongs to the run and the named input is declared by the same
run. Evidence ordinals are contiguous.

Evidence is included in the publication-request digest but not the artifact digest.
It describes production grounding, not the output's typed content. Richer locator
kinds can therefore be added under a later command version without changing existing
artifact identity.

## Read API

### Context and type discovery

```text
GET /v1/context
GET /v1/types
GET /v1/types/{typeKey}/versions/{version}
```

Context returns command/profile versions, store epoch, recovery mode, supported
features, staging quotas, and all hard limits. Type retrieval returns the exact
definition and digest. Clients cache by exact key/version/digest, never by “latest”.
The type collection is keyset-paginated in `(type_key, version)` order under a bounded
limit; administrative registration during a scan cannot change an already returned
definition.

### Artifacts and content

```text
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}
HEAD /v1/scopes/{scopeId}/artifacts/{artifactId}/content
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/content
POST /v1/scopes/{scopeId}/artifacts/batch-get
```

The artifact envelope returns exact type, payload, blob metadata, digest, publication,
root/run producer, structural references, and links to graph reads. It has an ETag
based on immutable occurrence identity/content but no `save`, `patch`, or `latest`
operation.

`HEAD` and ranged `GET` authorize the occurrence first. No blob-by-digest public route
exists.

`batch-get` accepts a bounded ordered list of exact artifact UUIDs and returns one
position-preserving result per requested ID. It is a projector/UI round-trip
optimization, not a query language; each item is authorized as though fetched
individually.

### Runs and graphs

```text
GET /v1/scopes/{scopeId}/runs/{runId}
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/producer
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/producer-inputs
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/sibling-outputs
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/consuming-runs
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/direct-derivations
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/references
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/referrers
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/supporting-evidence
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/evidence-usages
GET /v1/scopes/{scopeId}/artifacts/{artifactId}/lineage
```

These routes have one direction each:

- `producer` returns the artifact's producing run, or an explicit null producer for a
  root;
- `producer-inputs` returns the ordered inputs of that producing run, or an empty
  collection for a root;
- `sibling-outputs` returns every output of the producing run, including the subject
  artifact, or an empty collection for a root;
- `consuming-runs` returns one entry per later run that declares the artifact as an
  input, including every matching input role/ordinal;
- `direct-derivations` returns one entry per output occurrence of those consuming
  runs, including all of that run's matching input role/ordinals;
- `references` and `referrers` traverse outgoing and incoming composition edges;
- `supporting-evidence` returns evidence asserted for locations in this output; and
- `evidence-usages` returns later evidence assertions that cite this artifact as an
  input.

`GET /runs/{runId}` returns the exact bounded run receipt plus its ordered inputs,
output summaries, and evidence. Production causality and composition are never merged
into a generic `relationships` response.

Write/read limits also guarantee that every accepted artifact envelope and complete
run resource fits its corresponding maximum single-resource response. A valid
publication must never create a resource that its exact read endpoint cannot return.

Every collection route uses a bounded default and maximum `limit`, deterministic
ordering, and an opaque keyset cursor bound to the scope, store epoch, route direction,
filters, and a `throughSequence` captured from the scope high-water on the first page.
Later pages stay at that boundary, so newly committed inbound edges do not lengthen a
scan in progress. The frozen orders are:

| Collection | Keyset order |
| --- | --- |
| artifact lists and direct derivations | `(publication_sequence, publication_ordinal, artifact_id)` |
| consuming runs | `(publication_sequence, run_id)` |
| producer inputs | `(input_role, input_ordinal, input_artifact_id)` |
| sibling outputs | `(output_role, output_ordinal, artifact_id)` |
| references | `(role, ordinal, target_artifact_id)` |
| referrers | `(source_publication_sequence, source_publication_ordinal, role, ordinal, source_artifact_id)` |
| supporting evidence | `(evidence_ordinal)` within the producer run |
| evidence usages | `(output_publication_sequence, output_publication_ordinal, evidence_ordinal)` |

No route uses offset pagination.
Even collections bounded by one publication obey response-byte limits.

Lineage is a bounded scope-local convenience over the same edges. The request specifies
direction, edge kinds, maximum depth, and maximum nodes. Limit exhaustion returns an
explicit truncation marker, never an apparently complete graph.

### Exact listing

```text
GET /v1/scopes/{scopeId}/artifacts
```

Version 1 supports keyset pagination and only exact/indexable filters:

- exact type key and versions;
- publication sequence range;
- committed-time range;
- producer procedure key/version;
- root versus derived.

It does not accept arbitrary payload predicates, text queries, ranking, “current”, or
semantic similarity. Those belong in projections.

Each listing page repeats the exact filters, `throughSequence` boundary, store epoch,
and last `(publication_sequence, publication_ordinal)` key. The SDK refuses to mutate
those values during one scan. Because this is a single already-authorized scope with
immutable unpruned rows, the initial protocol may use a transparent versioned cursor;
cryptographic sealing is optional.

## Scope-local publication feed

### Operation and shape

```http
GET /v1/scopes/{scopeId}/publications?afterSequence=417&storeEpoch=...&limit=100
```

The response returns whole publications in increasing scope sequence. Each item
contains the complete atomic membership boundary:

- publication identity, authoritative request digest, sequence, commit time, kind,
  publisher, and logical actors;
- optional run ID;
- every artifact's ID, local key, exact type key/version, artifact digest, and root/run
  producer summary;
- the response high-water sequence and a next cursor consisting conceptually of store
  epoch and last sequence.

Payloads, blob bytes, full run receipts, references, and evidence are not copied into
the feed. A consumer uses the bounded batch/read and graph endpoints under current
authorization. “Complete publication” means that no consumer sees only some member IDs
of an atomic write; it does not mean the feed is a second content archive.

A publication is never split across pages. Limits apply to publication count, artifact
summary count, and response bytes, and every single publication is bounded by the
write contract.

The deployed limits satisfy:

```text
maxSerializedPublicationFeedItem <= maxFeedResponseBytes
```

The write path calculates or safely upper-bounds the serialized feed item and rejects
a publication that cannot later be returned whole. Page-byte targets may reduce the
number of items but never strand one accepted publication.

The feed is at least once. A consumer fetches the exact resources it needs, applies one
complete publication, and stores its new checkpoint in the same application
transaction. It may then schedule follow-up work. The feed is not a queue, does not
track consumers, and does not imply that every publication needs processing.

No publication rows are pruned in version 1. Because the route is already bound to one
authorized scope, the initial cursor need not encode a changing allowed-scope set or a
global filtered position. An implementation may sign/opaque-encode cursors defensively,
but sealed multi-scope cursors are not a kernel requirement.

### Universal replay and artifact-oriented bootstrap

The unpruned publication feed from sequence zero is the universal rebuild path. A
projector consumes each atomic membership summary in order, hydrates that publication's
own artifact envelopes and optional complete run resource through bounded reads, and
checkpoints only after applying the complete publication. It does not use inbound
`referrers`, `consuming-runs`, or `evidence-usages`, which can include later history.
This path can reconstruct projections over
publication actors, run implementations and receipts, input/output roles, structural
references, evidence, and atomic fan-out—not merely artifact payloads.

An artifact-oriented projector such as full-text search may use a faster high-water
bootstrap:

1. Read the scope's current high-water sequence `H` and store epoch from a feed
   response. `limit=0` is permitted for this boundary-only request.
2. Scan artifacts with publication sequence `<= H`, ordered by
   `(publication_sequence, publication_ordinal)` and constrained by the same exact
   filters on every page.
3. Start publication consumption strictly after `H`.

Core history is immutable and unpruned, so the bounded scan remains stable while new
publications arrive. A concurrent publication is either at or below `H` and visible in
the scan, or above `H` and visible in the feed.

The artifact scan is explicitly an optimization, not a universal snapshot. A
projector that needs historical publication actors, complete fan-out, run receipts,
input structure, or evidence must replay publications from zero unless a future
publication-shaped snapshot API supplies that closure.

After a divergent restore, the recovery procedure changes `storeEpoch` and completes
write-disabled reconciliation before reopening. Old cursors return
`FEED_REBOOTSTRAP_REQUIRED`; they never silently continue on a different history.
Pending outboxes likewise stop on an epoch mismatch and participate in the divergent
recovery contract rather than automatically claiming an apparently unused UUID.

### Why the feed contains publications only

The kernel emits no generic stringly typed resource events. Type registration is
administrative and fetched by exact version. Jobs and projections have their own
stores.

A future extension that changes content visibility must provide a versioned merged
visibility/change feed (or an equivalent ordering protocol) and make extension-aware
projectors use it. Two independently consumed, unordered publication/removal feeds are
not sufficient because a delayed historical publication could re-add removed content.
The historical publication sequence and IDs remain unchanged; the extension defines
the additional current-visibility ordering.

## First-party SDK

The SDK is part of the first release. A minimal raw API without this layer would move
canonicalization, retry, local-reference ordering, and evidence bugs into every
producer.

HTTP and the closed publication DTOs are authoritative. The TypeScript examples below
are illustrative, not a requirement that every application run TypeScript or hold
credentials in a webview. The release publishes an OpenAPI/JSON contract, type schemas,
and shared conformance vectors; thin TypeScript, Rust/Tauri, and JVM/Scala clients use
the same wire model. The server remains digest-authoritative, so a thin client need not
reimplement hashing before it can publish safely.

The richest builder can live first in the reference SDK. Other clients may generate
the same intent from typed DTOs and use the shared outbox/projector algorithms while
their ergonomic builders mature. They must not invent different semantics.

The first release is split by responsibility:

```text
artifact-store-client      HTTP DTOs, upload/read/publish, prepared intent
artifact-store-schema      type/procedure descriptors, validators, golden vectors
artifact-store-projector   feed replay, artifact bootstrap, checkpoint helpers
artifact-store-recipes     optional correction/decision/action conveniences
```

The recipes package is optional. The base client knows structural store operations;
it does not assume that every domain has a universal correction, decision, or action
type family.

### Type descriptors

```ts
const InvoiceCandidate = defineArtifactType({
  key: "bookkeeping.invoice-candidate",
  version: 2,
  typeDefinitionSha256: "...",
  payloadSchema: invoiceCandidateSchema,
  blob: "forbidden",
  references: {},
});
```

A descriptor supplies:

- a static payload type;
- exact key/version and expected definition digest;
- runtime validation under the frozen profile;
- blob and reference-role helpers;
- safe exact parsing of retrieved envelopes.

Unknown types or versions remain retrievable as raw envelopes. The SDK never silently
parses a newer version using an older model.

Before a first-party producer accepts work, it compares every enabled descriptor's
expected definition digest with the store. A mismatch is a deployment failure, not a
best-effort parse. Publication results repeat the exact digest as a second check.

### Procedure descriptors

```ts
const ExtractInvoice = defineProcedure({
  key: "invoice.extract",
  version: "3",
  inputs: {subject: artifactInput(CoreFile)},
  outputs: {candidate: artifactOutput(InvoiceCandidate)},
  parameterSchema: extractInvoiceParametersSchema,
  implementationSchema: extractInvoiceImplementationSchema,
  receiptSchema: extractInvoiceReceiptSchema,
});
```

Descriptors provide first-party compile-time and runtime checks for roles, payloads,
parameters, implementation receipts, and evidence. They compile to the one raw run
publication intent; they are not server resources. A caller can bypass the SDK, so
these procedure-specific checks are not falsely presented as kernel guarantees.

### Durable publication builder

The SDK prepares immutable values; it cannot make an arbitrary application database
durable by itself. The application creates a publication UUID, supplies a real outbox,
and commits `save` in its own transaction before any store upload or publication call:

```ts
interface PreparedPublication {
  readonly intent: PublicationIntent;
  readonly semanticSha256: string; // client diagnostic; server remains authoritative
  readonly expectedStoreEpoch: string; // recovery precondition, not semantic identity
  readonly requiredBlobs: readonly RequiredBlob[];
}

interface PublicationOutbox {
  save(publication: PreparedPublication): Promise<void>;
  markCommitted(
    publicationId: string,
    result: PublicationResult,
  ): Promise<void>;
}
```

`requiredBlobs` contains declarations and durable serializable application-owned
reacquisition handles, not expiring store claims, open streams, or process-local
pointers. No Prisma, Entity Framework, filesystem, or queue abstraction is baked into
the base SDK. Deployment-specific adapters implement atomic persistence in the
application's chosen store.

An outbox adapter makes `save` idempotent for the same exact prepared value and
conflicts on mutation. `markCommitted` is idempotent for the same authoritative result,
retains the compact recovery acknowledgment, and commits before the application reports
final success or uses returned IDs for consequential work.

The builder and client:

- create an exact immutable `PublicationIntent` from the caller-supplied UUID;
- keep declared blob identities and durable reacquisition hints separate from
  replaceable upload/reuse authority;
- compile typed local handles into request-local keys;
- topologically order local structural references;
- assign contiguous input/output/reference/evidence ordinals;
- validate payloads, attributes, bounds, and locators;
- calculate a diagnostic semantic digest;
- bind fresh blob authorities after the outbox save and replace expired
  equivalent authority;
- submit a `PublicationSubmission` and retry ambiguous failures only with the same UUID
  and intent;
- record the store epoch with pending/successful outbox entries and stop automatic
  retry when that epoch changes or the store is reconciling;
- reject local reuse of a publication UUID after intent mutation;
- verify returned type-definition and artifact digests; and
- expose all exact IDs and versions to the caller.

The intended lifecycle is `prepare -> application outbox save -> bind current blob
authorities -> publish -> mark committed`. Generic `correct`, `decide`,
`publishActionRequest`, and `publishActionReceipt` helpers live in the optional recipes
package and still compile to the same PUT.

Retrieval returns immutable values. There is no mutable ORM object, hidden “latest”,
automatic occurrence deduplication, or `save()`.

### Projector helper

```ts
for await (const publication of store.publications({scopeId, after: checkpoint})) {
  await projectionDb.transaction(async tx => {
    await projector.apply(tx, publication);
    await checkpoints.save(tx, publication.cursor);
  });
}
```

The projector package exposes two deliberately different operations:

- `replayFromStart`, the universal publication-shaped rebuild; and
- `bootstrapArtifacts`, the high-water optimization whose type/contract states that
  it is valid only for artifact-oriented projections.

It cannot make a remote projection exactly once; the application transaction and
idempotent handler provide that property.

### Trusted adapters

Untrusted webviews, plugins, agent models, and generic shell tools do not receive broad
publisher credentials. A trusted adapter owns:

- authenticated scope and publisher;
- allowed type/procedure descriptors;
- actor-attribution policy;
- source artifact map;
- publication UUID/outbox, successful acknowledgment journal, and byte reacquisition;
- any job-attempt or human-authorization check outside the store.

The adapter can accept proposed content from an untrusted component. It must revalidate
the final exact semantic intent before publication.

## Reusable workflow patterns

### Capture, enrich, and evaluate

```text
root source artifact
    -> classification run -> classification candidate
    -> OCR run            -> exact OCR text
    -> extraction run     -> structured candidate
    -> evaluation run     -> consistency/quality evaluation
```

Each arrow is a production input edge. Parallel or repeated runs create alternatives.
Search/preference projections choose what to display; no artifact is overwritten.

### Correction and decision

```text
candidate + correction instruction
    -> human-correction run -> corrected candidate

proposal + policy/capture context
    -> human-decision run -> accept/reject/modify decision
```

A human task's assignment, due date, open state, and optimistic revision remain
application state. The completed attributed decision is an artifact.

### External action

```text
proposal -> exact decision -> action request -> external executor -> action receipt
```

Publication idempotency only protects store publication. The executor uses the request
artifact UUID as a downstream idempotency/reconciliation key and publishes success,
failure, or ambiguity only after authoritative observation. A local artifact never
pretends to prove a remote payment, email, calendar write, or filesystem mutation.

### Frozen collection and completeness

A live collection is a projection. When exact membership matters, publish a typed
manifest or narrow bundle whose references freeze the members and ordering.

A negative or completeness result consumes:

- the exact manifest/corpus boundary or feed high-water;
- exact query/checklist/policy versions;
- ingestion failures or skipped members;
- completion status of every required source.

“Not found” is valid only for a closed, successfully searched world. Otherwise the
durable outcome is `incomplete` or `degraded`.

### Results larger than one publication

The publication limit is intentional. A large job publishes bounded chunk/segment
artifacts across several runs or root batches, then publishes a final domain manifest
and completion report over those exact pieces. Consumers treat the final artifact, not
the presence of some chunks, as completion.

### Mutable external data

If a mutable balance, calendar entry, webpage, workspace file, or policy affects a
durable result, capture an exact occurrence or externally verifiable version first.
Copying a display string into a receipt is not provenance.

### Application projections

The following remain mutable projections:

- `staged_documents.status` and review queues;
- current/preferred extraction;
- case, todo, or intent state;
- search indexes and facets;
- model cache and session state;
- duplicate groups and entity resolution;
- UI activity entries and notifications.

Projection rows point to exact artifact UUIDs and advance after complete feed
publications.

### Coordinator-owned stale-worker fencing

The avenCEO backtest proves that a stale worker must not publish after its lease is
reassigned. The core does not understand application job tokens. Version 1 therefore
requires this topology:

1. A worker returns proposed outputs to the application coordinator.
2. The coordinator serializes completion against lease/reassignment.
3. It rejects a stale attempt before constructing publication authority.
4. It persists the immutable semantic intent and permanent publication UUID in an
   outbox, with durable byte-reacquisition information kept separately.
5. It marks the job `finalizing`, preventing reassignment.
6. It obtains upload claims, binds them to the saved intent, and performs/retries the
   store PUT as the only publisher.
7. It records the returned scope sequence and completes the job.

In version 1 a worker never calls the artifact store, including the upload endpoint.
It streams or spools bounded output bytes back through coordinator-owned storage; the
coordinator is the principal that owns both upload claims and publication. This is
less efficient for very large outputs but leaves no authority ambiguity. A future
upload-only capability may bind a worker transfer to `(scope, publicationId,
localKey, digest, length)` and make the resulting claim coordinator-consumable. That
capability and any direct-publication guard are extensions, not implied behavior.

A crash in `finalizing` resumes the same outbox entry and publication UUID. If a future
topology lets independent workers publish directly, a store-side guard/precondition
extension is required; application code must not pretend the race disappeared.

## Backtest: avenCEO-tools integration

### What maps cleanly

| Existing concern | Target representation |
| --- | --- |
| Uploaded bytes | `core.file` root occurrence plus shared physical blob |
| `staged_documents` | Mutable inbox/workflow projection pointing at artifacts |
| Classification/OCR/extraction | Separate production runs and typed outputs |
| Consistency report | Versioned evaluation artifact, never overwritten |
| Review correction | Correction run producing a new candidate |
| Acceptance/rejection | Typed decision artifact over exact candidate |
| Generated document | Run with atomic document/blob/metadata outputs |
| Search | Application projector consuming publication feed |
| Domain attachment rows | Domain projection, except genuine frozen composition |
| Jobs/attempts/leases | Existing operational subsystem plus coordinator outbox |

### Migration path

1. Keep the current tenant-database selection as the outer isolation boundary. Add one
   explicit artifact scope context inside it; a first deployment may use one default
   scope if no finer sharing boundary is needed.
2. Define source-controlled descriptors for `core.file` and one narrow invoice family:
   extraction candidate, evaluation, human correction/decision, and generated
   document/request/receipt as needed.
3. Add a trusted artifact client and publication outbox beside the existing database.
   Store the prepared intent and publication UUID before upload/publication, with
   durable byte-reacquisition information outside transient claims.
4. Change ingestion so each arrival creates an occurrence. The same PDF uploaded twice
   may share bytes but retains two artifact UUIDs, filenames, sources, and times.
5. For connector idempotency, persist `(account, message, part) -> publication UUID` in
   the connector. Retrying the same part replays that occurrence; an unrelated equal
   blob creates another occurrence.
6. Turn `staged_documents` into a compatibility projection containing source artifact,
   selected result/evaluation IDs, job status, review state, and optimistic revision.
   It stops being content or provenance truth.
7. Route worker results through the coordinator fencing pattern. Publish a successful
   extraction/evaluation only after the current attempt is serialized; failures remain
   attempt records.
8. Change review to append correction and decision artifacts, then update the inbox's
   selected IDs. Never overwrite a prior extraction or evaluation.
9. Build the existing product search behavior as a feed projector with explicit code
   for the small registered type set.
10. Migrate legacy rows honestly: capture retained exact bytes as roots, record legacy
    IDs/source metadata, and avoid inventing runs or actors that the old database cannot
    prove. Compatibility projections can preserve old UI IDs temporarily.
11. Before applying production record-retention or erasure requirements, install a
    separately specified content-lifecycle extension and application discovery/policy
    flow. Do not encode those rules into artifact payloads or job status.

### First useful vertical

```text
file arrival
  -> exact root occurrence
  -> coordinator-owned extraction run
  -> evaluation artifact
  -> reviewer correction/decision
  -> inbox and search projections
```

This exercises every core primitive except structural bundle composition, while keeping
existing job and review UX.

### Result

The core is sufficient for ingestion, extraction, review, generation, and search
projection. The application must change its deduplication and mutable-row semantics.
Direct worker publishing remains unsupported until guarded, and controlled disposition
remains an explicit deployment extension rather than an artifact operation.

## Backtest: AvenOS integration

### What maps cleanly

| UI/workflow concern | Target representation |
| --- | --- |
| File, message, contact, event snapshot | Root or derived domain artifact |
| Intent proposal | Typed proposal artifact |
| Fan-out into todo/event/draft | One run with atomic outputs |
| Human gate | App task state followed by exact decision artifact |
| Payment/send/calendar effect | Request artifact plus executor receipt |
| Growing tax collection | Projection; frozen handover becomes manifest |
| Duplicate contact/scan suggestion | Evaluation candidate; removal requires a lifecycle extension |
| Current todo/intent/card status | Application projection |
| Federated search | AvenOS composition layer; artifact source is a projector |
| “Not found” | Durable only with closed-corpus/completeness evidence |

### Migration path

1. Put the artifact client in the trusted Tauri backend. The webview and model can
   propose content but cannot select arbitrary publisher identity, scope, or type.
2. Replace mock artifact IDs with returned store occurrence UUIDs while leaving UI
   render kinds and answer shapes as UI contracts.
3. Define a small first workflow type family: intake/proposal, human decision, action
   request, and connector receipt. Domain event types distinguish civil all-day dates
   from timed instants; storage commit time is neither.
4. Choose personal or team scope at intake. Version 1 does not turn scope into mutable
   visibility state and cannot implement `me -> team` transfer.
5. Consume complete publications into intent cards, todos, navigation counts, and the
   artifact-search source. A fan-out publication updates all related projections in one
   local transaction.
6. Replace in-memory held closures with persistent application tasks bound to the exact
   proposal UUID. Confirmation publishes a decision; a narrow executor accepts the
   resulting exact request.
7. Model tax/document collections as mutable projections until the user creates a
   handover. That handover publishes a domain manifest with exact member references.
8. Preserve source health and indexed-through sequence in federated-query results. Only
   publish a negative result when the searched world is closed and complete.
9. Route a confirmed duplicate-removal request to an installed content-lifecycle
   extension. Deleting a card or occurrence projection never deletes shared bytes or
   artifact history by itself.

### First useful vertical

```text
invoice intake
  -> proposal
  -> persistent human task
  -> attributed decision
  -> payment request
  -> dedicated executor receipt
  -> UI/search projections
```

### Result

The core is sufficient for the immutable inputs, proposals, decisions, results, and
receipts in every mocked flow that remains within one chosen scope. UI intent, gate,
toast, skill, status, and query-composition concepts correctly remain outside.
Cross-scope copy and actual content disposition are the two product effects delegated
to explicit extensions.

## Backtest: avenAgent integration

### What maps cleanly

| avenAgent concern | Target representation |
| --- | --- |
| Authorized workspace input | Captured artifact occurrence before use |
| Materialized read-only file | Local adapter projection keyed by artifact UUID |
| Run trace/session JSONL | Operational/diagnostic state, not production receipt |
| Successful extraction/match/evaluation | Compact production run plus typed outputs |
| `call_key`/cache | Runtime optimization, not occurrence identity |
| Invoice number/path | Domain fields, never artifact ID |
| Output file | Projection unless deliberately published as an artifact |
| Shell/workspace/network mutation | Domain request/receipt boundary |
| Large result | Bounded chunks plus final manifest/completeness artifact |

### Migration path

1. Add a trusted agent adapter that receives authorized artifact UUIDs, fetches and
   verifies exact inputs, materializes them read-only, and owns a path-to-artifact map
   outside model control.
2. Capture a mutable host file as a new root occurrence before using it in a durable
   run. Path and size are not sufficient; bytes determine the input occurrence.
3. Define descriptors for the first finance vertical: invoice extraction, transaction
   parse, match candidate/evaluation, reconciliation report, and corpus completeness.
4. Keep session JSONL, prompts, hidden reasoning, tool chatter, cache records, SSE
   cursors, and interrupted attempts outside production provenance. The successful
   receipt contains only exact inputs, procedure/version, bounded parameters,
   implementation identity, outputs, and useful evidence.
5. Route proposed publications through an allowlisted adapter/outbox. The model cannot
   choose a broader scope, arbitrary type, actor identity, or undeclared source.
6. For reconciliation, publish a frozen input corpus/ingestion report before a complete
   result. Malformed or skipped files make completeness explicit rather than silently
   disappearing.
7. Treat local derived files as disposable materializations unless independent reuse
   justifies publishing their exact content.
8. Put consequential writes behind typed requests and narrow executors. Reconcile an
   ambiguous result before publishing a success receipt.
9. Keep session deletion separate from artifact disposition. If a product promise also
   removes captured or derived artifacts, invoke the installed content-lifecycle
   extension over exact occurrence IDs rather than inferring deletion from a missing
   JSONL file.

### First useful vertical

Pure read-only invoice/transaction reconciliation is the safest first integration. It
tests exact input capture, type descriptors, alternatives, evidence, bounded output,
and completeness without authorizing external effects.

### Result

The core is sufficient for durable agent inputs and results. The important migration
is trust-boundary work, not another artifact primitive: the adapter owns input identity
and publication authority while the model remains a proposer. Product-level artifact
disposition, if promised, remains an extension.

## Cross-application pressure-test matrix

| Required behavior | avenCEO-tools | AvenOS | avenAgent | Core answer |
| --- | --- | --- | --- | --- |
| Equal bytes, distinct arrivals | Yes | Yes | Yes | Blob reuse plus independent occurrence UUIDs |
| Atomic fan-out/multi-output | Yes | Yes | Yes | One publication and optional run |
| Corrections/alternatives | Yes | Yes | Yes | New run/output; preference projection |
| Exact causal inputs | Yes | Yes | Yes | Ordered pre-existing run inputs |
| Frozen composition | Attachments/packages | Handover/corpus | Corpus/result bundle | Structural references |
| Fine-grained grounding | OCR/invoice | Proposal evidence | Extraction/match | Four evidence locators |
| Human decisions | Review | Gates | Approval when used | Typed decision artifact |
| External effects | Bookkeeping/send | Payment/calendar/send | Shell/workspace/network | Request/receipt pattern |
| Mutable job/UI state | Jobs/review | Intents/todos/gates | Sessions/cache/SSE | Application database |
| Search | Product search | Federated source | Optional retrieval | Feed projector |
| Stale attempt protection | Required | Possible | Required for async jobs | Coordinator outbox; guard later |
| Cross-scope movement | Not first vertical | Explicit mock flow | Not needed initially | Deferred copy/declassification |
| Large result/completeness | Batch documents | Tax/reconciliation | Reports/corpora | Chunks plus final manifest/report |

No application requires a generic semantic edge, mutable artifact state, server-side
procedure registry, or kernel search engine to implement its common path.

## Broader scenario backtests

The core was also replayed mentally against uses not present in the three repositories.
These are design pressure tests, not promises of ready-made domain schemas.

### Email and attachments

A raw message or normalized message artifact references exact attachment occurrences in
ordered roles. Connector capture is a root or zero-input run; later classification and
threading are derived artifacts. Mailbox flags and folder membership are projections.

**Result:** passes. One-primary-blob remains sound because the message body and each
attachment are separate reusable occurrences; a domain email artifact composes them.

### Software build and release provenance

A source snapshot/manifest and toolchain description are inputs. A build run publishes
package blobs, SBOM, test report, and provenance attestations atomically where bounded.
A release artifact structurally references exact members. Deployment is a request and
receipt, not implied by package publication.

**Result:** passes. Portable signing and public verification are additive extensions;
the core retains enough exact data to construct their statements.

### Dataset and machine-learning workflow

A domain dataset manifest freezes ordered shards or samples. Training consumes that
manifest and configuration artifacts and emits checkpoint, metrics, and model-card
artifacts. Promotion/current model is a projection or typed decision. Very large
datasets use nested/chunked domain manifests.

**Result:** passes within configured object/publication bounds. Efficient billion-row
membership and object storage are later scalability extensions, not new identity
semantics.

### Scientific analysis and evidence packages

Captured measurements, calibration/protocol versions, analysis runs, tables, and plots
are artifacts. Evidence can ground reported JSON fields in source byte/page regions.
Exact decimals use strings or scaled integers.

**Result:** passes for document- and file-scale work. Domain-specific array formats,
signatures, richer units, and long-term preservation profiles sit above the kernel.

### Media transcoding

The original media is one file occurrence. Thumbnails, subtitles, waveforms, and
renditions are independently useful derived artifacts. A media package references the
chosen exact members.

**Result:** passes for bounded objects. Time-range evidence and large-object storage are
explicit extensions once required.

### Mutable documents and configuration history

Every committed revision is a new artifact consuming the prior revision and/or edit
instruction. Branch head, current deployment, draft presence, and collaborative cursor
remain mutable pointers.

**Result:** passes as an immutable revision archive, but the store is not a real-time
collaboration engine or mutable key/value database.

### External API snapshots and consequential actions

A price, balance, webpage, calendar entry, or policy response that affects a decision
is captured with provider/version/time receipt. The decision consumes that exact
snapshot. A later remote mutation uses request/receipt artifacts.

**Result:** passes. The store records what was observed and requested; it does not make
a remote service transactional.

### Signed records and attestations

Exact source bytes, canonical typed values, and production receipts provide stable
inputs for a typed signature or attestation artifact. Verification status is another
versioned evaluation, not a mutable boolean on the source.

**Result:** passes at the model level. Canonical portable run statements, key
management, trust policy, and external signature formats are outside version 1.

### Geospatial, telemetry, and high-volume events

Publishing one artifact for every high-frequency sample would be inefficient. A
producer should publish bounded immutable segments/windows with a typed format and
manifest, then derive summaries.

**Result:** viable for packaged segments, not intended as a raw high-throughput event
bus or time-series database.

### Poor-fit cases

The kernel should not be stretched into:

- frequently updated customer/account rows;
- scheduler leases and heartbeats;
- chat cursor or UI animation state;
- raw per-sample telemetry ingestion at very high rates;
- a general Kafka replacement;
- arbitrary graph knowledge storage;
- unconstrained multi-gigabyte object storage in the first backend.

These cases use purpose-built stores and publish only durable, independently useful
captures, results, decisions, or packages into the artifact store.

## Extensibility review against the full architecture

The core is extensible only if later features can be added without changing what
existing IDs and edges mean. The following paths satisfy that test.

| Later capability | Core seam | Compatibility rule |
| --- | --- | --- |
| Search service | Complete publication feed and exact type versions | Projector state is disposable; no artifact mutation |
| Retention/erasure | Stable record/content split, non-cascading IDs, privileged DB role boundary | Add policy/tombstones and a versioned merged visibility feed; never reinterpret a live artifact |
| Financial-record hold policy | Runtime append-only history and typed corrections | Policy extension controls disposition; core does not calculate law or periods |
| Cross-scope sharing | Scope-local identities and exact source digests | Privileged copy creates a new target occurrence and origin receipt |
| Common schema library | Self-contained local `$defs` | Versioned source imports compile into registered schema |
| Dynamic schema onboarding | Immutable type identity/profile | Add an administrative registry/profile without changing old versions |
| Procedure registry | Exact run key/version and SDK descriptors | Add validation/metadata for new publications; old receipts remain exact |
| Content cache | Immutable inputs and implementation receipt | Derive extra run/input hashes; cache reuse never becomes occurrence idempotency |
| Portable signing/export | Stable digests and graph IDs | Publish typed portable statements; do not claim internal UUIDs are global content IDs |
| Richer evidence | Evidence is separate from artifact digest | Add locator kinds under a new command/profile version |
| Reference-path locators | Explicit reference graph | Add a versioned locator/canonicalization contract; old artifacts remain unchanged |
| Direct-worker fencing | Publication transaction hook/precondition | Validate external guard atomically before insert |
| Object-store backend | Blob digest/length contract | Change physical storage behind artifact-authorized content reads |
| Feed pruning/sealed cursors | Publication sequence and store epoch | Add a new feed version/bootstrap contract; do not alter old sequence meaning |
| Vector retrieval | Artifact/type-aware search projection | Index derived vectors outside immutable tables |

### Content-lifecycle extension boundary

The core exposes no delete, restriction, hold, or purge operation. A correct deployment
extension can nevertheless be built without changing core occurrence identity because:

- the stable occurrence row is distinct from exact content;
- references bind exact target occurrence UUIDs and snapshot target content digests;
- graph foreign keys do not cascade;
- runtime roles already lack update/delete authority;
- primary blob ownership is explicit through artifact-content rows and upload claims;
- publication/feed positions and recovery epochs are stable;
- applications already keep mutable discovery and policy state outside artifacts.

Such an extension would define its own policy inputs, discovery coverage, privileged
authorization, content-unavailability/tombstone semantics, dependency handling, blob
garbage collection, merged visibility/removal ordering, audit, and backup
reconciliation. Those are not partially implemented or implicitly promised here.
Install and validate the extension before storing data for which the deployment
requires those behaviors.

This boundary also preserves the ordinary immutability principles useful for financial
records: runtime writes append, corrections do not obscure originals, exact bytes and
versions remain attributable, and projections cannot delete history. How long a record
must remain, when it may be removed, and what evidence of disposition survives are
policy-extension concerns.

### Future schema reuse

The path for a common type collection is intentionally simple:

```text
authored schema
  imports common.money@2 and common.party-ref@1
        |
        v
build/registration compiler resolves exact versions
        |
        v
self-contained schema with local $defs
        |
        v
kernel validates and digests exact resolved definition
```

The compiler records dependency versions in source control or administrative build
provenance. Runtime validation never fetches a moving dependency. A change to a common
type produces a new resolved consumer definition and therefore a new consumer type
version when its contract changes.

### Extension discipline

A later feature is safe when it:

- creates new typed artifacts, projections, or administrative side tables;
- consumes the publication feed without altering it;
- adds a versioned endpoint/profile for new semantics;
- preserves existing occurrence IDs, content digests, and edge meanings.

It is unsafe when it:

- makes content digest unique and collapses occurrences;
- changes an artifact under its UUID;
- turns references into mutable arbitrary edges;
- treats a job attempt as a production run;
- lets a new scope see an old occurrence without an explicit transfer contract;
- silently interprets a newer schema/procedure as an older version;
- makes a projection or cache authoritative history.

## What was cut and why

| Cut from the full proposal | Why it is not kernel | Reconsider when |
| --- | --- | --- |
| Cross-scope graph operations | Drives authorization, declassification, and cursor complexity | A concrete sharing flow exists |
| Dynamic schemas/dependencies | First-party source-controlled types suffice | Independent producers must onboard at runtime |
| Server procedure registry | SDK descriptors cover known producers | Runtime discovery/validation becomes a product need |
| General idempotency subsystem | Publication UUID is its own permanent record | Another durable non-publication command needs it |
| Generic change items | Complete publications are the only core changes | A content-lifecycle or other control extension needs its own feed |
| Sealed/filtered global cursors | Feed is exact-scope and unpruned | Multi-scope external aggregation appears |
| Run/input/locator hashes | Immutable values can derive them | Cache/signature/verifier requires persisted hashes |
| Reference locators | Whole-artifact composition is enough initially | A concrete member-slice composition case appears |
| Broad locator vocabulary | Four kinds cover file/OCR/document grounding | Media/table/reference paths are implemented |
| Kernel search | Feed projectors satisfy first integrations | Several apps need a shared search product |
| Search generations/vector retrieval | No measured need yet | Rebuild availability or semantic retrieval requires it |
| Job attempt tokens | Coordinator publication closes current race | Independent direct worker publishing is necessary |
| Mutable current/preferred state | Domain-specific and rebuildable | Never; keep in application projections |
| Generic audit events | Publication history is not a security log | An operations/compliance product defines exact needs |
| Retention/erasure policy engine | Depends on deployment policy and discovery | Install as an explicit content-lifecycle extension |
| Portable signing/export rewriting | No current interchange product | Offline verification/export becomes concrete |
| Alternative blob backend | PostgreSQL is sufficient within measured limits | Capacity measurements exceed it |

The cuts reduce platform surface without cutting the five primitives that recurring
workflows actually use: artifacts, structural references, runs, evidence, and atomic
publications.

## HTTP surface summary

```text
GET  /v1/context
GET  /v1/types
GET  /v1/types/{typeKey}/versions/{version}

PUT  /v1/scopes/{scopeId}/uploads/{uploadId}
PUT  /v1/scopes/{scopeId}/publications/{publicationId}

GET  /v1/scopes/{scopeId}/artifacts
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}
HEAD /v1/scopes/{scopeId}/artifacts/{artifactId}/content
GET  /v1/scopes/{scopeId}/artifacts/{artifactId}/content
POST /v1/scopes/{scopeId}/artifacts/batch-get
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
GET  /v1/scopes/{scopeId}/runs/{runId}
GET  /v1/scopes/{scopeId}/publications
```

Root, correction, review, decision, request, and receipt helpers all compile to the one
publication PUT. No raw endpoint is added for each workflow noun.

## Error contract

Errors use problem JSON with stable codes.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `MALFORMED_REQUEST` | Closed protocol/profile syntax failed |
| 401 | `AUTHENTICATION_REQUIRED` | No valid principal |
| 403 | `SCOPE_DENIED` | Principal cannot use route scope |
| 404 | `RESOURCE_UNAVAILABLE` | Unknown or inaccessible without disclosure |
| 409 | `UPLOAD_CONFLICT` | Upload UUID is already bound to another declaration |
| 409 | `PUBLICATION_CONFLICT` | Publication UUID is bound to another intent/publisher |
| 409 | `LOCAL_REFERENCE_ORDER` | Local target was not earlier in the intent |
| 409 | `INPUT_UNAVAILABLE` | Input/reference/reuse source is unavailable in scope |
| 409 | `STORE_EPOCH_CHANGED` | Publication precondition names an obsolete recovery epoch |
| 409 | `FEED_REBOOTSTRAP_REQUIRED` | Store epoch differs from cursor |
| 410 | `UPLOAD_EXPIRED` | Obtain replacement authority for the same bytes |
| 410 | `PUBLICATION_DATA_LOST` | Reconciliation quarantined an old identity whose original result is unavailable |
| 413 | `LIMIT_EXCEEDED` | Blob, JSON, batch, graph, or response bound exceeded |
| 416 | `CONTENT_RANGE_NOT_SATISFIABLE` | Requested blob byte range is invalid or outside exact length |
| 422 | `UPLOAD_DIGEST_MISMATCH` | Supplied bytes differ from declared digest or length |
| 422 | `SCHEMA_VALIDATION_FAILED` | Exact type or reference contract failed |
| 422 | `INVALID_EVIDENCE` | Evidence relation or locator is invalid |
| 429 | `STAGING_QUOTA_EXCEEDED` | Principal/scope staging or upload-concurrency quota is exhausted |
| 500 | `INTEGRITY_FAILURE` | The operation discovered corruption or a broken invariant; do not retry it automatically |
| 503 | `STORE_RECONCILIATION_REQUIRED` | Divergent recovery has fenced ordinary mutations |

Errors never expose hidden payloads, SQL, internal filesystem paths, another scope's
existence, or the prior result of a publication owned by another principal.

On `INTEGRITY_FAILURE`, the process fences the affected scope or store as appropriate
and marks itself unready. Health/load-balancing endpoints may subsequently report 503,
but the operation that discovered corruption returns 500 rather than inviting generic
transient retries.

## Database enforcement

At minimum, use separate roles for:

- migration/type administration;
- runtime publication through constrained functions;
- runtime reads under bound scope context;
- recovery administration.

Runtime roles receive no direct `UPDATE`, `DELETE`, `TRUNCATE`, trigger-disable, or
schema-alter privilege on immutable tables. Defensive triggers reject mutation even if
a grant is accidentally widened. RLS or constrained security-definer functions enforce
the scope context on every protected read and write.

The canonical upload, publication, and type-administration entry points read and lock
`store_state` and fail before mutation unless its mode is `normal`. Only the recovery
role may enter/leave `reconciling`, restore exact identities, or insert immutable
`publication_id_exclusions`. Ordinary runtime roles cannot bypass this fence or alter
the epoch.

No application role receives direct `SELECT` on the globally deduplicated blob table.
The content-read function accepts scope plus artifact UUID, authorizes that occurrence,
and only then resolves its blob. This is required even when all application services
share one database connection pool.

Database constraints enforce what SQL can express directly:

- exact composite scope foreign keys;
- unique publication identity and local keys;
- non-null immutable publication sequences and permanent recovered-ID exclusions;
- at most one run per publication;
- root/derived producer shape;
- unique output role/ordinal;
- reference/input/evidence role ordinals;
- blob digest/length binding;
- no cascades through immutable graph data.

The canonical publication function enforces cross-row/topological rules in one
transaction. Application-only checks are not sufficient for the invariants.

## Implementation slices

### Slice 0: profiles and security boundary

- Freeze UUID, JSON, schema, digest, actor, command, error, and limit contracts.
- Build shared canonicalization/schema fixtures for server and SDK.
- Establish stable publisher-subject mapping, migration/runtime/read/recovery roles,
  fail-closed scope binding, and the database-enforced recovery-mode fence.

Exit criteria: independent server/SDK implementations agree on golden vectors; a
missing/wrong scope sees nothing; runtime SQL cannot mutate immutable rows.

### Slice 1: root artifacts and feed

- Add scopes, types, blobs, upload claims, publications, occurrence/content rows,
  structural references, store state, and recovered publication-ID exclusions.
- Register `core.file@1` and narrow `core.bundle@1`.
- Implement staged-upload quotas, root publication, precise paginated reads, exact
  list, ordered feed, universal replay, and artifact-oriented bootstrap.
- Ship prepared-intent/outbox contracts and projector helpers.

Exit criteria: equal bytes can create distinct occurrences; bare digest grants no
authority; retry/conflict behavior is permanent; local reference cycles are
structurally impossible; a projector cannot miss a concurrent publication; and a
restore predating an acknowledged publication cannot reuse its UUID before
reconciliation.

### Slice 2: runs and evidence

- Add successful run receipts, ordered pre-existing inputs, output attribution, and
  four locator kinds.
- Add graph/evidence/bounded-lineage reads.
- Ship typed procedure and evidence builders.

Exit criteria: multi-output failure is invisible; every derived artifact has one
producer; production cycles are impossible; an invoice field can be grounded in OCR
bytes or a PDF page region.

### Slice 3: application integrations

- avenCEO-tools capture/extraction/review vertical with coordinator outbox;
- avenAgent read-only reconciliation vertical with trusted materializer;
- AvenOS one-scope proposal/decision/request/receipt vertical;
- application-owned search and current/preferred projections.

Exit criteria: all three applications use the same public API without direct artifact
table access or mutable artifact semantics.

Content-lifecycle/retention, shared search, and cross-scope copy are subsequent
extensions with their own acceptance criteria. They are not partially implemented
slices of this kernel.

## Release-blocking acceptance tests

### Identity, bytes, and types

1. Two publications of identical bytes create one physical blob and two occurrence
   UUIDs.
2. A new publication may deliberately create an artifact with the same artifact digest
   as an existing occurrence.
3. A blob digest alone cannot read, reuse, probe, or publish bytes.
4. An upload digest/length mismatch fails without a claim or readable artifact.
5. An expired claim can be replaced under a new upload UUID by equivalent authority
   for the same declared digest/length without changing the intent or semantic digest.
6. One claim can bind equal declared bytes to several artifacts in one publication but
   cannot authorize another publication after commit.
7. Live-claim, staged-byte, and concurrent-upload quotas reject excess admission
   without revealing whether the bytes were deduplicated.
8. A changed type definition under the same key/version is rejected.
9. Duplicate JSON keys, unsafe numbers, coercion, default insertion, remote `$ref`, and
   recursive `$ref` are rejected identically by server and SDK.
10. Exact monetary/decimal values never pass through binary floating-point
   canonicalization.
11. `core.file` stores declared media type; detector output cannot silently alter it.
12. Local keys and roles outside the frozen low-sensitivity lexical form are rejected.

### Publication and graph integrity

13. Same stable publisher/UUID/semantic intent returns the original authoritative
    request digest, artifact/run IDs, and one feed item after an ambiguous disconnect.
14. Any changed payload, actor, type, blob declaration, input, output, reference,
    implementation receipt, or evidence conflicts under the same UUID.
15. Credential rotation that preserves the stable publisher subject preserves replay;
    another subject cannot take over the UUID or learn the prior result.
16. Replacing only blob authority leaves replay identity unchanged; mutating the
    persisted intent conflicts locally and at the server.
17. Invalid final output/reference/evidence causes no publication, run, artifact, graph
    row, or feed visibility.
18. Every derived artifact has exactly one producer; every root has none.
19. A same-publication run input is rejected, so production causality cannot cycle.
20. A forward/self local reference is rejected; any accepted local references form a
    DAG.
21. Every structural role is ordered. Reference, input, output, and evidence ordinals
    are contiguous and round-trip.
22. Cross-scope input, reference, blob-source reuse, graph traversal, and feed cursor
    fail closed.
23. Artifact digest includes each referenced target's artifact digest but not its UUID,
    publisher, publication, scope, or run identity; the reference row still binds the
    exact target UUID.
24. Evidence can connect an output JSON pointer to an input UTF-8 byte range and PDF
    page region, but cannot name an undeclared input or foreign output.
25. The kernel enforces global bounds on run JSON but does not pretend to enforce an
    SDK-only procedure schema; a trusted adapter rejects a procedure-specific invalid
    field before submission.
26. Runtime API/SQL cannot update or delete types, publications, runs, occurrence
    content, blobs in use, references, inputs, or evidence.
27. A correction creates a new artifact and leaves the original byte-for-byte and
    payload-for-payload unchanged.
28. A publication is inserted only with its final non-null sequence. Rollback exposes
    no provisional row or counter change, and the committed sequence cannot update.

### Reads, feed, and recovery

29. Every graph route has the specified single direction; root producer routes return
    the documented null/empty shape rather than ambiguous output semantics.
30. High-fan-out consuming-run, derivation, referrer, and evidence-usage reads traverse
    several keyset pages without duplicates, omissions, offset drift, or unbounded
    responses.
31. Feed pages never split one publication and preserve all-or-nothing fan-out. The
    write path rejects any item that could not fit in one maximum feed response.
32. A consumer applying a publication and checkpoint transactionally tolerates replay
    of the last item.
33. Replay from sequence zero plus exact hydration rebuilds a projection over
    publication actors, complete fan-out, run receipts, roles, references, and
    evidence.
34. Artifact-oriented bootstrap at high-water `H`, followed by feed `> H`, misses no
    concurrent
    publication.
35. The artifact-scan helper is not accepted as a universal run/evidence projector
    bootstrap contract.
36. A divergent restore changes the epoch and starts `reconciling`; old cursors require
    rebootstrap, pending outboxes stop, and ordinary upload/publication/type writes are
    database-fenced.
37. Restore a database state predating acknowledged publication `P`. Before
    reconciliation completes, the store cannot accept `P` as new or let another
    intent/publisher claim it.
38. Reconciliation either restores `P` with its original IDs and verified intent, or
    installs a permanent exclusion. The exclusion returns `PUBLICATION_DATA_LOST` for
    the original identity and conflicts with changed reuse. An unresolved old-epoch
    intent without a recoverable result mapping is conservatively excluded too.
39. A configured publisher that cannot attest its required acknowledgment range blocks
    transition back to `normal`.
40. Feed/projector failure does not roll back or mutate the already committed
    publication.
41. A discovered blob/invariant corruption returns non-retryable
    `500 INTEGRITY_FAILURE` and fences affected serving before health endpoints expose
    unavailability.

### Application integration

42. The same Gmail part retries one publication UUID; a different equal-byte arrival
    creates another occurrence.
43. A stale avenCEO worker is rejected before outbox publication; workers cannot call
    even the upload endpoint, and recovery from `finalizing` uses the same saved intent
    and UUID.
44. A new ruleset creates a new evaluation artifact rather than overwriting the old
    consistency report.
45. AvenOS fan-out makes todo, event, and draft visible in one publication, while its
    pending gate remains application state.
46. An exact human decision and external request are distinct from the executor's
    eventual receipt.
47. AvenOS cannot move or reference a personal-scope occurrence into team scope through
    ordinary version-1 operations.
48. avenAgent cannot use a mutable path as a durable input until the adapter captures
    and maps its exact bytes.
49. A corrupt/skipped corpus member prevents a durable `complete`/`not-found` result
    unless the published completeness artifact reports the gap.
50. A large result becomes complete only when its final manifest/report publication
    commits, not when an arbitrary subset of chunks exists.
51. Business identifiers that collide across suppliers or sources never collide as
    artifact occurrence IDs.

### Extension seams

52. Two composites referencing distinct occurrences with equal typed content have the
    same artifact digest, while reference traversal returns their different exact
    target UUIDs.
53. A search projector can rebuild exclusively from high-water scan plus publication
    feed and exact type definitions.
54. A versioned common-schema compiler produces a self-contained registered schema; no
    runtime external resolution is required.
55. Replacing PostgreSQL blob storage behind the same digest/length/content-read
    contract requires no artifact ID or API semantic change.
56. A hypothetical content-lifecycle extension can preserve stable occurrence and
    graph IDs while controlling content separately; no `ON DELETE CASCADE` destroys
    surviving history.

## Decisions still required before migration

The cut-down core should freeze only concrete implementation parameters, not design a
platform in advance:

1. exact UUID version/encoding and textual digest representation;
2. complete `artifact-json-v1` and schema-profile keyword/format lists;
3. all JSON/blob/publication/graph/lineage/feed/page-size limits, including the
   single-feed-item invariant;
4. PostgreSQL blob size threshold and streaming/range implementation;
5. actor envelope, stable publisher-subject mapping, and trusted
   attribution/authorization adapter contract;
6. exact publication-intent/submission DTOs and request-digest canonical form;
7. per-scope sequence allocation SQL and isolation-level tests;
8. upload-claim expiry/minimum retry window, aggregate staging quotas, concurrency
   limits, and unpublished-blob grace cleanup;
9. evidence locator JSON shapes and page-region integer coordinate convention;
10. store-epoch recovery procedure, registered-publisher acknowledgment/watermark
    protocol, exclusion-row schema, and supported recovery horizon;
11. built-in type definitions and golden digests;
12. coordinator outbox/reacquisition contract for the first avenCEO integration;
13. exact graph-route response shapes, keyset orderings, and cursors; and
14. bounded run resource and publication-feed serialization contracts.

These are tractable first-release decisions. Search activation, cross-scope policy,
legal retention rules, portable signing, vector retrieval, and dynamic schema
dependencies are intentionally absent from this list.

## Final recommendation

Build the core around six stable primitives:

1. immutable source-controlled type versions;
2. exact content-addressed blobs and independent artifact occurrences;
3. ordered structural composition;
4. successful production receipts with pre-existing inputs and narrow evidence;
5. permanent atomic publication identity;
6. a scope-local complete-publication feed.

The final backtest did not uncover a missing universal primitive. It did uncover places
where applications must adopt explicit patterns: coordinator-owned worker publication,
trusted agent adapters, frozen corpus manifests, request/receipt effects, and mutable
projections for current state. Those patterns belong around the kernel and are now
part of this specification's integration contract.

The core remains versatile because later systems can add search, content lifecycle,
cross-scope copy, common schema tooling, signatures, richer evidence, direct-worker
guards, and different blob storage without changing existing artifact identity or
history. It remains simple because none of those policy or product subsystems is
pretended into existence before a concrete implementation needs it.
