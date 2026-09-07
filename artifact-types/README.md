# Artifact types — first version

The artifact-type inventory for avenOS, derived from **what the Tauri app's mock-up UI
already shows**, expressed against the design in
`/home/daniel/src/jaensen/avenCEO-tools/ARTIFACT-STORE.md`.

The question this directory answers is deliberately narrow:

> Everything the mock-up puts on screen — which of those things is an **artifact**
> (immutable typed content in the store), what is its **type key**, and what does its
> payload/blob/reference contract look like?

It is a type catalog, not an implementation. No migration, no SQL, no server code.

## What's here

| File | What it is |
| --- | --- |
| `README.md` | This: scope, naming rules, tiers, the full index |
| `UI-TRACE.md` | Every mock-up surface → the types it becomes, and what is deliberately *not* an artifact |
| `CATALOG.md` | One entry per type: blob policy, references, payload fields, producing run, evidence, search |
| `registry.json` | Machine-readable index of all 52 types (key, version, tier, blob policy, schema path) |
| `types/*.json` | Registration documents (payload + reference JSON Schema 2020-12) for the tier 0 + tier 1 set |

## Where the types come from

Read in this order; every type in `CATALOG.md` cites its origin line.

- `app/src/lib/intents/IntentsPlaceholder.svelte` — the Intents workspace. Nine mocked
  intents with their activity logs, artifact rails, per-skill instance state and HITL
  gates. This is the single richest source: the `MockArtifact.kind` union
  (`doc | todo | calendar | person | entity | statement`) is literally a first draft of
  this catalog.
- `app/src/lib/skills/*.skill.ts` + `mocked.skills.ts` — the six skill templates
  (`inbox`, `todos`, `docs`, `calendar`, `brain`, `abgleich`). Each node's
  `provides`/`requires` predicates name the values that flow — those predicates are what
  become typed artifacts.
- `app/src/lib/actors/bus.ts` — `HeldPreview`: the five structural gate layouts
  (`document | ledger | choice | compare | list`) and the nine gate `method`s.
- `app/src/lib/actors/todo.config.ts` — the todo tool schema: the real field list for
  `todos.task@1` (title, tags, due as date-or-range, responsible, spark).
- `app/src/lib/query/sources.mock.ts` — the query fan-out: which sources answer at all
  (`todos, contacts, calendar, docs, brain`) and their row `shape`s.
- `libs/aven-skills/src/index.ts` — the shared skill catalog, including announced-but-
  unbuilt skills. Used only to check that a type family has an owner.

## Naming rules

Type keys follow the spec's recommended format `^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$` and
are written `namespace.name@version`.

1. **The namespace is the domain, not the skill.** The skill `abgleich` produces
   `banking.*`, `reconciliation.*` and `payments.*` types. A skill can be renamed,
   split, or replaced by a competitor implementation; the domain vocabulary outlives it.
   `CATALOG.md` records the owning skill separately.
2. **English keys, always** — even where the UI copy is German. `abgleich`'s output is
   `reconciliation.match-candidate@1`, not `abgleich.zuordnung@1`. The keys are a wire
   contract shared with the SDK and the search mappings.
3. **A candidate is named a candidate.** `bookkeeping.invoice-candidate@1`,
   `reconciliation.match-candidate@1`, `docs.draft@1`. Immutability means "this result
   existed", never "this result is correct" — the name has to carry that.
4. **Request and receipt are two types**, never one with a status field:
   `payments.payment-request@1` → `payments.payment-receipt@1`.
5. **Checks and verdicts are typed artifacts**, not booleans on the subject:
   `docs.duplicate-check@1`, `calendar.conflict-check@1`, `brain.duplicate-check@1`.
6. **Version 1 for everything.** A changed schema is a new version, never an edit.

## Tiers

The spec's first migration should register "only types required for one end-to-end
flow". These tiers say what to register when, and are carried in `registry.json`.

| Tier | Meaning | Count |
| --- | --- | --- |
| **T0** | Kernel. Register with slice 1 (immutable storage). Nothing domain-shaped. | 4 |
| **T1** | The one end-to-end flow the mock-up leads with: letter arrives → classified → intent → todo + calendar deadline + draft → human approves. Register with slice 2 (derivation graph). | 15 |
| **T2** | The rest of what the mock-up actually renders: bank statements, matches, payments, duplicates, merges, filings, retrieval failures. Slices 2–4. | 23 |
| **T3** | Verticals and platform types the mock-up implies but does not draw (SKR04 postings, tax deduction classes, skills-as-data). Deferred; listed so the namespaces are reserved. | 10 |

`types/*.json` exists for T0 and T1 (19 registration documents). T2/T3 are specified in
`CATALOG.md` at field level but deliberately have no frozen schema yet — freezing a
schema is irreversible, and those payloads are still moving.

## Index

Tier · type key · blob policy · references · owning skill

### Core kernel

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `core.file@1` | T0 | required | forbidden | inbox |
| `core.manifest@1` | T0 | forbidden | `member[]` | — |
| `policy.snapshot@1` | T0 | optional | forbidden | — |
| `external.capture@1` | T0 | optional | forbidden | — |
| `core.document-classification@1` | T1 | forbidden | forbidden | inbox |
| `ocr.text@1` | T1 | required | forbidden | docs |

### Intake and intent

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `inbox.message@1` | T1 | optional | `attachment[]` | inbox |
| `inbox.intake@1` | T1 | forbidden | `source`, `attachment[]` | inbox |
| `inbox.intent-classification@1` | T1 | forbidden | forbidden | inbox |
| `intent.declaration@1` | T1 | forbidden | forbidden | inbox |
| `inbox.routing@1` | T2 | forbidden | forbidden | inbox |
| `chat.utterance@1` | T1 | forbidden | forbidden | chat |
| `asr.transcript@1` | T3 | optional | forbidden | chat |

### Human decisions

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `review.decision@1` | T1 | forbidden | forbidden | human-reviewer |
| `review.correction@1` | T2 | forbidden | forbidden | human-reviewer |

### Todos

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `todos.task@1` | T1 | forbidden | forbidden | todos |
| `todos.status-transition@1` | T1 | forbidden | forbidden | todos |

### Calendar

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `calendar.event@1` | T1 | forbidden | forbidden | calendar |
| `calendar.reminder@1` | T2 | forbidden | forbidden | calendar |
| `calendar.conflict-check@1` | T2 | forbidden | forbidden | calendar |

### Documents

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `docs.draft@1` | T1 | optional | `attachment[]` | docs |
| `docs.filing@1` | T2 | forbidden | forbidden | docs |
| `docs.duplicate-check@1` | T2 | forbidden | forbidden | docs |
| `docs.completeness-check@1` | T2 | forbidden | forbidden | docs |
| `docs.retrieval-result@1` | T2 | forbidden | forbidden | docs |
| `docs.send-request@1` | T2 | forbidden | `attachment[]` | docs |
| `docs.send-receipt@1` | T2 | forbidden | forbidden | docs |

### Entities and the brain

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `contact.party@1` | T1 | forbidden | forbidden | brain |
| `brain.note@1` | T1 | optional | forbidden | brain |
| `brain.assertion@1` | T1 | forbidden | forbidden | brain |
| `contact.postal-address@1` | T2 | forbidden | forbidden | brain |
| `brain.duplicate-check@1` | T2 | forbidden | forbidden | brain |
| `brain.merge@1` | T2 | forbidden | forbidden | brain |
| `brain.enrichment@1` | T2 | forbidden | forbidden | brain |

### Banking, reconciliation, payments

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `banking.statement@1` | T2 | forbidden | `transaction[]` | abgleich |
| `banking.transaction@1` | T2 | forbidden | forbidden | abgleich |
| `reconciliation.match-candidate@1` | T2 | forbidden | forbidden | abgleich |
| `reconciliation.report@1` | T2 | forbidden | forbidden | abgleich |
| `payments.payment-request@1` | T2 | forbidden | forbidden | abgleich |
| `payments.payment-receipt@1` | T2 | forbidden | forbidden | abgleich |

### Bookkeeping and contracts

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `bookkeeping.invoice-candidate@1` | T2 | forbidden | forbidden | abgleich |
| `contracts.contract@1` | T2 | forbidden | forbidden | docs |
| `bookkeeping.duplicate-check@1` | T3 | forbidden | forbidden | abgleich |
| `bookkeeping.posting-proposal@1` | T3 | forbidden | forbidden | finance-brain |
| `bookkeeping.posting-request@1` | T3 | forbidden | forbidden | finance-brain |
| `bookkeeping.posting-receipt@1` | T3 | forbidden | forbidden | finance-brain |
| `tax.deduction-classification@1` | T3 | forbidden | forbidden | finance-brain |

### Retention

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `retention.purge-request@1` | T2 | forbidden | forbidden | — |

### Platform (skills and views as data)

| Type | T | Blob | Refs | Skill |
| --- | --- | --- | --- | --- |
| `skill.definition@1` | T3 | forbidden | `workflow[]`, `view[]` | — |
| `skill.workflow@1` | T3 | forbidden | `machine?` | — |
| `skill.machine@1` | T3 | required | forbidden | — |
| `ui.view-definition@1` | T3 | forbidden | forbidden | — |

**52 types**: 4 T0, 15 T1, 23 T2, 10 T3.

## The three rules that shaped the list

Everything the mock-up shows was tested against the spec's "artifact or operational
state?" table. Three calls decided most of the catalog:

1. **Status is not part of the artifact.** `MockIntent.status`
   (`working | waiting | done | error | archive`), `SkillStatus.state`, and
   `LogEntry.state` are workflow state. The intent card is a *projection*;
   `intent.declaration@1` stores what was asked for, and the movement through
   open → doing → done is a stream of `todos.status-transition@1` facts.
2. **The gate is operational; the thing behind it is content.** `HeldMessage` — queue
   position, label, `context` — never gets stored. The *proposal* under it (draft,
   payment, merge, classification) is an artifact, and the button press produces
   `review.decision@1`.
3. **A growing collection is a projection; a frozen one is a manifest.**
   "[[Steuer 2023]] · Brain · 12 Artefakte" keeps growing, so it is a query over
   `brain.assertion@1`. The bundle actually handed to the Steuerberater is frozen and
   becomes `core.manifest@1`.

`UI-TRACE.md` carries the full non-artifact list.

## Open decisions

These need an answer before the first migration; each is flagged at its type in
`CATALOG.md`.

1. **Money representation.** Minor-unit integer + ISO-4217 code, or decimal string? The
   spec warns that RFC 8785 number canonicalization is only safe if schemas constrain
   numbers to the interoperable range. The schemas here use **minor-unit integers**
   (`{ "amountMinor": -115000, "currency": "EUR" }`) so no artifact digest ever depends
   on a float. Confirm before freezing `banking.transaction@1`.
2. **`ocr.text@1` blob policy.** Set to `required` (UTF-8 text blob) so one registered
   version does not have an undecided policy. If bounded inline text is wanted for short
   scans, that is a *second* type, not an optional blob.
3. **Todo identity across revisions.** `todos.task@1` is a complete immutable value; a
   retitle publishes a new one. The "same todo" is a preferred-head projection keyed by
   `taskKey`. Confirm that the app is willing to hold that pointer outside the store.
4. **Spark = authorization scope?** The todo config's `spark` (`me`, `team`) looks
   exactly like the spec's `authorization_scope_id`. If it is, `spark` must *not* also
   live in the payload of `todos.task@1` — it would be an ACL encoded into content.
   Currently modelled as scope, with the payload field removed. Confirm.
5. **Wikilink targets.** `brain.note@1` bodies contain `[[Name]]` links. Those resolve
   against mutable entity names. `brain.assertion@1` carries the resolved artifact ids;
   the note body keeps the human text. Confirm nothing else may resolve links at read
   time.
