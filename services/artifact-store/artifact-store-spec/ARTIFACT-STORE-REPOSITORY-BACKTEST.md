# Artifact Store Repository Backtest

Status: completed repository backtest

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

Specification under test: [ARTIFACT-STORE.md](ARTIFACT-STORE.md)

Repository under test: `avenCEO-tools`

## Executive verdict

The artifact-store specification survives this backtest. The repository does not
falsify any of its core invariants. On the contrary, the application's real ingest,
review, generation, search, tenancy, and recovery paths provide concrete evidence that
the proposed separation among immutable facts, mutable operational state, and
rebuildable projections is necessary.

The important qualification is that the current application schema is not an early
version of the proposed artifact-store schema. It is a mutable document workflow with
some strong artifact-like components. Migrating it requires decomposition, not table
renaming:

- `document_assets` is already a useful content-addressed byte store, but it also owns
  occurrence metadata and trusts a hash conflict without verifying the bytes;
- `staged_documents` combines occurrence, extraction output, review state, corrections,
  consistency evaluation, workflow status, and search source in one mutable row;
- `ingest_attempts`, `generated_documents`, Gmail source rows, and transaction links
  preserve useful fragments of provenance, but no generalized production graph exists;
- review, correction, and consistency backfill overwrite or extend the mutable document
  aggregate instead of publishing independently attributable facts;
- search is partly PostgreSQL full text and partly an in-process scan over arbitrary
  JSON and related records, so it is neither a bounded typed projection nor scalable
  query execution;
- tenant routing fails closed at the application database-selection boundary, but the
  current runtime SQL role has unrestricted table DML and cannot enforce artifact
  immutability or protected reads by itself;
- bytes and metadata are recovered together from PostgreSQL, which strongly validates
  the selected recovery-unit design, while recovery epochs and deletion reconciliation
  remain necessary additions.

The safest implementation direction is therefore to add the artifact store as a new,
constrained schema inside each tenant database, publish new immutable facts into it,
and adapt current UI/workflow tables as projections or compatibility views. A direct
conversion of `staged_documents` into `artifacts` would preserve the wrong invariants.

## Scope and method

This was a repository backtest, not a prose-only review. It traced the following
implemented paths and compared their observable behavior with the specification's
invariants and acceptance criteria:

1. browser upload through blob storage and staging;
2. Gmail attachment discovery, exact-attachment retry, and duplicate bytes;
3. worker claim, classification, extraction, failure, retry, and completion;
4. human accept, reject, correction, and consistency review;
5. linking accepted documents to transactions;
6. generated Eigenbeleg input hashing, rendering, acceptance, and retry;
7. full-text search, facets, logical-duplicate grouping, and backfill;
8. proxy authentication, tenant resolution, database selection, and runtime roles;
9. migrations, backup creation, independent verification, and restore;
10. current deletion behavior and the documented tenant-deletion boundary.

Evidence was taken from migrations, server code, routes, operational documentation,
and tests in this repository. The report distinguishes four outcomes:

- **Confirmed** — the repository positively demonstrates the design requirement.
- **Current failure** — applying a specification acceptance test to current behavior
  would fail; this is a migration requirement, not necessarily a defect in the spec.
- **Partial** — the repository has a useful precursor but not the complete invariant.
- **Not exercised** — the repository contains no implementation capable of testing the
  requirement.

The non-database unit suites for ingest contracts, document-search interpretation and
presentation, and runtime security were also executed during this review: 4 files and
37 tests passed. Database integration suites were inspected but not executed because
some of them reset the configured `finom_viewer` database; running them against an
unconfirmed local target would have been destructive.

## Backtest scorecard

| Specification area | Result | Repository evidence | Consequence |
| --- | --- | --- | --- |
| Exact content-addressed bytes | Partial | `storeAsset` hashes bytes and inserts by SHA-256; the schema checks digest shape, content length, and stored size | Reuse the byte-store idea, strengthen collision verification and metadata separation |
| Artifact ID distinct from blob hash | Current failure | `staged_documents` has a UUID, but a unique index on `asset_sha256` permits only one staged occurrence per byte sequence | New artifact occurrences must not inherit this uniqueness |
| Immutable typed facts | Current failure | classification, detected data, reviewed data, consistency report, correction history, and status are updated in place | Split retained facts from workflow projections |
| Immutable type versions | Partial | extraction has one `SCHEMA_VERSION`; document templates have a key and integer version | Generalize to immutable registered type versions with pinned validation semantics |
| Structural composition | Not exercised | transaction links and source rows are mutable domain relationships, not immutable typed manifest membership | Implement references as a new primitive; do not reinterpret every current foreign key as a reference |
| Production runs and lineage | Partial | attempts record phase/model/schema/raw response; generated documents snapshot several inputs | Build generalized run receipts with exact ordered inputs and outputs |
| Evidence locators | Not exercised | consistency checks name JSON paths, but no output-to-input evidence relation exists | Keep locators in the design; current paths are only a useful vocabulary seed |
| Atomic multi-output publication | Partial | Eigenbeleg acceptance commits several business rows together, but the blob is written before that transaction | One publication function must include or authoritatively claim every visible resource |
| Publication idempotency | Partial | generated documents use an input hash and a uniqueness constraint; upload dedup uses the blob hash as identity | Retain semantic request idempotency, replace ad hoc hashing and content-identity collapse |
| Stale-worker fencing | Current failure | jobs have leases and worker IDs, but completion/failure does not check either | Ownership token validation is a release-blocking requirement |
| Ordered change feed | Not exercised | `inbox_events` records some review actions but has no publication envelope, safe cursor, or complete coverage | Implement a new commit feed; do not expose `inbox_events` as one |
| Typed, rebuildable search | Current failure | GIN full text exists, but all documents are loaded and arbitrary nested values are scanned in application memory | Use declared mappings, SQL filtering, projector checkpoints, and generations |
| Optimistic mutable projections | Confirmed | review locks the row and checks `revision`; concurrent stale edits return a conflict | Preserve this pattern for application-owned preferred/current views |
| Database-enforced immutability | Current failure | the runtime role receives SELECT, INSERT, UPDATE, and DELETE on every table | Artifact tables need narrow functions/views, revocations, and defensive triggers |
| Fail-closed tenant routing | Confirmed | multi-tenant access requires context and selects a tenant-specific pool; missing context fails | Prefer one artifact-store schema per tenant database |
| Authorization before aggregates | Partial | tenant isolation happens before queries, but there is no artifact-scope database policy inside a tenant | Map a tenant to the deployment boundary and retain scope enforcement for finer grants |
| One recoverable metadata/byte unit | Confirmed | schema 2 embeds bytes in PostgreSQL; backup uses a snapshot and restores in one transaction | Reuse and extend the recovery toolkit |
| Retention and legal erasure | Not exercised | physical tenant deletion is explicitly absent; ordinary tables use cascades and direct deletes | Add tombstone/purge machinery before claiming erasure support |
| Security and bounded content handling | Partial | authentication, origin checks, file/page limits, MIME sniffing, and sandbox headers exist | Carry these controls into artifact APIs and add rate/resource limits |

## Reconstructed current model

The implemented document path can be summarized as follows:

```text
upload/Gmail attachment
        |
        v
document_assets (SHA-256 -> BYTEA)
        |
        v
staged_documents (one mutable row per SHA-256)
        |
        +--> ingest_jobs --------> worker lease/retry state
        |
        +--> ingest_attempts ----> classify/extract attempts and raw responses
        |
        +--> mutable classification/detected/reviewed/consistency fields
        |
        +--> transaction_documents (domain attachment link)
        |
        +--> GIN search_vector plus application-memory search/facets
```

This shape is coherent for a focused inbox application. It is not a general immutable
artifact graph because the row at its center has too many meanings. That is the central
result of the backtest.

## Detailed findings

### 1. Blob storage validates the physical design but not the complete integrity contract

The strongest direct confirmation is the decision to keep exact document bytes in
PostgreSQL. Migration 2 embeds `BYTEA`, makes it non-null, checks that its length equals
`size_bytes`, and removes the former filesystem key
([migration](../db/migrations/0002_embed_document_assets.sql#L1)). The operational guide
then treats each tenant database dump as containing the original documents and all
related rows ([operations guide](../docs/operations.md#L293)). This is exactly the
single-recovery-unit property required by the spec.

`storeAsset` computes SHA-256 over the supplied bytes and inserts once by that key
([storage implementation](../src/lib/server/ingest/storage.ts#L10)). The baseline also
checks the digest syntax and records byte length
([baseline migration](../db/migrations/0001_current_schema_baseline.sql#L40)). These are
sound foundations.

The current conflict path is insufficient for an artifact-store integrity boundary,
however. `ON CONFLICT (sha256) DO NOTHING` returns success without comparing the
existing size or bytes. It also leaves the first `media_type` attached to the shared
blob even when the same bytes are later submitted with a different declared type. A
general store must treat media type and filename as occurrence metadata and verify an
existing row before reuse, as the specification requires.

The application also rejects zero-length uploads and defines `size_bytes > 0`
([upload route](../src/routes/api/ingest/batches/[id]/documents/+server.ts#L24),
[baseline migration](../db/migrations/0001_current_schema_baseline.sql#L40)). That is a
product restriction, not a property of SHA-256 or immutable artifacts. The spec's
decision to allow a zero-byte blob remains sound for a general-purpose store.

Finally, `storeAsset` is often called before the surrounding business transaction.
Generated Eigenbeleg acceptance stores the PDF first and only then starts the
transaction that creates its occurrence and links
([Eigenbeleg repository](../src/lib/server/eigenbeleg/repository.ts#L326)). A later
validation or commit failure therefore leaves a valid but unclaimed blob. The spec's
principal-bound upload claims, expiry, and grace-period garbage collection are not
theoretical extras; this repository supplies a concrete failure mode for them.

Backtest result: **partial confirmation**. Preserve the PostgreSQL byte store and
content addressing; do not preserve its metadata placement, conflict behavior, or
unclaimed-blob lifecycle.

### 2. Byte deduplication must not become occurrence deduplication

The current schema has a unique index on `staged_documents(asset_sha256)`
([baseline migration](../db/migrations/0001_current_schema_baseline.sql#L283)).
`addStagedDocument` consequently returns the existing staged row when identical bytes
arrive again, without creating a second document or job
([ingest repository](../src/lib/server/ingest/repository.ts#L133)). The database test makes
this contract explicit: a renamed copy returns the first row and the count remains one
([database test](../tests/db.test.ts#L571)).

Gmail demonstrates the provenance cost. An exact attachment occurrence is separately
identified by account, message, and part, but duplicate bytes point that occurrence at
the already-existing staged document
([Gmail backfill](../src/lib/server/gmail/backfill.ts#L92),
[Gmail repository](../src/lib/server/gmail/repository.ts#L350)). The source occurrence is
recoverable only by joining mutable Gmail-specific tables; it is not independently
typed or reusable outside that integration.

The same bytes may legitimately represent:

- a manual upload and an email attachment;
- two independently received messages;
- an original, a legal collection event, and an imported archive member;
- a template occurrence and a generated output dependency.

The repository therefore directly validates the specification's most important
identity rule: blob digest answers “same bytes,” while artifact UUID answers “same
stored occurrence.” New artifact publication must permit several artifact IDs to share
one blob. Import migration should create occurrence artifacts from source records
rather than carrying forward the staged-document uniqueness constraint.

Backtest result: **confirmed requirement; current acceptance test fails**.

### 3. `staged_documents` is an operational aggregate, not an artifact table

One row currently holds source metadata, workflow status, classification, machine
output, reviewed output, warnings, consistency results, error state, model, correction
history, reprocessing mode, revision, and review timestamps
([baseline migration](../db/migrations/0001_current_schema_baseline.sql#L48)). Worker
completion updates detected output and consistency fields in place
([ingest repository](../src/lib/server/ingest/repository.ts#L861)). Human actions later
change status, reviewed data, correction history, dismissal data, and revision
([review implementation](../src/lib/server/ingest/repository.ts#L940)).

These updates are appropriate for an inbox work item, but they cannot satisfy artifact
immutability. In the new model, the row's concerns divide naturally:

| Current field or behavior | Artifact-store representation |
| --- | --- |
| original bytes, name, detected MIME | `core.file@1` occurrence plus shared blob |
| classification JSON | typed classification artifact and producing run |
| extracted invoice/statement JSON | exact versioned domain artifact and producing run |
| consistency report | typed evaluation artifact consuming the extraction |
| reviewed/corrected value | new corrected artifact plus decision/correction run |
| accepted/rejected | typed review-decision artifact; preferred status remains a projection |
| warnings and failure | evaluation artifact if domain-significant; otherwise attempt state |
| correction prompt/history | attributable decision/guidance artifacts or operational history, according to retention intent |
| queued/processing/retry/error | job and attempt state outside the kernel |
| `revision` | optimistic-concurrency field on the mutable work-item/projection row |

The current `reviewed_data ?? detected_data` read preference is a useful application
projection pattern ([search implementation](../src/lib/server/ingest/repository.ts#L540)).
It should survive as a view of immutable candidates and decisions, not as evidence that
either payload may be overwritten.

Backtest result: **the spec's separation is confirmed**. A compatibility work item may
continue to exist, but it must point at immutable artifact IDs rather than contain the
only copy of historical facts.

### 4. Review concurrency is worth retaining, while review semantics must change

Review obtains a row lock and rejects an `expectedRevision` mismatch
([review implementation](../src/lib/server/ingest/repository.ts#L957)). The route maps
that condition to HTTP 409
([review route](../src/routes/api/inbox/[id]/+server.ts#L21)). This is good evidence for the
spec's choice to keep mutable “current” or “preferred” pointers in an application
projection with optimistic concurrency.

The retained fact is currently weaker. Accepting a document mutates `status` and copies
detected data into `reviewed_data`; correction appends guidance to an array on the same
row; dismissing a problem overwrites dismissal fields. Only the action name and a small
payload are appended to `inbox_events`.

The artifact model should preserve both layers:

1. publish an immutable review/correction/acknowledgement artifact with reviewer,
   decision, rationale, exact candidate inputs, and time;
2. atomically advance the work item's preferred pointer using its expected revision.

That mapping preserves the user experience and concurrency protection while satisfying
the spec's acceptance criteria that acceptance and correction do not mutate prior
facts. `tenant_action_audit_events` already shows how audit can commit in the same
transaction as the business mutation
([audit writer](../src/lib/server/tenant/action-audit.ts#L14)); it remains distinct from
the domain decision artifact.

Backtest result: **confirmed projection pattern; current immutable-history test fails**.

### 5. Attempts strongly validate the production-run boundary

`ingest_attempts` records a durable ID, document, phase, status, model, schema version,
raw response, instruction, error, and timestamps
([baseline migration](../db/migrations/0001_current_schema_baseline.sql#L145)). The worker
records classification and extraction attempts separately and preserves failed provider
calls ([worker](../src/lib/server/ingest/worker.ts#L40)). This is useful operational
evidence.

It also proves why an attempt cannot simply be renamed a production run:

- a classification may be written to the staged row before extraction completes;
- an attempt can fail and be retried;
- raw provider responses and errors have different retention and access concerns;
- attempt rows do not declare exact ordered input artifacts or output artifacts;
- completion does not publish a generalized, canonical receipt;
- the single schema-version string describes the extraction contract, not every output
  type and validation dependency.

A successful publication should consume the operational attempt's ownership token and
selected metadata, then atomically create immutable run and output rows. Failed
attempts stay operational unless the failure itself is a domain-significant result.
That is exactly the boundary drawn by the specification.

Backtest result: **confirmed**.

### 6. Lease claiming works, but stale workers can currently publish

The queue claim uses a transaction, `FOR UPDATE SKIP LOCKED`, a worker ID, and a
ten-minute lease. Expired processing jobs can be reclaimed
([claim implementation](../src/lib/server/ingest/repository.ts#L750)). This supports
parallel workers and crash recovery.

The completion and failure paths accept only `jobId` and `documentId`. Their updates do
not require the claiming `worker_id`, the lease to be current, or an attempt/fencing
generation ([completion](../src/lib/server/ingest/repository.ts#L861),
[failure](../src/lib/server/ingest/repository.ts#L900)). There is also no heartbeat in the
processing path. The following execution is therefore possible:

1. worker A claims job 10 and starts a slow model request;
2. A's lease expires;
3. worker B reclaims job 10 and produces a new result;
4. A completes and writes its stale result;
5. B completes and writes again, or vice versa.

Both workers can report success because neither final write is fenced. This is the most
concrete concurrency defect found by the backtest. The spec already requires the
current ownership token at publication, so no prose change is necessary. The eventual
integration must make that check part of the same transaction that validates inputs
and publishes outputs.

Backtest result: **current acceptance test fails; specification is correct**.

### 7. The generated-document path is the best positive prototype for publication

Eigenbeleg generation contains several decisions worth carrying forward:

- document templates have a stable key and positive integer version;
- the exact template asset and signature asset hashes are checked before acceptance;
- an input hash covers transaction ID, template ID, signature bytes, and form fields;
- a uniqueness constraint prevents duplicate generated documents for the same
  transaction and input hash;
- staged occurrence, transaction link, generation record, and inbox event commit in one
  transaction;
- the generated record snapshots form data, template ID, signature ID, and signature
  asset hash.

The implementation is visible in the input-hash and acceptance path
([Eigenbeleg repository](../src/lib/server/eigenbeleg/repository.ts#L308),
[acceptance transaction](../src/lib/server/eigenbeleg/repository.ts#L326)) and in the
schema's `generated_documents` constraints
([baseline migration](../db/migrations/0001_current_schema_baseline.sql#L262)).

This is a domain-specific production receipt and idempotent publication precursor. It
also exposes why the generalized specification is stricter:

- the request hash is unversioned `JSON.stringify`, without a canonicalization profile
  or digest-domain tag;
- it names a mutable transaction row rather than an immutable transaction snapshot;
- the generated blob is inserted before publication and has no upload claim;
- the result is written as an already-accepted mutable staged document rather than
  separate file, extracted data, decision, and run artifacts;
- there is no publication commit/change cursor;
- recovery promises and idempotency retention horizon are undefined.

The correct migration is to express this path using immutable inputs and one atomic
publication, while retaining the application's receipt-number lock and compatibility
link. It should not discard the useful snapshot fields.

Backtest result: **strong partial confirmation**.

### 8. Validation and consistency behavior support typed evaluation artifacts

The extraction contracts recursively require declared properties and reject additional
ones ([contracts](../src/lib/ingest/contracts.ts#L3)). Validation refuses incomplete or
contradictory model output. Consistency checks deliberately preserve contradictory
values and emit structured failures rather than silently rewriting the source. Tests
cover positive credit-note and payment-receipt amounts, schema violations, arithmetic
tolerances, and preserved evidence
([ingest tests](../tests/ingest.test.ts#L121),
[consistency tests](../tests/consistency.test.ts#L11)).

That behavior validates three specification choices:

1. validation does not coerce or “repair” the submitted artifact;
2. a consistency verdict is a separately attributable evaluation of exact inputs;
3. accepted, consistent, and preferred are different concepts.

The current persistence still stores the report inside the mutable document row. A
ruleset backfill scans old proposals and overwrites `consistency_report`, warnings, and
dismissal state ([consistency backfill](../src/lib/server/ingest/consistency-backfill.ts#L53)).
Worse, `searchInbox` invokes that backfill by default before answering a read
([search implementation](../src/lib/server/ingest/repository.ts#L255)). A search request
can therefore mutate retained business state and reset reviewer dismissal fields.

Under the artifact model, a new ruleset publishes a new evaluation artifact and a
projection may select the latest applicable evaluation. Search must never rewrite the
evaluated candidate or the previous evaluation.

Backtest result: **typed evaluations are confirmed; current persistence and read-time
backfill fail the separation test**.

### 9. Search behavior validates both the product need and the projection redesign

The repository demonstrates genuinely useful search behavior: filename and proposal
text, partial compact matching, status/kind/party/currency/source facets, date and
amount filters, review state, and logical duplicate grouping. The route bounds the
query and validates filters
([inbox route](../src/routes/api/inbox/+server.ts#L37)). Tests show that users expect
reviewer notes and source information to participate and that JSON property names
should not be searchable ([database test](../tests/db.test.ts#L436),
[database test](../tests/db.test.ts#L736)).

The implementation is nevertheless a direct failure of the general-store search
acceptance criteria:

- the generated PostgreSQL vector indexes arbitrary string and numeric values from
  `COALESCE(reviewed_data, detected_data)`
  ([baseline migration](../db/migrations/0001_current_schema_baseline.sql#L77));
- the repository loads every candidate document ordered by update time before most
  filtering;
- it recursively collects values from classification, proposal, warnings, errors,
  corrections, Gmail sources, supplemental notes, and user notes;
- query fallback, logical grouping, most facets, date/amount filtering, sorting, and
  totals run in application memory
  ([search implementation](../src/lib/server/ingest/repository.ts#L255),
  [recursive collector](../src/lib/server/ingest/repository.ts#L617));
- there is no stable pagination cursor, projection mapping version, source commit,
  rebuild checkpoint, or atomic generation activation.

This design works only while each tenant's inbox is bounded. It cannot safely become a
general artifact search API because result latency and memory scale with all visible
documents, arbitrary newly-added JSON values silently enter search, and a rolling
rebuild has no snapshot boundary.

The useful field-extraction helpers—party, currency, document date, and amount—are good
inputs for explicit versioned mappings. They should be projector code with golden
tests, not hard-coded global interpretation of every artifact type.

Backtest result: **product behavior confirmed; projection architecture change required**.

### 10. Domain attachment links are useful projections, not structural provenance

Accepted staged documents can be attached to a transaction. The repository validates
the transaction, requires accepted documents, inserts all selected links in one
transaction, and makes duplicate calls idempotent through a unique partial index
([link implementation](../src/lib/server/db.ts#L1149),
[baseline migration](../db/migrations/0001_current_schema_baseline.sql#L279)). The link
contains no duplicate bytes; retrieval follows the staged document to its shared asset
([document retrieval](../src/lib/server/db.ts#L1122)).

This is sound application behavior but should not automatically become an
`artifact_reference`:

- an accountant may attach or detach a document as mutable workflow state;
- the relation's current semantics are domain-specific and not type-validated;
- the transaction is a mutable application row, not necessarily an immutable snapshot;
- direct transaction uploads still store their own `BYTEA`, bypassing
  `document_assets` altogether ([direct attachment path](../src/lib/server/db.ts#L1077)).

If an immutable package or accepted reconciliation needs this membership as truth,
publish a typed manifest or decision artifact. Keep the current attachment table as a
mutable projection pointing at artifact IDs. Route all new durable byte writes through
the artifact publication boundary, and backfill the direct `transaction_documents`
bytes into file occurrences.

Backtest result: **the specification's composition-versus-workflow distinction is
confirmed**.

### 11. Tenant isolation supplies a strong deployment boundary

In multi-tenant mode, every non-neutral API path requires a tenant context. The server
authenticates proxy-provided identity, resolves membership, and executes the request
inside a tenant-specific pool
([request hook](../src/hooks.server.ts#L18)). The generic `pool` proxy rejects database
access when multi-tenancy is enabled but no tenant database was selected
([database selector](../src/lib/server/db.ts#L86)). Pool identity includes tenant ID and
generation, and unavailable connections are retired and fail closed
([pool manager](../src/lib/server/tenant/pool-manager.ts#L65)).

Integration tests explicitly exercise overlapping IDs and identical asset digests in
two tenant databases, unauthorized membership, agent-to-tenant binding, and missing
tenant context ([multi-tenancy tests](../tests/multi-tenancy.test.ts#L119)). The operations
guide also states that one tenant equals one database and that a tenant key is not
proof of access ([operations guide](../docs/operations.md#L69)).

This suggests a concrete first deployment choice:

- put one `artifact_store` schema in each customer database;
- treat the selected tenant database as the outer authorization and recovery boundary;
- use one `default` artifact scope initially only if all users in that tenant truly
  share access;
- retain `authorization_scope_id` and fail-closed query discipline for future
  intra-tenant groups, service scopes, or confidential artifacts;
- do not deduplicate blobs across customer databases.

That choice matches the spec's non-goal of cross-customer sharing, avoids cross-tenant
deduplication disclosure, and reuses existing backup and lifecycle operations.

The unresolved risk is inside a tenant database. The current runtime role is granted
SELECT, INSERT, UPDATE, and DELETE on every table and receives the same default grants
for future tables ([migration tooling](../scripts/database/migrations.ts#L289)). Tests
prove it lacks DDL, but DML is enough to bypass immutability, audit, or an omitted
application authorization predicate. The new schema must explicitly revoke those
defaults and grant only constrained publication/read functions or security-barrier
views. It cannot inherit the public-schema runtime grants.

Backtest result: **outer isolation confirmed; inner database enforcement currently
fails**.

### 12. Authentication and content-serving controls should be reused

The repository already supplies several controls called for by the specification:

- every non-health production request requires authenticated proxy identity;
- browser mutations require the configured public origin;
- agent identities are restricted to explicit trusted command paths;
- development actors require deliberate configuration and are forbidden in production;
- uploads validate names, non-empty size, and a configurable upper bound;
- media detection checks common byte signatures before falling back to declaration or
  extension;
- PDF page count is bounded and over-limit documents are rejected rather than silently
  truncated;
- temporary PDF files use restrictive permissions and are removed in a `finally` block;
- inline content uses `nosniff`, no-store caching, same-origin policy, and sandboxed
  content security policy.

The main evidence is in the request hook, runtime-security tests, upload/storage code,
and content route
([runtime tests](../tests/runtime-security.test.ts#L23),
[storage](../src/lib/server/ingest/storage.ts#L36),
[content response](../src/routes/api/inbox/[id]/content/+server.ts#L5)).

The 100 MiB default is not yet evidence that 100 MiB is safe for the new store. The
route materializes the full upload, `BYTEA` insertion materializes it again, PDF
processing renders every page, and model input base64-encodes page images. Memory, WAL,
backup, restore, and concurrency costs should be measured before selecting the artifact
limit. The specification's recommendation to start lower unless streaming/chunking is
proven is supported by this path.

Backtest result: **partial confirmation**.

### 13. The change-feed requirement has no current substitute

`inbox_events` is an append-like log for review actions and generated acceptance. It is
valuable audit context, but it is not a publication feed:

- upload, classification save, worker completion, source-link changes, notes, and many
  other visible mutations do not consistently create events;
- events are scoped to a staged document rather than an atomic resource set;
- the foreign key cascades on document deletion;
- there is no commit envelope, consumer checkpoint, high-water mark, authorization
  binding, recovery epoch, or rescan contract;
- event order is a sequence allocation, not the specified no-skip publication protocol.

The general artifact store must introduce `publication_commits` and change items as new
kernel state. Existing `inbox_events` can remain application audit/history and may
reference resulting commit/artifact IDs where useful.

Backtest result: **not exercised; do not reuse `inbox_events` as the feed**.

### 14. Cascading deletes are incompatible with retained provenance

The current schema legitimately uses application-lifecycle cascades. Deleting a batch
can delete its staged documents, which can cascade to jobs, attempts, events, and notes;
Gmail source links can be set null; transactions cascade to generated-document records
([baseline migration](../db/migrations/0001_current_schema_baseline.sql#L48)). Direct
transaction attachment deletion is an ordinary runtime call
([database repository](../src/lib/server/db.ts#L1438)).

Those rules must stop at the artifact-store boundary. Ordinary domain deletion may
remove a projection or link, but it must not cascade through immutable artifacts,
production receipts, or evidence. Artifact payload erasure needs the explicit
tombstone/purge path, descendant and structural-referrer analysis, audit, and blob
reachability checks described in the spec.

The operations guide explicitly says that physical tenant deletion is not implemented
and requires retention policy, named approval, recovery evidence, and controlled key
and backup destruction ([operations guide](../docs/operations.md#L443)). This confirms
that the repository cannot yet backtest legal erasure. It also means no release should
claim the specification's retention acceptance criteria merely because tenant status
can become `deleting`.

Backtest result: **current schema behavior must not cross into the kernel; full retention
path not exercised**.

### 15. Backup and migration tooling strongly validate the recovery model

The database toolkit is one of the strongest parts of the repository:

- migration filenames and checksums form a contiguous ledger;
- one advisory lock serializes migration;
- transactional migrations roll back on failure;
- legacy adoption compares schema structure rather than blindly stamping a version;
- schema 1 filesystem assets are verified by expected content-addressed path, size, and
  SHA-256 before embedding;
- backup holds an exported repeatable-read snapshot, uses `pg_dump`, fsyncs files, and
  atomically publishes the completed directory;
- a manifest records versions, counts, sizes, and dump checksum;
- independent verification detects dump corruption;
- restore verifies before connecting, requires exact database-name confirmation,
  restores with one PostgreSQL transaction, and checks the restored ledger.

The design and commands are documented in the
[database toolkit guide](../db/README.md#L24). Tests cover serialized migrators, runtime
privileges, corruption detection, transactional legacy import, and structural drift
([database-toolkit tests](../tests/database-toolkit.test.ts#L52)).

This is strong evidence for storing artifact metadata and bytes in the same tenant
database. The artifact implementation should extend this toolkit rather than create an
independent backup product.

Several specification requirements remain untested or absent:

- current backup authenticity and encryption are external responsibilities;
- off-host upload, retention enforcement, fleet orchestration, and scheduled restore
  rehearsal are not automated;
- the manifest has no artifact/run/reference/feed/search-generation counts yet;
- restore verification does not rehash embedded `BYTEA` rows or check artifact graph
  invariants;
- there is no store recovery epoch or old-cursor invalidation;
- an older restore has no independent purge ledger with which to prevent resurrection;
- authorization-service recovery is separate and must remain fail closed.

These are not reasons to weaken the specification. They are the concrete extension
list for the existing tooling.

Backtest result: **core recovery-unit choice confirmed; advanced recovery contracts not
exercised**.

## Scenario backtests

### Scenario A: the same PDF is uploaded twice under different names

Current result:

1. first upload creates one blob, staged document, and job;
2. second upload reuses the blob and returns the first staged document;
3. the second name and occurrence are not retained as a new document;
4. no second processing run occurs.

Required artifact-store result:

1. one blob may be reused after exact verification and authorization;
2. two occurrence artifacts may be created with their own names, publishers, sources,
   and times;
3. request idempotency collapses only a retry of the same semantic publication;
4. policy or application logic decides whether processing can reuse a prior result or
   deliberately produce another run.

Verdict: the current path fails the occurrence-identity acceptance test and confirms
why content hash cannot be the publication idempotency key.

### Scenario B: the same Gmail part is retried

Current result:

1. `(account, Gmail message, part)` uniquely identifies the connector occurrence;
2. a previously imported/duplicate attachment is counted and skipped;
3. an exact-byte duplicate may point to an earlier staged document from another source.

Required artifact-store result:

1. connector idempotency returns the same email-attachment occurrence artifact for the
   same source part;
2. the occurrence may share its blob with other artifacts without becoming them;
3. source message snapshot and attachment membership are immutable inputs/references;
4. duplicate status is application/projection state, not the loss of occurrence
   provenance.

Verdict: source-key idempotency is a useful precedent; source-to-artifact modeling must
be strengthened.

### Scenario C: worker A times out and worker B reclaims the job

Current result: either worker can later call `completeJob` or `failJob`; the last writer
can replace the staged result regardless of lease ownership.

Required artifact-store result: publication validates a current opaque ownership token
inside the same transaction; stale worker A receives a stable stale-ownership error and
publishes no artifacts, run, or commit.

Verdict: current failure, already covered by the specification.

### Scenario D: extraction succeeds but consistency rules later change

Current result: a backfill can overwrite the document's consistency report and warnings;
a search read may trigger it and clear a prior dismissal.

Required artifact-store result: the new ruleset publishes a new evaluation artifact
consuming the same extraction; a preference/search projection selects the relevant
evaluation without rewriting the old one or reviewer decision.

Verdict: the repository strongly confirms typed, versioned evaluation artifacts.

### Scenario E: a reviewer corrects and accepts extracted data

Current result: the mutable staged row gains correction guidance, is reprocessed, and
eventually changes its accepted/reviewed fields.

Required artifact-store result: original extraction, guidance/decision, corrected
artifact, correction run, and acceptance decision remain independently attributable;
the inbox projection advances with optimistic concurrency.

Verdict: retain the revision-check UX; replace historical mutation.

### Scenario F: two outputs must become visible together

Current result: ordinary ingest publishes one mutable result. Eigenbeleg generation
does atomically create several application rows, but its blob predates the transaction
and there is no generalized run or commit envelope.

Required artifact-store result: all output artifacts, their run, exact inputs,
references/evidence, idempotency response, and one commit become visible in one
transaction; a staged blob may preexist but remains non-visible and principal-bound.

Verdict: partial prototype only.

### Scenario G: search mappings change during a rebuild

Current result: there is one generated vector tied to the table definition plus
in-process interpretation code. Changing either changes behavior without a mapping
catalog, checkpoint, or atomic activation boundary.

Required artifact-store result: build a complete inactive generation with exact mapping
versions and source commit high-water, then atomically activate it. Existing cursors
must finish on a retained generation or return a restart response.

Verdict: not supported by the current implementation; spec requirement stands.

### Scenario H: a shared blob's first artifact is purged

Current result: no artifact purge or blob garbage collector exists. Application
deletion/cascade semantics are not occurrence-aware retention policy.

Required artifact-store result: tombstone only the authorized occurrence, remove all
content-derived projections, and delete the blob only when no retained payload or
unexpired claim references it, with a transactional recheck and grace period.

Verdict: not exercised; cannot claim readiness.

### Scenario I: restore an older database after published commits were observed

Current result: restore integrity and schema compatibility are checked, but an older
timeline has no recovery epoch and no purge reconciliation gate.

Required artifact-store result: fence the old writer, create a durable new recovery
epoch, invalidate old cursors, reconcile tombstones/purges from a protected failure
domain, and enter explicit idempotency/external-action reconciliation when records may
fall outside achieved RPO.

Verdict: basic restore confirmed; divergent-history safety not exercised.

### Scenario J: an application query omits tenant context or a scope filter

Current result: in multi-tenant mode, missing tenant database context throws before
query execution. Once inside a tenant database, the runtime role can directly read and
mutate all application tables.

Required artifact-store result: keep fail-closed tenant database selection, and expose
protected artifact/search/graph data only through constrained functions/views or forced
RLS using trusted scope context. Missing inner scope must return no protected content.

Verdict: outer boundary passes; inner boundary fails.

## Migration implications

### Do not migrate one row to one row

A typical accepted `staged_documents` record may need to become:

1. one file occurrence artifact pointing at the existing blob;
2. one classification artifact and production run;
3. one extracted invoice/statement artifact and production run;
4. one consistency-evaluation artifact;
5. zero or more correction-guidance/decision artifacts and corrected outputs;
6. one review-decision artifact;
7. application projection rows pointing at the preferred extraction and decision;
8. source artifacts or import receipts for Gmail/Stripe metadata where retained as
   durable evidence.

Historical data does not always contain enough information to reconstruct exact runs,
publisher identities, or correction stages. Migration must not invent them. Use an
explicit legacy-import procedure/version and receipt that says which source row was
imported, what could be preserved, and which provenance is unknown.

### Keep old IDs as migration provenance, not new semantic identity

Preserving the staged-document UUID on the raw file occurrence may ease compatibility,
but it should be a deliberate import-ID policy. The blob SHA-256 must never become the
artifact ID. Existing transaction, Gmail attachment, generated-document, and audit rows
should retain mappings to new artifact IDs until every consumer is migrated.

### Backfill all byte paths

At least two durable byte paths exist:

- `document_assets.content` for staged/generated/template/signature content;
- `transaction_documents.content` for direct transaction uploads.

Before enforcing the artifact byte kernel, migrate direct attachment content to blob
rows and file occurrences, replace stored bytes with artifact references, verify every
length/hash, and retain a recovery-compatible migration. Do not remove the old content
column until backup/restore and application rollback policy are decided.

### Separate compatibility projections from artifact truth

The existing UI and APIs can continue to consume a `staged_documents`-shaped read model
during migration. Build it from artifact IDs and application job/review state. Dual
writes should be avoided unless one side is authoritative and repair/replay semantics
are explicit; consuming the artifact commit feed into the compatibility projection is
safer than two unrelated commits.

### Give the new schema different grants

The migration tool currently applies broad DML default privileges in `public`. The
artifact schema must have its own ownership and default privileges before any tables
are created. Runtime code should call narrow publication and authorization-aware read
functions; indexer and retention roles should be separate. Add database tests that
prove raw `UPDATE` and `DELETE` fail even when issued by a compromised runtime query.

## Release-blocking acceptance tests derived from this repository

The following tests should be added before calling the first artifact-store slice
complete:

1. Publish the same bytes twice with different occurrence metadata; assert one blob and
   two artifacts.
2. Retry the same idempotency key and request; assert the same response, artifact IDs,
   and commit, with no additional rows.
3. Reuse an idempotency key with a different semantic request; assert a stable conflict.
4. Submit a guessed digest without an authorized upload claim or readable occurrence;
   assert no disclosure and no artifact creation.
5. Force a stored SHA-256 conflict fixture with mismatched bytes/length; assert an
   integrity failure rather than deduplication.
6. Reclaim an expired job, then let the old worker publish; assert stale ownership and
   no output/commit.
7. Fail the second output or evidence validation in a multi-output publication; assert
   no artifact, run, or feed visibility.
8. Attempt raw artifact/blob `UPDATE` and `DELETE` as the runtime role; assert denial.
9. Execute direct read, blob read, search, facet, graph, and feed calls with missing or
   mismatched authorization context; assert no protected identities or counts leak.
10. Register a new JSON property without a search mapping; assert it never enters the
    index.
11. Build a new search generation while querying the old one; assert no mixed results
    and deterministic cursor restart after retirement.
12. Purge one of two occurrences sharing a blob; assert the other remains readable and
    the blob is retained.
13. Restore a verified backup into a fresh tenant database; rehash bytes and verify
    every artifact/run/reference/feed invariant.
14. Simulate an older restore; assert old cursors fail by recovery epoch and purged data
    cannot be served before reconciliation.
15. Backfill a legacy accepted document; assert the import receipt marks unknown
    provenance rather than fabricating a model run or reviewer identity.

## Decisions the repository helps settle

The backtest provides enough evidence to recommend the following choices now:

1. **Deployment unit:** one artifact-store schema per tenant PostgreSQL database.
2. **Blob backend:** PostgreSQL `BYTEA` for version 1, with a measured limit lower than
   or equal to the current 100 MiB ceiling.
3. **Occurrence identity:** independent UUID, never a unique blob digest.
4. **Current/preferred state:** application projection with optimistic revision checks.
5. **Attempts:** durable operational records, not production runs.
6. **Consistency/review:** typed artifacts when retained as business-significant facts.
7. **Search:** explicit mappings and SQL/projector execution; never recursive arbitrary
   JSON indexing.
8. **Recovery tooling:** extend the current migration/backup toolkit and manifest.
9. **Customer isolation:** no cross-tenant blob table or physical deduplication.
10. **Runtime privileges:** a dedicated constrained artifact role, not the current broad
    public-schema DML role.

The repository cannot settle JSON canonicalization, schema dialect/profile, exact
locator vocabulary, purge policy, RPO/RTO, backup encryption/authenticity, or external
action reconciliation. Those remain genuine pre-migration decisions in the spec.

## Final assessment

The specification is sound against the repository's implemented evidence. Its apparent
complexity is concentrated exactly where the current application has accumulated
special cases or correctness gaps: occurrence identity, historical mutation,
domain-specific provenance, stale-worker completion, ad hoc idempotency, read-time
backfill, in-memory search, broad runtime privileges, cascaded deletion, and
timeline-ambiguous restore.

The backtest produces no reason to remove any of the five kernel primitives in the
specification. It does produce a clear implementation warning: the new store must be
introduced as an immutable publication boundary, not as a cleanup of the existing
inbox schema. Reuse the repository's PostgreSQL byte storage, tenant database boundary,
optimistic projection revisions, transactional business writes, audit co-commit,
strict validation behavior, and recovery tooling. Replace the conflation of blob and
occurrence identity, mutable historical payloads, unfenced completion, arbitrary search
indexing, and unrestricted runtime DML.

With those constraints, the repository is not merely compatible with the proposed
artifact store; it is a strong real-world justification for it.
