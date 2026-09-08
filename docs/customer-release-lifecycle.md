# Customer release lifecycle

Status: normative specification; implementation and proof status belong in the
[system map](customer-database-system-map.md) and [operations handbook](operations/README.md).

An installation must be reproducible on empty infrastructure. Updates prepare a new
running system, move customer environments independently, and retain the previous
databases for recovery. A failed customer migration must not interrupt other customers.

This specification owns release selection and customer movement. The
[customer database boundary](customer-database-platform.md) owns data isolation and
component contracts. Operations commands and credentials belong in the handbook.

## Release and trust boundaries

Developers merge reviewed changes into `main`. An operator selects an exact `main`
commit for `next`, then selects a successfully verified `next` release for `prod`.
Promotion is manual; verification and execution after that decision are automated.
Moving a branch alone does not deploy it. A changing branch name is never an artifact
identity. Server images are built once and promoted by immutable digest. Native
variants with different compiled origins belong to the same source release.

Each job reads only the selected target's GitHub Environment. A next deployment
cannot select production or identity credentials. A production deployment cannot
read next credentials, including to establish release proof: that proof is a
sanitized artifact. Old and new production generations both belong to production.
Customer databases are never copied from next to production during promotion.

Identity is independently released. A normal next or production update does not
redeploy identity. Identity authenticates subjects; it does not choose customer
placement or own deployment operations. Initial installation may orchestrate these
separate jobs in dependency order. Identity caller registration has its own explicit
procedure and must not require platform deployments to read identity secrets.

## Installation shape

The public installer supports an independently operated installation with one
platform target and an identity authority. It does not require a main/next/prod
development topology. The hosted installation composes the same primitives into
shared identity and isolated next and production platforms.

Each platform has stable control services and replaceable runtime generations.
Control services own commerce, membership, the customer directory, and durable
operations. A runtime generation owns a versioned service bundle and its customer
database cluster. Several generations may serve different customers concurrently.
Logical separation does not require a container scheduler or a machine per service.

Shared services must not be cloned into independent writable authorities during a
customer rollout. Their own updates have separate compatibility and recovery gates.
Public origins remain stable as customers move. The control database, configuration,
credentials and backup storage must remain recoverable without any one runtime host.

## Recoverable customer state

The stable customer environment UUID is the migration unit, not an identity subject.
All durable customer application state belongs to its database: file bytes, artifacts,
Intents, chat, execution state, customer configuration and effect records. There are
no independently authoritative local files, queues or object stores needed to resume
that work. Derived caches and generated content are allowed only when reproducible
from retained inputs. Secrets needed to decrypt customer data require recovery escrow.

Identity, commerce, membership, placement and operation history are explicit shared
exceptions. Customer site configuration follows the customer; shared hostname routing
is a projection. Referenced Git content must be recoverable at an immutable revision
for at least the database backup lifetime. A database dump is not evidence that these
external dependencies are recoverable.

## Directory and routing

The authoritative directory associates an environment with an active runtime ID,
database name, routing generation, lifecycle state and release identity. Runtime
endpoints come from operator-managed configuration, never from a client or identity
token. Runtime IDs are immutable within one installation target. Each runtime is
bound to one release and cluster; replacement creates another ID.

The facade verifies membership and selects the current route for every admitted
customer operation. All customer-dependent paths, including execution and model
requests, carry environment context. Identity-scoped administrative capabilities
remain separate. A load balancer may forward using this decision but must not maintain
an independent source of placement truth. Clients retain stable public addresses.

An environment under migration stops admitting new work. Unavailable or ambiguous
directory state fails closed. Switching a destination uses a compare-and-set against
the expected current route and increments the routing generation. Rollback also
increments it; historical grants never become current again. New customer provisioning
uses an explicitly selected default runtime, not an arbitrary healthy generation.

## Single-writer and execution ownership

At most one database copy admits application writes and at most one runtime executes
work for an environment. This includes existing database connections, streaming
requests, schedulers, queued jobs and external effects. HTTP routing is not a fence.
PostgreSQL advisory locks coordinate one database, not independently restored copies.

Handover closes admission, drains or checkpoints active work, prevents new execution,
revokes old application access and terminates remaining application database sessions.
Administrative restore access remains separate. Uncertain external effects require
reconciliation; killing a worker is not proof that its remote request did not happen.
No automatic retry may turn an uncertain effect into a duplicate.

Each worker must hold current execution authority. An expired controller lease cannot
resume mutations from stale operation state. A recovery attempt inspects actual
source and destination state before continuing. If ownership is uncertain, keep the
customer paused rather than guessing a writable destination.

## Customer movement protocol

An operation has a stable idempotency key, installation target, environment UUID,
source and destination runtime IDs, expected routing generation, immutable releases,
backup identity, current phase, attempt, timestamps and bounded failure information.
The operation journal is central so it survives either runtime becoming unavailable.
Only one unfinished operation may own an environment.

The following phases are durable and resumable:

1. **Prepare:** verify destination release, capacity, credentials and component
   catalog; optionally rehearse a snapshot migration without jobs or external effects.
2. **Pause:** close customer admission and prevent provisioning or entitlement
   reconciliation from reopening the route. Drain execution and record unresolved effects.
3. **Fence:** revoke old application access, terminate remaining connections and
   verify no source execution remains. Other environments stay writable.
4. **Copy:** take a final consistent dump, record its digest and restore boundary,
   and restore into an empty destination. An interrupted partial restore is identified
   by operation ID and never mistaken for a completed database.
5. **Verify:** apply the destination release's forward migrations, generate fresh
   function credentials, verify component metadata, isolation and application reads.
   Keep destination application admission closed. Do not use a rehearsal snapshot as
   the final copy unless a separately verified delta protocol is implemented.
6. **Activate:** atomically publish the new route and monotonically increased generation
   after verifying the source fence and destination readiness. Only then admit new work.
7. **Observe:** record readiness, first activation time, failures and migration duration.
   Retain the source database inactive until its explicit retention deadline.

Failures preserve the phase and evidence. Resume does not create another independent
operation or repeat a completed external action. A phase transition requires observed
postconditions, not only a successful process exit. Partial databases and old generations
are never deleted by generic failure cleanup.

The initial protocol allows a measured per-customer pause. It does not promise zero
downtime. Future incremental copying must preserve these same ownership guarantees.

## Rollback

Rollback selects one customer's retained database and its matching runtime release.
Before new writes, it can restore the former state without reconciling two histories.
After activation, assume divergence unless absence of writes and effects is proved.
The operator must explicitly select the recovery boundary and accept that later data
will not be visible in the resumed history. There is no generic automatic reverse
migration or merge.

Pause and fence the current runtime first. Preserve its database as an inactive
recovery branch, then verify the retained destination and activate it with a new
routing generation. Never overwrite either history. Preserve unresolved external
effect evidence across rollback so the old execution journal cannot authorize replay
of a payment, email or third-party action that already happened.

Retiring a generation requires no active routes, running operations or execution
authority referencing it. Database deletion is a separate explicit operation after
retention, backup verification and any reconciliation hold have been satisfied.

## Disaster recovery and release retention

Fresh installation and disaster recovery use the same infrastructure creation,
role generation, schema verification and admission gates as customer movement.
Recovery restores shared authorities before dependent customer routes. Restored routes
stay closed until destination state is verified and a fresh generation is published.

Each backup records environment and installation identity, routing generation,
PostgreSQL version, release manifest, component versions and migration digests,
timestamp, integrity checksums and recovery boundary. Retain exact release artifacts,
configuration and decryption material for at least the longest associated backup
retention. Expiring CI artifacts alone are not a release archive.

Install and restore operations must survive process interruption and report a
recoverable next action. Public readiness includes authenticated customer journeys,
not merely process health. RPO, recovery duration and migration pause are measured
and reported against configured objectives; an upload is not a restore proof.

## Required acceptance evidence

- Fresh installation without vendor deployment credentials or mandatory next/prod topology.
- Fresh infrastructure restore from retained release and backup material.
- Manual main-to-next and next-to-prod selection with exact artifact identity and
  target-only credentials; platform promotion leaves identity unchanged.
- Two customers on the source: move one to a different runtime and database cluster,
  preserve exact content and continue serving the other throughout the pause.
- Source connections and workers cannot write or execute after handover; delayed
  requests and stale grants do not reopen the old route.
- Inject interruption at every durable phase, resume, and prove one final owner.
- Concurrent requests, controllers, provisioning and entitlement changes do not
  bypass the migration hold or publish a stale route.
- Retained-state rollback before activation and explicit divergence rollback after
  writes, preserving both histories and preventing uncertain effect replay.
- Failed verification never activates a destination; failed cleanup never deletes
  recovery material; wrong-target backups and release proofs are rejected.

Current implementation gaps must remain named until the corresponding executable
proof passes. Unit tests of a state machine alone do not establish a working
cross-host deployment or successful provider recovery.
