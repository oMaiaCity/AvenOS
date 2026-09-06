# Build and test

Status: authoritative

Use the smallest test level that can disprove the change while iterating. Before a
deployment or merge to a release branch, use the complete gate. A collection of unit
tests is not a substitute for the full-stack proof.

## Fast development checks

From the repository root:

```sh
bun run check
bun run check:identity
bun run check:api
bun run check:checkout
bun run check:customer-platform

bun run test:identity
bun run test:api
bun run test:checkout
bun run test:customer-platform
```

The customer-platform checks include the portable Actor runtime and HTTP-resource
contracts. The HTTP-resource suite starts a loopback origin and proves authenticated
redirect handling, exact response bytes, and ETag revalidation; it does not replace
the full-stack customer-database isolation proof.

The native credential regression suite verifies one refresh for 80 concurrent callers,
session separation, expiry, invalid responses and failed-refresh behavior:

```sh
cargo test --locked --release --manifest-path app/src-tauri/Cargo.toml --lib service_token::tests
```

Run the application unit tests separately:

```sh
(cd app && bun test)
```

Format and lint changed files before committing:

```sh
bun run check:docs
bun run check:secrets
bun audit
cargo install cargo-audit --version 0.22.2 --locked
bun run check:rust-advisories
bun run lint
```

Use `bun run lint:fix` only when you intend to accept its edits.

## Build production artifacts

Build the web services:

```sh
bun run build:identity
bun run build:api
bun run build:checkout
```

Build the platform-neutral frontend and check the native Rust shell:

```sh
bun run --cwd app build
cargo check --locked --manifest-path app/src-tauri/Cargo.toml
```

Signed App Store, Android, and distribution-specific application builds have separate
credentials and guides under `docs/deploy/`; they are not part of the server-platform
deployment.

`platform-release`, running from protected `next`, publishes immutable GHCR digests only
after verification passes. Secret-bearing deployment jobs consume its verified manifest;
they do not rebuild candidate application code. `Platform release gate` is the stable
required promotion check emitted by `platform-ci`, including documentation-only changes.

The Linux full-stack E2E and release publisher also run `bash scripts/scan-container-os.sh`
against their exact built image references. This requires Docker, curl, jq and network
access to the pinned scanner release and its advisory database. To scan an existing
local image directly, pass its name or digest as the final argument. Fixed high/critical
OS findings fail the gate; unresolved upstream findings are reported separately. This
gate does not audit Go libraries embedded in the upstream Caddy binary. Updating the
Alpine packages cannot patch those libraries; they require an updated binary.

`check:secrets` scans working files and reachable Git history with fully redacted output.
Its checksum-pinned scanner first proves that a synthetic registry credential is detected.
The historical baseline contains exact reviewed commit/file/rule fingerprints, not broad
path exclusions. New occurrences still fail. Never add an active credential to the baseline.

The Rust audit checks every supported application, library and service lockfile, excluding
archived code. Artifact Store's locked but unused SQLx MySQL/RSA dependency is exempt only
when Cargo proves it absent from every enabled target/feature graph on that run. Other
vulnerabilities fail. RustSec informational/unmaintained warnings remain visible: Tauri's
Linux GTK3 stack still requires old bindings, including the `glib::VariantStrIter`
unsoundness warning. No local fork or unsupported GTK ABI upgrade conceals that upstream
constraint. The auditor is built from a pinned crates.io release; CI does not share an
executable scanner cache between development and release branches.

## Infrastructure and recovery checks

These tests do not contact Hetzner:

```sh
bun run test:infra
bun run test:bootstrap
bun run test:deploy
bun run test:proxy-boundary
bun run test:recovery
```

- `test:infra` evaluates the Pulumi program, security-sensitive cloud-init output, and
  exact-name adoption of existing platform DNS records after a partial deployment.
- `test:bootstrap` proves bucket-policy isolation, namespaced GitHub configuration,
  all-event Polar webhook and product-manifest reconciliation, live-model catalog
  conversion, mode-`0600` recovery output, signed exact-name bucket creation, idempotent
  resume, bounded S3, provider-import, and state-backend visibility retries, atomic adoption
  of both pre-created buckets, complete-checkpoint migration resume without a repeated
  provider update, replacement of an orphaned salt-only Pulumi stack file without
  removing operator settings, and exact-bucket teardown planning across every partial
  checkpoint state without contacting a provider.
- `test:deploy` validates shell scripts, production Compose files, Caddy
  configuration, dependency order, non-root images, and secret-safe build contexts.
- `test:proxy-boundary` runs the production checkout Caddy block against a loopback
  fixture on Linux, proves distinct transport clients survive forwarding, rejects
  caller-selected forwarding identity, and checks the production Svelte one-hop settings.
  It does not simulate separate users behind the same NAT or a future CDN.
- `test:recovery` creates source databases, takes encrypted backups, restores fresh
  targets, compares exact data and access control lists, and proves bounded provider
  failure, wrong-key, and populated-target rejection.

## Full-stack E2E release gate

On a prepared Linux workstation:

```sh
bun run test:e2e:platform
```

The harness builds an optimized Rust/Tauri application and every service image, starts
fresh databases on dynamic loopback ports, and proves the public journey:

- checkout, email, fake payment, signup, and raw Polar webhook retention;
- first and second passkey enrollment and login;
- native Tauri device authorization and short-lived service-token exchange;
- customer database provisioning and per-schema isolation;
- live membership downgrade/removal with an unchanged identity token, while another
  environment remains independently accessible;
- artifact upload and exact readback;
- native document import on both Device and Server placement, exact source and
  extracted bytes, and canonical stored-graph equivalence for the deterministic text
  fixture;
- synthetic invoice and statement PDF imports in opposite orders on Device and Server,
  automatic match proposals, and a physical confirmation through the existing native
  comparison control, with the accepted decision and its three evidence inputs read
  back from the customer database;
- authenticated LLM chat with durable Intent history, including session-local
  anonymous speaker attribution and a duplex interruption followed by another
  speaker;
- focused Actor runtime conformance against fresh PostgreSQL and the production Rust
  Artifact Store image, including authenticated admission, durable checkpoints,
  a single database-backed executor claim under concurrent recovery, lineage,
  idempotent publication replay, local/server outcome equivalence, and a secret
  continuation that never persists the submitted secret;
- persistent Actor admission through the facade in the native user journey;
- resistance to forged identity, routing, and tenant-grant headers; and
- managed static hosting with verified Git revisions.

The test uses disposable volumes and always tears down the `hosting` profile. Setting
`E2E_SKIP_IMAGE_BUILD=true` is useful while iterating but is not release proof.
The harness overlays production container limits, capability removal, read-only roots,
temporary filesystems, and child-process reaping. Recovery uses a separate drill; the
local payment, inbox and LLM fixtures do not prove availability of external providers.
The voice path uses deterministic silent fixtures through the production semantic
state machine. It proves ordering, interruption, attribution transport, and Intent
persistence without microphone hardware; physical acoustic qualification remains the
separate procedure in
[Voice dependency qualification](../voice-dependency-qualification.md).
The [Actor runtime proof strategy](../actor-runtime-proof-strategy.md) states the exact
claims this rail establishes. The focused document conformance suite additionally
compares browser and headless-runner results for deterministic text, CSV, native-text
PDF and model-backed image goldens. The real-store reconciliation suite also proves
restart without repeated model calls, identical local/remote financial payloads,
candidate lineage, decision replay and scope denial. The native journey has a
180-second budget. Financial document waits fail immediately on terminal failure or
unexpected review-required processing; otherwise they allow 20 seconds per document
and 10 seconds for saving a decision. Failed decodes retain diagnostic context.
Text-document graph waits are bounded to 20 seconds. Financial waits print stage
transitions and retry errors; remote progress comes from the runner's shared status
protocol. There is no longer a per-test override extending the journey to five minutes.

CSV intake has a separate native checkpoint: the test imports a recognized synthetic
CSV on Device and Server, verifies that no transactions or matching candidates exist
from it before a physical click, exercises rejection and acceptance, then verifies the
accepted transaction amounts and dates without accepting any invoice relationship.
These expected document-type review states use their own 10-second bounded waits.
The native test then imports a matching synthetic invoice on each placement and
requires a second physical decision before accepting the exact invoice/booking
relationship. It checks the original CSV row and all three decision evidence inputs.
The same two-gate composition also has a fast in-memory integration test.
Restart tests replay accepted and rejected document decisions without
presenting another gate or treating restoration as a new human click.
The shared detector/runtime tests run with `bun run --cwd libs/aven-document-ingest test`;
the physical-gate unit tests run with `bun test app/tests/csv-document-review.test.ts`.
The [CSV corpus](../../fixtures/golden/bank-csv/README.md) records supported and blocked
formats, source provenance and the distinction between decoding and financial import.

### Use a real document model in the local proof

The document provider is opt-in. Set both `TEST_DOCUMENT_PROVIDER_BASE_URL` (the
OpenAI-compatible `/v1` base, not `/models`) and `TEST_DOCUMENT_PROVIDER_MODEL` to the
exact installed model. `TEST_DOCUMENT_PROVIDER_PROFILE=qwen-tools` selects the
production Qwen tool-call adapter and disables thinking; the default is
`openai-json-schema`. Do not select a profile merely to hide invalid provider output.

With these variables set, `bun deploy/e2e/document-provider.ts` runs the two reviewed
OCR goldens through the production facade translation. It accepts an optional
`TEST_DOCUMENT_PROVIDER_TOKEN`, binds its temporary gateway to loopback with a random
token, limits each provider request to 45 seconds and each test to 120 seconds, stops
at the first failed test, and kills the child process group if the suite exceeds
270 seconds. No external endpoint
is contacted by this test unless configured explicitly.

Two expanded corpora use the same wrapper and provider variables:

```bash
TEST_DOCUMENT_CORPUS=market bun deploy/e2e/document-provider.ts
TEST_DOCUMENT_CORPUS=market TEST_DOCUMENT_CASE=cn-private-receipt bun deploy/e2e/document-provider.ts
bun fixtures/golden/public-documents/fetch.ts
AVEN_PUBLIC_DOCUMENT_DIR="$PWD/fixtures/golden/public-documents/files" TEST_DOCUMENT_CORPUS=public bun deploy/e2e/document-provider.ts
```

The [market corpus](../../fixtures/golden/reconciliation-market/README.md) has 13
single-document tests; its full-suite watchdog is 1,590 seconds (13 bounded tests
plus teardown), not a longer per-document wait. A selected case retains the
270-second suite watchdog. The [public corpus](../../fixtures/golden/public-documents/README.md)
has seven checksum/page-count checks and two live blank-form safety checks. Its
download step contacts only the listed issuer URLs, refuses changed hashes, and
does not submit files to a model. The subsequent opt-in provider command does.
For public decoding without any model calls, set only `AVEN_PUBLIC_DOCUMENT_DIR`
when running the document-ingest suite.

To regenerate the synthetic PDFs, use Python with ReportLab plus installed
DejaVuSans, DejaVuSans-Bold and DroidSansFallbackFull fonts at the paths in the
generator, then run `python3 fixtures/golden/reconciliation-market/build.py`.
Render and inspect every page after regeneration and rerun the decoder tests;
font substitutions can lose Chinese or Latin glyphs without failing PDF generation.

The same base/model/profile variables also make `bun run test:e2e:platform` use that
provider for native PDF invoice/statement processing on both Device and Server.
Chat remains the deterministic fixture provider. This full-stack override currently
uses an unauthenticated endpoint reachable from its containers; the focused wrapper's
token option does not configure native-stack credentials. Live document waits allow
60 seconds, within the native journey's 180-second total budget. CSV detection is
deterministic and never calls the LLM, even in this mode.

Live-provider success proves the tested inputs and adapter, not general OCR accuracy,
provider determinism or recognition of unsupported documents. Keep corpus expected
values independent of the provider response.

These are synthetic correctness fixtures, not a representative validation corpus.
The native invoice and statement PDFs use a deterministic structured-output model in the
isolated E2E catalog; all decoders, Actors, solver, transports, publication validation,
database and review controls are production implementations. This proves wiring and
invariants, not OCR accuracy, supplier coverage or quarter-level precision/recall.
The optional live native run verifies provider-backed local/remote parity for those
same inputs; expanded provider corpus tests use an in-memory publication gateway.
No automated
settlement or global assignment is claimed. See the
[reconciliation validation boundaries](../invoice-statement-reconciliation.md#current-executable-flow-and-validation-boundaries).

On filesystems that reject native file watches with `EINVAL`, use
`CHOKIDAR_USEPOLLING=true bun run test:e2e:platform`. This changes file watching only;
it does not skip any gate or alter the application under test.

## Polar Sandbox checkout E2E

The required full-stack gate above keeps its signed fake-payment provider. It is the
deterministic checkout proof and does not depend on Polar availability. A separate,
explicitly authorized test exercises Polar's isolated Sandbox, hosted checkout, test
card, signed webhook delivery, and local purchase projection. It expects the
interactive local stack and a Polar webhook listener to be running; it does not start
or remove them.

Prepare a Polar Sandbox organization once:

1. Create a Sandbox organization access token with product, checkout, order,
   customer, subscription, benefit, meter, and webhook access.
2. Create the one-time avenNAME product and retain its Sandbox product ID.
3. Add `localhost:13200` to the organization's checkout Embed Hosts.
4. Install the Polar CLI and authenticate it against the Sandbox organization.

In one terminal, forward real Sandbox webhooks to the local checkout handler:

```sh
polar listen http://localhost:13200/api/webhooks/polar
```

The listener prints a signing secret. In a second terminal, start the local stack with
that secret and the Sandbox-only credentials:

```sh
export POLAR_API_KEY='sandbox-organization-access-token'
export POLAR_SERVER=sandbox
export POLAR_WEBHOOK_SECRET='secret-printed-by-polar-listen'
export AVEN_TIER_NAME='sandbox-aven-name-product-id'
bun run local:up
```

Then run the opt-in test from that same environment:

```sh
POLAR_SANDBOX_E2E=true bun run test:e2e:polar-sandbox
```

The browser creates a unique name hold, follows the Mailpit checkout email, fills
Polar's embedded checkout with the Sandbox `4242 4242 4242 4242` card, and waits for
the success page. It then requires all of the following independent evidence:

- Polar's Checkout API reports `succeeded`;
- exactly one local payment event and processed `order.paid` delivery exist;
- the name and checkout customer share the provisioned identity subject;
- the purchase entitlement outbox reaches `delivered`; and
- the identity setup email opens the new account page.

The test leaves its Sandbox customer and order in Polar for provider-side diagnosis;
the local stack remains disposable through `local:down`. Run this lane manually or
from a secret-equipped scheduled runner with an authenticated webhook tunnel. Do not
add it to the required per-pull-request gate: external availability, Sandbox rate
limits, and hosted checkout changes are deliberately outside the deterministic proof.

## Complete pre-deployment gate

For a clean local release candidate, run:

```sh
bun install --frozen-lockfile
bun run lint
bun run check:docs
bun run check
bun run check:identity
bun run check:api
bun run check:checkout
bun run check:customer-platform
bun run test:identity
bun run test:api
bun run test:checkout
bun run test:customer-platform
(cd app && bun test)
bun run build:identity
bun run build:api
bun run build:checkout
bun run test:infra
bun run test:bootstrap
bun run test:deploy
bun run test:recovery
bun run test:e2e:platform
```

`platform-ci` and `platform-deploy` repeat the release-critical checks on Linux. A
deployment cannot publish images until its verification job passes.

## CI scheduling and caches

Pull-request checks cancel an older run when a newer commit arrives on the same pull
request. Deployment, infrastructure, and operations mutations keep their target-scoped,
non-cancelling locks. The Voice workflow also uses dependency-aware paths on `main`, so an
unrelated merge does not rebuild the native audio stack.

Platform, deployment verification, Actor, Voice, and Android jobs cache compiler or build
download state keyed by their lockfiles, toolchain, operating system, target, and profile.
Caches only accelerate the normal locked build: no compiled release artifact replaces a
build or verification step, and a cache miss runs the same assertions.

## Failure handling

- Read the first failing component, not the final aggregate exit code.
- On an E2E failure, the harness prints Compose state and the last 200 log lines before
  cleanup.
- Do not call a result flaky without identifying and recording the nondeterministic
  dependency.
- Re-run the complete gate after changing shared contracts, migrations, deployment
  sources, authentication, authorization, or recovery behavior.
