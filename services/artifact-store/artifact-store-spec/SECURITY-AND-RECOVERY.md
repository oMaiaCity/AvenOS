# Artifact Store Security and Recovery Contract

Status: proposed normative deployment contract for version 1

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

This document completes the security and recovery requirements of
[CORE-CONTRACT.md](CORE-CONTRACT.md). A deployment is not conformant merely because its
tables match the core schema; these trust, fencing, and restore properties are part of
the release boundary.

## 1. Trust boundary

One artifact-store database is one customer or comparably strong isolation boundary.
If several customers share a database, tenant keys and tenant-local physical blob
deduplication are additional mandatory controls outside this version's assumptions.

Untrusted browser code, plugins, model output, and general-purpose shell tools do not
receive broad store credentials. A trusted application adapter authenticates the
caller, binds one scope, authorizes type/procedure namespaces, attributes actors,
validates SDK procedure contracts, and submits the final exact intent.

## 2. Stable publisher identity

A publication is permanently bound to a stable security subject, conceptually
`(issuer, subject)`. The identifier MUST NOT be:

- an access token or client secret;
- a certificate serial or key ID;
- a process, pod, deployment, or machine instance; or
- a mutable display name.

Credential rotation preserves idempotent replay only when the replacement credential
authenticates the same subject. Migration to a genuinely new security subject does not
inherit old publication identity unless an explicit administrative identity-mapping
procedure authorizes it.

Logical root, initiator, and executor actors are provenance fields distinct from the
security publisher. The trusted adapter MUST authorize their attribution. A caller
cannot place a `publisher` field in a publication intent.

## 3. Scope isolation

Every protected route names one scope and every transaction binds that scope from
trusted authentication context before data access. Missing, conflicting, or mutable
scope context fails closed.

The database MUST enforce scope locality with composite keys, row-level security,
constrained security-definer functions, or an equally strong mechanism. Application
checks alone are insufficient. Inputs, references, byte-reuse sources, evidence, graph
reads, batches, and feed cursors cannot cross scope.

Unavailable and unauthorized resources normally share `RESOURCE_UNAVAILABLE` so an
identifier probe cannot disclose another scope's existence.

## 4. Blob confidentiality and integrity

A blob digest never grants read, existence probing, or reuse authority. Public reads
begin with an authorized artifact occurrence and resolve its blob only afterward. No
application role receives direct global blob-table access and no public
blob-by-digest route exists.

Physical deduplication MUST be observationally invisible. Upload responses, latency
classes under normal operation, quota accounting, and conflicts MUST NOT disclose that
another principal/scope already has the bytes.

The server streams, hashes, and counts uploads itself. A digest-key collision requires
length and exact-byte verification before reuse. Any disagreement is an integrity
incident, not a second value under one key.

Bytes are served as attachments with `application/octet-stream` by default,
`X-Content-Type-Options: nosniff`, exact length/digest metadata, and sanitized display
names. Inline rendering requires a separate allowlisted serving policy. A declared
media type is provenance content, not execution authority.

## 5. Upload abuse controls

Before receiving a stream, the service atomically reserves capacity against:

- live claims per principal;
- staged bytes per principal;
- staged bytes per scope;
- concurrent uploads per principal; and
- concurrent uploads for the store.

The context endpoint publishes hard bounds. Failure, expiry cleanup, and successful
publication release the appropriate reservation transactionally. Cleanup lag MUST NOT
allow admission above configured capacity. Quota errors MUST NOT disclose physical
deduplication state. Staged-byte quotas count declared logical bytes per live claim,
not incremental physical bytes saved by deduplication.

Rate limits, authentication lockout, network-level request limits, and total database
capacity alarms are operational controls in addition to these kernel upload quotas.

## 6. Database roles and immutability

At minimum, deployments use distinct roles for:

```text
migration and type administration
runtime publication
runtime scoped reads
recovery administration
```

Runtime roles have no direct `UPDATE`, `DELETE`, `TRUNCATE`, schema alteration,
trigger-disable, or blob-table read privileges. Defensive triggers or constrained
functions reject mutation even if grants are accidentally widened. Foreign keys use
`RESTRICT`, never history-destroying cascades.

The canonical publication function is the only runtime path that inserts the mutually
dependent publication/run/artifact/graph rows. It validates cross-row and topological
invariants inside one transaction.

These controls implement useful immutability principles for financial records:
append-only occurrences, exact source bytes, provenance, correction by new record, and
restricted mutation. They are not a certification or a claim that every deployment
meets a jurisdiction-specific bookkeeping rule; access policy, retention periods,
exports, operational audit, and controls around the store remain deployment work.

## 7. Logging and error containment

Normal access logs MUST NOT contain payloads, run parameters/implementation/receipt
values, evidence locator contents, upload claims, credentials, or returned byte
content. Logs MAY include low-sensitivity route templates, stable error codes,
publication UUID, scope-safe correlation identifiers, byte counts, and timing under a
documented policy.

The kernel cannot reliably discover secrets by key-name scanning. Trusted procedure
adapters prevent secrets from entering retained run objects; log redaction is a second
line of defense, not semantic validation.

Errors do not expose SQL, internal paths, hidden content, other scopes, or another
publisher's idempotent result.

## 8. Integrity failure behavior

The operation that discovers corrupt bytes, a digest disagreement, missing core
content, or a broken immutable invariant returns `500 INTEGRITY_FAILURE`. It MUST NOT
return a generic retryable 503 for that operation.

The service then fences the affected scope or whole store, depending on the invariant,
and marks the relevant readiness check unhealthy. Subsequent traffic may receive 503
because the instance is intentionally unavailable. Operators investigate and use the
documented recovery path; automated clients do not retry the corrupt operation in a
tight loop.

## 9. Recovery state

`store_state` contains:

```text
store_epoch UUID
write_mode  normal | reconciling
```

All upload, publication, type-administration, and other ordinary mutation entry points
MUST lock/read this state and reject mutation unless it is `normal`. Only the recovery
role can change the epoch/mode, restore exact identities, or add publication-ID
exclusions.

An ordinary clean restart preserves epoch and mode. A divergent restore—that is, a
database state that may predate an acknowledged write—uses the procedure below.

## 10. Publisher recovery journal

Every authorized publisher that can receive a successful publication response MUST
retain a compact acknowledgment journal for the oldest database restore point the
deployment claims to support. A record contains at least:

```text
stable publisher subject
scope ID and publication UUID
semantic request digest
original committed store epoch, scope sequence, and commit time
returned run UUID, if any
ordered local-key -> artifact UUID/digest/type-definition-digest mapping
exact semantic intent or durable pointer for the supported restoration horizon
durable byte-reacquisition data when full restoration is promised
```

The journal is application-owned. It MAY be part of the application's outbox table,
but `markCommitted` MUST retain the compact acknowledgment rather than simply deleting
all evidence of success. Its durability/failure domain must be chosen so that the
declared restore procedure can actually obtain it.

Every unresolved outbox intent is retained too. The adapter MUST durably mark the
store result before reporting final success to its caller or using returned IDs for a
consequential action. A process crash or disconnect can still leave an entry pending
even though the store committed; recovery therefore treats every pending old-epoch
intent as potentially committed.

The recovery configuration contains the stable set of publishers whose watermarks are
required. Removing a publisher from that set is an explicit administrative operation
with its own reviewed retention consequences, not something inferred because a service
failed to respond.

## 11. Divergent restore procedure

The following procedure is mandatory:

1. Restore the database while application credentials and traffic remain disabled.
2. In one recovery transaction, choose a fresh random store epoch and set mode to
   `reconciling` before exposing even ordinary upload credentials.
3. Apply/verify the expected schema migrations and source-controlled immutable type
   definitions under the recovery role; their exact digests must match the deployment.
4. Verify the restored database's per-scope high-water positions and immutable
   integrity.
5. Ask every configured publisher for authenticated acknowledgment records after the
   applicable restored high-water, every unresolved intent bound to the prior epoch,
   and a completion watermark.
6. Process records in causal dependency and original scope-sequence order.
7. For each acknowledged or ambiguous publication, either restore it exactly or
   permanently exclude its identity as described below.
8. Verify that every required acknowledged/ambiguous ID is present or excluded, that
   all restored graph dependencies exist, and that scope counters are above every
   retained/restored original sequence.
9. Verify every configured publisher watermark. A missing range or publisher blocks
   reopening.
10. Run database/digest integrity checks and atomically set mode to `normal`.

While `reconciling`, ordinary mutation returns
`503 STORE_RECONCILIATION_REQUIRED`. Verified reads MAY be exposed to dedicated
recovery tooling, but normal application read traffic SHOULD remain fenced until the
history decision is complete.

### 11.1 Exact restoration

When intent, bytes, dependencies, and result mapping are available, recovery restores
the publication with its original publication, run, and artifact UUIDs, semantic
digest, publisher, and original scope sequence. It revalidates all types, digests,
scope constraints, inputs, references, and evidence. It does not run producer code or
generate replacement business output.

Any UUID, sequence, content, or dependency collision is an integrity incident and
blocks reopening. A downstream publication can be restored only if every historical
input/reference target it needs is present or can first be restored exactly.

The publication retains its original `committed_store_epoch`; current responses and
feed cursors use the new store epoch. This makes survival across restoration visible
without rewriting history.

### 11.2 Permanent exclusion

If full content cannot be recovered, recovery inserts an immutable
`publication_id_exclusions` record containing only:

- stable publisher subject;
- scope/publication UUID;
- semantic digest;
- original epoch/sequence when known;
- bounded original run/artifact ID mapping when known; and
- reconciliation time/reason code, including acknowledged loss versus ambiguous
  pre-restore intent.

It contains no payload, blob, receipt, evidence, claim, or fabricated feed item. It is
an explicit unavailable historical identity—not restoration—and is a data-loss record
when prior commitment was acknowledged.

An unresolved intent without a recoverable original result takes this conservative
path even if it might never have committed. Once the store reopens, the application
may retry the work under a new publication UUID; it can never reuse the ambiguous old
UUID.

After reopening:

- the original publisher and matching digest receive `410 PUBLICATION_DATA_LOST`
  with a closed recovery reason distinguishing acknowledged loss from an ambiguous
  pre-restore outcome;
- changed intent or publisher cannot claim the UUID and receives
  `409 PUBLICATION_CONFLICT` without prior-content/result details; and
- excluded resource UUIDs cannot be allocated to other records.

If a later acknowledged publication depends on an excluded publication, that later
publication cannot be restored as valid history and must also be excluded unless its
dependency can be exactly recovered.

## 12. Epoch effects

Changing `storeEpoch` invalidates feed/list/graph cursors. They return
`FEED_REBOOTSTRAP_REQUIRED` and consumers replay from sequence zero or use the valid
artifact-oriented bootstrap.

Pending publication outboxes with an old epoch stop automatic retry. They are matched
against restored publications/exclusions during reconciliation. An operator MUST NOT
blindly replace the expected epoch and submit them as new.

Epoch change alone never makes publication-ID reuse safe. The store remains
write-disabled until journal reconciliation is complete.

## 13. Recovery horizon and backups

The deployment defines an oldest supported restore point. Publisher acknowledgment,
full intent, byte reacquisition, database backup/WAL, and external-effect records MUST
have compatible retention.

Once the store certifies that a backup/WAL checkpoint covers a publication, an
application MAY prune full intent/bytes according to policy while retaining the compact
identity record. Restoring earlier than that certified point is unsupported unless the
material needed for exact restoration is still retained.

The core does not claim RPO zero. It claims that a divergent restore cannot silently
reuse acknowledged publication identity or accept a changed command under it.

## 14. External effects

Artifact publication does not prove that an email, payment, calendar mutation, or
other external action happened. Applications retain request IDs, provider receipts,
and their own effect reconciliation records. During divergent recovery, those records
are reconciled before any action is retried. The artifact store records typed requests
and receipts only after their exact facts are known.

## 15. Content lifecycle boundary

Version 1 has no erasure, restriction, hold, or retention-policy operation. This is a
deliberate kernel boundary, not permission to retain regulated data indefinitely.

The occurrence/content split, restrictive graph relations, exact dependency snapshots,
and extension-aware feed boundary make a controlled content-lifecycle extension
possible. A deployment accepting data subject to erasure or mandatory retention MUST
install and validate a concrete lifecycle policy and discovery process before doing so.
That extension is outlined, non-normatively, in
[EXTENSION-SEAMS.md](EXTENSION-SEAMS.md).
