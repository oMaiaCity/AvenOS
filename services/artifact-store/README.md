# Aven Artifact Store

The Artifact Store retains exact documents, derived facts and their evidence so a
person can inspect what an Actor used and safely retry interrupted work. This package
owns immutable contracts, validation, PostgreSQL persistence and the HTTP server. It
does not decode documents, run Actors or choose models.

The deployed customer-data plane routes authenticated access to the selected customer
database. The facade validates client procedures; the remote Actor Runner publishes
through its tenant-scoped route. A caller cannot choose a physical database or publisher.
See the [customer-data boundary](../../docs/customer-database-platform.md) and
[implemented system map](../../docs/customer-database-system-map.md).

## Committed replay and typed retrieval

Publication is atomic and idempotent by publication ID. The scoped publication read
returns its committed receipt and production metadata; an absent publication returns
`404 RESOURCE_UNAVAILABLE`, while authorization and transport failures remain errors.
The TypeScript client rehydrates output envelopes and exact blob bytes for replay.
This is a successful-production record, not a mutable attempt journal or work lease.
Replayable inspection uses `core.file-inspection@2`; occurrence-bound matching uses
`reconciliation.match-candidate@2`. Earlier registered definitions remain unchanged,
so introducing these contracts does not rewrite immutable schema identities.

The scoped artifact collection query selects a type, publication watermark and UUID
cursor, with at most 128 results per page. The first page captures the watermark; later
pages and related type queries reuse it so new publications cannot alter that snapshot.
The query returns immutable envelopes and a continuation cursor, not a claim that all
real-world bank transactions are present. Its current snapshot token has no restore
epoch; clients must restart their query/review session after environment restore.

These reads use the same scoped access boundary as existing artifact reads. Derived
invoice/transaction candidates and human relationship decisions preserve exact input
roles and ordinals. They do not create a bank allocation ledger in this kernel.

## Contracts and verification

Rust 1.93.1 and PostgreSQL 17 are the tested toolchain. The
[normative contracts](artifact-store-spec/README.md) define publication and evidence.
The [build and test handbook](../../docs/operations/build-and-test.md) owns verification
commands and the complete native/customer-database E2E gate; the
[local stack guide](../../docs/operations/local-stack.md) owns local operation.
