# Document ingest actors

For the system-wide view around this catalog, see
[`docs/document-ingest-system.md`](../../../../docs/document-ingest-system.md).

This directory is the executable actor catalog for document ingestion. The same
definitions can be hosted on the device or server; placement belongs to the run, not
the actor's domain behavior.
Every subdirectory represents exactly one actor, and its directory name is the actor's
stable manifest ID. You can therefore list this directory to see which actors exist
without opening a registry or searching a monolithic source file.

## Inventory

The standard catalog contains sixteen actors:

| Actor | Method | Requires | Produces | Execution |
| --- | --- | --- | --- | --- |
| `document-inspector` | `document_inspect` | `ceo.aven.docs.file(F)` | `ceo.aven.docs.file_inspection(F, I)` | Deterministic |
| `document-decomposer` | `document_decompose` | `ceo.aven.docs.file(F)`, `ceo.aven.docs.file_inspection(F, I)` | `ceo.aven.docs.page(F, P)` | Deterministic |
| `native-text-extractor` | `document_extract_native_text` | `ceo.aven.docs.file(F)`, `ceo.aven.docs.page(F, P)` | `ceo.aven.docs.extracted_text(F, P, T)`, `ceo.aven.docs.text_layout(F, P, L)` | Deterministic |
| `page-signal-classifier` | `document_classify_page` | `ceo.aven.docs.file(F)`, `ceo.aven.docs.page(F, P)`, `ceo.aven.docs.extracted_text(F, P, T)` | `ceo.aven.docs.content_classification(P, C)` | Deterministic |
| `document-assembler` | `document_assemble` | `ceo.aven.docs.extracted_text(F, P, T)` | `ceo.aven.docs.document_text(F, T)`, `ceo.aven.docs.document_layout(F, L)` | Deterministic |
| `content-aggregator` | `document_aggregate_content` | `ceo.aven.docs.content_classification(P, C)`, `ceo.aven.docs.document_text(F, T)` | `ceo.aven.docs.content_classification(F, C)` | Deterministic |
| `visual-page-analyzer` | `document_analyze_page` | `ceo.aven.docs.file(F)`, `ceo.aven.docs.page(F, P)`, `ceo.aven.docs.extracted_text(F, P, T)` | Text, layout, classification, and description | Vision model |
| `document-kind-classifier` | `document_classify_kind` | `ceo.aven.docs.file(F)`, `ceo.aven.docs.extracted_text(F, T)` | `ceo.aven.docs.document_classification(F, C)` | Vision model |
| `invoice-extractor` | `document_extract_invoice` | `ceo.aven.docs.file(F)`, `ceo.aven.docs.document_classification(F, C)` | `ceo.aven.bookkeeping.invoice_candidate(F, I)`, `ceo.aven.bookkeeping.invoice_details(F, D)` | Vision model |
| `statement-extractor` | `document_extract_statement` | `ceo.aven.docs.file(F)`, `ceo.aven.docs.document_classification(F, C)` | `ceo.aven.bookkeeping.statement_candidate(F, S)` | Vision model |
| `invoice-validator` | `document_validate_invoice` | `ceo.aven.bookkeeping.invoice_candidate(F, I)` | `ceo.aven.bookkeeping.invoice_validation(I, V)` | Deterministic |
| `statement-validator` | `document_validate_statement` | `ceo.aven.bookkeeping.statement_candidate(F, S)` | `ceo.aven.bookkeeping.statement_validation(S, V)` | Deterministic |
| `open-item-normalizer` | `document_normalize_open_item` | Invoice candidate, details, and validation | `ceo.aven.bookkeeping.open_item(I, O)` | Deterministic |
| `statement-normalizer` | `document_normalize_statement` | Statement candidate and validation | `ceo.aven.banking.statement(S, N)` | Deterministic |
| `statement-transaction-fanout` | `document_fanout_statement_transactions` | Statement candidate, validation, and canonical statement | `ceo.aven.banking.transaction(N, T)` | Deterministic |
| `reconciliation-ranker` | `reconciliation_rank_invoice_transactions` | Canonical open item and transactions | `ceo.aven.reconciliation.match_candidate(O, T, M)` | Deterministic |

The model-backed actors are installed only when the host supplies a compatible
`DocumentModelGateway`. The deterministic lane remains available without an LLM.

## Directory contract

Each actor directory contains an `index.ts` that exports one named factory:

```ts
import { createDocumentInspectorActor } from '@avenos/document-ingest/actors/document-inspector'

const actor = createDocumentInspectorActor(decoder)
```

The factory owns all behavior specific to that actor:

- its manifest ID, label, description, tags, and method;
- method-level `requires` and `produces` predicates;
- canonical input/output schema slots, roles, and cardinalities;
- payload interpretation and validation;
- generated artifact drafts and evidence links; and
- the successful wire summary or structured failure.

The shared manifest constructor qualifies every definition as
`ceo.aven:actor:docs.ingest:<manifest-id>@1`; method capabilities inherit the same
authority and use a method-specific namespace. Domain predicates are qualified as
`ceo.aven.docs.*` or `ceo.aven.bookkeeping.*`. Do not introduce unqualified first-party facts.

The shared manifest helper binds every predicate to a canonical `ceo.aven:schema:*`
identity. Artifact Store adapters, not the planner, map those schemas to concrete type
keys and versions. A new predicate without a schema binding fails actor construction
rather than entering the catalog ambiguously.

Cross-actor data contracts and small pure helpers live in `../shared.ts`. Parsing a
completed actor record lives in `../results.ts`. Actor construction order and optional
model installation live in `registry.ts`. Do not move actor-specific decisions into
those shared files merely to reduce a local file's line count.

## Runtime and persistence boundary

An actor handles one envelope and returns a `DocumentActorResult`. It does not publish
artifacts or advance the pipeline itself.

```text
Chosen DocumentExecutionHost
  -> resolves the source artifact inside that host
  -> DocumentProcessingRuntime (current adapter)
  -> sends an envelope to one actor
  -> receives artifact drafts and evidence
  -> publishes one idempotent client production run
  -> binds returned immutable artifact IDs
  -> unlocks dependent actors
```

This separation is important:

- actors stay testable and usable in browser, desktop, or headless hosts;
- the runtime can retry model execution separately from publication;
- stable publication IDs prevent duplicate production runs after a restart; and
- only successfully published artifacts become inputs to downstream actors.

Actor handlers must not call Tauri, Svelte, the Artifact Store, or a provider SDK
directly. Host-specific capabilities enter through injected ports such as
`DocumentDecoder` and `DocumentModelGateway`.

`DocumentExecutionRouter` freezes `local` or `server` at start. Both current hosts use
the same strict JSON boundary and Artifact Store gateway. The server host is presently
an explicitly labelled in-process emulation. The authenticated HTTP runner is a
separate service and does not yet execute these actors. The replacement protocol and
cutover are defined in
[`docs/actor-runtime-formal-spec.md`](../../../../docs/actor-runtime-formal-spec.md).

## Artifact and evidence rules

Every successful actor result declares:

- the allowlisted `procedureKey` used by the server publication contract;
- one or more typed artifact drafts with stable local keys and output slots;
- evidence that connects output locations to exact input locations; and
- a model receipt when an LLM produced the result.

Use semantic artifact types such as `docs.extracted-text` or
`bookkeeping.invoice-candidate`; do not introduce a generic actor-message artifact.
Artifacts are immutable values and production runs are provenance receipts, not
mailboxes or mutable progress records.

Evidence is fail-closed. Model-provided JSON pointers and page regions are checked
before publication; unsupported or ungrounded evidence must be discarded rather than
invented.

## Adding an actor

1. Create `src/actors/<manifest-id>/index.ts`. The directory and manifest ID must
   match.
2. Export one descriptive factory named `create...Actor`.
3. Declare one invocable method with method-level `requires` and guaranteed `produces`.
   If an invocation can produce different branches, model those branches honestly
   instead of claiming every possible output.
4. Keep transport and UI dependencies out of the actor. Add an injected interface to
   `shared.ts` only when more than one host can implement it.
5. Return typed artifact drafts and grounded evidence. Add the corresponding
   client-procedure publication contract server-side before using a new procedure key.
6. Export the factory from `index.ts` and add it to `registry.ts` in dependency order.
7. Add the actor to the inventory table above until the generated catalog replaces
   this hand-maintained view; never create another inventory with different fields.
8. Add focused behavior tests, including malformed inputs and publication/resumption
   behavior when relevant.
9. Run:

   ```sh
   bun app/node_modules/typescript/bin/tsc -p libs/aven-document-ingest/tsconfig.json --noEmit
   bun test app/tests/document-actors.test.ts
   bun run check
   ```

## Design constraints

- One actor should represent one discoverable, invocable capability.
- Manifest IDs and method names are durable protocol identifiers; renaming them is a
  migration, not a refactor.
- `requires` means all listed inputs are required. Alternatives belong in separate
  capabilities or an explicit sum-type contract.
- `produces` lists guaranteed successful outputs, not every output an actor might emit.
- Deterministic validation stays separate from probabilistic extraction.
- External effects require request/receipt artifacts and explicit authorization; none
  of the current document actors performs an external effect.
- The registry composes actors but does not contain their behavior.
