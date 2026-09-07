---
title: One design system in aven-ceo, one renderer everywhere
summary: Move tokens and component definitions into @myavenceo/aven-ceo as the design system SSOT, teach aven-ui to render into static HTML, and convert all 73 Svelte components across the app, the id service and the website onto it.
owner: claude
created: 2026-08-26
updated: 2026-08-26
tags: [design-system, aven-ui, cross-repo, ui]
goal: "`@myavenceo/aven-ceo` exports the palette AND every shared component definition; `git grep -cE '^\\s*\\.[a-z]' services/aven-api/src/app.css` returns 0 and that file no longer spells a hex; no surface renders a colour outside the palette (`git grep -In '2f5d50\\|2f7a63'` empty in both repos); `--color-linen` is `#faf9f4`; every remaining `.svelte` component under `app/src/lib`, `services/aven-api/src/lib` and `apps/website/src/lib` is a routing/data shell that renders an aven-ui definition rather than hand-written markup; `bun run --cwd apps/website audit:build next` still reports ≥75 HTML files and ≥1335 anchors; and `bun run check` + `bun run lint` exit 0 in avenOS and avenCEO"
---

# One design system in aven-ceo, one renderer everywhere

## Context

Measured 2026-08-26 across `avenOS@main` (`dbe60518`) and `avenCEO@main`.

**There are four component vocabularies and none of them are shared.**

| Surface | Components | Styling | On brand tokens? |
| --- | --- | --- | --- |
| Tauri app | 22 `.svelte` | 777 `class=`, Tailwind on tokens | yes |
| Website | 36 `.svelte` | 540 `class=`, same idioms | yes |
| id service | 15 `.svelte` | **139 bespoke CSS classes**, 979 lines, no Tailwind | **no** |
| aven-ui | 11 primitives | JSON `StyleDef` → shadow DOM | yes |

The app and the website already speak the same dialect — the same idioms recur
in both (`rounded-2xl` 17/24, `border-border` 69/77, `uppercase` 43/67,
`bg-surface-raised` 41/24). They are duplicated, but they agree.

**The id service is the outlier and it has already drifted.** It shares the
brand only through hand-copied hexes, and two of its twelve are in no palette
at all:

```
#2f5d50   the moss green app.css records as REMOVED
#2f7a63   exists nowhere else
```

`app/src/app.css` names moss explicitly as a colour that no longer exists —
"documenting colours that no longer existed (moss #2F5D50, violet #7E6EAD…)".
The id service is still painting with it. Same species as the Chillax drift
that [[0163-brand-ssot-avenceo]] fixed, in the one surface 0163 never reached.

**The architecture already splits where this card needs it to.** `ViewDef`
(HTML-as-JSON) and `StyleDef` (`tokens` / `components` / `selectors`) are pure
DATA; the engines — view, style, validators, security — are 1,071 lines of
logic. `StyleDef.components` exists as a slot for shared component definitions
and is currently unused. aven-ui is also more capable than a first read
suggests: it binds inputs (`element.value`, `$value` payload extraction, cursor
range preservation), dispatches events (`$on` → `UiEventDef`), holds reactive
state (`StateStore` with `patch`/`subscribe`), and runs component logic in
QuickJS compiled to **WASM** (`newQuickJSAsyncWASMModule`).

### The one real blocker, and why it is solvable

```
website     prerender = true,  adapter-static strict   → content must exist at build time
app         prerender = true,  ssr = false             → prerendered shell, SPA
id service  prerender = false, ssr = false             → pure client-rendered SPA
```

aven-ui renders client-side into a **shadow root**. Move the website's content
to JSON views as things stand and its 75 prerendered `index.html` files become
empty shells: the 1,335 anchors `audit:build` counts disappear, and search
engines and no-JS visitors get a blank page.

`ViewDef` is pure data, so it can be rendered to an HTML *string* at build time
as readily as to DOM nodes, and `style-engine.ts` already knows how to turn a
`StyleDef` into CSS — it can emit a real stylesheet instead of `:host` rules.
That is what makes full conversion reachable on all three surfaces.

### Decisions taken during discovery

- **Full conversion, one run.** Slicing was offered and declined. Routing,
  data loading and prerendering stay in SvelteKit; what converts is components
  and their interaction logic. Flagged once: this is the largest card on the
  board and mid-flight discoveries are likely.
- **Background `--color-linen` → `#faf9f4`** (from `#f8f6ef`): +2 on red and
  green, +5 on blue. The rising blue channel is what takes the cream out.
- **avenOS keeps the engines**; aven-ceo owns tokens, component definitions and
  the view/style contract.

### Out of scope

Deleting the retired `@myavenceo/aven-brand` package (Samuel will do it; needs
`delete:packages`). The artifacts UI shipped in 0163 is confirmed good and is
not to be redesigned — it converts like everything else, but its layout and
behaviour stay as they are.

## Goal

One place defines what a card, a button or an eyebrow IS, and all four surfaces
render that same definition — so a component cannot look different in the app,
the id service and the website, and the website stays static while doing it.

**Completion condition:**

> `@myavenceo/aven-ceo` exports the palette AND every shared component
> definition; `git grep -cE '^\s*\.[a-z]' services/aven-api/src/app.css` returns
> 0 and that file no longer spells a hex; no surface renders a colour outside
> the palette (`git grep -In '2f5d50\|2f7a63'` empty in both repos);
> `--color-linen` is `#faf9f4`; every remaining `.svelte` component under
> `app/src/lib`, `services/aven-api/src/lib` and `apps/website/src/lib` is a
> routing/data shell that renders an aven-ui definition rather than hand-written
> markup; `bun run --cwd apps/website audit:build next` still reports ≥75 HTML
> files and ≥1335 anchors; and `bun run check` + `bun run lint` exit 0 in avenOS
> and avenCEO

## Approach

`aven-ceo` gains a `design/` module beside `tokens.ts`: the component
definitions (`card`, `card-sm`, `btn`, `btn-secondary`, `eyebrow`, `chip`,
`panel`, `grid-card` and whatever the audit of the three surfaces shows is
genuinely shared) expressed as `StyleDef.components` entries, plus the
`ViewDef`/`StyleDef` type contract itself so both renderers and every consumer
agree on the shape. The engines stay in avenOS and import the contract.

Two renderers over one definition. The existing DOM renderer keeps driving the
app and the id service. A new **string renderer** walks the same `ViewDef` and
returns HTML, and a **CSS emitter** reuses `style-engine`'s existing
`StyleDef` → CSS logic to write a real stylesheet instead of `:host` rules.
The website prerenders through those, so its output stays static HTML with real
anchors; `audit:build` is the proof, since it already fails when anchor counts
drop.

Conversion is then per-surface and mechanical: a `.svelte` file keeps its
props, data loading and routing, and its markup becomes a definition. The id
service goes first — smallest, most drifted, no prerender constraint — which
also deletes its 979-line stylesheet and both off-palette greens. The app
follows. The website goes last, once the static renderer is proven.

Trade-off accepted: two renderers over one contract is more code than one, and
they can diverge. A shared conformance test — same `ViewDef` through both, DOM
text content vs parsed string output — is what keeps them honest, and is
cheaper than the alternative of giving up either shadow-DOM isolation or a
static site.

## Steps

1. **Audit into a manifest.** Enumerate every recurring idiom across the three
   surfaces into a table of candidate components with usage counts. The set is
   an output of this step, not a guess made now.
2. **`aven-ceo/src/design.ts`** — the component definitions plus the
   `ViewDef`/`StyleDef` contract, exported as `./design`. `tokens.ts` gains the
   new `linen`.
3. **avenOS engines import the contract** instead of declaring it; delete the
   local duplicate types. `brand-style.ts` composes from the package.
4. **String renderer + CSS emitter** in aven-ui, with the conformance test that
   both renderers agree on a fixture set.
5. **Convert the id service** (15 components). Delete `app.css`'s 139 classes
   and both off-palette greens. Checkpoint — stop and look.
6. **Convert the app** (22 components), artifacts UI included but unchanged in
   behaviour.
7. **Convert the website** (36 components) through the static renderer;
   `audit:build` must hold at ≥75 files / ≥1335 anchors.
8. **Background change** — `#faf9f4` — and regenerate every derived file.

Checkpoint after step 5: the id service is the pilot, and if the JSON approach
cannot carry a real app it will show there, cheaply, before the app is touched.

## Files to touch

**avenCEO**
- `packages/aven-ceo/src/design.ts` — new; component definitions + contract.
- `packages/aven-ceo/src/tokens.ts` — `linen` → `#faf9f4`.
- `apps/website/src/lib/**` — 36 components onto shared definitions.

**avenOS**
- `libs/aven-ui/src/engine/types.ts` — re-export the package contract.
- `libs/aven-ui/src/engine/{string-renderer,css-emitter}.ts` — new.
- `libs/aven-ui/src/brand-style.ts` — compose from the package.
- `services/aven-api/src/app.css` — 979 lines → tokens + generated stylesheet.
- `services/aven-api/src/lib/**`, `app/src/lib/**` — the conversions.

## Acceptance criteria

- [ ] aven-ceo exports component definitions — proven by importing `./design` and listing the component names
- [ ] The id service has no bespoke classes — proven by `git grep -cE '^\s*\.[a-z]' services/aven-api/src/app.css` returning 0
- [ ] The id service spells no hex — proven by `git grep -cE '#[0-9a-fA-F]{6}' services/aven-api/src/app.css` returning 0
- [ ] The retired greens are gone — proven by `git grep -In '2f5d50\|2f7a63'` printing nothing in either repo
- [ ] Background changed — proven by `git grep -n 'faf9f4' packages/aven-ceo/src/tokens.ts` and the regenerated themes carrying it
- [ ] Both renderers agree — proven by the conformance test exiting 0
- [ ] The website is still static — proven by `audit:build next` reporting ≥75 HTML files and ≥1335 anchors
- [ ] No hand-written component markup left — proven by a grep for `class=` under the three `lib/` trees returning only shells
- [ ] Generation is deterministic — proven by `brand:generate` + `icons` leaving `git status --porcelain` empty in both repos
- [ ] Both repos green — proven by `bun run check` and `bun run lint` exiting 0 in each, plus `check:api`

## Verification

```bash
# --- avenCEO ---
cd /Users/samuelandert/Documents/Development/avenCEO
bun run brand:generate && bun run build:packages
bun run check && bun run lint && bun run test
bun run --cwd apps/website audit:build next    # >=75 HTML files, >=1335 anchors
git status --porcelain                          # empty

# --- avenOS ---
cd /Users/samuelandert/Documents/Development/avenOS
git grep -cE '^\s*\.[a-z]' services/aven-api/src/app.css   # 0
git grep -cE '#[0-9a-fA-F]{6}' services/aven-api/src/app.css # 0
git grep -In '2f5d50\|2f7a63' || echo "no retired greens"
bun run check && bun run check:api && bun run lint
bun test libs/aven-ui/tests                     # renderer conformance
bun run brand:generate && bun run icons
git status --porcelain                          # empty
```

## Hand-off

```
/aven-build 0164
```

## Progress log

Newest entry first.

- `2026-08-26` — **Step 3: NEAREST_STEP executed. The utility layer is on-scale.**

  982 replacements across 27 files, in two passes.

  | axis | before | after |
  | --- | --- | --- |
  | arbitrary font sizes | 30 distinct | **0** |
  | arbitrary tracking | 14 distinct | **0** |
  | text opacities | 30 distinct | **5** (`/35 /50 /65 /80 /90`) |
  | surface opacities | (mixed in) | **3** |

  **Checked the visual cost before applying, not after.** 31 of the 61 type and
  tracking mappings are EXACT — the value was already on a step. Of the 30 that
  move, most move ≤1px; the largest is 2.4px (`1.65rem` → `fs-amount`) and that
  value appeared exactly once. `22px` once, `7px` never. So the rounding lands
  almost entirely on values nobody chose deliberately. Corrected a stale claim
  in `design.ts` that said the largest move was 1.5px — measured, it is 2.4px.

  **A second axis fell out of the data.** The remaining opacity tail (`/5`,
  `/8`, `/10`, `/15`) was not emphasis at all — those are hairline borders and
  washes on `bg-*`/`border-*`, never something anyone reads. Folding them into
  the ink scale would have rounded a 1px rule up into a legible grey. Added
  `TINT_SCALE` (hairline/soft/firm) and made the codemod role-aware: `text-*`
  snaps to ink, every other utility to tint.

  **Dropped the integer rows from `NEAREST_STEP`.** Opacity is a continuum where
  "nearest" is arithmetic, so `nearestAlphaStep(percent, role)` computes it
  rather than restating the same rule across sixty rows. The table now holds
  only the discrete, unit-bearing values where a lookup earns its place.

  **Verified.** avenOS `check` 612/0, `check:api` 2387/0, `lint` 0. avenCEO
  `check` 390/0, `lint` 0, `test` 7/7. Website rendered in-browser, zero console
  errors. Static output holds at the baseline exactly: **75 HTML files, 1335
  anchors** — the number the card requires.

  **Correction on the record:** Tailwind is NOT gone. `@import "tailwindcss"` is
  still in both apps, it is still a dependency of both, and 1,317 utility class
  sites remain in markup. The scales sit beside it. Tailwind disappears only as
  the endpoint of the component conversion, when there is no utility markup left
  to generate — that is steps 5–7, not done.


- `2026-08-26` — **Steps 1–2 done: the scales exist, and they are the real find.**

  **Step 1, the manifest — the audit was aimed one level too high.** Looking for
  shared COMPONENTS missed the actual problem: there is no scale underneath them.
  Measured across all three surfaces:

  | axis | distinct values | uses |
  | --- | --- | --- |
  | font-size (arbitrary) | **30** | 378 |
  | `text-foreground/N` | **30** | 340 |
  | tracking | **14** | 93 |
  | shadow | 9 | 44 |

  The sizes mix units by eye — `text-[0.68rem]` beside `text-[11px]`, plus
  `13.5px`, `1.02rem`, `2.35rem`. One idiom, the eyebrow, is written fourteen
  ways. A component vocabulary cannot sit on that, so the scales come first and
  the components are expressed in them. (Samuel's call mid-build: utilities have
  to be systematised too — correct, and the numbers above are why.)

  A ramp already existed in `VIBE_SCALE`, used only by the vibe layer: **7 of 26
  observed sizes land on it**. Extended to 12 steps covering the real 7–38px
  range rather than replaced.

  **Step 2 — `packages/aven-ceo/src/design.ts`.** Type (12), tracking (5), ink
  (4), elevation (3), radius (5), space (5); `COMPONENTS` as `StyleDef` entries
  (card, card-sm, eyebrow, eyebrow-accent, btn, btn-secondary, chip, panel,
  meta); and `NEAREST_STEP`, a **61-entry migration table** mapping every
  observed value to its nearest step. Kept as DATA so the conversion is a
  rounding a reviewer can check, not a per-call-site judgement. Largest single
  move: 1.5px. `componentCss()` emits the same definitions as an `@layer
  components` stylesheet for the Tailwind surfaces — one definition, two
  delivery mechanisms.

  **Background** `#f8f6ef` → `#faf9f4`, confirmed live in the browser
  (`rgb(250, 249, 244)`). The app-icon plate follows it, since the plate is
  `linen`.

  **A defect caught in the browser before it could scale.** Emitting the scales
  inside `@theme` looked right and was not: Tailwind v4 tree-shakes `@theme`
  variables it sees no utility for, and **7 of 14 probed tokens came back
  empty** — `--fs-body`, `--ink-quiet`, `--shadow-overlay` among them. A scale
  that only exists once something already uses it is not a scale; the next
  author writing `var(--fs-body)` gets nothing. Moved to `:root`, colours left
  in `@theme` so Tailwind still generates `bg-primary`. Re-probed: **33 of 33
  present**. This would have been invisible in a typecheck and poisonous across
  73 conversions.

  avenCEO green: `check` 390/0, `lint` 0, `build:next` OK.

  Also noted for the audit trail: `rgba(245,158,11,…)` is in use on a surface —
  Tailwind's default amber, in no palette.


- `2026-08-26` — Discovery: audited all four vocabularies (22 app / 36 website /
  15 id-service `.svelte` + 11 aven-ui primitives; 777 / 540 / 136 `class=`
  sites). Found the id service entirely off the brand — 139 bespoke classes,
  979 lines, and two colours in no palette including the moss green app.css
  records as removed. Verified aven-ui is more capable than assumed (input
  binding with cursor preservation, `$on` events, reactive `StateStore`,
  QuickJS-**WASM** logic), which makes full conversion credible; corrected an
  earlier claim that it could not carry interaction. Identified the single real
  blocker — the website is `adapter-static` `strict` with `prerender = true`,
  so shadow-DOM client rendering would empty its 75 files — and the resolution:
  a build-time string renderer plus CSS emitter over the same `ViewDef`.
  Decisions: full conversion in one run (slicing declined), background
  `#f8f6ef` → `#faf9f4`, engines stay in avenOS.
