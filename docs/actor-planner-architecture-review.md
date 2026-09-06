# Actor and planner architecture review

Review date: 2026-09-05. Reviewed snapshot: `6f4047a6863105323af7dc2bd683df51f996c468`, the same isolated snapshot of `origin/main` used for the [invoice reconciliation review](invoice-reconciliation-review.md).

Status: review report. This assesses the chosen architecture and its implementation; it does not replace the normative architecture papers. No implementation code was changed.

Snapshot boundary: subsequent work migrates document and reconciliation scheduling
to the shared observation solver, fixes conjunctive goal bindings and adds committed
publication replay. This report retains the evidence at the reviewed commit. The
[current architecture](document-ingest-system.md#what-documentprocessingruntime-is)
states the implemented boundary and remaining journal/lifecycle gaps.

Follow-up: the [branch and parity investigation](actor-planner-architecture-review.md#branch-and-parity-follow-up) below confirms that implemented document processing already has local/server parity coverage on `main`. The subsequent [generic-planner migration roadmap](generic-planner-migration-roadmap.md) supersedes this report's application-coordinator-first sequencing recommendation: the chosen destination is generic execution for the real document and reconciliation skills on both hosts.

## Assessment

The architecture can support a useful experience: import a document, discover what it contains, choose an available processing route, retain evidence, and offer the next relevant action. Its strongest decision is to separate executable capabilities, available implementations, plans, durable runs, and immutable artifacts. Keep that separation.

The main concern is that these abstractions currently promise more uniformity than the execution paths provide. The document product runs through a substantial application-specific coordinator. The generic planner/executor is a narrower, mostly static composition engine. It does not yet reproduce the document coordinator's data-dependent branching, failure handling, collection processing, or recovery requirements. The production server explicitly routes document ingestion to its dedicated executor and composes the generic fallback with an empty, deny-by-default host.

There are also correctness defects within the implemented planner, not just missing future features. A conjunction of goals can succeed using inconsistent variable bindings. An unknown observation result can be used as though its value were known. An offered action can omit ingredients used to prove that it is executable. These deserve attention before migrating more product behavior into the generic path.

The durable runner has durable admission and final checkpoints, but not durable step-by-step execution. Restart recovery can repeat the whole executor, continuation work starts before an exclusive database claim, and cancellation does not stop in-flight work. The formal specification already identifies leases, fencing, publication recovery, and checkpointed replanning as later slices. Those are meaningful release boundaries, not optional polish before adding financial decisions or generic external effects.

My recommendation is **evolution, not replacement**: fix the small logical core, make unsupported execution contracts unplannable, introduce a real observation/checkpoint loop, and migrate one representative document route with behavioral parity. Keep retrieval and financial allocation inside domain components. Do not ask the generic planner to become a customer-wide database query engine or an accounting optimizer.

## Scope and evidence

I reviewed the Actor primitive, manifest and machine contracts, registry, authorization and factories, logical and physical planners, affordances, generic executor, Artifact Store adapter, SQL and in-memory runners, server composition, document coordinator, and architecture/test documents. I considered extensibility to reconciliation, additional extractors, HTTP operations, multiple implementations, long-running work, and human review.

The review combines source tracing, existing tests, and a temporary local diagnostic harness importing the actual reviewed code. The harness used invented predicates and a local counter. It did not invoke external services or perform external effects. Its local path is `/tmp/actor-planner-review-scenarios.ts`; the important inputs and results are preserved in this report.

Evidence labels used below:

- **Observed:** executed against the reviewed source.
- **Source finding:** follows from the inspected implementation; the described interleaving or integration was not run against a live stack.
- **Extension requirement:** a deliberate missing capability or a recommendation for the next architecture slice, not a claim that the current product already supports it.

“High priority” means resolve before relying on the affected guarantee. It does not imply that a deployed financial decision or external write was observed. No production deployment, customer data, live PostgreSQL persistence, or live model provider was exercised in this additional review.

## What was chosen, and what exists

| Layer | Intended responsibility | Implemented boundary |
| --- | --- | --- |
| Actor | Encapsulate executable behavior and state behind messages | In-process object with a serialized `deliver` mailbox, manifest, handlers, and implicit retry; not a durable distributed actor system |
| Registry | Describe definitions, existing instances, and factory offers without invoking them | Version-qualified identities and immutable snapshots; useful separation between discovery and instantiation |
| Logical planner | Find a capability route from facts to goals | Bounded uniform-cost forward search over a small predicate language; static output promises |
| Exploration planner | Enrich an artifact with relevant non-effecting evidence | Precomputes eligible invocations; supports independent evidence paths but does not execute observation frontiers and replan |
| Physical planner | Select an authorized implementation and placement | Freezes one environment for the whole run and chooses targets; can select contracts the executor does not support |
| Generic executor | Ground inputs, invoke implementations, publish outputs | Ordered factory steps, exactly one artifact per declared slot, invocation-time policy checks, step publication; no suffix recovery or dynamic replanning |
| Run service | Admit, inspect, resume, cancel, and recover durable work | SQL admission, idempotency, final/waiting checkpoints, and initial-execution advisory locking; no persisted per-step attempt loop |
| Document product runtime | Process real document branches and collections | Dedicated coordinator and Actor adapters; server document ingestion does not depend on generic planning |
| Artifact Store | Retain immutable results and provenance | Real publication adapter exists; generic semantic fact projection and receipt completeness need further work |

Primary maps: [generic registry/runtime paper](generic-actor-registry-and-runtime.md), [formal runtime specification](actor-runtime-formal-spec.md), and [skills/problem-solving paper](actor-skills-and-problem-solving.md). Current composition is visible in [server entry point](../services/actor-runner/src/index.ts), [application executor](../services/actor-runner/src/application-executor.ts), [generic server host](../services/actor-runner/src/host.ts), and [document runtime](../libs/aven-document-ingest/src/runtime.ts).

## Architectural decisions worth keeping

### Capabilities are distinct from processes

A method-level capability tells the planner what operation it can request. A definition describes a kind of Actor, an advertisement describes a live instance, and a factory offer describes something the runtime might materialize. Discovery need not instantiate every extractor or contact every provider. This is a good basis for adding local and server implementations without embedding constructors in plans.

### Plans and durable values are data

Plans refer to capabilities, artifacts, and dependencies rather than retaining live object references. Portable run values and immutable artifacts provide a useful seam for recovery and later environment handoff. A plan is still only a proposal: keeping its output promises separate from committed facts is the next necessary step.

### Authorization is not a single planning-time check

The generic executor checks spawn and invocation again using concrete inputs and configuration. That is the right direction because availability and authority can change after planning. The default server host also does not silently grant an unconfigured catalog access to the application. Missing production policy adapters are explicit composition work.

### One run, one execution environment is a sensible initial constraint

Freezing local or server placement avoids inventing implicit document transfers between steps. Do not relax it just because the address types can describe several transports. Later handoff should be an explicit checkpointed operation with data-access and transfer policy, not an incidental cheapest-target choice.

### Domain truth can remain outside orchestration

The reconciliation design separates comparisons from accepted relationships, and artifacts preserve occurrences. The Actor architecture can transport and explain those results without deciding that a logical route proves a financial claim. Preserve that boundary as the automatic workflow is added.

## Findings

### A1. Goal conjunctions do not share variable bindings

**High priority · observed correctness defect.**

With starting facts `p(a)` and `q(b)`, the goal list `p(X), q(X)` succeeds with zero steps. The returned results are `p(a)` and `q(b)`, although no single value of `X` satisfies both goals.

`resolveGoals` starts a fresh unification for each goal and keeps the first matching fact. By contrast, `matchRequirements` correctly carries bindings across the requirements of one capability. A control scenario requiring `p(X), q(X)` inside a single operation correctly failed with those same facts. The inconsistency is specifically between goal-level and operation-level conjunctions.

This matters whenever several requested properties must describe the same document, invoice, account, or decision. The generic executor's final remaining-goal check also checks goals independently, so it does not restore the missing invariant.

Use one conjunction matcher for both places and return the shared substitution with its evidence bindings. Specify variable scope explicitly. Add tests for conflicting bindings, multiple possible witnesses, repeated variables, and selection independent of ingredient order.

Evidence: [planner](../libs/aven-actors/src/planner.ts), lines 384–401 and 441–448; [executor](../libs/aven-actors/src/executor.ts), lines 391–397.

### A2. Unknown observations can be treated as established facts

**High priority · observed planning defect and extension requirement.**

In the local scenario, an observer declared `file(D) -> profile(D, Format)`. Another operation required `profile(D, xml)` to produce an invoice. From `file(scan)`, the planner produced both steps before any observer ran. The first planned output remained `profile(scan, Format)`; unification nevertheless enabled the XML-specific operation.

An output-only variable is not evidence that the observer will return the value the next operation needs. The planner currently substitutes input bindings into promised outputs and places unresolved output variables into the fact set. The generic executor then runs the precomputed sequence rather than stopping for a newly observed value.

The right contract is generally to promise an observation artifact, commit it, project validated facts from its actual payload, and plan the unfinished suffix. Alternatively, reject contracts that require unknown output bindings until that loop exists. Do not make observers promise the favorable outcome merely to obtain a static plan.

For documents, the missing distinction is “a recognition report will exist” versus “this document is a supported XML invoice.” For HTTP operations, it is “a response was obtained” versus “the response establishes the requested business fact.”

Evidence: [planner output substitution](../libs/aven-actors/src/planner.ts), lines 197–209; [generic executor](../libs/aven-actors/src/executor.ts), lines 147–237 and 325–407. Observation-frontier execution is already described as unfinished in the [runtime specification](actor-runtime-formal-spec.md).

### A3. Grounding and publication do not use one semantic truth boundary

**High priority before broader generic use · source finding.**

Two shortcuts weaken the distinction between a requested predicate and a supported fact. First, the zero-step execution branch returns without resolving the starting ingredients through the Artifact Store. An already-satisfied goal should still be established from admitted, authoritative evidence; skipping execution should not skip grounding.

Second, `ArtifactStoreRuntimePort.resolve` projects predicates from a stored payload using its schema binding, but `publish` returns the draft's predicate directly. Those drafts obtain their predicates from planned outputs. Schema-valid payload structure alone does not establish every semantic assertion in the planned predicate. The adapter's comment says it does not echo planner expectations, but the publication path does exactly that.

Ground starting ingredients before declaring success, including zero-step runs. Apply the same trusted semantic projector to newly committed outputs and later reads. Keep schema validity, observation claims, and domain acceptance separate. This is a defensive source assessment; no unauthorized request or bypass was exercised.

Evidence: [zero-step branch](../libs/aven-actors/src/executor.ts), lines 193–214; [output drafts](../libs/aven-actors/src/executor.ts), function `outputDrafts`; [Artifact Store port](../services/actor-runner/src/artifact-store-port.ts), methods `resolve` and `publish`.

### A4. An offered action can omit the ingredients that make it possible

**High priority for cross-artifact actions · observed correctness defect.**

The diagnostic catalog contained an invoice and a statement. Reconciliation required both. The action definition required the invoice for display and requested a matched-invoice goal. `discoverAffordances` proved the route using all available facts, then returned an action whose ingredients contained only the invoice. Solving again from that returned action failed because the statement was missing.

This directly affects the proposed invoice-to-booking experience. An action should carry the evidence needed by its route, or carry an explicit retrieval/selection specification that the next run will resolve. The discovery function already has the successful program and can derive its original ingredient dependencies; today it discards that information.

The deduplication key also contains only action ID and goals, not the supporting evidence version. Alternative supports may therefore collapse to the first representative. Decide whether the product wants one action with several candidate supports or separate grounded actions, and encode that deliberately.

Evidence: [affordance discovery](../libs/aven-actors/src/affordances.ts), lines 37–65. Related ingredients are appended for affordance discovery only after execution in [understanding output](../libs/aven-actors/src/executor.ts), lines 262–304; they are not automatically inputs to the original plan.

### A5. Logical reachability is not yet executable reachability

**Medium priority now; high priority before catalog expansion · source finding.**

The physical planner filters targets by environment but does not filter them to the executor's supported target and slot contracts. It can select a live-instance target, while `executeFactoryStep` accepts only factories. Capability metadata permits wider cardinalities, while execution requires exactly `one` in every slot. Slot schema compatibility is checked during execution, not while choosing a route.

Consequently, a route can be authorized and logically successful but fail mechanically even when another compatible implementation exists. The generic executor does not then replan around that route. This is not a request to implement every advertised feature immediately: the smaller fix is to make the supported execution profile explicit and exclude incompatible routes before presenting them as runnable.

The goal solver also deduplicates states by predicate strings, omitting artifact identity, schema, and provenance. That may be valid for a deliberately extensional logical predicate, but not when the executor needs a particular schema or evidence occurrence. Define which distinctions affect planning before relying on this dominance rule.

Evidence: [physical planner](../libs/aven-actors/src/physical-planner.ts), lines 114–155; [factory-only execution](../libs/aven-actors/src/executor.ts), lines 417–426; `validateDeclaredSlots`, lines 648–665; [planner state key](../libs/aven-actors/src/planner.ts), lines 451–453.

### A6. Exploration can stop short while reporting saturation

**Medium priority · observed limitation with an overstated completion result.**

Exploration deliberately preserves independent evidence paths. However, it prevents a capability from running if that same capability appears anywhere in an input's ancestry. That is broader than preventing an identical repeated invocation.

A finite graph scenario used edges `a -> b -> c -> d -> e`, a starting reachability fact for `e`, and one rule that extends reachability by one edge. Exploration produced `reach(d, e)` and stopped. It did not derive `reach(c, e)` through `reach(a, e)`, because the rule was in the ancestry. The plan returned success. The generic understanding result uses `status: complete` and `stoppingReason: saturated`.

The cutoff is understandable as protection against endlessly chaining equivalent transformations, but it is not general fixed-point saturation. Define an admissible recursion/termination policy, or explicitly classify recursive contracts as unsupported and use a more accurate stopping reason.

There is a second boundary: the entire enrichment program is planned before execution. If its safety limit is exceeded, planning returns failure with no partial program. The default is 512 steps. It therefore does not deliver a useful committed prefix for a large admitted exploration. Exhaustive enrichment without an effort budget is an intentional design choice today; the issue is accurately representing limits and partial progress, not silently replacing that choice with a heuristic.

Evidence: [enrichment loop](../libs/aven-actors/src/planner.ts), lines 302–381 and 426–439; [understanding output](../libs/aven-actors/src/executor.ts), lines 288–290.

### A7. Search limits do not bound all planning work

**Medium priority · observed small-case behavior; larger-scale risk inferred.**

The solver performs forward uniform-cost search, sorts its whole queue repeatedly, and considers every applicable capability. It does not first restrict the search to capabilities relevant to the goal. In a scenario with eight irrelevant one-cost operations and a direct ten-cost goal operation, a deliberately configured 100-state limit was exhausted before finding the one-step solution. This is not a benchmark of the default 2,000-state limit; it demonstrates sensitivity to unrelated catalog growth.

`matchRequirements` also materializes every matching tuple before the surrounding search can check its state budget. Eight facts and three independent requirements generated 512 matches in the executed test. A state limit is therefore not a complete bound on CPU, allocations, or joins. The diagnostic reachability pass can perform further matching after search stops.

Before growing the catalog or admitting large fact sets, add backward relevance filtering, predicate indexes, lazy matching, and work budgets covering matching as well as state expansion. Validate costs as finite and nonnegative if cheapest-path semantics are retained. Return distinct outcomes for unreachable, incompatible, policy-denied, and budget-exhausted work.

Do not feed every transaction into this symbolic search. Retrieval should use a domain query/index and publish a bounded, coverage-described candidate set for a ranking Actor.

Evidence: [goal solver](../libs/aven-actors/src/planner.ts), lines 176–245; `matchRequirements`, lines 384–401; diagnostic `closure` below line 464.

### A8. Contract compilation differs between templates and live Actors

**Medium priority · observed compatibility defect.**

A manifest whose contracts exist only in its machine text yields no capabilities through `definitionFromManifest` or `capabilitiesFromManifests`. Constructing a live Actor from the same manifest and calling `definitionFromActor` yields one capability, because the live Actor derives machine contracts first.

This works against the valuable decision that discovery should not require instantiation. A plugin can appear runnable when registered as an instance and disappear when offered through a factory. The duplicate manifest-to-capability implementations also create a continuing drift risk.

Compile each definition once into a canonical, validated capability representation shared by templates, live instances, factories, routing, diagrams, and planning. Validate method-level contracts explicitly; broad Actor-level inheritance is convenient for a one-method transform but can over-advertise unrelated methods on a larger Actor.

Also document the actual predicate language. `term.ts` handles flat comma-separated arguments and name-based variables; it is not a general Prolog term parser or rule engine. A restricted DSL is a reasonable choice. Implying general Prolog semantics makes future authors assume unsupported nesting, scoping, or rule behavior.

Evidence: [registry compilation](../libs/aven-actors/src/registry.ts), functions `methodCapabilities`, `definitionFromManifest`, and `definitionFromActor`; [manifest helper](../libs/aven-actors/src/planner.ts), lines 42–83; [term implementation](../libs/aven-actors/src/term.ts).

### A9. Actor supervision silently retries non-idempotent handlers

**High priority before effects or costly operations rely on this primitive · observed local behavior.**

`Actor.#handle` retries any thrown handler once. It does not consult the declared idempotency or operation mode, recreate the Actor, roll back state, or record the first failed attempt when the retry succeeds. The comment compares this to a fresh restart, but it calls the same handler closure again.

The benign diagnostic handler incremented a local counter and threw on its first call. Its method declared `idempotency: none`. One delivered message returned success with the counter at two and the Actor failure count at zero. This proves repeated local mutation, not an observed duplicate external write.

For a future HTTP operation, a thrown response-processing error could occur after the remote system has accepted a request. Retrying belongs in an explicit attempt policy that understands pure, idempotent, reconcilable, and non-idempotent work. Preserve uncertain outcomes and attempt history. Do not use hidden Actor retry underneath a second durable-run retry policy.

Evidence: [Actor mailbox and handler](../libs/aven-actors/src/actor.ts), lines 442–489. Existing tests intentionally expect the current retry behavior, so changing it requires an explicit contract migration.

### A10. Durable admission is not durable step execution

**High priority before claiming resumable workflows · source finding and acknowledged extension requirement.**

The SQL runner persists the request and protects initial execution with a PostgreSQL session advisory lock. It then calls the executor and records the result only when that call finishes or returns a continuation. The generic executor publishes individual steps, but there is no incremental checkpoint callback into the runner. On restart, the runner reconstructs the original request without a committed-step prefix or frozen program.

Consider a run that commits its first output and stops before returning its final result. Recovery can invoke the whole executor again. Stable publication identity can help recognize a repeated commit; it does not prevent repeated computation, model charges, or effects preceding that commit. Nor does it make a nondeterministic retry produce an identical publication body.

The advisory lock is useful for avoiding simultaneous initial execution while its connection survives. It is not a fencing token: losing the database session does not revoke an executor's authority to publish elsewhere. The connection is also held across the entire execution, including potentially long network work.

Introduce persisted attempts and incremental checkpoints, a claim/lease with fencing, and an explicit publication-recovery handshake. Resume an unfinished suffix from committed evidence. Test process loss before publication, after publication but before checkpoint, and after checkpoint but before acknowledgement. The formal specification already calls for this; release claims should remain narrower until it exists.

Evidence: [SQL execution and request reconstruction](../services/actor-runner/src/sql-runner.ts), lines 200–266; `#applyResult` and `checkpoint`; [step publication](../libs/aven-actors/src/executor.ts), lines 369–389; the Phase C section of the [formal specification](actor-runtime-formal-spec.md).

### A11. Continuation claims and cancellation need execution-level coordination

**High priority before effecting continuations · source finding, not live SQL validation.**

SQL resume reads a waiting record, invokes the executor, then performs a revision-guarded update. Two concurrent resumes can therefore both enter execution before one loses the final update. The compare-and-swap protects the record from a lost update, but it occurs too late to make execution exclusive. Initial execution's advisory lock does not cover this method.

Cancellation updates the durable record but does not send an abort signal or revoke publication authority. An in-flight executor can continue producing outputs. The final initial-execution update correctly refuses to overwrite a cancelled record, but that does not stop the work itself.

Claim a continuation before execution and give attempts an authority that cancellation can revoke. Define whether the UI promises “cancellation requested” or “no further commits possible.” Cooperatively abort cancellable work and reconcile uncertain external outcomes rather than pretending a database state change can undo them.

The in-memory runner transitions state before awaiting resumed execution, so passing memory-based tests does not establish equivalent SQL behavior. Required database tests should coordinate two actual resume calls and a cancellation race around controlled, harmless operations.

Evidence: [SQL resume/cancel](../services/actor-runner/src/sql-runner.ts), lines 136–198 and 295–303; compare [memory runner](../services/actor-runner/src/memory-runner.ts), methods `resume` and `cancel`.

### A12. Request-time recovery couples status reads to executing work

**Medium priority · source finding.**

The server's `forGrant` composition creates a runner and awaits `recoverAcceptedRuns` before returning it to the request handler. That recovery scans accepted runs and awaits their execution sequentially. Consequently, a status or cancellation request can first perform recovery work and wait on its duration. The `status` repository method itself is read-only; the enclosing HTTP composition is not.

After a restart, the user trying to inspect or cancel a pending document should not have to wait for that document's recovery execution before the requested operation is reached. The formal statement that repeated status reads have no side effects also does not hold at this composition boundary.

Move recovery to an independently scheduled worker lifecycle with bounded concurrency. Keep request paths for admission and inspection responsive. Tenant-scoped discovery of recoverable work still needs an explicit design; moving this into an unbounded global scan would not solve the underlying scheduling problem.

Evidence: [server composition](../services/actor-runner/src/index.ts), lines 48–76; [recovery loop](../services/actor-runner/src/sql-runner.ts), lines 125–134; [formal run states](actor-runtime-formal-spec.md), statement “Repeating status reads has no side effects.”

### A13. Run identity and receipts are insufficient for reproducible execution

**Medium priority now; required for durable replanning · source finding.**

The generic executor uses the caller's idempotency key as its execution `runId`; the SQL runner's generated durable run ID is not passed through its execution request. Publication identity is then based on that value and a position-based name such as `step-1`. Request deduplication, durable run identity, semantic step identity, and attempt identity are different concepts. Their scopes should not be interchangeable. Replanning can also change which operation occupies a particular step position.

The generic Artifact Store receipt publishes empty parameters and evidence, although invocation uses request parameters and normalized factory configuration. The adapter does retain a procedure version, implementation metadata, and input artifact links; provenance is not absent. It is incomplete for explaining why a particular model/configuration/parameter choice produced a result.

Registry revisions are process-local counters, and a version-qualified definition can be overwritten in the mutable registry. A revision number alone cannot identify the same executable catalog across restarts.

Use a server-issued run identity, persisted plan-segment and semantic step identities, and separate attempt IDs. Bind semantic execution to immutable input IDs and versioned implementation/configuration digests. Persist non-secret parameters, policy decisions, model/procedure receipts, and evidence references where they can be audited; use handles or redaction for secrets rather than copying them into artifacts.

Evidence: [generic executor composition](../libs/aven-actors/src/executor.ts), lines 217–234 and 369–375; [SQL request](../services/actor-runner/src/sql-runner.ts), lines 253–266; [publication adapter](../services/actor-runner/src/artifact-store-port.ts), `publish`; [registry](../libs/aven-actors/src/registry.ts), registration and snapshot methods.

### A14. The Actor abstraction needs explicit limits before becoming a platform promise

**Extension requirement · source finding.**

The mailbox serializes `deliver` calls on one object, but is volatile, unbounded, and has no timeout, cancellation, or backpressure protocol. Public mutation methods also mean that the mailbox is not the only possible state-change path. This is a useful in-process Actor primitive, not an Erlang-style runtime with isolated processes, durable mailboxes, restart supervision, or distributed delivery guarantees.

The generic executor creates and releases a factory Actor for each step and executes independent steps sequentially. Step lifetime and ordered execution are documented restrictions and can be good defaults. However, long-lived sessions, streams, shared expensive resources, and optional/multiple outputs require more than adding enum values to metadata. A release failure currently propagates before publication, even if the invocation produced valid output, which further illustrates why cleanup and business completion need separate attempt states.

The manifest also combines executable contracts, state-machine information, UI/view details, model settings, and sandbox-related metadata. Avoid making every future capability depend on all these concerns. A compiled execution contract with optional presentation, model, and host adapters can retain today's authoring convenience without making a financial comparator or HTTP transport implement a universal application object.

Evidence: [Actor primitive](../libs/aven-actors/src/actor.ts); [executor lifecycle](../libs/aven-actors/src/executor.ts), ordered loop and `executeFactoryStep` finally block; [registry offers](../libs/aven-actors/src/registry.ts), lifetime and address types.

## Scenario walkthroughs

| Scenario | Current result or source-based expectation | Architectural lesson |
| --- | --- | --- |
| Two properties requested for the same object | Observed: different objects satisfy shared-variable goals | Goal conjunction needs a single binding environment |
| Recognize an unknown file, then select XML extraction | Observed symbolic plan selects the specialized step before recognition | Plan to an observation frontier, not through an unknown value |
| Invoice and statement enable a review action | Observed action omits the statement needed by its proof | An affordance must retain executable support or explicit retrieval |
| Recursive, finite graph enrichment | Observed one derivation, followed by successful termination | An ancestry cutoff is not general saturation |
| Add unrelated cheap capabilities to a catalog | Observed bounded search fails despite a direct feasible route | Catalog extensibility requires relevance filtering and full work budgets |
| Same contract registered as template versus live Actor | Observed zero versus one capability | Discovery must share one canonical compiler |
| Handler changes local state and then throws | Observed two mutations for one delivery | Retry semantics cannot be hidden below the durable attempt layer |
| Factory versus already-running implementation | Source: planner can choose a target the executor rejects | Discoverable, authorized, and executable are distinct states |
| Process stops after a committed step | Source: original executor request can be rerun | Publication idempotency does not replace suffix recovery |
| Two replies to one waiting continuation | Source: both may execute before final SQL conflict | Claim before execution, not only before saving the result |
| Cancel an in-flight run | Source: cancelled record can coexist with later publications | Cancellation needs an execution/publication contract |
| Inspect a pending run after service restart | Source: request composition can first execute recovery | Worker scheduling should not be hidden in reads |

These scenarios are deliberately broader than invoice matching because failures at these layers would affect every future skill. The SQL rows are reasoned interleavings, not assertions that a live concurrent test passed or failed.

## How this should support reconciliation

The architecture should orchestrate a small number of meaningful domain operations, not represent every possible invoice/transaction pair as a symbolic planning branch.

1. Ingest and normalize each document into immutable occurrences and validated domain observations. Preserve contradictions rather than promoting every extracted field into accepted truth.
2. Use a customer-scoped retrieval component to find candidate invoices or bookings. Return a versioned candidate-set artifact containing query parameters, coverage, source scope, and a stable description of the candidate universe.
3. Invoke the existing deterministic comparison/ranking component on bounded inputs. Retain the strengths of the prior matching implementation and fix the semantic defects documented in the [reconciliation review](invoice-reconciliation-review.md).
4. Produce a proposal with supporting and contradicting evidence. Keep ranking score, pair eligibility, and accepted allocation separate.
5. If necessary, create a review continuation tied to those artifact versions. Before acceptance, recheck the relevant allocation and source state; a previously offered action is not a reservation.
6. Commit an accepted relationship through a domain-specific operation with concurrency and idempotency guarantees. Have later correction, reversal, and partial-allocation behavior refer to that explicit decision history.

Many-to-many allocations, partial payments, split fees, and currency conversion belong in domain solvers operating on well-defined data. The generic planner can choose and sequence such a solver. It should not learn accounting semantics through increasingly elaborate generic predicates or interpret a successful proof of `matched(I)` as authority to settle an invoice.

Import order must not determine behavior. Invoice-first, statement-first, reimport, source correction, and newly granted account access all require a retrieval/rematching trigger policy beyond the current post-run affordance hook. That can be a domain event consumer or scheduled domain worker using the same run protocol; it does not require turning every Actor into an autonomous background process.

## Recommended target architecture and migration

### Keep a constrained planner, with explicit workflows as first-class inputs

For known document processing sequences, an explicit workflow/DAG remains easy to reason about and test. For choosing among equivalent extractors or obtaining a missing prerequisite, a constrained capability planner adds value. They should compile into the same checked execution representation and share attempts, publication, and checkpoint semantics.

A full Prolog engine is not necessary merely to fix conjunctions and variable scope. An LLM-driven executor would not solve the current grounding, recovery, or identity problems either. If Aven interprets user intent or suggests a route, that suggestion should still pass typed admission, policy, and executable-plan checks.

Suggested ownership:

| Component | Owns | Must not infer implicitly |
| --- | --- | --- |
| Contract compiler | Grammar, variable scope, method signatures, schema/cardinality contracts | Truth of an observer's future output |
| Evidence projector | Facts justified by committed typed artifacts | Acceptance of disputed financial claims |
| Planner | Goal conjunction, route choice, observation frontier | Customer-wide joins or effect authorization |
| Physical planner | Supported targets, placement, compatibility | That all advertised transports are executable |
| Durable executor | Claims, attempts, cancellation, publication/checkpoint recovery | Whether a financial proposal is correct |
| Domain services | Retrieval, ranking, allocations, review policy | Generic runtime lifecycle rules |

### Sequence the work in acceptance-sized slices

**First: establish logical and admission correctness.** Fix A1–A5 and unify contract compilation. Reject unsupported targets, unbound contracts, or slot shapes early. Add property tests for variable scope, permutation invariance where promised, and equality of advertised versus executable support. This can improve the generic foundation without replacing the document coordinator.

**Second: implement one real observation/checkpoint loop.** Choose a representative document route whose extraction depends on actual inspection, with a fallback and at least one collection output. Run it through generic composition and compare its committed artifacts and failure presentation with the existing document runtime. Replan only after evidence is committed and projected. Do not migrate the whole document runtime based on a linear synthetic transform test.

**Third: close durable execution gaps.** Add incremental checkpoints, attempt identity, continuation claims, cancellation authority, and publication recovery. Exercise the SQL runner and Artifact Store together under controlled process interruption. Move accepted-run recovery into a worker lifecycle. Keep arbitrary external effects out until uncertain outcomes and retries are handled explicitly.

**Fourth: wire reconciliation as a domain workflow.** Add retrieval, proposal publication, and review before automatic acceptance. Prove import-order independence, duplicate/correction handling, and concurrent allocation behavior. Expand slot cardinality or use a typed candidate-set artifact deliberately; do not hide collections inside undocumented payload conventions.

**Later: optimize.** Parallelize independent steps with bounded resource pools, reuse expensive Actors where lifecycle contracts justify it, and tune planning with real catalog workloads. Introduce effect-specific HTTP adapters and environment handoff only after the execution model can represent their uncertain outcomes and transfer boundaries.

## Validation performed and what it does not establish

The following additional suites ran in the isolated review worktree:

| Command | Result | Main coverage |
| --- | --- | --- |
| `bun run --cwd libs/aven-actors test` | 12 passed; 56 expectations | Enrichment, generic executor conformance, portable run protocol |
| `bun test app/tests/actors.test.ts app/tests/actor-registry.test.ts app/tests/prolog-contracts.test.ts app/tests/generic-actor.test.ts` | 35 passed; 109 expectations | Actor behavior, registry, contracts, generic Actor integration |
| `bun run --cwd services/actor-runner test` | 25 passed; 6 skipped | Runner service, HTTP boundaries, host composition, protocol/adapters |
| Local diagnostic harness | All assertions passed | Nine focused cases, including the incorrect behaviors and control described above |

Total existing tests in this additional review: **72 passed and six skipped**. A passing diagnostic assertion means the reported behavior was reproduced; several assertions intentionally confirm defects.

The runner suite initially could not open a loopback listener under the sandbox and had two failures for that reason. Rerunning with local-listener permission passed those tests. That environmental failure is not counted as a product defect.

The six skipped tests require configured PostgreSQL and/or Artifact Store services. They comprise four SQL persistence cases, one PostgreSQL-dependent split-architecture case, and one Artifact Store persistence case. I did not supply those services, start the full customer stack, or claim that the live persistence suite passed. The earlier reconciliation report separately records its document-test and PDF-bundle results; this additional green subset does not override them.

The current tests usefully establish the small ordered executor and transport contracts. They do not establish observation-driven replanning, real document parity through the generic executor, crash-safe suffix recovery, publication/checkpoint atomicity, lease loss, concurrent SQL continuation ownership, or cessation of work after cancellation.

The highest-value next test investment is a shared runner conformance suite executed against both memory and real SQL backends, plus a real Artifact Store recovery matrix. Add controlled interruption points around claim, invocation, publication, checkpoint, and acknowledgement. Keep a small independent logical reference model for generated conjunction/route cases. Use catalog-scale tests for search budgets, and keep domain matching corpus quality separate from orchestration conformance.

## Documentation findings

The formal specification's deliberate-gap table is useful and should remain the authority for what is not yet implemented. Some nearby prose is more ambitious than the code:

- The skills/problem-solving paper's current-execution section ends by saying the HTTP runner is not the remote document-ingest runtime and both placement choices still use desktop-hosted coordinators. This is stale relative to the current server composition and contradicts the more recent execution description in that same section.
- The generic registry/runtime paper has an early statement that exploratory saturation and affordance discovery are not implemented, while later scope notes and code include their static implementations. The accurate distinction is static exploration versus observation-frontier execution.
- Descriptions of checkpointed discovery sometimes read as current behavior, although the implementation-status sections correctly mark it as future work.
- The Actor retry comment describes a fresh restart, but the implementation reuses the same handler and state.
- The Artifact Store adapter's comment says facts are not echoed from planner expectations, but its publication return path copies the draft predicate.

These are report findings only; I did not edit the owning documents or code. A later implementation change should update the authoritative status descriptions alongside its conformance tests.

## Bottom line

Keep the decomposition. It is a useful foundation for extensible, evidence-producing work. Tighten the claims and the interfaces: a logical plan is not a fact, an authorized target is not necessarily executable, a publication is not a recovered workflow, and an Actor retry is not safe supervision.

The most convincing next milestone is one real, data-dependent document path running through the generic engine with committed observation facts and tested recovery. Reconciliation should then build on that execution substrate while retaining its own retrieval, evidence, decision, and allocation semantics.

## Branch and parity follow-up

This follow-up responds to the clarification that `avenCEO-tools` was a working prototype used to complete a quarter, and that avenCEO should deliver that process as a skill runnable either in Tauri or on the server. The user's completed quarter is evidence of practical usefulness; I did not inspect that quarter's private documents or independently replay its outcomes.

### The parity work is already integrated

I refreshed `origin` and inspected local and remote branch histories, registered worktrees, relevant uncommitted files, and GitHub PR metadata. Remote `main` still points to the reviewed `6f4047a6863105323af7dc2bd683df51f996c468`. The original checkout's local `main` is three commits behind that remote; it is not a newer implementation. The isolated review worktree therefore did not miss a newer remote-main runtime.

| Work | Branch / PR | Integration result |
| --- | --- | --- |
| Portable registry/planner/factory executor and persistence conformance | `codex/runner-conformance-proof`, [#178](https://github.com/MyAvenCEO/avenOS/pull/178) | PR closed because [#179](https://github.com/MyAvenCEO/avenOS/pull/179) superseded it; equivalent implementation is on `main` as `48c87b2e` |
| Actual remote document imports and lane parity | `codex/remote-document-runner`, [#181](https://github.com/MyAvenCEO/avenOS/pull/181) | Merged; corresponding main commits include `dd7987d7` and `f01cfabe` |
| Eager document enrichment, richer finance extraction, model/failure and PDF parity work | `codex/eager-document-enrichment-spec`, [#188](https://github.com/MyAvenCEO/avenOS/pull/188) | Merged; includes `2370b4f6` and subsequent test fixes |
| Authenticated HTTP resource pipeline | `codex/generic-web-request-paper`, [#189](https://github.com/MyAvenCEO/avenOS/pull/189) | Merged; `c35afb52`; not an unmerged reconciliation implementation |
| Canonical finance artifacts and production ranking Actor | `codex/invoice-statement-reconciliation-paper`, [#190](https://github.com/MyAvenCEO/avenOS/pull/190) | Merged; `d605dd47`, followed by corpus constraints in `778d564e` |
| Concurrent accepted-run recovery claim | Worktree named `remote-document-runner`, now on `codex/fix-deploy-alsa`, [#211](https://github.com/MyAvenCEO/avenOS/pull/211) | Merged as `fb59ee06`; relevant Actor/document/HTTP package and runner trees match current remote `main` |

I used patch-equivalence comparisons as well as ancestry because rebased or cherry-picked commits can otherwise look like missing work. The named active parity, enrichment, HTTP, and reconciliation branches do not contain additional unmatched implementation patches in the reviewed runtime packages. Older `explore/actor-skills`, pre-rebase, and identity-split branches retain earlier client-runtime/coordinator layouts, not a later complete reconciliation skill. The relevant worktrees had no uncommitted implementation extension of these components.

PR [#196](https://github.com/MyAvenCEO/avenOS/pull/196), whose title says the application adopted the Actor library, concerns the brand/UI component system and styling migration. It is not a later replacement of the portable execution engine. This is another reason not to infer runtime maturity from “Actor” in a branch or PR title alone.

This search covers the fetched repository refs, available worktrees, and relevant PR history. It does not establish what might exist in another repository, an unpublished checkout on another machine, or a deployment that differs from Git.

### Three distinct achievements should be credited

**1. Real local/server document execution exists.** The app constructs an `InProcessDocumentExecutionHost` for local work and a `RemoteDocumentExecutionHost` backed by Tauri's Actor Runner client for server work. The remote path sends a portable command through the facade and executes in the server process. It is not two differently labelled desktop instances.

The server's document executor reconstructs the same `DocumentProcessingRuntime` with server decoding and Artifact Store adapters. Sharing the application coordinator and Actor implementations across host-specific adapters is a legitimate portable skill implementation. A skill need not be synthesized by a generic solver to count as running on both hosts.

Evidence: [app host composition](../app/src/lib/artifacts/client-document-processing.ts), lines 95–133; [portable document hosts](../libs/aven-document-ingest/src/execution.ts); [server document executor](../libs/aven-document-ingest/src/server.ts), lines 65–144.

**2. Meaningful semantic parity tests exist.** The [document-lane conformance suite](../services/actor-runner/tests/document-lane-conformance.test.ts) compares canonical presentations and publication graphs, including payloads, input relationships, evidence, and blob hashes. Its seven cases cover text, CSV, native-text PDF, deterministic-model invoice image extraction, deterministic-model statement extraction, unavailable-model fallback, and failed-model isolation. The model-backed cases inject model responses; they do not establish agreement between two independent live model calls.

The [native platform E2E](../deploy/e2e/platform.spec.ts), especially lines 230–282, imports the same text fixture through both placements and compares stored derived graphs through the real application/service path. The [PR #181 checks](https://github.com/MyAvenCEO/avenOS/pull/181/checks) include successful Actor-runtime and platform CI. Its PR description also records a prior full-stack local pass. Those are historical checks and author-reported local results, respectively; I did not rerun the full native stack in this follow-up.

**3. Generic execution and a reconciliation-shaped scenario also exist.** The generic executor has local/server deterministic conformance, including factory selection and artifact publication. Separately, the [artifact-first E2E](../services/actor-runner/tests/artifact-first-enrichment.e2e.test.ts) enriches a statement and invoice, offers reconciliation, invokes it as a separate skill, ranks three transactions, and verifies that enrichment does not schedule a payment.

That third achievement is more than an architecture diagram, but it is not the production quarter workflow. Its extractors return fixed objects, its candidate store is in memory, and its reconciliation handler contains a separate test scoring function: amount 40, currency 30, reference 30. It does not invoke the production ranker from PR #190 or perform customer-wide retrieval, persisted human confirmation, allocation, or export. Its `server` placement is a host configuration inside the test process, not a deployed server journey.

### What parity means here

| Claim | Assessment |
| --- | --- |
| Implemented document semantics can run locally and remotely | Yes: shared application runtime, real remote composition, and parity coverage |
| Supported generic executor operations can produce equivalent local/server results | Yes within the deterministic conformance contracts |
| Every document/model/format combination has been shown equivalent | No: the compared corpus is bounded and live provider behavior is not a dual-host parity test |
| Progress, continuation, cancellation, and crash recovery are identical between hosts | No: local progress is incremental, remote document presentation is primarily terminal, and the Tauri document client does not expose resume/cancel |
| The generic planner already drives the production document coordinator | No: server skill dispatch explicitly selects the application-specific executor |
| A user can already complete the prototype's quarter reconciliation workflow in avenCEO | Not found in the inspected implementation |

“Local execution” describes where processing runs. It does not currently mean that all storage, authentication, or model calls are offline/on-device. Those services have separate placement and configuration decisions.

### The prototype supplies the product acceptance baseline

The inspected `avenCEO-tools` checkout has a concrete transaction-first workflow, not merely an experimental score function:

- Import bank transactions and select a period.
- Ingest documents into an inbox, inspect originals and extracted values, and accept or review them separately from linking them to transactions.
- Retrieve accepted document candidates for a selected transaction. The query compares booked and original-currency amounts, orders by amount distance and then date distance, and groups duplicate document representations.
- Attach selected accepted documents to the transaction in a database transaction, avoiding repeated identical links.
- Retain notes and supporting evidence, and export transactions with evidence for the tax firm.

Concrete source locations in that separate checkout are `src/lib/server/db.ts` (`getStagedDocumentCandidates`, lines 1200–1428; `addTransactionStagedDocuments`, lines 1149–1198), `src/routes/api/transactions/[id]/documents/from-staging/+server.ts`, and `src/lib/server/tax-export.ts` (`createTaxFirmExport`). Its README and source distinguish document acceptance from reconciliation/attachment. The checkout contains unrelated documentation changes, which I left untouched.

The candidate-query ordering and review interaction are important parts of what worked. Preserve those as a baseline against which a new weighted ranker is measured. Do not assume a new score is an improvement merely because it uses more signals. Equally, do not copy prototype assumptions such as duplicate grouping or ambiguous outstanding-amount selection without addressing the earlier review findings.

A further distinction matters for validation: the prototype's imported bank CSV supplies structured transactions. Matching an extracted statement adds another source of uncertainty. A first migration can retain a structured bank import while separately proving statement extraction; otherwise extraction loss and ranking quality become difficult to diagnose independently.

### Refined next milestone

Sequencing note: the recommendation in this subsection was superseded by the user's explicit choice to prioritize the generic planner. Use the [migration roadmap](generic-planner-migration-roadmap.md) for the current plan. The portability and prototype findings above remain applicable.

The earlier report emphasized migrating a real document path into the generic planner. That remains a valuable **runtime architecture** milestone, but it need not block the next **product** milestone. The existing shared document runtime already demonstrates that a skill composed of Actors and supporting orchestration can execute on both hosts.

The next product slice should reproduce the successful quarter workflow through a shared reconciliation application executor: candidate retrieval, comparison using the best prototype behavior, a reviewable proposal, confirmed document/booking links, correction, and an evidence-oriented period view/export. Provide local and server adapters around the same domain implementation and test both. Keep the generic planner defects tracked separately; address them before depending on the affected dynamic planning guarantees.

The strongest acceptance corpus would be a user-approved, privacy-preserving representation of the completed quarter: source transactions, accepted links, rejected plausible candidates, unresolved cases, and manual corrections. Use it to compare the prototype and new implementation, then add edge cases the real quarter does not contain. The user's successful quarter supports assisted reconciliation as a product baseline; it does not by itself establish unattended automatic matching accuracy.

### Follow-up verification

I reran `document-lane-conformance.test.ts`: **7 passed**. I also reran `artifact-first-enrichment.e2e.test.ts`: **3 passed**. These are fresh results for this investigation, not additional unique cases beyond the earlier suite totals. No live provider calls, database mutations, full-stack restart, or implementation changes were made. Only this report was extended.
