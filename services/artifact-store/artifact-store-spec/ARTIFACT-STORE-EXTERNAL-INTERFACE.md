# Artifact Store External Interface

Status: proposed application contract

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

Companion documents:

- [Artifact Store Design](ARTIFACT-STORE.md)
- [avenCEO-tools Repository Backtest](ARTIFACT-STORE-REPOSITORY-BACKTEST.md)
- [AvenOS UI Backtest](ARTIFACT-STORE-AVENOS-UI-BACKTEST.md)
- [avenAgent Backtest](ARTIFACT-STORE-AVENAGENT-BACKTEST.md)

## Executive decision

The artifact store should present one small application boundary:

1. upload bytes under a temporary, principal-bound handle;
2. atomically publish immutable root artifacts or the outputs of one completed
   production run;
3. retrieve exact artifacts, content, production receipts, and bounded graph views;
4. search a versioned, authorization-filtered projection;
5. consume whole publication commits through a resumable change feed.

Everything else in the three applications remains application state. In particular,
the store does not expose job, session, intent, gate, current-version, approval-queue,
tool-call, or external-execution resources. An application may build those models over
artifact IDs and commit cursors, but it does not persist them by mutating artifacts.

The canonical write operation is `POST /v1/publications`. Simple upload and typed SDK
helpers compile to that command instead of creating weaker write semantics. A
publication is either:

- a batch of independently attributable root artifacts; or
- one production run with exact ordered inputs and one or more atomic outputs.

That distinction is sufficient for all three backtested applications. It is also
deliberately stricter than their current interfaces. Compatibility with current rows,
mock models, file paths, and trace formats is not a goal; each application should
adopt the new boundary.

The complete application API is intentionally short:

| Capability | Canonical operation |
| --- | --- |
| Discover caller context | `GET /v1/context` |
| Discover exact types | `GET /v1/artifact-types` and `GET /v1/artifact-types/{typeKey}/versions/{version}` |
| Stage exact bytes | `POST /v1/blob-uploads` |
| Publish durable facts | `POST /v1/publications` |
| Validate a command | `POST /v1/publications/validate` |
| Retrieve artifacts/runs/content | `GET /v1/artifacts/{id}`, `GET /v1/production-runs/{id}`, and artifact subresources |
| Batch read | `POST /v1/artifacts/batch-get` |
| Search | `POST /v1/artifacts/search` |
| Bootstrap a projection | `POST /v1/changes/bootstrap` then `POST /v1/artifacts/scan` |
| Follow publications | `POST /v1/changes/read` |

Administrative type, search-generation, retention, backup, and integrity operations
use separate credentials and packages.

## What this document settles

The architecture document defines the persistence model and its invariants. This
document makes the application-facing choices needed to implement and adopt it. It
specifies:

- transport and wire rules;
- authentication, actor attribution, and scope selection;
- type discovery;
- upload and reuse authority;
- the canonical publication command;
- retrieval, content, lineage, evidence, search, and feed operations;
- idempotency, concurrency, retry, and error behavior;
- the first-party SDK surface;
- domain recipes and migration paths for all three backtested applications.

Internal table shapes, cursor encryption, the authorization service's policy language,
the workflow engine, and procedure-specific artifact schemas remain implementation or
domain concerns. The contract describes their observable behavior without exposing
them.

Normative words such as **must**, **must not**, **should**, and **may** describe the
proposed version-1 contract.

## Design criteria derived from the backtests

The external interface is successful only if it makes these correct patterns easy:

| Need | Interface consequence |
| --- | --- |
| Two arrivals of the same bytes are two facts | Each publication creates a new artifact ID; blob reuse never selects artifact identity. |
| A worker produces several related values | One run publication validates and commits every output together. |
| A stale worker must not publish | A trusted executor adapter supplies an attempt-ownership token at the publication boundary. |
| A UI needs current status and preferred results | It consumes commits into an application projection; it never updates an artifact. |
| A person accepts, rejects, or corrects a proposal | The decision and corrected value are new typed artifacts with exact inputs. |
| An agent reads mutable files | Durable work receives captured artifact inputs, not path-only provenance. |
| A payment, send, calendar write, or file write has consequences | A typed request artifact crosses to a narrow executor; a typed receipt records the observed outcome. |
| Search configuration changes | A mapping/projection generation changes; artifact type versions and digests do not. |
| A negative result becomes durable evidence | The result records a closed corpus and the search/source high-water marks used. |
| Many applications react to one publication | They consume the whole-commit feed independently; fan-out is not encoded as artifact references. |
| Access changes or a backup is restored | cursors fail with an explicit restart contract rather than silently omitting or duplicating protected history. |

The interface should make unsafe shortcuts conspicuous. There is no publish-by-digest,
generic mutable metadata endpoint, arbitrary relationship endpoint, or `PATCH`
operation for artifacts.

## The boundary at a glance

```text
authenticated application
        |
        +-- upload bytes -----------> temporary upload handle
        |
        +-- publish roots/run ------> immutable commit
        |                                 |
        |                                 +-- artifacts and exact types
        |                                 +-- production receipt and evidence
        |                                 +-- one ordered feed commit
        |
        +-- retrieve/search/graph <-- authorization-filtered views
        |
        +-- consume commit feed ----> app projections, jobs, UI, enrichers

outside the store:
sessions, leases, progress, gates, current/preferred state, retries,
federated query, model/tool loops, and execution of external effects
```

## Resource model exposed to clients

### Stable resources

The public contract exposes these durable resources:

| Resource | Identity | Mutability |
| --- | --- | --- |
| Artifact type version | `typeKey` plus integer `version` | Immutable |
| Artifact | opaque `artifactId` | Immutable until privileged purge |
| Production run | opaque `runId` | Immutable until policy-governed erasure |
| Publication commit | opaque ordered cursor | Append-only feed record |
| Blob content | reached through an authorized artifact | Immutable |
| Search mapping/generation | administrative identity | Rebuildable control/projection |
| Purge tombstone | artifact identity plus policy-safe residue | Immutable audit fact |

These operational resources are temporary and are not artifacts:

| Resource | Purpose |
| --- | --- |
| Blob upload | Hold verified bytes for a later publication |
| Idempotency record | Recover the result of an ambiguous request |
| Bootstrap scan | Establish a race-free starting point for a projector |

All IDs are opaque strings. Clients must not infer time, tenant, shard, or ordering
from their representation. Only a commit cursor establishes publication order.

### Occurrence identity and content identity

An `artifactId` identifies one occurrence. A `blobDigest` identifies exact bytes. An
`artifactDigest` identifies the complete canonical artifact value, including its type,
payload, blob identity, and structural references. They are never interchangeable.

The server creates artifact and run IDs. Clients use local keys such as `"invoice"`
inside a publication to refer to values whose final IDs do not exist yet.

### Root, derived, and structural composition

A root artifact records an observation or value attributed directly to an actor: a
file arrival, user instruction, captured external snapshot, or deliberate import.

A derived artifact is an output of exactly one production run. The run records the
exact ordered inputs and how it was produced. A completed derived value cannot be
published without its run.

Structural references are part of an artifact's immutable value. They express frozen
composition: members of a manifest, parts of a bundle, or renditions in a package.
They do not express derivation, workflow, mutable ownership, fan-out, or semantic
claims such as duplicate-of. Those belong to production inputs, application state, or
typed assertion artifacts respectively.

## Transport and versioning

### Protocol

Version 1 uses HTTPS with:

- JSON request and response bodies encoded as UTF-8;
- raw byte bodies for content upload and retrieval;
- `Authorization: Bearer ...` for application authentication;
- `Content-Type` and `Accept` on every body-bearing request;
- `Idempotency-Key` on operations that can create durable or staged state;
- `traceparent` propagation where available;
- `X-Request-Id` in every response and corresponding safe server logs.

Protected JSON and content responses default to:

```http
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

Clients must not place bearer tokens, search queries, artifact payloads, upload
handles, or opaque feed/search cursors in logs. Server redirects are not part of the
authenticated API contract.

### API evolution

The path version `/v1` controls resource and HTTP semantics. Publication bodies also
contain `commandVersion: 1`, because their canonical request hash must not change when
unrelated response fields are added.

Within `/v1`:

- response objects may gain fields; clients must preserve or ignore unknown response
  fields safely;
- request command objects reject unknown fields, duplicate JSON keys, non-finite
  numbers, and values outside declared bounds;
- an artifact payload is validated by its exact registered type version;
- clients never coerce `domain.type@2` into an SDK model generated for
  `domain.type@1`;
- changing the structural meaning of a payload requires a new type version;
- changing search mappings does not require a new type version.

The canonical JSON profile normalizes strings to Unicode NFC, orders object keys,
preserves array order, and permits JSON integers only in the interoperable signed
53-bit range. Money, high-precision decimals, dates, and identifiers use
schema-constrained strings or integer minor units. The server is authoritative for
digests; the SDK canonicalizer is a preflight diagnostic and ships with golden vectors.

Timestamps are RFC 3339 UTC instants. Civil dates use `YYYY-MM-DD` strings and must not
be converted to instants. Durations use integer milliseconds unless a type schema says
otherwise.

### Digest representation

Digests use a tagged object instead of a bare hex string:

```json
{
  "algorithm": "sha256",
  "domain": "artifact-v1",
  "value": "7b1d...64-lowercase-hex-characters"
}
```

The allowed domains are specific to the field: `blob-v1`, `artifact-v1`, `run-v1`,
`type-definition-v1`, `implementation-v1`, and `publication-request-v1`. A client must
not move a digest between fields merely because the algorithm and hex value look
compatible.

## Authentication, actors, and scopes

### The authenticated publisher

The bearer credential resolves to a principal and an authorization revision. The
server writes the authenticated publisher into every artifact and publication commit.
The request body cannot override it.

The application may additionally name logical actors:

```json
{
  "kind": "user",
  "id": "user:8c477b0e"
}
```

Allowed actor kinds are `user`, `service`, `agent`, `connector`, `device`, and
`external-system`. Identifier formats are deployment-configured stable names. The
caller must be authorized to act for every supplied logical identity. Model-generated
arguments are never sufficient authority.

For root publication, `actor` answers who or what supplied the observation. For a
production run:

- `initiator` is the person or durable upstream process on whose behalf work began;
- `executor` is the exact service, agent, connector, or human procedure that performed
  the transformation;
- the authenticated publisher is still recorded independently by the server.

### Scope selection

Every publication has exactly one immutable authorization scope. All outputs in a
publication share it. A command cannot publish a mixed personal/team or
restricted/broad batch; the caller splits such work into separate publications.

The client supplies a `scopeId`, but the authorization resolver decides whether the
principal may publish there and whether the inputs permit the proposed transition.
An ordinary transformation may retain or narrow visibility. It may not widen it.
Moving a value from `me` to `team`, exporting restricted facts, or publishing a
redacted public form requires a declassification procedure recognized by authorization
policy and explicit policy authority.

`GET /v1/context` provides bootstrap information for a trusted client:

```json
{
  "apiVersion": "v1",
  "principal": {"kind": "service", "id": "service:avenos"},
  "authorizationRevision": "ar_01J...",
  "defaultWriteScopeId": "scope_personal_01J...",
  "scopes": [
    {
      "scopeId": "scope_personal_01J...",
      "displayName": "My workspace",
      "capabilities": ["read", "publish", "search", "feed"]
    }
  ],
  "limits": {
    "inlineBlobBytes": 65536,
    "blobBytes": 104857600,
    "artifactsPerPublication": 100,
    "referencesPerArtifact": 1000
  },
  "canonicalizationProfile": "artifact-json-v1"
}
```

The context route is convenience and discovery, not delegated authority. Every later
operation re-evaluates authorization. Long-running clients refresh context after an
authorization-revision error.

### Non-disclosure

An inaccessible artifact, run, blob, cursor, or upload handle returns the same
policy-selected not-found response as an unknown one. Search, graph, feed, facets,
counts, and snippets filter unauthorized information before ranking or aggregation.

An authorized caller may receive `410 Gone` and a policy-safe tombstone for a purged
artifact. Deployments that cannot safely reveal former existence return `404` instead.

## Type discovery

Applications normally compile generated types from a pinned type catalog. Runtime
discovery supports diagnostics, generic viewers, and gradual deployment:

```http
GET /v1/artifact-types?after={cursor}&limit=100
GET /v1/artifact-types/{typeKey}/versions/{version}
```

A type response includes:

```json
{
  "type": {"key": "bookkeeping.invoice-candidate", "version": 1},
  "definitionDigest": {
    "algorithm": "sha256",
    "domain": "type-definition-v1",
    "value": "..."
  },
  "payloadSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "referenceSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "array",
    "maxItems": 0
  },
  "blobPolicy": {
    "mode": "forbidden"
  },
  "status": "active"
}
```

`blobPolicy.mode` is exactly one of `required`, `optional`, or `forbidden`. Reference
roles, bounds, locator support, and attribute schemas are closed definitions. A null
schema or open-ended metadata object is not a registered production type.

Schema registration and search-mapping administration are separate privileged
interfaces. They are described later because none of the three application runtimes
needs administrative credentials.

## Uploading bytes

### Why upload is separate

Large bytes should be streamed once, verified once, and claimed atomically by a later
publication. Uploading creates no artifact, run, or feed commit. The returned handle is
temporary operational authority to use those exact bytes.

An upload handle is bound to:

- the authenticated principal and authorization revision;
- verified byte digest and length;
- declared and detected media type;
- expiry and quota accounting;
- the idempotency result that created it.

It is not a global content-address lookup token and cannot be transferred to another
principal.

An upload handle is single-claim: one semantic publication may consume it. An
idempotent replay of that publication continues to return the original result, but a
different publication cannot claim the handle again. To create another occurrence,
upload the arrival independently or use authorized reuse through a readable artifact.

### Streaming upload

```http
POST /v1/blob-uploads
Authorization: Bearer ...
Idempotency-Key: 84dc168d-7ba4-4d49-b31c-502fc27d296a
Content-Type: application/pdf
Content-Length: 481902
X-Expected-SHA256: 6b2236...

<raw bytes>
```

`X-Expected-SHA256` is optional. If present it is checked; it does not grant reuse
authority. Filenames and source labels are not upload-session truth. The client
explicitly publishes occurrence metadata later in a type-validated artifact payload.

A successful response is:

```json
{
  "uploadId": "upl_01J...",
  "blobDigest": {
    "algorithm": "sha256",
    "domain": "blob-v1",
    "value": "6b2236..."
  },
  "sizeBytes": 481902,
  "declaredMediaType": "application/pdf",
  "detectedMediaType": "application/pdf",
  "expiresAt": "2026-08-23T12:00:00Z",
  "idempotency": {
    "replayed": false,
    "guaranteedUntil": "2026-08-23T12:00:00Z"
  }
}
```

The server streams with strict size and time limits, rejects truncated or excess
content, computes SHA-256 while receiving it, and verifies an existing deduplicated
blob's length and bytes before accepting reuse. A zero-byte blob is valid unless the
artifact type forbids it.

`GET /v1/blob-uploads/{uploadId}` returns `open`, `claimed`, or `expired` plus expiry to
the creating principal. A claimed response returns the publication identity/result
only while the caller remains authorized, which gives the SDK a second reconciliation
path after an ambiguous claim. Failed publication validation does not consume a
handle. If different publications race to claim one handle, exactly one may commit.
Clients do not delete uploads as a correctness mechanism; unclaimed handles expire and
the store garbage-collects their unreferenced bytes after its safety window.

### Small inline content

Publication may contain a base64-encoded inline blob up to the advertised
`inlineBlobBytes` limit. This is useful for small generated text or fixtures. It is not
the default file-upload path. The decoded bytes count against request and blob limits.

### Authorized reuse

If the caller can read an existing artifact's blob, a publication may use:

```json
{
  "sourceArtifactId": "art_01J...",
  "expectedBlobDigest": {
    "algorithm": "sha256",
    "domain": "blob-v1",
    "value": "6b2236..."
  }
}
```

This creates a new artifact occurrence that shares exact bytes. It does not assert
derivation from the source occurrence; add the source as a run input if that semantic
relationship is true. Reuse authority cannot widen the source scope; broader release
uses an authorized declassification run. A bare digest is never enough to create or
obtain cross-scope existence. An authorization-filtered search may still find readable
occurrences by exact blob digest for duplicate analysis.

### Simple file helper

The SDK offers `publishFile`, which streams a blob and then sends one root publication.
It persists two distinct operation keys and both exact requests in its outbox so an
ambiguous upload or publication can be recovered independently.
An optional HTTP convenience `POST /v1/artifacts/uploads` may accept multipart form
data and compile to the same two operations. It must have a deliberately low size
limit and exactly the same idempotency, attribution, schema, authorization, and result
semantics. Applications should use streaming upload for normal files.

## Canonical publication command

### Endpoint and transaction boundary

```http
POST /v1/publications
Authorization: Bearer ...
Idempotency-Key: 4f6a53c5-6222-4fb5-b57d-333260f5b639
Content-Type: application/json
X-Attempt-Ownership: optional-opaque-token
```

The command is the only canonical durable write. The server either publishes its
entire artifact batch, run, references, evidence, and commit or publishes none of
them. The optional attempt-ownership header is supplied by a trusted workflow adapter,
not model arguments; if required by deployment policy, the server validates it in the
same transaction.

Every command has a top-level shape:

```json
{
  "commandVersion": 1,
  "scopeId": "scope_personal_01J...",
  "publication": "<one roots or run object>",
  "artifacts": ["<one or more artifact definitions>"]
}
```

`publication` is exactly one of `roots` or `run`. `artifacts` contains local artifact
definitions. Local keys are unique within the command, match
`[a-z][a-z0-9_-]{0,63}`, and are not persisted as global identity.

### Artifact definition

```json
{
  "key": "source_file",
  "type": {"key": "core.file", "version": 1},
  "payload": {
    "originalName": "invoice-1001.pdf",
    "declaredMediaType": "application/pdf",
    "detectedMediaType": "application/pdf",
    "source": {"kind": "manual-upload"}
  },
  "blob": {
    "uploadId": "upl_01J...",
    "expectedBlobDigest": {
      "algorithm": "sha256",
      "domain": "blob-v1",
      "value": "6b2236..."
    }
  },
  "references": []
}
```

`blob` is omitted when forbidden or absent, and has exactly one of these forms:

```json
{
  "uploadId": "upl_01J...",
  "expectedBlobDigest": {
    "algorithm": "sha256", "domain": "blob-v1", "value": "6b2236..."
  }
}
```

```json
{
  "inlineBase64": "SGVsbG8=",
  "mediaType": "text/plain; charset=utf-8",
  "expectedBlobDigest": {
    "algorithm": "sha256", "domain": "blob-v1", "value": "185f8d..."
  }
}
```

```json
{
  "sourceArtifactId": "art_01J...",
  "expectedBlobDigest": {
    "algorithm": "sha256", "domain": "blob-v1", "value": "6b2236..."
  }
}
```

The expected digest field is required in structured publication. It detects accidental
handle or source substitution; the handle/source artifact remains the authority.

References are ordered by their array position:

```json
{
  "role": "member",
  "target": {"localKey": "source_file"},
  "locator": null,
  "attributes": {"path": "invoices/invoice-1001.pdf"}
}
```

`target` contains exactly one of `artifactId` or `localKey`. The referenced type's
schema validates role, count, target type, attributes, locator kind, and ordering.
Same-publication references must form a directed acyclic structural graph. Array order
is canonical and the response returns explicit zero-based ordinals. Every existing
target must be readable, and a reference cannot make a target or locator visible in a
broader scope without the same explicit declassification authority required for run
inputs.

### Publishing roots

Use a root publication for captured or directly authored values:

```json
{
  "commandVersion": 1,
  "scopeId": "scope_personal_01J...",
  "publication": {
    "kind": "roots",
    "actor": {"kind": "user", "id": "user:daniel"},
    "source": {
      "kind": "interactive-upload",
      "externalRequestId": "browser-upload-0182"
    }
  },
  "artifacts": [
    {
      "key": "source_file",
      "type": {"key": "core.file", "version": 1},
      "payload": {
        "originalName": "invoice-1001.pdf",
        "declaredMediaType": "application/pdf",
        "detectedMediaType": "application/pdf",
        "source": {"kind": "manual-upload"}
      },
      "blob": {
        "uploadId": "upl_01J...",
        "expectedBlobDigest": {
          "algorithm": "sha256",
          "domain": "blob-v1",
          "value": "6b2236..."
        }
      },
      "references": []
    }
  ]
}
```

A roots batch is appropriate when several independently supplied values must become
visible together, such as the parts and manifest of one import. It must not be used to
hide a transformation: if one value was computed from another, publish a run.
All roots in the batch share the declared actor and scope; split observations with
different actors or visibility into separate publications.

The root `source` object is bounded operational attribution, not an arbitrary metadata
bag. Domain evidence such as a retained email envelope is a typed artifact, not a
large embedded source object.

### Publishing a production run

Use a run publication for every retained transformation:

```json
{
  "commandVersion": 1,
  "scopeId": "scope_personal_01J...",
  "publication": {
    "kind": "run",
    "initiator": {"kind": "user", "id": "user:daniel"},
    "executor": {"kind": "agent", "id": "agent:invoice-worker"},
    "procedure": {
      "key": "bookkeeping.extract-invoice",
      "version": "3"
    },
    "implementation": {
      "component": "avenagent-invoice-extractor",
      "version": "2.8.1",
      "buildDigest": {
        "algorithm": "sha256",
        "domain": "implementation-v1",
        "value": "1da3..."
      },
      "runtime": "avenagent/0.9"
    },
    "parameters": {
      "schema": "bookkeeping.extract-invoice-parameters@1",
      "value": {"locale": "de-DE", "currencyPolicy": "explicit-only"}
    },
    "inputs": [
      {
        "key": "document",
        "role": "subject",
        "artifactId": "art_source_01J...",
        "locator": null
      },
      {
        "key": "policy",
        "role": "policy",
        "artifactId": "art_policy_01J...",
        "locator": null
      }
    ],
    "outputs": [
      {"artifactKey": "candidate", "role": "candidate"},
      {"artifactKey": "evaluation", "role": "evaluation"}
    ],
    "evidence": [
      {
        "output": {
          "artifactKey": "candidate",
          "locator": {"kind": "json-pointer-v1", "pointer": "/invoiceNumber"}
        },
        "input": {
          "inputKey": "document",
          "locator": {"kind": "page-region-v1", "page": 0,
            "x": 0.64, "y": 0.08, "width": 0.25, "height": 0.05}
        },
        "relation": "supported-by"
      }
    ],
    "execution": {
      "startedAt": "2026-08-22T10:31:12Z",
      "completedAt": "2026-08-22T10:31:17Z",
      "externalRequestId": "job-attempt-991"
    },
    "receipt": {
      "outcome": "completed",
      "summary": "Produced a schema-valid candidate and consistency evaluation."
    }
  },
  "artifacts": [
    {
      "key": "candidate",
      "type": {"key": "bookkeeping.invoice-candidate", "version": 1},
      "payload": {
        "supplier": {"name": "Example GmbH"},
        "invoiceNumber": "1001",
        "invoiceDate": "2026-08-12",
        "currency": "EUR",
        "grossMinor": 11900
      },
      "references": []
    },
    {
      "key": "evaluation",
      "type": {"key": "bookkeeping.consistency-evaluation", "version": 1},
      "payload": {"outcome": "pass", "checks": []},
      "references": []
    }
  ]
}
```

Rules for a run publication:

- every artifact in the command appears exactly once in `outputs`;
- every output is produced by this run and no output has another producer;
- input order and repeated inputs are significant;
- input and output roles are bounded names whose richer procedure contract is validated
  by the producer SDK; the kernel preserves and hashes them exactly;
- evidence may point only from a local output to one of the declared exact inputs;
- locator syntax and bounds are validated where the media/schema permits it;
- implementation, parameters, and receipt fields are bounded objects; a producer-owned
  schema identifier lets generated SDK code validate richer procedure contracts;
- prompts, hidden reasoning, complete tool traces, queue state, retry counters, and
  cache entries are excluded from the default receipt;
- the server checks that the result scope does not unlawfully widen any input scope;
- a validation failure in any artifact, reference, input, output, receipt, or evidence
  mapping aborts the whole command.

Wall-clock timestamps are evidence supplied by the executor; the server also records
its own receive/commit time. Neither client time nor commit order is silently treated
as domain event time.

Procedure keys and versions are opaque namespaced producer identifiers. Version is a
bounded string because useful implementation schemes are not always integers. The
kernel does not run procedures or require a central procedure registry. It enforces
generic receipt bounds and exact hashing; generated producer SDKs own richer parameter,
role, and receipt validation. A team may publish a procedure definition as an artifact
when that definition itself must become a durable input.

### Publication result

The first successful request returns `201 Created`; an in-horizon replay returns
`200 OK` with the same durable result:

```json
{
  "publicationId": "pub_01J...",
  "commitCursor": "cc1.opaque...",
  "committedAt": "2026-08-22T10:31:18.124Z",
  "artifacts": {
    "candidate": {
      "artifactId": "art_01J...",
      "artifactDigest": {
        "algorithm": "sha256",
        "domain": "artifact-v1",
        "value": "..."
      },
      "type": {"key": "bookkeeping.invoice-candidate", "version": 1}
    },
    "evaluation": {
      "artifactId": "art_01K...",
      "artifactDigest": {
        "algorithm": "sha256",
        "domain": "artifact-v1",
        "value": "..."
      },
      "type": {"key": "bookkeeping.consistency-evaluation", "version": 1}
    }
  },
  "run": {
    "runId": "run_01J...",
    "runDigest": {
      "algorithm": "sha256",
      "domain": "run-v1",
      "value": "..."
    }
  },
  "idempotency": {
    "key": "4f6a53c5-6222-4fb5-b57d-333260f5b639",
    "replayed": false,
    "guaranteedUntil": "2026-08-29T10:31:18Z"
  }
}
```

Applications persist the artifact IDs and commit cursor in their projection; they do
not infer them from digests or repeat the publication to discover them later.

### Validation without publication

```http
POST /v1/publications/validate
```

This accepts the same body and current authentication context, performs bounded
structural, schema, upload-handle, locator, and authorization checks, and returns a
canonical request digest plus diagnostics. It creates no IDs, consumes no upload,
claims no authority, and does not guarantee a later publication because inputs,
ownership, authorization, retention, or uploads may change. SDK local validation is
faster; server validation is useful in development and administrative tools.

## Idempotency and crash recovery

### Semantic identity

`Idempotency-Key` is required for upload and publication. Its record is scoped by
authenticated principal, operation, and key. The server hashes the complete semantic
request after canonicalization, including scope, actors, exact inputs, output values,
references, evidence, and receipt. Transport-only attempt ownership and tracing fields
are validated but excluded from semantic identity.

Within `guaranteedUntil`:

- same key and same semantic request returns the original result;
- same key and different semantic request returns `409 IDEMPOTENCY_CONFLICT`;
- concurrent matching requests converge on one result and one commit;
- a failed transaction has no success result and may be retried under the same key.

Authorization is re-evaluated on every replay. The server returns the original result
only if the current caller remains allowed to know and use it; idempotency is not a
way to retain access after a grant is revoked.

The application or SDK outbox must persist the exact request and key before sending.
It may automatically retry transport failures only while the server advertises a
valid recovery horizon. After that horizon it must reconcile by a stored external
request identifier or ask for operator/application policy; it must not silently mint a
new key and risk a duplicate occurrence or side effect.

An SDK-generated key is random per intended publication. It is not derived from blob
digest, business identifier, agent `call_key`, HTTP request ID, run ID, or job ID.

### External effects are different

Publication idempotency prevents duplicate request artifacts. It does not make a
payment provider, mail server, filesystem, or shell command exactly once.

The safe pattern is:

1. publish an exact typed action-request artifact, usually derived from a proposal and
   decision;
2. have a narrow executor consume that request;
3. use the request `artifactId` as the downstream idempotency/reconciliation key;
4. publish a typed receipt from the request and exact observed response;
5. on timeout, reconcile with the external system before retrying.

`success` in a model response, process exit code, or UI callback is not an external
receipt.

## Retrieval

### Artifact envelope

```http
GET /v1/artifacts/{artifactId}
```

The default response is useful in one round trip and excludes only blob bytes and
unbounded graph expansion:

```json
{
  "artifactId": "art_01J...",
  "artifactDigest": {
    "algorithm": "sha256", "domain": "artifact-v1", "value": "..."
  },
  "type": {"key": "bookkeeping.invoice-candidate", "version": 1},
  "scopeId": "scope_personal_01J...",
  "publisher": {"kind": "service", "id": "service:artifact-producer"},
  "actor": {"kind": "agent", "id": "agent:invoice-worker"},
  "createdAt": "2026-08-22T10:31:18.124Z",
  "payload": {},
  "blob": null,
  "references": [],
  "producer": {
    "kind": "run",
    "runId": "run_01J...",
    "outputRole": "candidate",
    "outputOrdinal": 0
  },
  "publication": {
    "publicationId": "pub_01J...",
    "commitCursor": "cc1.opaque..."
  }
}
```

For a root, `producer.kind` is `root` and the root actor/source attribution is present.
References include authorized exact targets, roles, ordinals, locators, and attributes.
If policy permits reading the artifact but hides a referenced target, the reference is
represented according to the type's safe redaction contract; hidden target IDs and
counts are never leaked.

`ETag` is the quoted artifact digest. `If-None-Match` is supported. An artifact never
changes under an ID, so a different digest under the same ID is an integrity incident.

### Batch retrieval

```http
POST /v1/artifacts/batch-get
```

```json
{
  "artifactIds": ["art_01J...", "art_01K..."],
  "include": ["payload", "references", "producer"]
}
```

This supports UI cards and projector repair without N+1 requests. Results preserve
input order. Unavailable items use one non-disclosing `unavailable` result unless
policy permits an explicit tombstone. The entire response has bounded item and byte
limits; it is not a bulk export API.

### Blob content

```http
HEAD /v1/artifacts/{artifactId}/content
GET  /v1/artifacts/{artifactId}/content
```

Only artifacts with a readable primary blob expose content. The route supports single
HTTP byte ranges, `Content-Length`, `Content-Range`, `Accept-Ranges: bytes`, a digest
ETag, and `If-Range`. It returns the stored/detected media type according to type and
security policy, sanitizes `Content-Disposition`, sets `nosniff`, and never takes a
filesystem path from the caller.

Byte range coordinates are zero-based with an exclusive end in JSON locators; HTTP
`Range` retains standard inclusive syntax. Clients should not conflate the two.

### Production run

```http
GET /v1/production-runs/{runId}
```

The response returns exact procedure, implementation, parameters, initiator, executor,
server publisher, ordered inputs and outputs, evidence mappings, receipt digest, and
publication commit. Authorization applies to the complete view. The server does not
return a partially visible run that misleadingly appears to have fewer inputs or
outputs; it returns a policy-declared redacted shape or no run.

## Lineage, references, and evidence

These operations are separate because the graphs answer different questions:

- ancestors/descendants follow production-run input/output edges;
- references/referrers follow frozen structural composition;
- evidence maps output locations to exact input locations;
- closure follows an explicitly requested combination for export or inspection.

Endpoints are:

```http
GET /v1/artifacts/{artifactId}/ancestors
GET /v1/artifacts/{artifactId}/descendants
GET /v1/artifacts/{artifactId}/references
GET /v1/artifacts/{artifactId}/referrers
GET /v1/artifacts/{artifactId}/evidence
POST /v1/artifacts/{artifactId}/closure
```

Traversal requests specify `maxDepth`, `maxNodes`, an opaque cursor, and whether to
include artifact summaries or only edges. `closure` uses a JSON body:

```json
{
  "graphs": ["production-ancestors", "structural-references", "evidence-sources"],
  "maxDepth": 4,
  "maxNodes": 500,
  "cursor": null
}
```

Every response states `truncated`, `nextCursor`, and the applied bounds. It never
silently implies completeness after a bound is reached. Cursors bind the root,
direction, bounds, filters, authorization revision, and recovery epoch.

The first locator vocabulary is versioned and closed:

| Locator | Coordinates |
| --- | --- |
| `json-pointer-v1` | RFC 6901 pointer into the exact JSON payload |
| `text-range-v1` | Unicode scalar-value start and exclusive end in normalized text |
| `byte-range-v1` | Byte start and exclusive end in the exact blob |
| `page-region-v1` | Zero-based page plus normalized rectangle in declared page space |
| `table-cell-v1` | Stable table identifier and zero-based row/column range |
| `time-range-v1` | Integer start/end milliseconds in declared media timeline |

Schemas decide which locator kinds are legal. An application path, DOM selector,
unversioned character offset, or model prose is not an evidence locator.

## Search

### Search is a projection

Search finds artifacts; it does not define them. Exact type versions opt into
versioned search mappings for selected full-text fragments and typed fields. Unknown
JSON fields are never recursively indexed. Rebuilding or activating a mapping
generation does not change an artifact, type definition digest, or production graph.

Artifact search is one source in AvenOS's federated query layer. Contacts, live
calendar state, tool registries, and other application sources remain separate and
report their own completion/degradation.

### Request

```http
POST /v1/artifacts/search
```

```json
{
  "queryVersion": 1,
  "text": "Example GmbH 1001",
  "exact": null,
  "types": [
    {"key": "bookkeeping.invoice-candidate", "versions": [1]}
  ],
  "origin": ["root", "derived"],
  "createdAt": {"from": "2026-01-01T00:00:00Z", "through": null},
  "producedBy": null,
  "lineage": null,
  "filters": [
    {"field": "invoiceDate", "operator": "gte", "value": "2026-01-01"},
    {"field": "currency", "operator": "eq", "value": "EUR"}
  ],
  "facets": ["currency"],
  "sort": [{"field": "relevance", "direction": "desc"}],
  "consistency": {
    "mode": "at-least",
    "commitCursor": "cc1.opaque...",
    "maxWaitMilliseconds": 2000
  },
  "page": {"limit": 25, "cursor": null}
}
```

Type and field names must exist in the active search mapping. Operators are
field-type-specific and closed: equality/set membership, bounded comparisons, prefix
where declared, and full text. There is no arbitrary JSONPath, SQL, regular expression,
or user-selected ranking expression.

`exact` may contain one artifact ID or tagged blob digest. A digest lookup returns only
occurrences the caller may read and grants no publication authority. `producedBy` may
name an exact procedure key/version. `lineage` may name an authorized ancestor or
descendant with a small declared depth. These structural filters and `origin` are
kernel fields; payload filters/facets use globally namespaced mapping keys or keys that
are type-qualified and type-compatible across every selected type.

`consistency.mode` is:

- `eventual`: query the active generation immediately;
- `at-least`: wait up to the bounded duration until the active projection has indexed
  through the supplied publication commit, otherwise return a retryable projection
  lag error.

### Response and negative results

```json
{
  "generation": "searchgen_42",
  "indexedThroughCommit": "cc1.opaque...",
  "authorizationRevision": "ar_01J...",
  "hits": [
    {
      "artifactId": "art_01J...",
      "type": {"key": "bookkeeping.invoice-candidate", "version": 1},
      "artifactDigest": {
        "algorithm": "sha256", "domain": "artifact-v1", "value": "..."
      },
      "score": 0.91,
      "title": "Example GmbH – 1001",
      "snippets": [
        {"field": "supplierName", "text": "Example GmbH", "highlights": [[0, 7]]}
      ],
      "mappedFields": {"invoiceDate": "2026-08-12", "currency": "EUR"}
    }
  ],
  "facets": {},
  "page": {"nextCursor": null},
  "completeForRequestedCommit": true
}
```

On the first page the server pins a publication high-water `H` no later than
`indexedThroughCommit`. Search cursors bind the canonical query, generation/catalog,
authorization revision, scope visibility, `H`, rank/sort position, deterministic
artifact-ID tie-breaker, and recovery epoch. Later pages exclude artifacts and
propagated search contributions first published after `H`. Purge and revoked access
still take effect immediately; snapshot paging never revives erased or newly forbidden
content. A retired generation or incompatible authorization change returns
`CURSOR_RESTART_REQUIRED`; the server never mixes pages from different result worlds.

Zero hits mean only that this store search, under this authorization context and
generation, found none through `indexedThroughCommit`. To publish a durable
`not-found`, `complete-reconciliation`, or similar assertion, an application must also
close its corpus: exact query, included artifact set or manifest/high-water boundary,
failed/skipped inputs, every federated source's completion, and the relevant policy or
matcher version. The search response provides the store part of that evidence; it
does not claim that email, calendar, contacts, live workspace, or another store was
searched.

## Change feed and projection bootstrap

### Feed semantics

The feed is the integration spine for UI projections, search indexing, workflow
discovery, and enrichers. It is not a queue and does not track application job state.
Each consumer keeps its own checkpoint.

```http
POST /v1/changes/read
```

```json
{
  "after": "cc1.opaque...",
  "limitCommits": 100,
  "waitMilliseconds": 20000
}
```

The result contains whole authorized commits:

```json
{
  "commits": [
    {
      "cursor": "cc1.opaque-next...",
      "publicationId": "pub_01J...",
      "committedAt": "2026-08-22T10:31:18.124Z",
      "kind": "published",
      "artifacts": [
        {
          "artifactId": "art_01J...",
          "type": {"key": "bookkeeping.invoice-candidate", "version": 1},
          "artifactDigest": {
            "algorithm": "sha256", "domain": "artifact-v1", "value": "..."
          },
          "producer": {"kind": "run", "runId": "run_01J..."}
        }
      ],
      "runId": "run_01J..."
    }
  ],
  "nextCursor": "cc1.opaque-next...",
  "highWaterCursor": "cc1.opaque-high...",
  "minimumRetainedCursor": "cc1.opaque-min...",
  "hasMore": false
}
```

Purge commits have `kind: "purged"` and only policy-safe tombstone information.
The server scans across hidden commits internally; response timing, empty pages, cursor
movement, and counts must not reveal one page per inaccessible commit.

Delivery is at least once. A consumer must transactionally apply all changes in a
commit and store the new checkpoint in the same application transaction. It deduplicates
by publication/commit identity and is prepared to receive the last commit again.
Consumers may fan out work after committing their projection; the artifact store does
not encode consumer identities into the publication.

### Race-free bootstrap

A new or rebuilding consumer must not perform an unconstrained list followed by
`changes from now`, because a concurrent publication can fall between them.

Start with:

```http
POST /v1/changes/bootstrap
```

```json
{
  "types": [
    {"key": "bookkeeping.invoice-candidate", "versions": [1]}
  ]
}
```

The response returns an authenticated scan cursor and a feed boundary:

```json
{
  "snapshotThroughCommit": "cc1.opaque-H...",
  "scanCursor": "scan1.opaque...",
  "changesAfter": "cc1.opaque-H..."
}
```

The consumer pages the snapshot through:

```http
POST /v1/artifacts/scan
```

with the sealed `scanCursor`. Each page returns artifact summaries plus a next scan
cursor. The cursor binds authorization, recovery epoch, high-water `H`, type filters,
and last artifact key. After the final page, the consumer reads changes strictly after
`changesAfter`. Publications concurrent with the scan are therefore either in the
snapshot or in the feed, never lost.

If feed retention expires, authorization changes incompatibly, a restore changes the
recovery epoch, or a cursor key can no longer be honored, the server returns
`CURSOR_RESTART_REQUIRED` with a safe reason and a fresh-bootstrap instruction. It
never returns an empty successful page that looks caught up.

## Retention and purge as observed by applications

Ordinary application credentials cannot delete artifacts, runs, blobs, references,
commits, or type versions. Removing an intent card, deleting a session, clearing a
completed todo, replacing a preferred extraction, or merging two domain entities only
changes application projections.

Privileged retention tooling is a separate audited control plane. Before purge it
fences new publications, checks legal holds, production descendants, structural
referrers, evidence dependencies, shared blobs, active uploads, and backup/recovery
policy. A purge emits a change commit so projections and search remove protected
content.

Application behavior must assume:

- an input may become purged between preflight and publication;
- a previously displayed artifact may later return `410` or non-disclosing `404`;
- a graph may be unavailable rather than partially rewritten into false history;
- purging one occurrence does not remove a blob still used by another occurrence;
- a session or business-row deletion does not implicitly purge artifacts;
- a restore may invalidate all cursors through a recovery-epoch change.

The first application SDK should not expose purge at all. Retention operator tooling
uses a separate package and credential.

## Error contract

All JSON errors use `application/problem+json` with a stable machine code:

```json
{
  "type": "https://artifact-store.example/problems/schema-validation",
  "title": "Artifact payload is invalid",
  "status": 422,
  "code": "SCHEMA_VALIDATION_FAILED",
  "detail": "One or more fields failed validation.",
  "requestId": "req_01J...",
  "retryable": false,
  "fieldErrors": [
    {
      "pointer": "/artifacts/0/payload/grossMinor",
      "code": "EXPECTED_INTEGER",
      "message": "Expected a signed integer minor-unit amount."
    }
  ]
}
```

Details must be safe for the caller and must not reveal hidden resource identities,
counts, payload fragments, SQL, filesystem paths, or policy internals.

Important codes are:

| HTTP | Code | Client action |
| --- | --- | --- |
| 400 | `MALFORMED_REQUEST` | Correct syntax/closed command shape. |
| 401 | `AUTHENTICATION_REQUIRED` | Obtain/refresh credentials. |
| 403 | `SCOPE_TRANSITION_DENIED` | Do not retry unchanged; request an authorized procedure/policy. |
| 404 | `RESOURCE_UNAVAILABLE` | Treat unknown and inaccessible identically. |
| 409 | `IDEMPOTENCY_CONFLICT` | Load the persisted original request; never mint a key automatically. |
| 409 | `STALE_ATTEMPT_OWNERSHIP` | Stop the worker; no publication occurred. |
| 409 | `UPLOAD_ALREADY_CLAIMED` | Reconcile the claiming publication; do not retry with a new key. |
| 409 | `REFERENCE_CYCLE` | Correct local structural references. |
| 409 | `INPUT_NO_LONGER_AVAILABLE` | Re-resolve authorization or recapture inputs under application policy. |
| 410 | `ARTIFACT_PURGED` | Remove/restrict projections according to tombstone policy. |
| 410 | `UPLOAD_EXPIRED` | Upload again and intentionally issue a new publication request. |
| 413 | `LIMIT_EXCEEDED` | Split only along semantically valid publication boundaries. |
| 415 | `MEDIA_TYPE_REJECTED` | Correct the content/type declaration. |
| 422 | `SCHEMA_VALIDATION_FAILED` | Correct payload/reference/receipt data. |
| 422 | `INVALID_LOCATOR` | Correct locator kind, coordinate space, or bounds. |
| 428 | `PRECONDITION_REQUIRED` | Supply required digest, idempotency, or attempt ownership. |
| 429 | `RATE_LIMITED` | Retry after the supplied delay within the idempotency horizon. |
| 503 | `PROJECTION_NOT_CAUGHT_UP` | Retry bounded search; do not claim a negative result. |
| 503 | `CURSOR_RESTART_REQUIRED` | Discard local cursor and run the documented bootstrap/requery. |
| 503 | `INTEGRITY_FAILURE` | Stop automatic work and alert operators. |

`retryable` describes transport/store retry safety for the same semantic request. It
does not authorize a new publication key or replay of an external effect.

## First-party SDK contract

HTTP is the authoritative protocol. First-party SDKs make its invariants the easiest
path and use the same command model for an in-process adapter and remote service.

### Core client

Illustrative TypeScript:

```ts
interface ArtifactStoreClient {
  context(): Promise<StoreContext>;
  upload(source: ByteSource, options: UploadOptions): Promise<UploadHandle>;
  publish(command: PublicationCommand, options: PublishOptions): Promise<PublicationResult>;
  validate(command: PublicationCommand): Promise<ValidationResult>;
  get<T extends TypeRef>(id: ArtifactId, expected?: T): Promise<TypedArtifact<T>>;
  batchGet(ids: ArtifactId[], options?: BatchGetOptions): Promise<BatchGetResult>;
  content(id: ArtifactId, range?: ByteRange): Promise<ByteStream>;
  run(id: RunId): Promise<ProductionRun>;
  search(query: SearchQuery): Promise<SearchPage>;
  changes(options: ChangeReadOptions): AsyncIterable<PublicationCommit>;
  bootstrap(options: BootstrapOptions): AsyncIterable<ArtifactSummary>;
}
```

Opaque branded types prevent accidental mixing of `ArtifactId`, `RunId`, `UploadId`,
digests, cursors, and business identifiers. Generated payload models include the exact
`TypeRef`; deserialization preserves unknown response fields but refuses a different
artifact type version.

### Publication builder

```ts
const result = await store.publication({
  scope: context.defaultWriteScopeId,
  idempotency: outbox.key
})
  .run({
    initiator: actors.user(userId),
    executor: actors.agent("invoice-worker"),
    procedure: procedures.extractInvoice.v3,
    implementation: buildReceipt,
    parameters: extractParameters
  })
  .input("document", "subject", sourceArtifactId)
  .input("policy", "policy", policyArtifactId)
  .artifact("candidate", types.invoiceCandidate.v1, candidatePayload)
  .artifact("evaluation", types.consistencyEvaluation.v1, evaluationPayload)
  .output("candidate", "candidate")
  .output("evaluation", "evaluation")
  .evidence(
    output("candidate").json("/invoiceNumber"),
    input("document").pageRegion(0, 0.64, 0.08, 0.25, 0.05)
  )
  .publish();
```

The builder:

- assigns and checks local keys and ordinals;
- validates generated payload/reference schemas locally;
- verifies artifact output coverage and local-reference acyclicity;
- constructs versioned locators;
- requires explicit scope, actors, procedure, inputs, output roles, and idempotency;
- keeps the exact canonical semantic request in an outbox until recovery is safe;
- never reads ambient workspace paths during serialization;
- returns server IDs, digests, and cursor without wrapping them as mutable entities.

Convenience helpers `publishFile`, `publishRoot<T>`, and `publishRun` compile to this
builder. They do not call alternative persistence paths.

### Durable publisher outbox

Every server, worker, and effect executor should use a small application outbox:

```text
prepared -> sending -> committed
                 \-> ambiguous (recover with same key/request)
                 \-> rejected  (terminal safe error)
```

The outbox stores the exact command bytes/canonical model, idempotency key, creation
time, advertised recovery horizon, and eventual result. It is operational state and
may be pruned after the application has durably consumed the result. The SDK refuses
to regenerate a semantically equivalent request from mutable domain rows after a
timeout; it retries the saved request.

### Projector loop

The SDK projector helper processes one whole commit at a time:

```ts
await projector.run(async (transaction, commit) => {
  await applyCommitIdempotently(transaction, commit);
  await transaction.saveCheckpoint(commit.cursor);
});
```

The callback and checkpoint share an application transaction. The helper detects
authorization/recovery restart errors, clears only the owned rebuildable projection,
performs the race-free bootstrap, and resumes the feed. It does not delete workflow or
user-authored state automatically.

### Trusted adapters

Three adapter classes are useful:

- an HTTP client for web/server processes;
- an in-process command adapter with exactly the same DTOs and results;
- a Tauri command adapter that holds credentials in the trusted Rust/backend side and
  exposes narrow typed commands to the webview.

The browser/webview never receives database credentials, retention credentials, or a
generic arbitrary-publication capability for model-controlled JSON. The Tauri or
server adapter resolves current user, allowed actors, scope, and attempt ownership
outside untrusted tool arguments.

## Administrative control plane

Application runtime clients need read-only type discovery. Operators separately need:

```http
POST /v1/admin/artifact-type-versions
POST /v1/admin/search-mappings
POST /v1/admin/search-generations/build
POST /v1/admin/search-generations/{generationId}/activate
GET  /v1/admin/search-generations/{generationId}
```

Type registration is immutable. Re-registering the exact same key, version, dependency
closure, and definition digest is idempotent; different content at the same key/version
conflicts. The server pins the JSON Schema dialect, reference resolution, dependencies,
limits, and canonicalization profile.

Search mappings name exact type versions, typed field extractors, text fragments,
normalizers, titles/snippets, and facet policy. A building generation is invisible
until fully caught up and atomically activated. Activation never mutates artifacts.

Retention, audit export, backup, restore, and integrity verification are separate
operator interfaces and credentials. They should not share the application SDK.

## Common end-to-end recipes

### Same bytes, two arrivals

1. Upload `invoice.pdf`; receive `upl_A` and blob digest `D`.
2. Publish root file occurrence `art_A` with email-source metadata.
3. Later authorize reuse through readable `art_A`, or upload again and receive a
   handle for the same verified bytes.
4. Publish root file occurrence `art_B` with manual-upload metadata.
5. The store contains one blob `D`, two artifact IDs, two root attributions, and two
   publication commits.

Using `D` as the artifact ID or returning `art_A` from step 4 would be incorrect.

### File to classification, OCR, and extraction

1. Publish the file root.
2. A feed consumer creates an application job keyed by `(consumer, artifactId,
   procedureVersion)`.
3. The worker publishes classification and OCR as one run if they form one completed
   atomic operation, or as separate runs if they fail/retry independently.
4. An extractor publishes an invoice candidate and consistency evaluation with the OCR
   and relevant policy artifacts as exact inputs.
5. Evidence maps invoice fields to OCR text/page regions.
6. UI projections update only after consuming committed outputs.

Job attempts, progress, and failure diagnostics stay outside the store.

### Human correction and decision

1. UI loads the exact proposal artifact and its current application projection.
2. The user edits a form; the application publishes the corrected domain artifact as
   the output of `human-correction@N`, with the proposal as input and authenticated
   reviewer as executor.
3. The user accepts/rejects/requests changes; the application publishes a
   domain-specific decision artifact from the exact proposal or correction plus exact
   policy/capture inputs.
4. Optimistic concurrency in the application projection prevents a stale gate from
   becoming preferred/current.
5. Downstream action creation accepts only a decision satisfying its procedure rules.

The decision is not a callback payload or mutation of `accepted=true`.

### Proposal, external request, and receipt

1. A run publishes a payment/send/calendar/workspace-write proposal.
2. A human or policy procedure publishes a decision about that exact proposal.
3. Another run publishes a typed action request from proposal plus decision.
4. A narrow executor claims the request in its own operational system and uses request
   artifact ID as the remote idempotency key.
5. It publishes a receipt with outcome, external identifier, request/response digests,
   executor, timestamps, and any exact captured response artifact.
6. Ambiguous network completion stays operationally `reconciling`; it is not published
   as success until confirmed.

### Frozen collection and completeness

1. Publish or select each exact member occurrence.
2. Publish `core.manifest@1` with ordered `member` references.
3. Run reconciliation with the manifest as an input, recording failures/skips as typed
   evaluations where decision-relevant.
4. Publish a completeness assertion only if the procedure proves every manifest member
   was handled under the declared policy.

A live directory, search query, current inbox, or list of only successful parses is
not a closed corpus.

### Results larger than one publication

Atomicity is deliberately bounded; an application must not bypass limits with an
unbounded JSON payload. For a large reconciliation, export, or generated collection:

1. publish independently valid chunk/report artifacts in bounded run publications;
2. publish a final manifest whose ordered members are those exact artifact IDs;
3. publish the final completeness/evaluation artifact from the source-corpus manifest,
   result manifest, failure artifacts, and exact policy/matcher inputs;
4. let consumers treat only that final commit as `complete`.

Partial chunks can be retained and inspected, but their existence does not claim the
overall operation succeeded. If the result is naturally one opaque stream, publish it
as one bounded blob plus a small typed summary rather than thousands of JSON fields.
This preserves short transactions and honest completeness without requiring an
unbounded atomic batch.

### Scope transition

1. Read the restricted source under current authorization.
2. Run a policy-recognized redaction/declassification procedure with exact
   policy/decision inputs.
3. Request the broader output scope.
4. The authorization resolver verifies the procedure and caller authority atomically.
5. Publish only the explicitly declassified output to the broader scope; source IDs do
   not leak through unsafe payload/reference fields.

Changing `scopeId` in a normal publication or UI toggle is denied.

## Adoption path: avenCEO-tools

### Target boundary

The current application should keep tenant routing, jobs, leases, review queues,
transaction links, and preferred/current projections. It should replace durable
document/extraction/review truth with artifact IDs and consume the store feed.

```text
existing operational app                    artifact store
------------------------                    --------------
ingest batch/job/lease          ---->       file occurrence
staged-document projection      <----       committed artifacts
classification/extraction job   ---->       run + typed outputs
review queue/revision            ---->       correction + decision artifacts
transaction attachment row      ---->       projection points at artifact ID
search UI                        ---->       artifact search plus app filters
generated-document executor     ---->       request/output/receipt chain
```

### Migration sequence

1. **Introduce the client and identity boundary.** Give the artifact schema a
   constrained runtime credential. Map the existing tenant database to a deployment
   boundary and application users/services to principals and scopes. Add an outbox and
   persist artifact IDs/commit cursors in new compatibility projection columns.

2. **Move byte ingestion first.** Stream every manual, Gmail, generated, template,
   signature, and direct transaction byte path through `blob-uploads` and publish a
   `core.file@1` occurrence. Preserve filename, arrival channel, message/part identity,
   and old row ID as bounded import/source data or a typed capture artifact. Do not
   retain the unique `staged_documents(asset_sha256)` occurrence rule.

3. **Keep `staged_documents` as a projection.** Its status, classification display,
   attempt counts, lease, error, review state, and preferred extraction remain mutable
   application state keyed by raw artifact ID. Populate artifact-derived fields from
   the feed, not dual writes with two authorities.

4. **Convert completed workers.** Classification, OCR, extraction, and consistency
   workers receive exact artifact IDs. On success they send one run publication with
   bounded receipt and evidence. They supply the current lease/attempt ownership token
   through trusted middleware. A reclaimed stale worker receives
   `STALE_ATTEMPT_OWNERSHIP` and cannot publish.

5. **Convert review.** Keep review-claim concurrency in the app. Publish corrected
   candidate values and domain-specific accept/reject/needs-changes decisions. The
   preferred/current extraction is an optimistic application projection pointing at
   the selected artifact; older values remain immutable.

6. **Convert generated documents and effects.** Treat an Eigenbeleg or export as a
   typed generated artifact. If writing, emailing, posting, or attaching it has
   external consequences, create request and receipt artifacts. Do not store bytes
   before a business transaction without an upload claim/expiry path.

7. **Replace search.** Register explicit mappings, build the first generation, and
   switch the document search component to `POST /v1/artifacts/search`. Join app-owned
   status/transaction/preference data through artifact IDs in the application service;
   do not copy workflow fields into artifact payloads merely to filter them.

8. **Use the feed for all projections and work discovery.** Bootstrap the compatibility
   projection race-free, then apply commits transactionally. A consumer's dedupe key is
   commit/publication plus consumer purpose, not blob digest.

9. **Backfill semantically.** A historical staged row may become several artifacts and
   runs. Where historical provenance is missing, publish under an explicit
   `legacy-import@1` procedure that records unknown fields; never fabricate a model,
   reviewer, or exact run. Migrate both `document_assets.content` and direct
   `transaction_documents.content`, and verify bytes/digests before retiring columns.

10. **Retire direct artifact-row mutation/deletion.** Session/business deletion only
    updates application data. A separate retention operator handles artifact purge.

### First useful slice

The fastest valuable path is manual/Gmail file occurrence -> classification/OCR run ->
invoice candidate/evaluation -> review decision. It exercises uploads, occurrence
identity, atomic multi-output publication, stale-worker fencing, search, feed,
correction, and decision semantics without requiring every legacy table to migrate.

### Migration pressure-test result

No additional kernel endpoint is needed. The only avenCEO-tools-specific additions are
an attempt-ownership verifier, artifact-ID columns/projections, type/procedure schemas,
and application joins. This confirms that attempt tokens belong to publication
transport while job state remains outside the store.

## Adoption path: AvenOS

### Target boundary

AvenOS should treat artifacts as durable facts rendered by intent cards, not treat
intent cards as storage records.

```text
artifact facts                     AvenOS projection/UI
--------------                     --------------------
source/classification         ---> intent card and badges
task/event/draft revisions    ---> preferred/current item
proposal + decision           ---> pending/resolved gate
action request + receipt      ---> executing/completed status
publication commits           ---> skill fan-out and activity
artifact search response      ---> one federated query source
```

`MockIntent.status`, skill nodes, current actor, pending callbacks, selected window,
toasts, relative time, result layout, and render `kind` stay in AvenOS.

### Migration sequence

1. **Add a trusted Tauri adapter.** The Rust/backend side owns the store credential,
   resolves the signed-in user and `me`/`team` scopes, and exposes typed commands to the
   webview. The UI never sends arbitrary publisher identity, scope elevation, or
   model-authored publication JSON directly.

2. **Replace mock source values with artifact IDs.** Implement one intake path for a
   file or retained message and one classification. The intent projection stores
   source/output artifact IDs and renders its existing cards from typed payloads plus
   app state.

3. **Drive fan-out from whole commits.** Skills subscribe as independent application
   consumers and create operational tasks idempotently. An intent's branches are not
   structural references; each completed branch publishes its own exact run outputs.

4. **Make gates durable at the decision boundary.** A pending gate remains mutable UI
   state, but its proposal is an artifact. Confirm/reject publishes a semantically typed
   decision naming the exact proposal, exact policy/captures, authenticated reviewer,
   and procedure. A stale, resolved, superseded, inaccessible, or purged proposal fails
   closed. A rejection is retained whenever later work depends on it.

5. **Adopt request/receipt for effects.** Payment, email/send, calendar write, contract
   cancellation delivery, and file write each use domain request and receipt types.
   UI `completed` means a successful receipt exists, not that the user pressed a button
   or a tool returned text.

6. **Model tasks and events as revisions.** Retained todo/event declarations,
   corrections, and transitions may be typed artifacts. `current`, `done`, ownership,
   clear-done, and preferred revision remain projections. Civil all-day dates use
   `YYYY-MM-DD`; timestamps are not substituted.

7. **Treat `me` to `team` as declassification.** A visibility toggle starts an
   authorized transition procedure; it cannot rewrite the artifact scope. The broader
   result is a new artifact, and any redaction/policy decision is an exact input.

8. **Add artifact search as one query source.** The federated query coordinator merges
   store results with contacts/calendar/apps and reports per-source completion,
   degradation, and high-water state. It never represents a store zero-hit page as a
   universal negative result.

9. **Add negative-result workflows only with closed corpora.** Missing-contract or
   reconciliation conclusions retain a manifest/query boundary, authorization
   revision, search generation/indexed-through commit, failure list, and each federated
   source's completion.

10. **Correct the draft type catalog before registration.** Keep structural type
    definitions separate from search mappings; replace generic review decisions with
    domain semantics; close policy/external-capture objects; resolve email one-blob
    representation; remove duplicated assertion bodies; do not register null-schema
    candidates.

### First useful slice

Implement the office-chair invoice journey: intake file -> classification/extraction ->
payment proposal -> human decision -> payment request -> executor receipt. Render the
existing intent card as a projection. This tests every important boundary without
turning the store into the intent/skill state machine.

### Migration pressure-test result

AvenOS needs no generic `intent`, `gate`, `activity`, `status`, or federated-query
resource in the store. Batch get, commit feed, exact decision inputs, action receipts,
and projection-consistency metadata are enough. The Tauri adapter is important to keep
authority outside mock/UI/model-controlled objects.

## Adoption path: avenAgent

### Target boundary

avenAgent should be a producer and executor around the store, not upload its run
directory or session trace as a single artifact.

```text
artifact inputs --read-only materialization--> agent workspace/run
                                                  |
                       operational trace/cache <--+
                                                  |
completed typed result + exact input map ----------+--> run publication
consequential proposal --------------------------------> request artifact
request artifact --> narrow executor --> receipt artifact
```

Conversation JSONL, session title/busy/inbox, active run, prompts, hidden reasoning,
tool chatter, cache, SSE cursors, retry state, and interrupted attempts remain
operational or diagnostic state.

### Migration sequence

1. **Start with the pure reconciliation vertical.** Register bounded invoice,
   transaction, match/evaluation, corpus manifest, and completeness types. Use exact
   money representation and occurrence UUIDs; supplier invoice numbers and bank
   transaction IDs remain domain fields, never artifact identity.

2. **Add an artifact input materializer.** Given authorized artifact IDs, create
   read-only workspace files and a trusted map of path -> artifact ID/digest/locator.
   The map is outside model control. A mutable host file used by a durable result is
   captured to a root artifact before the run or revalidated by digest at publication.

3. **Publish completed reconciliation atomically.** Inputs include an exact manifest
   of invoice/transaction occurrences and exact matcher/policy artifacts. Outputs
   include all retained candidates/evaluations and an explicit coverage result.
   Malformed, skipped, or failed members prevent a closed-corpus success claim. If the
   bounded publication limit would be exceeded, publish result chunks first and make a
   final result-manifest/completeness run the only completion signal.

4. **Add extraction.** Raw file/OCR artifacts are inputs; a typed extraction candidate
   and validation are outputs. Evidence locators replace path-only provenance. The
   implementation receipt records provider/model/schema/tool/instruction digests and
   bounded parameters, not the full rendered prompt or chain of thought.

5. **Give the agent a narrow publisher capability.** The adapter, not the model,
   selects allowed output types, actor/executor identity, input set, scope, and
   idempotency outbox. Model output fills only schema-authorized payload fields. A
   general shell tool cannot claim publication authority.

6. **Separate generated content from workspace writes.** Generated content is a typed
   artifact. Writing it into an external/mutable workspace uses a request that binds
   target, expected prior version/digest, and exact new artifact. The receipt captures
   resulting bytes/digest, executor, time, and ambiguity status.

7. **Separate network effects.** Each consequential API/email/payment/calendar action
   has a narrow executor and request/receipt types. Shell exit status and stdout do not
   become success receipts. Timeouts enter reconciliation before retry.

8. **Return artifact results to the session projection.** The conversation may render
   links, summaries, and commit status. SSE remains UI replay; downstream durable work
   consumes the artifact feed.

9. **Keep diagnostics separate.** If policy requires retaining trace/prompt data, use a
   restricted diagnostic store/type family with explicit short retention and access.
   It is not the production receipt and is excluded from general artifact search by
   default.

10. **Decouple session deletion from retention.** Deleting a session/workspace removes
    operational state only. Artifact purge is privileged and must fence live
    publishers, analyze graph dependencies, and emit purge commits.

### First useful slice

Materialize already captured invoice and statement artifacts, run the existing
reconciliation core, and publish match evaluations plus coverage in one production
run. This uses avenAgent's strongest deterministic code path and avoids prematurely
integrating sessions, prompts, sandbox lifecycle, or arbitrary tools.

### Migration pressure-test result

The canonical interface covers avenAgent without a trace-upload or agent-specific run
endpoint. It does require a trusted input materializer, publication allowlist, exact
path/artifact map, and outbox. This confirms that the production receipt should be
compact and that external action idempotency belongs to request artifacts, not the
agent's `call_key`.

## Cross-application contract tests

Before any application depends on version 1, run the same conformance suite against
the in-process, HTTP, and Tauri adapters:

1. Same bytes with two idempotency keys produce two artifacts and one blob.
2. Same key and command return identical IDs and one commit; changed scope, actor,
   input, payload, receipt, reference, or evidence conflicts.
3. A bare known/guessed blob digest cannot publish or disclose an inaccessible
   occurrence; authorized exact search remains read-only.
4. A handle cannot be used after expiry or by another principal.
5. Failure in the last of several outputs/evidence links publishes nothing.
6. A stale ownership token publishes nothing even if work completed.
7. A local structural-reference cycle fails before commit.
8. An input becomes inaccessible or purged between validation and commit; the command
   fails atomically.
9. Runtime credentials cannot update/delete immutable rows through HTTP or direct SQL.
10. Artifact, content, batch, search, graph, evidence, facets, feed, and scan leak no
    inaccessible IDs or counts.
11. Every content response returns exact bytes, supports bounded ranges, and uses safe
    headers.
12. Search waits through a requested commit or returns projection lag; it never returns
    a false `completeForRequestedCommit`.
13. Search pagination never mixes projection generations or authorization revisions.
14. Bootstrap plus feed loses and duplicates no logical commit under concurrent writes;
    duplicate delivery remains possible and harmless.
15. A restore/recovery-epoch or incompatible grant change forces explicit rescan.
16. Correction and decision preserve the original artifact and exact reviewer/inputs.
17. A broader-scope publication without an authorized declassification procedure fails.
18. An external success is shown only after a receipt traces to the exact request and
    decision.
19. A closed-corpus success fails if one manifest member was skipped or malformed.
20. Purging one of two occurrences preserves shared bytes required by the other and
    removes the purged occurrence from search/projections through a feed commit.
21. Civil dates and exact money round-trip through all SDKs without timezone or binary
    floating-point change.
22. Unknown response fields survive generic handling; an unexpected artifact type
    version is never silently coerced.

Each application's migration suite then adds its domain procedures, schemas, and
projection behavior. Passing only HTTP happy paths is insufficient.

## Deliberately absent interfaces

Version 1 should not add any of the following:

- `PATCH /artifacts/{id}` or ordinary artifact delete;
- create/reuse by bare blob digest;
- mutable arbitrary metadata or tags on artifacts;
- generic untyped graph edges;
- business-object upsert by invoice number, transaction ID, path, or content hash;
- job, lease, retry, progress, intent, skill, session, gate, notification, or current
  state endpoints;
- model-controlled publisher, scope elevation, retention, or claimed-success fields;
- arbitrary SQL, JSONPath, regex, ranking expressions, or recursive JSON indexing;
- full prompt, hidden reasoning, or trace retention in the default run receipt;
- generic shell/network execution;
- webhook delivery as a substitute for the replayable feed;
- a universal negative-search assertion;
- a convenience write route with weaker atomicity, idempotency, authorization, or
  provenance than `/v1/publications`.

If an application needs one of these behaviors, it should first model it as mutable
application state, a typed domain artifact, a projection, or a narrow external
executor. Expanding the immutable kernel is the last choice.

## Recommended implementation order

1. Freeze command/error/cursor DTOs, JSON Schema profile, canonicalization, limits,
   actor IDs, scope-transition rules, and golden vectors.
2. Implement context/type discovery, streaming upload, `core.file@1`, root publication,
   retrieval/content, idempotency, and whole-commit feed.
3. Implement race-free bootstrap and first-party outbox/projector helpers; prove scope
   isolation and recovery-epoch restart.
4. Add `core.manifest@1`, production runs, local outputs/references, evidence locators,
   batch get, and bounded graph APIs.
5. Integrate the avenCEO-tools file/classification/OCR vertical and stale-attempt check.
6. Integrate avenAgent's pure reconciliation vertical through read-only materialized
   inputs.
7. Integrate AvenOS's invoice proposal/decision/request/receipt journey through the
   trusted Tauri adapter.
8. Add explicit search mappings, generation activation, consistency waits, and use it
   as one AvenOS/avenCEO-tools query source.
9. Add domain correction/decision and external executor SDK patterns.
10. Add privileged retention only after graph/shared-blob analysis, backup/restore,
    authorization recovery, and purge-feed behavior pass end-to-end tests.

This order makes the store useful early without allowing mocked UI breadth, legacy row
shapes, or an agent trace format to dictate the kernel.

## Final assessment

One external interface works cleanly for all three applications if it is centered on
immutable facts rather than their current application models.

avenCEO-tools becomes a workflow/projection application around exact file,
classification, extraction, review, and generated-document artifacts. AvenOS becomes
a UI and skill coordinator that renders durable facts and keeps intent/gate/current
state locally. avenAgent becomes a typed producer and narrow effect executor that
captures exact inputs and publishes completed results without freezing its session or
reasoning trace.

The common adoption contract is therefore intentionally small: principal-bound byte
staging, one atomic publication command, exact retrieval and bounded provenance,
versioned search, and a whole-commit feed. The uncomplicated path is not to hide
artifact IDs, type versions, scopes, receipts, or cursors. It is to expose them through
generated types, a publication builder, a durable outbox, and a projector loop so the
correct behavior is easier than reproducing each application's existing shortcuts.
