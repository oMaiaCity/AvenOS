# UI trace — every mock-up surface → its artifact types

Read alongside `CATALOG.md`. This file goes the other way round: it starts at the pixels
in the Tauri app and says what each one becomes in the store, so nothing on screen is
left unaccounted for.

Source of truth for the mock-up:
`app/src/lib/intents/IntentsPlaceholder.svelte` (the Intents workspace, 1549 lines),
`app/src/lib/skills/*.skill.ts` (the six skill templates),
`app/src/lib/actors/bus.ts` (the gate model),
`app/src/lib/query/sources.mock.ts` (the query fan-out).

---

## 1. The artifact rail — `MockArtifact.kind`

`IntentsPlaceholder.svelte:45` declares the mock-up's own first draft of this catalog:

```ts
interface MockArtifact {
    kind: 'doc' | 'todo' | 'calendar' | 'person' | 'entity' | 'statement'
    title: string
    note: string
}
```

with badges `KIND_LABEL = { doc: 'PDF', todo: 'TODO', calendar: 'KAL', person: 'WER',
entity: 'BRAIN', statement: 'KONTO' }` (`:131`). Each mock kind is a *rendering* class
and fans out to several real types:

| Mock kind | Real types | Why it splits |
| --- | --- | --- |
| `doc` | `core.file@1` + `ocr.text@1` + `core.document-classification@1` (+ `bookkeeping.invoice-candidate@1`, `contracts.contract@1` where extracted) | The bytes, the text, and what we think it is are three facts with three different producers. The doc preview at `:1213` draws all three at once — the page render, the text, and the yellow "Extrahiert" box. |
| `todo` | `todos.task@1` + `todos.status-transition@1` | The task and its movement are separate; the checkbox at `views/todo/view.ts` sends `TOGGLE`, which is a transition, not an edit of the task. |
| `calendar` | `calendar.event@1` (+ `calendar.reminder@1`) | Appointment and deadline are one type with a `kind` discriminator; the reminder is a separate declared fact. |
| `person` | `contact.party@1` (+ `contact.postal-address@1`) | "Techniker Krankenkasse · Firma · Versicherung" and "Anna Berger · Steuerberatung" are both parties; the address is separable because the merge gate compares on it. |
| `entity` | `brain.note@1` + `brain.assertion@1` | The Obsidian-style note at `:1294` is content; the `[[wikilinks]]` and backlinks around it are assertions. |
| `statement` | `banking.statement@1` + `banking.transaction@1` (+ `core.file@1` for the CSV) | The uploaded `kontoauszug-07.csv` is bytes; the "38 Transaktionen" are parsed facts; the three rows drawn at `:1282` are individual transactions. |

## 2. The intent stream (left column)

`MockIntent` (`:61`) — id, `type`, title, `source`, `when`, `deadline?`, `status`, log,
artifacts, skills, hitl.

- `type` ∈ `frist | bezahlen | steuer | auftrag | abgleich` → `intent.declaration@1`
  `.intentType`.
- `source` ∈ `Post-Scan · Brief`, `Upload · Rechnung`, `Upload · PDF`, `Upload · CSV`,
  `E-Mail · Stadt`, `Freitext · Chat`, `Dauerauftrag` → `intent.declaration@1`
  `.sourceChannel` (`postal-scan | upload | email | chat | standing-order`), and the
  *actual* source artifact is a production-run input (`core.file@1`,
  `inbox.message@1`, `chat.utterance@1`).
- `deadline` ("bis 15.09.") → `intent.declaration@1` `.deadline`, and separately a
  `calendar.event@1` with `kind: "deadline"` once the calendar skill schedules it.
- `status`, `when` ("heute · 09:12"), the archive drawer, the `STATE_ORDER` sort — **not
  artifacts**. Projection.

## 3. The activity log (centre column)

`LogEntry` (`:33`) — `step`, `when`, `state`, `skill`, `note?`, `card?`, `hitl?`.

The log line itself is **not** an artifact: it is a rendering of the production runs and
the artifacts they published. Every line maps to a run receipt plus its outputs:

| Log line (intent) | Run | Output artifacts |
| --- | --- | --- |
| "Brief eingegangen · Post-Scan · als Artefakt archiviert" (krankenkasse) | capture/import run, zero artifact inputs | `core.file@1` |
| "Klassifiziert · Krankenversicherung · Frist erkannt … Zuversicht 96 %" | `llm:classify` | `core.document-classification@1` (confidence 0.96), `inbox.intent-classification@1` |
| "Intent extrahiert · „Nachweis einreichen bis zur Frist" — ein Todo, ein Termin, ein Entwurf" | extraction | `intent.declaration@1` with three `requestedActions` |
| "Todo angelegt · „Nachweis einreichen" · fällig 12.09. · @me" | `op:create` | `todos.task@1` |
| "Kalender-Frist eingetragen · 15.09. · ganztägig" | `op:schedule` | `calendar.event@1` |
| "Antwortentwurf wartet auf Freigabe" | `llm:draft` | `docs.draft@1` (the run ends here — waiting is not part of it) |
| "Rechnung hochgeladen · rechnung-buerostuhl.pdf" (buerostuhl) | import | `core.file@1` |
| "Klassifiziert · Rechnung · 249,00 € · Zahlungsziel 30.08. · IBAN erkannt · Skonto: keins" | extraction | `core.document-classification@1` + `bookkeeping.invoice-candidate@1` |
| "Wartet auf Zahlung · der nächste Kontoauszug hakt das Todo automatisch ab" | — | **nothing**. This is a subscription/waiting state, pure operational. |
| "Artefakte verknüpft · 12 Artefakte im Brain" (steuer) | `op:link`, one per member | 12 × `brain.assertion@1` |
| "Sammelt weiter · fehlend laut Checkliste: Spendenquittungen, Handwerkerrechnungen" | checklist evaluation | `docs.completeness-check@1` |
| "Dublette gefunden · zwei Einträge für denselben Vermieter" (umzug) | `op:resolve` | `brain.duplicate-check@1` (similarity 0.88) |
| "Duplikate erkannt · drei identische Scans derselben Abrechnung" (stromabrechnung) | duplicate scan | `docs.duplicate-check@1` |
| "Terminkonflikt · der Vorschlag kollidiert mit einem bestehenden Termin" (kita) | conflict check | `calendar.conflict-check@1` (30 min overlap) |
| "Abgeglichen · 6 Zahlungen zugeordnet, 1 nachgefragt … 31 Daueraufträge übersprungen" (kontoauszug) | `llm:match` | `reconciliation.report@1` + n × `reconciliation.match-candidate@1` |
| "Todos abgehakt · 6 Rechnungs-Todos → erledigt" | `op:tick` | 6 × `todos.status-transition@1`, each with the match as a declared input |
| "Kündigungsfrist erkannt · Vertrag läuft am 31.08. aus · Frist 4 Wochen" (handyvertrag) | extraction | `contracts.contract@1` |
| "Kündigung freigegeben und versendet · Bestätigung liegt im Archiv" | approve, then send | `review.decision@1` → `docs.send-request@1` → `docs.send-receipt@1`, and the inbound confirmation is a new `core.file@1` |
| "Vertrag nicht gefunden · kein FitX-Vertrag im Archiv — 428 Dokumente durchsucht" (fitnessstudio) | archive search | `docs.retrieval-result@1` (`outcome: "not-found"`, `corpusSize: 428`) |

`LogEntry.card` (the rich "mail preview" card) has no type of its own — it renders the
payload of whatever the run published.

## 4. The HITL gates

`HeldMessage` + `HeldPreview` (`app/src/lib/actors/bus.ts:34`). The bar owns five
*structural* layouts; skills own which one their gate speaks in. Every gate resolves to
exactly one `review.decision@1`, plus whatever the approved action then produces.

| Gate `method` | `preview.kind` / layout | The proposal under the gate | On approve |
| --- | --- | --- | --- |
| `draft_approve` | `entwurf` / document | `docs.draft@1` (body + `einkommensnachweis.pdf`) | `review.decision@1` → `docs.send-request@1` → `docs.send-receipt@1` |
| `payment_release` | `zahlung` / ledger | `payments.payment-request@1` (249,00 € · fällig 30.08. · IBAN · Von Konto Giro 4.120,55 €) | `review.decision@1` → executor → `payments.payment-receipt@1` |
| `classify_confirm` | `zuordnung` / choice | `tax.deduction-classification@1` (§35a 78 % / Erhaltungsaufwand 19 % / privat 3 %) | `review.decision@1` with `selection` |
| `entity_merge` | `dublette` / compare | `brain.duplicate-check@1` (88 %, same address) | `review.decision@1` → `brain.merge@1` |
| `calendar_conflict` | `konflikt` / compare | `calendar.conflict-check@1` (28.08., 30 min overlap) | `review.decision@1` → `calendar.event@1` |
| `docs_delete` | `löschen` / list | `docs.duplicate-check@1` (original + 3 struck) | `review.decision@1` → `retention.purge-request@1` → tombstones |
| `match_confirm` | `abgleich` / compare | `reconciliation.match-candidate@1` (score 0.91, under the auto threshold) | `review.decision@1` → `todos.status-transition@1` |
| `archive_confirm` | `ablage` / document | the incoming confirmation `core.file@1` | `review.decision@1` → `docs.filing@1` |
| `upload_request` | `fehlt` / choice | `docs.retrieval-result@1` (`not-found`, 428 searched) | `review.decision@1` with `selection`; the upload branch produces a new `core.file@1` |

Note what the gate itself contributes: **nothing**. `id`, `actor`, `label`, `detail`,
`context`, queue position, the fact that it is still pending — all operational.
`GatePreview.svelte`'s "voice cannot confirm; only a physical button press" is an
authorization property of the decision, recorded in `review.decision@1.decidedVia`.

## 5. The skill workflows

The node `provides`/`requires` predicates in `app/src/lib/skills/` are the flowing
values. Each predicate that carries durable content gets a type; the rest are control
signals.

### `inbox` — intake (`inbox.skill.ts`)

| Node | Predicate | Type |
| --- | --- | --- |
| `mail-trigger` | `mail(M)` | `inbox.message@1` |
| `upload-trigger` | `upload(U)` | `core.file@1` |
| `normalize` (`envelope: [source, time, text, attachments]`, `dedupe: hash`) | `intake(I)` | `inbox.intake@1` |
| `classify` (`classes: [todo, document, entity]`, `threshold: 0.8`, `belowThreshold: unknown`) | `intent(I, Class)` | `inbox.intent-classification@1` — and the threshold itself is a `policy.snapshot@1` input |
| `route` | `todo_intent(I)`, `doc(D)`, `entity(E)`, `unknown_item(I)` | `inbox.routing@1` (T2) |
| `queue-view` | `queued` | — (projection) |

### `todos` — capture + sweep (`todos.skill.ts`)

| Node | Predicate | Type |
| --- | --- | --- |
| `voice-trigger` | `todo_intent(I)` | `chat.utterance@1` → `intent.declaration@1` |
| `create` (`fields: [title, tags, due, responsible, spark]`) | `todo(T)` | `todos.task@1` |
| `list-view` / `board-view` | `listed`, `boarded` | — (projections; `ui.view-definition@1` if the view JSON is stored) |
| `sweep-trigger` / `clear-done` | `sweep_request(S)`, `swept` | — (deletion is a projection change; see open decision on `todos.deletion`) |

### `docs` — respond (`mocked.skills.ts:10`)

`doc_request(R)` → `intent.declaration@1`; `draft(D)` → `docs.draft@1`;
`approved(D)` → `review.decision@1`; `doc(D)` at `finish` → `docs.send-request@1` +
`docs.send-receipt@1` (sent) or `docs.filing@1` (filed).

### `calendar` — frist (`mocked.skills.ts:61`)

`date_intent(D)` → `intent.declaration@1`; `event(E, Time)` → `calendar.event@1`;
`reminder(R)` → `calendar.reminder@1`; `due(E)` → nothing (a view over the event).

### `brain` — verknüpfen (`mocked.skills.ts:112`)

`entity(E)` → `contact.party@1` / `brain.note@1`; `resolved(E)` →
`brain.duplicate-check@1` (+ `brain.merge@1` when merged); `linked(E)` →
`brain.assertion@1`; `enriched(E)` → `brain.enrichment@1`.

### `abgleich` — match (`mocked.skills.ts:164`)

`statement(S)` → `core.file@1` + `banking.statement@1` + n × `banking.transaction@1`;
`matched(M)` → `reconciliation.match-candidate@1` + `reconciliation.report@1`;
`ticked(T)` → `todos.status-transition@1`.

## 6. The query fan-out

`app/src/lib/query/sources.mock.ts` registers sources `todos`, `contacts`, `calendar`,
`docs`, `brain`, `windows` with row `shape`s `check | person | time | doc | note`. These
are **search projection** concerns, not types: the shape is a renderer hint, and
`answer.ts` is explicit that "nothing in this file may branch on its value". They map
one-to-one onto the search mappings for `todos.task@1`, `contact.party@1`,
`calendar.event@1`, `core.file@1`, `brain.note@1`. The `windows` source answers with
view keys and stores nothing.

## 7. Conversation

`chat.actor.svelte.ts` + `chat/chat.svelte.ts`: turns with `role: 'user' | 'assistant'`,
streamed deltas, tool rounds.

- A user turn that starts work ("Sammle alles zum Umzug an einem Ort", "Kündige das
  Fitnessstudio") → `chat.utterance@1`. Both appear in the mock-up as
  `source: 'Freitext · Chat'`.
- Assistant deltas, the placeholder/discard dance, tool-call envelopes, the degeneration
  guard → **operational**, per the spec's "agent scratchpad, private reasoning,
  transient tool call, or streaming token".
- On-device ASR (`listener.actor`, Silero VAD + Nemotron) → `asr.transcript@1` (T3) only
  if the audio or the per-word timings ever need to be retained; otherwise the text goes
  straight into `chat.utterance@1` with the model id in the producing run's
  implementation receipt.

## 8. What is deliberately NOT an artifact

Ordered by how tempting each one is.

| On screen | Why not |
| --- | --- |
| `MockIntent.status` (`working/waiting/done/error/archive`), the `STATE_ORDER` sort, the archive drawer | Mutable case lifecycle. The store must not gain a universal status column. |
| `SkillStatus` (`state`, `note`, `done[]`, `current`) — the instance overlay on the flow canvas | Per-run progress. Only completed runs become receipts; `current` is by definition unfinished. |
| `LogEntry` rows, their `when` strings, the dot colours | Rendering of runs + artifacts. Storage time ≠ domain time. |
| `HeldMessage` (queue, label, detail, context) | Review task state. The decision is the artifact. |
| "Wartet auf Zahlung — der nächste Kontoauszug hakt das Todo automatisch ab" | A subscription, not a fact. |
| "[[Steuer 2023]] · 12 Artefakte", "[[Umzug 2025]] · 9 Verknüpfungen", backlink counts | Projections over `brain.assertion@1`. Frozen for handover → `core.manifest@1`. |
| Sparks (`me`, `team`) | Authorization scope, not payload. See open decision 4. |
| `windows` query source, `list`/`board` view toggles, `WindowActor` open/closed | UI state. |
| Streaming deltas, `speaker`/`listener` status, model load percentages | Transient. |
| Tool-call envelopes on the bus, `activity.svelte.ts` toasts | Operational diagnostics. |
| "Seite 1 / 2" in the doc preview | Rendering; the page count lives in `ocr.text@1.pageCount`. |
| `catalogCoverage()` / `reconcile()` drift report | Build-time check. |
