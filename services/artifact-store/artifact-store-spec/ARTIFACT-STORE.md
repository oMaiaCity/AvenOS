# Immutable Artifact Store Design

Status: reviewed architecture proposal

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

## Executive summary

The artifact store should be an **immutable, typed, composable provenance graph** in
PostgreSQL, with search supplied as a bundled rebuildable projection.

It stores two fundamentally different kinds of payload:

- exact bytes, such as uploaded PDFs, images, text files, and generated documents;
- structured JSON values, such as OCR results, addresses, invoices, classifications,
  and validation reports.

Every retained, user-visible value is an artifact with an independent logical ID and
an immutable, versioned type. An artifact may carry structured JSON, one primary blob,
and a bounded set of immutable, ordered references to other artifacts. Processing never
changes an input artifact. It creates one or more new artifacts and records the
complete production relationship between inputs and outputs. Derived artifacts can
therefore be inputs to later production runs without any special case in the model.

```text
raw file A1
    |
    +-- classification run --> classification A2
    |
    +-- OCR run -------------> text A3
                                  |
                                  +-- extraction run --> address A4
                                                            |
                                                            +-- normalization run --> address A5
```

The design deliberately separates:

1. **Immutable truth** — blobs, type versions, artifacts, structural references,
   production receipts, lineage, evidence, publication commits, and typed
   decision/evaluation artifacts.
2. **Mutable operational state** — upload sessions, jobs, attempts, leases, retry
   counters, and progress.
3. **Rebuildable projections** — full-text fragments, typed search fields, rankings,
   facets, and preferred/current views.

That separation is more important than any individual table. It allows work to retry,
search indexes to be rebuilt, and UI preferences to change without rewriting the
historical facts of what was stored and how it was produced. A small ordered commit
feed lets external projectors, enrichers, and workflow systems react reliably without
turning the store into a queue or event-sourced application database.

Client-application catalogs, container deployment, and customer-application lifecycle
are intentionally out of scope for this document. A producer is simply an authenticated
user, system component, or process capable of publishing artifacts.

## Goals

The first useful artifact store should provide:

- immutable raw and structured artifacts;
- content-addressed byte storage;
- explicit, immutable schema versions;
- schema validation before publication;
- immutable structural composition for manifests, collections, and multipart bundles;
- arbitrary chains of derived artifacts;
- exact input/output provenance;
- atomic publication of multi-output work;
- safe idempotent upload and publication;
- a replayable, commit-ordered change cursor for external wiring;
- full-text search;
- typed filters for schema-declared fields;
- retrieval of ancestors, descendants, references, referrers, and supporting evidence;
- evidence locators for JSON, text, bytes, pages, tables, and time-based media;
- human correction without destroying machine-produced history;
- typed human decisions that can be consumed by later runs;
- a safe boundary between proposals and real-world side effects;
- database-enforced immutability;
- authorization-safe reads, search, graph traversal, and change feeds;
- an explicit retention and erasure escape hatch;
- one recoverable PostgreSQL unit containing metadata and bytes.

## Non-goals for the first version

- A general workflow engine.
- An application marketplace or deployment model.
- Cross-customer sharing.
- A general semantic knowledge graph or mutable relationship store.
- A universal ACL language, ontology, or business-object lifecycle model.
- Distributed event sourcing and replay of the complete database.
- Arbitrary user-provided SQL indexes.
- Global semantic deduplication of artifacts.
- Automatic ontology inference from JSON Schema.
- Multi-gigabyte media storage.
- Editing artifact payloads in place.

## Minimal kernel and extension boundary

The smallest useful kernel is not merely a blob table. It must own the invariants that
cannot be repaired reliably by application code after the fact:

1. immutable type definitions and canonical hashing;
2. blobs, artifacts, and immutable structural references;
3. production runs with ordered inputs, outputs, and optional evidence locators;
4. one atomic publication command with idempotency and a commit-ordered change cursor;
5. authorization enforcement at every read/write boundary and a privileged purge
   mechanism.

Search is important enough to ship with the store, but it remains a replaceable
projection over that kernel. The following stay outside it:

| Concern | Where it belongs |
| --- | --- |
| Jobs, retries, leases, schedules, approvals waiting in queues | Workflow or task service |
| “Current”, “preferred”, branch heads, case status, ownership | Application projection with optimistic concurrency |
| Webhooks, queues, enrichment triggers, materialized views | Consumers of the ordered change feed |
| Model/tool execution and procedure-specific validation | Producer application or worker SDK |
| Remote side effects and transport retries | Dedicated executor using request artifacts as idempotency keys |
| User/group membership and policy administration | Authorization service; the store enforces its decisions |
| Domain entities and semantic relationships | Typed artifacts plus application projections where useful |

This boundary is intentionally asymmetric: applications may add richer behavior, but
they cannot bypass type validation, immutability, provenance, authorization, or atomic
publication.

## Core terminology

### Blob

A blob is an exact byte sequence identified by SHA-256. Multiple artifacts may refer
to the same blob.

Blob identity answers:

> Are these bytes exactly the same?

It does not answer whether two uploads are the same business occurrence or whether two
artifacts have the same provenance.

### Artifact

An artifact is one immutable typed fact or occurrence. It has:

- an independent artifact ID;
- an exact artifact type version;
- a small JSON payload;
- optionally one primary blob;
- zero or more immutable, ordered structural references;
- a canonical artifact digest;
- creation identity and time.

Two artifacts may have identical payloads and share a blob while remaining distinct
artifacts. For example, the same PDF received from email and uploaded manually may
need two provenance records even though its bytes are deduplicated.

### Artifact reference

An artifact reference is part of the referencing artifact's immutable value. It names
another artifact under a type-scoped role and ordinal, optionally with a locator into
the target and small schema-validated attributes about that membership. References
provide composition without pretending that composition is derivation.

Examples include the ordered members of a dataset manifest, files in a release bundle,
or renditions in a media package. Adding a reference later is not allowed; publish a
new manifest instead. A reference label has no universal semantics or transitivity.
Semantic claims such as “is the same customer as” should be represented by a typed
assertion artifact, not by adding an untyped mutable edge.

Keeping one primary blob per artifact is intentional. A genuinely multipart value is
a typed manifest referencing single-blob member artifacts; a thumbnail, transcoding,
or extracted text is a separately derived artifact. This keeps byte deduplication and
range retrieval simple without preventing compound packages.

### Artifact type version

An artifact type version gives a payload and its references structural meaning. It
includes a stable namespaced key, an integer version, a payload JSON Schema, a
reference JSON Schema, a type-definition digest, and a blob policy. Search
configuration is versioned separately because it is projection policy, not part of
the artifact's structural meaning.

Examples:

- `core.file@1`
- `core.document-classification@1`
- `ocr.text@2`
- `contact.postal-address@1`
- `finance.invoice@3`

A published type version is immutable. A changed schema creates a new version.
Compatibility is not inferred from version numbers. Converting old content is an
ordinary production run from the old exact type to the new exact type; read/search
projections may normalize several versions only when their mappings say how. This
keeps “schema migration” from silently rewriting historical values.

### Production run

A production run is the immutable receipt for one completed transformation. It says
which procedure, parameters, implementation, and exact input artifacts produced which
output artifacts.

Failed attempts and in-progress work are not production runs. They belong to the
operational job layer.

### Evidence locator

An evidence locator is a small, versioned description of a region within an artifact:
for example an RFC 6901 JSON Pointer, a Unicode text range, a byte range, a PDF page
rectangle, a table cell range, or a media time interval. Locators are coordinates, not
query expressions, and are always interpreted relative to a named artifact.

### Publication commit

A publication commit is the immutable envelope for one atomic visible change. It has
a commit-ordered cursor and lists the artifacts, run, type definitions, or tombstones
made visible together. It exists so external consumers can react at least once and
checkpoint safely. It is not a job, a webhook delivery record, or an event-sourced
replacement for the artifact tables.

### Decision or evaluation artifact

A human decision, policy check, consistency result, signature verification, or
malware scan is an ordinary typed artifact produced from declared inputs. It can carry
a domain-specific verdict, evidence, and rationale and can become an input to a later
run. It is not a mutable `valid` boolean or a second metadata system attached to an
artifact.

### Projection

A projection is rebuildable derived state used for navigation or performance. Search
fragments, typed index values, facets, and preferred/current pointers are projections.
They may be updated or deleted without changing artifact truth.

## Lessons salvaged from the two repositories

### From `avenCEO-tools`

The existing store already demonstrates that content-addressed bytes in PostgreSQL are
practical for the current document domain. `document_assets` uses SHA-256 identity and
schema 2 verifies the stored `BYTEA` length.

Relevant sources:

- [Document asset table](../db/migrations/0001_current_schema_baseline.sql#L40)
- [Embedding asset bytes](../db/migrations/0002_embed_document_assets.sql#L1)
- [Asset storage code](../src/lib/server/ingest/storage.ts#L10)

The generated `tsvector` and GIN index are also a sound starting point for search:

- [Generated document search vector](../db/migrations/0001_current_schema_baseline.sql#L77)
- [Document GIN index](../db/migrations/0001_current_schema_baseline.sql#L294)

The new store should not copy the parts where `staged_documents` combines immutable
content, mutable job status, classification, extracted data, reviewed data, correction
history, and search state. It should also not copy the global uniqueness of a staged
document by blob hash.

- [Current staged document shape](../db/migrations/0001_current_schema_baseline.sql#L48)
- [Unique staged document per asset](../db/migrations/0001_current_schema_baseline.sql#L286)

The current attempt model is worth retaining: phase, model, schema version, raw
response, instruction, failure, and timestamps are stored independently of the
document.

- [Ingest attempts](../db/migrations/0001_current_schema_baseline.sql#L145)
- [Attempt write path](../src/lib/server/ingest/repository.ts#L813)

### From `model-builder-2`

The strongest reusable ideas are:

- content versions with hashes rather than silent overwrite;
- exact source spans on derived values;
- classification receipts preserving raw and normalized kinds;
- an explicit `unknown` kind rather than a dishonest fallback;
- canonical semantic hashing;
- durable jobs with heartbeat and attempt ownership fencing;
- atomic publication of a complete result bundle;
- procedure-backed evidence facets instead of one vague status; in this design those
  become typed evaluation artifacts.

Relevant sources:

- [Versioned sources](../../model-builder-2/operations/migrations/0001_foundation.sql#L85)
- [Exact source span contract](../../model-builder-2/packages/kernel/src/claims.ts#L41)
- [Classification receipt](../../model-builder-2/packages/kernel/src/claims.ts#L53)
- [Canonical hashing](../../model-builder-2/packages/kernel/src/canonical.ts#L1)
- [Durable job ownership](../../model-builder-2/packages/domain/src/jobs.ts#L190)
- [Atomic publication](../../model-builder-2/packages/domain/src/staging.ts#L63)
- [Procedure-backed facets](../../model-builder-2/packages/kernel/src/facets.ts#L1)

The artifact store does not need the model builder's complete event-sourcing system.
Artifacts and production receipts are already append-only facts. A separate audit log
is sufficient and avoids making every read depend on event replay.

## Use-case pressure test: enrichment, review, and external action

Across domains, the useful recurring shape is:

```text
source artifacts
      |
      v
agent interpretations ---- field evidence ----> exact source regions
      |
      v
candidate / recommendation artifacts
      |
      +---- human decision artifact
      |             |
      |             +---- corrected artifact or another agent run
      v
authorized action request ---- external system ---- action receipt artifact
```

Every box in this diagram is durable content with a schema. Queue position, task
assignment, retry count, and “waiting for review” are mutable workflow state outside
the immutable artifact core.

### Detailed example: bookkeeping and accounts payable

A realistic invoice flow exercises almost every important boundary:

1. Store the received email/message or uploaded PDF, purchase-order snapshot, relevant
   supplier-master snapshot, and tax-rule version as source artifacts.
2. Email parsing or document splitting produces body, attachment, or ordered
   document-slice artifacts. The run records derivation; if an exact message or slice
   bundle is itself useful, a typed manifest records ordered structural references. No
   mutable generic `contains` edge is needed.
3. Classification and OCR runs produce classification and text artifacts without
   changing the uploaded file.
4. An extraction run produces a `bookkeeping.invoice-candidate` artifact. Field-level
   evidence maps invoice number, supplier, dates, totals, tax amounts, currency, and
   line items to exact OCR spans or page regions.
5. Separate runs produce supplier-match candidates, purchase-order matching results,
   arithmetic/tax checks, and duplicate checks. A duplicate check consumes both
   invoice candidates and emits a typed verdict; it does not assert a vague
   `duplicate_of` relation.
6. A posting-proposal run consumes the accepted facts and policy snapshots and emits
   proposed accounts, tax codes, cost centers, amounts, and confidence explanations.
7. A reviewer can accept, reject, abstain, request changes, or correct particular
   fields. Review produces a decision artifact. Correction produces a new invoice or
   posting artifact in the same human-review run; the machine candidate remains.
8. A request-building run consumes the approved proposal and human decision and emits
   the action-request artifact eligible for an accounting connector. The connector
   uses the request artifact ID as an idempotency key and publishes a posting-receipt
   artifact with the external journal ID and response digest.
9. Reversal is another authorized request and receipt, never an edit of the original
   posting receipt.

This shape accommodates credit notes, no-PO invoices, partial deliveries, multi-
currency invoices, ambiguous suppliers, inconsistent totals, and suspected duplicates
without adding global lifecycle flags to artifacts. A mutable accounts-payable work
item may coordinate the process, but it only points to artifact IDs.

### Other representative workflows

| Use case | Source artifacts | Produced artifacts | Human-in-the-loop and outcome |
| --- | --- | --- | --- |
| Bank reconciliation | Statement files, ledger snapshot, reconciliation policy | Parsed transactions, match candidates, discrepancy report | Accountant selects/corrects matches; approved reconciliation and export receipt are new artifacts |
| Expenses | Receipt image, card transaction, travel policy | OCR, merchant/category candidates, policy exceptions, reimbursement proposal | Employee or approver corrects and approves; payment request and receipt remain distinct |
| Procurement | Requisition, quotes, supplier snapshots, policy | Requirement extraction, quote comparison, risk flags, award recommendation | Buyer records a decision; purchase-order request and ERP receipt prove the external action |
| Contract review | Contract versions, clause library, policy | Clause extraction, deviations, risk findings, redline proposal | Lawyer accepts, rejects, or edits findings; signed document is a later source artifact, not a mutation |
| Identity and compliance review | Identity documents, forms, watchlist snapshot, policy | Extracted identity facts, matches, discrepancies, risk recommendation | Authorized reviewer decides or escalates; high-risk decisions never follow merely from an agent confidence score |
| Insurance claims | Claim form, photos, invoices, policy snapshot | Extracted facts, coverage analysis, estimate, anomaly findings | Adjuster corrects facts and authorizes a decision; payment execution yields a separate receipt |
| Customer support | Incoming messages, account snapshot, knowledge sources | Intent classification, answer draft, citations, escalation recommendation | Human edits or approves outbound content; sent-message receipt records delivery separately |
| Research and due diligence | Source snapshots, filings, interview notes, datasets | Claims, source-grounded summaries, contradiction reports, draft report | Analyst validates claims and edits conclusions; final report preserves its exact source graph |
| Knowledge ingestion and RAG | Documents, web snapshots, metadata | Parsed text, chunks where independently useful, entities, summaries, embeddings | Curator rejects bad parsing or corrects metadata; search/vector indexes remain rebuildable projections |
| Master-data migration | Source exports, mapping rules, target-schema version | Normalized candidates, entity matches, conflict reports, import proposal | Steward resolves conflicts; import request and target-system receipt are separate artifacts |
| Transcription and localization | Audio/video, terminology, style guide | Transcript, speaker segments, translation, subtitle candidates | Editor corrects timing and text; rendered deliverables are derived outputs |
| Software change and release | Repository snapshot or commit, issue, policy | Patch, test results, security findings, review summary, release proposal | Engineer approves; merge/deployment requests and platform receipts record external effects |
| Industrial quality inspection | Images, sensor captures, specification version | Measurements, defect detections, disposition recommendation | Inspector confirms or overrides; machine-control actions require separate authorization |
| Clinical document abstraction | Clinical documents, terminology and ruleset versions | Extracted facts, coding candidates, discrepancy warnings | Qualified reviewer validates the abstraction; it must not silently become a clinical decision |
| ML dataset and model registry | Source snapshots, labeled examples, code/environment snapshots | Dataset manifests, training receipts, checkpoints, metrics, model cards, evaluation results | Curator approves a dataset/model; promotion is a mutable projection and deployment uses a request/receipt pair |
| Scientific and laboratory work | Instrument captures, protocol, calibration and environment snapshots | Cleaned observations, analyses, plots, notebooks, claims | Researcher signs or amends conclusions; exact samples and regions remain traceable |
| Build cache and software supply chain | Source tree manifest, toolchain image, build parameters | Object files, packages, SBOMs, provenance attestations, signatures | Release policy selects an artifact; registry upload and deployment produce receipts |
| Media production and publishing | Camera originals, audio tracks, scripts, rights metadata | Cuts, transcripts, captions, thumbnails, translations, rendition bundles | Editor approves a cut; publication and CDN delivery are external effects |
| Geospatial, telemetry, and IoT windows | Sensor segments, map layers, calibration and device configuration | Window summaries, anomaly detections, route segments, alerts | Operator validates consequential alerts; high-volume events are chunked rather than made one artifact each |
| Legal hold and e-discovery | Collected files, collection receipts, custodian and policy snapshots | Deduplicated sets, extracted text, issue tags, redactions, exhibit bundles | Reviewer decisions preserve chain of custody; access and purge policy apply to both lineage and structural referrers |
| Infrastructure and configuration change | Configuration snapshots, module versions, live-state snapshots, policy | Plans, drift reports, policy findings, change requests | Operator authorizes apply; provider receipts capture actual effects and subsequent drift is a new snapshot |
| AI evaluation and prompt/data curation | Prompt suites, response captures, rubric and model snapshots | Scores, pairwise comparisons, failure clusters, curated dataset manifests | Evaluators adjudicate; changing the “best” model or dataset is a projection, not a rewrite |
| Offline exchange and archival package | Selected artifact closure, schemas, receipts, signatures | Checksum manifest, portable bundle, import report | Export/import policy decides identity preservation and disclosure; search indexes are never required for completeness |

These are not separate storage models. They are different artifact types and
procedures using the same small set of persistence primitives.

### What the broader cases add to the kernel

The original document-processing flow proves derivation, but it does not by itself
exercise several capabilities that a reusable artifact kernel needs:

- **Composition.** Datasets, release packages, email-with-attachments, media
  renditions, and export bundles need immutable ordered membership. Production inputs
  cannot substitute for membership: “used to produce” and “is a member of” are
  different statements. This motivates the narrow structural-reference primitive.
- **Reliable reaction.** Indexers, enrichers, policy evaluators, and application views
  need to observe a whole publication exactly as it became visible. Timestamps and
  `created_at` polling have race conditions. This motivates a transactionally written,
  commit-ordered cursor with at-least-once consumption.
- **Non-JSON grounding.** Scientific, media, geospatial, source-code, and legal use
  cases cite byte ranges, time spans, page regions, table cells, or referenced members,
  not only JSON fields. This motivates a small extensible locator vocabulary.
- **Large fan-in and streams.** A model trained from ten million rows should normally
  consume a dataset manifest or immutable segment set, not create ten million run-input
  rows. Segment artifacts, rolling manifests, and checkpoints keep the kernel bounded.
- **Leak-proof traversal.** Search snippets, change feeds, lineage, evidence, and
  referrer queries can disclose restricted data even when direct artifact reads are
  protected. Authorization must therefore be a kernel query constraint, not a UI
  afterthought.

None of these additions require a workflow state machine, ontology, or generic mutable
edge table.

### Reusable application recipes

Most applications can be assembled from a small set of patterns:

| Developer intent | Artifact representation | External wiring |
| --- | --- | --- |
| Enrich or tag an existing artifact | Run consumes `subject`; emits a typed enrichment/annotation artifact | Projector attaches selected fields to subject search/card views |
| Correct or revise a value | Run consumes `base`; emits a complete replacement or typed patch artifact | A current/preferred pointer chooses a head; history remains intact |
| Branch, compare, and merge alternatives | Runs emit alternatives; comparison/adjudication consumes all candidates | Branch heads and conflict queues are mutable projections |
| Package files or create a dataset | Manifest artifact has ordered structural references to exact members | Projector maintains friendly collection browsing or aliases |
| Process a large or open-ended stream | Immutable segment artifacts plus successive manifest/checkpoint artifacts | Scheduler decides windowing and when to compact manifests |
| Snapshot mutable external state | Capture artifact records source version, observation time, digest, and bytes/value | Connector schedules refreshes and tracks the latest snapshot |
| Assert a semantic relationship | Typed assertion artifact names subjects/objects and carries evidence | Knowledge-graph projection indexes accepted assertions if needed |
| Reuse deterministic work | Look up a prior run by procedure, parameters, and declared input policy | Producer decides whether identity-level or content-level cache reuse is safe |
| Review, sign, or attest | Review/signature artifact is an output with the subject and policy as inputs | Task UI and key-management/signing service remain external |
| Materialize a read model | Projector consumes publication commits and writes its own rebuildable tables | Projector checkpoint, retry, and dead-letter state stay outside the kernel |
| Perform a real-world action | Authorized request artifact, then an executor-produced receipt artifact | Connector owns transport retries and remote idempotency |

The enrichment recipe is especially important: applications never add columns or
mutable metadata to the source artifact. They publish another typed fact and choose how
to project it onto the source. That allows independent enrichers to coexist, be rerun,
and be accepted or ignored without coupling their schemas to the storage core.

An enricher consumes feed commits at least once, filters to declared input types, and
uses a stable key derived from its subscription generation, procedure version, and
exact input identity. A deliberate rerun uses a new invocation/generation. The
enricher must also ignore or deliberately handle its own output types so a
projector/enricher loop does not recurse accidentally.

### Artifact or operational state?

| Store as an artifact | Keep outside the immutable core |
| --- | --- |
| Uploaded file, message, form, image, or dataset | Upload session and chunk progress |
| Snapshot of policy or mutable external reference data used by a run | Current policy pointer or live remote row |
| Parsed fact set, candidate, recommendation, draft, or generated deliverable | Agent scratchpad, private reasoning, transient tool call, or streaming token |
| Human review decision, correction, adjudication, or durable annotation | Review task, assignee, due date, notification, or queue position |
| Domain-significant validation, match, risk, or failure result | Worker attempt, heartbeat, retry counter, exception stack, or debug log |
| Authorized external action request and resulting receipt | Connector lease, circuit-breaker state, or transport retry |
| Frozen manifest, dataset snapshot, or export that is itself a deliverable | Mutable case, conversation, project, collection, or work-item lifecycle |
| Publication commit naming facts made visible atomically | Consumer checkpoint, subscription, webhook attempt, or dead-letter queue |
| Stable content embedding when it must be exported or audited as output | Rebuildable search/vector index maintained only for retrieval |

An implementation may retain operational records for audit and debugging, but that
does not make them part of the artifact graph or its long-term content contract.

### Cross-case conclusions

#### Candidates are facts about a proposal, not accepted truth

An immutable artifact may still be uncertain, provisional, wrong, or rejected. Type
names and schemas should distinguish an `invoice-candidate` from an approved posting
request. Immutability means “this exact result existed,” not “this result is correct.”

Confidence is procedure-specific evidence, not authorization. Scores from different
models are not automatically comparable, and a high score is not approval. If policy
allows automatic acceptance for a low-risk case, a policy-evaluation run should
consume the candidate and exact policy version and emit a decision artifact just as a
human review would.

#### Parallel agents and deliberate reruns produce alternatives

Two agents, two model versions, or a deliberate rerun may produce different candidates
from the same inputs. Preserve all of them. A selection or adjudication run consumes
the alternatives and produces its own decision. Request idempotency should collapse a
transport retry, not erase a deliberate second opinion.

#### Human work produces artifacts; human task state does not

Approval, rejection, abstention, correction, and escalation have durable business
meaning and should be typed outputs of review runs. Reviewer assignment, due date,
claiming, notifications, and queue status belong to a work-management layer. Multiple
reviewers produce multiple decision artifacts; adjudication consumes them rather than
overwriting them.

#### External effects require a request/receipt split

Posting a journal entry, sending a message, ordering a payment, merging code, or
controlling equipment is not an artifact-store transaction. Store the authorized
request as an artifact, perform the effect through a dedicated executor, then publish
the external receipt as another artifact. A database transaction cannot make a remote
side effect exactly-once. The executor must use the request artifact ID as an
idempotency key and recover from a crash between the remote effect and receipt
publication.

A transport failure or retry belongs to operational attempt history. A durable
business outcome—such as an accounting system rejecting a closed period—may justify a
typed failure-receipt artifact because later work needs to consume that fact.

#### Mutable external data must be snapshotted when it affects a result

A vendor record, policy, watchlist, ledger, knowledge article, or source-code branch
may change later. A run should consume an immutable snapshot artifact or an immutable
external version with a verifiable digest. A bare foreign ID is insufficient evidence
for a consequential result.

#### A case is usually workflow state, not an artifact primitive

Claims, invoice work items, support conversations, and reviews need mutable ownership
and lifecycle. Keep that case/work-item record outside the artifact store and let it
reference artifacts. When a frozen bundle is itself a deliverable, publish a typed
manifest artifact with explicit member roles and ordering. Do not add a universal
`case_id` or membership edge to every artifact.

#### Composition and provenance are different graphs

A production input says that a procedure depended on an artifact. A structural
reference says that an artifact value names another artifact as a member or component.
Neither should be inferred from the other. A dataset manifest may reference one
thousand shards; a training run can consume the one manifest. A PDF rendition may be
produced from a document but is not automatically a member of every export bundle that
contains the document.

Keep reference roles type-scoped and immutable. Do not assign global meaning to labels
such as `member`, `subject`, or `related`. If an application wants a semantic relation
with confidence, validity, evidence, or review, that relation is itself a typed
artifact.

#### Artifact granularity follows independent use

Do not make every OCR token, invoice field, line item, or detected clause an artifact.
Keep values inside a structured payload with field-level evidence until they need
independent retention, access control, search identity, reuse as a run input, or their
own derivation history. This avoids millions of graph nodes without losing grounding.

For high-volume records, the right unit is often an immutable segment blob plus a
small typed manifest, not one artifact per sensor sample, CSV row, token, or log line.
Locators can address regions inside a segment. Later compaction produces a new segment
and manifest; it does not rewrite the old ones.

#### Preserve an audit trail, not hidden reasoning

For an agent run, retain declared inputs, exact procedure/model/tool versions,
parameters, durable tool-result artifacts, outputs, evidence, and a concise rationale
where the output schema calls for one. Do not require or expose private chain-of-thought.
Raw provider responses are operational diagnostics unless deliberately retained under
an explicit privacy and size policy.

#### Authority is separate from capability

An agent may be capable of producing a posting proposal without being authorized to
post it. Production receipts must distinguish the authenticated publisher, logical
actor, initiator, and—where relevant—the human decision authorizing an external
request. Downstream executors authorize against decision artifacts and current policy;
they do not infer authority from artifact existence alone.

#### Derived data inherits risk

OCR text, summaries, embeddings, entity matches, and decisions may be as sensitive as
their source. Authorization and retention analysis must follow descendants, while an
artifact's type may apply stricter policy than its ancestor. “Derived” does not mean
anonymous or safe.

#### A change feed is a synchronization primitive, not business truth

External consumers need a race-free way to learn that an atomic publication occurred.
The feed lists committed resource IDs and can be replayed, but artifacts and runs remain
the authoritative state. Consumers must tolerate duplicate delivery, checkpoint only
after applying a whole commit, and be able to rebuild from a bounded scan if their
cursor has expired. Webhook delivery state and consumer failures do not enter the
artifact graph.

#### Storage time is not domain time

`created_at` and `published_at` describe the store. Event time, observation time,
valid-from/to intervals, source modification time, and external receipt time belong to
typed payloads or receipts with explicit semantics. Applications needing bitemporal
views build them as projections; the core must not guess which timestamp means
“current.”

## Proposed persistence model

The tables should live in a dedicated PostgreSQL schema such as `artifact_store`.
Names below omit that prefix for readability.

```text
artifact_type_versions
          |
          v
      artifacts 1------1 artifact_payloads ------> artifact_blobs
          |  \
          |   +------ artifact_references -------> artifacts
          |
          +<----- artifact_run_outputs ----- production_runs
          |                                      |
          +------ artifact_run_inputs ---------->+
          |
          +<--------- artifact_evidence --------> artifacts
          |
          +<---- search_fragments / index_values   (rebuildable)

publication_commits ---- publication_change_items ----> resource IDs
```

There are deliberately two traversable graphs. The production graph is a DAG of
causal/dependency receipts. The structural-reference graph is immutable composition.
APIs and UIs must name which graph they are traversing rather than returning one vague
set of “related artifacts.”

### `artifact_blobs`

The blob table stores exact bytes only. Filename, declared media type, source URL, and
other occurrence metadata belong to the artifact payload rather than to the shared
blob.

Suggested columns:

```sql
CREATE TABLE artifact_store.artifact_blobs (
  sha256 text PRIMARY KEY
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL
    CHECK (size_bytes >= 0),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(content) = size_bytes)
);
```

Zero-byte files are valid and have a well-defined SHA-256 digest. On a hash conflict,
the write path must verify both the existing byte length and exact bytes before reusing
the row. A digest collision or inconsistent stored value is an integrity failure; it
must never be accepted as deduplication merely because the primary key matched.

Although version 1 stores only SHA-256, API digest values should be tagged as
`{kind, algorithm, value}` rather than exposed as unexplained strings. The `kind`
distinguishes a blob digest from an artifact, type-definition, run, or request digest;
this leaves room for hash migration without making callers infer a digest's domain
from the surrounding field name.

The blob hash is physical identity, not read or reuse authority. A publication may
bind bytes only when they are supplied inline, named by an unexpired opaque upload
handle bound to the authenticated principal, or reused through an existing artifact
occurrence the principal may read. A bare SHA-256 value is never proof that the caller
possesses or may disclose the bytes. Internally, all of those paths may converge on
the same global blob row without revealing whether another scope already stored it.

For staged uploads, operational rows should bind an opaque handle to the principal,
declared digest and size, verified bytes, creation/expiry time, and optional intended
publication key. Persist a one-way verifier rather than the bearer handle itself where
the token design permits. These rows are not artifacts and do not enter the change
feed. Publication resolves the handle and rechecks its owner and digest in the atomic
command; garbage collection must treat unexpired staged-upload claims as live even when
no retained artifact payload references the blob yet.

The first implementation should keep a deliberately bounded maximum blob size. The
current 100 MiB document limit is a ceiling to validate, not automatically a safe
default. A conventional PostgreSQL driver may materialize a complete `BYTEA` more than
once. Start lower unless the upload path truly streams or chunks data and memory, WAL,
backup, and restore behavior have been measured at the limit.

PostgreSQL automatically TOASTs large values. That is useful but does not remove the
need to monitor database growth, WAL volume, backup duration, restore duration, and
vacuum behavior.

### `artifact_type_versions`

Suggested columns:

```sql
CREATE TABLE artifact_store.artifact_type_versions (
  id uuid PRIMARY KEY,
  canonicalization_version integer NOT NULL
    CHECK (canonicalization_version > 0),
  type_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  validation_profile text NOT NULL,
  payload_schema jsonb NOT NULL,
  references_schema jsonb NOT NULL,
  type_definition_sha256 text NOT NULL
    CHECK (type_definition_sha256 ~ '^[0-9a-f]{64}$'),
  blob_policy text NOT NULL
    CHECK (blob_policy IN ('forbidden', 'optional', 'required')),
  registered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type_key, version),
  UNIQUE (id, canonicalization_version),
  CHECK (jsonb_typeof(payload_schema) = 'object'),
  CHECK (jsonb_typeof(references_schema) = 'object')
);
```

Recommended type-key format:

```text
^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$
```

The JSON Schema dialect must be fixed globally, for example JSON Schema 2020-12. Each
schema document should carry its `$schema` URI. `type_definition_sha256` hashes a
domain-separated canonical document containing the canonicalization version, type
key/version, dialect, payload schema, reference schema, blob policy, pinned validation
profile, and the sorted identities/digests of every external schema dependency so none
of the structural contract can drift. The profile names the validator/version plus
choices such as supported formats and regular-expression semantics.

The database can enforce shape-level constraints, but dynamic JSON Schema validation
will normally run in the server with one pinned validator implementation. Publication
must fail before any artifact becomes visible if validation fails.

Validation must not coerce types, strip unknown properties, or insert schema defaults.
Those are transformations and would make the submitted value differ from the stored
one. A producer that wants defaults publishes them explicitly and hashes the resulting
payload.

Schema registration must pin the supported dialect and validator version, disable
network retrieval of references, restrict `$ref` targets to exact immutable registered
schema versions/digests rather than mutable aliases, and bound document depth,
reference expansion, and regular-expression complexity. Version 1 may support bounded
local recursion within one canonical schema document, but it should reject cycles
among external registered-schema dependencies; mutually recursive external digests
need a separately specified bundle/SCC hashing protocol and cannot be defined by
recursively including one another. The resolver and type-definition digest must agree
on the same closed dependency set. A schema is untrusted input even when registration
is an administrative operation.

Every artifact payload should be a JSON object even when the domain value is scalar.
This keeps envelopes extensible and prevents ambiguity around top-level arrays or
numbers. The reference schema validates the canonical array of `{role, ordinal,
targetArtifactId, targetArtifactSha256, locator, attributes}` descriptors. A
no-reference type uses a schema with `maxItems: 0`; manifest types can constrain roles,
counts, locator shapes, and attributes without inventing a second schema language.

The full descriptor is validated and retained, but the content digest described below
uses the target digest rather than its occurrence ID. This distinction is deliberate.
The server's resolved canonical descriptor supplies every field explicitly, including
an empty `attributes` object and a null locator; SQL defaults do not define canonical
meaning.

### `artifacts` and `artifact_payloads`

Artifact identity and retained content should be split into two one-to-one tables. The
split adds one join, but it makes retention and erasure much cleaner: a privileged
purge can remove payload material while an opaque artifact identity remains to keep
lineage structurally valid.

Suggested envelope:

```sql
CREATE TABLE artifact_store.artifacts (
  id uuid PRIMARY KEY,
  type_version_id uuid NOT NULL,
  artifact_sha256 text NOT NULL
    CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  canonicalization_version integer NOT NULL
    CHECK (canonicalization_version > 0),
  actor_kind text NOT NULL
    CHECK (actor_kind ~ '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$'),
  actor_id text NOT NULL,
  publisher_principal_id text NOT NULL,
  authorization_scope_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (type_version_id, canonicalization_version)
    REFERENCES artifact_store.artifact_type_versions(id, canonicalization_version)
    ON DELETE RESTRICT
);
```

The actor is the logical creator; the publisher is the authenticated principal that
committed the artifact. They may differ when a worker service publishes an agent's
output. The server derives the publisher from authentication rather than trusting a
request field. `actor_kind` is a namespaced token rather than a closed enum so devices,
external systems, importers, and future actor kinds do not require a migration.

The server, not the caller, copies `canonicalization_version` from the exact type
version and rejects any inconsistent stored pair. Canonicalization upgrades therefore
require a new type version or another explicitly defined conversion contract; a caller
cannot select different hash semantics for two artifacts of the same exact type.

`authorization_scope_id` is an opaque, stable policy partition, not an ACL encoded in
the artifact. An external authorization service can change who belongs to a scope
without mutating artifacts. The publication service validates scope assignment and
cross-scope inputs/references; every projection copies or joins this value so filtering
happens before snippets, ranking, counts, or graph nodes can leak.

Suggested retained payload:

```sql
CREATE TABLE artifact_store.artifact_payloads (
  artifact_id uuid PRIMARY KEY
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  blob_sha256 text
    REFERENCES artifact_store.artifact_blobs(sha256) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(payload) = 'object')
);
```

The server must verify the type's `blob_policy` before insert:

- `forbidden`: `blob_sha256` must be null;
- `optional`: either form is accepted;
- `required`: a blob reference must exist.

The constrained publication function must enforce this rule from the first migration;
a defensive database trigger may independently recheck it at transaction end.

Every artifact envelope must have exactly one retained payload or one tombstone. The
normal publication path inserts envelope and payload in one transaction; purge inserts
the tombstone and removes the payload in one transaction. Runtime roles should only be
able to use those constrained functions, with a deferred constraint trigger providing
a final database-side check. An envelope with neither row, or with both, is corruption.

### `artifact_references`

References are immutable content owned by the source artifact, not relations that can
be attached later:

```sql
CREATE TABLE artifact_store.artifact_references (
  artifact_id uuid NOT NULL
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  role text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  target_artifact_id uuid NOT NULL
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  locator jsonb,
  attributes jsonb NOT NULL,
  PRIMARY KEY (artifact_id, role, ordinal),
  CHECK (artifact_id <> target_artifact_id),
  CHECK (locator IS NULL OR jsonb_typeof(locator) = 'object'),
  CHECK (jsonb_typeof(attributes) = 'object')
);
```

The publisher must be authorized to read every referenced target. Targets may already
exist or may be earlier nodes in the same bounded publication. Same-publication
references are resolved from request-local keys, validated as an acyclic graph, and
inserted with the artifacts in one transaction. Because existing artifacts cannot gain
new outgoing references, this preserves a structural DAG and permits topological
digest calculation. A bundle can therefore publish its files and manifest atomically.

The core validates existence, authorization, acyclicity, role/ordinal uniqueness, the
type's reference schema, and the generic locator envelope. Domain code remains
responsible for stronger rules such as “all dataset members must be Parquet shards.”
Those rules may also be expressed by a producer-side contract or a typed evaluation
artifact.

Reference attributes carry facts specific to membership, such as a bundle path and
file mode, a dataset split, or a rendition label. They are bounded and validated by the
referencing type; they are not a free-form tagging system. Facts intrinsic to the
target stay in its payload.

### Artifact digest

The artifact digest establishes canonical content equality, not logical identity.
Version 1 can hash a canonical document equivalent to:

```json
{
  "canonicalizationVersion": 1,
  "typeKey": "contact.postal-address",
  "typeVersion": 1,
  "typeDefinitionSha256": "...",
  "payload": {},
  "blobSha256": null,
  "references": [
    {
      "role": "member",
      "ordinal": 0,
      "targetArtifactSha256": "...",
      "locator": null,
      "attributes": { "path": "documents/invoice.pdf" }
    }
  ]
}
```

The digest commits to referenced *content*, role, order, locator, and attributes, not
the target UUID. The immutable reference row still binds the exact target occurrence.
Thus two manifests that point to different occurrences with identical typed content
can have the same artifact digest while retaining distinct occurrence provenance. This
preserves the equality model below and makes the digest portable and useful for
content-level caching. A signature or export that must bind exact occurrences
signs/checks a canonical occurrence envelope containing the artifact ID, artifact
digest, resolved reference IDs, and deliberately disclosed actor, publisher, and time
fields rather than the digest alone. A local authorization-scope ID is included only
when that policy identity is intentionally portable.

Artifact ID, actor/publisher attribution, authorization scope, and storage timestamps
are occurrence-envelope facts and are excluded from `artifact_sha256`.

Every store-defined digest family must use an explicit, versioned domain tag before
its canonical bytes—for example `artifact-store/artifact/v1\0` or
`artifact-store/run/v1\0`. Type-definition, artifact, parameters, identity-input,
content-input, run, locator, search-mapping, search-catalog, and idempotency-request
hashes must not share an untagged preimage domain. Blob SHA-256 remains the digest of
the exact bytes because that is its declared external content identity; API values
still carry `kind=blob`.

Canonicalization must be documented and versioned. Parsing must retain exact JSON
number semantics rather than first rounding through a host-language binary float. At
minimum the canonicalizer should:

- reject duplicate object keys before conversion to `jsonb`;
- sort object keys;
- preserve array order;
- require JSON strings to be Unicode NFC, rejecting rather than silently rewriting
  values that could invalidate offsets;
- sort reference descriptors by role and ordinal;
- reject non-finite numbers;
- omit no fields implicitly;
- serialize numbers deterministically;
- encode as UTF-8 before SHA-256.

Do not leave the number rule as an implementation detail. RFC 8785 is suitable only if
schemas constrain numbers to its interoperable range; otherwise version 1 needs an
explicit arbitrary-precision decimal profile. Cross-language golden test vectors must
cover every digest family and its domain tag, Unicode, decimal exponents, negative zero
policy, nested objects, blobs, empty reference arrays, referenced artifacts, and
same-looking values in different digest domains.

Artifact IDs remain independent opaque UUIDs allocated separately from content; the
UUIDv4-versus-time-ordered choice is still explicit below. Identical digests are
allowed. This gives the system three useful levels of equality:

| Question | Identifier |
| --- | --- |
| Are the bytes identical? | blob SHA-256 |
| Are the typed values canonically identical? | artifact SHA-256 |
| Is this the same stored occurrence with the same provenance? | artifact UUID |

### `production_runs`

A production run exists only for successfully published work. It is an immutable
receipt, not a mutable job row.

`canonicalization_version` is a server-selected run-receipt hashing profile, not a
caller-controlled escape hatch. The publication-operation version determines which
profile is used.

Suggested columns:

```sql
CREATE TABLE artifact_store.production_runs (
  id uuid PRIMARY KEY,
  canonicalization_version integer NOT NULL
    CHECK (canonicalization_version > 0),
  procedure_key text NOT NULL,
  procedure_version text NOT NULL,
  implementation jsonb NOT NULL,
  parameters jsonb NOT NULL,
  parameters_sha256 text NOT NULL
    CHECK (parameters_sha256 ~ '^[0-9a-f]{64}$'),
  input_identity_sha256 text NOT NULL
    CHECK (input_identity_sha256 ~ '^[0-9a-f]{64}$'),
  input_content_sha256 text NOT NULL
    CHECK (input_content_sha256 ~ '^[0-9a-f]{64}$'),
  run_sha256 text NOT NULL
    CHECK (run_sha256 ~ '^[0-9a-f]{64}$'),
  receipt jsonb NOT NULL,
  initiated_by_kind text NOT NULL
    CHECK (initiated_by_kind ~ '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$'),
  initiated_by_id text NOT NULL,
  executed_by_kind text NOT NULL
    CHECK (executed_by_kind ~ '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$'),
  executed_by_id text NOT NULL,
  publisher_principal_id text NOT NULL,
  authorization_scope_id text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at >= started_at),
  CHECK (jsonb_typeof(implementation) = 'object'),
  CHECK (jsonb_typeof(parameters) = 'object'),
  CHECK (jsonb_typeof(receipt) = 'object')
);
```

The canonical publication command likewise supplies `implementation`, `parameters`,
and `receipt` explicitly, using `{}` when the versioned operation contract permits an
empty object. Database defaults must not create fields that were absent from the
request hash.

Initiator and executor are separate: a user may ask an agent to extract an invoice, a
service may schedule a policy check, and a human reviewer may execute a review
directly. The publisher is again taken from the authenticated request. For derived
outputs, the constrained publication function should make the artifact actor match
the run executor.

Examples of implementation receipt fields:

- executable or container digest;
- model provider and model identifier;
- prompt version;
- extraction schema version;
- consistency ruleset version;
- library versions relevant to deterministic interpretation;
- external request ID, if safe to retain.

Procedure keys and versions are opaque namespaced identifiers whose semantics are
owned by the producer. The kernel does not need a procedure registry or execute user
code. A developer SDK may validate richer input/output contracts, and a team may
publish procedure definitions as typed artifacts, but the stored run must still pin
the exact implementation and parameter receipts. Mutable aliases such as “latest
model” or a container tag are insufficient on their own. Receipts must also exclude
secrets and bound provider/debug data.

The two input hashes answer different questions:

- `input_identity_sha256` includes artifact IDs and therefore distinguishes equal
  content received through different provenance paths;
- `input_content_sha256` uses artifact digests and can identify content-equivalent
  work.

Both hashes cover the complete ordered input descriptors: role, ordinal, locator, and
the selected ID or digest. Reordering members, changing a locator, or changing an input
role must therefore change the hash.

`run_sha256` covers the procedure identity, implementation, parameters, ordered input
descriptors and digests, ordered output descriptors and digests, exact input/output
artifact IDs, receipt, authenticated publisher, logical actors, and execution
timestamps. It excludes database publication time, authorization scope, and mutable
authorization membership. This makes an exported receipt independently checkable
without making the run content-addressed or globally deduplicated. The run UUID remains
the occurrence identity.

Runs are addressable receipts but are not artifacts or run inputs. When a portable or
signable provenance statement is a deliverable, publish a typed statement artifact
that references the relevant output artifacts and contains the deliberately disclosed
build/processing facts; a later signing run can consume that statement. This avoids a
polymorphic reference system and avoids exposing every internal receipt field.

Idempotency should normally use input identity plus the exact procedure and parameter
versions. Content-level caching should be an explicit procedure policy because it can
discard meaningful occurrence-level provenance.

The safe default for cached computation is to reuse internal compute results but
publish a new output occurrence and run receipt for the current input IDs. Returning a
prior output artifact directly is only correct when the caller deliberately accepts
its original provenance. Cache lookup is authorization-aware and scope-bound by
default; equal content in an inaccessible scope is neither a cache hit nor information
the caller may learn. The new receipt records that a cache was used and the prior
run/result digest it verified.

### `artifact_run_inputs`

```sql
CREATE TABLE artifact_store.artifact_run_inputs (
  run_id uuid NOT NULL
    REFERENCES artifact_store.production_runs(id) ON DELETE RESTRICT,
  artifact_id uuid NOT NULL
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  role text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  locator jsonb,
  PRIMARY KEY (run_id, role, ordinal),
  UNIQUE (run_id, artifact_id, role, ordinal),
  CHECK (locator IS NULL OR jsonb_typeof(locator) = 'object')
);
```

The optional locator narrows the portion consumed by the run. Examples:

```json
{ "kind": "page-region", "version": 1, "page": 2, "coordinateSpace": "normalized", "bbox": [0.11, 0.42, 0.73, 0.51] }
```

```json
{
  "kind": "text-range",
  "version": 1,
  "unit": "unicode-code-point",
  "start": 1420,
  "end": 1477,
  "quoteDigest": {
    "kind": "text-quote",
    "algorithm": "sha-256",
    "value": "..."
  }
}
```

```json
{ "kind": "json-pointer", "version": 1, "pointer": "/addresses/0/street" }
```

Locators are evidence coordinates, not arbitrary query language. The kernel should
standardize a small envelope (`kind`, `version`) and common kinds such as
`artifact-root`, `json-pointer`, `text-range`, `byte-range`, `page-region`,
`table-region`, `media-time-range`, and `reference-path`. Procedure code validates
media- and domain-specific meaning. An input locator describes the part used by the run
as a whole; finer output-to-input support belongs in the evidence table below.
Store-defined locator digests use the locator version's explicit digest domain; a
tagged `quoteDigest` is not an untyped hash of an ambiguously encoded string.

`reference-path` lets a run consume one manifest while identifying selected members or
nested members. This is dependency compression for large fan-in, not permission to
resolve a mutable query at replay time. Publication resolves the bounded immutable path,
validates every hop and target digest/type required by the locator contract, and
authorizes the publisher to read every traversed target. The members need not become
separate run-input rows because the manifest digest and exact path already bind them,
but the manifest is never an authorization tunnel to hidden members.

### `artifact_run_outputs`

```sql
CREATE TABLE artifact_store.artifact_run_outputs (
  run_id uuid NOT NULL
    REFERENCES artifact_store.production_runs(id) ON DELETE RESTRICT,
  artifact_id uuid NOT NULL UNIQUE
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  role text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (run_id, role, ordinal),
  UNIQUE (run_id, artifact_id)
);
```

The unique artifact output constraint gives every artifact at most one producing run.
A directly published root artifact has no output row. A zero-input capture/import run
may produce a captured root when its acquisition receipt has durable value. A derived
artifact is an output of a run with at least one artifact input. APIs should distinguish
direct roots, captured roots, and derived artifacts instead of exposing one ambiguous
`raw` boolean.

The publication API should require every input artifact to pre-exist before the run is
committed. Outputs from the same run cannot be inputs to that run. With these rules,
the production graph is a directed acyclic graph without an expensive recursive cycle
check.

### `artifact_evidence`

Run inputs establish derivation, but structured outputs often need finer evidence. For
example, the `street` field of an address should point to one OCR span while `postalCode`
points to another. Preserve this mapping as immutable provenance:

```sql
CREATE TABLE artifact_store.artifact_evidence (
  run_id uuid NOT NULL,
  output_artifact_id uuid NOT NULL
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  evidence_key text NOT NULL,
  output_locator jsonb NOT NULL,
  input_artifact_id uuid NOT NULL
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  input_role text NOT NULL,
  input_ordinal integer NOT NULL CHECK (input_ordinal >= 0),
  input_locator jsonb NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (output_artifact_id, evidence_key, ordinal),
  FOREIGN KEY (run_id, output_artifact_id)
    REFERENCES artifact_store.artifact_run_outputs(run_id, artifact_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (run_id, input_artifact_id, input_role, input_ordinal)
    REFERENCES artifact_store.artifact_run_inputs(
      run_id, artifact_id, role, ordinal
    ) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(output_locator) = 'object'),
  CHECK (jsonb_typeof(input_locator) = 'object')
);
```

`evidence_key` is a stable producer-defined group such as `/taxAmount`, `claim-7`, or
`segment-3`; it is not interpreted globally. The two locators can address JSON values,
blob ranges, page regions, table cells, media intervals, or manifest members. Composite
foreign keys enforce that the evidence names an exact input row of the same producing
run. Publication verifies that the output belongs to the run and validates the generic
locator envelopes; the producer validates content-specific bounds. If a procedure
depends on an intermediate artifact, it must list that artifact—or a manifest that
immutably references it—as a direct input rather than pointing through an undeclared
mutable lookup. This keeps evidence local, queryable, and reproducible.

Locators may themselves contain personal data if they embed exact quotes. Prefer a
quote digest plus bounded context only when the UI truly needs it, and include locators
in retention analysis.

### `publication_commits` and `publication_change_items`

Every transaction that makes kernel state visible writes one immutable commit header
and an ordered list of changed resource IDs:

```sql
CREATE TABLE artifact_store.publication_commits (
  commit_seq bigint PRIMARY KEY CHECK (commit_seq > 0),
  id uuid NOT NULL UNIQUE,
  operation text NOT NULL,
  publisher_principal_id text NOT NULL,
  authorization_scope_id text,
  committed_at timestamptz NOT NULL
);

CREATE TABLE artifact_store.publication_change_items (
  commit_seq bigint NOT NULL
    REFERENCES artifact_store.publication_commits(commit_seq) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  resource_kind text NOT NULL,
  resource_id text NOT NULL,
  change_kind text NOT NULL,
  PRIMARY KEY (commit_seq, ordinal)
);
```

Typical items are `artifact/published`, `production-run/published`,
`artifact/purged`, `type-version/registered`, `search-mapping/registered`, and
`search-generation/activated`. The item is a routing envelope, not a copy of artifact
payload content. Consumers fetch authorized resources through normal APIs and apply a
whole commit atomically to their own projection before advancing their checkpoint.

One publication creates content in one authorization scope; all new artifacts and its
run use that scope. Inputs and references may come from other scopes when policy
allows, but publishing outputs into several visibility domains requires separate
publications. This small restriction prevents a filtered change feed from exposing half
of an atomic commit. Administrative commits such as global type registration may use a
null/global scope under separate authorization. Purge and other content-affecting
commits are also scope-homogeneous. A privileged retention plan spanning scopes must
execute and expose one commit per scope (or a separately authorized global operation
that cannot appear as a partially visible filtered commit).

A PostgreSQL sequence alone is not a safe pull cursor: concurrent transactions can
allocate sequence values and commit out of order, allowing a reader to advance past a
still-uncommitted lower value. As the final publication phase, update a single allocator
row under a transaction-held lock, use the allocated `commit_seq` to insert the header
and items, perform no more application or network work, and commit immediately. A
second publisher cannot allocate its cursor until the first releases the lock by
committing, so cursor order is commit order. A later implementation may replace this
short serialized tail with a proven WAL/LSN-based protocol, but must preserve the
no-skip cursor contract.

The allocator control state also carries a random `recovery_epoch`. Ordinary restarts
and non-divergent failovers preserve it; only the explicit divergent-recovery or
history-rewrite protocol changes it before any new commit can be accepted.

Set `committed_at` with `clock_timestamp()` in that final phase. It is useful diagnostic
time, not the ordering key and not a claim to know PostgreSQL's exact durable commit
instant; `commit_seq` defines feed order.

Delivery is at least once. Consumer checkpoints, retries, subscriptions, webhook
attempts, and dead letters stay outside the kernel. If commit rows are ever pruned, the
API publishes a minimum retained cursor and tells an expired consumer to rebuild from
an authorized artifact scan rather than silently skipping history.

The database sequence is internal. Where gaps would reveal activity in other scopes,
the HTTP API returns an authenticated **sealed** cursor; a signature or MAC over a
readable sequence is not opaque. The cursor binds at least the feed/API version,
store recovery epoch, internal scan position, authenticated consumer or stable service
scope, and the authorization-policy revision/fingerprint under which filtering
occurred. Clients store and return it but do not inspect, increment, transfer, or reuse
it under another authorization context. If grants change and the policy service cannot
prove the old filter context equivalent, the API requires an authorized rescan rather
than advancing the old cursor and silently skipping newly visible resources.

Bootstrap must also be race-free. A consumer first obtains high-water cursor `H`, then
keyset-scans authorized current resources whose original `*/published` change item has
`commit_seq <= H`, records `H` only after committing that snapshot, and consumes
commits after `H`. Changes reflected early by the current-state scan are harmless
duplicates. Version 1 should retain commit headers/items with the artifacts. If future
feed pruning is required, retain a compact immutable resource-to-first-commit binding
so the same snapshot protocol remains possible.

### Keep structural references narrow

The immutable `artifact_references` table is deliberately not a general relation
store. Names such as `equivalent_to`, `supersedes`, `owns`, and `approved_by` conceal
different questions about evidence, confidence, ordering, transitivity, lifecycle,
and authorization. A mutable edge with one label would store the claim without its
meaning or provenance.

Use the production graph when one artifact is produced from another. For example,
splitting a document into page artifacts is one production run with the document as
input and ordered pages as outputs. Use a typed manifest plus structural references
when exact grouping or packaging is part of the artifact value. Use a typed assertion,
decision, or evaluation artifact when the relation is a claim. Add another relation
model only when a concrete application operation and enforceable invariants cannot be
represented by production, evidence, typed artifacts, references, or a projection.

### Decisions and evaluations use the same artifact model

Do not add a special assessment table. A review is a production run—human or
automated—with the reviewed artifacts and applicable policy artifacts as inputs. Its
outputs are typed artifacts such as:

- `bookkeeping.invoice-review-decision@1`;
- `quality.consistency-check@1`;
- `security.malware-scan@1`;
- `security.signature-verification@1`;
- `bookkeeping.duplicate-check@1`.

An illustrative review payload is:

```json
{
  "verdict": "needs_changes",
  "scope": {
    "kind": "selected_fields",
    "paths": ["/taxAmount"]
  },
  "reasonCode": "source_mismatch",
  "rationale": "The tax amount does not match the invoice total."
}
```

The exact verdict vocabulary belongs to the artifact type, not to a global enum.
Reviewed subjects are authoritative run inputs and the reviewer is the run executor;
their IDs need not be repeated in the payload. Field-level evidence can point the
decision back to the disputed input values. Several reviewers can produce independent
decision artifacts, and an adjudication run can consume those decisions.

Successful publication already guarantees structural schema validity. Do not publish
a redundant `schema_valid` artifact for that invariant. Publish a validation artifact
only when the particular validator, ruleset, evidence, or result has durable domain
meaning. There is no single derived `valid` flag: workflow-specific projections may
summarize typed decisions, but the underlying facts remain artifacts.

## Raw artifacts and classification

A raw file upload should create an artifact of type `core.file@1`, not a special row
outside the artifact model.

An illustrative payload:

```json
{
  "originalName": "invoice-2026-08.pdf",
  "declaredMediaType": "application/pdf",
  "detectedMediaType": "application/pdf",
  "source": {
    "kind": "user_upload"
  }
}
```

The blob contains the exact PDF bytes. Re-uploading the same bytes may reuse the blob
while creating a new artifact if the logical occurrence or provenance is different.
An `Idempotency-Key` prevents accidental duplicate artifacts caused by retrying one
request.

A simple user upload can be a directly published root artifact. A connector capture
whose protocol receipt matters—email message ID, object version, HTTP validators, or
device sequence—can instead use a zero-input capture run and emit the source artifact
as its output. Neither form pretends that a mutable external record is still available.

Classification should not mutate the raw artifact. A classifier consumes the raw
artifact as a run input with role `subject` and emits a
`core.document-classification@1` artifact containing:

- raw proposed label;
- resolved type or classification key;
- resolution mode: `exact`, `synonym`, `unknown`, or `corrected`;
- confidence;
- reason.

Procedure, model, prompt, and implementation identity belong to the production run,
not to the classification payload.

The run input is the authoritative subject. Do not repeat its artifact ID inside the
payload: two sources of truth can disagree, and the repetition would make otherwise
identical classification content occurrence-specific.

An unsupported result becomes `unknown` or a failed job. It must not be forced into the
nearest convenient type.

The classifier's output can then be an explicit input to later extraction. This makes
it possible to reproduce the extraction decision, compare classifiers, or run a new
classifier without changing the original bytes.

## Corrections, review, and preferred values

Human review should not introduce a mutable `reviewed_payload` column.

Use these rules:

- Accepting or rejecting an artifact produces a typed review-decision artifact with
  an attributed reason.
- Correcting data creates a new artifact through a `human-correction` production run;
  the artifact being corrected is an input with a defined role.
- Re-running a process creates another run and new output artifacts.
- Selecting a preferred result updates a rebuildable preference projection, not the
  artifact.

This preserves the machine result, the human correction, and the reason for preferring
one over the other.

A general `current artifact` pointer should not be added until a concrete domain can
define the logical object whose current value is being selected. "Current" is not an
intrinsic artifact property.

## Atomic publication

Long-running work must not hold one database transaction open. The producer computes
outside the transaction, uploads or stages any output blobs, and finally sends one
publication request. The same command supports a batch of standalone/root artifacts or
a production run with outputs; upload and single-artifact routes are conveniences over
it. A request contains:

- a logical actor for standalone artifacts and, when a run is present, its production
  receipt, initiator, and executor identities, all authorized for the authenticated
  publisher;
- ordered input artifact IDs, roles, and locators when a run is present;
- the publication's immutable authorization scope;
- every new artifact's request-local key, exact type version, payload, optional inline
  bytes, principal-bound upload handle or authorized source-artifact reuse declaration,
  expected blob digest, and ordered references;
- references to existing artifacts by ID and same-publication artifacts by local key;
- run-output roles that name the corresponding local keys;
- optional field-level evidence mappings from outputs to declared inputs;
- an idempotency key;
- the current job-attempt ownership token, when work came from a job.

Client-local keys avoid forcing callers to preallocate UUIDs and allow an atomic
publication to create several leaf artifacts plus a manifest that references them.
The server returns the resolved IDs and one publication commit cursor.

A content publication creates at least one artifact, and a production run has at least
one output. Administrative commits such as type registration use their own constrained
operations; do not create empty runs merely as log records.

The server performs one short transaction:

1. Atomically claim or lock and validate the idempotency record; an existing success
   may short-circuit only after current authorization to return its response.
2. Bind the authenticated publisher and validate initiator/executor attribution.
3. Verify job ownership if applicable.
4. Load every input, existing reference target, and authorized blob-reuse source under
   locks/snapshot rules that serialize with purge; authorize all reads and reject
   missing or purged payloads when the operation requires retained content.
5. Resolve the publication authorization scope under a bound policy revision/decision
   lifetime and reject an unauthorized widening from sensitive inputs or reference
   targets.
6. Recompute ordered identity and content hashes for the inputs.
7. Load exact artifact type versions.
8. Validate every payload and blob policy.
9. Verify every inline/staged/reused blob declaration, authorize its handle or source
   occurrence, resolve it to exact bytes and digest, and resolve request-local artifact
   references. Never authorize blob reuse from a bare digest.
10. Topologically validate same-publication references, validate each resolved
    reference document against its type, and compute canonical artifact digests.
11. Insert all artifact envelopes, payloads, and structural references.
12. Compute and insert the production run and its digest, if present.
13. Insert input and output links.
14. Validate and insert field-level evidence mappings.
15. Mark co-located operational job state successful through a transaction participant,
    if applicable.
16. Prepare the stable resource-ID response and idempotency-retention horizon.
17. As the final serialized publication phase, allocate the commit cursor, insert its
    change items, and finalize the idempotency response.
18. Commit.

The server emits no success response before step 18 completes. A connection loss after
commit is an ambiguous client observation, not a failed publication; recovery is the
same-key/same-request-hash lookup described below.

Every check that grants publication authority is repeated or protected inside this
transaction; a preflight result is diagnostic, not authority. Database rows used for
retained-content, upload-claim, idempotency, and ownership decisions must not change or
disappear between validation and insert. When authorization is resolved by another
service, its decision/token binds the principal, action, relevant scopes and policy
revision with a short expiry; publication rejects an expired or mismatched decision.
This does not make revocation globally instantaneous, but it makes the accepted policy
snapshot and its lifetime explicit rather than relying on an unversioned earlier
check.

If any step fails, no run or output artifact is visible. Previously uploaded but
unreferenced blobs remain inaccessible through the artifact API and can be
garbage-collected after their upload claims expire plus a grace period.
An external job service cannot join this database transaction; it marks success after
receiving the idempotent publication response or consuming the commit and may safely
retry that acknowledgement.

## Idempotency and concurrency

Content hashes alone are not enough for request idempotency. The store should keep a
general record similar to:

```text
(principal, operation, idempotency_key)
  -> request_hash, response_resource_ids, commit_seq, expires_at
```

Rules:

- While its full record is retained, the same key and same request hash resolves to the
  original response without another commit, but current authorization still governs
  which response fields may be returned; idempotency is not a read-authorization
  bypass.
- Reusing a still-retained key with a different request hash returns `409 Conflict`.
- A new key may intentionally create a new artifact with identical content.
- Publication keys are scoped to the authenticated producer.
- Idempotency records have an explicit retention period long enough to cover realistic
  client retries and delayed job recovery.
- The response exposes the key's retention horizon, or the API publishes one stable
  horizon that clients can calculate without guessing.

The request hash must cover the canonical semantic command, including exact type
versions, payloads, blob digests, reference declarations, scope, logical
actor/initiator/executor identities, run receipt, inputs, outputs, and evidence. It
also covers the publication-operation/schema version and uses its own digest domain.
It should exclude transport-only fields such as a refreshed ownership token or a
replacement upload/reuse authority that resolves to the same declared bytes. If the
source occurrence is meaningful provenance rather than byte-transfer authority, the
caller declares it separately as an input or structural reference and it is hashed.
The server—not each SDK independently—defines this canonical request form. Retrying a
request must return the original IDs and commit cursor and must not emit another change
commit.

The `(principal, operation, idempotency_key)` claim must itself be linearized by a
unique constraint or equivalent lock; a check-then-insert race is not sufficient.
Automatic retries are valid only while the server still guarantees the idempotency
record. After that horizon, an ambiguously completed request must be reconciled or
require an explicit new decision; a client must not silently submit it as new work.
If a durable job/outbox may need recovery for longer, retain the full response mapping
for that lifetime or add a separate durable lookup/tombstone contract before claiming
longer recovery. The server makes no exactly-once promise beyond the declared horizon.

An expired key cannot simultaneously be reusable and guaranteed to reject every late
retry. If the API promises server-side rejection after the full response record
expires, it must retain a smaller non-reusable key tombstone for the promised exclusion
window. If even that tombstone expires, the contract must say that the key may be
accepted as new after that point, and the SDK must require an explicit reconciliation
or new-operation decision rather than issuing an automatic retry.

Where a mutable projection uses optimistic concurrency, expose a revision or ETag. The
immutable artifact itself never needs an update revision.

## Search design

### Search is a projection

Artifacts are immutable; search representation is not. Search may be rebuilt when:

- a new search-mapping version is selected;
- text extraction improves;
- tokenization changes;
- a new typed filter is introduced;
- retained payloads are purged;
- ranking rules change.

Search tables therefore use normal upsert/delete permissions available only to the
indexer, not to artifact publishers. The bundled indexer consumes whole publication
commits and checkpoints only after applying every authorized change item. A full scan
remains the rebuild path; the feed is an accelerator, not the sole source of truth.

### Versioned search mappings

Search mappings should be immutable, versioned projection configuration associated
with an exact artifact type version:

```sql
CREATE TABLE artifact_store.artifact_search_mapping_versions (
  id uuid PRIMARY KEY,
  type_version_id uuid NOT NULL
    REFERENCES artifact_store.artifact_type_versions(id) ON DELETE RESTRICT,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  mapping jsonb NOT NULL,
  mapping_sha256 text NOT NULL
    CHECK (mapping_sha256 ~ '^[0-9a-f]{64}$'),
  registered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type_version_id, projection_version),
  UNIQUE (id, type_version_id),
  CHECK (jsonb_typeof(mapping) = 'object')
);
```

`mapping_sha256` is server-computed over the exact type-version identity,
`projection_version`, mapping document, and every tokenizer/parser implementation,
version, and configuration the mapping relies on, using the search-mapping digest
domain. A changed interpretation creates another mapping version even if its JSON
Pointer set is unchanged.
Registration validates the document against one bounded mapping schema, checks pointer
and value-type compatibility with the exact artifact schema, and restricts
tokenizer/parser identifiers to installed allowlisted implementations. A mapping is
configuration, never executable user code.

The active projection generation's catalog selects exactly one mapping for each type
version it indexes. Mapping rows remain immutable; changing a selection requires a new
generation, while generated index rows remain mutable and rebuildable. Changing search
behavior therefore does not require a new artifact schema version and cannot change an
artifact digest.

The control plane should also name each complete search world and its mapping catalog,
for example:

```sql
CREATE TABLE artifact_store.artifact_search_projection_generations (
  id bigint PRIMARY KEY CHECK (id > 0),
  catalog_sha256 text NOT NULL
    CHECK (catalog_sha256 ~ '^[0-9a-f]{64}$'),
  indexer_version text NOT NULL,
  indexed_through_commit_seq bigint NOT NULL CHECK (indexed_through_commit_seq >= 0),
  status text NOT NULL CHECK (status IN ('building', 'active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  CHECK ((status = 'building' AND activated_at IS NULL)
      OR (status IN ('active', 'retired') AND activated_at IS NOT NULL))
);

CREATE UNIQUE INDEX artifact_search_one_active_generation_idx
  ON artifact_store.artifact_search_projection_generations (status)
  WHERE status = 'active';

CREATE TABLE artifact_store.artifact_search_projection_catalog (
  projection_generation bigint NOT NULL
    REFERENCES artifact_store.artifact_search_projection_generations(id)
    ON DELETE CASCADE,
  type_version_id uuid NOT NULL
    REFERENCES artifact_store.artifact_type_versions(id) ON DELETE RESTRICT,
  mapping_version_id uuid NOT NULL,
  PRIMARY KEY (projection_generation, type_version_id),
  UNIQUE (projection_generation, mapping_version_id),
  FOREIGN KEY (mapping_version_id, type_version_id)
    REFERENCES artifact_store.artifact_search_mapping_versions(id, type_version_id)
    ON DELETE RESTRICT
);
```

`catalog_sha256` commits to the indexer/config version and the complete ordered
catalog, using the search-catalog digest domain. The catalog is closed: a type version
not listed in it is intentionally unindexed in that generation, and merely registering
a new mapping does not alter active search behavior.

Catalog rows, `catalog_sha256`, and `indexer_version` are frozen before activation.
Only constrained control functions may activate a building generation, retire the
previous active generation, or advance an active generation's applied checkpoint. The
activation transaction takes a singleton control lock, verifies the expected previous
generation plus the new catalog hash and mapping completeness, and switches both
statuses atomically. An active or retired generation's catalog must never be edited in
place.

A rebuild must never expose a partially rebuilt mixture. The indexer writes an
inactive projection generation (or equivalent shadow partitions), records the exact
mapping catalog used by that generation, verifies it through a declared commit
high-water mark, and atomically activates it. Queries pin one active generation for
their database transaction. Old rows may be removed after activation; cursors bound to
an unavailable generation receive a typed restart response rather than reading a mix
of generations.

Cross-version search is explicit projection work: mappings for compatible type
versions may emit the same namespaced field key after a declared normalization. The
store must not infer compatibility merely because two JSON Pointers have the same
spelling.

### Do not index arbitrary JSON

The indexer must use the selected mapping registered for the artifact's exact type
version. A mapping identifies specific JSON Pointers and says whether each field is:

- full-text searchable;
- an exact keyword;
- filterable as a number;
- filterable as a timestamp;
- filterable as a boolean;
- usable as a display title;
- assigned search weight A, B, C, or D.

This avoids indexing internal IDs, opaque model data, or fields never intended for
global discovery.

A mapping may also explicitly declare that the primary blob is bounded text with a
known encoding, or name a permitted derived text-fragment source. The indexer never
guesses that arbitrary binary content is text and never recursively indexes all
referenced members merely because a manifest names them.

### Full-text fragments

A normalized projection can store several independently attributable text fragments:

```sql
CREATE TABLE artifact_store.artifact_search_fragments (
  projection_generation bigint NOT NULL
    REFERENCES artifact_store.artifact_search_projection_generations(id)
    ON DELETE CASCADE,
  artifact_id uuid NOT NULL
    REFERENCES artifact_store.artifacts(id) ON DELETE CASCADE,
  mapping_version_id uuid NOT NULL,
  authorization_scope_id text NOT NULL,
  fragment_key text NOT NULL,
  source_kind text NOT NULL,
  source_artifact_id uuid NOT NULL
    REFERENCES artifact_store.artifacts(id) ON DELETE RESTRICT,
  source_commit_seq bigint NOT NULL
    REFERENCES artifact_store.publication_commits(commit_seq) ON DELETE RESTRICT,
  text_value text NOT NULL,
  weight "char" NOT NULL CHECK (weight IN ('A', 'B', 'C', 'D')),
  search_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, text_value)
  ) STORED,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (
    projection_generation,
    artifact_id,
    fragment_key,
    source_kind,
    source_artifact_id
  ),
  FOREIGN KEY (projection_generation, mapping_version_id)
    REFERENCES artifact_store.artifact_search_projection_catalog(
      projection_generation,
      mapping_version_id
    ) ON DELETE CASCADE
);

CREATE INDEX artifact_search_fragments_tsv_idx
  ON artifact_store.artifact_search_fragments USING gin(search_tsv);

CREATE INDEX artifact_search_fragments_display_idx
  ON artifact_store.artifact_search_fragments (artifact_id);

CREATE INDEX artifact_search_fragments_source_idx
  ON artifact_store.artifact_search_fragments (source_artifact_id);

CREATE INDEX artifact_search_fragments_scope_idx
  ON artifact_store.artifact_search_fragments (
    projection_generation,
    authorization_scope_id,
    source_commit_seq
  );
```

The indexer has no arbitrary direct-insert grant. Its constrained write path derives
the displayed artifact's exact type and scope, verifies that the generation maps that
type to `mapping_version_id`, and derives `source_commit_seq` from the immutable
source-to-first-commit binding rather than trusting caller-supplied values. For an
intrinsic payload/blob fragment, `source_artifact_id` equals `artifact_id`; for explicit
propagation it names the contributing artifact and version 1 requires both artifacts
to have the same authorization scope. Projection-integrity checks sample all of these
relations. Search provenance never points at an unauthorizable bare blob hash or an
untyped external string.

`simple` is a good multilingual baseline because it does not apply an incorrect
language stemmer. Language-aware search can be added when artifacts carry reliable
language metadata and the indexer owns the `tsvector` rather than relying on one
generated expression. Query parsing must use the same explicit `regconfig` recorded by
the mapping; it must never inherit PostgreSQL's session default.

An OCR artifact can contribute a searchable fragment for itself. A projection may
also attach that fragment to the raw ancestor so a search result opens the original
PDF while reporting that the match came from OCR artifact A3. Such propagation must
not widen visibility. Version 1 should propagate only when the displayed artifact and
contributing source have the same authorization scope; a future policy-aware
intersection scope can relax that without changing artifacts.

### Typed index values

Full text is insufficient for dates, amounts, postal codes, and exact identifiers. A
generic projection can store one typed value per field and ordinal:

```text
artifact_id
authorization_scope_id
projection_generation
mapping_version_id
field_key
ordinal
text_value | numeric_value | timestamp_value | boolean_value | json_value
source_artifact_id
source_commit_seq
```

The table should enforce exactly one populated typed column and have conventional
B-tree indexes over `(field_key, value)` for each type. Multi-valued schema fields use
separate ordinals. `field_key` must be globally namespaced or paired with the mapping
ID/type version; otherwise unrelated fields named `status`, `date`, or `amount` become
silently comparable. Units and currency are part of the mapping contract and query
filter, not assumptions attached to a bare numeric column. Typed rows use the same
constrained generation, exact-type, scope, source-artifact, and source-commit bindings
as text fragments.

### Vector retrieval is also a projection

If semantic retrieval becomes necessary, add a projection keyed by artifact,
fragment, embedding-model version, mapping version, and projection generation, using
`pgvector` or a separate index service only after measuring the PostgreSQL workload.
It follows the same atomic activation, source-commit high-water, authorization, and
restartable-cursor rules as textual search. Re-embedding must not change the source
artifact. An approximate-nearest-neighbor backend is acceptable only if it can apply
authorization and `H` before candidate ranking (or perform an equivalent bounded exact
rerank) and pin a deterministic candidate snapshot for pagination; post-filtering an
unstable ANN result does not satisfy the search contract.

An embedding is a normal artifact only when it is intentionally exchanged, audited,
or consumed as durable input by later procedures. An embedding maintained solely to
accelerate retrieval is projection state. This distinction prevents every index
rebuild from expanding the immutable provenance graph.

### Query behavior

The search API should support:

- exact artifact ID and tagged blob digest lookup;
- full-text query using mapping-matched `websearch_to_tsquery(regconfig, query)`;
- artifact type and version filters;
- direct-root, captured-root, or derived filter based on producing-run/input structure;
- created-at range;
- producing procedure filter;
- ancestor or descendant constraints;
- typed field filters;
- decision and evaluation facets;
- preferred-only or all-candidate selection where a domain projection defines it;
- stable cursor pagination.

Search results should return the artifact type, title, safe snippet, matched fragment
or field, match source, and enough lineage summary for the UI to explain why the result
was found.

A search cursor is authenticated, sealed where its rank/identity fields are sensitive,
and bound to the consumer's authorization context, store recovery epoch, projection
generation/catalog digest, normalized query and filters, rank sort key, artifact-ID
tie-breaker, and an artifact publication high-water cursor `H`. On the first page,
choose `H` no later than the active indexer's fully applied commit checkpoint; later
pages exclude artifacts first published after `H` and propagated/index contributions
whose source was first published after `H`. Index rows therefore carry or can join an
immutable source-to-first-commit binding. Return a typed restart response rather than
silently mixing result worlds if authorization changes incompatibly, the recovery
epoch changes, a rebuild replaces the pinned generation, a preference/current revision
used by the query changes, or that generation is no longer retained.
Purges and current authorization still take effect immediately even for a cursor
pinned to `H`; snapshot pagination never revives erased or newly forbidden content.

Authorization predicates must be applied before ranking, snippets, facets, counts, or
pagination. Post-filtering a larger result set leaks existence and produces incorrect
pages. The same rule applies to typed values, vector retrieval, preferred/current
projections, and any cross-artifact text propagation.

The current inbox's application-memory filtering should not be carried forward. The
database should perform candidate selection, filters, facets, ranking, and pagination.

## Retrieval and lineage API

A focused initial HTTP API can expose:

### Types

- `GET /v1/artifact-types`
- `GET /v1/artifact-types/{typeKey}/versions/{version}`

Schema registration should initially be an administrative operation rather than a
general end-user route.

### Raw upload and blob staging

- `POST /v1/artifacts/uploads`
- `POST /v1/blob-uploads`

Both paths use multipart upload with:

- `Idempotency-Key`;
- strict total and per-file limits;
- filename length validation;
- media-type sniffing;
- bounded streaming or secure temporary-file spooling;
- SHA-256 calculation while receiving bytes.

`/v1/artifacts/uploads` is the simple atomic path: receive bytes and publish one
`core.file` occurrence, returning its artifact ID/digest, blob digest, commit cursor,
and idempotency horizon. `/v1/blob-uploads` is an authenticated operational staging
path for a later structured/multi-output publication. It returns an opaque,
principal-bound upload handle plus its expiry, the verified digest and size, and the
upload request's idempotency horizon; it creates no artifact and no publication commit.
That retry horizon must not outlive the returned handle's usable lifetime unless the
API explicitly defines an authorized handle-refresh response. `/v1/publications`
accepts that handle (or inline bytes/authorized source-artifact reuse), never a bare
global blob hash as reuse authority. Staged bytes are quota-charged and
garbage-collected under the upload-claim rules described above.

The current implementation calls `file.arrayBuffer()` and buffers a complete file.
That is acceptable only under a deliberately low limit. A general upload endpoint
should not multiply a 100 MiB upload across browser, framework, Node buffer, driver,
and PostgreSQL serialization memory.

### Structured publication

- `POST /v1/publications`
- `POST /v1/artifacts`
- `POST /v1/production-runs/publish`

`/v1/publications` is the canonical batch command described above. The other two are
developer-friendly conveniences that compile to it: one creates a standalone/root
artifact, and one creates derived outputs with lineage. All return resolved artifact
IDs, digests, an optional run ID/digest, the same commit cursor shape, and the
idempotency-recovery horizon.

### Retrieval

- `GET /v1/artifacts/{artifactId}`
- `GET /v1/artifacts/{artifactId}/content`
- `GET /v1/artifacts/{artifactId}/ancestors`
- `GET /v1/artifacts/{artifactId}/descendants`
- `GET /v1/artifacts/{artifactId}/references`
- `GET /v1/artifacts/{artifactId}/referrers`
- `GET /v1/artifacts/{artifactId}/evidence`
- `GET /v1/artifacts/{artifactId}/closure`
- `GET /v1/production-runs/{runId}`

Content retrieval should support HTTP range requests for blobs, safe
`Content-Disposition`, `X-Content-Type-Options: nosniff`, same-origin restrictions,
and private/no-store caching until an explicit secure client cache policy exists.
Protected metadata, graph, search/snippet, and change-feed responses use the same
private/no-store default.

Authorization is evaluated first. An authorized caller should receive `410 Gone` for a
purged artifact with only policy-approved opaque metadata; an inaccessible artifact
should follow one consistent non-disclosure policy—commonly `404`. Graph endpoints
must not reveal hidden node counts, IDs, types, or connecting edges. `closure` names
which graphs to follow and is bounded; it is useful for export planning but is not an
authorization bypass.

### Search

- `POST /v1/artifacts/search`

Use a read-only JSON request body so sensitive search terms, filters, and cursor tokens
do not enter URLs by default. Use cursor pagination rather than offset pagination. Cap
query length, filter count, page size, lineage depth, and total query time.

### Change feed

- `GET /v1/changes?after={opaqueCursor}&limit={n}`
- `GET /v1/artifacts?publishedThrough={opaqueCursor}&after={artifactCursor}`

The response contains whole authorized commits, a next cursor, a high-water cursor,
the minimum retained cursor, and a `hasMore` indicator. A consumer must never receive
half of an atomic publication. Scope filtering and opaque cursors must not expose the
existence or item count of hidden commits; the server scans past them internally rather
than returning one observable empty page per hidden commit. An expired cursor gets a
distinct rescan response rather than an empty page. The bounded artifact scan
participates in the high-water bootstrap protocol; it is not a second ad hoc timestamp
feed. Its pagination cursor is authenticated and sealed and binds the consumer
authorization context, recovery epoch, high-water `H`, scan filters, and last artifact
key.

## Boundary with asynchronous execution

Scheduling, retries, leases, progress, and worker recovery are outside the artifact
store. The store accepts direct atomic publications from authenticated producers.
Schedulers and enrichers discover committed artifacts through the change feed or an
application-owned query; the kernel does not invoke them directly.

Where it is integrated with an asynchronous executor, publication may also require a
current attempt-ownership token so a stale worker cannot publish after its work has
been reassigned. That check belongs at the publication boundary; job state must not be
embedded in artifact rows. A failed attempt is not an artifact unless the domain
deliberately publishes it as one.

## Immutability enforcement

Immutability must be enforced below the repository layer.

Recommended database roles:

- migration owner: owns schema and tables;
- artifact runtime: executes constrained authorization-aware read and publication
  functions, but has no raw protected-table access or general update/delete rights;
- indexer: reads source content only through its declared stable service scope and
  writes projections and advances generation control only through constrained
  functions, with no general artifact mutation rights;
- retention operator: can execute audited purge functions but has no ordinary runtime
  credential;
- backup operator: read-only access required for backup tooling.

For the immutable tables, combine revoked `UPDATE`/`DELETE` grants with defensive
triggers. The triggers should reject modification unless a tightly controlled
transaction-local maintenance flag is set by a security-definer retention function.

Immutable tables include:

- artifact type versions;
- blobs;
- artifact envelopes and payloads;
- artifact references;
- production runs;
- run inputs and outputs;
- field-level evidence links;
- publication commits and change items;
- artifact tombstones and purge audit facts;
- search mapping versions;
- audit events.

Mutable tables include:

- upload sessions;
- idempotency records during their retention window;
- building-generation search catalogs, which are frozen on activation;
- search projection generation, activation, and checkpoint control state;
- search and typed index projections;
- preference/current views;
- tombstone processing state.

The audit log and publication feed have different purposes. Publication commits list
successful visible state changes for integration. Security audit events may also record
denied operations, privileged reads, schema administration, retention activity, and
authentication context under a stricter access/retention policy. Audit events are
append-only but are not artifacts, run inputs, or a trigger feed for domain work.

Security-definer functions are privileged code: own them with a non-login role, pin a
safe `search_path`, schema-qualify every object, revoke default `PUBLIC` execution, and
expose only the narrow operations each runtime role needs. A transaction-local
maintenance or authorization value supplied by an untrusted SQL caller is not a
security boundary by itself.

## Authorization boundary

The kernel should not invent a universal policy language, but it must make external
authorization impossible to forget. A practical first contract is:

1. Authentication yields the real publisher principal and claims; request bodies
   cannot override it.
2. Each artifact has one opaque `authorization_scope_id`. The policy service controls
   mutable principal/group membership in scopes.
3. The server resolves allowed scopes and injects them into every direct read, blob
   read, search, reference, lineage, evidence, export, and change-feed query before any
   content or aggregate is computed.
4. Publication validates that the publisher may read all inputs/targets and write the
   requested output scope. A result may not be placed in a broader scope than its
   inputs unless a specific declassification policy authorizes that transition.
5. Run receipts and commits are returned only under a policy that does not reveal
   hidden input/output identities. Audit records use a separate privileged policy.

The database boundary must fail closed even when an application query forgets a
predicate. Protected content and projection tables should be exposed to the runtime
only through constrained functions/security-barrier views or PostgreSQL row-level
security populated from a trusted, transaction-scoped authorization context. Missing,
malformed, or unresolved context yields no protected rows and never falls back to a
default scope. If RLS is used, protected tables use `FORCE ROW LEVEL SECURITY` where
appropriate and runtime roles do not own or bypass the policy; table owners and
`BYPASSRLS` roles remain migration/maintenance-only. Graph traversal, search, facets,
counts, blob resolution, exports, and feed filtering must all enter through this same
enforced boundary rather than hand-written optional `WHERE` clauses.

A single-user or single-team deployment can map everything to `default`; retaining the
field and query discipline avoids an invasive redesign later. If one scalar scope
cannot express a future policy, replace the resolver and projection join—not artifact
immutability—with a dedicated mutable grant table. Field-level redaction, cryptographic
key management, legal holds, and policy administration remain separate capabilities.

If one computation produces outputs with different sensitivity, publish them in the
stricter scope or split them into separate publications. A sanitized output intended
for broader access should be produced by an explicit declassification run and policy
decision, not smuggled into a mixed-scope atomic batch.

Authorization is also required for *writing a reference*. Otherwise a user could
probe IDs or publish a visible manifest that discloses the existence of a restricted
target. Likewise, a seemingly harmless count of descendants or search facets can be a
data leak.

Scope-membership changes are policy events, not artifact commits. Interactive queries
use current authorization immediately. A long-lived projector should run under a
stable service scope or rescan when its grants change; feed cursors are bound to that
authorization context, and advancing an old filtered cursor does not retroactively
deliver artifacts that only became visible later.

## Retention, erasure, and garbage collection

The practical definition should be:

> An artifact is immutable while retained. Erasure is an exceptional privileged
> lifecycle operation, never an artifact update.

### Tombstones

Use a separate `artifact_tombstones` table rather than setting `purged_at` on the
artifact:

```text
artifact_id
purged_at
reason_code
requested_by
retention_policy
details
```

A purge transaction should:

1. create the tombstone and audit record;
2. remove every text, typed, and vector projection row where the artifact is either the
   displayed result or a contributing source, across all retained generations;
3. remove the artifact payload and policy-forbidden outgoing references owned by the
   purged artifact;
4. leave the opaque artifact envelope and permitted graph edges;
5. append an `artifact/purged` publication change;
6. schedule unreferenced blob garbage collection.

Whether artifact digests, type IDs, references, input/evidence locators, or graph edges
may remain is a legal and product-policy decision. Incoming references and run/evidence
rows are immutable content owned by other retained facts; they must not be silently
edited. Policy must either permit their opaque remainder or purge/tombstone the owning
artifacts and receipts too. Locators can themselves contain personal text and must not
automatically survive payload erasure. Active legal holds must be checked by the
privileged purge function, not merely by a retention UI.

The suggested `artifacts` table assumes that its minimum envelope—including type,
digest, attribution, and authorization-scope fields—may legally remain. That is a
precondition, not a conclusion. If policy may require erasing any of those fields,
change the schema before the first migration: split erasable attribution into a
one-to-one retained-content table, define a policy-approved non-identifying tombstone
partition, or implement a full hard-delete closure that removes every dependent
reference/run/evidence record and any policy-forbidden commit/audit identifiers under
an external privileged audit. Do not replace erased fields with invented defaults
while continuing to present the old digest or receipt as verifiable. The product must
not claim legal erasure until one of these concrete paths matches its jurisdiction and
data contract.

If a hard-delete policy removes or redacts a previously exposed publication commit or
change item, it has rewritten feed history. The operation must run under a writer fence,
establish a new store recovery epoch, invalidate affected projections, and force feed
consumers to rescan; an old cursor must never continue across the rewritten history.

Once purge removes any payload, blob binding, reference, locator, or receipt field
that formed a digest preimage, the retained digest is only a historical claimed
identifier; the API and integrity tooling must not report that digest as independently
reverified from the remaining rows. A policy that forbids retaining even that claim
requires the hard-delete closure. Idempotency responses, staging/import claims,
tombstones, commit items, and audit rows can also retain identifying IDs and need the
same explicit policy analysis.

The purge transaction provides immediate logical inaccessibility, not a promise that
old bytes have already been overwritten on storage media. The erasure contract must
also cover PostgreSQL MVCC remnants, WAL archives, replicas, temporary spools,
external projections/caches, and backups through bounded retention, compaction/vacuum
procedures, or cryptographic key destruction appropriate to the deployment.

A digest is not anonymization: hashes of low-entropy values can be guessed, and target
IDs or graph shape can remain identifying. “Opaque envelope” is a policy conclusion,
not a purely technical property.

### Descendant artifacts

Purging a source artifact does not automatically purge derived artifacts containing
the same personal information. Nor does it erase manifests or assertions that
reference the source. The retention workflow must calculate production descendants
and structural referrers separately and apply an explicit policy:

- purge only the requested node;
- purge all descendants;
- inspect descendants by type;
- inspect structural referrers and their locators/payload labels;
- retain aggregated/non-personal descendants;
- block purge until reviewed.

The store should expose the graph; policy decides the traversal.

### Blob garbage collection

A blob is eligible for deletion only when no retained `artifact_payloads` row and no
unexpired staged-upload/import claim references it. Eligibility and deletion must be
rechecked in the same transaction or under an equivalent lock. Garbage collection
applies a grace period after the final claim expires so a blob uploaded just before a
failed or concurrent publication is not raced by cleanup.

Shared content deduplication means purging one artifact occurrence must not delete
bytes still referenced by another retained artifact.

## Backup, restore, and integrity

Keeping metadata and blob bytes in the same customer PostgreSQL database gives one
recoverable unit and avoids database/object-store skew.

Backups must come from one transactionally consistent database snapshot, be encrypted
and integrity-authenticated, use credentials separate from the application runtime,
and be subject to the same customer isolation and retention policy as live content.
A checksum detects accidental damage but is not authenticity or confidentiality.
Recovery planning also covers the independently owned authorization service and the
keys/configuration needed to validate or rotate sealed cursors; restoring artifact
rows without their policy authority must fail closed.

A backup snapshot is not a zero-data-loss promise. The deployment declares its RPO and
RTO and uses WAL archiving, replication, and writer fencing appropriate to them. If a
restore or failover can diverge from a timeline on which commits were already
acknowledged, recovery must fence the old writer and assign a new durable store recovery
epoch before serving. Cursors from the previous epoch receive a typed rescan response;
commit numbers must never be silently reused as if they named the old history.
Idempotency and external-action guarantees survive such a recovery only if their
records are inside the achieved RPO (or synchronously protected in another declared
failure domain). Otherwise the service enters an explicit reconciliation mode before
accepting possibly duplicate publication or action work.

Erasure policy includes backup copies. Define backup expiry or cryptographic-erasure
windows, and after restoring an older snapshot replay the retained purge/tombstone
ledger (or otherwise reconcile deletions) before the database can serve reads. A live
purge followed by an unrestricted restore must not resurrect content as accessible
truth. That ledger must be protected in a failure domain/RPO that is not rolled back
with the restored image, or be reconstructible from an authoritative retention system;
if neither is available, recovery remains fail-closed.

Backup manifests should record at least:

- schema migration version and store recovery epoch;
- artifact type, search mapping, artifact, retained payload, reference, blob, run,
  evidence, publication commit, unexpired idempotency, unexpired staging/import claim,
  active search-generation, and tombstone counts;
- total logical and unique blob bytes;
- PostgreSQL and backup-tool versions;
- dump size and SHA-256;
- creation time and source database identity.

Restore verification should check:

- migration ledger compatibility;
- every type-definition digest and registered schema reference;
- every retained payload's type version;
- every blob reference;
- blob byte length constraints;
- every structural reference target, type contract, and structural-DAG invariant;
- run input/output references;
- every derived artifact has exactly one producer;
- no run consumes one of its own outputs;
- every evidence link connects an output to a declared input of its producing run;
- sampled retained artifact and production-run digests whose complete canonical
  preimages remain available;
- commit cursor ordering and change-item integrity;
- every unexpired successful idempotency response resolves to its retained resources
  and original commit;
- every unexpired staging/import claim resolves to the declared blob bytes, digest, and
  size;
- persisted commit-allocator high-water not lower than the greatest retained
  `commit_seq`;
- allocator and backup-manifest recovery epochs agree before service, unless the
  documented divergent-recovery procedure has deliberately established a new epoch;
- every artifact envelope has exactly one payload or tombstone;
- at most one search generation is active, and its catalog digest, mapping/type
  bindings, source-commit bindings, and checkpoint are valid; otherwise search remains
  unavailable until a rebuilt generation is activated.

Authorization-scope IDs are backed up with artifacts, but mutable principal/group
membership may live in another service and needs its own recovery plan. After restore,
an unresolved scope fails closed; it must never fall back to `default` visibility.

An optional background integrity scrub can rehash blobs and sample artifact canonical
digests. Rehashing every blob on every read would be unnecessarily expensive.
Periodic restore drills must exercise the same manifest checks against a fresh
database; producing a backup file without a tested restore path is not recovery
evidence.

Artifact export should include exact type definitions, authorization-approved
structural references, payloads, blobs, production receipts, lineage, evidence
mappings, and a checksum manifest. Search mappings may be included for convenience,
but export must not depend on the current search projection to be complete. The export
format must say whether imports preserve artifact/run IDs and occurrence attribution.
Any rewrite recomputes every affected occurrence-bound input hash, run digest, and
signature. Content-bound artifact digests remain stable when rewritten references
resolve to the same target digests; silently mixing identity- and content-bound
verification modes breaks verifiability.

An import never trusts a foreign publisher principal or authorization-scope ID as a
local grant. The local importer is authenticated, scope mapping is explicit and fails
closed, and the package's origin identities remain provenance in an import receipt or
verified manifest. General cross-customer federation remains out of scope.

## Capacity and performance boundaries

The first version should define explicit limits rather than discovering them in
production:

- maximum blob size;
- maximum JSON payload size;
- maximum parameters, implementation, receipt, and evidence bundle sizes;
- maximum identifier, type/procedure key, actor/principal, role, and metadata-string
  lengths;
- maximum artifacts per atomic publication;
- maximum references per artifact and same-publication reference depth;
- maximum input links per run;
- maximum locator/reference-attribute size and nesting;
- maximum lineage/reference traversal depth and nodes;
- maximum change-feed page size and retained cursor age;
- maximum search query length and filter count;
- per-request and per-job timeouts;
- total unique blob quota;
- total logical artifact quota.

Large textual content such as complete OCR output should usually be stored as a text
blob with a small JSON payload, not as a multi-megabyte JSON string. The search
projection can contain bounded searchable text derived from that blob.

High-volume streams and tables should be chunked into bounded immutable segment blobs
with typed manifests and checkpoints. A run can consume the manifest and use a
`reference-path` or range locator for the relevant subset. This avoids both one node
per row and unbounded run-input lists.

The commit-cursor allocator intentionally serializes a tiny tail of each publication.
Load-test its lock wait and publication throughput. If it becomes material, first batch
small facts into sensible artifacts; then replace the allocator only with a protocol
that retains no-skip ordering, rather than weakening the feed contract accidentally.

The HTTP blob API should expose digest, length, media metadata, and range reads without
exposing PostgreSQL `BYTEA` as a client contract. Version 1 can retain the valuable
single-database recovery property; a measured future need for multi-gigabyte objects
can introduce another durable blob backend without changing artifact or run APIs. An
external URI plus checksum in a JSON payload is acceptable for explicitly external
data, but it does not provide the same retention or recovery guarantee as a retained
blob.

User-visible quotas should normally charge logical referenced bytes per scope or
account. Charging/reporting only unique physical bytes can leak cross-scope
deduplication and makes one user's purge affect another user's apparent quota.

Indexes needed immediately:

- artifact creation time and ID;
- artifact type version and creation time;
- blob reference from retained payloads;
- structural references by source and target artifact;
- run inputs by artifact;
- run outputs by artifact and run;
- evidence by output artifact and supporting input artifact;
- tombstone artifact ID;
- publication commits by cursor;
- search projections by displayed artifact, propagated source, generation/scope, and
  source commit, plus the GIN full-text index;
- typed projection indexes by field and value.

Production-lineage and structural-reference queries should use distinct recursive CTEs
with hard depth/node limits and cycle defense even though publication rules are
intended to keep both graphs acyclic. A combined closure explicitly chooses both edge
kinds and deduplicates nodes.

## Security and content handling

The artifact API stores untrusted bytes and JSON. It should:

- require authenticated TLS on every non-loopback network boundary and encrypt live
  volumes and backups according to the deployment threat model;
- authenticate every non-health request;
- authorize artifact read, upload, publish, schema/mapping registration, search
  activation, and purge separately;
- use an explicit CORS policy and CSRF protection when browser credentials are carried
  by cookies;
- validate filenames and never interpret them as paths;
- detect media type from bytes while preserving the declared value as provenance;
- serve unknown content as attachment;
- use `nosniff` and restrictive content security headers;
- sandbox browser previews;
- apply upload, search, graph, and change-feed rate limits;
- never expose unauthenticated blob-by-hash reads or whether an upload deduplicated
  against a restricted artifact; blob lookup returns only authorized occurrences and
  publication cannot turn a guessed digest into a readable occurrence;
- avoid logging content, extracted values, search terms, prompts, provider responses,
  idempotency keys, upload/cursor bearer tokens, or signed URLs;
- bound decompression, archive expansion, PDF page count, and parser resource use;
- treat embedded/source URIs as untrusted data and never fetch them without a
  separately authorized, SSRF-hardened connector and egress policy;
- treat artifact text as untrusted when passed to models or tools;
- keep migration and retention credentials out of the long-running web process.

Schema validation does not make content safe. Malware scanning may produce a typed
evaluation artifact, while parser isolation and preview sandboxing remain separate
execution concerns.

## Initial built-in artifact types

The first migration should register only types required for one end-to-end flow.

### `core.file@1`

- Blob required.
- References forbidden.
- Payload: original name, declared and detected media type, ingestion source metadata.
- Search: filename and selected source labels.

### `core.manifest@1`

- Blob forbidden.
- Ordered `member` references required; locators may select a region of a member and
  schema-validated attributes may carry a member path, label, split, or mode.
- Payload: purpose, optional display name, format/profile, and bounded schema-declared
  metadata; it is not an arbitrary metadata bag.
- Meaning is only “this frozen value packages these exact members.” Use a domain type
  such as `ml.training-dataset@1` when membership carries stronger semantics.
- Search: display name and declared purpose, never arbitrary member payloads.

### `core.document-classification@1`

- Blob forbidden.
- Structural references forbidden; the classified subject is a production-run input.
- Input role `subject` identifies the classified artifact.
- Payload: raw kind, resolved kind, resolution mode, confidence, and reason. Procedure
  identity belongs to the production run.
- Search: raw/resolved kind and reason where appropriate.

### `ocr.text@1`

- Choose one representation before registration: preferably a required UTF-8 text blob
  for complete OCR, or an optional blob only if version 1 explicitly permits bounded
  inline text. One registered type version cannot have an undecided blob policy.
- Structural references forbidden; the source document/page is a production-run input.
- Payload: language, page count, encoding, and coordinate-space metadata. If the inline
  option is selected, the schema also has a bounded `text` field; the blob-backed form
  does not duplicate complete text in JSON. Page/region locators ground values;
  independently reusable page artifacts may be referenced by a typed manifest instead.
- Search: OCR text fragments and language.

### One vertical domain family

For an initial bookkeeping flow:

- `bookkeeping.invoice-candidate@1`: supplier, invoice number, dates, currency, totals,
  taxes, payment details, and line items, grounded with field evidence;
- `bookkeeping.duplicate-check@1`: domain-specific verdict, matched dimensions, and
  rationale, with both candidates as inputs;
- `bookkeeping.posting-proposal@1`: proposed accounts, tax codes, cost centers, and
  entries;
- `bookkeeping.invoice-review-decision@1`: accept, reject, needs-changes, abstain, or
  escalation outcome and rationale;
- `bookkeeping.posting-request@1`: the exact authorized command intended for the
  accounting system;
- `bookkeeping.posting-receipt@1`: external journal identifier, outcome, timestamps,
  and response digest.

Use a different domain family if another workflow is implemented first. The important
test is one complete chain from raw bytes through grounded agent output and human
decision to an idempotent request/receipt boundary. Together with the core types, this
proves binary storage, structured schema validation, multi-stage derivation, exact
evidence, HITL decisions, full text, and typed filtering.

## Developer-facing contract

The persistence kernel remains small only if the client experience makes the correct
composition easy. A first-party SDK should provide:

- generated/static language types from registered payload and reference schemas;
- the exact canonicalizer and golden vectors for preflight diagnostics, while treating
  the server as authoritative;
- a `PublicationBuilder` with local artifact handles, ordered references, run roles,
  locators, evidence mappings, scope selection, principal-bound blob-upload/reuse
  handles, and idempotency helpers;
- typed retrieval that preserves unknown fields and refuses to silently coerce a newer
  type version into an older application model;
- lineage, reference, evidence, and closure iterators with explicit bounds;
- a projector loop that reads whole commits, applies them idempotently with a consumer
  checkpoint in one application transaction, binds its cursor to the authorization
  context, and supports full rescan;
- publication recovery that retains the exact semantic request through the advertised
  idempotency horizon and refuses automatic ambiguous retries after it expires;
- stable machine-readable error codes for schema failure, stale ownership, idempotency
  conflict, invalid/expired upload authority, missing/purged input, unauthorized scope
  transition, invalid locator, reference cycle, and cursor rescan/restart;
- a local test harness that can validate publications and simulate duplicate feed
  delivery without requiring the workflow engine.

The SDK should expose artifact IDs, digests, exact type versions, and commit cursors
rather than hiding them behind mutable domain objects. Framework adapters can provide
friendlier repositories and UI models on top.

## Recommended implementation slices

### Slice 1: immutable storage

- Create the dedicated database schema and roles.
- Add type versions, blobs, artifact envelopes, payloads, structural references, and
  authorization scopes.
- Implement canonical hashing and pinned JSON Schema validation.
- Implement the atomic publication command, idempotency, bounded raw upload, artifact
  retrieval, and commit feed.
- Enforce runtime immutability.
- Register `core.file@1` and `core.manifest@1`.

Acceptance criteria:

- identical uploads can share one blob but create distinct artifact occurrences;
- a guessed or cross-principal blob digest/handle cannot create a readable occurrence;
- cross-language canonicalization vectors agree and same-looking preimages in different
  digest domains never produce interchangeable identifiers;
- retrying one idempotent request within the advertised horizon returns the same
  artifact;
- after that horizon, the SDK refuses an automatic ambiguous retry or enters the
  declared reconciliation path; the API documents any later key-exclusion/reuse window;
- files and a manifest can publish atomically through local references;
- an in-horizon retry emits no second publication commit;
- a feed consumer cannot skip a concurrently committing lower cursor;
- a feed cursor cannot be transferred across principals or incompatible authorization
  revisions, and a grant or recovery-epoch change requiring rebuild returns the rescan
  contract;
- unauthorized content is filtered before direct read or feed delivery;
- a runtime query without valid database authorization context returns no protected
  content;
- runtime credentials cannot update or delete artifacts or blobs;
- backup and restore recover metadata and exact bytes together.

### Slice 2: derivation graph

- Add production runs, inputs, outputs, versioned locators, and field-level evidence.
- Extend the canonical publication command with atomic multi-output runs.
- Add ancestor, descendant, reference, referrer, and evidence endpoints.
- Register classification and OCR types.

Acceptance criteria:

- a derived artifact has exactly one producing run;
- derived artifacts can be inputs to later runs;
- failed publication exposes no partial outputs;
- exact input roles and source locators survive retrieval;
- a JSON field, text range, or page region can resolve to exact evidence in a declared
  input;
- the production graph cannot be made cyclic through the normal API.

### Slice 3: search

- Add versioned search mappings associated with exact type versions.
- Add full-text fragments and typed index projections.
- Consume publication commits with a rebuildable projector checkpoint.
- Index raw filenames and OCR text.
- Implement SQL filtering, ranking, facets, and cursor pagination.

Acceptance criteria:

- searching OCR text can lead back to the original raw file;
- no undeclared JSON field enters the global index;
- reindexing changes search results without changing artifact digests;
- a rebuild becomes visible only through an atomic projection-generation activation,
  and old cursors restart instead of mixing generations;
- authorization is applied before ranking, snippets, facets, and pagination;
- all query filtering occurs in PostgreSQL.

### Slice 4: review and external-action boundary

- Add review-decision and evaluation artifact types.
- Add the human-correction procedure and domain-specific preference projections.
- Add one domain-specific action-request and action-receipt pair.
- Require decision artifacts as inputs where the domain requires human authorization.

Acceptance criteria:

- accepting an artifact does not mutate it;
- correction preserves both original and corrected artifacts;
- several reviews of the same candidate remain independently attributable;
- an action receipt traces to the exact approved request and decision artifact;
- retrying an external action uses the request artifact ID as its idempotency key.

### Slice 5: retention

- Add tombstones, legal-hold checks, payload erasure, descendant/referrer analysis,
  purge change commits, and blob GC.
- Add audit and integrity verification.

Acceptance criteria:

- an authorized read of a purged artifact returns `410 Gone` without content;
- purging one occurrence does not remove a shared blob still in use;
- retention analysis distinguishes production descendants from structural referrers;
- search no longer returns purged content.

## Decisions required before the first migration

1. JSON Schema dialect, validator implementation, reference-schema representation,
   exact `$ref` resolution, and dependency-digest closure.
2. Canonical JSON/decimal profile, digest-domain tags, and version-1 cross-language
   test vectors.
3. Maximum blob, JSON, identifier/string, reference, locator, batch, and
   graph-traversal sizes.
4. Inline/staged/reused blob declaration format, principal-bound upload authority,
   staging quota/expiry, and garbage-collection lock protocol.
5. Whether complete OCR text begins as a required text blob or a bounded inline JSON
   field with an optional blob.
6. Initial versioned locator vocabulary and which checks the kernel performs.
7. Same-publication local-reference format and structural-DAG validation algorithm.
8. Idempotency retention/expiry behavior and canonical semantic request-hash format.
9. Commit-cursor allocator, feed retention period, sealed cursor format,
   authorization-context/recovery-epoch binding, and expired/changed-grant rescan
   contract.
10. Whether artifact IDs use UUIDv4 or a time-ordered UUID variant.
11. Authorization-scope resolver, database-enforced read boundary, non-disclosure
    behavior, and explicit declassification rule.
12. Which envelope/attribution, reference, locator, digest, idempotency,
    staging/import-claim, tombstone, commit/audit, and graph fields may remain after
    legal erasure, and whether the schema needs split attribution or a full hard-delete
    closure.
13. Descendant/referrer purge policy and legal-hold enforcement for derived personal
    data.
14. Initial review-decision and evaluation type schemas.
15. Initial typed search field types, atomic projection-generation activation, and
    search-cursor snapshot/restart semantics.
16. Whether schema registration is migration-only or an authenticated administrative
    API.
17. Principal, initiator, executor, device, external-system, and logical-agent
    identifier formats.
18. Procedure key/version convention and minimum reproducibility receipt.
19. Idempotency and crash-recovery contract for the first external action executor.
20. Export/import identity policy for artifacts with references and signatures.
21. Backup encryption/authenticity, RPO/RTO and recovery-epoch protocol,
    authorization-service recovery, cursor-key rotation, and restore-drill policy.

## Final recommendation

Build the kernel around five primitives:

1. immutable type definitions;
2. content-addressed blobs and immutable artifacts with structural references;
3. production runs with ordered inputs, outputs, and generalized evidence locators;
4. atomic idempotent publications with a commit-ordered change cursor;
5. authorization-aware retrieval plus a privileged, explicit retention path.

Ship full-text/typed search and the projector/producer SDK with the kernel, but keep
them dependent on its public contracts rather than entangled with artifact truth.
Typed decisions, corrections, manifests, assertions, snapshots, and request/receipt
pairs are reusable application patterns built from the five primitives, not additional
storage subsystems.

The most important invariants are:

- artifact ID is not blob hash;
- a blob digest identifies bytes but never grants read or reuse authority;
- every store-defined non-blob digest has an explicit versioned domain and canonical
  preimage;
- an artifact payload, blob binding, authorization scope, and structural references
  never change during normal retention;
- every artifact envelope has exactly one retained payload or tombstone;
- a type version never changes;
- structural references are type-validated, immutable, and acyclic;
- every derived artifact has one producing run;
- inputs and outputs publish atomically;
- field evidence only references declared inputs (or members reached through their
  immutable manifests) of the producing run;
- a publication feed item is visible only with its whole commit, in safe cursor order;
- feed and search cursors never cross an incompatible authorization context or store
  recovery epoch;
- retrying an idempotent publication does not create artifacts, runs, or feed commits;
- idempotent recovery is promised only through its published retention horizon;
- candidate, accepted, and externally executed are different facts;
- decisions and durable business outcomes are artifacts, while task state is not;
- authenticated publisher, initiator, and executor remain attributable;
- external effects use an idempotent request/receipt boundary;
- failed attempts are operational history unless the failure is itself a durable
  business outcome;
- correction creates another artifact;
- search is a projection, not truth;
- a search rebuild is activated atomically and never exposes a partial generation;
- authorization is applied before content, graph, snippet, facet, count, or feed
  computation;
- the runtime cannot bypass protected-read authorization by omitting an application
  predicate;
- retention erases through an exceptional audited path;
- integrity tooling never claims to reverify a digest after erasure removed part of
  its canonical preimage;
- bytes and structured state remain one recoverable PostgreSQL unit.

This remains small enough to implement incrementally, while the references, locators,
and commit feed make it useful far beyond document extraction: datasets, build and
release artifacts, scientific observations, media packages, AI evaluations, streaming
segments, audit bundles, generated outputs, and independent enrichment applications
can all be added without redesigning the storage model.
