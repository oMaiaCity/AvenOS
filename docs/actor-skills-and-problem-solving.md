# Skills: from an artifact or desired outcome to a resumable run

This is the best starting point for understanding skill execution in avenOS. It
explains the model from a caller's point of view and is deliberately practical. For
the complete architecture, continue with
[Actors, skills, planning, and durable execution](generic-actor-registry-and-runtime.md).
The wire format and state-machine requirements are normative in
[Actor execution protocol and document-ingest cutover](actor-runtime-formal-spec.md).

Within the [product model](product-model.md), Skills and Actors are how an Aven turns
an intended outcome into bounded, inspectable work. Neither term is a synonym for the
Aven itself or for the model serving one completion.

## Start with what is known

Suppose a user uploads an invoice without knowing which operations the system offers.
The uploaded file is the initial ingredient:

```prolog
ingredient  ceo.aven.docs.file(invoice_1)
```

By default, the document skill should enrich that artifact as far as its installed and
authorized Actors allow. A machine-readable XRechnung can yield typed invoice fields
directly. A text PDF can contribute native text, and a scan may need a vision-capable
model. Validators and domain Actors can add evidence, confidence, totals checks, and
links to known parties or records. The system then presents the actions enabled by the
facts it actually established. It may offer to create a bookkeeping entry, compare a
purchase order, check payment status, or prepare a payment; it does not perform those
effects merely because they became possible.

This is the artifact-first interaction specified in
[Artifact-first semantic enrichment and affordance discovery](artifact-first-semantic-enrichment.md).
It treats automatic understanding as eager and external effects as separately
admitted work.

Sometimes the user already names an outcome:

```prolog
ingredient  ceo.aven.docs.file(invoice_1)
goal        ceo.aven.bookkeeping.invoice_details(invoice_1)
```

The exact goal lets the planner prioritize only the enrichment needed to prove it. It
does not require a different parser or execution model. The available route in either
mode depends on the user's entitlements, current assurance, artifact access, chosen
execution environment, and the Actors available there.

A **skill** captures the desired outcome and the policy around it. That outcome may be
exact—“produce invoice details”—or exploratory—“learn as much useful information as
possible about this document.” It does not need to freeze one implementation path. A
planner can discover a suitable path from the authorized actor catalog, and a runner
can execute that plan without making the skill responsible for mailboxes, retries, or
persistence.

That separation gives five concepts one job each:

| Concept | Question it answers |
| --- | --- |
| Actor definition | What kind of worker is this? |
| Capability | What can one method produce from which inputs? |
| Skill | What outcome does the product offer, under which policy? |
| Plan | Which authorized capabilities and placements solve this request? |
| Run | What has happened, what is durable, and what should happen next? |

Artifacts are not a sixth kind of process state. They are the immutable ingredients
and results that survive every actor and runner instance.

## A capability is the planner's smallest operation

Actors receive envelopes and may keep private working state. Planning happens at the
method level because a runnable step must name a concrete method, its inputs, and its
guaranteed outputs.

A capability therefore describes:

- a qualified, versioned identity;
- the actor method to invoke;
- predicates required together for one invocation;
- predicates guaranteed after success;
- input and output slots bound to canonical schemas;
- whether it transforms, observes, streams, renders a view, or causes an effect;
- idempotency and retry semantics; and
- planning metadata such as cost.

For example, a structured invoice reader can advertise:

```prolog
requires:
  ceo.aven.docs.document(D)
  ceo.aven.docs.document_profile(D, xrechnung)

produces:
  ceo.aven.bookkeeping.invoice_details(D)
```

The output slot binds the logical fact to
`ceo.aven:schema:bookkeeping:invoice-details@2`. Another capability may produce the
same fact and schema from page images. Downstream consumers depend on the meaning of
the result, not on which actor happened to produce it.

The qualifiers matter. First-party product and LLM vocabulary belongs to `ceo.aven`;
neutral actor execution protocols belong to `os.aven`; and `id.aven` is limited to
principal, authentication, assurance, authorization, and grant evidence. Predicate
functors are domain-qualified as `ceo.aven.docs.*` or
`ceo.aven.bookkeeping.*` as well.

## What a skill definition contains

A reusable skill definition should be small. It needs:

- a qualified `SkillId`, label, and version;
- accepted ingredient predicates and requested goal predicates;
- product policy, such as allowed effects, privacy, cost, or placement constraints;
- parameter schemas and human-facing descriptions; and
- optionally, a preferred recipe or views for explanation and interaction.

The preferred recipe is a hint or constraint, not a second source of capability truth.
The registry remains authoritative for what can currently be invoked.

### Exact, exploratory, and hybrid goals

An exact goal has a crisp completion condition: all requested predicates have been
proven by authorized ingredients or committed outputs.

An exploratory goal is different. “Get as much information as possible” is not one
predicate. The initial document policy defines it as a saturation objective:

```text
expand     supported facts about document D
within     installed fact families, authorization, access, assurance, and placement
exclude    external effects
stop when  no applicable capability can add supported knowledge
```

This exhaustive policy does not invoke every installed Actor. The skill names the
subject and relevant fact families, and the frontier contains only authorized,
non-effecting capabilities whose requirements and applicability constraints are met.
The runner commits each result, replans from the richer fact set, and stops with an
explicit reason such as `saturated`, `needs_input`, or `no_authorized_route`. Future
versions may add measured cost, effort, privacy, confidence, and information-gain
limits without changing the artifact-first model.

The durable result is an understanding bundle or report: discovered typed artifacts,
their evidence and confidence, coverage, unresolved questions, and the stopping
reason. It is not an untyped bag of model guesses.

Document upload uses exploration by default. A request such as “validate this invoice”
adds exact predicates and becomes hybrid: the planner establishes those predicates
first, then either stops or continues exhaustive enrichment according to the admitted
completion policy. Exact predicates set priority; exploration creates reusable
knowledge and the affordances presented afterward.

The exact `solve()` path remains available. Plan Runner protocol version 2 also accepts
an explicit `goalSpec` for exploration or exact-goal-then-enrich execution. The first
generic slice expands guaranteed outputs from every applicable authorized
non-effecting capability, returns an understanding bundle, and discovers affordances
whose requirements and exact execution routes are currently satisfied. Dynamic
replanning from observation contents and production document integration remain later
slices.

An ad-hoc request does not need a stored skill first. A caller can submit ingredients,
goals, parameters, and policy directly. If that query becomes useful, it can later be
published as a named skill. This is much like the difference between running a SQL
query and saving a view.

### Do not confuse a skill with its UI projection

The app also contains `SkillDef` objects under `app/src/lib/skills`. They describe
authored workflow canvases and views used by the current product UI. Some are backed
by live behavior and some are demonstrations. Their edges are useful explanations,
but they are not durable `PlanRun` records and the generic runner does not execute
them.

Keep that distinction explicit:

- a UI `SkillDef` explains or presents a product workflow;
- a `ceo.aven` skill definition states an executable outcome and policy;
- an `os.aven` plan/run records one selected execution.

The UI can eventually render the compiled plan and live run over the existing canvas
without making the canvas the scheduler.

## Creating a skill

An authored skill is created in four layers, in this order.

### 1. Publish actor contracts

Each actor method declares honest `requires`, guaranteed `produces`, and schema-bound
slots. Alternatives belong in separate capabilities; possible outputs must not be
claimed as if every invocation guaranteed all of them.

Construct static IDs with `resourceId()` rather than concatenating strings:

```ts
const skillRef = resourceId({
  authority: 'ceo.aven',
  kind: 'skill',
  namespace: 'docs.ingest',
  name: 'document-ingest',
  version: '1'
})
```

### 2. Register definitions and placements

`ActorRegistry` stores three different things:

1. versioned definitions and their method capabilities;
2. factory offers that might create an actor; and
3. live instance advertisements that can receive an envelope now.

Knowing a definition exists is not the same as having permission to use it or an
instance available. The registry owns advertisements, not actor processes. Hosts and
factories own construction, draining, and disposal.

### 3. Declare the outcome and policy

Create the skill definition from domain concepts, not implementation names. “Produce
validated invoice details” is stable; “call vision actor B, then validator C” is a
particular plan.

An authored recipe may restrict allowed capabilities, demand a review point, or
provide a certified route. It should still be checked against the current registry and
schema catalog before use.

### 4. Add executable examples

Contract tests should solve representative fixtures and explain the selected route.
For a document skill, include at least:

- structured XRechnung choosing machine-readable extraction;
- scanned input choosing a vision route when authorized;
- an unauthorized premium actor being invisible to planning;
- equivalent canonical output schemas across alternative routes; and
- a useful unsolved result when no authorized proof exists.

Store expected explanations, not hand-maintained copies of graph edges.

## Planning is query optimization over capabilities

Planning has two stages.

For exact goals, **logical planning** proves that the goals follow from the
ingredients. Requirements within one capability are AND conditions. Different
capabilities that produce the same fact are OR alternatives. `solve()` implements a
bounded uniform-cost forward search with shared variable bindings, artifact-backed
inputs, and explicit failure when no proof exists.

**Physical planning** selects a live instance or factory offer for every logical step.
`solveAuthorized()` pins one execution environment—`local` or `server`—and selects
only targets present in an authorized registry view.

```mermaid
flowchart LR
    I[Authorized ingredients] --> L[Logical solver]
    D[Capability definitions] --> L
    L --> P[Physical planner]
    A[Authorized offers and instances] --> P
    P --> F[Frozen program]
```

Authorization happens before search so the plan neither uses nor reveals forbidden
actors. `authorizeRegistryForPlanning()` provides this filtered view today. Its
`ActorAuthorizer` is an integration contract and test seam; it is not yet connected to
the final avenCEO entitlement and artifact-grant service. A production runner must
also reauthorize spawn and invocation because planning decisions can become stale.

The planner returns data. It does not instantiate actors, dispatch envelopes, publish
artifacts, or claim that a run succeeded.

### Discovery changes the plan

Some facts cannot be predicted. A recognizer can guarantee a typed report, but not
that an arbitrary input is an XRechnung. The runner executes to that observation,
commits the report, projects only its validated facts, and replans the unfinished
goal.

This is how a new XRechnung package can replace image recognition without an
`if xrechnung` branch in a generic coordinator: the recognizer establishes
`ceo.aven.docs.document_profile(D, xrechnung)`, then the structured extractor becomes
the cheapest reachable producer of the same invoice-details schema.

Exploratory planning uses the same checkpoint loop but advances any eligible frontier
invocation that can add supported knowledge about the subject. Its relevance filter
begins with the subject and permitted fact families, so an installed payroll or
medical Actor does not run merely because it could emit another fact. A future bounded
policy may rank that frontier by expected information gain or measured cost.

## Executing a plan

A production runner owns the operational lifecycle:

1. admit the start command and freeze its environment;
2. persist the authorized plan segment before executing it;
3. authorize and materialize factory targets as needed;
4. bind committed input artifacts to method slots and dispatch envelopes;
5. validate and atomically publish outputs plus a production-run receipt;
6. checkpoint the committed artifacts and unlock dependent work;
7. suspend on a typed continuation or replan after a new observation; and
8. drain and release actor instances at their admitted lifetime boundary.

A step is successful only after publication is acknowledged. Actor memory may make a
step faster, but recovery may depend only on the run journal and immutable artifacts.

### Current execution paths

The current implementation contains several layers at different maturity levels:

- **`DocumentProcessingRuntime` works end to end for the current document DAG.** It
  calls actors, publishes every successful step, retries safely, and updates the app
  projection. Its coordinator is document-specific and does not execute generated
  plans.
- **The app's `server` document host is remote.** It freezes server placement, submits
  the strict JSON command through the facade, polls the persistent run, and consumes
  only the terminal portable presentation returned by the runner.
- **`services/actor-runner` proves the remote trust boundary.** Through
  `api.aven.ceo`, it provides authenticated admission, independent identity-token
  and tenant-grant verification, subject isolation, SQL-backed idempotency, status,
  cancellation, restart recovery, and SSE shape. Its deployed host uses an application
  executor catalog for document ingestion and the generic ordered
  registry/planner/factory executor as an empty fail-closed fallback. PostgreSQL E2E
  tests exercise a deterministic generic factory and the real Artifact Store adapter;
  document conformance tests exercise the production application executor.
- **The generic executor has its first narrow slice.** It binds one artifact per
  schema-qualified slot, repeats spawn/invoke authorization, activates step-lifetime
  factory actors, publishes before advancing, and releases them. Instance targets,
  wider cardinalities, attempts, leases, fencing, and effects remain subsequent slices.
  A deterministic metadata-only secret continuation now proves postpone, restart, and
  resume, but document/HITL integration and an ephemeral secret handle remain. Its
  concrete Artifact Store port is composed with the
  authenticated SQL runner in the deterministic release-gated conformance test; the
  deployed host still needs application-specific catalog and adapter bindings.

The HTTP runner is therefore a real trust and transport boundary, not yet the remote
document-ingest runtime. The app's Device/Server selector still routes both choices to
desktop-hosted `DocumentProcessingRuntime` instances.

## Resumption and human input

A run is mutable operational state. It records plan segments, attempts, leases,
fencing tokens, checkpoints, unresolved continuations, and publication outbox state.
An artifact is an immutable domain value. Mixing those two makes recovery and audit
ambiguous.

An encrypted PDF illustrates the boundary. Inspection should commit a durable report
and open a `secret` continuation. Only the request metadata is stored. The password is
submitted over an authenticated continuation, exposed through an attempt-scoped
secret handle, and destroyed after use. Postponing or restarting leaves the request
open, so reopening the intent presents it again. The current document coordinator
still ends this case in `needs_review`; the continuation behavior is specified but not
implemented.

## Artifacts as durable agent-to-agent communication

The Artifact Store is a durable blackboard and provenance ledger, not a queue.

| Communication | Representation |
| --- | --- |
| “Here is a fact or result” | Publish the domain artifact |
| “Please perform this work” | Publish a typed work-request artifact when the request itself must be durable |
| “Here is the answer” | Consume the request and publish typed result artifacts plus a production-run receipt |
| Meaningful question or decision | Typed question, answer, proposal, or decision artifact |
| External mutation | Authorized request artifact followed by a receipt or reconciliation artifact |
| Heartbeat, lease, retry, delivery acknowledgement | Run repository and control envelopes |
| Streaming tokens or UI deltas | Event transport, optionally summarized later |

Prefer domain types such as `ceo.aven.bookkeeping.reconciliation_report` over a
universal `agent.message`. A generic communication artifact is appropriate only when
the communication itself is the durable business fact.

The final result of a skill is normally the goal artifact or artifacts. A special
“skill result” wrapper is useful only when a consumer needs a named bundle.

## What is ready, and what comes next

Implemented now:

- qualified `id.aven`, `os.aven`, and `ceo.aven` identifiers;
- method-level capabilities and schema slots;
- a generic registry for definitions, offers, and instances;
- principal-scoped planning views and local/server physical placement;
- bounded logical and physical solvers;
- portable run and checkpoint values;
- the working document-specific executor and its client publication/retry adapter
  (the split publication downstream remains an integration requirement);
- the authenticated server runner boundary, persistent SQL run ledger, baseline
  deployed executor, and injection seam tested with the generic deterministic core;
- trusted Artifact Store fact projection and atomic production-run publication,
  composed with the authenticated SQL conformance path against the real Rust service.

Still required for general skill execution:

- real avenCEO entitlement, artifact-grant, and admission policy integration;
- a durable run repository with leases, fencing, and an outbox;
- application schema/procedure bindings for the tested Artifact Store adapter;
- production factory catalogs/composition, instance targets, and longer lifetimes;
- application continuation bindings and an ephemeral secret broker (the generic
  metadata-only runner lifecycle is implemented);
- checkpointed observation/replanning;
- exploratory and hybrid goal contracts with exhaustive saturation, understanding
  bundles, and affordance discovery;
- app wiring from the Server choice to the remote runner; and
- XRechnung recognizer/extractor packages and parity tests.

## Where to continue reading

- [Actors, skills, planning, and durable execution](generic-actor-registry-and-runtime.md)
  develops the complete conceptual model, including authorization, dynamic lifecycle,
  XRechnung, and continuations.
- [Actor execution protocol and document-ingest cutover](actor-runtime-formal-spec.md)
  is the implementation-ready normative contract.
- [Document ingest system architecture](document-ingest-system.md) explains the
  working application path and its current hard-coded coordinator.
- [`@avenos/actors`](../libs/aven-actors/README.md) documents the implemented registry
  and planners.
- [Actor runner service](../services/actor-runner/README.md) documents the current
  authenticated server boundary and its deliberate limits.
