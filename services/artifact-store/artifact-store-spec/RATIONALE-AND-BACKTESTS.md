# Artifact Store Rationale and Backtests

Status: non-normative design record

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

This document explains why the contracts in [CORE-CONTRACT.md](CORE-CONTRACT.md) and
[SDK-CONTRACT.md](SDK-CONTRACT.md) have their present shape. The repository-specific
source investigations remain available in:

- [avenCEO-tools backtest](ARTIFACT-STORE-REPOSITORY-BACKTEST.md)
- [AvenOS UI backtest](ARTIFACT-STORE-AVENOS-UI-BACKTEST.md)
- [avenAgent backtest](ARTIFACT-STORE-AVENAGENT-BACKTEST.md)

## 1. Result of the final cut

The useful minimum is not a blob bucket and not a workflow database. It is an
immutable typed value/provenance kernel with five recurring domain primitives:

```text
artifact occurrence
structural reference
successful production run
fine-grained evidence
atomic publication
```

Exact blobs and immutable type versions support those primitives, and the ordered
publication feed makes them operationally usable. Removing any one of these pushes a
problem repeated by several applications back into ad hoc application tables:

| Removed capability | Resulting failure |
| --- | --- |
| Occurrence UUID independent from content | Equal arrivals, candidates, or business IDs collapse |
| Exact type version | Historical payload meaning drifts |
| Structural reference | Package/corpus/attachment membership is misrepresented as causation |
| Production run | Exact inputs and alternative successful derivations disappear |
| Evidence | OCR/extraction grounding becomes payload convention |
| Atomic publication | Multi-output visibility and ambiguous retry race |
| Ordered feed | Projectors poll, miss commits, or observe partial fan-out |

Search, job attempts, current/preferred state, cross-scope transfer, legal policy,
holds, purge, generalized procedure registration, and external action execution did
not survive this test as kernel concepts. Each can be built around the retained
identities without changing them.

## 2. Important final contract choices

### 2.1 Semantic intent is not byte-transfer authority

An upload claim expires; a publication identity does not. Persisting the exact wire
request would therefore make a durable outbox depend on transient authority. The SDK
now prepares an immutable `PublicationIntent`, while each retry binds fresh claims or
same-scope source-artifact authority in a `PublicationSubmission`.

This model lets a producer safely retry after claim expiry without permitting a
changed payload, input, actor, or receipt under the same UUID. It also gives recovery a
self-contained value to compare.

### 2.2 Publication identity needs a divergent-restore contract

Changing a feed epoch only protects cursors. It does not stop a database restored to
before acknowledged publication `P` from accepting `P` as new. RPO zero or a second
synchronous ledger would make the first deployment substantially heavier.

The selected contract uses the already-required publisher outbox/acknowledgment
journal. A divergent restore starts write-disabled, reconciles every configured
publisher's acknowledged and still-ambiguous old-epoch intents, restores exact history
where possible, and permanently excludes any known but unrecoverable publication ID.
This does not disguise data loss or uncertainty; it prevents silent identity reuse and
changed-intent takeover.

### 2.3 All structural roles are ordered

An `ordered: false` option would be dishonest if digest calculation still used
ordinals. Version 1 has one rule: structural roles are ordered and contiguous. A domain
set is sorted deterministically by its producer. True unordered canonicalization can
be added only with a concrete need and a new identity rule.

### 2.4 Artifact digest is content-equivalent, not occurrence-bound

The full architecture and current core hash each referenced target's artifact digest,
while the reference row separately retains its exact UUID. This means bundles pointing
to distinct, content-equal file occurrences can have the same `artifactSha256` even
though traversal returns different occurrences.

That choice is deliberate: `artifactSha256` answers typed-content equality, never
occurrence identity or authority. Exact membership remains in the immutable envelope.
An export/signature extension may later derive an occurrence-bound envelope digest
without redefining the existing field.

### 2.5 Universal rebuild is publication replay

Scanning artifacts through a high-water mark is excellent for search, but it cannot
reconstruct historical publisher actors, run implementation receipts, evidence, or
atomic fan-out. The unpruned publication feed from zero, plus bounded exact hydration,
is therefore the universal rebuild path. Artifact scanning remains an explicitly
narrow optimization.

### 2.6 Procedure schemas belong to trusted adapters for now

Without a server procedure registry, the kernel can enforce only canonical bounded
JSON objects and procedure-key namespace authorization. The SDK descriptor owns the
three actual schemas—parameters, implementation, and receipt—plus roles and evidence
conventions. This is an honest trust split and leaves a clean later registry extension.

### 2.7 Graph routes say one thing each

`/outputs` was ambiguous between siblings and downstream derivations. Explicit
producer, sibling, consumer, derivation, reference, and evidence directions prevent
different clients from inventing different meanings. Keyset pagination is necessary
because consumer/referrer/evidence fan-out is unbounded over time.

## 3. avenCEO-tools backtest

### Mapping

| Application concern | Artifact-store representation |
| --- | --- |
| Uploaded document | `core.file` root occurrence |
| Classification/OCR/extraction | Separate successful runs and typed outputs |
| Consistency report | Versioned evaluation artifact |
| Human correction | New correction run/output |
| Accept/reject | Typed decision artifact |
| Generated document | Atomic run outputs, including exact file blob |
| Attachments/package | Structural references only when membership is frozen |
| Search | Application projector |
| `staged_documents`, job status, selected result | Mutable application projection |
| Attempts, leases, retry, failure | Existing job subsystem |

### Integration path

1. Keep the existing tenant database as outer isolation and choose one explicit
   artifact scope for the first vertical.
2. Register `core.file` plus a narrow invoice candidate/evaluation/correction/decision
   family from source-controlled descriptors.
3. Add a trusted client and application outbox. Save the prepared intent and UUID in
   the same transaction that changes a live attempt to `finalizing`.
4. Let workers return/spool proposed bytes to coordinator-owned storage. Workers call
   neither upload nor publication APIs in version 1.
5. The coordinator revalidates the attempt, uploads bytes, binds claims to the saved
   intent, and retries the publication PUT as sole stable publisher.
6. Treat every arrival as an occurrence. Connector identity such as
   `(account,message,part)` maps to one publication UUID for retry; another equal-byte
   arrival gets another UUID.
7. Convert `staged_documents` into a compatibility/workflow projection pointing to
   exact source, selected candidate/evaluation, and decision UUIDs.
8. Append corrections/evaluations instead of overwriting. Update only the mutable
   selected pointer.
9. Build product search from publication projection; bootstrap search with the
   artifact-oriented high-water optimization.
10. Migrate legacy facts honestly: capture retained exact bytes and legacy source IDs,
    but do not invent runs or actors the old database cannot prove.

### First useful vertical

```text
file arrival
  -> root occurrence
  -> coordinator-owned extraction run
  -> evaluation artifact
  -> reviewer correction/decision
  -> inbox and search projections
```

The core covers the vertical. The material application change is coordinator fencing
and append-only result semantics, not another store primitive.

## 4. AvenOS UI backtest

### Mapping

| Mocked UI concern | Representation |
| --- | --- |
| Captured file/message/contact/event | Root or derived domain artifact |
| Intent proposal | Typed proposal artifact |
| Todo/event/draft fan-out | One run publication with atomic outputs |
| Human gate | Persistent application task, then exact decision artifact |
| Payment/send/calendar action | Request artifact plus executor receipt |
| Growing collection | Mutable projection; frozen handover is a manifest artifact |
| Current todo/card/intent | Application state |
| Federated search | AvenOS query composition over projector sources |
| Personal-to-team move | Later privileged copy extension |

### Integration path

1. Put credentials, descriptors, outbox, and publication code in the trusted Tauri
   backend. The webview/model proposes typed values but cannot select publisher, broad
   scope, or arbitrary types.
2. Replace mock IDs with exact returned artifact UUIDs while keeping render kinds as UI
   contracts.
3. Choose personal or team scope at capture. Scope is not mutable visibility metadata.
4. Persist human gates as application tasks bound to exact proposal UUIDs.
5. Confirmation publishes an attributed decision. A narrow executor consumes an exact
   request; remote success/failure is published later as a receipt.
6. Consume each complete publication into UI counts, cards, todos, and search in one
   application transaction.
7. Keep collections mutable until a handover/snapshot is needed, then publish a domain
   manifest referencing exact ordered members.
8. Publish a durable negative result only when its source corpus and completeness are
   explicit.

### First useful vertical

```text
invoice intake -> proposal -> human task -> decision -> payment request -> receipt
```

The store handles immutable values and receipts. Intent state, gates, toasts,
navigation, skill routing, and query federation correctly remain AvenOS concerns.

## 5. avenAgent backtest

### Mapping

| Agent concern | Representation |
| --- | --- |
| Authorized workspace input | Captured exact occurrence before durable use |
| Materialized read-only file | Adapter projection keyed by artifact UUID |
| Session JSONL/tool chatter/SSE | Operational diagnostics outside production receipt |
| Successful extraction/match/evaluation | Compact run and typed outputs |
| `call_key` or model cache | Runtime optimization, not occurrence identity |
| Invoice number/path | Domain fields, never durable artifact identity |
| Consequential shell/network mutation | Typed request and executor receipt |
| Large reconciliation result | Chunks plus final manifest/completeness artifact |

### Integration path

1. Add a trusted materializer that receives authorized artifact UUIDs, verifies and
   writes exact inputs read-only, and owns the path-to-artifact map outside model
   control.
2. Capture a mutable host file before it becomes an input to a durable run. A path and
   size are not provenance.
3. Register a narrow finance family: invoice extraction, transaction parsing, match
   candidate/evaluation, reconciliation report, and corpus completeness.
4. Keep prompts, hidden reasoning, tool traces, caches, interrupted attempts, and raw
   provider dumps out of production runs. Retain only bounded useful receipt fields.
5. Treat the model as a proposer. The adapter allowlists input IDs, scope, procedure,
   types, actor attribution, and final intent.
6. Publish/freeze the input corpus and ingestion gaps before claiming complete or not
   found.
7. Keep derived files as disposable materializations unless independent reuse makes
   them useful artifacts.
8. Put external writes behind request/receipt executors and reconcile ambiguous remote
   outcomes before recording success.

Pure read-only invoice/transaction reconciliation is the safest first vertical. It
exercises exact capture, alternatives, evidence, bounded results, and completeness
without adding external-effect authority.

## 6. Cross-application result

| Pressure | avenCEO-tools | AvenOS | avenAgent | Shared answer |
| --- | --- | --- | --- | --- |
| Equal bytes, distinct arrivals | Yes | Yes | Yes | Blob reuse plus occurrence UUID |
| Atomic fan-out | Generation | Todo/event/draft | Multi-result analysis | One publication/run |
| Alternatives/corrections | Review | Proposals | Candidate matches | New outputs + mutable selection |
| Exact causal inputs | Extraction | Decisions/actions | Analysis | Ordered pre-existing inputs |
| Frozen composition | Attachments | Handover | Corpus/result bundle | Ordered references |
| Fine grounding | OCR/invoice | Proposal support | Extraction/match | Four evidence locators |
| Human gate | Review | Central | Optional approval | App task + decision artifact |
| External effect | Bookkeeping/send | Payment/calendar/send | Shell/network | Request/receipt |
| Mutable live state | Job/review | Intent/todo/card | Session/cache | Application database |
| Search | Product | Federated | Optional | Feed projector |
| Stale attempt | Required | Possible | Async jobs | Coordinator-only publication |
| Cross-scope move | Later | Explicit need | Not initial | Copy/declassification extension |
| Completeness/large output | Batches | Tax/handover | Corpora/reports | Chunks + final manifest |

No common path requires a generic mutable artifact, semantic-edge graph, kernel search,
or server procedure registry.

## 7. Broader scenario pressure tests

### Email and attachments

Capture the message and reusable parts as occurrences. A domain email artifact
structurally composes exact body/attachment occurrences. Classification/threading are
runs; mailbox flags/folders are projections. This validates one-primary-blob and
composition-versus-causality.

### Software builds and releases

Source snapshot and toolchain/config are inputs. A successful build can atomically
publish package, SBOM, and reports; a release artifact references exact chosen members.
Deployment is request/receipt. Portable signing remains additive.

### Dataset and ML workflow

A typed manifest freezes ordered shards/samples. Training consumes that manifest and
configuration, then emits checkpoint, metrics, and model card. Promotion/current model
is a decision/projection. Very large membership needs nested manifests or a later
specialized backend, not a new identity model.

### Scientific analysis

Captured measurements, calibration/protocol versions, tables, plots, and reports map
to artifacts/runs. Evidence grounds reported fields in source bytes/pages. Exact
numbers use strings or scaled integers. Domain formats and long-term preservation are
type/operations concerns.

### Media transcoding

Original media, renditions, subtitles, waveforms, and thumbnails are independently
useful artifacts; a package composes selected outputs. The model passes. Very large
objects and time-range evidence are explicit extensions.

### Mutable documents/configuration

Each committed revision is a new output consuming prior revision/edit instruction.
Branch head, draft presence, and deployed/current revision remain mutable pointers.
The store is an archive, not a collaboration engine.

### External snapshots and actions

Capture a price, balance, webpage, calendar entry, or policy response before it affects
a durable decision. A remote mutation uses request/receipt. The store records what was
observed and requested; it cannot make the remote system transactional.

### Signed records

Stable typed content and graph identity can feed later typed signature/attestation
artifacts. Key management, portable envelopes, and trust policy are extensions.

### Telemetry and high-volume events

One artifact per sample is a poor fit. Publish bounded immutable segments/windows plus
typed manifests and derived summaries. The kernel is not Kafka or a time-series
database.

## 8. Poor-fit cases

Do not stretch the core into:

- frequently updated account/customer records;
- leases, scheduler heartbeats, and progress;
- live chat/UI cursor state;
- high-rate individual telemetry samples;
- arbitrary graph knowledge storage;
- a general event bus; or
- unconstrained multi-gigabyte storage in the first backend.

Purpose-built systems own those workloads and publish only durable captures, results,
decisions, receipts, or packages when useful.

## 9. Final assessment

The backtests did not uncover a missing universal primitive. They did uncover required
integration discipline: durable prepared intents, coordinator-owned publication,
trusted agent/Tauri adapters, exact source capture, closed-corpus completeness,
request/receipt side effects, and application-owned projections.

That is the right outcome for a small versatile kernel. Later search, lifecycle,
cross-scope copy, common schema tooling, procedure registration, signatures, richer
evidence, worker capabilities, and blob backends can be added through the documented
seams without changing what existing artifacts mean.
