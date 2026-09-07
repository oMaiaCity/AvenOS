# Current document-ingest execution adapter

For the holistic package, desktop, server, persistence, and execution map, start with
[Document ingest system architecture](document-ingest-system.md).

## Purpose

Document import is one way an Aven brings external material into the working context
defined by the [product model](product-model.md). avenOS executes that import as a
graph of ordinary Actors. Before upload, the
user chooses `local` or `server`; that placement is frozen for the process and persisted
with its source. Local actors execute in the app. Server placement submits the same
document skill to the separately hosted Actor Runner through the authenticated facade.
The adapter depends on narrow authenticated avenCEO service contracts:

- the generic LLM gateway transports capability-checked model calls; and
- the client-run publication endpoint commits local actor outputs and provenance to
  the tenant Artifact Store; and
- the Plan Runner endpoint admits, persists, and reports remote document runs.

`sourceKind: client-actor-ingest` identifies uploads resumed by this desktop adapter.
The former feed-driven Artifact Processor has been removed, so no second processor
competes for those sources in the current implementation.

The host-neutral protocol and remote-server cutover are in
[Actor execution protocol and document-ingest cutover](actor-runtime-formal-spec.md).

## Execution graph

The model-backed path is:

```text
document-inspector
  -> document-decomposer
  -> native-text-extractor (per page)
  -> document-kind-classifier (vision + structured output)
  -> visual-page-analyzer (vision + structured output, per page)
  -> document-assembler
  -> content-aggregator
  -> invoice-extractor OR statement-extractor (vision + structured output)
  -> invoice-validator OR statement-validator (deterministic)
  -> open-item-normalizer OR statement-normalizer + transaction fan-out (deterministic)
```

The reconciliation ranker is registered in the same catalog but is not automatically run by
this per-document graph. It requires one canonical open item plus a bounded customer-scoped
transaction candidate set, which the reconciliation query layer must supply.

The document runtime asks the LLM catalog for models containing both `vision` and
`structured-output`. If there is no match, it does not render model images or attempt a
model call. It runs the deterministic path instead:

```text
native-text-extractor
  -> page-signal-classifier
  -> document-assembler
  -> content-aggregator
```

This fallback is intentionally honest. A text PDF can complete as a generic document;
a scanned document without OCR settles as `needs_review` instead of inventing content.

## Placement and actor boundary

The app captures the Device/Server selector when upload begins. Uploads without an
explicit execution environment are rejected; there is no old-row fallback. On restart,
the app reads the exact stored placement and recreates that host route. Choosing a new
default never moves an active run.

The built-in actors are registered on the same message bus as other client actors. Each
actor advertises an invocable method-level contract and handles one transformation.
The generic observation solver selects ready skill operations. The document runtime
binds input artifact IDs into their envelopes, publishes successful outputs, and
updates the presentation projection. There is no separate legacy document coordinator.

The local host adapter owns:

- magic-byte inspection and bounded PDF/PNG/JPEG decoding;
- native PDF text and normalized-millionth layout extraction;
- 144-DPI PDF rendering for admitted model work;
- the `aven-finance-vision-v5` prompts and expanded finance schemas, including
  explicit unknown-versus-zero monetary values;
- document-kind and invoice-versus-statement branching;
- model result parsing, classification thresholds, grounded evidence filtering, and
  extraction-kind conflict checks;
- `invoice-core-v1` and `statement-core-v1` deterministic validation; and
- the local processing projection shown by chat and intent views.

The server host does not receive source bytes from the client. It receives only the
committed source artifact ID and metadata. The Actor Runner re-reads both envelope and
content through a tenant-routed Artifact Store client, rejects mismatched metadata,
runs the bounded deterministic text/PDF graph, and publishes every derived artifact
under its own Artifact Store service identity. Its small terminal presentation is
stored in the durable run checkpoint. Its headless decoder admits bounded PNG/JPEG,
extracts native PDF text, and renders PDF pages for the same model-backed actors used
locally. When the model route is unavailable, an image without native text settles
honestly as `needs_review` and publishes no finance fact.

While a server run is active, the same presentation travels through the generic
execution context's `reportProgress` callback into `PlanRunRecord.progress`. Status
polling shows stage names, attempts and the most recent retry error through the
existing UI. This mutable progress is not a committed solver fact or replay
checkpoint, and cannot prove completion. The terminal checkpoint remains authoritative.
Progress writes are serialized on the claimed SQL connection and flushed before
completion. A monitoring failure changes the desktop status to an error; it does
not claim to cancel work that may still be running remotely.

The canonical finance payload schemas are imported from Artifact Store conformance
fixtures. The actor implementation and publication adapter therefore validate against
the same invoice, statement, and classification shapes.

## Generic LLM gateway integration

Document actors do not have their own server-side model endpoint. They consume the
authenticated gateway contract:

```text
GET  /api/llm/models?capability=vision&capability=structured-output
POST /api/llm/completions
GET  /internal/v1/llm/models?capability=vision&capability=structured-output
POST /internal/v1/llm/completions
```

The public pair verifies a user identity for the desktop. The internal pair accepts
only the Actor Runner's distinct service bearer and exposes the same bounded discovery
and completion operations; the runner never stores a user JWT for later model work.
The Tauri bridge keeps the Aven session token outside the webview. Provider credentials
remain in the LLM downstream's `LLM_GATEWAY_CREDENTIALS_JSON` and never enter the app
bundle. This repository contains the client contract and facade, but not the owning
LLM downstream implementation; see [the gateway guide](llm-gateway.md) for that
integration boundary.
Every LLM actor, prompt, model policy, capability, and completion contract is owned by
`ceo.aven`. Portable runner contracts belong to `os.aven`; `id.aven` is limited to
principal, authentication, assurance, authorization, and grant evidence.

### Selection policy

Catalog discovery returns every compatible `{ id, label, capabilities }` descriptor in
operator order. `LlmDocumentModelGateway` then applies one explicit policy:

1. If a preferred model ID was supplied, that exact ID must appear in the compatible
   set. A missing preference makes the model lane unavailable; it is never silently
   replaced.
2. Without a preference, the first compatible model in operator order is selected.
3. The successful selection is cached for the process, so every stage of one document
   uses the same public model ID.
4. A failed catalog request is not cached; a later processing attempt can discover
   models again after authentication or connectivity recovers.

The current application constructs the adapter without a user preference, so operator
catalog order is the active policy. The processing projection records the selected ID,
label, and all compatible alternatives. A future settings UI can pass a preferred ID
without changing actor contracts or artifacts.

### Completion mapping

Each document procedure becomes one non-streaming generic completion:

| Actor procedure | Required capabilities | Structured output name |
| --- | --- | --- |
| `analyze-page` | `vision`, `structured-output` | `analyze_page` |
| `classify-document` | `vision`, `structured-output` | `classify_document` |
| `extract-invoice` | `vision`, `structured-output` | `extract_invoice` |
| `extract-statement` | `vision`, `structured-output` | `extract_account_statement` |

The request uses the selected public model ID, high-detail PNG/JPEG parts, the exact
procedure schema, `temperature: 0`, and a bounded output budget. The system instruction
treats document content as untrusted data. An expected document kind is added only from
the committed classification selected by the skill, never from text inside the file.

The gateway enforces model capability matching, canonical base64, at most 63 images,
12 MiB per decoded image, 40 MiB total image data, 2 MiB text input, response bounds,
timeouts, redirect rejection, and the selected provider profile. See
[the generic LLM gateway guide](llm-gateway.md) for its full contract.

## Durable Artifact Store communication

For local placement, `POST /api/artifacts/client-runs/[publicationId]` is the durable
boundary between actor steps. It resolves the authenticated tenant, accepts only
allowlisted client procedures, validates exact input/output slots and blob policy,
uploads output blobs, and publishes the production run atomically. For server
placement, the runner performs the equivalent atomic Artifact Store publications
directly with a dedicated credential and stable publisher identity.

For every successful step:

1. the runtime sends an envelope containing concrete input artifact IDs;
2. the actor returns typed artifact drafts and evidence;
3. the publication adapter commits the drafts and one production-run receipt;
4. the runtime replaces local output keys with returned artifact IDs; and
5. those immutable IDs become the next actor's inputs.

Model-backed receipts retain the public model ID and label, advertised capabilities,
provider-reported model, provider and HTTP request IDs, provider profile, token usage,
finish reason, stable request key, input/prompt digest, and implementation digest.
Deterministic procedures are marked deterministic and carry no model receipt.

This endpoint validates a protocol claim; it is not remote attestation. The
authenticated user is the run initiator, and the logical actor ID identifies which
built-in actor the client reports executing. Client-produced artifacts remain tenant
data and gain no operator authority merely by naming a built-in actor.

## Resumption and idempotency

Each actor invocation has a deterministic UUIDv8 publication ID derived from:

- source artifact ID;
- stage key;
- concrete procedure/version; and
- ordered input artifact roles, ordinals, and IDs.

Repeating a committed step therefore produces an Artifact Store replay, not a duplicate
derivation. If the app stops after a provider response but before publication, the same
generic completion body selects the same gateway request key on retry. If it stops after
publication, replay returns the already committed outputs and the runtime rebuilds
solver observations from their IDs.

Model stages make at most three attempts with 500 ms and 1,000 ms delays. Deterministic
stages fail immediately because repeating identical local logic cannot repair its input.
Actor execution and durable publication are separate retry domains: once an actor or
model call succeeds, an unavailable Artifact Store does not cause that work to run
again. The publication adapter serializes local publications to respect Artifact Store
upload admission, then retries the same idempotent publication ID after transport
failures, temporary Artifact Store unavailability, and upload-admission backpressure,
using delays of 1, 2, 4, 8, and 16 seconds.
The presentation is currently an in-memory projection; Artifact Store production runs
and stable publication IDs are the durable source of truth.

## Bounds and parity

The client lane preserves the document-processing behavior that matters:

- 25 MiB source limit and at most 63 logical pages;
- 40-million-pixel rendered-page bound;
- 12 MiB per model image and 40 MiB aggregate gateway image bound;
- 2 MiB native/document text bound, 200,000-byte page OCR bound, and 512 layout spans;
- page OCR/layout, content classification, and description artifacts;
- complete-document classification with a 6,500-basis-point acceptance threshold;
- invoice-family, bank-statement, and payment-receipt routing;
- grounded invoice candidate/details and statement candidate artifacts;
- target-relative JSON-pointer evidence tied to exact page regions; and
- invoice arithmetic/identity plus statement balance/period/receipt validation.

One scheduling difference is intentional: the local actor mailbox serializes work. A
headless actor host can later parallelize independent page actors without changing their
method contracts or artifact lineage.

## Configuration

The generic gateway must contain at least one model with both required capabilities.
This is one catalog entry; use a real provider URL, upstream deployment, and credential
ID:

```json
[
  {
    "id": "vision/document-v1",
    "label": "Document Vision",
    "capabilities": ["text-generation", "vision", "structured-output"],
    "baseUrl": "https://provider.example/v1",
    "upstreamModel": "replace-with-provider-model",
    "profile": "openai-json-schema",
    "authMode": "bearer",
    "credentialId": "document-vision",
    "timeoutSeconds": 180
  }
]
```

The corresponding secret is a compact object:

```json
{"document-vision":"replace-with-provider-secret"}
```

Merge this entry into the existing `LLM_GATEWAY_MODELS_JSON` catalog and merge the
credential into `LLM_GATEWAY_CREDENTIALS_JSON`; do not replace unrelated chat/design
models. The current `next` catalog must advertise `vision` on a genuinely vision-capable
deployment before scanned-document understanding will activate. Merely adding the
capability string to a text-only model is incorrect.

The retired `ARTIFACT_PROCESSOR_VISION_*` variables are not part of this architecture
and are not read by either document host.

## Operator checklist

1. Provision an OpenAI-compatible model that accepts high-detail images and the chosen
   structured-output profile.
2. Add it to `LLM_GATEWAY_MODELS_JSON` with `text-generation`, `vision`, and
   `structured-output`; add its provider secret to `LLM_GATEWAY_CREDENTIALS_JSON`.
3. Keep `LLM_GATEWAY_ALLOW_INSECURE_HTTP=false` outside trusted local development.
4. Deploy Aven API and, as a verified user, call
   `/api/llm/models?capability=vision&capability=structured-output`. Confirm the intended
   public ID and label are returned.
5. Make one small JSON completion with an image and confirm the receipt identifies that
   exact public model ID.
6. Build/install AvenOS with the actor runtime. No additional document-specific Tauri
   command or provider credential is required.
7. Upload a text invoice PDF, a scanned invoice, and a bank statement/payment receipt.
   Verify model page analysis, typed extraction, deterministic validation, and immutable
   production-run lineage.
8. Remove `vision` from all catalog entries temporarily and verify a text PDF follows
   deterministic fallback while a scanned fixture honestly reaches `needs_review`.
9. Before an integrated split deployment, configure fixed facade downstreams for the
   LLM gateway and client-run publication service. Keep the shared protocol fixtures
   and conformance tests.

## Main implementation files

| File | Responsibility |
| --- | --- |
| `libs/aven-actors` | Transport-neutral actor runtime, method capability derivation, and planner |
| `libs/aven-document-ingest/src/actors/*/` | One directory per actor, containing its manifest and transformation |
| `libs/aven-document-ingest/src/actors/registry.ts` | Standard actor graph construction and inventory |
| `libs/aven-document-ingest/src/model.ts` | Prompts, schemas, document model contract |
| `libs/aven-document-ingest/src/llm-gateway.ts` | Capability discovery, selection, generic request/receipt mapping |
| `libs/aven-document-ingest/src/execution.ts` | Placement-frozen host and run protocol |
| `libs/aven-document-ingest/src/runtime.ts` | Current DAG adapter, retries, publication IDs, projections |
| `libs/aven-llm-client` | Transport-neutral authenticated LLM gateway client contract |
| `libs/aven-artifact-store/src/client-runs.ts` | Publication contracts and serialized/retry wrapper |
| `app/src/lib/artifacts/browser-document-decoder.ts` | Bounded PDF/image inspection, text extraction, rendering |
| `app/src/lib/artifacts/client-document-processing.ts` | Desktop composition root and Tauri publication adapter |
| `services/aven-api` | Authenticated facade and fixed downstream allowlist |
| `services/actor-runner` | Authenticated remote run boundary; not yet used by this adapter |
| `services/artifact-store` | Artifact Store implementation and conformance contracts |
