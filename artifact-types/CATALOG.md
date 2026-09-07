# Catalog — all 52 artifact types

One entry per type. `T0`–`T3` are the registration tiers from `README.md`.
"UI" cites where in the Tauri mock-up the type is visible.
Field names are the canonical payload keys; JSON Schemas for T0/T1 live in `types/`.

Conventions used throughout:

- **Money** is always a pair: `amountMinor` (integer, minor units, signed) +
  `currency` (ISO 4217). No floats ever enter a digest.
- **Domain time** is explicit and never called `createdAt`: `receivedAt`, `observedAt`,
  `issuedAt`, `dueAt`, `bookedAt`, `decidedAt`. Storage time belongs to the envelope.
- **Confidence** is `0..1` and is procedure-specific evidence, never authorization.
- **Subjects come in as run inputs**, not as structural references, unless the artifact's
  value genuinely *contains* the other artifact (manifests, attachments).

---

## Core kernel

### `core.file@1` · T0 · inbox

> UI — every `kind: 'doc'` card: `krankenkasse-brief.pdf`, `rechnung-buerostuhl.pdf`,
> `stromabrechnung-2024.pdf`, `kontoauszug-07.csv`, `kita-einladung.pdf`,
> `lohnsteuerbescheinigung-2023.pdf`, `IMG_2291.pdf`. Also the `upload-trigger` node
> ("Drag & drop and share-sheet").

- **Blob** required · **References** forbidden
- **Payload** — `originalName`, `declaredMediaType`, `detectedMediaType`, `sizeBytes`,
  `source` `{ channel: 'upload'|'email'|'postal-scan'|'share-sheet'|'connector',
  label?, receivedAt, externalRef? }`, `pageCount?`
- **Produced by** — a zero-input capture/import run when the acquisition receipt matters
  (scan batch, mail fetch); a direct root publication for a plain drag & drop.
- **Search** — `originalName`, `source.label`
- **Notes** — Detected media type is derived from bytes; the declared value is kept as
  provenance, never trusted. The same bytes arriving twice (email + manual upload) are
  two `core.file@1` occurrences sharing one blob — that is the point of the mock-up's
  "drei identische Scans".

### `core.manifest@1` · T0 · —

> UI — "Kontoauszüge Q1–Q4 2023 · 4 Dateien" (steuer intent), the frozen bundle behind
> "Unterlagen an Steuerberater", and mail-with-attachments.

- **Blob** forbidden · **References** `member[]` (ordered, ≥1)
- **Payload** — `purpose` (`handover | period-bundle | email-package | export | renditions`),
  `displayName?`, `format?`, `profile?`, `coverage?` `{ from, to }`
- **Reference attributes** — `path?`, `label?`, `role?` (member-specific facts only)
- **Search** — `displayName`, `purpose`. Never member payloads.
- **Notes** — Meaning is only "this frozen value packages these exact members". A brain
  collection that still grows is a projection, not a manifest.

### `policy.snapshot@1` · T0 · —

> UI — `classify`'s `threshold: 0.8` / `belowThreshold: 'unknown'`
> (`inbox.skill.ts:62`), and "Score 91 % — knapp unter der Auto-Schwelle"
> (`IntentsPlaceholder.svelte:664`).

- **Blob** optional (large rulesets) · **References** forbidden
- **Payload** — `policyKey`, `policyVersion`, `effectiveFrom`, `capturedAt`,
  `values` (object, schema-bounded per policy key), `sourceDigest?`
- **Produced by** — a capture run against the config store.
- **Search** — `policyKey`
- **Notes** — Any run whose result depends on a threshold, a chart of accounts, a tax
  rule, or a matching policy must declare the snapshot as an input. A bare config read at
  run time makes the receipt unreproducible.

### `external.capture@1` · T0 · —

> UI — "Von Konto · Giro · 4.120,55 €" in the payment gate; supplier/bank master data
> behind "Möbelhaus Nord GmbH · IBAN erkannt".

- **Blob** optional · **References** forbidden
- **Payload** — `sourceSystem`, `sourceRef`, `sourceVersion?`, `observedAt`,
  `valueDigest`, `value?` (object, bounded), `mediaType?`
- **Produced by** — connector capture run, zero artifact inputs.
- **Search** — `sourceSystem`, `sourceRef`
- **Notes** — The spec's "mutable external data must be snapshotted" rule. A foreign id
  alone is not evidence for a consequential result.

### `core.document-classification@1` · T1 · inbox

> UI — the "Klassifiziert" log cards: "Krankenversicherung · Frist erkannt … Zuversicht
> 96 %", "Rechnung · 249,00 € · Möbelhaus Nord GmbH · Zahlungsziel 30.08."

- **Blob** forbidden · **References** forbidden
- **Payload** — `rawKind`, `resolvedKind`, `resolutionMode`
  (`model | rule | human | fallback`), `confidence`, `reason`,
  `alternatives[]` `{ kind, confidence }`
- **Produced by** — `llm:classify`; input role `subject` (the `core.file@1` or
  `ocr.text@1`), plus `policy` (the threshold snapshot).
- **Evidence** — `/resolvedKind` → the page region or text span that decided it.
- **Search** — `rawKind`, `resolvedKind`, `reason`
- **Notes** — `resolvedKind: 'unknown'` is honest and required when confidence is below
  the snapshotted threshold; there is no dishonest fallback kind. Procedure identity lives
  in the run receipt, not here.

### `ocr.text@1` · T1 · docs

> UI — the doc preview's yellow "Extrahiert" box (`IntentsPlaceholder.svelte:1222`), and
> "Post-Scan · Brief" as an intent source.

- **Blob** **required** (UTF-8 text) · **References** forbidden
- **Payload** — `language`, `pageCount`, `encoding` (`utf-8`), `coordinateSpace`
  (`normalized | pdf-user-space`), `characterCount`, `engine?` (`{ name, version }` —
  duplicated from the receipt only when downstream code branches on it)
- **Produced by** — OCR run; input role `document` (the `core.file@1`).
- **Evidence** — none of its own; it *is* the evidence target for everything downstream
  (`text-range` locators point into this blob).
- **Search** — full text from the blob, `language`
- **Notes** — Do not duplicate the complete text into the payload. Text ranges are counted
  in Unicode code points; the canonicalizer's NFC requirement is what keeps those offsets
  valid.

---

## Intake and intent

### `inbox.message@1` · T1 · inbox

> UI — `mail-trigger` ("Watches the mailbox; every message and attachment becomes
> intake", `dedupe: 'message-id'`); the kita intent's source "E-Mail · Stadt" and log line
> "E-Mail eingegangen · Einladung zum Anmeldegespräch · Frist 01.09."

- **Blob** optional (the raw RFC 5322 bytes) · **References** `attachment[]` → `core.file@1`
- **Payload** — `messageId`, `from` `{ address, name? }`, `to[]`, `cc[]`, `subject`,
  `receivedAt`, `sentAt?`, `bodyText?` (bounded; the full body goes to the blob),
  `mailbox`, `folder?`
- **Produced by** — mail connector capture run, zero artifact inputs.
- **Search** — `subject`, `from.name`, `from.address`, body text
- **Notes** — Attachments are structural references, not run inputs: the message value
  genuinely contains them. Dedupe by `messageId` is a producer-side idempotency key, not a
  store-level uniqueness constraint.

### `inbox.intake@1` · T1 · inbox

> UI — the `normalize` node: "Whatever arrived becomes one clean envelope: source, time,
> text, files", `config: { envelope: ['source','time','text','attachments'], dedupe: 'hash' }`.

- **Blob** forbidden · **References** `source` (exactly 1), `attachment[]`
- **Payload** — `channel` (`email | upload | postal-scan | chat | connector`),
  `arrivedAt`, `text?` (bounded normalized text), `subjectLine?`, `senderLabel?`,
  `attachmentCount`
- **Produced by** — `op:normalize`; the run consumes `inbox.message@1` / `core.file@1` /
  `chat.utterance@1`.
- **Search** — `text`, `senderLabel`, `subjectLine`
- **Notes** — This is the one join point where mail, upload, scan and chat become the same
  shape. Its `source` reference is deliberately structural: the envelope *is about* that
  exact arrival, and the reference makes the pairing part of the digest.

### `inbox.intent-classification@1` · T1 · inbox

> UI — the `classify` node: `classes: ['todo','document','entity']`, `threshold: 0.8`,
> `belowThreshold: 'unknown'`.

- **Blob** forbidden · **References** forbidden
- **Payload** — `class` (`todo | document | entity | unknown`), `confidence`,
  `threshold`, `belowThresholdBehaviour`, `reason`,
  `alternatives[]` `{ class, confidence }`
- **Produced by** — `llm:classify`; inputs `subject` (`inbox.intake@1`) + `policy`
  (`policy.snapshot@1`).
- **Search** — `class`
- **Notes** — Distinct from `core.document-classification@1`: that one says *what a
  document is*, this one says *where the case goes*. They have different vocabularies and
  different consumers, so they are different types.

### `intent.declaration@1` · T1 · inbox

> UI — the entire left column. `MockIntent.type` (`frist | bezahlen | steuer | auftrag |
> abgleich`), title, source, deadline; the log line "Intent extrahiert · „Nachweis
> einreichen bis zur Frist" — ein Todo, ein Termin, ein Entwurf".

- **Blob** forbidden · **References** forbidden
- **Payload** — `intentType`, `title`, `summary?`, `sourceChannel`, `observedAt`,
  `deadline?` `{ dueAt, label? }`,
  `requestedActions[]` `{ kind: 'todo'|'calendar'|'draft'|'link'|'match'|'other', note? }`,
  `language`
- **Produced by** — extraction run; inputs `subject` (`inbox.intake@1`), optionally
  `classification`.
- **Evidence** — `/deadline/dueAt`, `/title` → text spans in `ocr.text@1`.
- **Search** — `title`, `summary`, `intentType`
- **Notes** — Carries **no status**. The intent card's `working/waiting/done/error/archive`
  is a projection keyed by this artifact's id. Do not add one "because the UI shows it".

### `inbox.routing@1` · T2 · inbox

> UI — the `route` node: "Exactly one branch fires per case — the intent decides, nobody
> else", provides `todo_intent(I)`, `doc(D)`, `entity(E)`, `unknown_item(I)`.

- **Blob** forbidden · **References** forbidden
- **Payload** — `branch`, `targetSkill`, `reason`, `wasHumanRouted` (bool)
- **Notes** — Optional. Register only if "why did this land in docs and not todos?" must
  be answerable after the fact; otherwise the classification plus the downstream run
  receipts already say it.

### `chat.utterance@1` · T1 · chat

> UI — `source: 'Freitext · Chat'` on the umzug and fitnessstudio intents:
> "Sammle alles zum Umzug an einem Ort", "Kündige das Fitnessstudio". Also the
> `voice-trigger` node in the todos skill.

- **Blob** forbidden · **References** forbidden
- **Payload** — `text`, `language`, `modality` (`voice | text`), `spokenAt`,
  `asr?` `{ model, confidence?, durationMs? }`, `conversationRef?` (opaque projection key)
- **Produced by** — capture run for voice (the ASR model belongs in the run's
  implementation receipt), direct root publication for typed input.
- **Search** — `text`
- **Notes** — Only utterances that *start or change durable work* are published. The rest
  of the conversation — assistant deltas, tool rounds, the placeholder/discard dance — is
  operational.

### `asr.transcript@1` · T3 · chat

- **Blob** optional (the audio segment) · **References** forbidden
- **Payload** — `language`, `durationMs`, `segments[]` `{ startMs, endMs, text, confidence }`,
  `model`, `vad?`
- **Notes** — Deferred. Register only when word timings or the audio itself must be
  retained (dispute, training, accessibility). Media-time-range locators point into it.

---

## Human decisions

### `review.decision@1` · T1 · human-reviewer

> UI — all nine gates in `HeldPreview`, and the log line "Antwortentwurf wartet auf
> Freigabe" once it resolves. `GatePreview.svelte`: "it opens ONLY by a physical button
> press; voice cannot confirm."

- **Blob** forbidden · **References** forbidden
- **Payload** — `outcome` (`approved | rejected | abstained | needs-changes | escalated`),
  `gate` (the method key: `draft_approve`, `payment_release`, `classify_confirm`,
  `entity_merge`, `calendar_conflict`, `docs_delete`, `match_confirm`, `archive_confirm`,
  `upload_request`), `selection?` (chosen option id, for `choice` gates), `rationale?`,
  `decidedAt`, `decidedVia` (`button` — the only accepted value in v1),
  `reviewerRole?`
- **Produced by** — a human-review run whose executor is the reviewer; inputs `subject`
  (the proposal artifact) and `policy`.
- **Search** — `outcome`, `gate`, `rationale`
- **Notes** — One decision per reviewer per gate; multiple reviewers produce multiple
  decisions and an adjudication run consumes them. `decidedVia` exists so the "voice
  cannot confirm" rule is auditable rather than merely enforced in the UI. Downstream
  executors authorize against *this artifact*, never against the existence of the
  proposal.

### `review.correction@1` · T2 · human-reviewer

> UI — implied by "Correction produces a new artifact in the same human-review run" and by
> the choice gates where the human picks a non-recommended option.

- **Blob** forbidden · **References** forbidden
- **Payload** — `patches[]` `{ pointer (RFC 6901), previousValue, correctedValue, note? }`,
  `correctedAt`, `scopeNote?`
- **Notes** — The corrected *value* is published as a new artifact of the original type in
  the same run; this type records what a human changed and why. The machine candidate
  survives untouched.

---

## Todos

### `todos.task@1` · T1 · todos

> UI — every `kind: 'todo'` card ("Nachweis einreichen · offen · fällig 12.09. · @me",
> "Bürostuhl bezahlen · fällig 30.08. · #rechnung"), plus the real tool schema in
> `todo.config.ts:82` (`titles`, `tags`, `due` as `{date}` or `{start,end}`,
> `responsible`, `spark`).

- **Blob** forbidden · **References** forbidden
- **Payload** — `taskKey` (stable logical id across revisions), `title`, `tags[]`,
  `due?` (`{ date }` **or** `{ start, end }`, `oneOf`), `responsible?`, `note?`,
  `revision` (integer ≥ 1)
- **Produced by** — `op:create`; inputs `intent` (`intent.declaration@1`) or
  `utterance` (`chat.utterance@1`).
- **Search** — `title`, `tags`, `responsible`; typed filters on `due.date` / `due.start`
- **Notes** — **No status field.** The three states live in
  `todos.status-transition@1`, gated by `todo-machine.pl`. A retitle publishes a new
  `todos.task@1` with the same `taskKey` and `revision + 1`; the head is a projection.
  **No spark field** — spark is the authorization scope (open decision 4).

### `todos.status-transition@1` · T1 · todos

> UI — the checkbox in `views/todo/view.ts` (`send: 'TOGGLE'`), the kanban columns, and
> "6 Rechnungs-Todos → erledigt" in the kontoauszug intent.

- **Blob** forbidden · **References** forbidden
- **Payload** — `taskKey`, `from` (`open | doing | done`), `to`, `occurredAt`,
  `trigger` (`human | match | sweep | agent`), `reason?`
- **Produced by** — `op:update` / `op:tick`; inputs `task` (the exact
  `todos.task@1` revision) and, for the automatic tick, `match`
  (`reconciliation.match-candidate@1`) plus `decision` where a human confirmed it.
- **Search** — typed filter on `to`, `occurredAt`
- **Notes** — This is what makes "der nächste Kontoauszug hakt das Todo automatisch ab"
  auditable: the transition names the payment that caused it. The machine's legal
  transitions are enforced by the producer, not the store.

---

## Calendar

### `calendar.event@1` · T1 · calendar

> UI — `kind: 'calendar'` cards: "Frist Krankenkasse · 15.09. · ganztägig",
> "Anmeldegespräch Kita · 28.08. · 10:00–11:00". The `schedule` node's `event(E, Time)`.

- **Blob** forbidden · **References** forbidden
- **Payload** — `eventKey`, `kind` (`appointment | deadline`), `title`, `startsAt`,
  `endsAt?`, `allDay` (bool), `timeZone`, `location?`, `participants[]?`, `note?`,
  `revision`
- **Produced by** — `op:schedule`; inputs `intent` (`intent.declaration@1`), optionally
  `decision` when scheduled over a conflict.
- **Search** — `title`, `location`; typed filters on `startsAt`, `kind`
- **Notes** — Deadline and appointment share one type because they share every field and
  every query; the discriminator is a payload field, not a namespace.

### `calendar.reminder@1` · T2 · calendar

> UI — the `remind` node: "Rechtzeitig vor der Frist meldet sich der Kalender."

- **Blob** forbidden · **References** forbidden
- **Payload** — `eventKey`, `remindAt`, `leadTime` (ISO 8601 duration), `channel`
- **Notes** — The reminder *definition* is content; the reminder *firing* is a scheduler
  concern and never enters the store.

### `calendar.conflict-check@1` · T2 · calendar

> UI — the kita intent: "Terminkonflikt · der Vorschlag kollidiert mit einem bestehenden
> Termin", gate `calendar_conflict`, "10:00–11:00 vs 10:30–11:30 · überschneidet 30 Min".

- **Blob** forbidden · **References** forbidden
- **Payload** — `verdict` (`clear | overlap | adjacent`), `overlapMinutes`,
  `conflicts[]` `{ eventKey, title, startsAt, endsAt }`, `checkedAt`
- **Produced by** — conflict-check run; inputs `proposed` and `existing[]` (each an exact
  `calendar.event@1`).

---

## Documents

### `docs.draft@1` · T1 · docs

> UI — the `draft` node and the `draft_approve` gate: "Entwurf: Antwort an die TK",
> body text, attachment `einkommensnachweis.pdf`.

- **Blob** optional (rendered PDF/DOCX once produced) · **References** `attachment[]`
- **Payload** — `channel` (`email | letter | message`), `recipient` `{ name, address? }`,
  `subject?`, `body`, `language`, `templateKey?`, `draftedAt`
- **Produced by** — `llm:draft`; inputs `request` (`intent.declaration@1`), `context[]`
  (the source artifacts it was written from), `policy`.
- **Evidence** — `/body` → the spans in `ocr.text@1` the draft answers.
- **Search** — `subject`, `body`, `recipient.name`
- **Notes** — A draft is a candidate. Approval does not mutate it; it produces
  `review.decision@1`, and sending produces a request/receipt pair.

### `docs.filing@1` · T2 · docs

> UI — the `archive_confirm` gate: "Ablage in [[Verträge]] / Mobilfunk".

- **Blob** forbidden · **References** forbidden
- **Payload** — `path[]` (ordered folder segments), `entityRefs[]` (artifact ids),
  `rationale?`, `filedAt`, `mode` (`agent | human`)
- **Produced by** — filing run; inputs `subject` (the document) and `decision`.
- **Notes** — Filing is an assertion about placement, not a move. The document does not
  change; the archive tree is a projection over filings.

### `docs.duplicate-check@1` · T2 · docs

> UI — stromabrechnung intent: "drei identische Scans derselben Abrechnung im Archiv";
> the `docs_delete` gate list (`Original` + three struck entries).

- **Blob** forbidden · **References** forbidden
- **Payload** — `verdict` (`duplicate | near-duplicate | distinct`),
  `matchedDimensions[]` (`blob-digest | text | page-image | metadata`),
  `groups[]` `{ keepArtifactId, duplicateArtifactIds[], similarity }`, `checkedAt`
- **Produced by** — duplicate scan; every compared document is a declared input.
- **Notes** — Emits a verdict; it does **not** assert a `duplicate_of` edge and it does
  not delete anything. Deletion needs `review.decision@1` →
  `retention.purge-request@1`.

### `docs.completeness-check@1` · T2 · docs

> UI — steuer intent: "fehlend laut Checkliste: Spendenquittungen,
> Handwerkerrechnungen".

- **Blob** forbidden · **References** forbidden
- **Payload** — `checklistKey`, `checklistVersion`,
  `items[]` `{ key, label, required, satisfiedBy[]? , status: 'present'|'missing'|'partial' }`,
  `missingCount`, `checkedAt`
- **Produced by** — evaluation run; inputs `checklist` (`policy.snapshot@1`) and the
  candidate documents (or one `core.manifest@1`).

### `docs.retrieval-result@1` · T2 · docs

> UI — fitnessstudio intent: "kein FitX-Vertrag im Archiv — 428 Dokumente durchsucht",
> gate `upload_request`.

- **Blob** forbidden · **References** forbidden
- **Payload** — `query`, `scope`, `corpusSize`, `outcome` (`found | not-found | ambiguous`),
  `hits[]` `{ artifactId, score }`, `searchedAt`, `indexGeneration`
- **Notes** — A negative search result is domain-significant here: it is the input the
  gate consumes. `indexGeneration` is recorded because search is a rebuildable
  projection — "428 documents" is only meaningful against a named generation.

### `docs.send-request@1` · T2 · docs

> UI — the `finish` node ("Versendet bzw. abgelegt") and "Kündigung freigegeben und
> versendet".

- **Blob** forbidden · **References** `attachment[]`
- **Payload** — `channel` (`email | postal | portal`), `recipient`, `subject?`, `body`,
  `requestedAt`, `idempotencyKey` (the request artifact id is the canonical one)
- **Produced by** — request-building run; inputs `draft` and `decision`. The decision is
  mandatory: authority is separate from capability.

### `docs.send-receipt@1` · T2 · docs

- **Blob** forbidden · **References** forbidden
- **Payload** — `outcome` (`sent | rejected | failed`), `externalId?`, `sentAt`,
  `providerResponseDigest`, `failureCode?`, `failureMessage?`
- **Notes** — Published by the executor after the effect. A transport retry is operational;
  a durable business rejection is a receipt with `outcome: 'rejected'`.

### `contracts.contract@1` · T2 · docs

> UI — handyvertrag intent ("Vertrag läuft am 31.08. aus · Frist 4 Wochen",
> "Vertragsnummer 4412-88231") and fitnessstudio intent ("[[FitX Vertrag]]").

- **Blob** forbidden · **References** forbidden
- **Payload** — `contractNumber?`, `counterparty`, `category`, `startsAt?`, `endsAt?`,
  `noticePeriod?` (ISO 8601 duration), `renewalTerm?`, `cancellableUntil?`,
  `amountMinor?`, `currency?`, `billingCycle?`
- **Produced by** — extraction run; inputs `document` + `text`.
- **Evidence** — `/noticePeriod`, `/endsAt`, `/contractNumber` → page regions.
- **Search** — `counterparty`, `contractNumber`, `category`; typed filter on
  `cancellableUntil`

---

## Entities and the brain

### `contact.party@1` · T1 · brain

> UI — every `kind: 'person'` card: "Techniker Krankenkasse · Firma · Versicherung",
> "Möbelhaus Nord GmbH · Firma · Lieferant", "Stadtwerke Nord · Firma · Energie",
> "Hausverwaltung Berg · Firma · Vermieter", "Anna Berger · Steuerberatung",
> "StB Kanzlei Meier". Also the `contacts` query source (`shape: 'person'`).

- **Blob** forbidden · **References** forbidden
- **Payload** — `partyKey`, `kind` (`person | organisation`), `displayName`,
  `legalName?`, `aliases[]`, `roles[]` (`supplier | insurer | landlord | advisor |
  authority | customer | other`), `sector?`, `identifiers[]` `{ scheme, value }`
  (VAT id, IBAN holder, customer number), `revision`
- **Produced by** — `op:resolve` in the brain workflow, or extraction from a document.
- **Search** — `displayName`, `legalName`, `aliases`, `identifiers.value`
- **Notes** — Person and organisation share one type: the mock-up's "WER" rail treats them
  identically, and every query is the same. `roles` is per-party, not per-relationship —
  "Lieferant *of this invoice*" is a `brain.assertion@1`.

### `contact.postal-address@1` · T2 · brain

> UI — the `entity_merge` gate compares "Bergstraße 14, Berlin" against "Bergstr. 14,
> Berlin" — the address is what the 88 % similarity is computed on.

- **Blob** forbidden · **References** forbidden
- **Payload** — `street`, `houseNumber?`, `postalCode`, `city`, `region?`,
  `countryCode`, `addressLines[]?`, `normalized` (bool)
- **Produced by** — extraction, then a normalization run (old address in, new address out
  — the spec's `A4 → A5` example verbatim).
- **Evidence** — `/street`, `/postalCode` → OCR spans.

### `brain.note@1` · T1 · brain

> UI — the entity preview at `IntentsPlaceholder.svelte:1294`: YAML front matter
> (`tags: #versicherung #frist`, `erstellt: 2025-08-12 · quelle: inbox`), an H1, prose with
> `[[wikilinks]]`, `## Offen` checkboxes, `## Verknüpft`, and a backlink footer. Also the
> `brain` query source (`shape: 'note'`).

- **Blob** optional (the markdown source, when it exceeds the inline bound) ·
  **References** forbidden
- **Payload** — `noteKey`, `title`, `tags[]`, `sourceChannel`, `authoredAt`,
  `body?` (inline markdown, bounded), `format` (`markdown`), `revision`
- **Produced by** — brain capture/edit run; inputs whatever the note was written from.
- **Search** — `title`, `tags`, body text
- **Notes** — The `[[…]]` links stay as written in the body; the resolved edges are
  `brain.assertion@1`. Backlinks are a projection and are never stored on the note.

### `brain.assertion@1` · T1 · brain

> UI — the `link` node ("Wikilinks in beide Richtungen — das Netz wächst"),
> "12 Artefakte im Brain", "[[Umzug 2025]] · 9 Verknüpfungen", the `## Verknüpft` chip
> row, and "Backlinks · 3".

- **Blob** forbidden · **References** forbidden
- **Payload** — `predicate` (`mentions | belongs-to | issued-by | party-of |
  same-as | supersedes | about`), `subjectArtifactId`, `objectArtifactId`,
  `confidence`, `assertedBy` (`agent | human`), `assertedAt`, `rationale?`
- **Produced by** — `op:link`; both endpoints are declared run inputs.
- **Search** — typed filters on `predicate`, `subjectArtifactId`, `objectArtifactId`
- **Notes** — This is the spec's "assert a semantic relationship" recipe: a typed artifact,
  never a mutable edge table. The knowledge graph the UI draws is a projection over
  accepted assertions. `same-as` in particular must never be inferred from a duplicate
  check — it needs its own assertion, usually after a human decision.

### `brain.duplicate-check@1` · T2 · brain

> UI — umzug intent: "zwei Einträge für denselben Vermieter"; gate `entity_merge`,
> "Ähnlichkeit 88 % — dieselbe Adresse".

- **Blob** forbidden · **References** forbidden
- **Payload** — `verdict` (`duplicate | likely | distinct`), `similarity`,
  `matchedDimensions[]` (`name | address | identifier | contact`),
  `candidates[]` `{ artifactId, displayName, referenceCount }`, `checkedAt`
- **Produced by** — `op:resolve`; every compared entity is an input.

### `brain.merge@1` · T2 · brain

> UI — the merge gate's two sides: "Behalten · [[Hausverwaltung Berg]] · 9 Bezüge" vs
> "Verschmelzen · [[HV Berg GmbH]] · 2 Bezüge".

- **Blob** forbidden · **References** forbidden
- **Payload** — `survivorPartyKey`, `mergedPartyKeys[]`, `mergedAt`,
  `fieldResolutions[]` `{ pointer, chosenFrom }`, `note?`
- **Produced by** — merge run; inputs `check` (`brain.duplicate-check@1`), `decision`
  (`review.decision@1`), and both parties.
- **Notes** — The merged party artifacts are **not** deleted. Redirection is a projection
  reading this artifact.

### `brain.enrichment@1` · T2 · brain

> UI — the `enrich` node: "Muster und Konzepte über den Verknüpfungen"; the running state
> "verknüpft mit [[Versicherungen 2025]]".

- **Blob** forbidden · **References** forbidden
- **Payload** — `enrichmentKind` (`summary | pattern | topic | timeline`), `title`,
  `body`, `subjects[]` (artifact ids), `generatedAt`, `confidence?`
- **Produced by** — `llm:enrich`; the subjects are declared inputs (or one manifest).
- **Notes** — The enricher must ignore its own output type, or the projector loop
  recurses.

---

## Banking, reconciliation, payments

### `banking.statement@1` · T2 · abgleich

> UI — "kontoauszug-07.csv · 38 Transaktionen", "Kontoauszüge Q1–Q4 2023 · 4 Dateien";
> the `statement-trigger` node ("CSV oder Feed — die Transaktionen des Zeitraums").

- **Blob** forbidden · **References** `transaction[]` (ordered)
- **Payload** — `accountRef` (IBAN or opaque account key), `accountLabel?`,
  `periodStart`, `periodEnd`, `openingBalanceMinor?`, `closingBalanceMinor?`,
  `currency`, `transactionCount`, `format` (`csv | mt940 | camt.053 | api`)
- **Produced by** — parse run; input `file` (`core.file@1`), and the transactions are
  published in the same atomic publication as its members.
- **Search** — `accountLabel`; typed filters on `periodStart` / `periodEnd`
- **Notes** — Above a few thousand rows, switch to immutable segment blobs plus a rolling
  manifest instead of one artifact per transaction. 38 rows is comfortably below that.

### `banking.transaction@1` · T2 · abgleich

> UI — the statement preview rows at `IntentsPlaceholder.svelte:1282`:
> "28.07. · Miete August · −1.150,00 € · abgeglichen ✓",
> "25.07. · Möbelhaus Nord GmbH · −249,00 € · Rechnung zugeordnet ✓",
> "24.07. · Gehalt · +3.480,00 €".

- **Blob** forbidden · **References** forbidden
- **Payload** — `bookedAt`, `valueDate?`, `amountMinor` (signed), `currency`,
  `counterpartyName?`, `counterpartyIban?`, `purpose?`, `endToEndId?`,
  `transactionType?` (`standing-order | transfer | direct-debit | card | fee`),
  `bankReference?`
- **Search** — `counterpartyName`, `purpose`; typed filters on `bookedAt`, `amountMinor`
- **Notes** — "abgeglichen ✓" is **not** a field here. Match state lives in
  `reconciliation.match-candidate@1` and is projected onto the row.

### `reconciliation.match-candidate@1` · T2 · abgleich

> UI — the `match_confirm` gate: "Score 91 % — knapp unter der Auto-Schwelle",
> Buchung ("28.07. · −1.150,00 € · Hausverwaltung Berg · Dauerauftrag") against Offener
> Posten ("Miete 08/2025 · 1.150,00 € · fällig 03.08.").

- **Blob** forbidden · **References** forbidden
- **Payload** — `score`, `autoThreshold`, `decisionMode` (`auto | needs-review | rejected`),
  `matchedDimensions[]` (`amount | date | counterparty | reference | recurrence`),
  `transactionArtifactId`, `openItemArtifactId`, `amountDeltaMinor`, `dayDelta`,
  `rationale`
- **Produced by** — `llm:match`; inputs `transaction`, `open-item` (the invoice or todo),
  and `policy` (the threshold snapshot).
- **Search** — typed filters on `score`, `decisionMode`
- **Notes** — Two agents or a rerun may produce competing candidates for the same
  transaction. Keep them all; a selection run or a human decision picks one.

### `reconciliation.report@1` · T2 · abgleich

> UI — the log card "6 Zahlungen zugeordnet, 1 nachgefragt … 31 bekannte Daueraufträge
> übersprungen. 6 offene Rechnungen automatisch abgehakt; „Miete August" wurde von dir
> bestätigt."

- **Blob** forbidden · **References** forbidden
- **Payload** — `periodStart`, `periodEnd`, `transactionsSeen`, `matchedAuto`,
  `matchedAfterReview`, `skippedKnown`, `unmatched`, `openItemsClosed`,
  `notes[]?`, `completedAt`
- **Produced by** — the same `llm:match` run that published the candidates.

### `payments.payment-request@1` · T2 · abgleich

> UI — the `payment_release` gate, layout `ledger`: Betrag 249,00 € · Fällig 30.08. ·
> IBAN DE12 3456 7890 1234 5678 00 · Von Konto Giro · 4.120,55 €.

- **Blob** forbidden · **References** forbidden
- **Payload** — `amountMinor`, `currency`, `creditorName`, `creditorIban`,
  `debtorAccountRef`, `remittanceInformation`, `requestedExecutionDate`,
  `invoiceRef?` (artifact id), `requestedAt`
- **Produced by** — request-building run; inputs `invoice`
  (`bookkeeping.invoice-candidate@1`), `decision` (**mandatory**), `account`
  (`external.capture@1` — the balance that was shown to the human).
- **Notes** — The artifact id **is** the idempotency key handed to the payment executor.
  A crash between the bank call and receipt publication must be recoverable by querying
  the bank for that key.

### `payments.payment-receipt@1` · T2 · abgleich

- **Blob** forbidden · **References** forbidden
- **Payload** — `outcome` (`accepted | executed | rejected | failed`), `externalId?`,
  `executedAt?`, `bookedAmountMinor?`, `currency?`, `providerResponseDigest`,
  `failureCode?`
- **Notes** — A rejection ("closed period", "insufficient funds") is a durable business
  fact and gets a receipt. A timeout that will be retried is operational.

---

## Bookkeeping and tax

### `bookkeeping.invoice-candidate@1` · T2 · abgleich

> UI — "Rechnung · 249,00 € · Möbelhaus Nord GmbH · Zahlungsziel 30.08. · IBAN erkannt ·
> Skonto: keins" and "Möbelhaus Nord GmbH — Rechnung R-2025-8842".

- **Blob** forbidden · **References** forbidden
- **Payload** — `invoiceNumber`, `supplierName`, `supplierPartyRef?`, `issuedAt`,
  `dueAt?`, `serviceperiod?` `{ from, to }`, `currency`, `netMinor`, `taxMinor`,
  `grossMinor`, `taxLines[]` `{ rate, baseMinor, amountMinor }`,
  `paymentDetails?` `{ iban?, bic?, reference? }`,
  `discountTerms?` `{ percent, days }` (Skonto — explicitly `null` when none),
  `lineItems[]` `{ description, quantity?, unitPriceMinor?, amountMinor, taxRate? }`,
  `direction` (`incoming | outgoing`)
- **Produced by** — extraction run; inputs `document`, `text`, optionally
  `supplier-snapshot` (`external.capture@1`).
- **Evidence** — one key per field: `/invoiceNumber`, `/supplierName`, `/dueAt`,
  `/grossMinor`, `/taxLines/0/amountMinor`, `/lineItems/3/amountMinor` → OCR spans or page
  regions. This is the type that proves the evidence model.
- **Search** — `supplierName`, `invoiceNumber`; typed filters on `dueAt`, `grossMinor`
- **Notes** — Named *candidate* deliberately. "Skonto: keins" must be an explicit `null`,
  not an absent field — the canonicalizer omits nothing implicitly, and "we looked and
  there is none" differs from "we did not look".

### `bookkeeping.duplicate-check@1` · T3 · abgleich

- **Payload** — `verdict`, `matchedDimensions[]` (`invoice-number | supplier | amount |
  date | document-hash`), `rationale`, both candidates as inputs.
- **Notes** — Separate from `docs.duplicate-check@1`: same bytes vs. same *invoice* are
  different questions with different dimensions.

### `bookkeeping.posting-proposal@1` · T3 · finance-brain

- **Payload** — `entries[]` `{ debitAccount, creditAccount, amountMinor, taxCode,
  costCenter?, text }`, `chartOfAccounts` (`SKR04`), `fiscalPeriod`, `confidence`,
  `explanation`
- **Notes** — Deferred. The board already carries this work (`0069-invoice-skr04-booking`,
  `0078-vat-vorsteuer-postings`); the namespace is reserved so it lands as a type, not as
  columns on the invoice.

### `bookkeeping.posting-request@1` / `bookkeeping.posting-receipt@1` · T3 · finance-brain

- **Notes** — The exact authorized command for the accounting system, then the external
  journal id, outcome, timestamps and response digest. Reversal is another
  request/receipt pair, never an edit.

### `tax.deduction-classification@1` · T3 · finance-brain

> UI — the `classify_confirm` gate on the steuer intent:
> "handwerker-bad-2023.pdf — wohin gehört das?" with §35a 78 % / Erhaltungsaufwand 19 % /
> Privat 3 %.

- **Payload** — `taxYear`, `category`, `legalBasis?` (`§35a`), `confidence`,
  `alternatives[]` `{ category, confidence }`, `deductibleShare?`, `reason`
- **Notes** — Consumes a `policy.snapshot@1` of the tax ruleset for the year. Registered
  with the tax vertical, not with the first migration.

---

## Retention

### `retention.purge-request@1` · T2 · —

> UI — the `docs_delete` gate: "Unwiderruflich — das Original bleibt erhalten", three
> struck duplicates.

- **Blob** forbidden · **References** forbidden
- **Payload** — `targets[]` `{ artifactId, reason }`, `basis`
  (`duplicate | user-request | retention-policy | legal`), `requestedAt`,
  `cascadeDescendants` (bool), `retainTombstone` (always `true` in v1)
- **Produced by** — a run consuming `check` (`docs.duplicate-check@1`) and `decision`
  (`review.decision@1`).
- **Notes** — The request is an artifact; the purge itself is a privileged operation that
  writes tombstones and appears in the change feed as `artifact/purged`. Lineage stays
  structurally valid — the envelope survives, the payload does not. `cascadeDescendants`
  matters because derived data inherits risk: purging a scan should consider its OCR text.

---

## Platform — skills and views as data

All T3. Registered only when skill installation/upgrade needs to pin exact versions
(board `0116-granular-skill-upgrades`). Listed here so the namespaces are reserved and so
production-run receipts have something concrete to reference.

### `skill.definition@1`

- **Blob** forbidden · **References** `workflow[]`, `view[]`
- **Payload** — `skillId`, `name`, `about`, `tags[]`, `catalogPlan`
  (`avenme | avenceo`), `definitionVersion`

### `skill.workflow@1`

- **Blob** forbidden · **References** `machine?` (0..1)
- **Payload** — `workflowId`, `name`, `about`,
  `nodes[]` `{ id, kind, name, about, type, requires[], provides[], config? }`
- **Notes** — Edges are **not** stored: `workflowEdges()` derives them from
  `provides ∩ requires`. Storing them would be storing a derivable projection inside an
  immutable value.

### `skill.machine@1`

- **Blob** **required** (the `.pl` source, `text/x-prolog`)
- **Payload** — `machineKey`, `dialect`, `contractPredicates[]`
- **Notes** — The same `.pl` gates the sandbox and draws the canvas; hashing it is what
  makes "which machine produced this transition" answerable.

### `ui.view-definition@1`

- **Blob** forbidden · **References** forbidden
- **Payload** — `viewKey`, `name`, `view` (the validated `ViewDef` JSON), `style?`
- **Notes** — Only if views ship independently of the app binary. Otherwise the app
  version in the run receipt is enough.
