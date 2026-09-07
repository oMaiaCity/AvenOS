# Cutting identity, checkout, public web, and the API facade apart

Status: current architecture decision
Date: 2026-08-28

Product context: [Product model](product-model.md). An Aven is product context, not an
identity subject, passkey credential, checkout customer, or service token.

## Decision

The former `aven-api` application combined four unrelated trust zones. They are
separate deployments from this cut onward:

| Origin | Responsibility | Must never own |
| --- | --- | --- |
| `https://aven.id` | Signup/account provisioning, passkey registration, passkey authentication, browser sessions, native device authorization, and signed service authorization | Checkout, billing, names, artifacts, sites, LLMs, or tenant routing |
| `https://portal.aven.ceo` | Checkout web application, name purchase funnel, payment-provider integration, invoices/subscriptions, purchase email, and commerce records | Credentials, authenticators, sessions, signing keys, or domain-service APIs |
| `https://api.aven.ceo` | Small authenticated facade over server-side services | Browser pages, checkout, user storage, credentials, or business persistence |
| `https://aven.ceo` | Public static website published through avenOS static hosting | Authentication, checkout, mutable APIs, or secrets |

`next` repeats the three platform responsibilities at `portal.next.aven.ceo`,
`api.next.aven.ceo`, and `next.aven.ceo`. It does not create another identity origin
or WebAuthn relying party.

`aven.id` is the only identity origin and WebAuthn relying-party ID. This WIP
deployment intentionally does not carry an old-RP compatibility window.

The deployment boundary is physical as well as logical. `aven.id` has its own
Hetzner host, Caddy ingress, protected volume, PostgreSQL cluster, runtime role,
and migrator role. Production and `next` each have another platform host and
PostgreSQL cluster. No Docker network or database credential crosses between the
three hosts. Both platform environments verify the same public identity issuer.

## Why this cut

The old service had a contradictory security shape. Its public hostname was a
WebAuthn relying party, a checkout application, a billing webhook receiver, a
tenant control plane, and a facade for unrelated runtimes. A vulnerability in
any large business surface therefore sat in the same process and database role
as passkey public keys, sessions, setup links, and signing secrets.

The new boundary minimizes the identity blast radius. The identity process has
one database, one narrow internal signup ingress, three public credential
ceremonies, and public verification keys. No consumer receives database access
or the signing key.

## Identity surface

### Browser and native endpoints

| Endpoint | Purpose | Authentication |
| --- | --- | --- |
| `GET /login` | Start passkey authentication | Public plus proof of work at verification |
| `GET /dashboard` | List credentials and add another passkey | Identity session cookie |
| `/api/auth/passkey/*` | Better Auth WebAuthn registration and authentication ceremonies | Registration requires a session; authentication is public/challenge-bound |
| `/api/auth/device/*` | RFC 8628-style native app authorization | Public code/token exchange; approval requires a session |
| `GET /api/auth/token` | Mint a short-lived service access token | Identity session cookie |
| `GET /api/auth/jwks` | Publish rotating Ed25519 public keys | Public and cacheable by verifiers |
| `GET /.well-known/openid-configuration` | Publish issuer, token, and JWKS locations | Public |
| `GET /api/passkeys` | List the current account's passkeys | Identity session cookie |
| `POST /api/passkeys` | Finalize PRF metadata after Better Auth registration | Identity session cookie plus same-origin check |

Passkey registration logic appears only in `services/identity`. The user
dashboard deliberately exposes “Add another passkey”; registering a second or
later authenticator does not touch a bootstrap link. A successful first
registration invalidates the bootstrap setup link.

### Internal signup endpoint

`POST /internal/v1/accounts` accepts one of two exact constant-time Bearer secrets and a
validated `{ email, source }` body. It idempotently provisions one verified
identity subject and returns a setup URL only while the user has no qualifying
passkey. `portal.aven.ceo` calls it after a verified payment event. No checkout code
inserts an identity row.

Each platform stack generates its own rotatable symmetric credential. The protected
identity deployment reads both during assembly; neither platform deployment can read
identity state or the other platform's state. Compromise of one platform credential
does not grant the other platform's internal identity role. Replace this with mTLS or
a workload-identity token before admitting more callers.

In the three-host deployment, Caddy admits `/internal/*` only from the two platform
hosts' exact Pulumi-managed IPv4/IPv6 addresses. Every other source receives a 404
before the identity process sees the request. The environment-specific constant-time
Bearer check remains mandatory as a second control. This host-to-host application rule
does not restrict SSH administration: port 22 separately allows key-only
`aven-admin` access from dynamic public addresses until the planned VPN exists.

`POST /internal/v1/authorizations/roles` uses the same service boundary for a
bounded batch of subject UUIDs. It returns only each subject's coarse
`user`/`admin` role. Static-site directory generation uses this endpoint rather
than reading a checkout-owned identity projection. A failed identity
lookup fails the directory refresh closed; the static host continues serving
its last-known-good managed release.

### Authorization tokens

`aven.id` signs Ed25519 JWTs with these enforced properties:

- issuer: exactly `https://aven.id`;
- audience: exactly `aven-services`;
- lifetime: five minutes by default and never more than fifteen minutes;
- subject: stable identity UUID;
- session ID, verified email, role, scopes, and authentication method;
- `services:access` and `amr=passkey` only after a passkey exists.

A setup-link session receives `account:bootstrap` and `amr=bootstrap`. It can
finish enrollment at `aven.id`, but the shared verifier rejects it at every
service boundary. This prevents the temporary setup link from becoming a
general bearer credential.

The reusable `@avenos/aven-identity` verifier pins issuer, audience, algorithm,
signature, expiry, required claims, scope, and authentication method. It
fetches only a construction-time fixed JWKS URL (the public issuer by default,
or an explicit private-network URL locally) and therefore cannot be turned
into an SSRF primitive by request data. JWT `iss` validation always remains the
public issuer.

## Authentication versus domain authorization

Identity answers only:

1. Which stable subject authenticated?
2. Was a passkey used/established for this account?
3. Which coarse account role and scopes may be presented?

The facade verifies that answer. The downstream domain service still decides
whether the subject owns a name, tenant, artifact, site, subscription, or other
resource. Putting owned names into the identity token would make revocation
stale and would couple the identity database back to every product database.

The facade replaces the downstream `Authorization` header with a service
credential. It supplies trusted `x-aven-subject`, `x-aven-role`, and
`x-aven-session` projections and carries the original signed JWT in
`x-aven-identity-token`. A downstream may therefore verify the `aven.id` issuer,
audience, signature, expiry, scope, and authentication method independently
while still requiring its own service credential. Caller-provided versions of
all trusted headers, cookies, and authorization headers are stripped before the
facade creates the downstream request. Route prefixes, allowed coarse roles,
target path prefixes, and upstream origins come from deployment configuration,
never from request data.

This coarse identity bridge is not itself an application grant. `api.aven.ceo`
evaluates current product entitlements and mints short-lived, action-, audience-, and
tenant-bound grants for Artifact Store, Intent Service, Actor Runner, and other domain
services. `aven.id` does not acquire product tiers, customer routing, or artifact
policy.

The target grant, customer-database routing, component manifest, and deterministic
provisioning/reconciliation contracts are specified in
[Customer databases as a first-class platform boundary](customer-database-platform.md).

## Checkout surface

The former monolith is renamed `services/checkout` and is deployed at
`portal.aven.ceo`. Identity source files, passkey endpoints, associated-domain
files, and credential tests have been removed from it. A checkout-owned
`checkout_customers` table stores only `{ subject_id, email, timestamps }` as a
commerce projection; it is not an identity cache and cannot authenticate
anyone.

On a completed payment:

1. Checkout validates and idempotently records the provider event.
2. Checkout calls the identity provisioning endpoint with the purchaser email.
3. Identity returns the stable subject and, when needed, a bootstrap URL.
4. Checkout stores the subject on commerce records and uses the returned URL in
   the purchase email.
5. The purchaser opens `aven.id`, creates the first passkey, and may add more
   passkeys later from the identity dashboard.

The old post-payment “purchase token becomes a local auth session” bridge is
removed. It crossed the checkout/identity boundary and made payment data a
session-issuing primitive. The success page now confirms payment and directs
the purchaser to the setup email.

Checkout applies a deny-by-default public-path gate. Only the purchase
pages, name funnel, billing endpoints, payment webhook, and health endpoints
are reachable. Checkout also retains one narrowly scoped `secure-name`
proof-of-work challenge used by its public name-hold form; it is commerce abuse
control, not an authentication ceremony. Passkey, login, artifact, intent, LLM,
site, dashboard, and internal directory paths return 404. Their handlers,
migrations, workers, and deployment compositions have been removed from
checkout rather than left dormant.

## Actor-runner compatibility

The Actor Runtime design was used as a consumer backtest for the cut. Its trust
sequence is preserved:

```text
aven.id token -> api.aven.ceo authentication and fixed routing
              -> actor runner independently verifies signed identity evidence
              -> future ceo.aven product policy and short-lived domain grants
              -> Artifact Store / intent / LLM / actor service
```

The native host has two compile-time origins now:

- `AVEN_IDENTITY_BASE_URL` for passkeys, device authorization, session lookup,
  identity proof-of-work, and token issuance;
- `AVEN_API_BASE_URL` for billing, names, artifacts, intents, LLMs, and every
  other product API.

Actor authorities remain semantic ownership boundaries rather than deployment
hostnames. `id.aven` owns principal, assurance, and portable trust vocabulary;
`ceo.aven` owns product entitlements, artifacts, actor capabilities, and domain
policy. The generic `os.aven` runner calls one external product origin while
the facade projects an environment-scoped public route onto the exact private
`/api/actor-runs` paths of its independently deployable service. Document ingestion is
a `ceo.aven` skill hosted by that runner, not another identity, checkout, or facade
service. Local placement remains inside the app; server placement is an authenticated
remote run with a customer-scoped ledger and Artifact Store route.

The runner is now integrated into the facade and E2E topology. Its JWT audience,
facade header stripping, dedicated downstream bearer, and independent downstream
JWT verification are covered by the split HTTP test. SQL-backed admission, status,
cancellation, and restart recovery are covered separately. The fresh-stack Tauri test
also proves deterministic document execution on both placements and compares their
stored artifact graphs. Wider product-level actor authorization and model-backed
server documents remain separate work.

## Public website

`aven.ceo` is not a SvelteKit identity or checkout process. It is static output
published through the existing static-site-hosting path in avenOS. It may link
to `portal.aven.ceo` and `aven.id`; it does not proxy their cookies or APIs. A
compromise of public site content therefore cannot read host-only identity
cookies.

## Fresh data cut

The new deployment starts empty. No prior database is migration input. Identity creates
only account, session,
credential, setup, device-code, JWKS, and proof-of-work tables.

Checkout creates only commerce, name, abuse-control, queue, and
`checkout_customers` tables. A checkout customer stores the immutable identity
subject plus commerce email; it cannot authenticate anyone. The API creates
only facade-owned site-control tables. No legacy migration is replayed after
the squashed `0000` schemas.

Static content is reconstructed from the authoritative GitHub source/artifact
branches and the managed system-site declaration. No prior hosting volume is imported.

## Passkey/RP cutover

WebAuthn credentials cannot move between RP IDs. Because this is a fresh WIP
deployment, no legacy identity rows or credentials are imported. Web, Rust,
macOS, iOS, and Android code now all pin `aven.id`; the old credential domains
are absent from CSP, native plugin guards, mobile asset statements, and shipped
entitlements. Apple and Android association files at `aven.id` must be live and
validated before distributing a signed build.

## Deployment order

Identity becomes healthy before checkout and the facade. Database roles initialize
before migrations, migrations finish before traffic-serving processes become healthy,
and customer routing remains closed until component reconciliation succeeds. The Actor
Runner is the private `/api/actor-runs` downstream; its SQL run state and recovery are
durable, while document import remains the client actor pipeline.

The authoritative workflow inputs, DNS handoff, verification, and site-publication
steps are in the [deployment handbook](operations/deployment.md).

## Security verification checklist

- A token with the right signature but wrong issuer or audience is rejected.
- A bootstrap session token is rejected by the facade.
- A caller cannot inject trusted identity headers or forward an identity
  cookie to a downstream service.
- A downstream can independently reject a forged, expired, wrong-audience, or
  bootstrap `x-aven-identity-token` even when service authentication succeeds.
- Unknown facade prefixes return 404 without making a network call.
- Registration requires an identity session and allowed Origin.
- Authentication verification consumes proof of work once.
- User verification is required by WebAuthn.
- Setup and provisioning tokens are never logged or stored in plaintext.
- Adding a second passkey leaves the first passkey usable.
- Losing one passkey does not create an email sign-in path; another registered
  passkey or the controlled migration/support process is required.
- JWKS rotation keeps the prior public key through the access-token grace
  window and never publishes private key material.

## Recovery boundary

Code rollback redeploys a previously verified immutable image against a schema it
supports. Data recovery uses only the tested backup/restore process. DNS is never sent
to an old deployment, old databases are never mounted, and there is no dual-write or
compatibility store.

## Local E2E verification record

The 2026-08-28 isolated local run uses separate identity and platform databases,
Mailpit, the real SvelteKit applications, the Bun facade, the managed static
host, and standards-valid virtual WebAuthn authenticators. It verifies:

- account provisioning and setup-link redemption at identity;
- first and second passkey registration on distinct authenticators, both
  visible in the identity dashboard;
- passkey sign-out/sign-in plus device-code claim, approval, and token exchange;
- passkey-qualified JWT acceptance at the facade and raw facade credential
  rejection at checkout;
- exact five-minute JWT lifetime, pinned issuer/audience, Ed25519 JWKS, and CORS;
- the complete fake-payment checkout, both emails, identity provisioning, and
  the checkout `subject_id` projection;
- absence of login, Better Auth, and passkey HTTP routes from checkout;
- identity-backed role resolution for static-site authorization;
- managed-site create/delete authorization, reserved-host restrictions, forged
  identity-header stripping, and internal-directory concealment; and
- a real shallow fetch and serve of the `aven.ceo` `production` plus
  `deploy/production` managed release.

The database-backed checkout suite completes 60/60 tests inside this run; the
browser journey is one complete cross-service test. Unit checks for identity,
the shared verifier, facade, hosting contracts, static host, and Pulumi run
separately before release.

The interactive local stack uses `http://localhost:13100` as both public
identity origin and WebAuthn RP. A developer provisions a disposable account,
creates a real browser passkey, and runs the Rust client with compile-time local
identity/facade origins. Desktop development uses browser device approval
because an ad-hoc binary cannot claim the production associated domain. The
Rust process keeps the revocable session private and exchanges it for a
short-lived service JWT on every facade request.

Every image build excludes `.npmrc` before Docker sees the context. Private
package installation constructs a minimal temporary config inside the same
BuildKit secret-mounted `RUN` step and deletes it there, so credentials do not
enter source, context, cache exports, or image layers.

This record validates authentication/authorization, purchase, managed static
hosting, the local Rust handoff, fresh apex publication, and the actor runner's trust
boundary. The E2E topology includes the runner, but there is still no remote
document-ingest deployment in this cut.
