# Artifact-first semantic enrichment and affordance discovery

Status: draft product and runtime contract; initial generic runtime slice implemented

Audience: contributors to avenCEO document skills, Actor planning and execution,
Artifact Store schemas, and artifact-facing product views

## Purpose

When somebody gives avenCEO a document, they should not need to know which parsers,
schemas, or downstream skills exist. The system should first understand the document
as fully as its installed and authorized Actors allow. It should then explain what
that new understanding makes possible.

For an invoice, the useful result is not merely extracted text. The enrichment run may
establish the document type, supplier, invoice number, dates, currency, line items,
taxes, totals, payment terms, bank details, validation results, and links to known
parties or purchase orders. Each result is typed against a declared schema and retains
the evidence needed to inspect how it was obtained. Only after enrichment reaches its
stopping point does the product offer actions such as creating a bookkeeping entry,
comparing the invoice with a purchase order, or preparing a payment.

This specification makes that artifact-first interaction the default. A request with
an explicit outcome remains supported as a directed optimization of the same
enrichment machinery.

The generic Plan Runner now has an initial version 2 slice for exploratory and hybrid
requests. It exhaustively expands guaranteed capability outputs, returns a portable
understanding bundle, and derives executable affordances from current and related
facts. The production document runtime still executes its fixed document-specific DAG.
Its desktop and server placements now share the same actors, model contract, canonical
outputs, and proven conformance corpus; observation-dependent generic replanning,
product document catalogs, and application upload wiring remain to be integrated. An
opt-in provider-backed golden exercises the actual model gateway, prompt, schema, and
reviewed invoice expectations; a release environment still has to run and retain that
evidence. The distinction is
important: the implemented slice proves the portable mechanics without claiming that
the complete product journey already ships.

## The product contract

Uploading or attaching a document starts an enrichment run unless the user or product
policy explicitly disables automatic processing. The run MUST:

1. admit the source artifact and establish the access and execution context;
2. derive every new, relevant, schema-bound fact available from eligible document
   capabilities;
3. preserve immutable results, field evidence where supported, confidence, and
   production provenance;
4. exclude capabilities that cause external effects;
5. stop with an explicit reason and a durable understanding bundle; and
6. derive user-facing actions from the facts that were actually established.

The run MAY read an authorized external source when an eligible observation requires
it. Authorization to read a source or invoke an Actor does not authorize an external
effect. Preparing a proposed mutation is enrichment; committing that mutation is an
effect and remains behind a separate user or policy decision.

In short:

> Eagerly understand; never eagerly act.

## Conceptual model

The source file is an ingredient, not a sufficient description of the work:

```prolog
ingredient  ceo.aven.docs.file(invoice_1)
```

An artifact-first run asks the document skill to expand the supported knowledge about
that subject:

```text
mode          explore
subject       invoice_1
fact families installed by the document skill
policy        run all applicable extractors
effects       forbidden
```

Actors may then establish facts such as:

```prolog
ceo.aven.docs.document(invoice_1)
ceo.aven.docs.document_profile(invoice_1, xrechnung)
ceo.aven.bookkeeping.invoice_details(invoice_1)
ceo.aven.bookkeeping.invoice_validation(invoice_1)
ceo.aven.parties.party_match(invoice_1, supplier_42)
```

Each predicate is backed by a committed artifact whose output slot names a canonical,
versioned schema. A predicate without a validated artifact or admitted ingredient is
not a fact available to downstream planning.

The enrichment result enables, but does not execute, further goals:

```prolog
ceo.aven.bookkeeping.invoice_details(invoice_1)
ceo.aven.bookkeeping.invoice_validation(invoice_1)
  -> ceo.aven.bookkeeping.create_entry(invoice_1)

ceo.aven.bookkeeping.invoice_details(invoice_1)
ceo.aven.parties.party_match(invoice_1, supplier_42)
  -> ceo.aven.payments.prepare_payment(invoice_1)
```

These arrows describe action prerequisites. They do not grant permission, select an
Actor placement, or record that an action happened.

## Terms

| Term | Meaning |
| --- | --- |
| Source artifact | The immutable file or document supplied to the run |
| Supported fact | A predicate backed by an admitted ingredient or a schema-valid committed artifact |
| Enrichment | A non-effecting Actor invocation that adds supported facts, evidence, validation, or useful negative knowledge about the subject |
| Enrichment frontier | The set of eligible capability invocations whose requirements are currently satisfied and which may add knowledge |
| Saturation | The state in which no invocation remains on the enrichment frontier |
| Understanding bundle | The durable terminal account of facts, artifacts, evidence, coverage, conflicts, unresolved questions, and stopping reason |
| Affordance | A description of a useful next action whose prerequisites are evaluated against supported facts and current authorization |
| Directed request | A request that names one or more exact predicates and therefore changes planning priority and completion behavior |

“Supported” does not mean infallible. Deterministic parsing, model inference, and human
input carry different evidence and confidence. Consumers decide which support is
sufficient for their operation.

## Run every applicable extractor

The initial policy is intentionally simple: run every applicable, authorized,
non-effecting extractor. Run each capability once for a distinct capability version,
configuration, and set of input bindings. When an output makes another extractor
applicable, run that extractor too. Stop when no new extractor is applicable.

There is no utility ranking, cost threshold, or effort setting in the first version.

A capability invocation belongs on the enrichment frontier only when all of the
following are true:

- its required predicates and input slots can be bound to admitted or committed
  artifacts;
- it belongs to a fact family installed for the document skill;
- the current principal may invoke the capability, read every input, and publish every
  declared output in the chosen execution environment;
- its operation is `observe` or `transform`, not `effect`;
- its applicability constraints accept the subject or a derived artifact; and
- the same capability version, configuration, and input bindings have not already
  reached a terminal observation in this run.

“Every applicable extractor” does not mean every installed Actor. A spreadsheet
extractor becomes applicable after the system finds spreadsheet content. An invoice
extractor becomes applicable after invoice classification. A terminal recognition
report such as `ruled_out`, `malformed`, or `unsupported` prevents the same probe from
running again with identical inputs.

An invocation may derive new artifacts that expose another frontier. The runner
therefore repeats:

```text
resolve current supported facts
  -> select an eligible frontier invocation
  -> invoke the Actor
  -> validate and atomically commit its outputs and provenance
  -> project supported facts and negative observations
  -> refresh authorization, artifact access, and Actor availability
  -> resolve the frontier again
```

Independent frontier invocations MAY run concurrently when their declared access,
resource, ordering, and publication semantics permit it. Concurrency MUST NOT change
the canonical terminal result.

### Stopping reasons

Every run stops with one of these reasons:

| Reason | Meaning |
| --- | --- |
| `saturated` | No eligible invocation can add supported knowledge under the admitted scope |
| `needs_input` | Further enrichment requires a human answer, password, consent, or unavailable artifact |
| `no_authorized_route` | Relevant capabilities exist, but none can be admitted with the current access, assurance, entitlement, or placement |
| `capability_unavailable` | The required Actor or execution environment disappeared and no alternative remained |
| `failed` | A non-recoverable validation, publication, or runtime failure prevented a trustworthy terminal bundle |
| `cancelled` | The user or authorized caller stopped the run |

Future bounded execution may add another explicit stopping reason. It must not change
what `saturated` means.

## Knowledge, evidence, and conflict

Every committed enrichment result MUST identify:

- the canonical output schema and version;
- the source and derived artifact IDs used as inputs;
- the Actor definition, capability, method, configuration, and execution placement;
- the production run and attempt that committed it;
- confidence at the narrowest granularity supported by the schema;
- evidence locators for values derived from document content; and
- validation findings, including uncertainty and internal contradictions.

Evidence locators SHOULD prefer a native machine-readable path when one exists. Page
regions and text spans support rendered or OCR-derived values. A canonical value may
retain more than one independent evidence item.

Enrichment MUST NOT silently overwrite a conflicting value. Conflicting supported
artifacts remain immutable and are represented in the understanding bundle. A
schema-specific resolver may publish a preferred interpretation with its own evidence
and policy, but the earlier evidence and alternatives remain inspectable.

## The understanding bundle

The terminal output is a canonical, schema-bound understanding bundle. It records the
subject artifact, run and catalog revision, status and stopping reason, supported
predicate/artifact/schema triples, confidence where available, negative observations,
unresolved questions, and conflicting artifacts. The concrete wire schema remains a
separate versioned contract.

`complete` means enrichment saturated under the recorded registry, authorization,
placement, and policy snapshot. It does not claim that no future Actor, new permission,
or later external fact could add knowledge.

## Affordance discovery

After the understanding bundle reaches a terminal state, the product resolves useful
next actions. This is a separate planning query over current action definitions, the
facts established by this run, relevant facts from previously enriched artifacts,
authorization, entitlements, assurance, available placements, and Actor offers. An
affordance may therefore emerge from the relationship between a new document and the
customer's existing working knowledge, not only from the new document in isolation.

An affordance MUST identify:

- the stable action or skill reference and a human-facing description;
- the exact supported facts that make it applicable;
- the proposed goal predicates;
- whether execution is non-effecting, prepares an effect, or commits an effect;
- any confirmation, assurance, permission, external connection, or additional input
  still required; and
- whether an authorized route is available now.

The product groups the result into three useful sets:

| Set | Meaning |
| --- | --- |
| Available now | The facts and an authorized execution route exist; selecting the action can start or preview it |
| Requires a decision | The facts exist, but the action needs confirmation, effect approval, placement choice, or step-up assurance |
| Could become available | A known action is blocked by a named missing fact, artifact, connection, entitlement, or Actor |

The primary post-enrichment presentation shows actions that are available now and
those that require a user decision. It MAY show blocked actions when the missing
requirement is useful and actionable. It MUST NOT claim that an action is available
merely because its label is registered. When an existing artifact helps enable an
action, the explanation identifies that artifact or a safe human-readable description
of it and the facts it contributes.

Affordance discovery itself causes no effect. Selecting an affordance creates a new
directed request or opens the required continuation. Scheduling a payment, sending a
message, writing to bookkeeping, or mutating another system never occurs as a side
effect of document enrichment.

## Directed and hybrid requests

An explicit request such as “validate this invoice” supplies exact goal predicates in
addition to the source artifact. The planner uses those predicates to prioritize the
shortest authorized enrichment route that can establish them:

```prolog
ingredient  ceo.aven.docs.file(invoice_1)
goal        ceo.aven.bookkeeping.invoice_validation(invoice_1)
```

Directed execution reuses the same capability contracts, schema validation,
provenance, checkpoints, and Artifact Store publications. It is not a separate
document-processing implementation.

A directed request may use one of two explicit completion policies:

- `goal_only`: stop when every exact goal is proven or no authorized proof remains;
- `goal_then_enrich`: prove the exact goals first, then continue the exhaustive
  artifact-first policy before deriving affordances.

The artifact-first upload experience uses exhaustive exploration. A direct automation
or latency-sensitive caller may choose `goal_only`. The runner MUST NOT infer a
different completion policy from conversational wording after admission.

## Proposed start contract

The generic Plan Runner requires a versioned goal specification rather than a magic
predicate for “understand everything.” The target shape is:

```ts
type GoalSpec =
  | {
      mode: 'explore'
      subject: { predicate: string; artifactId: string }
      factFamilies: string[]
    }
  | {
      mode: 'exact'
      goals: string[]
      completion: 'goal_only' | 'goal_then_enrich'
    }
```

The admitted request still obtains principal, entitlements, grants, assurance, and
physical customer routing from trusted boundaries. A caller cannot enlarge the Actor
set or artifact access by naming broader fact families.

`explore` means run every applicable, authorized `observe` and `transform` capability;
it never admits `effect`. A later protocol version may add a policy reference for
bounded execution without changing this initial meaning.

## Invoice example

Given only `ceo.aven.docs.file(invoice_1)`, the document skill may proceed as follows:

1. A file inspector validates the actual container and media type.
2. Native extractors expose XML attachments, PDF text, metadata, and page images.
3. Recognizers classify the document and determine whether an XML payload is a
   supported XRechnung.
4. Applicable domain extractors publish canonical invoice details. A structured
   parser is preferred evidence when valid XRechnung exists; text or vision Actors can
   contribute fields and independent evidence where applicable.
5. Validators recompute totals and taxes and publish findings without overwriting the
   extracted values.
6. Authorized entity resolvers may link the supplier or purchase-order reference to
   existing domain artifacts.
7. The runner repeats until no eligible document capability remains, then commits the
   understanding bundle.
8. The affordance resolver may offer validation review, bookkeeping entry creation,
   purchase-order comparison, duplicate or payment-status checks, export, and payment
   preparation according to the facts and routes that now exist.

If payment preparation is offered, selecting it starts a separate directed run.
Committing the payment remains an explicitly admitted effect.

## Target journey: from an invoice image to reconciliation

The intended experience composes many Actors, schemas, and skills without presenting
their machinery to the user.

The exact target schemas, matching algorithm, automatic-decision boundary, continuous
operation, and rollout are specified in
[Automatic invoice-to-bank-transaction reconciliation](invoice-statement-reconciliation.md).

1. A person drops an image into the chat. The product creates an Intent, or attaches
   the image to the active Intent, and publishes the image as its immutable source
   artifact. The image remains an artifact; the Intent is the durable context that
   contains the source, conversation, run, and later decisions.
2. The document skill inspects the bytes, decodes the image, recognizes an invoice,
   and publishes typed artifacts for its pages, visible text, document class, parties,
   invoice fields, amounts, dates, payment references, and validation findings.
3. Every derived value retains its schema, source image or page region, confidence,
   Actor and method, and production run. A supplier resolver may also link the printed
   party to an existing party artifact without erasing the printed evidence.
4. Bank statements imported in earlier Intents have already passed through the same
   artifact-first process. Their account identity, periods, balances, and transaction
   rows exist as typed, provenance-bearing artifacts.
5. Affordance discovery finds that an installed reconciliation skill can consume the
   new invoice details together with authorized bank-transaction facts. It also finds
   an executable Actor route. The product can now offer: “Try to match this invoice
   with transactions from your imported bank statements.”
6. If the person selects that action, a directed reconciliation run compares amount,
   currency, dates, payment references, counterparty identity, and other supported
   evidence. It publishes ranked reconciliation candidates rather than declaring a
   match by side effect.
7. A high-confidence candidate can be presented for review. Accepting it may start a
   separately admitted effect that records the reconciliation in bookkeeping.

The logical composition might contain these facts:

```prolog
% Facts established for the newly uploaded image
ceo.aven.docs.file(invoice_image_1)
ceo.aven.docs.document_classification(invoice_image_1, invoice)
ceo.aven.bookkeeping.invoice_details(invoice_image_1)
ceo.aven.parties.party_match(invoice_image_1, supplier_42)

% Facts established by earlier statement-ingestion runs
ceo.aven.banking.account_statement(statement_7)
ceo.aven.banking.transaction(statement_7, transaction_83)

% An action whose prerequisites are now satisfiable
ceo.aven.bookkeeping.invoice_details(I)
ceo.aven.banking.transaction(S, T)
  -> ceo.aven.bookkeeping.reconciliation_candidates(I)
```

The reconciliation capability binds its output to a canonical candidate schema. A
candidate records the invoice and transaction artifact IDs, match dimensions, score,
supporting and conflicting evidence, and the capability that produced it. Other
consumers can inspect those semantics without depending on the implementation that
performed the comparison.

This journey does not require one Actor to understand invoices, search statements,
resolve parties, rank matches, and write bookkeeping state. The document skill creates
reusable typed knowledge; the reconciliation skill declares what knowledge it needs;
the planner composes the available Actors; and the runner preserves the resulting
lineage across Intents and execution environments.

## End-to-end proof strategy

Artifact-first enrichment is only useful if the complete composition is testable. Its
primary proof is an end-to-end corpus that enters through the same product boundary as
an uploaded document and observes only durable, caller-visible results. Unit tests for
extractors, schemas, planners, and views remain necessary, but they do not replace this
rail.

The proof strategy has two complementary suites:

| Suite | Actors | When it runs | What it proves |
| --- | --- | --- | --- |
| Deterministic conformance E2E | Deterministic decoders, parsers, validators, resolvers, and reconciliation Actors only | Every merge | The product and runtime mechanics compose correctly and reproducibly |
| Provider-backed golden E2E | The production model gateway and selected real LLM or vision model | Extended CI and before release | The current prompt, model, schema, and evidence path still recover the required semantics from representative documents |

Both suites use the same canonical schemas, Artifact Store procedures, run protocol,
understanding bundle, affordance resolver, and semantic expectation format. A test-only
Actor may replace a nondeterministic production Actor, but it MUST advertise the same
capability contract and publish through the same validation and persistence path. A
test MUST NOT inject the expected terminal bundle directly.

### Golden corpus

Every corpus case contains immutable source artifacts and hashes, source provenance,
the admitted Intent and Actor catalog profile, and the expected normalized
understanding bundle, affordances, and follow-up result. Expectations compare semantic
values, relationships, evidence, and provenance roles—not generated IDs, timestamps,
durations, or provider request IDs.

The minimum compositional case contains:

1. a deterministic machine-readable invoice, such as a synthetic XRechnung;
2. a deterministic account statement containing one matching transaction, one
   plausible distractor, and one clearly unrelated row;
3. an earlier Intent that ingests and enriches the statement to canonical transaction
   artifacts;
4. a later Intent that ingests and enriches the invoice;
5. an affordance result that offers reconciliation because both required fact families
   and an authorized route exist; and
6. a selected reconciliation action that produces a ranked candidate with explicit
   supporting and conflicting evidence without committing an effect.

The merge-blocking corpus SHOULD also contain an invoice image. When stable OCR or
vision is not available in ordinary CI, a deterministic test Actor may return the
versioned extraction result for that exact source hash. This proves image routing,
publication, replanning, and downstream composition; it does not prove OCR or vision
quality. The provider-backed suite proves the actual model lane against the original
image.

### Deterministic conformance E2E

The deterministic suite MUST run without network access, provider credentials, random
model output, or wall-clock-sensitive decisions. It exercises the complete supported
boundary for each execution environment under test:

```text
chat attachment
  -> Intent and immutable source artifact
  -> admitted enrichment run
  -> Actor discovery and repeated frontier planning
  -> schema validation and atomic Artifact Store publication
  -> saturation and durable understanding bundle
  -> cross-Intent affordance discovery
  -> selected reconciliation run
  -> ranked reconciliation-candidate artifact
```

For the golden invoice and statement journey, the suite MUST assert:

- every source and derived artifact is stored under the expected schema and linked to
  its production run;
- each supported predicate is backed by an admitted or committed artifact;
- field evidence resolves to the correct source path, text span, or page region;
- Actor and capability provenance survive normalization and replay;
- the frontier reaches `saturated` and identical terminal observations do not run
  again;
- no `effect` capability is invoked during enrichment, affordance discovery, or
  reconciliation-candidate generation;
- the reconciliation affordance is absent or explicitly blocked before statement
  facts exist and available afterward;
- selecting the affordance starts a separate directed run;
- the matching transaction ranks ahead of the distractor for the expected reasons;
- replay with the same idempotency inputs returns the same canonical outcome without
  duplicate publications; and
- local and server placements produce equivalent normalized facts, relationships,
  stopping reasons, affordances, and provenance roles wherever both placements claim
  support.

The happy-path journey is only one corpus slice. Deterministic E2E coverage MUST also
exercise this failure matrix:

| Area | Required cases | Required assertion |
| --- | --- | --- |
| Input | Corrupt bytes, unsupported format, encrypted document, empty document | Typed terminal or continuation state; no invented domain facts |
| Applicability | Extractor rules input out, no extractor applies, several extractors apply | Correct frontier and saturation; no repeated identical probe |
| Extraction | Schema-invalid output, missing evidence, low confidence, contradictory values | Invalid output is not promoted; uncertainty and conflicts remain visible |
| Authorization | Unreadable artifact, unauthorized preferred Actor, expired grant, missing assurance | Denied route never executes; authorized fallback or explicit blocked reason |
| Availability | Actor disappears before invocation, retryable failure, permanent failure | Replan or truthful terminal state without duplicate publication |
| Durability | Crash before publication, after publication, and before checkpoint; restart and replay | No lost committed result, duplicate artifact, or repeated effect |
| Concurrency | Duplicate starts and independent extractors completing in different orders | One canonical outcome and stable provenance relationships |
| Affordances | Missing statement facts, missing route, newly available prior facts | Reconciliation is offered only when its declared prerequisites and route exist |
| Effect boundary | An applicable effect Actor is present in the catalog | It is never invoked by enrichment or affordance discovery |
| Placement | Equivalent local/server catalogs and deliberately different catalogs | Equivalent normalized outcomes when support matches; explicit difference when it does not |

Every case asserts both the expected durable result and the absence of false facts,
orphan publications, unauthorized invocations, duplicate work, and misleading
affordances.

Deterministic scheduling controls MAY fix clocks, IDs, Actor completion order, and
retry decisions for the test. Those controls must enter through explicit runtime ports;
production code must not detect fixture names or source hashes except inside a clearly
identified deterministic test Actor.

### Provider-backed golden E2E

The extended suite runs the original golden files through the actual configured model
gateway and production prompt/schema path. It MUST record the provider, exact model
identifier, model capability metadata, prompt version, schema version, Actor version,
placement, and run time with the result.

LLM output is compared semantically rather than as serialized JSON. Each fixture names
its required fields, optional fields, normalization or tolerances, evidence coverage,
and expected reconciliation ordering. Missing or unexpected values, schema failures,
unsupported evidence, contradictions, and changed affordances are reported as drift.
The release suite SHOULD repeat nondeterministic cases enough to expose intermittent
failures. It must not update a golden expectation from current model output.

A model, prompt, or schema change requires an explicit golden review. An expectation
changes only when the intended product semantics changed or the previous expectation
was wrong, never merely to make the current provider pass.

### Honest proof boundaries

The deterministic suite proves the pipeline, contracts, state transitions, lineage,
cross-skill composition, and user-visible affordances for its test catalog. A
fixture-specific deterministic vision Actor does not prove visual understanding.

The provider-backed suite proves that the named model and configuration met the golden
expectations during those recorded runs. It does not prove deterministic behavior,
all document layouts, every language, or future provider performance. Provider failure
or missing credentials is reported as missing release evidence, not converted into a
passing deterministic result.

The repository's broader Actor rails and portable-outcome comparison are specified in
[Actor runtime proof strategy](actor-runtime-proof-strategy.md). The artifact-first
corpus extends those rails through saturation, affordance discovery, and cross-Intent
skill composition.

## Runtime and product requirements

An implementation conforms to this draft when it can demonstrate that:

1. uploading a supported document without an exact goal starts exhaustive enrichment;
2. alternative native, text, and visual routes publish compatible canonical schemas;
3. newly derived artifacts can unlock further Actor capabilities without a
   document-specific coordinator branch;
4. repeated planning reaches a deterministic fixpoint and does not repeat terminal
   observations with identical bindings;
5. unauthorized Actors and unreadable artifacts are absent from the executable
   frontier and visible only through safe stopping or blocking explanations;
6. no `effect` capability runs during enrichment or affordance discovery;
7. every presented action cites the current and previously established supported facts
   and current route that enable it;
8. conflicting or low-confidence values remain inspectable rather than being silently
   promoted;
9. restart and replay preserve committed artifacts, provenance, frontier decisions,
   and the terminal understanding bundle; and
10. a directed request uses the same machinery while prioritizing its exact goals;
11. the deterministic golden corpus passes through the complete product and
    persistence boundary without provider access; and
12. the provider-backed suite reports semantic accuracy and drift separately from the
    deterministic conformance result.

## Future bounded execution

The first implementation always runs all applicable extractors. Capability contracts
and the versioned goal specification leave room for a later policy to consider cost,
time, privacy, confidence, or expected information gain. Those measurements and their
stopping rules belong in a separate specification when the product needs them. They
must not complicate or create hidden limits in the initial exhaustive path.

One useful future measurement is an extractor's **expected signal yield**: a
calibrated estimate of how much useful, novel, schema-valid information an invocation
is likely to add before it runs. The estimate could learn from prior observations for
similar media types, layouts, languages, source systems, earlier recognition facts,
and extractor versions. Over time, recurring patterns could make high-yield routes
predictable enough to order the frontier intelligently or spend a bounded budget
where it is most valuable.

Signal yield is planning telemetry, not evidence and not extraction confidence. It
must never turn a predicted field into a fact, and it should be calibrated against
observed outcomes such as new supported fields, coverage gained, conflicts introduced,
and downstream affordances unlocked. Cold-start and poorly calibrated estimates fall
back to the exhaustive policy. Adding this signal later therefore changes ordering or
explicit stopping policy, not capability applicability, provenance, or the meaning of
a completed extraction.
