# Artifact Store Extension Seams

Status: non-normative compatibility guide

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

This document explains how destination features from
[ARTIFACT-STORE.md](ARTIFACT-STORE.md) can be added without enlarging the version-1
kernel prematurely. It does not imply that an extension exists or that a deployment is
compliant merely because the core has a seam for it.

## 1. Compatibility rules

An extension should preserve these rules unless it deliberately introduces a new major
store contract:

1. Existing artifact UUIDs, publication UUIDs, type versions, digests, references,
   runs, and feed sequences never change meaning.
2. New validation applies to new writes; it does not reinterpret an old immutable
   receipt.
3. New fields that affect identity require a new command/profile or artifact type
   version.
4. Mutable policy and projection state remains outside artifact content.
5. A feature that changes read visibility supplies an ordered synchronization contract
   that cannot race the historical publication feed.
6. A privileged transfer creates explicit new history; it never silently turns an old
   same-scope edge into a cross-scope edge.
7. Derived caches and indexes can be discarded and rebuilt from retained authoritative
   records.

## 2. Content lifecycle and regulated data

### Trigger

Add this extension before accepting data whose policy requires erasure, restriction,
legal holds, controlled retention, or disposition evidence.

### Available seam

The kernel already separates stable `artifact_records` from `artifact_contents`, uses
non-cascading graph relations, records exact blob ownership through content rows, and
snapshots referenced target digests. These are useful mechanics, not a lifecycle
implementation.

### Extension responsibilities

A concrete deployment extension needs at least:

- policy inputs: data class, purpose/legal basis, subject discovery, retention rule,
  jurisdiction, and accountable decision;
- mutable restriction and hold state outside immutable artifact content;
- an authorization layer that consistently hides restricted content;
- dependency/closure planning for payloads, blobs, reference digest snapshots,
  evidence, indexes, exports, logs, and other copies;
- one explicit retained-envelope contract defining which identifiers and provenance
  fields survive disposition;
- physical blob collection only after no retained content row or live claim needs it;
- ordered visibility/removal synchronization for projectors;
- backup and replica reconciliation; and
- auditable requests, decisions, execution results, and failures.

For EU/German data-protection principles, the surrounding product must also implement
data minimization, purpose limitation, discoverability, access/restriction processes,
erasure where applicable, and transparent retention. Whether a value must be erased,
may be retained, or must be retained is a legal/policy decision the generic kernel
cannot infer.

For financial records, append-only occurrences, exact source bytes, provenance,
correction-by-new-record, and restricted mutation provide a strong technical basis for
immutability. Mandatory retention and a later erasure request can conflict; the
deployment policy must resolve the applicable obligation and timing. The core neither
certifies compliance nor permits silent mutation to make the conflict disappear.

### Feed consequence

Historical publications alone are insufficient once content visibility can change.
The extension needs a versioned merged visibility/change ordering, or an equivalent
snapshot protocol. Independently consuming an old publication feed and a separate
unordered removal feed can reintroduce content after deletion and is incorrect.

### Important distinction

`publication_id_exclusions` are disaster-recovery identity guards. They are not
retention tombstones, erasure records, restriction state, or a public lifecycle API.

## 3. Shared search service

### Trigger

Add shared search when application-owned projectors duplicate substantial work or need
consistent cross-application query behavior.

### Version-1 path

A search projector consumes publication replay, hydrates exact artifacts, and indexes
only currently authorized content. It may initially use source-controlled extraction
functions for a small type set.

### Later additions

Runtime search mappings, typed universal values, mapping/catalog digests, active and
building generations, zero-downtime swaps, vector indexes, and ranked snapshot cursors
can be added as projector contracts. None belong in artifact identity.

If a lifecycle extension changes visibility, search consumes its merged ordering and
proves that rebuild and incremental application cannot re-add removed material.

## 4. Cross-scope copy and declassification

### Trigger

Add when a concrete personal-to-team share, import, release, or declassification flow
exists.

### Safe shape

A privileged operation:

1. reads the source under source authority;
2. evaluates an explicit transfer/declassification policy;
3. creates a new occurrence in the target scope;
4. carries only approved source digest/origin receipt fields; and
5. emits target-scope history and synchronization.

Ordinary inputs and structural references remain scope-local. The extension must
define whether source identity is disclosed, pseudonymized, signed, or omitted. Blob
deduplication still grants no target-scope authority.

## 5. Common schema packages

### Trigger

Add when many source-controlled artifact types need shared definitions such as money,
addresses, media metadata, or actor references.

### Safe shape

Version a source package, for example `common.money@2`, and resolve/compile it at build
or registration time into each consumer schema's local `$defs`. Store the fully
self-contained expanded schema and digest.

The kernel remains free of network resolution, mutable dependency graphs, and registry
availability during validation. The compiler records its source package lock data for
reproducibility, but registered expanded bytes remain authoritative.

## 6. Server procedure-contract registry

### Trigger

Add when independent raw producers need runtime discovery or server-side validation
beyond trusted SDK adapters.

### Safe shape

A procedure contract version may specify input/output roles and exact types,
parameter/implementation/receipt schemas, evidence conventions, and publisher
authorization. Registration is immutable and source-controlled or administrative.

It validates only new publications. Existing runs retain their exact recorded
procedure key/version and objects even if a contract is retired. Do not mutate old
receipts or imply that the version-1 kernel validated fields it could not know.

## 7. Caching and reproducibility digests

### Trigger

Add when a real producer wants reusable deterministic results and can define what
implementation/input equivalence means.

### Safe shape

Derive parameter, input-identity, input-content, implementation, or run digests from
retained immutable values. A cache hit remains authorization-aware and publishes a new
occurrence/run receipt when a new occurrence is required; it does not silently return
an artifact from another scope or collapse provenance.

There is no universal cache key because stochastic models, environment state, external
data, and procedure semantics differ.

## 8. Export, import, and portable verification

### Trigger

Add for offline interchange, third-party verification, or long-term signed evidence.

### Safe shape

Build a typed provenance/export statement over selected immutable records. It may
derive:

- a content-equivalence digest using artifact digests;
- an occurrence-bound envelope digest using exact target UUIDs;
- a portable rewritten-identity manifest; and
- signatures plus certificate/transparency metadata.

These are new typed artifacts or export-envelope fields. They do not redefine
`artifactSha256`, internal UUIDs, or old run receipts.

Import creates new local occurrences unless a strictly defined administrative restore
mode is being used. Ordinary import never impersonates disaster recovery.

## 9. Richer evidence

### Trigger

Add only after a real workflow cannot express grounding with artifact root, JSON
pointer, byte range, or page region.

Candidate additions include table cells, time ranges, quote digests, image masks, and
reference paths through large manifests. Each locator kind needs a frozen envelope,
canonicalization, validation limits, authorization behavior, and conformance vectors.

Because evidence is outside `artifactSha256`, a new command/profile version can extend
the vocabulary without changing existing artifact identity.

## 10. Direct-worker uploads and publication guards

### Trigger

Add when coordinator-mediated byte transfer is measurably too expensive or an
independent worker must publish directly.

An upload-only capability should be narrowly bound to:

```text
scope
publication UUID
local key
blob digest and length
expiry
coordinator publisher subject
```

The resulting claim must be consumable by the coordinator and reveal no broader store
authority.

Direct publication additionally needs an atomic guard/precondition that validates
application attempt ownership inside the publication transaction. A lease check before
the transaction is insufficient because reassignment can race publication.

## 11. Alternative blob backend

### Trigger

Add after measured PostgreSQL object size, throughput, backup, or cost limits are
exceeded.

The backend must preserve exact SHA-256/length verification, upload-claim authority,
same-scope artifact-authorized reads, range semantics, deduplication opacity, atomic
publication binding, integrity alarms, and lifecycle-extension hooks. Blob location is
not artifact identity and must not leak into payloads.

## 12. Feed pruning and snapshots

### Trigger

Add when unpruned publication replay becomes operationally unacceptable.

A new feed version needs a durable snapshot/bootstrap boundary that can reconstruct
the same publication/resource semantics, plus cursor expiry and restore behavior. It
must not change old scope-sequence meaning or silently turn the artifact-only scan into
a universal snapshot.

Sealed cursors become useful when cursor contents are externally exposed, filters are
complex, or a future route spans authorization sets. Version 1's single-scope
transparent cursor is not a commitment against that extension.

## 13. General operational audit

Publication history is provenance, not a complete security audit. Add a separate audit
subsystem when requirements cover denied reads, policy changes, administrator actions,
credential use, lifecycle decisions, exports, or recovery operations. Define its own
retention, integrity, access, and redaction model; do not overload artifact payloads or
the publication feed with every operational event.

## 14. Compatibility matrix

| Extension | Reuses | Must add without redefining |
| --- | --- | --- |
| Content lifecycle | Occurrence/content split, restrictive graph, feed epoch | Policy state, dependency closure, merged visibility ordering |
| Shared search | Publication replay, exact types | Mapping/index generations and query API |
| Cross-scope transfer | New occurrence/publication, origin receipt | Privileged policy and target-scope synchronization |
| Common schemas | Local `$defs`, exact type digest | Versioned build-time compiler/lock |
| Procedure registry | Exact procedure key/version | Immutable contracts for new writes |
| Caching | Retained immutable preimages | Procedure-specific equivalence and authorization |
| Export/signing | Exact IDs/digests/graph | Portable envelope and signature policy |
| Richer evidence | Separate evidence relation | New command/profile locator contracts |
| Direct workers | Publication transaction hook | Narrow capabilities and atomic ownership guard |
| Blob backend | Digest/length/read authority | Backend adapter and integrity operations |
| Feed pruning | Scope sequence and epoch | Snapshot, expiry, and new cursor contract |
