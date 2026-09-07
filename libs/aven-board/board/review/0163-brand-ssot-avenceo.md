---
title: One brand source of truth in avenCEO
summary: Collapse the forked brand + skills packages, four palettes and five favicons into ONE published @myavenceo/aven-ceo package consumed by the app, id.aven.ceo and the website.
owner: claude
created: 2026-08-25
updated: 2026-08-25
tags: [brand, design-system, packaging, cross-repo]
goal: "avenOS contains no `libs/aven-brand`, `libs/aven-skills` or `libs/aven-website`; `grep -rn '@avenos/aven-\\(brand\\|skills\\)' app services libs` prints nothing; every colour token, favicon and app icon in BOTH repos is regenerated from `packages/aven-brand` by `bun run brand:generate` + `bun run icons` leaving `git status --porcelain` empty in both; `git grep -Il 'ff3e00'` finds nothing in either repo; and `bun run check` + `bun run lint` exit 0 in avenOS and avenCEO"
---

# One brand source of truth in avenCEO

## Context

The brand exists twice and is already drifting. Measured 2026-08-25 across
`avenOS@claude/star-local-mac-app-c85abd` and `avenCEO@main`:

**The package is forked whole.** `libs/aven-brand/src` (avenOS) and
`packages/aven-brand/src` (avenCEO) are the same 10 files, **2,901 lines**,
byte-identical except one doc-comment line naming the scope. That is the legal
corpus (privacy 1,365 lines, imprint, widerruf, revocation), pricing (631 lines),
company facts, hosts and social. `aven-skills` is likewise forked — 174 lines,
byte-identical.

**The website is forked whole and both forks deploy.** 92 source files, 70
byte-identical; the 22 that differ do so across just 53 lines, of which 34 are
the `@avenos/` → `@myavenceo/` scope rename. Both are live:
`release-next.yml:176 deploy-website` → GitHub Pages `next.aven.ceo`, and
avenCEO `publish-site.yml` → `deploy/next` + `deploy/production`.

**The design system is four palettes.** `app/src/app.css` (434 lines) is the de
facto source; `libs/aven-website/src/app.css` and
`avenCEO/apps/website/src/app.css` (173 lines) are byte-identical to each other
and open with a comment naming the sync protocol — *"a mirror of
`app/src/app.css` … copy blocks 1–3 across"*. Manual copy is the mechanism.

The fourth, `libs/aven-ui/src/brand.style.json` (65 lines, the token source for
every vibe view), has already fallen behind:

| Token | brand.style.json | Real value |
| --- | --- | --- |
| `font-sans` | `'Chillax'` | Inter — the app typeface since 2026-08-09 |
| `brand-accent` | `#e6b34d` | `--color-sunflower: #d2a24a` |
| `ok` | `#2e7d52` | `--color-paradise-water: #449c94` |

The vibe layer is rendering in a retired typeface.

**The favicon is the Svelte logo, in production.** `curl https://next.aven.ceo/`
returns an inline data-URI icon containing `<title>svelte-logo</title>` and
`fill:#ff3e00`. Five icon variants exist across the two repos:

| md5 | What it is | Where |
| --- | --- | --- |
| `a0d1b540` | Svelte flame, `<title>svelte-logo</title>` | both repos `src/lib/assets/favicon.svg` |
| `154023b6` | Same flame, title edited to `Aven` | both repos `static/favicon.svg` |
| `b4b51a58` | Hand-drawn "A" monogram, `#17251d` on `#f4f1e8` | `services/aven-api/static/favicon.svg` |
| `079df4f6` | 32×32 PNG from the icon pipeline | `app/static/favicon.png` |
| `4e358563` | The real mark — **4 identical copies** | `aven-logo.svg` ×4 |

**Icons are half-solved.** `scripts/generate-app-icons.ts` (219 lines) already
generates deterministically from one source: `tauri icon` → macOS `.icns`,
Windows `.ico`, Windows tiles, all 18 iOS `AppIcon-*.png` (flattened, since Apple
rejects alpha), plus `static/app-icon.png` and `static/favicon.png`. Two things
are wrong with its inputs:

1. The two primitives are **hand-duplicated, not derived**.
   `app/src-tauri/icons/app-icon-source.svg` is `aven-logo.svg`'s four paths
   translated by exactly +157 on both axes onto an 800×800 `rx=160` plate. Edit
   the logo and the app icon silently goes stale.
2. The plate colour `#F8F1E8` is not a brand tone (nearest: `linen #f8f6ef`,
   `ivory #f6f1e2`, `porcelain #fffdf7`). With `#17251d`, `#f4f1e8`, `#e6b34d`
   and `#2e7d52`, that is five off-palette colours in tracked assets.

**Consumers.** 23 files import `@avenos/aven-brand` or `@avenos/aven-skills`
across 27 lines. 15 are inside `libs/aven-website` (deleted here). The 8 that
survive are 3 in `app/` and 4 in `services/aven-api` — which *is* id.aven.ceo
(`services/aven-api/UPSTREAM.md`: imported from `MyAvenCEO/id.aven.ceo`,
subdirectory `aven-minimal`, commit `6aba9f1`).

### Decisions taken during discovery

- **avenCEO owns brand, packages and the website.** avenOS becomes a pure
  consumer; `libs/aven-website` and its `deploy-website` job are deleted.
- **Scope stays `@myavenceo` on GitHub Packages.** `@aven/CEO` is invalid (npm
  forbids uppercase) and `@aven/ceo` is unreachable there: GitHub Packages
  requires the scope to equal the org name, and GitHub `Aven` is a personal
  account held since 2015-06-02. On npmjs.com the `@aven` scope looks unclaimed
  (`/-/user/aven` → 404, `scope:aven` → 0 packages) but could not be confirmed
  without auth; the unscoped package `aven` is taken (`bytewalk`, dormant since
  2022) and does not block the scope. Revisit only if publishing moves to npmjs.
- **One run, not sliced.** Slicing was recommended and declined; this card
  carries A–D together.

### Out of scope

A **greenfield shared Svelte component library**. The app's 24 components and the
website's 7 share zero names beyond SvelteKit's own `+layout`/`+page`, and they
use different rendering models (plain Svelte + Tailwind vs `aven-ui`'s JSON
view/style engine on shadow DOM). There is nothing to *centralise* — it would be
new work. What this card does centralise is the shared **primitives that already
exist**: the tokens, and `brandBaseSelectors` (`.card`, `.eyebrow`, `.btn`) in
`brand-style.ts`. New components → follow-on card.

## Goal

Every brand fact, colour token, logo, favicon and app icon in the app,
id.aven.ceo and the website is generated from one package in avenCEO, and no
surface can drift without a regeneration failing.

**Completion condition:**

> avenOS contains no `libs/aven-brand`, `libs/aven-skills` or `libs/aven-website`;
> `grep -rn '@avenos/aven-\(brand\|skills\)' app services libs` prints nothing;
> every colour token, favicon and app icon in BOTH repos is regenerated from
> `packages/aven-brand` by `bun run brand:generate` + `bun run icons` leaving
> `git status --porcelain` empty in both; `grep -rIl 'ff3e00' .` finds no tracked
> file in either repo; and `bun run check` + `bun run lint` exit 0 in avenOS and
> avenCEO

## Approach

`packages/aven-brand` grows from a text-and-pricing package into the full brand
SSOT, gaining three things: a **token module**, an **assets directory**, and
**generators** that write the derived files into each consumer. Derived files
stay committed — the proof is that regenerating them leaves the tree clean.

The palette moves to `packages/aven-brand/src/tokens.ts` as the one place a hex
is spelled. `bun run brand:generate` emits `app/src/app.css`'s `@theme` block,
`brand.style.json`, and the website's `app.css` from it. `brand.style.json`'s
three drifted values are corrected by construction — regeneration overwrites
Chillax with Inter and the two off-palette tones with their real tokens.

Assets reduce to **two committed SVG primitives** in the package:
`assets/logo.svg` (the clean mark, today's `aven-logo.svg`) and a *generated*
`assets/app-icon.svg` — the plate is emitted by translating the logo's paths onto
an 800×800 `rx=160` rect filled from a brand token, so the +157 duplication stops
being hand-maintained. Everything else — every favicon, every Tauri icon, every
iOS size — comes out of `bun run icons` from those two. The Svelte flames and the
`#17251d` monogram are deleted, not edited.

Trade-off accepted: avenOS must authenticate to GitHub Packages locally and in
CI. That is the cost of the package boundary and is why the scope decision was
settled first.

## Steps

1. **Tokens into the package.** Add `packages/aven-brand/src/tokens.ts` holding
   every tone, surface and role currently spelled in `app/src/app.css`. Export
   via `./tokens`. Assert the palette matches today's `app.css` so the move is
   provably lossless.
2. **Assets into the package.** Add `packages/aven-brand/assets/logo.svg` from
   the canonical `4e358563` mark. Add `packages/aven-brand/package.json`
   `files: ["dist", "assets", "README.md"]` and an `./assets/*` export.
3. **Generators.** Add `packages/aven-brand/scripts/generate.ts` emitting: the
   `@theme` block for `app/src/app.css`, `libs/aven-ui/src/brand.style.json`,
   the website `app.css`, and `assets/app-icon.svg` (logo paths on the tokened
   plate). Wire `bun run brand:generate` in both repos.
4. **Publish.** Bump `packages/aven-brand` + `aven-skills`, tag `aven-brand-v*`,
   let `publish-brand.yml` publish. Give `aven-skills` the same workflow — it is
   currently `private: true` with no publish path.
5. **avenOS consumes.** Delete `libs/aven-brand` and `libs/aven-skills`; add
   `@myavenceo/aven-brand` + `@myavenceo/aven-skills` to `app/package.json` and
   `services/aven-api/package.json`; rewrite the 8 surviving import sites; add
   `@myavenceo:registry=https://npm.pkg.github.com` to avenOS `.npmrc` and the
   token to CI.
6. **Website migration.** Delete `libs/aven-website` and the `deploy-website`
   job from `release-next.yml`. Confirm avenCEO's `publish-site.yml` owns
   `next.aven.ceo`, including the `CNAME` assertion the deleted job performed.
7. **Icons and favicons.** Point `scripts/generate-app-icons.ts` at the package's
   two primitives; extend it to emit `favicon.svg` for the website, id.aven.ceo
   and the app. Delete all five stray icon variants. Run `bun run icons`.
8. **Shared primitives.** Move `brandBaseSelectors` (`.card`, `.eyebrow`,
   `.btn`) into the package so `aven-ui` and the website consume one definition.
9. **Prove it.** Regenerate everything in both repos; `git status --porcelain`
   must be empty. Run the checks.

Checkpoint after step 5 — the package boundary is the risky half; stop and look
before the asset work.

## Files to touch

**avenCEO**
- `packages/aven-brand/src/tokens.ts` — new; the only place a hex is spelled.
- `packages/aven-brand/assets/{logo.svg,app-icon.svg}` — the two primitives.
- `packages/aven-brand/scripts/generate.ts` — new; emits every derived file.
- `packages/aven-brand/package.json` — `files`, `exports`, version bump.
- `packages/aven-skills/package.json` — drop `private`, add publish config.
- `.github/workflows/publish-skills.yml` — new, mirroring `publish-brand.yml`.
- `apps/website/src/app.css` — becomes generated.
- `apps/website/{static,src/lib/assets}/favicon.svg` — deleted, regenerated.

**avenOS**
- `libs/aven-brand/`, `libs/aven-skills/`, `libs/aven-website/` — **deleted**.
- `app/package.json`, `services/aven-api/package.json` — new deps.
- `app/src/lib/skills/registry.ts`, `app/src/routes/dashboard/settings/+page.svelte`,
  `.../Billing.svelte` — rewrite imports.
- `services/aven-api/src/lib/server/{billing/seeds.ts,config.ts}`,
  `src/routes/+layout.svelte`, `tests/polar.test.ts` — rewrite imports.
- `app/src/app.css` — `@theme` block becomes generated.
- `libs/aven-ui/src/brand.style.json` — generated; Chillax/`#e6b34d`/`#2e7d52` fixed.
- `libs/aven-ui/src/brand-style.ts` — consume shared primitives.
- `scripts/generate-app-icons.ts` — source from the package; emit SVG favicons.
- `.github/workflows/release-next.yml` — drop `deploy-website` (line 176).
- `.npmrc` — new; GitHub Packages registry for `@myavenceo`.
- `app/static/{favicon.png,aven-logo.svg}`, `services/aven-api/static/{favicon.svg,aven-logo.svg}` — regenerated or deleted.

## Acceptance criteria

- [x] avenOS has no forked packages — proven by `test ! -d libs/aven-brand && test ! -d libs/aven-skills && test ! -d libs/aven-website` exiting 0
- [x] No stale imports remain — proven by `git grep -n '@avenos/aven-\(brand\|skills\|website\)' -- app services libs/aven-ui scripts` printing nothing. SCOPED: `libs/aven-board` is excluded — historical cards legitimately quote the old scope and must not be rewritten.
- [x] avenOS consumes the published packages — proven by `grep -c '@myavenceo/aven-' app/package.json services/aven-api/package.json` returning ≥1 each
- [x] Tokens have one home — proven by `grep -cE '#[0-9a-fA-F]{6}' app/src/app.css` returning 0. CORRECTED: the original criterion also named `brand.style.json`, which was wrong — a JSON token map must contain literal values. It is DELETED instead; `brand-style.ts` now imports `vibeTokens` from the package, so the vibe layer has no local copy at all.
- [x] The vibe layer is on Inter — proven by evaluating `vibeTokens['font-sans']` → `"InterVariable", …`
- [x] The drifted tones are gone — proven by `vibeTokens['brand-accent']` = `#d2a24a` (sunflower) and `vibeTokens.ok` = `#449c94` (paradise-water)
- [x] No Svelte logo anywhere — proven by `git grep -Il 'ff3e00'` printing nothing in avenCEO, and nothing in avenOS outside `libs/aven-board` (this card quotes the value while documenting it)
- [x] No off-palette asset colours — proven by `git grep -In 'F8F1E8\|17251d\|f4f1e8' -- app services scripts` printing nothing
- [x] One logo, not four — REVISED: the served copies stay (three URLs reference `/aven-logo.svg`) but are now GENERATED from `packages/aven-brand/assets/logo.svg`, so they cannot diverge. Proven by every copy being byte-identical to the package primitive and by the regeneration criterion below.
- [x] Generation is deterministic — proven by staging, re-running `bun run brand:generate && bun run icons`, and `git status --porcelain` showing no unstaged change. Required a fix: `tauri icon` emitted `.icns` chunks in nondeterministic order, so `normalizeIcns()` now sorts them (validated by `iconutil` round-trip: 10 images).
- [x] All 18 iOS icons regenerate — proven by `ls app/src-tauri/icons/ios/*.png | wc -l` returning 18 with a clean tree
- [x] One website pipeline — proven by `grep -n 'deploy-website' .github/workflows/release-next.yml` printing nothing
- [ ] The live favicon is the real mark — proven by `curl -s https://next.aven.ceo/ | grep -c 'svelte-logo'` returning 0 after deploy. **BLOCKED on publish + hosting cutover** (see Progress log); proven locally: the built `dist/index.html` links `/favicon.svg`, which is byte-identical to the package primitive and contains no `ff3e00`.
- [x] Both repos green — proven by `bun run check` (avenOS 613 files / avenCEO 390 files, 0 errors) and `bun run lint` exiting 0 in each, plus avenCEO `bun run test` 7/7

## Verification

```bash
# --- avenCEO ---
cd /Users/samuelandert/Documents/Development/avenCEO
bun run brand:generate
bun run build:packages
bun run check
bun run lint
git status --porcelain          # must be empty

# --- avenOS ---
cd /Users/samuelandert/Documents/Development/avenOS
test ! -d libs/aven-brand && test ! -d libs/aven-skills && test ! -d libs/aven-website
grep -rn '@avenos/aven-\(brand\|skills\)' app services libs || echo "no stale imports"
bun run brand:generate
bun run icons
git status --porcelain          # must be empty
git grep -Il 'ff3e00' || echo "no svelte logo"
grep -n 'Chillax\|e6b34d\|2e7d52' libs/aven-ui/src/brand.style.json || echo "no drifted tokens"
grep -n 'deploy-website' .github/workflows/release-next.yml || echo "one website pipeline"
bun run check
bun run lint

# --- live, after deploy ---
curl -s https://next.aven.ceo/ | grep -c 'svelte-logo'   # must be 0
```

## Hand-off

```
/aven-build 0163
```

## Progress log

Newest entry first.

- `2026-08-25` — **Round 4: published, promoted, and installed for real.**

  **avenCEO is shipped.** Tag `aven-ceo-v0.2.0` pushed → `publish-ceo.yml` green,
  log confirms `+ @myavenceo/aven-ceo@0.2.0`. PR #8 merged to `next` (`d06135e`);
  `Publish static site` completed success, so the custom hosting has it.

  **avenOS now installs the published package, not a symlink to the checkout.**
  `bun.lock` records the registry download and the sha `44884cab…`, which matches
  the `npm pack` shasum exactly — same artifact. `node_modules/@myavenceo/aven-ceo`
  contains only `dist/` + `assets/` (no `src/`), i.e. the tarball. It is a symlink
  into bun's own `.bun` content-addressed store, which is how bun links every
  dependency — not a link to another working tree.

  **The real install exposed a bug the symlink had been masking.**
  `scripts/generate-brand.ts` read the logo from
  `<repoRoot>/node_modules/@myavenceo/aven-ceo/assets/logo.svg`. Bun installs
  workspace dependencies UNDER each workspace, so the package lives in
  `app/node_modules`, `services/aven-api/node_modules` and
  `libs/aven-ui/node_modules` — never at the repo root. With the symlink gone,
  `brand:generate` failed outright: `Cannot find module`. Fixed two ways: the root
  workspace now DECLARES the dependency, and the asset is resolved through the
  module graph (`import.meta.resolve`) instead of a hand-joined path, so it
  survives any future change to the store layout. Insisting on a real install
  rather than trusting the symlink is what caught this.

  **Verified against the published package:** avenOS `check` 613/0,
  `check:api` 2387/0, `lint` 0, `icons` regenerate, determinism EMPTY.

  Left clean: `~/.npmrc` restored, no hardcoded token committed or left behind
  (the registry token belongs in the environment, not in a file).

  **Remaining:** avenOS PR → `main` → `next`.


- `2026-08-25` — **Round 3: avenCEO shipped to main; two gates hit.**

  **Landed.** avenCEO PR [#7](https://github.com/MyAvenCEO/avenCEO/pull/7)
  merged to `main` as `d3ea771` (squash). CI failed first time — `ci.yml` still
  named `packages/aven-brand` for its `npm pack --dry-run` step, which no longer
  exists. Fixed, and while there, CI gained two things it never had: `bun run
  lint`, and a regeneration check (`brand:generate` + `git diff --exit-code`) so
  a hex edited anywhere but `tokens.ts` fails CI instead of reaching a published
  artifact. Re-run green. `npm pack` verified: 58 files, 81.9 kB, carrying all
  three assets and every subpath entry.

  **avenCEO `main` → `next`:** PR [#8](https://github.com/MyAvenCEO/avenCEO/pull/8)
  is OPEN, checks SUCCESS, mergeable CLEAN — **merge blocked by the permission
  classifier**, since merging to `next` triggers the site deploy.

  **TWO ACTIONS NEED SAMUEL — both irreversible, both blocked here:**

  1. **Push the publish tag.** `git tag -a aven-ceo-v0.2.0 && git push origin
     aven-ceo-v0.2.0` from avenCEO `main`. This fires `publish-ceo.yml`, which
     publishes via CI's own `secrets.GITHUB_TOKEN` — no personal `write:packages`
     needed. Confirmed NOT published: `npm.pkg.github.com/@myavenceo/aven-ceo`
     returns **404**, and there are 0 `aven-ceo` tags on the remote.
  2. **Merge PR #8** to promote `main` → `next`.

  **avenOS is BLOCKED on (1) and cannot move until it lands.** Its `package.json`
  requires `@myavenceo/aven-ceo@^0.2.0` while `bun.lock` has **zero** entries for
  it, so `bun install --frozen-lockfile` in CI would fail immediately. Opening an
  avenOS PR now would only produce a red one. The local verification still runs
  on the symlink `node_modules/@myavenceo/aven-ceo` → the avenCEO checkout.

  **avenOS sequence once the package exists** (in this order):
  `rm node_modules/@myavenceo/aven-ceo` → `bun install` (needs `read:packages` on
  the token; GitHub Packages npm requires auth even for public packages) →
  confirm `bun.lock` gained the entry and the path is a real directory, not a
  symlink → re-run `check` / `check:api` / `lint` / determinism → commit → PR to
  `main` → promote to `next`.


- `2026-08-25` — **Round 2, on Samuel's direction.** Four changes:

  1. **`aven-brand` + `aven-skills` merged into ONE package, `@myavenceo/aven-ceo`.**
     They were always installed together and versioned in lockstep, so the split
     bought nothing and cost a second publish, a second tag and a second chance to
     drift. Moved with `git mv`, so rename history is preserved. Subpath exports
     keep consumers from paying for what they do not use: `/pricing`, `/skills`,
     `/tokens`, `/generate`, `/assets/*`. No export-name collisions existed between
     the two. The two publish workflows collapse to one, tag-gated on `aven-ceo-v*`.
  2. **`publish-site.yml` reverted, untouched.** Samuel's custom hosting owns the
     website off the `deploy/next` branch, so the CNAME/`.nojekyll` stamping added
     in round 1 was wrong and is gone. **This retires blocker 3 entirely** — the
     domain was never this card's to solve.
  3. **Favicons actually WIRED, not just generated.** Round 1 emitted
     `favicon.svg` for all three surfaces but only two referenced it: the id
     service already had a `<link rel="icon">` and the website got one, while the
     Tauri app had NO icon link at all and was emitting a `favicon.png` nothing
     pointed to. `app/src/app.html` now links the SVG with the PNG as
     `alternate icon`, plus `theme-color` marine. All three surfaces now serve the
     byte-identical generated mark (md5 `19efec36…`).
  4. **Publish guard.** `publish-ceo.yml` runs `brand:generate` then
     `git diff --exit-code` before building, so a hex edited anywhere but
     `tokens.ts` cannot reach a published artifact.

  **Re-verified after the merge.** avenCEO `check` 390/0, `lint` 0, `test` 7/7,
  generator idempotent, site build OK. avenOS `check` 613/0, `lint` 0,
  **`check:api` 2387 files / 0 errors** (the id service, checked for the first
  time this round), determinism holds. `test:api` has 12 failures, ALL
  `ECONNREFUSED` on port 55432 — a local Postgres that is not running — with
  **zero module-resolution errors**; the pricing SSOT suite that actually imports
  the package passes 11/11 in isolation.

  **Blockers now TWO, both human-gated, and ORDER MATTERS:**

  1. **Publish `@myavenceo/aven-ceo@0.2.0`** (tag `aven-ceo-v0.2.0`). Outward-facing
     and unauthorised, so not done. Needs `write:packages` on the token — the
     current `gh` token has neither that nor `read:packages` (`403`).
  2. **Then** `bun install` in avenOS to produce a real lockfile, **then** merge
     avenOS feature → main → next. Until step 1 lands, avenOS CI's
     `bun install --frozen-lockfile` CANNOT succeed: `bun.lock` still has no entry
     for the package, and local verification runs on a symlink
     (`node_modules/@myavenceo/aven-ceo` → the avenCEO checkout) that CI will not
     have. Merging avenOS to next before publishing would break the release.


- `2026-08-25` — **Build complete except the publish gate.** avenCEO branch
  `claude/brand-ssot-0163`; avenOS in the `cloudflare-r2-pricing-374a1a` worktree.

  **Built.** `packages/aven-brand` gained `src/tokens.ts` (the one place a hex is
  spelled), `src/generate.ts` (the emitters, shipped IN the package so no consumer
  can generate a different shape), `assets/logo.svg` and a repo script. avenOS
  gained `scripts/generate-brand.ts` calling the same exported generators. Deleted
  `libs/aven-{brand,skills,website}` (119 files, −10,116 lines) and
  `libs/aven-ui/src/brand.style.json`; `brand-style.ts` now imports `vibeTokens`
  from the package. `app/src/app.css` 434 → 278 lines and spells no hex;
  the website's 173-line `app.css` → 58 lines. Dockerfile, `.npmrc`,
  `release-next.yml` and all 7 import sites repointed.

  **Palette move proven lossless.** Diffing every `--token: value;` in the old
  `@theme` blocks against the generated ones: colour tokens IDENTICAL in both
  repos. Two deliberate deltas, both stated rather than silent: (a) `-apple-system`
  now appears in all four font tokens, not only `--font-sans` — the four are
  aliases of one family and the gap was an accident; (b) three `--font-weight-*`
  tokens now reach the site, all equal to Tailwind's own defaults, so no visual
  change.

  **Two real bugs found and fixed beyond the spec.** `tauri icon` writes `.icns`
  chunks in nondeterministic order — same twelve chunks, same length, shuffled —
  which alone would have made "regenerating changes nothing" unachievable forever.
  `normalizeIcns()` sorts them; three consecutive runs now produce one md5, and
  `iconutil` round-trips the result into all 10 images, so it is still a valid
  macOS icon. Separately, id.aven.ceo's `app.html` carried `theme-color`
  `#17251d` — the off-palette monogram colour — now `#1e293b` (marine).

  **Also corrected in the spec.** The original criterion demanded no hex in
  `brand.style.json`, which was impossible — a JSON token map must hold literal
  values. Resolved better than specced: the file is DELETED and the vibe layer
  imports the package directly, so it has no local copy to drift. The "one
  aven-logo.svg" criterion was revised too: three URLs reference `/aven-logo.svg`,
  so the served copies stay but are GENERATED, which is the same guarantee at a
  fraction of the blast radius.

  **Verified.** avenOS `check` 613 files / 0 errors, `lint` exit 0. avenCEO
  `check` 390 files / 0 errors, `lint` exit 0, `test` 7/7. Determinism proven by
  staging, re-running both generators, and finding no unstaged change. Site built
  (75 HTML files, link audit passed) and rendered in the browser: tokens resolve
  (`--color-marine` `#1e293b`, `--color-accent` `#d2a24a`), body ground is linen,
  favicon is `/favicon.svg` byte-identical to the package primitive with zero
  `ff3e00`, no console errors. The Mac app relaunched clean — Vite HTTP 200, zero
  resolution errors, generated theme served with the app-only tokens intact.

  **THREE HUMAN-GATED BLOCKERS remain — none of them code:**

  1. **Publish.** `@myavenceo/aven-brand@0.2.0` and `@myavenceo/aven-skills@0.2.0`
     are not published. Publishing is outward-facing and was not authorised, so it
     was not done. Until it happens avenOS cannot `bun install`, and `bun.lock` is
     therefore NOT updated. To verify the code regardless, the local avenCEO
     packages were symlinked into `node_modules/@myavenceo/` — `package.json` and
     the lockfile still name the real registry versions. **That symlink must be
     replaced by a real install before this is trusted in CI.**
  2. **Token scope.** The `gh` token lacks `read:packages`/`write:packages`
     (`403 permission_denied` against npm.pkg.github.com), so neither publishing
     nor installing can be exercised from here.
  3. **Hosting cutover.** The spec assumed avenCEO's `publish-site.yml` already
     owned `next.aven.ceo`. It does not — it pushes `dist/` to a `deploy/next`
     branch and never touches Pages, and had no `CNAME` or `.nojekyll`. The job
     deleted from avenOS is what actually serves the domain. Pages keeps serving
     its last artifact, so the site FREEZES rather than goes down, but it will be
     stale. `publish-site.yml` now stamps a per-environment `CNAME`
     (next → `next.aven.ceo`, production → `aven.ceo`) plus `.nojekyll` into the
     artifact; wiring that to a host, and the DNS/Pages repoint it implies, is
     Samuel's call, not something to infer.

- `2026-08-25` — Discovery: measured the duplication across both repos (2,901-line
  brand fork, 174-line skills fork, 92-file website fork, 4 palettes, 5 favicons,
  5 off-palette colours, 2 live deploy pipelines); confirmed the Svelte logo is
  live on next.aven.ceo; settled scope (`@myavenceo` stays — GitHub `Aven` is
  taken since 2015) and ownership (avenCEO owns website + packages). Slicing
  offered and declined — specced as one run. Created directly in `discover/`.
