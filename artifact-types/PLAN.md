# Plan — put the UI on a mocked artifact store

**Goal.** The Tauri app renders the same screens it renders today, but every value on
them comes from a mocked artifact store holding real artifacts of the 52 types in
`CATALOG.md` — published through the same API a Postgres-backed store will expose later.
When this is done, `const INTENTS: MockIntent[] = [...]` is gone, `sources.mock.ts` is
gone, and the UI is a set of projections over `publish` / `get` / `search` / `lineage` /
`feed`.

**Done when** — provable from command output:

```bash
bun test libs/aven-artifacts/tests   # kernel + fixture + projection tests pass
bun test app/tests                   # existing app tests still pass
bun run check                        # svelte-check clean
bunx biome check .                   # lint clean
rg -n "MockIntent|MockArtifact|SEEDS|registerMockSources" app/src   # no matches
bun -e '…coverage script…'           # every registry type has ≥1 seeded artifact
```

The last one is the real metric: **all 52 types instantiated, all 9 gates, all 6 skills**.

---

## 1. Why this shape

The mock-up already has the right *shape* and the wrong *substrate*. Look at what
`IntentsPlaceholder.svelte` actually contains: a per-intent `log[]`, an `artifacts[]`
rail, a `skills[]` instance overlay, and a `hitl` gate. Those are, in order: production
runs, published artifacts, run progress, and a proposal awaiting a decision. The file is
a hand-written projection of an artifact store that does not exist yet.

So the work is not "add a store next to the mock". It is: **build the store, seed it so
it produces the identical screen, then delete the hand-written projection.** Every slice
below is shaped so the screen never regresses — at each step the UI looks the same and
one more layer underneath it is real.

Two properties to hold onto throughout, because they are what makes this worth doing:

- **The store API is the seam, not the fixture.** Swapping the in-memory implementation
  for HTTP against a real `artifact_store` schema must be a one-line change at the
  singleton. Nothing in `app/src` may import the fixture module.
- **Projections are derived, never stored.** The intent card's status, the archive
  drawer, the backlink counts, the "abgeglichen ✓" badge — all computed at read time
  from artifacts and runs. The moment one of them is written into a payload, the whole
  exercise has failed.

---

## 2. What gets built

### `libs/aven-artifacts` — new workspace package

Follows the `libs/aven-skills` / `libs/aven-ui` convention exactly: private, `type:
module`, `main`/`types` → `./src/index.ts`, `"test": "bun test ./tests"`, added to the
root `workspaces` glob (already covered by `libs/*`) and to `app/package.json`
dependencies as `"@avenos/aven-artifacts": "workspace:*"`.

```
libs/aven-artifacts/
  src/
    kernel/
      types.ts         Artifact, ArtifactRef, ProductionRun, Locator, Commit, Digest
      canonical.ts     canonical JSON + domain-tagged SHA-256 (artifact/run/type-def)
      registry.ts      loads ../../artifact-types/registry.json + types/*.json
      validate.ts      pinned JSON Schema 2020-12 validation, no coercion, no defaults
      store.ts         ArtifactStore interface — THE seam
      memory.ts        InMemoryArtifactStore implements ArtifactStore
    seed/
      builder.ts       PublicationBuilder: local handles, roles, refs, evidence
      scenarios/       one file per mocked intent (krankenkasse.ts, buerostuhl.ts, …)
      index.ts         seedAll(store) → the whole mocked world
    projections/
      intents.ts       intent stream + status + archive
      timeline.ts      the activity log, from runs + commits
      rail.ts          the artifact rail, from lineage
      skills.ts        instance overlay (done[] / current) on a template workflow
      gates.ts         open gates, from proposals without a decision
      search.ts        the query sources
  tests/
    canonical.test.ts  golden vectors: NFC, key order, negative zero, digest domains
    kernel.test.ts     immutability, blob policy, ref acyclicity, atomic publication
    seed.test.ts       coverage: every registry type instantiated
    projections.test.ts each projection reproduces the current screen's values
```

### `ArtifactStore` — the interface every slice codes against

Deliberately the spec's kernel surface and nothing more:

```ts
interface ArtifactStore {
  publish(req: PublicationRequest): Promise<PublicationResult>   // atomic, idempotent
  getArtifact(id: string): Promise<Artifact | null>
  getPayload(id: string): Promise<unknown>
  getBlob(sha256: string): Promise<Uint8Array>
  listReferences(id: string): Promise<ArtifactRef[]>
  listReferrers(id: string): Promise<ArtifactRef[]>
  lineage(id: string, dir: 'ancestors' | 'descendants', opts): Promise<LineageNode[]>
  getRun(id: string): Promise<ProductionRun | null>
  runsForOutput(id: string): Promise<ProductionRun | null>
  evidenceFor(id: string): Promise<Evidence[]>
  search(q: SearchQuery): Promise<SearchHit[]>
  feed(fromCursor: number, limit: number): Promise<Commit[]>
}
```

`InMemoryArtifactStore` implements it over plain Maps plus a commit log. It enforces the
invariants that would otherwise silently rot the fixtures: payload validation against
the registered schema, blob policy, reference acyclicity, one producing run per output,
no mutation after publish, monotonic `commit_seq`.

---

## 3. What replaces what

| Today | After | Derived how |
| --- | --- | --- |
| `INTENTS: MockIntent[]` (`IntentsPlaceholder.svelte:140`) | `projections/intents.ts` | `search({type:'intent.declaration@1'})`, newest commit first |
| `MockIntent.status` | derived | open gate → `waiting`; failed/blocked run → `error`; every requested action has an output → `done`; older than N and done → `archive`; else `working` |
| `MockIntent.log[]` | `projections/timeline.ts` | runs whose inputs or outputs are in the intent's lineage closure, ordered by `commit_seq` |
| `LogEntry.skill` | derived | `run.procedure_key` namespace |
| `LogEntry.card` | derived | the payload of the run's primary output, rendered by type |
| `MockIntent.artifacts[]` | `projections/rail.ts` | `lineage(intentId, 'descendants')` + the roots it came from |
| `MockArtifact.kind` | derived | type key → rail class map (one table, `doc/todo/calendar/person/entity/statement`) |
| `MockIntent.skills[]` (`done[]`, `current`) | `projections/skills.ts` | for each node of the template workflow, does an artifact of the type that node `provides` exist in this intent's closure? yes → done; first no after a yes → current |
| `MockIntent.hitl` + the `for` loop pushing into `hitlQueue` | `projections/gates.ts` | proposals with no `review.decision@1` consuming them; `HeldPreview` built from the proposal's type |
| `sources.mock.ts` `SEEDS` | `projections/search.ts` | one `registerSource` per skill, each `search()`ing its own types |
| `todoActor` sandbox state | store-backed | `todos.task@1` heads + `todos.status-transition@1` folded into the reducer's initial state |

---

## 4. Slices

Each slice is independently shippable and leaves the app running. Sizes are honest:
slices 1–2 are the bulk of the work, 4–7 are mostly deletion.

### Slice 1 — kernel

Build `libs/aven-artifacts` with `types.ts`, `canonical.ts`, `registry.ts`,
`validate.ts`, `store.ts`, `memory.ts`. No UI changes at all.

The canonicalizer is the piece to not improvise: domain tags
(`artifact-store/artifact/v1\0`), sorted keys, preserved array order, rejected duplicate
keys, NFC-required strings, rejected non-finite numbers, deterministic number
serialization. Money is already minor-unit integers everywhere in the catalog precisely
so no digest depends on a float — hold that line when writing fixtures.

**Done when** `bun test libs/aven-artifacts/tests/canonical.test.ts` and `kernel.test.ts`
pass, including: publishing the same payload twice yields the same `artifact_sha256` and
two different artifact ids; a payload violating its schema is rejected before anything
becomes visible; a `blob_policy: 'required'` type without a blob is rejected; a reference
cycle inside one publication is rejected; a second write to a published artifact throws.

### Slice 2 — seed the mocked world

Port the nine intents in `IntentsPlaceholder.svelte` into `src/seed/scenarios/*.ts`,
one file per intent, written as publication requests through `PublicationBuilder`.

This is where the catalog gets tested for real. `krankenkasse.ts` alone exercises
`core.file@1` → `ocr.text@1` → `core.document-classification@1` →
`inbox.intent-classification@1` → `intent.declaration@1` → `todos.task@1` +
`calendar.event@1` + `docs.draft@1` → the pending `draft_approve` gate, with field
evidence from `/deadline/dueAt` back to a text range in the OCR blob. `kontoauszug.ts`
exercises the banking chain including the automatic `todos.status-transition@1` with
`trigger: 'match'`.

Types no scenario covers yet (T3: postings, tax classes, skills-as-data, ASR) get a
minimal `coverage.ts` fixture — one artifact each — so the registry is fully instantiated
and the schemas are exercised even before a screen shows them.

**Done when** `bun test libs/aven-artifacts/tests/seed.test.ts` passes and the coverage
assertion holds: for every entry in `registry.json`, at least one seeded artifact exists;
all nine gate methods appear; all six skills own at least one run.

### Slice 3 — projections, tested against today's screen

Write `projections/*.ts` and test them by asserting they reproduce the values currently
hard-coded in the mock. Keep the current `INTENTS` array temporarily as
`tests/fixtures/expected-screen.ts` and diff against it — that is what makes "the screen
did not regress" a command, not a judgment.

**Done when** `bun test libs/aven-artifacts/tests/projections.test.ts` passes: the nine
projected intents match the expected titles, types, sources, deadlines and statuses; each
log timeline matches step-for-step; each artifact rail matches; each skill overlay's
`done[]`/`current` matches.

### Slice 4 — wire the app, keep the mock

Add the dependency, create `app/src/lib/artifacts/store.svelte.ts`:

```ts
export const artifacts = singleton('aven.artifacts', () => {
  const store = new InMemoryArtifactStore(registry)
  void seedAll(store)          // the ONE line that becomes an HTTP client later
  return store
})
```

Feed it into `IntentsPlaceholder.svelte` behind a flag (`?store=1` or a settings
toggle), so both paths render and can be compared side by side in the running app.

**Done when** the app runs (`bun run dev:app:linux`) with the flag on and the Intents
workspace is visually identical — same nine cards, same order, same gate in the bar.

### Slice 5 — flip and delete

Remove the flag, delete `MockIntent` / `MockArtifact` / `SkillStatus` / `LogEntry`
interfaces and the `INTENTS` array, delete the `hitlQueue` seeding loop and its
`mock-` id filtering, delete `sources.mock.ts` and its call in
`routes/dashboard/+page.svelte`. Register the real sources instead.

`IntentsPlaceholder.svelte` should lose roughly 700 of its 1549 lines and gain none —
the markup stays, the data goes.

**Done when** `rg -n "MockIntent|MockArtifact|SEEDS|registerMockSources" app/src` is
empty, `bun run check` is clean, and the app still renders the nine intents.

### Slice 6 — the live actors publish

The todos actor is already live (its `.pl` machine gates real transitions). Make it
write through: `todo_create` publishes `todos.task@1`, `todo_update` publishes
`todos.status-transition@1`, and the reducer's initial state is folded from the store
instead of held in the sandbox. Same for `chat.utterance@1` on a turn that starts work.

This is where the mocked store stops being a fixture and starts being the app's memory —
and where the "no status field on the task" decision gets its first real test.

**Done when** `bun test app/tests/todo-machine-gate.test.ts` still passes, creating a
todo by voice produces a `todos.task@1` in the feed, and ticking it produces a
`todos.status-transition@1` naming the exact task revision.

### Slice 7 — the gate closes the loop

Wire `confirmHeld` / `rejectHeld` to publish `review.decision@1` through a human-review
run, and let the gate projection re-derive. Approving the TK draft must make the gate
disappear because a decision now consumes the draft — not because a boolean was flipped.

**Done when** confirming a gate in the running app publishes a `review.decision@1`, the
gate leaves the bar, and the log entry for it reappears as history (the mock already
models this: `logEntries` filters the pending entry out and back in).

---

## 5. Ordering constraints

- Slice 1 before everything. The canonicalizer's rules (NFC, no implicit omission,
  explicit nulls) change how fixtures must be written; discovering that in slice 2 means
  rewriting them.
- Slice 3 before slice 4. Projections proven against the expected screen in a test are
  cheap to debug; the same bug found through the UI is not.
- Slice 5 must not start before slice 3 is green, or the expected-screen fixture is gone
  and the regression check with it.
- Slice 6 and 7 are independent of each other and can be done in either order.

## 6. Decisions to settle before slice 2

The five open decisions in `README.md` all become concrete here; three of them block
fixture authoring:

1. **Money** — minor-unit integers, already assumed in every schema. Fixtures will encode
   `249,00 €` as `{ amountMinor: 24900, currency: 'EUR' }`. Confirm.
2. **Spark as authorization scope** — the in-memory store needs an
   `authorization_scope_id` per publication. If spark is it, `seedAll` publishes into
   `me` and `team` scopes and every read is scope-filtered from day one, which is much
   easier than retrofitting it later.
3. **Todo head projection** — `taskKey` + `revision` with a preferred-head pointer held
   by the app. The reducer needs it in slice 6; decide it in slice 2 so fixtures carry
   sensible `taskKey`s.

Decisions 2 (`ocr.text@1` blob policy) and 5 (wikilink resolution) can be settled during
slice 2 without blocking it.

## 7. What this deliberately does NOT do

- No Postgres, no migration, no server. The whole point is that the UI can be finished
  against the interface before the database exists.
- No workflow engine. The skill instance overlay is derived from which artifacts exist,
  not from a running state machine per intent.
- No real search index. `search()` scans the in-memory set and applies the same
  `fullText`/`fields` mapping the registry declares, so the mapping is exercised and the
  real projection can replace it without touching callers.
- No mutable case object. If a screen needs something that is genuinely mutable state
  (queue position, assignee, archive-after date), it goes in a small app-side projection
  store with its own file — never into an artifact payload.
