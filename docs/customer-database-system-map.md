# Customer-database system map

Status: authoritative current-state map

Product terms and ownership-claim boundaries are defined in the
[product model](product-model.md).

This page maps the normative
[customer-database boundary](customer-database-platform.md) onto the code that exists
today. It describes components and trust relationships, not operator procedures. Use
the [operations handbook](operations/README.md) to build, run, deploy, inspect, or
recover the system.

## Deployed topology

```text
clients
├── browser
└── Rust/Tauri application
      │
      ├── aven.id ───────────── identity host
      │   ├── Caddy
      │   ├── identity service
      │   └── identity PostgreSQL
      │
      ├── portal.aven.ceo ───── platform host
      │   ├── checkout
      │   ├── email worker
      │   └── platform-event worker
      │
      ├── api.aven.ceo ──────── platform host
      │   ├── facade
      │   ├── platform provisioner
      │   ├── Artifact Store
      │   ├── Intent Service
      │   └── Actor Runner
      │
      └── aven.ceo ──────────── managed static host on platform host
```

The diagram shows production. The same platform subtree exists at the three `next`
origins. Identity, `next`, and production have separate Hetzner servers, networks,
protected data volumes, PostgreSQL clusters, deployment bundles, SSH identities, and
backup repository prefixes. No database credential crosses between the hosts.

## Public trust boundaries

| Boundary | Trust decision |
| --- | --- |
| `aven.id` | Authenticates the stable subject and signs short-lived `aven-services` tokens |
| `portal.aven.ceo` | Verifies payment-provider messages and records commerce facts; it cannot authenticate a user |
| `api.aven.ceo` | Verifies identity, evaluates current entitlement, selects one customer environment, and issues a bounded downstream tenant grant |
| Domain service | Verifies workload authentication and the tenant grant, then opens only the selected customer's store |
| PostgreSQL | Enforces database and schema isolation even if an application route is wrong |

Caller-supplied authorization, cookies, `x-aven-*` identity projections, tenant grants,
database names, and routing values are stripped or ignored at the facade. Clients never
receive a database URL or internal service credential.

## Central databases

Identity owns its account, passkey, session, device authorization, and signing-key
state in the identity cluster.

The platform cluster contains bounded central databases for:

- checkout, billing, email/platform outboxes, and raw signature-verified Polar
  deliveries; and
- facade authorization, customer directory, component catalog state, provisioning
  operations, reconciliation, and routing generations.

Central databases deliberately do not contain customer artifacts, Intents, Actor runs,
documents, or chat history.

## One database per customer

Each paid customer environment receives one PostgreSQL database named from its stable
environment UUID. It contains:

```text
cust_<environment-id>
├── aven_platform      reconciliation metadata
├── artifact_store     artifacts, blobs, evidence, and production runs
├── aven_intents       intents and contribution history, including chat
└── aven_actor_runs    durable Actor run state
```

`PUBLIC` access is revoked. Database and schema owners are `NOLOGIN`. Each executable
function receives a customer-qualified login that can connect to exactly one customer
database and access only its component schema. Artifact, Intent, and Actor roles cannot
read each other's tables or create arbitrary objects.

## Provisioning and reconciliation

Checkout records a purchase and its platform event in one transaction. The event
worker delivers it idempotently to the facade. The platform records the desired
customer environment, and the provisioner converges it through a compiled component
catalog:

1. create the physical database and `NOLOGIN` owners;
2. revoke ambient access;
3. install append-only component migrations;
4. create or rotate each function role from its dedicated derivation root;
5. probe versions, migration digests, grants, and connectivity independently;
6. publish a new routing generation only after every mandatory component verifies; and
7. retry recognized partial states idempotently after a crash.

A component or environment is not ready because a command returned success. Readiness
requires observing the expected schema version, migration digest, privileges, and
routing generation in the target database.

## Request path

For a customer request:

1. the Rust client presents its identity session only to the identity/token flow;
2. the facade verifies the signed identity token and current customer entitlement;
3. the facade maps the stable environment ID to the current verified routing
   generation;
4. it reads the current membership role and creates a short-lived grant bound to
   environment, audience, role and allowed action; unknown combinations fail closed;
5. the domain service verifies that grant and derives the exact customer login for its
   function; and
6. the bounded pool provider opens or reuses only that customer's connection pool.

Suspension, restore, ownership changes, or credential rotation advance the routing
generation. Old grants and old derived passwords then fail closed.

## Static hosting

The facade owns site bindings and the private directory contract. The static host
fetches an allowlisted Git source branch and matching deployment artifact, verifies the
source revision, activates the release atomically, and persists the last-known-good
managed state. `aven.ceo` uses the same mechanism as customer sites. There is no legacy
host snapshot or cutover composition.

## Backup boundary

The identity backup enumerates the identity cluster. The platform backup enumerates
every central and customer database. Both preserve owners and ACLs, integrity-check
custom-format dumps, encrypt through Restic, and write off-host. Restore creates
unknown historical role names as `NOLOGIN`; current role initialization and customer
reconciliation derive fresh login passwords and reapply current grants.

See [Backup and recovery](operations/backup-and-recovery.md) for the executable
contract.

## Local and E2E equivalence

`deploy/local` runs the same logical services, databases, component catalog, grants,
and routing rail on one workstation. The local account helper creates a disposable
entitlement and customer environment; the Rust client still authenticates through the
real device flow and calls the facade.

The full-stack E2E creates two customer environments and proves physical and schema
isolation, first and second passkeys, native client authorization, raw Polar retention,
artifact and document flows, durable Intent/chat and Actor data, forged-header
resistance, managed hosting, and profile-aware teardown. The recovery drill separately
proves exact encrypted fresh-target restore.

## Current deliberate gaps

- Shared identity, `next`, and production now have isolated Pulumi stacks and
  deployment targets; see [Deployment targets](operations/deployment.md#deployment-targets).
- Diagnostic database roles are issued manually. The SSH tunnel itself is already
  restricted, but automatic short-lived read-only role issuance and reaping remain to
  be built.
- Backups run hourly and can be inspected, but there is no narrow operator-triggered
  ad hoc backup workflow.
- Actor runs are durable; the richer generic observation/effect journal remains future
  runtime work.
- Document import supports device and remote execution. The remote Actor Runner uses
  the selected customer's run ledger and Artifact Store scope. Its document
  application executor is intentionally separate from the still-narrow generic
  planner; server OCR and model-backed understanding remain future capabilities.

These gaps must stay explicit. They are not permission to add shared databases,
cluster-wide runtime credentials, handwritten customer setup, caller-selected routing,
or a second legacy operating path.
