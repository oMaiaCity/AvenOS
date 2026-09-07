# Artifact Store SDK Contract

Status: proposed normative first-party SDK contract

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

This document defines the client-side contract for
[CORE-CONTRACT.md](CORE-CONTRACT.md). It does not replace the wire contract and does
not grant an SDK implementation authority that a raw HTTP caller lacks.

## 1. Package boundary

The first release separates four concerns:

```text
artifact-store-client      wire DTOs, prepared intents, upload/read/publish operations
artifact-store-schema      type/procedure descriptors, validation, conformance vectors
artifact-store-projector   feed replay, artifact bootstrap, checkpoint helpers
artifact-store-recipes     optional domain-neutral workflow conveniences
```

The first three are part of the supported release. The recipes package is optional.
`correct`, `decide`, and external action request/receipt helpers do not belong in the
base client because their artifact type families are application policy.

An OpenAPI description, JSON schemas, canonicalization vectors, and digest preimage
vectors are authoritative shared artifacts. The reference builder may initially be
TypeScript, but Rust/Tauri and JVM clients MUST emit and consume the same DTOs and
semantics.

## 2. Immutable preparation model

The base abstraction is a semantic intent, not a mutable artifact object:

```ts
interface PreparedPublication {
  readonly intent: PublicationIntent;
  readonly semanticSha256: string;
  readonly expectedStoreEpoch: string;
  readonly requiredBlobs: readonly RequiredBlob[];
}

interface RequiredBlob {
  readonly localKey: string;
  readonly sha256: string;
  readonly length: number;
  readonly reacquisitionRef?: unknown;
}

interface PublicationOutbox {
  save(publication: PreparedPublication): Promise<void>;
  markCommitted(
    publicationId: string,
    result: PublicationResult,
  ): Promise<void>;
}
```

`prepare` receives the expected stable publisher subject from trusted adapter
configuration so its diagnostic preimage matches the server's semantic envelope. A
model-supplied value is never accepted for this purpose. `semanticSha256` remains
diagnostic; the server's digest is authoritative. `expectedStoreEpoch` is saved with
the outbox but excluded from semantic identity.
`reacquisitionRef` is owned and typed by the application adapter. It might identify a
local spool, object-store object, or reproducible byte source. It is not serialized to
the artifact store and MUST NOT be an expiring upload claim. When present in the
outbox, it MUST be a durable serializable application key—not an open stream, process
pointer, or ephemeral pathname whose lifecycle is shorter than recovery support.

The SDK MUST NOT claim that it “persists” a publication UUID or outbox entry by itself.
The caller creates the UUID and supplies an outbox implemented on the application's
durable transaction boundary. The base package MUST NOT embed Prisma, Entity
Framework, a filesystem layout, or a queue product.

An outbox adapter MUST make `save` idempotent for the same publication ID and exact
prepared value and must conflict on mutation. `markCommitted` is likewise idempotent
for the same authoritative result and treats a different result under that UUID as an
integrity incident.

## 3. Required lifecycle

An integration performs these steps:

1. Generate a publication UUID before any artifact-store call.
2. Build and freeze one exact `PublicationIntent`.
3. Call `prepare`, producing an immutable intent, diagnostic digest, and required blob
   declarations.
4. Commit `PublicationOutbox.save(prepared)` in the application transaction that makes
   the work ready to finalize.
5. Reacquire the declared bytes and obtain current upload claims, or obtain authorized
   same-scope source-artifact capabilities.
6. Bind those transient values into `PublicationSubmission.blobAuthorities`.
7. Publish under the saved store epoch.
8. Verify the response and call `markCommitted` durably.

`markCommitted` MUST retain the compact acknowledgment fields required by
[SECURITY-AND-RECOVERY.md](SECURITY-AND-RECOVERY.md); it must not simply delete all
evidence that a successful response was observed. The adapter MUST commit it before
reporting final success to its own caller or using returned IDs for consequential
work. Old-epoch entries still marked pending participate in recovery as ambiguous
potential commits; they are not automatically resubmitted as new.

An ambiguous transport failure repeats steps 5–8 with the same exact intent and UUID.
An expired claim may be replaced under a new upload UUID with authority for the same
digest/length. The SDK MUST refuse a local retry if the intent differs from the saved
value.

`STORE_EPOCH_CHANGED` or `STORE_RECONCILIATION_REQUIRED` stops automatic publication.
The pending record moves into the deployment's recovery workflow. The SDK MUST NOT
silently update an epoch precondition and resubmit.

## 4. Type descriptors

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

A descriptor MUST provide:

- its static payload type;
- exact key/version and expected definition digest;
- validation under the frozen schema and JSON profiles;
- typed primary-blob and reference-role helpers; and
- exact parsing of a retrieved envelope.

Before accepting production work, a first-party adapter MUST compare every enabled
descriptor digest against the store. A mismatch is a deployment failure. A descriptor
MUST NOT parse a newer artifact version as an older model.

Unknown key/versions remain available as immutable raw envelopes. This preserves
forward compatibility for generic browsers, projectors, and export tooling.

## 5. Procedure descriptors

```ts
const ExtractInvoice = defineProcedure({
  key: "invoice.extract",
  version: "3",
  inputs: {
    subject: artifactInput(CoreFile),
  },
  outputs: {
    candidate: artifactOutput(InvoiceCandidate),
  },
  parameterSchema: extractInvoiceParametersSchema,
  implementationSchema: extractInvoiceImplementationSchema,
  receiptSchema: extractInvoiceReceiptSchema,
});
```

A procedure descriptor enforces first-party input/output roles, exact artifact types,
parameter shape, implementation identity, receipt shape, evidence conventions, and
secret policy. It compiles to an ordinary run intent and is not a server resource.

The SDK documentation MUST distinguish these trusted-adapter guarantees from kernel
guarantees. A raw caller can bypass a descriptor; the kernel enforces only canonical
bounded objects and procedure-key namespace authorization.

## 6. Publication builder

The builder MUST:

- retain the caller-supplied publication ID and scope in the intent;
- enforce the closed kind union: roots require a root actor and no run/evidence; runs
  require a run and no root actor;
- create low-sensitivity opaque local keys;
- expose immutable typed local handles rather than provisional artifact UUIDs;
- topologically order new artifacts so local references point backward;
- assign contiguous reference, input, output, and evidence ordinals;
- validate exact type payloads, blob policies, reference attributes, run fields, and
  locator envelopes;
- separate each `{sha256, length}` declaration from byte authority;
- produce the frozen semantic DTO without unknown fields; and
- calculate a diagnostic digest using the shared vectors.

The builder MAY deterministically sort a domain set before assigning reference
ordinals, but the resulting version-1 role is still ordered. It MUST NOT expose an
`ordered: false` option.

It MUST NOT:

- deduplicate occurrences because content is equal;
- resolve “latest” type or artifact versions;
- infer cross-scope copy;
- infer semantic relations from payloads;
- mutate an already prepared intent; or
- issue external side effects as part of publication.

## 7. Blob authority binding

The client obtains authority only after a prepared intent is durable. For each
blob-bearing local key it binds exactly one of:

```ts
type BlobAuthority =
  | {readonly kind: "upload-claim"; readonly claimId: string}
  | {readonly kind: "source-artifact"; readonly artifactId: string};
```

Binding MUST verify that the authority resolves to the declared digest and length.
Authority objects are replaceable submission state and MUST NOT be written into the
intent or its diagnostic digest.

One upload claim may be bound to several local keys in the same publication when all
declare the same exact bytes. The client MUST NOT attempt to reuse the consumed claim
for another publication.

In the version-1 job topology, workers do not call the artifact store, including the
upload route. Workers stream or spool proposed bytes to coordinator-owned storage. The
coordinator validates the current attempt, saves the intent, owns the claims, and is
the only publisher.

## 8. Publication result verification

The client MUST expose and retain:

- scope and publication ID;
- server-authoritative publication request digest;
- committed store epoch, scope sequence, and commit time;
- optional run UUID;
- every local-key-to-artifact-UUID mapping;
- every returned artifact digest; and
- every exact type-definition digest.

It MUST verify route/intent identity and known descriptor digests. Where it locally
implements artifact hashing, it SHOULD verify artifact digests and treat disagreement
as integrity failure rather than normal conflict.

Retrieval returns immutable values. No public model exposes `save()`, dirty tracking,
automatic update, or hidden current/preferred resolution.

## 9. Projector package

The package exposes two different rebuild contracts.

### 9.1 Universal replay

`replayFromStart` consumes whole publication summaries from sequence zero, hydrates the
exact resource closure requested by the projector, and delivers one atomic application
unit at a time. It is the only universal version-1 rebuild path.

```ts
for await (const publication of store.replayFromStart({scopeId})) {
  await projectionDb.transaction(async tx => {
    await projector.apply(tx, publication);
    await checkpoints.save(tx, publication.cursor);
  });
}
```

The closure options MAY include artifact envelopes/content and the publication's full
run resource, whose own references, inputs, outputs, and evidence supply the historical
outbound closure. Hydration MUST use bounded reads, preserve the feed publication
boundary, and MUST NOT use inbound referrer/consumer/evidence-usage routes that can
include later history.

### 9.2 Artifact-oriented bootstrap

`bootstrapArtifacts` reads a high-water `H`, scans immutable artifacts through `H`,
then consumes publications after `H`. Its API and documentation MUST state that it is
valid only for artifact-oriented projections. It MUST NOT masquerade as a rebuild of
historical run receipts, actors, complete atomic fan-out, inputs, or evidence.

### 9.3 Delivery semantics

The feed is at least once. The projector package cannot make a remote projection
exactly once. The handler applies a publication and saves its checkpoint in the same
application transaction and MUST tolerate replay of the last publication.

## 10. Trusted adapter responsibilities

Browser webviews, plugins, model output, and general shell tools MUST NOT hold broad
publisher credentials. A trusted adapter owns:

- authenticated stable publisher and allowed scope;
- type/procedure allowlists and descriptor checks;
- actor attribution;
- source-artifact mapping;
- application outbox and successful acknowledgment journal;
- byte reacquisition;
- job-attempt or human-authorization fencing; and
- final intent revalidation after accepting any untrusted proposal.

The SDK assists these operations but does not replace the trust boundary.

## 11. Optional recipes

Recipes MAY provide typed helpers for capture, correction, decision, bundle, snapshot,
action request/receipt, and completion-manifest patterns. Every helper MUST expose its
exact artifact/procedure types and compile to the same `PublicationIntent`. Recipes
MUST NOT create new raw endpoints or implicit mutable semantics.
