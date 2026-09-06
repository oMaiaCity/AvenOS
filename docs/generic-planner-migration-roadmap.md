# From the document coordinator to generic skill execution

Status: proposed migration roadmap, based on source inspection at `6f4047a6863105323af7dc2bd683df51f996c468`. Prepared 2026-09-05. No implementation changes were made for this document.

Implementation checkpoint: the initial validator-only slice is no longer the stopping
point. Document ingestion, scoped retrieval, ranking and explicit relationship review
now execute through the general observation solver on both hosts. The sections below
retain the migration rationale and broader target; use the
[current architecture](document-ingest-system.md#what-documentprocessingruntime-is)
and [validation boundaries](invoice-statement-reconciliation.md#current-executable-flow-and-validation-boundaries)
for present behavior. Arbitrary skill installation, per-step distributed claims and
automatic accounting allocation are not implied by this checkpoint.

Follow-up, 2026-09-06: section 11 makes the first migration slice concrete, including extraction provenance, publication bindings, a four-scenario probe of the real Actors, and proposed merge gates. It uses the same inspected source revision, not a newly verified upstream snapshot.

## Destination

avenCEO should reconcile invoices and bookings as an installed skill. The same generic planner and execution engine should discover and run that skill's Actors in the Tauri app or in Actor Runner on a server. Installing a new recognizer, extractor, or reconciliation capability should change the available routes without requiring changes to a document coordinator or to the generic engine.

That is the destination of this roadmap. The existing shared `DocumentProcessingRuntime` is a working migration baseline, not the final architecture. Wrapping that entire coordinator in one generic Actor would preserve its portability but would not achieve the goal.

There are two distinct completion gates:

1. **Generic document execution:** today's useful document behavior runs through catalog discovery, fact-driven planning, factories, publication, checkpoints, and the same run protocol on both hosts. The old coordinator is no longer the production execution path.
2. **Generic reconciliation skill:** real retrieval, matching, review, and recorded relationships compose through that engine, reaching the useful quarter-completion experience of the prototype. Automatic acceptance is a later, separately validated policy on that same skill.

This refines the sequencing in the earlier [architecture review](actor-planner-architecture-review.md). Its findings remain relevant, but the suggested application-coordinator-first reconciliation milestone is not the chosen end state. The [reconciliation review](invoice-reconciliation-review.md) supplies the domain correctness backlog; this document explains how to reach generic execution without losing what already works.

## 1. What exists today

### There are two execution systems, not two host implementations of one engine

| Entry | Actual execution path | What is shared |
| --- | --- | --- |
| Tauri document import, Local | `DocumentExecutionRouter` → `InProcessDocumentExecutionHost` → `DocumentProcessingRuntime` → document Actors | Domain coordinator, Actor implementations, model contracts, artifact semantics |
| Tauri document import, Server | `RemoteDocumentExecutionHost` → Tauri command → facade → SQL runner → application skill dispatch → `createDocumentSkillExecutor` → `DocumentProcessingRuntime` | Same domain coordinator and Actors, with server decoder, model and publication adapters |
| Generic test/application executor | `createActorPlanExecutor` → authorized registry → logical/physical planner → `executePhysicalProgram` → factory Actors → publication | Portable generic engine; tests compose local and server environments |

The real remote document path is already implemented. It does not run an emulated server on the desktop. The reason generic execution is incomplete is different: the deployed server deliberately dispatches the document skill to the application coordinator, while its generic fallback has an empty, deny-by-default host. The desktop document path bypasses the generic executor too.

Evidence: [app composition](../app/src/lib/artifacts/client-document-processing.ts), [document execution hosts](../libs/aven-document-ingest/src/execution.ts), [server composition](../services/actor-runner/src/index.ts), [application dispatch](../services/actor-runner/src/application-executor.ts), [generic host](../services/actor-runner/src/host.ts), and [generic executor](../libs/aven-actors/src/executor.ts).

### Four meanings of “skill” currently overlap

| Representation | Current job | Target relationship |
| --- | --- | --- |
| App `SkillDef` / workflow nodes | Human-facing catalog, workflow views, derived graph edges; includes mocked `abgleich` | Presentation and intent interface to one installed executable skill |
| Qualified `skillRef` in a run command | Names an admitted unit of work | Stable identity resolving to a versioned installed skill specification |
| `ApplicationSkillExecutor` | Dispatches a skill directly to handwritten orchestration | Temporary migration adapter; not the permanent document/reconciliation scheduler |
| Actor capability catalog and affordances | Describes operations and potentially executable next actions | Authoritative source of executable routes, filtered by skill scope and host policy |

The app's `abgleich` entry currently declares `statement → match → tick` nodes in [mocked skills](../app/src/lib/skills/mocked.skills.ts). It is not a binding to the production ranking Actor. Likewise, the word `reconcile` in the UI registry's catalog comparison is not financial reconciliation.

The target should connect these representations, not add a fifth unrelated skill registry. The installed skill specification should name its user-facing identity, accepted requests, admitted capability families, default goal/completion policy, views, and action definitions. The runtime decides the actual steps from contracts and evidence.

### The reusable foundations are substantial

Keep the qualified IDs, definition/instance/factory split, immutable registry snapshots, placement choice, portable run protocol, authenticated remote path, Artifact Store, decoder/model adapters, and real domain transformation code. Keep the existing parity tests as migration evidence. None requires starting again.

The generic core already performs bounded goal search and static enrichment, chooses authorized targets, binds one artifact per slot, rechecks spawn/invoke policy, and publishes before advancing. The missing work is both integration and semantics: some responsibilities have no generic implementation, while others have contracts that do not yet match their consumers.

## 2. Dissecting the document coordinator

`DocumentProcessingRuntime` does considerably more than invoke Actors. It owns the following decisions and bookkeeping. Each needs an explicit replacement before the class can be removed.

| Responsibility now embedded in the coordinator | Current mechanism | Destination |
| --- | --- | --- |
| Decide whether vision is available | Check optional Actor instances, model status, and page limit | Factory offers/admission plus versioned model-availability observations and application policy |
| Determine whether processing may continue | Inspect `DecodedDocument.outcome` | Committed inspection report with projected readability/outcome facts |
| Carry decoded content between steps | Keep `document.pages`, text runs, and rendered images in memory | Artifact-backed representations or explicitly reproducible, versioned materialization |
| Expand work over pages | `for` loops over decoded pages | Dynamic collection membership, per-member bindings, and generic frontier scheduling |
| Pick model versus deterministic page processing | `useModel` branch and method names | Capability applicability, policy, recorded failure outcomes, and alternative implementations |
| Isolate model failures | Handwritten `try/catch`, fallback calls, and dependency pruning | Attempt outcomes, independent frontier progress, and declarative fallback eligibility |
| Choose page representations | Arrays selecting model text or native fallback | Domain representation-selection operation with explicit evidence and completion state |
| Assemble a whole document | Gather arrays and explicit stage dependencies | Sealed representation collections and a domain assembly Actor |
| Select invoice versus statement extraction | Branch on `resolvedKind` and an invoice-family list | Projected classification facts and guarded extraction capability contracts |
| Construct every method payload | Supply `document`, `pages`, `candidate`, `details`, `validation`, and offsets | Typed slot adapters; all semantic inputs declared and recoverable |
| Publish 64-row statement batches | Offset loop over extracted transactions | Explicit batch/member artifacts and generic per-batch invocation |
| Retry selected model methods | Hardcoded method-name set and delay schedule | Declared attempt policy, owned by the execution engine |
| Name steps and publications | Stage strings and hashes over source/inputs | Durable run, segment, invocation and publication identities |
| Publish lineage and model receipts | `#step` combines inputs, artifacts, evidence, receipt | Generic publication contract preserving the same information |
| Update the UI | Mutate `ArtifactProcessingPresentation` throughout execution | Run-event projection with domain labels/views outside the scheduler |
| Decide completion/review state | Inspect domain payloads and failed stages | Generic stopping outcome plus a domain understanding/quality report |

Source: [coordinator](../libs/aven-document-ingest/src/runtime.ts), particularly `#run` and `#step`.

Not everything belongs in the planner. Choosing how invoice fields normalize is domain logic. Tracking which invocations completed is execution logic. Decoding a PDF is an Actor/host capability. Choosing which eligible capability runs next belongs to planning. Maintaining these boundaries avoids recreating the coordinator as a collection of domain switches inside `libs/aven-actors`.

## 3. Why the current Actor catalog cannot simply be plugged in

I inspected the manifests of all 16 document/reconciliation Actors with model Actors configured, without invoking decoding or a model. The common helper supplies slot metadata, but every method currently omits explicit operation mode and idempotency. Generic catalog compilation defaults those to `transform` and `none`. Real classification is observational; deterministic normalization and model inference need different retry/replay treatment.

### Actor-by-Actor migration inventory

| Existing Actor | Useful implementation to retain | Contract/integration work |
| --- | --- | --- |
| Document inspector | Byte inspection and browser/server decoding | Separate committed inspection from transient decoded content; expose actual outcomes, source/blob access, and fresh output identities |
| Document decomposer | Stable logical page construction and source-page evidence | Support many outputs and a closed page collection; require readable inspection; stop depending on an earlier in-memory `document` |
| Native text extractor | Text/layout generation, bounds and evidence | Rehydrate raw page representation or reproducibly decode from declared inputs; publish text blob and layout through generic output bindings |
| Page signal classifier | Deterministic page classification | Declare all hydrated inputs and distinguish page identity from file identity |
| Visual page analyzer | OCR, page classification/description, model receipt | Declare image/native-text/layout inputs, observation mode, multiple outputs and evidence; retain native and OCR occurrences separately |
| Document kind classifier | Finance taxonomy and confidence threshold | Repair predicate arity, declare rendered-page/text collections, and project accepted family/kind from the committed report |
| Document assembler | Bounded ordered text/layout assembly | Many inputs with known membership and explicit ordering; declare layout/source dependencies as well as text |
| Content aggregator | Conservative aggregation of page classifications | Scope every member to one document; wait for a completed collection and retain missing/failed-member coverage |
| Invoice extractor | Rich invoice candidate/details, date normalization, model evidence | Require an accepted invoice-family observation; bind actual images/text and expected kind; adapt two output slots |
| Statement extractor | Rich account/transaction/FX extraction | Require statement-family observation; bind images/text; preserve coverage and row-limit information |
| Invoice validator | Existing deterministic checks | Adapt slot/result format; keep validation observations separate from accepted accounting truth; strengthen checks through domain backlog |
| Statement validator | Existing consistency checks | Same adapter work; preserve unknown operands and coverage rather than equating successful invocation with complete data |
| Open-item normalizer | Canonical financial output | Bind candidate/details/validation explicitly; resolve amount/identity issues before downstream acceptance depends on them |
| Statement normalizer | Account and transaction normalization | Bind candidate/validation; preserve occurrence identity and unresolved account/coverage semantics |
| Statement transaction fan-out | Bounded publications and row evidence | Model batch requests/offsets as explicit inputs; many outputs; prove completion independently of one batch finishing |
| Reconciliation ranker | Deterministic comparisons and explanations | Bind a scoped candidate collection; support many inputs/outputs with per-member associations; use the production ranker, not the test scoring function |

Sources: [registry](../libs/aven-document-ingest/src/actors/registry.ts), [shared contracts](../libs/aven-document-ingest/src/shared.ts), and the implementations beneath [document Actors](../libs/aven-document-ingest/src/actors/README.md).

### Specific mismatches that the coordinator currently conceals

**Message and result shapes differ.** Generic invocation sends `ActorStepPayload.inputs`, `parameters`, and `configuration`; a document handler expects method-specific top-level fields such as `payload.document`. Generic output is a named `outputs` object; document output is `DocumentActorResult` containing artifact drafts, evidence, and optionally a decoded document or model receipt. The executor does not translate these automatically.

**The kind classifier has no matching built-in text producer under its current predicate.** It requires `extracted_text(F, T)`. Native/visual page producers declare `extracted_text(F, P, T)`; the assembler declares `document_text(F, T)`. Arity is meaningful to unification. The coordinator bypasses this mismatch by directly supplying the pages array.

**Classification report existence is not an extraction guard.** Invoice and statement extractors both require the same generic `document_classification(F, C)` predicate. Their manifests do not distinguish which family the report established. The coordinator supplies the distinction with its `resolvedKind` branch. Registering both without fixing this would not transfer that knowledge to the planner.

**Collection scope is under-specified.** Content aggregation takes page classifications and a document-text fact, but its requirements do not relate those pages to that file. The coordinator's local arrays currently supply this relationship. A generic join over facts from several documents needs explicit parent/member relations.

**Some required bytes are not committed at their apparent stage boundary.** Inspection commits outcome, media type, readability, page count, and encryption state. Its separate `document` result carries text runs/images. Page artifacts contain page number, rotation, and dimensions, not those decoded runs/images. Resuming from inspection/page IDs therefore requires a declared materializer or additional durable representation artifacts; the metadata alone cannot recreate the next payload without more work.

**The understanding facts are currently presentation-oriented.** The document server adapter maps derived types to bare predicate functors without file/page/output arguments. Those summaries do not provide the grounded relationships required by the current method contracts.

**The publication interface is narrower than production document output.** Generic drafts have a schema, predicate and value, but no explicit blob/evidence/model-receipt channel. The generic Artifact Store adapter currently sends `blob: null`, empty evidence, and empty parameters. Adapting a document result by dropping those fields would regress the existing product's evidence quality.

Evidence: [generic payload/result/publication interfaces](../libs/aven-actors/src/executor.ts), [document shared result and manifest](../libs/aven-document-ingest/src/shared.ts), [kind classifier](../libs/aven-document-ingest/src/actors/document-kind-classifier/index.ts), [inspector](../libs/aven-document-ingest/src/actors/document-inspector/index.ts), [decomposer](../libs/aven-document-ingest/src/actors/document-decomposer/index.ts), [aggregator](../libs/aven-document-ingest/src/actors/content-aggregator/index.ts), [document fact summary](../libs/aven-document-ingest/src/server.ts), and [generic publication adapter](../services/actor-runner/src/artifact-store-port.ts).

## 4. The target execution model

The following contracts are proposed requirements, not claims about existing APIs. Their exact type names and wire versions should be settled in the first implementation slice.

### An installed skill contributes knowledge about work, not a hidden scheduler

A skill package contributes:

- Its identity, request schema, accepted source types, exact goals or exploration scope, and completion policy.
- Canonical capability definitions and local/server factory bindings.
- Versioned artifact schemas and trusted fact projectors.
- Domain applicability/resolution operations, such as recognition or selecting a page representation.
- Affordance definitions, human-review schemas, and presentation adapters.

The engine admits that package and request under the user's authority. It must not let arbitrary request-provided fact-family lists broaden the installed skill's scope. Executable projectors and adapters are trusted installed code, not snippets supplied by document content or an LLM response.

At the destination, dispatch by `skillRef` resolves this specification. It does not choose a document-specific `execute()` function that schedules the whole workflow. During migration the old dispatch can remain explicitly labelled as legacy, with fixed placement and no silent host fallback.

### Distinguish three kinds of output binding

| Binding kind | Example | Planning rule |
| --- | --- | --- |
| Input-derived identity/value | The output belongs to the same input file | Substitute the established input binding |
| Fresh artifact identity | A new inspection/report artifact ID | Use a typed fresh output reference; bind it to the committed artifact, never treat it as an arbitrary matching wildcard |
| Observed semantic value | Inspection outcome, recognized format, extracted document kind | Remains unknown until the actual report is committed and projected |

This matters because the current contracts use output-only variables for both new artifact IDs and unknown values. Rejecting every output-only variable would reject legitimate producers. Allowing every such variable to unify freely invents facts. The compiler must distinguish them.

A supported fact should retain its grounded arguments, schema, artifact occurrence, production/projection version, and supporting relation to the subject. One artifact may support several facts. Two artifacts may support the same logical claim with different evidence. A state key containing only predicate strings cannot discard distinctions that affect schema compatibility, access, conflict, or chosen evidence.

Apply the same trusted projector after publication and after later resolution. Project source/parent relationships from committed lineage where necessary, not from stage-name conventions or caller expectations. Validate starting ingredients even when the goal already needs zero execution steps.

### One receding-horizon planning loop

For exact goals, identify relevant routes and unresolved observations; for exploration, identify all eligible non-effecting invocations within the admitted subject scope. Both use the same execution loop:

1. Load the committed checkpoint, grounded facts, previous invocation outcomes, and installed skill revision.
2. Refresh applicable artifact access, policy and available implementations.
3. Select an executable segment whose prerequisites are established. A segment may end with an observer; it must not include steps depending on an unknown observer result.
4. Persist segment/attempt identity, invoke through admitted factories, and validate outputs.
5. Commit outputs and provenance, recover any uncertain publication acknowledgement, and record the checkpoint.
6. Project new facts and explicit negative/failed observations; re-evaluate only unfinished work.
7. Finish with an accurate result or retain an input/approval/assurance continuation.

A static guaranteed-output segment remains useful. The change is to execute a sequence of justified segments, not fabricate the complete final graph at admission. For an exact request, backward relevance analysis can restrict which observers matter while retaining the current bounded search for the small executable portion. A wholesale general-purpose Prolog implementation is not a prerequisite.

The first exploration policy remains exhaustive over applicable non-effecting capabilities, as specified in [artifact-first enrichment](artifact-first-semantic-enrichment.md). Do not quietly replace it with a cheapest-extractor policy. Resource safety bounds must produce an honest partial/limit outcome, not false saturation. Exact-goal priority and exploration completeness are separate policies.

### Collections are a first-class scheduling requirement

Pages, representations, statement batches, transactions, and candidate sets require more than accepting an array in a slot:

- A collection has an identity/version, declared scope, stable member IDs, ordering where meaningful, and an explicit sealed/completion state.
- A map-style capability runs once for each admitted member with semantic invocation identity.
- A gather-style capability runs against the declared collection, not whichever matching facts happen to exist so far.
- Failed or missing members remain visible. A domain operation can produce a partial representation, but cannot call it complete merely because all currently available members were gathered.
- Independent producers may contribute different evidence for the same subject. Collection membership and preferred representation must not be selected by arrival order.

For initial implementation, use typed collection-manifest artifacts and bounded materialization of `many` slots. Existing page and transaction occurrence artifacts remain first-class outputs. Generic scheduling can expand members while domain Actors define what those members mean. Do not solve every invoice/transaction combination in the symbolic planner.

This also resolves statement batching: publish a batch plan or equivalent closed membership description, run one capability per batch, and record the resulting collection's completion. The engine should not contain `offset += 64`. Keep the current 128-row extraction and 64-output publication constraints visible until separately changed and tested.

### Preserve evidence while eliminating hidden memory dependencies

The recommended representation is immutable source plus versioned page/text/layout/image artifacts and collection manifests. Expensive rendering can have a host-local cache keyed by source digest, page, implementation and configuration; that cache must not be authoritative state.

A producer may instead reproduce a representation from immutable source bytes if that recipe, dependency and semantic version are explicit. It must not appear to resume from a page artifact while actually requiring an undocumented live decoder object. Model output already committed should be read back, not regenerated as though model calls were deterministic.

The generic publication contract must carry named outputs, role/ordinal bindings, blobs or staged blob references, evidence locators, non-secret parameters, implementation/configuration metadata, and model receipts. Keep upload credentials and live resources in host ports, outside portable commands and artifacts. Multi-output publication must preserve the current atomic output-set and evidence mapping semantics.

### Runtime decisions and domain decisions remain separate

| Generic engine decides | Domain package decides |
| --- | --- |
| Whether grounded prerequisites, target compatibility and policy permit invocation | Which report outcome means invoice-family, statement-family, or unsupported |
| Which relevant observer or exact-goal route runs next | Whether extracted accounting values are consistent or contradictory |
| When all members of a declared collection are terminal | Whether a partial page set is useful enough for a particular representation |
| How attempts, cancellation, continuations and publications are recovered | Which native/OCR interpretation is preferred, while retaining both |
| Whether an exact effect has current approval and execution authority | Whether a proposed invoice/payment relationship satisfies allocation rules |

This is still generic planning. Generic does not mean the engine discovers tax semantics or designs its own domain validators. It means adding those operations changes the admitted catalog and derived plan rather than the scheduler's source code.

## 5. Exact gap map

| Area | Current state | Required target change | Completion evidence |
| --- | --- | --- | --- |
| Goal logic | Independent matching of each goal | Shared conjunction bindings and scoped variables | Conflicting shared-variable goals fail; alternative witnesses handled correctly |
| Contract compilation | Multiple paths, partial machine/template parity | One canonical compiler with type/arity/binding validation | Template/factory/live registration yields the same contract |
| Executable reachability | Logical plan may use unsupported target/cardinality/schema | Host execution profile and compatibility participate before route acceptance | Cheap incompatible route rejected in favor of executable alternative |
| Observation semantics | Planned outputs can act as unknown-valued facts | Commit reports, project facts, replan at observation boundaries | Recognizer outcome determines the actual next segment |
| Fact identity and scope | Predicate strings dominate search; document summaries drop arguments | Occurrence-aware, subject-related supported facts | Two documents and several evidence versions cannot accidentally join |
| Collections | `many` metadata, one-artifact executor | Closed scoped collections, expansion/gather, output-member binding | Multi-page and 65-row cases run correctly without coordinator loops |
| Domain invocation | Method-specific payload/result conventions | Artifact-native handlers or thin one-operation adapters | Real Actors run through generic payload/result contracts |
| Blobs and provenance | Rich document publication, narrow generic publication | Preserve complete output/evidence/model receipt contract | Canonical graph/blob/evidence parity, including restart |
| Runtime policy | Test seams, empty generic product host | Installed skill scope and real host authorization/factories | Product catalog executes on both placements under current access |
| Failure handling | Generic loop aborts; document coordinator has selected fallbacks | Explicit attempts, negative outcomes, independent branch continuation | Model failure does not erase native output or invent finance facts |
| Enrichment stopping | Static closure and ancestry cutoff | Recorded invocation identity, admissible recursion and honest stopping outcomes | No repeat probe on same inputs; no false saturation at a safety limit |
| Durability | SQL admission and final checkpoint | Incremental segments, attempts, claims, fencing and publication recovery | Resume unfinished work across every commit/acknowledgement interruption |
| Local host lifecycle | In-process document host | Production local runner using shared engine/protocol and durable host state | App restart preserves run/continuation; no direct SQL credentials in client |
| UI projection | Coordinator-owned presentation; remote terminal result | Shared generic events/checkpoints with domain presentation adapters | Both hosts show explainable progress, failures and resumable review |
| Affordances | Proof may use facts omitted from returned action | Carry executable support and/or explicit retrieval request | Invoking an offered action works from its declared inputs after revalidation |
| Reconciliation | Normalizers/ranker plus framework fixture | Real query → rank → proposal → review → confirmed relationship skill | Completed-quarter journey on both generic hosts |
| Extensibility | New document branches need coordinator edits | Add capability package, schema/projectors, policy and host adapters | New recognizer/extractor works with no domain switch in core |

The first architecture review's A1–A14 provide detailed evidence for the generic-core rows. The Actor inventory and coordinator tracing above establish the additional application-integration rows.

## 6. Dependency-ordered implementation roadmap

These are acceptance-sized milestones, not calendar estimates. Several contain multiple reviewable PRs. Production cutover is gated separately from building a test slice, so development can proceed without prematurely exposing incomplete generic execution.

### R0 — Freeze the baseline and write the migration contract

**Depends on:** nothing. **Purpose:** make parity measurable and prevent an adapter that silently drops behavior.

Deliverables:

- A checked inventory of the 16 existing Actors, actual input data, output artifacts, limits, modes, and hidden coordinator dependencies.
- Canonical snapshots for the current document cases, with explicit normalization of nondeterministic IDs and host-specific metadata only.
- A versioned statement of intended changes versus behavior to preserve. Known reconciliation defects are not promoted to acceptance requirements.
- A supported-host/contract profile: initially factory targets, finite collections, one frozen placement, no arbitrary external effects.

**Gate:** a baseline comparison detects loss of text blobs, page/source links, model receipts, field evidence, warnings, and coverage—not merely a changed terminal status. The existing model-unavailable and model-failure cases remain part of the baseline.

**Primary locations:** document-lane and Actor conformance tests, [runtime proof strategy](actor-runtime-proof-strategy.md), document schema/Actor contracts. This roadmap is analysis input to R0, not a substitute for committed executable baseline tests.

### R1 — Make contracts and facts sound

**Depends on:** R0. **Purpose:** prevent an apparently generic plan from being semantically invalid.

Deliverables:

- One contract compiler, fixed goal conjunction/scoping, consistent arity, and explicit handling of fresh IDs versus observation values.
- Typed supported-fact references and subject/collection membership relationships.
- Explicit operation modes, retry categories, parameter schemas, input/output roles, and schema versions for the initial domain slice.
- Invocation identity based on capability/implementation version, normalized configuration, semantic parameters and concrete input identities—not the position of a step in an array.
- Physical planning that excludes unsupported contracts and incompatible routes before declaring a program or affordance executable.
- Correctly grounded zero-step success and actions carrying all required evidence bindings.

**Gate:** generated conjunction tests, template/live compiler parity, two-document isolation, independent evidence preservation, unsupported-schema/cardinality rejection, and action-discovery round trips pass. Catalog validation catches the current kind-classifier arity mismatch and unguarded invoice/statement alternatives.

**Primary locations:** `libs/aven-actors/src/{term,planner,registry,physical-planner,affordances}.ts`, `libs/aven-document-ingest/src/shared.ts`, document method declarations, and run protocol validation.

### R2 — Make real domain operations artifact-native

**Depends on:** the relevant R1 contracts. **Purpose:** connect real Actors without losing publication semantics.

Deliverables:

- Generic input/output/publication support for blobs, evidence, role ordinals, parameters and model receipts.
- Trusted application schema bindings and fact projectors, applied equally to newly committed and previously stored artifacts.
- Versioned page/representation contracts or explicit reproducible materialization, removing hidden decoded-document dependencies.
- Thin, per-operation adapters for existing handlers where needed. An adapter may map slots to `candidate` or load a declared blob; it may not call the next Actor, select an invoice branch, or loop over the whole document workflow.
- Initial local/server factories for real validators/normalizers, followed by decoding and extraction operations.

**Gate:** run a real invoice validator and normalizer through the generic executor on both host adapters using committed inputs. Destroy the Actor and caches, read outputs back, and obtain the same supported facts. Then prove one native-text operation preserves its text blob and layout/evidence. Use real Artifact Store integration, not only `MemoryArtifacts`.

**Primary locations:** generic executor and publication interfaces, `services/actor-runner/src/artifact-store-port.ts`, document Actor adapters/factories, Artifact Store schemas and app publication bridge.

This milestone proves interoperability, not generic document orchestration. Keeping that distinction prevents the smallest happy path from being declared a completed migration.

### R3 — Add observation-driven planning and finite collection execution

**Depends on:** R1 and the R2 artifact/operation contracts. **Purpose:** replace the coordinator's scheduling decisions.

Deliverables:

- A plan-segment loop that stops at unknown observations and continues from committed projected facts.
- Backward relevance filtering for exact goals and subject-scoped exhaustive exploration using the same execution machinery.
- Lazy/indexed requirement matching with budgets that include joins, not just explored states.
- Explicit collection manifests, stable member expansion, gather barriers, empty-result semantics, and partial collection outcomes.
- Versioned domain operations/policies selecting representations and mapping accepted classification to extractor eligibility.
- Attempt outcomes that support bounded retry, alternative routes, and independent branch continuation. Remove or explicitly suppress the Actor primitive's hidden retry so the engine owns observable attempts.
- Invocation deduplication including version/configuration/input bindings, plus explicit termination constraints for recursive capability families.

**Gate:** from the same source type, recognized invoice, statement, unknown, and unreadable outcomes produce different justified segments. A two-page file cannot assemble after only its first page arrives. Native evidence survives a vision failure. Two independent extractors remain independently evidenced. A 65-row statement schedules complete 64+1 publication without a statement-specific loop in the generic core. Budget exhaustion preserves committed progress and does not report saturation.

**Primary locations:** logical/physical planners, generic executor, run result/understanding contracts, collection schemas, and domain observation/selection Actors.

Recommended internal slices: single observer → single-page native route → sealed multi-page route → model/fallback route → invoice/statement guards → transaction batches. Each slice should run real operations from R2, not introduce a second miniature test-only domain implementation.

### R4 — Make the shared engine durable on both hosts

**Depends on:** R1 identities and R2 publication semantics. Can be developed alongside R3; R3's segments must use its repository/checkpoint interface before cutover.

Deliverables:

- A shared run lifecycle with repository ports for accepted requests, plan segments, attempts, outcomes, checkpoints, continuations and publication intents.
- SQL-backed worker claims, incremental checkpoints, fencing enforcement at state/publication commit, and recovery outside status-request composition.
- An explicit publication recovery protocol: persist exact intended output identity/body reference before publication; resolve an uncertain acknowledgement by publication identity; then checkpoint committed artifact IDs. Do not promise a cross-service transaction that does not exist.
- Claim-before-execute continuation handling, cooperative cancellation, and precise handling of uncertain outcomes.
- A production local runner exposed through the same `PlanRunnerClient` contract, with a customer-backed durable journal and device-bound execution ownership.
- Ephemeral secret/session ports, distinct from durable approval/input artifacts.

**Local persistence recommendation:** preserve the [customer-database invariant](customer-database-platform.md): the authoritative run journal stays in the selected customer database, while a device-bound worker runs the generic planner and Actors in Tauri. Add narrowly scoped run-repository operations through the authenticated service boundary; never expose database credentials or a generic SQL interface to the client. Server workers must not claim device-placed work. If the device or connection disappears, retain the checkpoint and report the unavailable worker honestly. Any native local cache is non-authoritative. Define device claims, renewed authority, and restart attachment before implementing this adapter. Offline authoritative execution would be a separate architecture decision, not an incidental consequence of Local placement.

**Gate:** common repository/runner conformance runs against memory, actual SQL, and the device worker's authenticated repository adapter. Inject process loss before invocation, after invocation/before publication, after publication/before checkpoint, and after checkpoint/before acknowledgement. Committed model outputs are not recomputed. Uncommitted model calls may repeat under explicit retry policy; do not claim exactly-once external computation. Continuations survive restart and cannot execute twice from concurrent submissions. Cancellation cannot be represented as final while an unfenced attempt can still commit. Device-placed runs remain device-placed across disconnect/restart and cannot be recovered by a server worker.

**Primary locations:** `libs/aven-actors/src/run.ts`, generic executor lifecycle, SQL/memory runners, runner service composition, Tauri host/repository bridge, and Artifact Store publication integration.

No skill-specific crash-recovery code should be required. An effect with an uncertain external outcome needs its own domain reconciliation operation; generic retries cannot determine whether a remote payment occurred.

### R5 — Cut the complete document skill over on Local and Server

**Depends on:** R2–R4. **Purpose:** reach the first architectural completion gate.

Deliverables:

- An installed document skill specification, production capability catalog, real authorizer, and local/server factory offers.
- Upload/start wiring through the generic run client on both placements.
- Shared run events and terminal understanding data projected into the existing Intent/artifact UI, including partial results and review reasons.
- Removal of the document-specific application-executor dispatch and the direct desktop `DocumentProcessingRuntime` call after the migration gate passes.
- Replacement of eager document Actor construction with factory admission on the active generic path.

**Gate:** compare four combinations: old local, old server, generic local, generic server. Use the same deterministic model responses for semantic comparisons. All useful document output, evidence, failure isolation and constraints must match, except explicitly reviewed improvements. Then run native Tauri plus real facade/runner/SQL/Artifact Store E2E for the generic path. A real-provider rail separately tests extraction quality and production packaging.

Inspection must also establish that the generic production path never invokes the old coordinator, directly or through a wrapper. Source/static dependency checks and recorded capability/segment traces should make that visible.

**Deletion condition:** every supported document branch is covered, both hosts pass, restarts use committed checkpoints, and no production caller depends on the legacy coordinator. At that point remove the class and legacy-only wiring. Preserve the transformation implementations and historical artifact readability. There is no server-labelled fallback to local execution.

### R6 — Prove that extension changes the catalog, not the engine

**Depends on:** R5 for full product proof; package contracts can be prepared earlier. **Purpose:** test the defining generic-planner promise.

Deliverables and gates:

- Add a real structured-invoice recognizer/extractor package, such as the XRechnung route already specified. Recognized, ruled-out, malformed and unsupported inputs must unlock different routes without edits to core planning, scheduling, or a document-type switch.
- Install/remove an equivalent extractor or change its authorized availability. Exact-goal planning must select an admitted compatible route; exploration must retain the intended independent evidence rather than always selecting only the cheapest result.
- Integrate encrypted-document input through the generic continuation/secret interface. Wrong input remains a recorded unresolved outcome; successful input resumes only unfinished work; the secret is not persisted.

The existing HTTP-resource package is a useful second extension proof once response publication and Vault/session adapters are ready. It already supplies bounded GET/HEAD acquisition contracts, but not the Actor Runner factory, durable response publication, or persistent Vault integration. Do not make finishing all HTTP features a prerequisite for document cutover or local-file reconciliation. When added, it should yield a committed response artifact that existing document capabilities can consume without engine changes.

**Primary locations:** a domain recognizer/extractor package, installed catalogs and policy, host adapters, generic continuation UI, and `libs/aven-http-resources` for the later HTTP slice. Core changes at this stage must be justified as genuinely general missing contracts, not special cases named after the new format.

### R7 — Compose production reconciliation through the generic planner

**Depends on:** R5's generic substrate; R6 is the architectural extensibility sign-off. Domain data corrections and corpus work can start during R1–R4.

The skill needs concrete capability families:

| Capability family | Inputs | Outputs / boundary |
| --- | --- | --- |
| Candidate retrieval | Subject invoice or booking, authorized customer/account scope, query/version | Bounded candidate-set artifact with coverage, source/index revision and stable member identities |
| Comparison/ranking | Canonical open item and declared candidate set | Production match-candidate artifacts with positive and contradictory evidence; no accepted relationship |
| Decision proposal | Ranked candidates, validation, existing allocation state | Reviewable recommendation or unresolved ambiguity |
| Human/policy decision | Exact proposal/input versions and current authority | Version-bound decision; review can resume through generic continuations |
| Relationship commit | Approved/revalidated decision and expected allocation version | Durable document/booking relationship or conflict, with domain concurrency checks |
| Quarter projection/export | Period, transactions, decisions, documents and notes | Completeness/review view and evidence-oriented export |

The planner selects these operations; SQL/indexed search performs retrieval, and the domain allocation component enforces financial constraints. No planner-wide Cartesian expansion over all customer transactions. Retrieval of zero candidates is a useful negative observation, not a reason to call the current 1–64-input ranker with an empty list. A bounded result set must not claim global uniqueness when coverage is incomplete.

Resolve the prior review's occurrence/deduplication, contradictory observation, account scope, and amount semantics before relying on committed decisions. Retain the prototype's transaction-first review and amount/date candidate baseline alongside invoice-first exploration. Keep attachment, explanation of settlement, and financial allocation as distinguishable outcomes rather than relabelling every attached document as a settled invoice.

**Gate:** use the real extractors/normalizers/ranker and actual stores, not `testing.enrichment` replacements. Invoice-first, statement-first, structured bank import, reimport, corrected source, ambiguous matches, zero matches, stale review and competing allocations must work through the same generic client on both hosts. Compare assisted quarter completion with the user-approved prototype baseline. A statement-source extraction error must be distinguishable from a retrieval or ranking error.

**Scope boundary:** an event consumer may submit an explicit scoped rematching run under product policy. The generic runner must not become a hidden financial artifact-feed processor. Durable runs own work; domain triggers decide which runs to admit.

### R8 — Add automatic acceptance as a measured policy

**Depends on:** R7 plus a representative labelled corpus. This is not required to claim generic planning or assisted quarter reconciliation is implemented.

Automation uses the same proposal/decision/commit capabilities with stricter policy; it is not a separate fast path around review semantics. Define scope, uncertainty, coverage, identity, conflicts and allocation preconditions. Run in shadow mode, retain explanations and rejected alternatives, and evaluate precision and abstention on held-out cases. The quarter completed with the prototype is valuable evidence, but not a statistical guarantee of unattended accuracy.

**Gate:** explicit acceptance thresholds and a corpus agreed for the intended usage; reproducible decisions from versioned evidence; no double allocation under concurrency; review/reversal behavior for later corrections. Do not treat `pairEligible` or a high score as this gate by itself.

## 7. What to build first

The first implementation tranche should be small enough to demonstrate progress without committing to a second application coordinator:

1. **Baseline and contract tests:** encode the Actor inventory and current output/lineage parity; add the previously observed logical regressions as tests.
2. **Canonical compiler and fact model:** fix conjunctions and variable scope, define fresh/observed outputs, reject incompatible executable routes, and establish subject identity.
3. **Real single-operation integration:** carry full publication/evidence through a factory-backed invoice validator/normalizer on both hosts. No synthetic replacement ranker.
4. **First observed document segment:** inspect a real source, commit/project readability, execute the next justified operation, and prove a different outcome changes the route. Include restart-safe input materialization.
5. **Two-page closure and recovery:** expand/gather declared members, preserve partial outcomes, and resume from the committed prefix through the emerging durable repository interface.

After that tranche, extend through model branches, finance extraction and transaction batches, then complete R4/R5 before product cutover. Do not attempt all recognizers, streams, distributed actor messaging, arbitrary effects, mixed-host plans, or allocation algorithms in the same change.

The dependency order is: R0 establishes the baseline; R1 establishes contracts; R2 connects real operations; R3 and R4 establish planning and durable execution; both are required for R5; R6 proves extensibility; R7 delivers the reconciliation product; R8 enables measured automation. Domain/corpus work can proceed earlier without changing this cutover order.

## 8. Acceptance matrix and rollout rules

| Test axis | Required comparison or assertion |
| --- | --- |
| Runtime portability | Generic Local versus generic Server with the same admitted capabilities and deterministic inputs |
| Migration parity | Old coordinator versus generic engine per host; differences explained individually |
| Domain fidelity | Real outputs versus independent expected facts, not merely old/new equality |
| Dynamic planning | Same source contract, different committed observation, different justified suffix |
| Plugin extensibility | New package changes available route without modifying generic or document scheduling code |
| Collections | 0/1/many members, two documents, out-of-order completion, failed member, 63-page boundary, 64+1 batches |
| Evidence | Blob hashes, roles/ordinals, locators, source relationships, model receipts and configuration lineage preserved |
| Recovery | Every invocation/publication/checkpoint interruption; no recomputation of committed model output |
| Policy | Current grants and available implementations affect routes; effects excluded from exploration |
| Human work | Postpone/restart/resume, wrong input, stale proposal, concurrent reply, cancellation |
| Matching | Real retrieval/ranker, FX, duplicates, ambiguity, corrections, import-order independence and no double allocation |
| Packaging | Browser PDF runtime, production Bun bundle, native image/decoder dependencies, real service composition |

Keep existing tests; replace only claims that depended on a test-only implementation. The existing seven document-lane cases and three artifact-first cases passed in the prior follow-up, but neither proves generic production document cutover. The earlier PDF bundle failures remain an unresolved baseline qualification issue until retested/fixed in the implementation environment; do not waive packaging because another parity subset passes.

During development, shadow planning must not invoke model services or effects. Compare proposed segments against recorded observations, or replay existing committed evidence into the planner. Dual execution with deterministic models belongs in isolated tests, not an unnoticed double charge on production imports.

Feature flags should select a versioned execution implementation at run admission. A run remains pinned to its implementation/protocol until completion or an explicit migration. New catalog revisions may inform a new segment under recorded policy, but must not mutate historical segments or change what an old publication identity means. Rollback should stop admitting new generic runs while preserving their history; it must not rerun completed work through the legacy path under reused identities. The formal specification's earlier fresh-split database-reset language needs an explicit current cutover decision before implementation; this roadmap does not authorize clearing persisted runs or customer artifacts.

Use the [build/test handbook](operations/build-and-test.md) for commands and the [runtime proof strategy](actor-runtime-proof-strategy.md) for shared conformance rules. This roadmap proposes new acceptance obligations; those obligations have not been implemented or passed merely by writing them here.

## 9. Decisions to close early, and what can wait

| Decision | Recommended initial choice | Deadline |
| --- | --- | --- |
| Predicate grammar and fresh/observed variable semantics | Restricted validated DSL with scoped variables and explicit fresh outputs; not full Prolog | R1 |
| Contract authorship | One canonical compiler; per-Actor explicit modes/slots; generated representations for views | R1 |
| Blob and decoded representation durability | Artifact-backed results plus optional reproducible materialization and non-authoritative cache | R2 |
| `many` semantics | Scoped sealed collection manifests plus bounded materialization; stable per-member bindings | R2/R3 |
| Local run persistence/ownership | Authoritative customer-database journal with device-bound claims through scoped APIs; no implicit offline guarantee | Before R4 local implementation |
| Failure and completion vocabulary | Distinguish successful observation, partial knowledge, needs input, no route, limit and cancellation | R3/R4 wire version |
| Cutover protocol/schema compatibility | Version explicit changes; retain old artifact readers and pinned in-flight execution | Before R5 |
| Automatic reconciliation policy | Defer until assisted workflow and labelled evidence are sufficient | R8 |

Shared/session Actor lifetimes, streaming, mixed local/server plans, general distributed Actor supervision, sophisticated cost learning, and broad HTTP effects can wait. They are not necessary to prove the generic planner goal for document understanding and assisted reconciliation. Durable step execution, observation semantics, scoped collections and real artifact bindings cannot wait: they are the capabilities the existing workflow already needs.

## 10. Investigation and deliverable boundaries

This roadmap is based on the previously verified branch integration, direct tracing of both execution paths, the current normative/draft architecture contracts, and a fresh read-only manifest audit of all 16 built-in document/reconciliation Actors. The audit constructed Actors to inspect metadata; it did not decode documents, call a model, or mutate customer data.

No full-stack or provider test was run for this documentation-only investigation. Test results cited above are labelled prior results; section 11 separately records a follow-up in-memory Actor probe. All new milestones and gates are proposed work. Only documentation was created/updated. The roadmap deliberately avoids claiming a percentage complete or a calendar estimate: most reusable domain code exists, but the remaining semantic and recovery interfaces determine the size of the integration work.

The defining final proof is practical: install a capability package, import a document on either host, observe the generic engine select justified work, interrupt and resume it, and complete an evidence-bearing reconciliation without a document-specific scheduler deciding the steps.

## 11. First migration slice: executable contract and merge gates

### Start with an extracted invoice, not a new document coordinator

The first real goal should be: **produce an open-item artifact for this specific invoice extraction**. Start with committed source, invoice-candidate and invoice-details artifacts. Let the generic planner discover the real invoice validator and then the real open-item normalizer. Neither the request handler nor a wrapper Actor should supply that two-step sequence.

This slice needs no PDF decoding, model call, collection expansion, matching, or human decision. It still exercises the critical integration: fact grounding, a fresh intermediate artifact, multi-input binding, real Actor factories, domain publication, and completion based on committed evidence. Completing it proves an integration slice, not generic document ingestion or reconciliation.

Use the [real validator](../libs/aven-document-ingest/src/actors/invoice-validator/index.ts) and [real normalizer](../libs/aven-document-ingest/src/actors/open-item-normalizer/index.ts), retaining their domain behavior initially. Domain corrections from the reconciliation review need separately justified tests; runtime migration parity must not quietly become approval of existing accounting semantics.

| Element | Required binding in this slice |
| --- | --- |
| Source `F` | The committed source artifact, in the selected customer environment |
| Extraction bundle `B` | Trusted provenance identifying one extraction occurrence and its output roles |
| Candidate `I`, details `D` | Committed members of that same bundle; not merely artifacts about the same file |
| Validation `V` | A fresh report produced from exactly `I`, with the declared source dependency |
| Open item `O` | A fresh artifact produced from exactly `I`, `D`, and `V` |
| Goal witness | Committed `O` plus the support proving those bindings, not just an `open_item` predicate string |

The names in this table are proposed logical identities, not new implemented API fields. Keep artifact identity, extraction occurrence, business invoice identity, and invocation identity distinct. Two runs may extract the same invoice without becoming the same extraction occurrence; two invoices may contain identical text without becoming the same business document.

### Close two input-contract gaps before wiring the factories

**Same source is not sufficient provenance.** The normalizer currently requires `invoice_candidate(F, I)`, `invoice_details(F, D)`, and `invoice_validation(I, V)`. Two extractions of one source can therefore supply a candidate from the first extraction and details from the second while satisfying those shared variables. The coordinator's in-memory pairing can mask this when it supplies the payload directly. A generic planner must have a declared relationship to preserve that pairing.

Expose extraction-bundle membership as domain facts grounded in committed production lineage. Require both `I` and `D` to belong to `B`, and the validation to refer to `I`. This is a capability contract, not an invoice-specific rule in the planner. A corrected extraction creates another bundle; explicitly request one bundle or invoke a separately declared selection policy. Never let registry order silently decide which revision the user meant. For historical artifacts lacking sufficient lineage, abstain or use an explicit repair process; do not infer a bundle merely from source identity or matching timestamps.

**Executable inputs include publication obligations.** The validator's manifest declares the candidate, but the [facade procedure contract](../services/aven-api/src/lib/server/artifacts/service.ts) requires one `source` and one `candidate` input for `client.validate-invoice`. The normalizer procedure requires exactly one each of `candidate`, `details`, and `validation`. A generic adapter built only from today's validator manifest would omit a required input.

For the first slice, declare the validator's source dependency explicitly and bind it through trusted extraction lineage. The handler may only need the candidate bytes, but publication still needs the source relationship. Keep logical support facts separate from concrete publication inputs: bundle membership proves the join; it does not authorize adding an undeclared `bundle` role to the facade request. Reject missing, extra, incorrectly typed, or incorrectly scoped inputs before invocation where possible, and revalidate at publication. Do not relax the facade contract just to make the generic path pass.

### Specify the minimum generic contract

R1 should define the following semantics before the real-operation adapter lands. A restricted internal representation is sufficient; a general logic language is not a prerequisite.

1. **Scope variables per capability application.** All requirements and a conjunctive goal share their respective substitutions. Freshen variables for every application. Anonymous variables must not accidentally become a named shared variable. Reject ambiguous or unsupported syntax at registration rather than guessing during execution.
2. **Separate input identities, output handles, and observations.** A fresh output handle denotes the result of an invocation and slot; the publisher resolves it to a committed artifact identity. A validation status is an observed value from the report, not a planner-selected constant. A report-producing capability can justify work toward obtaining a report without promising that the report will say `consistent`.
3. **Retain grounded support.** Facts need their committed artifact and provenance support, including extraction occurrence where relevant. Goal completion and zero-step reuse must resolve that support. Equal predicate text must not erase distinct witnesses that affect executable bindings.
4. **Compile one executable description.** Manifest, live-instance and template views must agree on requirements, slots, output semantics, schemas, parameters, mode and implementation availability. Unsupported cardinality or a missing factory yields an unusable route with an explanation; it must not become a plan that fails only after unrelated work has executed.
5. **Project after commit.** Newly published and previously resolved artifacts use the same versioned projection rules. Supply projectors with validated payload plus trusted committed production/input/output-role context. The current payload-and-artifact-ID projector interface alone cannot establish cross-artifact bundle membership. Planned promises are not a substitute for these projected facts.

The relevant integration surfaces are the [logical planner](../libs/aven-actors/src/planner.ts), [physical planner](../libs/aven-actors/src/physical-planner.ts), [registry](../libs/aven-actors/src/registry.ts), [executor](../libs/aven-actors/src/executor.ts), and [Artifact Store runtime adapter](../services/actor-runner/src/artifact-store-port.ts). The implementation should put domain facts and their projectors with the document capability package, not add bookkeeping terms to generic search.

### Make the adapter a translator, not a scheduler

The current document Actors return a `DocumentActorResult` containing procedure identity, artifact drafts and evidence; the generic executor expects named outputs. A per-operation adapter may materialize the bound inputs, invoke one real Actor method, validate its result and translate the publication. It must not choose or invoke the next Actor.

Preserve output roles and ordinals, type versions, parameters, blobs when present, and evidence locators. In this slice, the normalizer contributes three evidence relationships: whole-artifact support from candidate and details, and `/validationStatus` supported by validation `/status`. Assert the exact resolved input artifact IDs, not only the existence of three evidence entries. Preserve the validator's candidate evidence and its required source production input; those are different relationships.

A failed Actor result must terminate that invocation without publishing an output or projecting success. An interrupted publication requires a stable invocation/publication identity and a lookup/retry contract. Do not claim exactly-once execution: the immediate requirement is one committed logical result per publication identity, with an interrupted worker able to discover that result. Full ownership, checkpoint and cancellation recovery remain R4 obligations; this adapter must not create an incompatible second journal to postpone them.

### What the real Actors currently do: fresh probe

On 2026-09-06, a read-only, in-memory probe directly invoked both real Actors with synthetic payloads. The base candidate had supplier and invoice number, EUR currency, net 10,000, tax 1,900 and gross 11,900 minor units. Details supplied a supplier name. Each scenario changed only the field shown below.

| Scenario | Validator result | Normalizer result |
| --- | --- | --- |
| Base candidate | `consistent` | Open item with `validationStatus: consistent` |
| Gross changed to 12,000 | `insufficient-coverage` | Open item preserving `insufficient-coverage` |
| Invoice number changed to empty string | `inconsistent` | Open item preserving `inconsistent` |
| Gross changed to 1.5 | `insufficient-coverage` | Failed result: `invoice gross amount is invalid` |

Each successful normalization returned evidence roles `candidate`, `details`, and `validation`. The probe did not run a planner, schema admission, publication facade, database, native client, or model. The fractional amount was intentionally delivered directly to the handler; this is not evidence that normal artifact admission accepts it. This was an exploratory probe, not a committed regression test suite.

These observations make an important distinction concrete: **obtaining a validation report and normalizing an invoice are not financial acceptance**. A requested normalization goal may complete with an inconsistent report. An acceptance goal needs additional, explicit domain requirements. Even `consistent` only describes today's two-check ruleset, not complete invoice correctness or safe automatic matching.

### Proposed pull-request sequence and exact acceptance obligations

These are implementation work packages, not PRs already created. Each change must include its own tests and explain any previously passing expectation it corrects.

| Package | Change | Merge evidence |
| --- | --- | --- |
| P1: baseline and identity specification | Record supported contracts, lineage roles, and extraction occurrence semantics; preserve current host parity fixtures | Independent expected payload/evidence fixtures for the two real Actors; characterization of validation outcomes; documented failing planner cases that P2 will address, without making the default suite red |
| P2: compiler and grounded facts | Canonical compilation, scoped substitutions, fresh outputs and grounded goal checking | Incompatible conjuncts fail; compatible shared witness succeeds; two applications cannot capture each other's variables; unresolved zero-step input cannot complete; unsupported executable contracts are rejected |
| P3: publication and projection | Full generic publication envelope, trusted projection context, stable output resolution | Planned predicates cannot invent observed status; fresh and reloaded artifacts project equivalent facts; missing source role is rejected; all normalizer evidence locators resolve to the intended inputs; repeated publication resolves one logical result |
| P4: real two-Actor route | Factories and thin per-operation bindings for validator and normalizer | With only the open-item goal, the generic engine discovers both steps; an already committed matching validation is reusable; outputs and lineage match independent expectations in both host compositions |
| P5: first observed document route | Real inspector plus the next justified operation; durable materialization of that boundary | Readable and unreadable sources produce different justified suffixes; an unreadable report does not unlock decomposition; restart/reload does not depend on the inspector's old in-memory decoded document |

P4 must include two extractions of the same file, two different files, a validation for the wrong candidate, reordered facts, and an explicitly selected older extraction. The expected result is either the requested coherent binding or an explained absence of a route; never a mixed-revision open item. Test all four probe outcomes at the appropriate layer, including absence of a published open item on a failed normalization.

For P4, run the same conformance assertions through both generic host compositions with real Actor factories. This is portable-engine integration evidence. Before enabling this path for users, also exercise real Tauri admission and the authenticated remote route against the customer Artifact Store and database. Do not label an in-process server-shaped fixture as that product E2E test. Bind the run to the selected customer environment and verify rejected cross-environment artifact references without disclosing their contents.

P5 is followed by the already planned two-page expansion/gather and durable recovery work. Do not add a special two-page loop to pass that milestone. The same generic collection machinery must handle empty, single, multiple, failed and out-of-order members, with a declared closure condition. R3 and R4 still gate the full document cutover.

### What this buys before the full migration

After P4, the project has a concrete answer to the architectural question: the generic planner can compose real document-domain operations using stored evidence, and it can do so through either host composition without a document-specific scheduler choosing the sequence. The remaining work becomes observable boundaries—inspection, model observations, collections and recovery—rather than an attempt to port the entire coordinator at once.

Do not promote that milestone to “reconciliation done.” Retrieval, ranking integration, review, accepted relationships, allocation policy and quarter-scale validation still belong to R7/R8. The prototype remains the functional baseline for that later product proof; the first slice establishes the execution foundation on which to preserve its successful workflow.
