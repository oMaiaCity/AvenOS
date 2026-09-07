# Artifact Store AvenOS UI Backtest

Status: completed behavioral backtest

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

Specification under test: [ARTIFACT-STORE.md](ARTIFACT-STORE.md)

Previous implementation backtest:
[ARTIFACT-STORE-REPOSITORY-BACKTEST.md](ARTIFACT-STORE-REPOSITORY-BACKTEST.md)

Repository under test: `/home/daniel/src/MyAvenCEO/avenOS`

## Executive verdict

The artifact-store specification survives this second backtest. The AvenOS repository
does not reveal a missing kernel primitive. Its mocked Tauri journeys instead provide
strong product-level confirmation of the boundaries already drawn by the spec:

- user-visible durable facts should be immutable artifacts;
- workflow progress, waiting queues, open windows, current cards, and actor state
  should remain operational state or projections;
- one intake can produce several outputs atomically and then fan out to independent
  consumers;
- a human gate must produce a decision about an exact proposal, not merely release a
  stored callback;
- payment, sending, calendar writes, and destructive retention require explicit
  request/receipt or privileged-operation boundaries;
- the same bytes can represent several arrival occurrences without becoming several
  blobs;
- search is an authorization-filtered projection, while a federated UI may combine
  artifact search with application commands and other sources;
- personal/team placement is authorization scope, not an editable domain field.

The main findings are therefore not changes to `ARTIFACT-STORE.md`. They are corrections
needed before the AvenOS type drafts or UI flows are treated as contracts:

1. The JSON type-registration drafts embed `search` configuration in the same document
   as the immutable structural schema. The spec correctly versions search mappings
   separately. The documents must be split before computing a type-definition digest.
2. `review.decision@1` is too generic to safely carry arbitrary gate-specific
   `selection` values, and `decidedVia: "button"` records UI provenance but proves
   neither identity nor authority. Publication must bind the authenticated reviewer,
   exact proposal, exact policy, and exact displayed/captured inputs.
3. A todo move from `me` to `team` is a scope transition or declassification, not an
   ordinary mutable field update. The mocked reducer currently treats it as a normal
   edit.
4. A durable “not found after searching 428 documents” result requires a pinned corpus
   high-water mark, projection generation, query interpretation, authorization context,
   and source-completeness record. The current query fan-out silently tolerates failed
   sources, so absence cannot automatically be promoted to durable truth.
5. Several proposed type schemas are not ready to freeze: the open-ended T0 policy and
   external capture payloads, the one-blob ambiguity in `inbox.message@1`, the
   date-time representation for all-day calendar events, and duplicated assertion
   endpoint IDs all need resolution.

The service directory cannot backtest implementation invariants. Its Rust entry points
are empty and its own plan says it is scaffold-only. The plan is nevertheless well
aligned with the spec, particularly its transport-neutral application boundary, remote
Tauri default, streaming byte requirement, database role separation, and phased
delivery.

## Scope, method, and evidence quality

This is a behavioral pressure test, not a claim that the mocked application already
implements an artifact store. The review covered:

1. the nine mocked intent journeys and their activity rails;
2. the declared inbox, todo, document, calendar, brain, and reconciliation workflows;
3. the live in-memory todo reducer and its machine-gated transitions;
4. the actor message bus and universal human-in-the-loop queue;
5. chat/tool execution and transient activity rendering;
6. federated query fan-out, failure isolation, display deduplication, and context;
7. the 52-entry artifact-type catalog and the 19 T0/T1 JSON registration drafts;
8. the artifact-store service plan and crate scaffold.

The most important evidence-quality limitation is explicit in the app itself: intent
instances are mocked, while only some templates and the todo behavior are live
([intent workspace](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L15),
[inbox declaration](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/skills/inbox.skill.ts#L4)).
Consequently:

- the UI is strong evidence of required product semantics;
- the live reducers and unit tests are evidence of current application behavior;
- the type files are design proposals, not stable wire contracts;
- there is no persistence, concurrency, authorization, retention, or recovery
  implementation to validate.

All JSON files under `artifact-types/` parse successfully. The focused query and todo
machine suites were executed: 13 tests passed and none failed. The service crate files,
excluding the plan and Cargo metadata, are empty or trivial; the plan also states that
no behavior is implemented
([scope of scaffold](/home/daniel/src/MyAvenCEO/avenOS/services/artifact-store/PLAN.md#L510)).

## Backtest scorecard

| Specification area | Result | AvenOS pressure | Consequence |
| --- | --- | --- | --- |
| Immutable typed facts | Confirmed by UX | Cards combine files, classifications, tasks, events, parties, assertions, checks, and decisions | Keep each independently useful fact separately typed |
| Artifact versus workflow state | Strongly confirmed | Intent state, skill progress, current node, queue position, and activity toast are mutable/transient | Do not add universal artifact status or workflow tables to the kernel |
| One primary blob | Confirmed, with one draft conflict | Files, OCR text, drafts, and raw email all need byte payloads | Fix `inbox.message@1`; do not overload one blob with raw message and extracted body |
| Occurrence versus byte identity | Confirmed | Three identical utility-bill scans should share bytes but remain distinct arrivals | Never deduplicate artifact occurrences by blob digest |
| Production runs | Confirmed by activity model | Activity entries naturally render completed transformations and their outputs | Derive the activity log from runs/artifacts; do not persist UI log rows as truth |
| Atomic multi-output publication | Strongly confirmed | One extracted deadline creates a todo, calendar event, and draft; one reconciliation closes six todos | Keep atomic batch/run publication and exact ordered outputs |
| Change feed | Confirmed by fan-out | Produced predicates wake multiple skills | Use whole publication commits for durable consumers; keep actor routing outside the store |
| Human decisions | Confirmed, UI mechanism insufficient | Nine gate layouts all act on proposals | Bind decisions to exact inputs and authenticated authority; do not trust a button event alone |
| Request/receipt external action | Strongly confirmed | Send, payment, calendar integration, and possible remote filing | Preserve proposal → decision → request → executor receipt |
| External mutable snapshots | Strongly confirmed | Payment preview includes current account balance and supplier/bank data | Capture exact observed state used by the decision |
| Structural references | Confirmed | Mail attachments and frozen bundles are composition; brain links are claims | Keep composition distinct from causal inputs and semantic assertions |
| Search as projection | Strongly confirmed | Typed rows and renderer shapes are derived navigation data | Keep mappings/generations separate from type definitions |
| Federated application query | Outside kernel | UI asks todos, contacts, calendar, docs, brain, and windows | Artifact search is one source; the store is not the application source registry |
| Authorization scopes | Strongly confirmed | `me` and `team` affect visibility and placement | Treat a move as policy-governed scope transition, not payload mutation |
| Retention | Strongly confirmed | Duplicate-delete gate promises irreversible deletion while retaining an original | Require exact IDs, impact analysis, holds, privileged purge, and shared-blob safety |
| Evidence locators | Confirmed conceptually | Classifications, deadlines, amounts, and matches depend on source regions | Retain exact evidence links; display prose is not sufficient evidence |
| Database enforcement | Not exercised | No database implementation exists | Prior implementation acceptance tests remain release-blocking |
| Backup/restore | Not exercised | No stored bytes or schema exist | No new evidence beyond the first repository backtest |

## The central model boundary

The AvenOS UI is useful precisely because a single intent card combines three kinds of
state that are easy to conflate:

```text
durable facts                    mutable application state          rendering
-----------------------------    -------------------------------    ------------------
source file/message              intent status                     badge and color
classification                   skill current node                preview layout
intent declaration               pending gate queue                relative time label
task/event/draft                 subscription/retry state          artifact kind icon
decision/request/receipt         current/preferred result          search row shape
checks/assertions/transitions     open window and selected intent   activity toast
```

The source types make this distinction visible. `MockIntent.status`, `SkillStatus`, and
`LogEntry.state` are mutable UI/workflow concepts
([interfaces](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L33)).
The activity toast lasts three seconds and is replaced by the newest event
([activity state](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/actors/activity.svelte.ts#L39)).
Neither belongs in the immutable kernel. Conversely, a classification, correction,
decision, match, or action receipt remains useful after the window closes and therefore
is an artifact candidate.

This validates the spec's minimal-kernel table without expanding it. In particular,
the artifact store should not acquire a generic `intent_status`, `actor_state`,
`pending_gate`, `window`, or notification primitive.

## Journey backtests

### 1. Krankenkasse deadline: fan-out and atomic visibility

The mocked letter is captured, classified with 96% confidence, converted into an
intent, and fanned out into a todo, an all-day deadline, and a response draft
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L140)).

A sound artifact sequence is:

```text
core.file
  -> OCR/classification/intake/intent declaration
  -> one production run publishing:
       todos.task
       calendar.event
       docs.draft
  -> human decision on the exact draft
  -> docs.send-request
  -> connector
  -> docs.send-receipt
```

The three initial outputs should become visible in one publication when the product
promises that the extracted intent created them together. Later approval and sending
must be separate runs because a human delay and an external effect intervene. The
waiting card is a projection, not an unfinished production receipt.

This scenario also shows why workflow predicates are not enough for provenance. The
inbox template currently declares both `mail(M)` and `upload(U)` as requirements of the
normalizer even though the UI describes them as alternative entrances
([normalizer](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/skills/inbox.skill.ts#L44)).
The publication receipt must record the actual input occurrence used, not infer it from
a generic flow diagram.

### 2. Office-chair invoice: a gate is not payment authority

The payment preview displays amount, due date, IBAN, source account, and current balance
([payment gate](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L330)).
The balance and supplier/bank details are mutable external state. A consequential
decision therefore needs exact `external.capture` inputs or externally verifiable
versions, not only copied display strings.

The current bus stores an in-memory closure and releases it when a held ID is confirmed
([hold implementation](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/actors/bus.ts#L266),
[confirmation](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/actors/bus.ts#L290)). That is
a valid mock interaction but fails a production authorization test:

- it is lost on process restart;
- the click has no authenticated reviewer identity or policy revision;
- the preview is not bound to an exact immutable proposal digest;
- the captured balance or request could change between display and execution;
- there is no durable rejection fact;
- executor idempotency and stale-decision handling are absent.

The spec already supplies the right replacement: publish the payment proposal and
captures, publish a decision run over their exact IDs, build an authorized payment
request, and let a dedicated executor publish a receipt. `decidedVia: "button"` may be
retained as descriptive provenance, but it is not an authorization credential.

### 3. Tax collection: growing sets are projections

The tax journey continually links new documents, displays a count of 12, and reports
missing checklist items
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L348)).
The live collection is a projection over accepted assertions plus workflow subscription
state. It is not a manifest because membership is still changing. A handover package to
the tax adviser becomes a `core.manifest` only when its exact membership is frozen.

The missing-item result can be a durable completeness evaluation if later work depends
on it. Its run must consume the exact checklist/policy snapshot and exact corpus or
manifest it evaluated. “Sammelt weiter” and “12 artifacts” remain UI state.

### 4. Contact duplicate: merging cannot rewrite history

The move journey compares two parties at 88% similarity and asks the user to keep one
and merge the other
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L437)).
A duplicate check is only a candidate. Approval should yield an immutable merge or
same-as assertion and update an application-owned preferred-entity projection. It must
not rewrite old artifacts or silently retarget their historical references.

The statement “an entity exists exactly once” in the skill template is therefore a
projection-level aspiration, not an invariant the artifact kernel can enforce
([brain resolve](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/skills/mocked.skills.ts#L133)).
Two independently observed party artifacts can legitimately coexist, and different
reviewers or policies may disagree about equivalence.

### 5. Duplicate scans: blob deduplication is not deletion authority

The utility-bill journey identifies three identical scans and offers irreversible
deletion while preserving one original
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L495)).
This strongly confirms the spec's distinction between a blob and an occurrence: the
occurrences retain different source metadata even when exact byte blobs are shared.

The UI list is insufficient as a purge command. A production flow must bind exact
artifact occurrence IDs, not filenames; distinguish exact-byte duplicates from a photo
of the same page; calculate structural referrers and production descendants; check
holds and jurisdictional policy; and keep shared bytes while any retained occurrence
still claims them. The human decision authorizes a purge request. Only the privileged
retention capability executes the approved policy.

### 6. Calendar conflict: local fact versus external write

The Kita journey shows a proposed appointment overlapping an existing event
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L549)).
The conflict check should consume exact proposed and existing event snapshots. A human
decision may approve the proposal. If `calendar.event` is only the local desired event,
publishing it is enough; if the UI means that Google/Apple/CalDAV was changed, the flow
also needs a calendar write request and connector receipt. A successful local artifact
must never be presented as proof of a remote side effect.

This journey also exposes a type-level time issue: the proposed `calendar.event@1`
requires `startsAt` as a JSON Schema `date-time` even for `allDay: true`
([schema](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/calendar.event.v1.json#L13)).
An all-day deadline such as 15 September is a civil date, not an instant. Version 1
should use a discriminated representation for date-only events versus timed instants or
spans, including explicit timezone semantics where conversion is required.

### 7. Bank-statement reconciliation: one run, many decisions and transitions

The mocked reconciliation parses 38 transactions, auto-matches six, asks about one
below-threshold match, skips 31 standing orders, and completes six invoice todos. This
pressures the model in useful ways
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L605)):

- the uploaded CSV occurrence, parsed statement, and individual transactions are
  distinct facts;
- match candidates are not accepted matches merely because they have confidence;
- the auto threshold is a policy snapshot input;
- the human-confirmed candidate consumes an exact decision artifact;
- one successful run can publish six status-transition artifacts atomically;
- the activity summary is derived rendering, not a seventh transition.

The todo machine tests confirm that legal transitions are procedure policy and illegal
ones are rejected by the current reducer
([tests](/home/daniel/src/MyAvenCEO/avenOS/app/tests/todo-machine-gate.test.ts#L27)).
The store should record the transition and exact machine/policy implementation receipt,
but it should not hard-code the todo state machine into the generic kernel.

### 8. Contract cancellation: approval and delivery are different facts

The mobile-contract journey compresses “approved and sent” into one log line and then
shows an inbound confirmation
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L676)).
For audit purposes those are separate facts:

```text
draft -> review decision -> send request -> send receipt
                                      later: inbound confirmation file/message
```

An archive or filing confirmation may update a navigation projection or emit a filing
artifact. It does not mutate the original send receipt. This is a direct positive test
of the spec's external-action boundary.

### 9. Missing contract: negative results need a closed search world

The fitness-studio journey says no contract was found after searching 428 documents
and offers upload, proceed-without, or location hints
([journey](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L732)).
This is the most important search pressure case.

The query engine deliberately catches a failing source and continues
([fan-out](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/query/answer.ts#L71)); its test
confirms that behavior
([failure isolation](/home/daniel/src/MyAvenCEO/avenOS/app/tests/query.test.ts#L55)). That
is excellent availability behavior for a UI, but an empty answer does not prove absence.
A durable `docs.retrieval-result` with outcome `not-found` is truthful only if it records
or consumes:

- the exact normalized query and interpretation;
- the exact authorization scope/policy context;
- the active search projection generation and indexed-through commit;
- the corpus boundary or manifest/high-water mark;
- every required source and whether it completed;
- mapping/tokenizer/model versions;
- the result count and time of execution.

If any required source failed or the projection lagged behind the claimed corpus, the
outcome is `incomplete` or `degraded`, not `not-found`. Ordinary exploratory searches
should remain transient query responses. Publish a negative-result artifact only when a
later decision—such as cancelling without the contract—depends on that exact absence
claim.

## Cross-cutting findings

### Fan-out belongs on the change feed, not in artifact references

The actor bus emits one predicate to every compatible consumer
([fan-out](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/actors/bus.ts#L163)). This is a
useful model for application orchestration, but it is not provenance. A consumer should
receive whole publication commits, decide whether a type/procedure is relevant, and
publish its own idempotent run. Run inputs record what actually caused the result.
Workflow edges and canvas stages are rebuildable registry views, as the bus itself says
([derived graph](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/actors/bus.ts#L310)).

The store therefore does not need subscriptions, actor registries, Prolog unification,
or workflow scheduling. It needs the ordered commit feed and idempotent publication
already present in the spec.

### UI render kinds and answer shapes are not artifact types

The intent rail uses six broad kinds—document, todo, calendar, person, entity, and
statement—as badges
([kind union](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/intents/IntentsPlaceholder.svelte#L45)).
The query system similarly passes arbitrary renderer `shape` hints without interpreting
them
([answer rows](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/query/answer.ts#L19)).

These are presentation vocabularies. A document card may aggregate a raw file, OCR,
classification, invoice candidate, and send receipt. Conversely, several artifact
versions can deliberately normalize into one search row shape. Freezing badge kinds as
artifact types would couple durable data identity to a replaceable UI.

### Federated query is an application composition layer

The query registry asks todos, contacts, calendar, documents, brain, and window-command
sources, drops empty answers, preserves registration order, and deduplicates matching
answer IDs
([sources](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/query/sources.mock.ts#L18),
[engine](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/query/answer.ts#L49)). This does not
imply that the artifact store should become a universal source registry.

The artifact store should provide one authorized, typed, generation-pinned search
source. The application may combine it with commands, live windows, remote services,
and mutable task projections. Display deduplication by answer ID is unrelated to blob
deduplication, artifact identity, or semantic entity resolution.

### Chat messages and tool calls need selective retention

A user utterance that starts or changes durable work is a plausible artifact and should
be an exact input to the resulting production run. Streaming assistant deltas,
placeholder responses, model tool proposals, retry rounds, and transient toasts should
not automatically become artifacts. A model tool call is a proposed capability use,
not proof of authorization or successful effect.

This matches the spec's “audit trail, not hidden reasoning” rule. If a delivered
assistant response matters contractually, store the final user-visible response or
delivery receipt as a typed artifact. Do not store private reasoning merely because the
debug wire can export it.

### Todo revisions, status, deletion, and scope are four different concerns

The live reducer mutates title, tags, due date, responsible person, status, and spark in
one update call
([update reducer](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/actors/views/todo/logic.ts#L267)).
It also physically removes rows for delete and clear-done
([deletion reducer](/home/daniel/src/MyAvenCEO/avenOS/app/src/lib/actors/views/todo/logic.ts#L336)).
A durable mapping must decompose that convenience command:

- title/tags/due/responsible changes publish a new immutable task value;
- status changes publish typed transition facts;
- the current task revision and current status are projections;
- `me` to `team` invokes a policy-authorized scope transition/declassification flow;
- “clear done” normally hides or retires items in the task projection; it does not
  silently purge historical artifacts;
- legal artifact purge is a separate privileged retention operation.

The proposed `todos.task@1` correctly removes status and spark
([schema notes](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/todos.task.v1.json#L61)),
but the application contract must also stop treating a cross-scope move as an ordinary
field update. `responsible` should be either a stable party/principal reference or an
explicit textual snapshot; a mutable display name is not durable identity.

## Audit of the AvenOS artifact-type drafts

The catalog is a valuable discovery document. Its best decisions should be retained:

- namespaces describe domains rather than skills;
- candidates are named as candidates;
- requests and receipts are separate types;
- checks and verdicts are artifacts rather than booleans on subjects;
- raw bytes, OCR, classification, and extracted facts are distinct;
- structural references are reserved mainly for containment/composition;
- growing knowledge collections remain projections until frozen as manifests;
- T2/T3 schema freezing is intentionally deferred.

It should not yet be used as the registration input for a migration. The following are
the concrete blockers.

### 1. Split structural type definitions from search mappings

Every T0/T1 JSON file includes a top-level `search` member; for example
`todos.task@1` combines payload/reference schema and search pointers
([registration draft](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/todos.task.v1.json#L47)).
The spec deliberately gives artifact type versions and search mapping versions separate
identities and digests. Search tokenization, field selection, or normalization must be
changeable without creating a new artifact schema version.

Before registration:

- make the type-definition document contain only type identity, blob policy, validation
  profile, payload schema, reference schema, dependency closure, and notes excluded from
  the canonical definition as policy decides;
- move `search` to independently versioned mapping documents;
- give each mapping an exact type-version identity, projection version, mapping digest,
  and implementation dependencies;
- select mappings through a closed projection-generation catalog.

This is a catalog defect, not a spec defect.

### 2. Do not freeze open generic payloads as kernel T0 types

`policy.snapshot@1.values` and `external.capture@1.value` accept arbitrary objects
([policy schema](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/policy.snapshot.v1.json#L13),
[capture schema](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/external.capture.v1.json#L13)).
The note saying each policy key can be bounded “in a later version” cannot narrow an
already registered immutable v1. It would leave v1 permanently open and undermine the
spec's bounded, type-declared JSON contract.

Use policy-specific/capture-specific types, a bounded tagged union, or a small wrapper
whose primary blob or referenced artifact carries a separately registered schema.
Digest fields also need a defined algorithm/domain/canonicalization contract, not merely
a 64-character hexadecimal shape.

These two generic types should not be T0. The kernel does not require them to store a
file and manifest in Slice 1.

### 3. Make human decisions semantically typed

`review.decision@1` allows any gate matching a string pattern and any 255-character
selection, specifically so new gates do not require a new type version
([schema](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/review.decision.v1.json#L13)).
That convenience weakens the consumer contract: a tax classification choice, merge
direction, upload branch, payment approval, and deletion approval do not share the same
selection semantics or authority requirements.

A generic review outcome may remain useful, but consequential gate-specific values
should use domain decision types or a versioned decision procedure whose exact input and
selection schema is pinned in the run receipt. Publication must atomically bind the
subject proposal and policy as exact inputs. A button is only an input modality;
authenticated publisher/executor/initiator and current authorization establish who
decided and whether that decision may be consumed.

### 4. Resolve the email one-blob ambiguity

`inbox.message@1` says its optional primary blob is raw RFC 5322 bytes, then says the
full body also goes to “the blob” when the inline `bodyText` limit is exceeded
([schema and note](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/inbox.message.v1.json#L6)).
One artifact has one primary blob, so those are two different representations competing
for one slot.

Keep the raw message as the message's primary blob. Publish a derived normalized-text
artifact when the body must be independently searchable or exceeds the bounded preview,
with the message as a run input. Attachments remain structural references to exact file
occurrences.

### 5. Remove duplicate assertion endpoints or enforce equality atomically

`brain.assertion@1` embeds subject and object artifact UUIDs in its payload, forbids
references, and says both endpoints are also run inputs
([schema](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/types/brain.assertion.v1.json#L13)).
The schema cannot prove that the payload UUIDs equal the input IDs. A mismatch would
make the self-contained claim disagree with its authorized/traversable provenance.

Prefer exact input roles such as `subject` and `object` as the canonical endpoints, or
define a publication-time type-specific invariant that enforces equality. Do not retain
two unconstrained sources of endpoint truth. Retractions or supersession should likewise
consume/name the exact assertion being superseded rather than relying on a mutable graph
edge.

### 6. Treat null-schema catalog entries as candidates, not registered versions

The registry lists 52 versioned types, while 33 T2/T3 entries have `schema: null`
([registry](/home/daniel/src/MyAvenCEO/avenOS/artifact-types/registry.json#L28)). These are
useful namespace reservations and flow hypotheses, but they are not registrable artifact
type versions. Calling all 52 a registry risks making a design inventory look frozen.

Use separate `candidate`, `draft`, and `registrable` states. Start the implementation
with the spec's smallest vertical slice—normally `core.file@1` and
`core.manifest@1`—then add only the types needed for one proven end-to-end flow. Mocked
badges and log labels are not enough reason to freeze 19 schemas in the first migration.

## Service-plan assessment

The scaffold plan is architecturally compatible with the specification:

- one transport-neutral application kernel owns publication semantics;
- standalone HTTP is the production authority;
- Tauri remote mode is the default and does not ship PostgreSQL credentials;
- embedded PostgreSQL is explicit and retains real authorization requirements;
- Tauri commands mirror use cases rather than SQL or HTTP details;
- large bytes must stream rather than cross the webview as base64/JSON;
- runtime, migration, indexing, retention, and backup capabilities get separate roles;
- operational rows remain separate from immutable truth;
- implementation starts with irreversible decisions and executable contracts;
- the same contract is intended to be tested through HTTP, remote Tauri, and eligible
  embedded composition.

The relevant boundaries are stated directly in the plan
([application facade](/home/daniel/src/MyAvenCEO/avenOS/services/artifact-store/PLAN.md#L288),
[HTTP/Tauri contract](/home/daniel/src/MyAvenCEO/avenOS/services/artifact-store/PLAN.md#L312),
[database ownership](/home/daniel/src/MyAvenCEO/avenOS/services/artifact-store/PLAN.md#L335),
[verification](/home/daniel/src/MyAvenCEO/avenOS/services/artifact-store/PLAN.md#L456)).

Two implementation cautions follow from this UI backtest:

1. Tauri contract parity must include exact authenticated decision publication, scope
   transitions, commit cursors, and streamed byte ownership—not just CRUD-shaped calls.
2. The UI must never silently fall back from authoritative remote mode to local mocked
   state after a timeout. A degraded search or unavailable action is materially
   different from a negative result or completed effect.

## Recommended spec treatment

No structural change to `ARTIFACT-STORE.md` is required. Its current primitives and
boundaries cover every mocked flow. The AvenOS work should instead turn the following
into client/type-catalog acceptance criteria:

1. A decision publication names an exact proposal, exact policy/captures, authenticated
   reviewer, initiator, and decision procedure; changing any of them changes the request
   hash.
2. Confirming a stale, already resolved, purged, inaccessible, or superseded proposal
   fails closed and cannot execute an external action.
3. A rejected gate publishes a durable rejection when later work depends on it; simply
   dropping an in-memory callback is not an audit trail.
4. `me` to `team` and any broader visibility move requires an explicit authorized scope
   transition/declassification path.
5. A federated search response carries per-source completion/degradation metadata.
6. A durable negative-result artifact pins query, authorization context, projection
   generation, indexed-through commit, corpus boundary, and source completeness.
7. Search mapping changes do not create new artifact type versions or change existing
   artifact digests.
8. An all-day civil date survives timezone changes without moving to another date.
9. Three same-byte arrivals produce three artifacts and one blob; purging one occurrence
   retains bytes needed by the others.
10. One intent may atomically publish several outputs, and each downstream consumer
    handles the commit idempotently without treating workflow edges as provenance.
11. A payment/send/calendar action cannot be presented as completed until an executor
    receipt exists; ambiguous completion is reconciled rather than blindly retried.
12. Clear-done and entity merge update application projections without erasing retained
    task revisions, transitions, parties, assertions, or production history.

These are refinements of existing spec rules, not new kernel features.

## Suggested implementation order informed by AvenOS

The mocked breadth should not dictate the first migration. A lower-risk sequence is:

1. Complete Phase 0 decisions, golden digest vectors, bounded schemas, and client error
   contracts.
2. Register only corrected `core.file@1` and `core.manifest@1`; prove upload,
   occurrence-versus-blob identity, retrieval, feed, scope isolation, and recovery.
3. Add OCR/classification with exact evidence and atomic multi-output publication.
4. Add one complete intake-to-draft flow, keeping intent/skill/gate state in the app.
5. Add a domain-specific decision plus send request/receipt path, including stale
   decision and ambiguous external completion tests.
6. Add versioned search mappings and make artifact search one explicit AvenOS query
   source with degraded/completeness metadata.
7. Add todo revisions/transitions only after personal/team scope movement semantics are
   settled.
8. Add duplicate/merge and negative-retrieval artifacts only after their corpus,
   equivalence, retraction, and retention semantics are concrete.
9. Add privileged purge last, after legal policy, descendant/referrer analysis, shared
   blob behavior, backups, and recovery epochs are executable.

This order keeps the UI useful as a contract test without fossilizing every mock label
into version 1 storage.

## Verification performed

- Parsed every JSON document under `artifact-types/` with `jq`: all valid JSON.
- Executed `app/tests/query.test.ts`: 9 passed, 0 failed.
- Executed `app/tests/todo-machine-gate.test.ts`: 4 passed, 0 failed.
- Inspected the nine intent journeys, six skill templates, actor/HITL bus, query model,
  todo reducer, catalog, registration drafts, registry, and service plan.
- Confirmed the artifact-store Rust crates contain no meaningful implementation to run.
- Made no changes to the AvenOS repository, the artifact-store specification, or the
  previous repository backtest.

## Final assessment

AvenOS is a strong product backtest and a weak implementation backtest. It demonstrates
that the artifact store can support the intended UX without becoming the UX's workflow
database. Every journey fits the existing model when durable facts are separated from
pending work, UI projections, and external execution.

The specification is sound. The high-priority work is to keep the AvenOS integration
faithful to it: split search mappings from type registrations, narrow the first frozen
schemas, make decisions exact and authoritative, model scope transitions explicitly,
and never promote a partial search, a button press, or an optimistic UI message into
proof that a durable fact or external action exists.
