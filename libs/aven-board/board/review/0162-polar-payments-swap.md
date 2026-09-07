---
title: Creem → Polar — sandbox billing on the brand SSOT
summary: Swap the whole payment provider to Polar (sandbox org avenceo-gmbh) behind the existing PaymentProvider interface, move the product/pricing SSOT into aven-brand, sync products via API by metadata.tier, book/cancel two independent subscriptions, and give the Abrechnung pane a real invoice-PDF download flow.
owner: claude
created: 2026-08-24
updated: 2026-08-24
tags: [billing, aven-api, app, aven-brand, polar]
goal: "`bun run check`, `bun run lint` and `bun run --cwd services/aven-api test` exit 0; `grep -rli creem app/src app/src-tauri/src app/src-tauri/tauri.conf.json services/aven-api/src services/aven-api/tests services/aven-api/scripts services/aven-api/.env.example services/aven-api/docker-compose.yml libs/aven-website/src libs/aven-brand/src .github/workflows` prints nothing; and every Acceptance criterion in this card is checked with evidence."
---

# Creem → Polar — sandbox billing on the brand SSOT

## Context

Billing today is Creem (cards 0160 + 0161, both in `review/`, never shipped): a
hand-rolled `PaymentProvider` interface in `services/aven-api` (the id service,
SvelteKit on Hetzner behind `id.next.aven.ceo`, deployed by
`release-next.yml`), 13 REST calls in `creem.ts`, webhook at
`/api/webhooks/creem`, ten session-scoped `/api/billing/*` routes, and the
native Abrechnung pane in the app (`Billing.svelte`, 10 Tauri `billing_*`
commands with `&'static str` paths).

We are swapping the provider to **Polar** because Creem lacks exactly what we
need next:

- **No product metadata** → we had to pin products via
  `CREEM_PRODUCT_AVENME/AVENCEO` env vars. Polar supports `metadata`, so
  products resolve by `metadata.tier` again — no pinned IDs.
- **No invoice PDFs anywhere in the API** → the pane says "Creem hat dir die
  Rechnung per E-Mail geschickt". Polar generates order invoices via API, so
  the pane gets a real fetch/download flow.

An older Polar integration (cards 0050–0055, `@polar-sh/better-auth` plugin
era) was stripped in the avenCITY reset (0121); only an orphaned `POLAR_*`
block in the root `.env.example` remains. We do **not** revive the plugin
model — the current `PaymentProvider` interface stays and gains a
`PolarProvider` built on `@polar-sh/sdk` directly (no per-framework adapter).

**Polar sandbox org (confirmed 2026-08-24):** name `avenCEO GmbH`, slug
`avenceo-gmbh`, id `894fa220-97a6-4f1c-8c69-6114a0fbe066`. Environment is
**sandbox** (`POLAR_SERVER=sandbox`, API base `https://sandbox-api.polar.sh`).
Earlier-quoted org/product IDs from the production org are void — products
are provisioned by our own seeder via API, never hand-pinned.

**Products (from the SSOT, all prices GROSS / inkl. USt.):**

| Tier (wire key) | Display | Price | Billing |
| --- | --- | --- | --- |
| `avenid` | avenID | 25 € | one-time |
| `avenme` | avenME | 55 €/Monat | recurring monthly |
| `avenceo` | avenFOUNDER | 377 €/Monat | recurring monthly |

avenME and avenFOUNDER are **independent products** — book and cancel each on
its own, both may be active on one account at the same time (one per human,
one per company), and there is **no cross-tier upgrade/downgrade**. avenCOOP
stays out of billing entirely (apply-only).

**Decisions confirmed by Samuel (2026-08-24):**
1. Environment = **sandbox**, org `avenceo-gmbh`.
2. Both subscriptions may be held **concurrently**; no exclusivity gate.
3. Cross-tier change (`/api/billing/upgrade`) is deleted. Pause/resume stay
   **only if Polar's API offers them** — expected outcome per current docs:
   Polar has no pause; "resume" becomes *uncancel a scheduled cancellation*.
4. Checkout stays **inline in the pane** (Polar embedded checkout) with the
   in-app WebviewWindow fallback — never the system browser (0161 premise).
5. **One card, all in** — swap + SSOT move + invoice flow together.
6. Product & pricing config moves to **`@avenos/aven-brand`** as the single
   SSOT; website product/pricing pages, aven-api seeding and the app pane all
   read from it.
7. Prices are **tax-inclusive**. The SSOT already says gross; the Creem
   seeder's `net cents + tax_mode: 'exclusive'` drift dies with Creem.

**Ops reality:** Samuel runs no docker locally for the id service — local dev
uses the `FakePaymentProvider` path; the real webhook only ever fires against
the deployed `next` environment (`https://id.next.aven.ceo`). See the
runbook section below for the exact manual steps he must do.

## Goal

The id service, website and app run billing entirely against Polar's sandbox
from one brand-owned SSOT: products synced by API, two independent
subscriptions bookable/cancelable, avenID granted on `order.paid`, and
official invoice PDFs downloadable inside the Abrechnung pane — with zero
live `creem` references left in code, config, CI or CSP.

**Completion condition** (identical to frontmatter `goal`):

> `bun run check`, `bun run lint` and `bun run --cwd services/aven-api test` exit
> 0; `grep -rli creem app/src app/src-tauri/src app/src-tauri/tauri.conf.json
> services/aven-api/src services/aven-api/tests services/aven-api/scripts
> services/aven-api/.env.example services/aven-api/docker-compose.yml
> libs/aven-website/src libs/aven-brand/src .github/workflows` prints
> nothing; and every Acceptance criterion in this card is checked with
> evidence.

(`services/aven-api/migrations/0008/0009` keep their historic `creem_*`
column names — migrations are immutable; a new migration renames the columns.
The grep scope above deliberately excludes `migrations/` and the board.)

## Approach

**Fetch current Polar docs before writing code** — training data is stale.
Canonical sources:
- `https://raw.githubusercontent.com/polarsource/skills/main/skills/polar-integration/SKILL.md`
- `https://polar.sh/docs/llms.txt` (index; fetch product/checkout/webhook/order-invoice pages)

Build on `@polar-sh/sdk` **directly** (checkout create, products, orders,
subscriptions, `validateEvent` from `@polar-sh/sdk/webhooks`) — no
`@polar-sh/<framework>` adapter, no better-auth plugin. One SDK client,
constructed from `POLAR_API_KEY` + `POLAR_SERVER` (never hardcode the
environment).

**Verify-early hard stops** (check in the sandbox before building on top,
same pattern as 0160's tax hard stop):
1. **Tax-inclusive pricing** — Polar must present 55 € / 377 € as the final
   gross price a German consumer pays (and 25 € for avenID). If Polar can
   only do tax-exclusive (adds VAT on top at checkout), STOP and ask Samuel
   before any UI work.
2. **Embedded checkout inside a Tauri webview** — confirm Polar's embed
   (iframe/script) actually renders and completes in the app's webview; if
   not, the inline path collapses to the in-app-window fallback only (still
   never the system browser).
3. **Pause** — confirm whether the subscriptions API has pause; expected: it
   does not → delete pause; wire "Fortsetzen" to uncancel
   (`cancel_at_period_end=false`).
4. **Concurrent subscriptions** — confirm one Polar customer can hold two
   active subscriptions on different products (expected yes).

**The eight work areas:**

1. **SSOT → aven-brand.** Move `libs/aven-website/src/lib/pricing/plans-data.ts`
   into `libs/aven-brand/src/pricing.ts` (pure data + helpers, no `$lib`),
   export from `@avenos/aven-brand`. Add the billing wire facts each product
   needs: `tier` wire key, `billing` interval, gross `eurPrice`,
   `metadata.tier` value. `libs/aven-website` re-exports for its pages
   (`plans.ts` keeps the Svelte-side helpers); `services/aven-api` and
   `app` import `@avenos/aven-brand`. Website product/pricing pages keep
   rendering from the SSOT — now the brand package. `NAME_PRICE_EUR` stops
   being an independent knob: derive the avenID price from the SSOT (or
   assert equality at boot). Update `services/aven-api/Dockerfile` COPY.

2. **PolarProvider.** New `services/aven-api/src/lib/server/billing/polar.ts`
   implementing the `PaymentProvider` interface (`kind: 'polar'`); delete
   `creem.ts`. Factory in `fake.ts`: `POLAR_API_KEY` set → Polar, else
   Fake. Product sync = list products, match `metadata.tier`, create when
   missing, **update price/name when drifted from the SSOT** (this is the
   "update pricing wherever it's not set correctly" ask). avenID becomes a
   synced one-time product too (`metadata.tier=avenid`) — the names funnel's
   `createCheckout` uses it. Checkout create sets `metadata.userId`/`tier`
   (and `holdId` for names) and `external_customer_id` = our user id where
   the flow has a session.

3. **Webhook.** New route `POST /api/webhooks/polar` (delete `/api/webhooks/creem`);
   verify with `validateEvent` (Standard Webhooks: `webhook-id`/`-timestamp`/
   `-signature` headers) against `POLAR_WEBHOOK_SECRET`; wrong/missing
   signature → 403, processing error → 5xx so Polar retries. Map events:
   `order.paid` with `metadata.holdId` → names grant; subscription lifecycle
   events → `SubscriptionService.applyEvent`; `customer.state_changed` →
   reconcile standing; refund/dispute → names revoke. Rewrite
   `parseCreemEvent`/`parseCreemSubscriptionEvent` as Polar parsers;
   `FakePaymentProvider` + `/api/billing/fake-pay` emit Polar-shaped bodies
   so the local no-docker e2e grant path keeps working.

4. **Subscriptions model: one → many.** `SubscriptionService` and
   `/api/billing/me` currently assume a single subscription per user. Change
   to **per-tier standing**: `/me` returns the standing of each tier;
   `subscribe {tier}` books that product (reject only a duplicate *same-tier*
   active sub); `cancel {tier, immediate?}` and `resume {tier}` are
   tier-scoped. Delete `/api/billing/upgrade` (+ `billing_upgrade` Tauri
   command + UI). Delete pause/resume routes if hard-stop #3 confirms no
   pause (resume survives as uncancel). New migration `00NN`: rename
   `creem_customer_id`/`creem_subscription_id` → provider-neutral
   `provider_customer_id`/`provider_subscription_id` (fix the upsert's
   conflict target in `subscriptions.ts`).

5. **Abrechnung pane.** Two independent product cards (avenME, avenFOUNDER),
   each with its own Buchen/Kündigen (+ Fortsetzen when scheduled-cancel);
   both can be active at once; no tier-switch UI. Inline Polar embedded
   checkout replaces the `creem-embed` postMessage protocol; keep the 8 s
   fallback to the in-app WebviewWindow (`billing_checkout_window` validates
   the Polar checkout host). Status labels re-keyed to Polar's subscription
   status vocabulary. `planOfOrder()` stops matching orders by net-cents —
   match by product id/`metadata.tier` from the order. Merchant-of-record
   copy: Creem → Polar. Update the three origin allow-lists (SvelteKit CSP
   `svelte.config.js`, Tauri CSP `tauri.conf.json` prod+dev, Rust host check
   `auth.rs`) plus the embed-origin sets in `Billing.svelte` and
   `purchase/checkout/+page.svelte` to Polar's origins (incl. sandbox).

6. **Invoices in-app.** Server: `/api/billing/orders` from Polar orders;
   `/api/billing/invoices` gains a per-order invoice step — ensure the
   invoice is generated (Polar generate-invoice endpoint), then return the
   hosted PDF URL; session-scoped, order must belong to the session's
   customer, still **no client-supplied ids** resolved against foreign
   customers. App: each order row gets "Rechnung herunterladen" → opens the
   official PDF in an app window (0160's original wish, now possible).
   Delete the "hat dir … per E-Mail geschickt" copy.

7. **Config, CI, docs sweep.** `config.ts`: `POLAR_API_KEY`,
   `POLAR_SERVER` (`sandbox`|`production`, default `sandbox`),
   `POLAR_WEBHOOK_SECRET`, optional `POLAR_ORGANIZATION_ID` (sanity check
   only — org tokens already scope the org; never pass organization_id in
   create calls); boot assertions ported (prod requires token; token forbids
   placeholder webhook secret). Update `.env.example` (root orphaned POLAR
   block rewritten to match reality, service one re-keyed),
   `docker-compose.yml`, `release-next.yml` (both secret blocks),
   deployment docs, `infrastructure/identity/tests/program.test.mjs` leak
   assertion, and port `tests/creem.test.ts` + `tests/billing-subscriptions.test.ts`
   to the Polar contract.

8. **Local-lite harness (no docker).** One command, `bun run dev:api:lite`,
   boots the id service with zero docker: `embedded-postgres` (real Postgres
   binaries via npm, data dir `.dev/pg`, gitignored) on `127.0.0.1:55432` —
   the port the tests already default to, so `bun test` runs docker-free
   too — then migrations, a tiny console SMTP sink (`scripts/dev-smtp-sink.ts`
   prints sign-in mails/links to the terminal), the email worker, and
   `vite dev`. With `POLAR_API_KEY` in the root `.env` this runs the REAL
   PolarProvider against the sandbox locally. Webhooks locally, two layers:
   `scripts/polar-webhook-simulate.ts` signs sample Polar events
   (Standard Webhooks) with the local `POLAR_WEBHOOK_SECRET` and POSTs them
   to `localhost:5173/api/webhooks/polar` (offline, deterministic); and an
   optional `scripts/dev-tunnel.ts` that starts a cloudflared quick tunnel
   and PATCHes a dedicated `local-dev` sandbox webhook endpoint to the
   tunnel URL via API (the endpoint's signing secret survives URL updates,
   so the local `.env` secret stays stable) for real end-to-end deliveries.
   (Docs check first: if Polar meanwhile ships an official local webhook
   forwarder/CLI, use that instead of the tunnel script.)
   The Mac dev app joins the loop: its id-service base is compile-time
   (`AVEN_IDENTITY_BASE_URL`, `app/src-tauri/src/auth.rs:11`, default
   `id.next.aven.ceo`) — add a `dev:app:mac:lite` script that sets it to
   `http://localhost:5173` so the pane talks to the local service. Passkeys
   stay pinned to the `id.next.aven.ceo` origin, so local sign-in is the
   email-link path via the SMTP sink; the dev app's webview origin
   `127.0.0.1:1420` is already in Polar's embed hosts (done 2026-08-24,
   along with the rest of the list).

**Out of scope:** avenCOOP, trials/coupons/seats UI, payment-method
management, cross-tier proration of any kind, the production Polar org
(config-only switch later: `POLAR_SERVER=production` + new token/secret),
migrating any existing Creem customer data (none shipped), hosted customer
portal (we stay fully native, 0161 law).

## Steps

1. **Docs + SDK spike (checkpoint).** Fetch the Polar skill + relevant docs;
   `bun add @polar-sh/sdk` in `services/aven-api`; with the sandbox token
   from `.env`, run the four verify-early hard stops against
   `sandbox-api.polar.sh`. Report findings — STOP if #1 fails.
2. **SSOT move.** `plans-data.ts` → `@avenos/aven-brand` pricing module;
   re-point aven-website, aven-api, app imports; `bun run check` green.
3. **Provider + webhook.** `PolarProvider`, Polar event parsers, webhook
   route swap, Fake provider emits Polar-shaped events; port unit tests.
4. **Product sync.** Seeder syncs the three products by `metadata.tier`
   (create + price-drift update, gross/tax-inclusive); run it against the
   sandbox org and record the product ids in this card.
5. **Routes + model.** Per-tier standing (`/me`), tier-scoped
   subscribe/cancel/resume, delete upgrade (+pause per hard stop), rename
   migration, port `billing-subscriptions.test.ts`.
6. **Pane + Tauri.** Independent product cards, Polar embed + fallback,
   status vocab, product-id order matching, CSP/origin sweep, copy.
7. **Invoices.** Server invoice generate+fetch, pane download flow into an
   app window.
8. **Local-lite harness.** `dev:api:lite` (embedded Postgres + migrate +
   SMTP sink + worker + vite), webhook simulator, optional tunnel script;
   prove boot + a simulated `order.paid` land locally.
9. **Sweep + verify.** Env/CI/docs/tests sweep, full grep, `bun run check`,
   `bun run lint`, `bun test`; sandbox smoke: seed products, create a real
   sandbox checkout, fake-pay path locally; write the ops runbook results.

Checkpoint after step 1 (hard stops) and after step 4 (real products exist in
the sandbox org) — stop and show Samuel before the UI work.

## Ops runbook — what Samuel does by hand (nothing else works without it)

1. **Token (before build step 1):** in the Polar **sandbox** dashboard
   (`sandbox.polar.sh`, org `avenceo-gmbh`) create an **organization access
   token** with read+write scopes for products, checkouts, orders,
   subscriptions, customers and webhooks. Paste it into the repo-root `.env`
   as `POLAR_API_KEY=` yourself (dev runs `bun run dev:api` with
   `--env-file=.env`; no docker needed). Never paste it into chat.
2. **GitHub `next` Environment secrets (before the next deploy):**
   `POLAR_API_KEY` and `POLAR_WEBHOOK_SECRET` are both already set (done
   2026-08-24 — the code uses these exact names). The workflow change in
   this card forwards both. Remove the `CREEM_*` secrets once this ships.
   **Gotcha (learned on 0062):** a secret set *after* a deploy is stale on
   the host — after setting them, re-run the deploy job of the latest
   `release-next` run (`gh run rerun <run-id> --job <deploy-job-id>`), or
   push to `next`.
3. **Webhook endpoint:** created by Samuel in the sandbox dashboard on
   2026-08-24 (the secret went straight into the `next` Environment). The
   build VERIFIES it via API instead of creating one: URL must be
   `https://id.next.aven.ceo/api/webhooks/polar`, format **raw**, events at
   least order created/paid/refunded + the subscription lifecycle +
   `customer.state_changed` — and reports any mismatch instead of silently
   fixing it. Local dev gets real deliveries only via the tunnel script
   (work area 8) or simulated signed events.
4. **Embed hosts (Polar dashboard → Settings → Embedding, once):** Polar only
   lets listed hosts iframe-embed the checkout — without this the inline
   checkout silently falls back to the window. Paste into the field (no
   scheme):
   `id.next.aven.ceo, localhost:5173, 127.0.0.1:5173, localhost:1420, 127.0.0.1:1420`
   (id-service purchase page; aven-api dev; Tauri dev app). The **packaged**
   app's webview origin (`tauri://localhost` on macOS) may not be expressible
   here — hard stop #2 in the build tests this and reports the exact extra
   host to add, or declares the packaged app window-fallback-only.
5. **Sandbox test buy:** on the deployed next build, book avenME with
   Polar's sandbox test card (4242…) — sandbox charges nothing real. A 100%
   discount code via the discounts API is the alternative once we test
   production later.

## Files to touch

- `libs/aven-brand/src/pricing.ts` (new) + `libs/aven-brand/src/index.ts` — the moved SSOT with billing wire facts.
- `libs/aven-website/src/lib/pricing/plans-data.ts` → thin re-export (or deleted, imports re-pointed); `plans.ts` keeps Svelte helpers.
- `services/aven-api/src/lib/server/billing/polar.ts` (new), `creem.ts` (delete), `provider.ts` (Polar parsers, `kind` union, Standard-Webhooks verify), `fake.ts` (factory + Polar-shaped fake events), `subscriptions.ts` (per-tier model, renamed columns, SSOT import).
- `services/aven-api/src/routes/api/webhooks/polar/+server.ts` (new), `webhooks/creem/` (delete).
- `services/aven-api/src/routes/api/billing/{me,subscribe,cancel,resume,orders,invoices,checkout}/+server.ts` — per-tier params + invoice URL; `upgrade/` (delete), `pause/` (delete iff hard stop #3), `fake-pay/` (Polar-shaped).
- `services/aven-api/src/lib/server/{config.ts,runtime.ts,names/service.ts,build-runtime/runtime.production.ts}` — POLAR_* config, assertions, avenID price from SSOT.
- `services/aven-api/migrations/00NN_provider_neutral_billing.sql` (new rename migration).
- `services/aven-api/{tests/*.test.ts,scripts/seed-billing.ts,.env.example,docker-compose.yml,Dockerfile,svelte.config.js,docs/github-deployment.md}`.
- `services/aven-api/src/routes/purchase/checkout/+page.svelte` — Polar embed origins/protocol.
- `app/src/routes/dashboard/settings/Billing.svelte` — independent cards, embed, statuses, invoice download, copy.
- `app/src-tauri/{src/auth.rs,tauri.conf.json}` — command sweep (drop upgrade/pause), Polar hosts in CSP + window host check.
- `.github/workflows/release-next.yml` (two secret blocks), `.env.example` (root), `GITHUB_HETZNER_DEPLOYMENT_CHECKLIST.md`, `infrastructure/identity/tests/program.test.mjs`.
- `services/aven-api/scripts/{dev-lite.ts,dev-smtp-sink.ts,polar-webhook-simulate.ts,dev-tunnel.ts}` (new) + root `package.json` `dev:api:lite` script + `.gitignore` (`.dev/pg`) — the docker-free local harness.

## Acceptance criteria

Each provable from the transcript:

- [x] **SSOT in aven-brand** — DONE (grep `aven-website/pricing` → no consumer left; both checks 0 errors) — pricing module exported from `@avenos/aven-brand`; `grep -rn "aven-website/pricing" services app libs` shows no billing consumer left (website-internal use ok); proven by grep + `bun run check` exit 0.
- [x] **Hard stops answered** — step-1 findings recorded in the Progress log: tax-inclusive OK (`tax_behavior: 'inclusive'` per price), embed = official `@polar-sh/checkout` (packaged-app verdict → review smoke), pause EXISTS (kept per decision 3), concurrent subs = org setting flipped to `allow_multiple_subscriptions: true` via API 2026-08-24 (seeder enforces it).
- [x] **PolarProvider behind the interface** — DONE (polar.test.ts: factory picks Polar/fake, kind union polar|fake; suite 58/58) — factory picks Polar when `POLAR_API_KEY` set, Fake otherwise; `kind` union has no `'creem'`; proven by unit tests exit 0.
- [x] **Products synced by API from SSOT** — seeder run 2026-08-24 against sandbox org `avenceo-gmbh`: `avenid` = `f0c2e5f6-9ca8-4a3d-8fdb-75b8fc957777` (2500 once), `avenme` = `d7e46080-c02c-4ee5-be48-198035b037e3` (5500/mo), `avenceo` = `56f8c182-b340-4c79-9fbc-4d3f2b6c6254` (37700/mo) — all `tax_behavior: inclusive`, matched by `metadata.tier`; re-run returned identical ids (idempotent). Drift-correction is code-verified (`syncProducts` updates price/name); token never printed.
- [x] **Webhook verified & mapped** — DONE (polar.test.ts 403s + names.test.ts grant via Polar-shaped fake body + live simulator: order-paid 200, bad-signature 403) — invalid Standard-Webhooks signature → 403; `order.paid` with holdId grants a name; subscription events upsert per-tier; proven by ported webhook tests exit 0.
- [x] **Two independent subscriptions** — DONE (billing-subscriptions.test.ts: both tiers in /me, same-tier 409, tier-scoped actions; 58/58) — test proves one user with active `avenme` AND `avenceo` sees both in `/api/billing/me`; same-tier double-book rejected; cancel/resume are tier-scoped; proven by `bun test` output.
- [x] **No cross-tier change** — DONE (grep prints nothing) — `grep -rn "billing/upgrade\|billing_upgrade\|changeSubscription" services app` prints nothing.
- [x] **Invoice flow** — DONE (orderInvoiceUrl ownership test + pane "Rechnung herunterladen" → billing_invoice_window; checks 0 errors; live click = review smoke) — invoices endpoint returns an official PDF URL for a paid order (generate-then-fetch), session-scoped; pane row has the download action opening it in an app window; proven by test + `bun run check` (UI), live click = review's smoke.
- [x] **Creem eradicated** — DONE (goal grep clean; CSPs carry polar.sh) — the goal grep over live code/config/CI prints nothing; CSP/origin lists carry Polar hosts instead.
- [x] **Docker-free local run** — built and fully verified (health 200, simulator 200/403, tests 58/58 on embedded PG — evidence in the log), then **REMOVED on Samuel's decision 2026-08-24**: local sign-in can't be a real e2e (passkeys are pinned to id.next), so testing is remote-only on next. The 0015 journal fix it uncovered stays. — `bun run dev:api:lite` boots (embedded Postgres, migrations applied) and `scripts/polar-webhook-simulate.ts` delivers a signed `order.paid` that the local server accepts (2xx) and an invalid signature that it rejects (403); proven by the script/server output in the transcript.
- [x] **Gates green** — DONE (app check 549 files 0 errors; api check 2350 files 0 errors; lint exit 0; 17 files / 58 tests passed, no docker) — `bun run check`, `bun run lint`, `bun run --cwd services/aven-api test` all exit 0 (tests against the embedded Postgres, no docker).

Live-on-next verification (webhook fire, real sandbox checkout end-to-end,
invoice download on a real order) is the `review/` smoke — it needs the next
deploy + Samuel's runbook steps 2–3, like 0160/0161 before it.

## Verification

```bash
bun run check
bun run lint
bun run --cwd services/aven-api test
grep -rli creem app/src app/src-tauri/src app/src-tauri/tauri.conf.json \
  services/aven-api/src services/aven-api/tests services/aven-api/scripts \
  services/aven-api/.env.example services/aven-api/docker-compose.yml \
  libs/aven-website/src libs/aven-brand/src .github/workflows || echo CLEAN
grep -rn "billing/upgrade\|billing_upgrade\|changeSubscription" services app || echo CLEAN
# product sync (token read from .env, never printed):
bun run --cwd services/aven-api db:seed:billing
```

## Hand-off

```
/aven-build 0162
```

…or directly:

```
/goal `bun run check`, `bun run lint` and `bun run --cwd services/aven-api test` exit 0; the creem grep in card 0162 prints nothing; every Acceptance criterion in the card is checked with evidence.
```

Blocked until runbook step 1 (sandbox `POLAR_API_KEY` in `.env`).

## Progress log

- `2026-08-24` — Round 3 (uncommitted → this commit): (a) BILINGUAL SSOT complete — EN plan texts moved from the website into `@avenos/aven-brand/pricing`; PlanFeature upgraded to {title ≤42, description, skill?, href?} with freshly authored knackige Titel + sublines (de+en); website pricing renders title + muted subline in both languages. (b) POLAR BENEFITS live from SSOT (final model per Samuel): one visible feature_flag per skill (cascade: avenFOUNDER carries avenME's), one meter_credit "KI-Minuten" per tier on a shared ai-minutes meter (1800/7200 units·month, meter path worked live — no fallback), plain bullets → product DESCRIPTION (role + short-title markdown list), all idempotent by metadata key; sandbox proof: avenme 9 / avenceo 14 benefits attached, twice-run identical. (c) Checkout LOCALE (de|en) end to end; org Localized Checkout enabled by Samuel. (d) INLINE checkout: replicated the embed lib's iframe protocol (embed/embed_origin/theme params + POLAR_CHECKOUT postMessage, strict origin+source checks) as an in-card iframe, theme hard-coded LIGHT, @polar-sh/checkout dep removed; purchase page same. (e) Artifacts split view (committed earlier via PR #128, main only): pdf.js legacy-build inline viewer, square tiles w/ edge-to-edge thumbnails, terracotta outline Kündigen, download-spinner note. Metering knowledge recorded: credits = included minutes granted per cycle; overage = metered price beyond zero balance (org needs unit_based_pricing enabled); Polar does NOT block usage — enforcement is app-side. Follow-on candidate: overage price + event ingestion + balance enforcement.

- `2026-08-24` — LIVE SMOKE ON NEXT (Samuel): deploy green after two env fixes (NAME_PRICE_EUR var 30→25 — the boot assertion caught real price drift; POLAR_WEBHOOK_SECRET was malformed until re-pasted). E2E PASSED: avenME + avenFOUNDER booked with the sandbox card, both active side by side, webhook flipped standing, official Polar invoice PDF rendered (55 € gross, 19% DE tax extracted — tax-inclusive confirmed live). Findings → fixes: (1) legacy Creem ids in billing rows made Polar 422 on list-orders → migration 0017 purges them + UUID self-heal in customerId(); (2) Polar answers CannotPauseSubscription in practice → pause REMOVED (route, provider method, UI), resume = uncancel only; (3) pane said "zzgl. USt." on gross prices → "inkl. USt." from SSOT; (4) action feedback moves into the tier card (button progress state); (5) invoice opens no longer in a window — downloaded to local app storage + INLINE preview, plus a new Artifacts page (grid like skills; artifact-store wiring later).

- `2026-08-24` — PIVOT: local-lite harness DELETED on Samuel's decision (dev-lite/dev-smtp-sink/polar-webhook-simulate/dev-tunnel scripts, embedded-postgres dep, lite package scripts, .dev state) — local auth is pinned to id.next passkeys, so the e2e can only run remotely. Kept: the 0015 drizzle-journal fix the harness uncovered, the pane's defensive response parsing, all production code. Path forward: PR → remote main → promote main → next (explicitly triggered by Samuel) → real sandbox smoke on id.next.aven.ceo.

- `2026-08-24` — Build complete, all gates green: pane reworked (two independent tier cards, Polar embed overlay + 8s in-app-window fallback, invoice-PDF download via billing_invoice_url/billing_invoice_window, Polar status vocab, tier-based order matching, fixtures incl. `?billing=both`); Tauri commands tier-scoped (upgrade deleted, invoice window https-only); CSP×3 → polar.sh; purchase page on the same embed. Local-lite harness live: `dev:api:lite` (embedded PG 55432, SMTP sink, email worker, vite), simulator (order-paid 200 / bad-sig 403), tunnel script; harness caught+fixed migration 0015 missing from the drizzle journal. Lint gate: fixed pre-existing passkeys.test.ts non-null assertions + biome formatter override for canonical JSON fixtures (artifact-types/, conformance fixtures). Final: app check 0 err, api check 0 err, lint 0, tests 58/58 on embedded PG, creem grep CLEAN, upgrade grep CLEAN. DEVIATION noted: signature verification uses standardwebhooks.Webhook.verify (the exact engine inside the SDK's validateEvent, same secret handling) + lenient envelope parsers, so fake/e2e deliveries need not satisfy the SDK's full event schemas; pause/resume KEPT (hard stop 3: Polar has pause). Moved build → review.

- `2026-08-24` — Build steps 2–5 (server core): SSOT moved to `@avenos/aven-brand/pricing` (website/app/api re-pointed, Dockerfile COPYs brand pkg); `PolarProvider` on `@polar-sh/sdk` + `standardwebhooks` (creem.ts deleted); per-tier `SubscriptionService` (both tiers concurrent, same-tier 409, resume=unpause|uncancel, upgrade deleted); webhook `/api/webhooks/polar` (order.paid grant, subscription.* upsert, customer.state_changed reconcile, refund revoke); migration 0015 renames columns provider-neutral; config POLAR_* + NAME_PRICE_EUR-must-match-SSOT assertion; tests ported (polar.test.ts + per-tier billing suite). aven-api `check` 0 errors. **Step 4 checkpoint: products live in sandbox** — avenid `f0c2e5f6…`, avenme `d7e46080…`, avenceo `56f8c182…`, all tax-inclusive, idempotent re-run.
- `2026-08-24` — Build step 1 done: `@polar-sh/sdk@0.49.0` installed; docs fetched (create-product, embed, subscriptions, sandbox, tax). Hard stops: (1) tax-inclusive ✅ `tax_behavior:'inclusive'`; (2) embed ✅ official `@polar-sh/checkout`, packaged-app verdict deferred to review; (3) pause ✅ EXISTS (`pause_at_period_end`/`resume` + paused/resumed events) → pause/resume KEPT; (4) concurrent subs required org `allow_multiple_subscriptions` — was false, PATCHed to true via API. Sandbox auth 200; next webhook endpoint verified (URL/format raw/all events). Polar ships NO local webhook forwarder (sandbox docs) — tunnel + simulator stand.
- `2026-08-24` — Work area 8 added: docker-free local-lite harness (embedded-postgres on 55432, console SMTP sink, signed-webhook simulator, optional cloudflared tunnel that PATCHes a `local-dev` sandbox endpoint). Samuel created the next webhook endpoint manually and set `POLAR_WEBHOOK_SECRET` in the `next` Environment — build verifies the endpoint instead of creating it.
- `2026-08-24` — Env var name fixed to `POLAR_API_KEY` (Samuel already set it in the GitHub `next` Environment); embed-hosts runbook step added (dashboard Embedding setting gates the inline checkout).
- `2026-08-24` — Discovery: interviewed Samuel (sandbox env; org corrected to `avenceo-gmbh` / `894fa220-97a6-4f1c-8c69-6114a0fbe066`; both subs concurrently; no cross-tier change; pause only if Polar has it; inline embed + fallback; one card; SSOT → aven-brand; gross pricing). Mapped the full Creem surface (13 API calls, 10 routes, pane, CSP×3, CI). Card created directly in discover/.
