# Artifact Store Version-1 Conformance Plan

Status: proposed release-blocking test contract

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

This plan verifies [CORE-CONTRACT.md](CORE-CONTRACT.md),
[SDK-CONTRACT.md](SDK-CONTRACT.md), and
[SECURITY-AND-RECOVERY.md](SECURITY-AND-RECOVERY.md). A test may be split into smaller
cases, but no stated assertion may be weakened or replaced by an application-only
mock.

## 1. Test environments

The release suite MUST exercise:

- the real PostgreSQL schema, constraints, triggers/functions, and runtime roles;
- the real HTTP server with streaming and ranged byte reads;
- the reference SDK and at least one independent implementation of canonical JSON and
  digest-vector verification;
- two scopes and two stable publisher subjects with rotated credentials for one
  subject;
- an application outbox/projector database capable of atomic checkpoints;
- failure injection before and after each publication transaction phase;
- a database snapshot/restore that predates an acknowledged publication; and
- high-fan-out graph fixtures large enough to require several pages.

Tests MUST compare stable codes and exact retained behavior, not incidental SQL error
messages or response timing.

## 2. Golden fixtures

The source tree MUST publish and version:

```text
canonical JSON valid/invalid vectors
schema-profile valid/invalid vectors
type-definition digest preimages
artifact digest preimages, including content-equal target occurrences
publication semantic-digest preimages
locator valid/invalid vectors
OpenAPI/DTO closed-object examples
cursor/order fixtures
```

Each supported SDK language runs the same fixture corpus. A dependency/library upgrade
cannot ship if it changes a frozen version-1 result.

## 3. Identity, bytes, and types

| ID | Required assertion |
| --- | --- |
| C-001 | Publish identical bytes twice with different publication IDs. Physical storage may deduplicate, but two different artifact UUIDs are returned. |
| C-002 | A deliberate new occurrence may have the same `artifactSha256`; no implicit duplicate conflict occurs. |
| C-003 | A bare digest cannot read, probe, bind, or republish bytes through any public/runtime path. |
| C-004 | Wrong upload digest or length produces `UPLOAD_DIGEST_MISMATCH`, no claim, and no readable occurrence. |
| C-005 | Replace an expired claim under a new upload UUID with equal-byte authority. The saved intent and semantic digest remain identical and publication succeeds/replays. |
| C-006 | Bind one claim to two equal declared blobs in one publication. Both succeed; using that consumed claim in a later publication fails. |
| C-007 | Exhaust each live-claim, staged-byte, and concurrency quota. Admission returns `STAGING_QUOTA_EXCEEDED`, reservations recover correctly, and dedup state is not disclosed. |
| C-008 | Re-register an exact type definition successfully; change any definition component under the same key/version and receive conflict. |
| C-009 | Server and SDK identically reject duplicate keys, invalid scalars, unsafe numbers, coercion-dependent data, default-dependent data, remote `$ref`, and recursive `$ref`. |
| C-010 | Decimal/money fixtures retain strings or scaled integers and never pass through binary floating-point canonicalization. |
| C-011 | `core.file@1` retains declared media type. A serving detector or later detector artifact cannot mutate it. |
| C-012 | Reject local keys/roles outside the frozen lexical form; round-trip valid opaque tokens exactly. |

## 4. Publication identity and atomicity

| ID | Required assertion |
| --- | --- |
| C-013 | Disconnect after commit, then replay the same stable publisher/UUID/intent. Original IDs, authoritative request digest, result metadata return and only one feed item exists. |
| C-014 | Under one publication UUID, mutate each semantic field class independently: actor, type, payload, blob declaration, reference, input, run field, output role, or evidence. Every mutation conflicts. |
| C-015 | Rotate credentials while retaining the stable subject and replay successfully. A different subject cannot take over or learn the prior result. |
| C-016 | Change only claim/source authority and retain identity. Mutate the durable intent and have both outbox adapter and server reject reuse. |
| C-017 | Inject validation/database failure at every publication phase. No partial publication, run, artifact, graph, evidence, or feed state becomes visible. |
| C-018 | Every run output has exactly one producer; every root has none; malformed mixed root/run shape is rejected. |
| C-019 | Reject a run input that is a request-local output. Accepted production edges strictly target earlier publications. |
| C-020 | Reject forward/self local references. Accept a topologically ordered DAG without recursive scanning. |
| C-021 | Reject non-contiguous or position-disagreeing reference/input/output/evidence ordinals. All structural reference roles are ordered. |
| C-022 | Reject or hide every cross-scope input, reference, source-byte reuse, batch item, graph traversal, and feed cursor use. |
| C-023 | Artifact digest uses referenced target digest but not target UUID/scope/publication/producer. Reference traversal still returns exact target UUID. |
| C-024 | Evidence connects output JSON pointer to declared-input UTF-8 byte range and page region; reject foreign output, undeclared input, bad pointer/range/page, and non-integer coordinates. |
| C-025 | Kernel accepts/rejects run objects solely by global bounds/namespace policy. Trusted descriptor rejects a procedure-specific unknown/invalid field before submission. |
| C-026 | Through runtime HTTP and SQL roles, attempts to update/delete/truncate immutable state or read global blobs fail. |
| C-027 | A correction run creates a new occurrence and leaves original payload/bytes/digests unchanged. |
| C-028 | Inspect publication insertion under concurrency/fault injection: sequence is non-null on first visibility, never updates, no provisional row exists, and rollback reverts its counter change. |

## 5. Read and pagination contract

| ID | Required assertion |
| --- | --- |
| C-029 | For roots, `producer` is explicitly null and producer collections are empty. For outputs, producer, producer-inputs, and sibling-outputs return exactly the documented run direction. |
| C-030 | `consuming-runs` points forward to consumers; `direct-derivations` returns their outputs with input binding; composition routes never mix with production routes. |
| C-031 | Supporting evidence and evidence usages return opposite, exact directions. An artifact used many times requires keyset pagination. |
| C-032 | Traverse multi-page consuming-run, derivation, referrer, and evidence fixtures while concurrent later publications arrive. Fixed cursor/filter/`throughSequence` scans have no duplicate, omission, offset drift, or unbounded page. |
| C-033 | Alter cursor scope, epoch, direction, or filters and receive deterministic rejection rather than silently changing a scan. |
| C-034 | Lineage enforces direction/edge/depth/node bounds and explicitly marks truncation. |
| C-035 | Content HEAD/range GET authorizes occurrence first, returns exact range metadata and `CONTENT_RANGE_NOT_SATISFIABLE` for invalid bounds, and never exposes a digest-only route. |

The same pagination harness MUST verify `(type_key, version)` ordering and exact
definition immutability for the type collection.

## 6. Feed and projectors

| ID | Required assertion |
| --- | --- |
| C-036 | A feed page never splits a publication. Multi-output fan-out is one membership item. |
| C-037 | At configuration/build time verify the feed-item and single-artifact/run-resource response invariants; write each just-too-large shape and receive `LIMIT_EXCEEDED` before commit. |
| C-038 | Apply publication and checkpoint in one projection transaction; replay the last item and retain identical state. |
| C-039 | Replay from sequence zero and hydrate exact reads to rebuild publication actors, atomic fan-out, run receipts, roles, references, and evidence. Compare to an incrementally maintained projection. |
| C-040 | Take artifact high-water `H`, scan through `H`, then consume feed after `H` while writes race. Artifact-oriented projection misses nothing. |
| C-041 | Projector API/type documentation does not allow artifact bootstrap to claim a complete run/evidence/actor rebuild; the universal fixture fails if someone substitutes it. |
| C-042 | Projector failure cannot mutate or roll back an already committed store publication. |

## 7. Divergent recovery

| ID | Required assertion |
| --- | --- |
| C-043 | Commit publication `P`, persist its acknowledgment, restore the database to before `P`, and enter recovery before credentials/traffic. A new epoch and `reconciling` mode are visible. |
| C-044 | In `reconciling`, ordinary uploads, publications, and type mutations fail through both HTTP and direct runtime database functions. |
| C-045 | Before reconciliation completes, neither original nor another publisher can claim `P` as an apparently new UUID, with equal or changed intent. |
| C-046 | Restore `P` from journal material. Its original publication/run/artifact IDs, semantic digest, sequence, and commit time return; its committed epoch remains historical. |
| C-047 | Repeat with unavailable content. Insert an exclusion; matching replay yields `PUBLICATION_DATA_LOST`, changed reuse conflicts, excluded result UUIDs cannot be allocated, and no fake feed item exists. |
| C-048 | Attempt to restore a downstream publication whose dependency was excluded. Recovery refuses it or excludes the dependent identity; it never creates a dangling historical graph. |
| C-049 | Leave an old-epoch outbox entry pending after an ambiguous disconnect. Recovery restores it only with exact result data or excludes its old UUID; normal publication cannot claim it as new. |
| C-050 | Old feed/list/graph cursors require rebootstrap. Pending old-epoch outboxes stop rather than updating epoch and republishing automatically. |
| C-051 | Discover corrupt stored bytes/invariant. The operation returns `500 INTEGRITY_FAILURE`, the affected serving boundary fences, and subsequent readiness indicates unavailability. |

Omitting a required publisher watermark/range MUST block transition to `normal`.
Supplying all ranges, verifying counters/integrity, and reopening atomically is part of
the same recovery gate. Feed consumers MUST also advance across any resulting sequence
gap without waiting for a fabricated missing item.

## 8. Application backtests

| ID | Required assertion |
| --- | --- |
| C-052 | avenCEO-tools: equal-byte arrivals remain distinct; extraction/evaluation/correction are runs; mutable review status remains outside. |
| C-053 | avenCEO-tools worker: a stale attempt is rejected before outbox save/publication; workers cannot call uploads; coordinator crash in `finalizing` resumes the same intent/UUID. |
| C-054 | AvenOS: todo/event/draft fan-out becomes atomically visible while proposal/gate/current state remains application state. |
| C-055 | AvenOS: decision artifact, external action request, and eventual effect receipt are distinct exact records; ordinary operations cannot move personal-scope history to team scope. |
| C-056 | avenAgent: mutable file paths are captured before use; trusted adapter controls publisher/types; complete/not-found reconciliation requires a frozen corpus/completeness record. |
| C-057 | Large result: chunks may commit independently, but completion is represented only by a final exact manifest/report publication. |
| C-058 | Colliding business identifiers from different sources never collide as occurrence UUIDs or become implicit lookup authority. |

## 9. Extension seams

| ID | Required assertion |
| --- | --- |
| C-059 | Distinct target occurrences with equal typed content yield equal composite artifact digest while retaining different exact reference UUIDs. |
| C-060 | A versioned common-schema compiler emits a self-contained schema; runtime registration needs no external resolution. |
| C-061 | Replace PostgreSQL blob storage behind the same authorized digest/length/range contract without changing artifact/publication identity. |
| C-062 | Simulate missing content through an extension-only test fixture: stable occurrence/reference IDs can remain without cascade. Core reads still treat this as invalid unless the lifecycle extension is installed. |
| C-063 | Add a hypothetical server procedure registry for new writes; old run receipts remain valid and byte-identical. |
| C-064 | Add a hypothetical occurrence-bound export digest without changing `artifactSha256` or any stored reference. |

## 10. Release evidence

A release candidate records:

- server/schema/SDK commit and dependency versions;
- exact profile and built-in type digests;
- results for every `C-*` test by supported database and client language;
- the tested hard-limit configuration;
- database role/privilege inspection output;
- recovery snapshot/journal fixture identifiers; and
- any explicitly unsupported optional extension tests.

No test is waived merely because the corresponding backtested application has not yet
migrated. The kernel contracts are shared behavior, not application feature flags.
