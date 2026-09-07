# Startup and readiness

Status: authoritative

A deployment or recovery is ready only when the system has converged from durable
storage to healthy public services. A running container is not enough. This chapter
owns the startup dependencies, the meaning of each readiness gate, and the safe place
to stop when convergence fails.

The same graph applies to initial provisioning, an ordinary deployment, and disaster
recovery. Recovery adds database restore after role initialization and before normal
migrations; it does not introduce a second startup path.

## Dependency classes

The stack uses four kinds of dependency:

| Kind | Meaning | Examples |
| --- | --- | --- |
| Durable foundation | The process is accepting connections on the listener other containers use | PostgreSQL on TCP, restored volume mounted |
| One-shot convergence | A finite job completed successfully and may be rerun safely | role reconciliation, migrations, customer component reconciliation |
| Internal readiness | The service can perform its required downstream work, not merely answer a socket | identity, facade, checkout, Artifact Store, Actor Runner |
| Public readiness | TLS, routing, and the public health route work through the deployed proxy | `aven.id` and the selected platform's API, checkout, and public-site origins |

Compose `service_started` is never a substitute for a dependency that needs one of
the stronger states. Long-running services depend on successful one-shot jobs or
healthy services. A failed one-shot job blocks its dependants and keeps traffic
closed.

## Identity host

```text
identity PostgreSQL durable TCP readiness
└── identity role reconciliation completes
    └── identity migrations complete
        ├── first off-host backup completes
        └── identity service becomes internally ready
            └── Caddy exposes aven.id
                └── public identity readiness succeeds
```

The PostgreSQL health probe uses `127.0.0.1`, not the default Unix socket. The
official PostgreSQL image starts a temporary Unix-socket server while it runs fresh
volume initialization and then restarts onto the durable TCP listener. Treating that
temporary server as healthy can start role reconciliation during the restart.

Identity readiness requires its schema and signing material. Caddy starting does not
make identity ready, and certificate issuance cannot succeed until the externally
managed `aven.id` records point to the identity host.

Backup and restore containers join both the internal database network and a dedicated
outbound network. The internal network remains unable to reach the internet, while the
outbound attachment lets only the selected containers reach Object Storage without
publishing an inbound port. A fresh deployment is not ready until migrations have
completed and the first encrypted off-host backup has produced a current success marker.

## Each platform host

```text
platform PostgreSQL durable TCP readiness
└── platform role reconciliation completes
    ├── checkout migrations complete
    │   └── Polar product manifest converges
    ├── facade migrations complete
    ├── Artifact Store control migrations complete
    ├── first off-host backup completes with the migrated central schemas
    ├── checkout becomes ready after product convergence; its workers become ready
    ├── platform provisioner becomes ready
    └── Artifact Store provisioner becomes ready
        └── customer reconciliation verifies mandatory components
            ├── Intent Service becomes ready for routed customers
            ├── Actor Runner becomes ready for routed customers
            └── Artifact Store becomes ready for routed customers
                └── facade becomes internally ready
                    ├── the environment API becomes publicly ready
                    ├── the environment checkout becomes publicly ready
                    └── managed static hosting exposes its system site
```

Customer routing stays closed until the provisioner has observed the required schema
versions, migration digests, grants, connectivity, and routing generation in that
customer's database. A migration command returning zero does not by itself establish
customer readiness.

Checkout can record commerce facts before a customer environment exists. Its
platform-event worker retries delivery until the facade and provisioner converge the
environment. The facade must not route a customer request to a partial environment.
Checkout itself stays closed when the published pricing manifest cannot be created or
drift-corrected at Polar. The one-shot sync includes avenNAME, recurring products, and
benefits and is safe to rerun on every deployment.

This graph runs independently on `next` and production. No readiness gate in one
platform can satisfy a dependency in the other. Both platforms depend on the shared
identity public issuer, but their customer reconciliation, tenant grants, and data
remain separate.

The Actor Runner depends on both its customer-specific run repository and the tenant
Artifact Store route. The Intent Service depends only on its customer-specific Intent
schema. Neither service receives a cluster-wide customer login.

## Initial deployment

After Pulumi has returned host access, both platform DNS sets exist, and the external
identity DNS records have been applied, the deployment workflow follows this order:

1. install the exact deployment bundle and immutable image references;
2. start the two PostgreSQL foundations;
3. reconcile current login roles and credentials;
4. run central migrations and converge the Polar product manifest;
5. start provisioners and reconcile customer databases;
6. start or admit the remaining internal services and workers;
7. verify internal health, backup health, and Compose completion; and
8. verify public TLS and health routes before declaring the deployment available.

Stop at the first failed gate. Inspect logs through the observation rail, correct the
declarative source, and redeploy. Do not start a blocked dependant by hand or edit a
database to make a health check pass.

The first repository probe is time-bounded and a failed backup retries after 30 seconds.
Backup logs identify the active attempt, provider failure, and retry delay. Compose gives
a fresh backup three minutes to establish its marker and fails the deployment by four
minutes rather than leaving a silently blocked Restic process running indefinitely.

## Recovery difference

Recovery reuses the same order with one inserted phase:

```text
fresh PostgreSQL foundations
→ current role reconciliation
→ verified fresh-target restore
→ normal migrations
→ customer reconciliation
→ internal readiness
→ public readiness
```

Current role reconciliation happens before restore so historical owners can be mapped
safely. It runs again through the normal deployment path so current passwords and
least-privilege grants win over restored metadata. Public traffic remains closed until
the ordinary readiness graph completes.

## What the pipeline proves

`bun run test:e2e:platform` creates fresh volumes and exercises this dependency graph
through real Compose conditions. It verifies role and migration completion, customer
reconciliation, internal health, public boundaries, and profile-aware teardown. Its
database health probes deliberately require the durable TCP listener so the test
cannot pass through PostgreSQL's temporary initialization server.

`bun run test:recovery` separately proves the restore insertion point, integrity
checks, fresh-target refusal rules, and post-restore access controls. The release
workflow runs both gates before publishing a release. Deployment validates that
release's immutable manifest before installing it.

## Capability health

Keep availability and degraded operation separate. `/api/health/live` answers whether
the process responds; `/api/health/ready` covers its immediate readiness requirements.
On identity, checkout and the facade, `/api/health/capabilities` returns 200 for healthy and 503
for degraded operation. The facade also accepts `/health/capabilities`.

Public capability requests read a cache. Workers refresh it every minute; observations
older than three minutes fail closed. A public poll does not send an email, query a
provider, enumerate customers, or run SQL. Responses expose only named checks, stable
reason codes and observation times.

Checkout observes database access, stale or dead email and platform-event queues,
SMTP verification, recent SMTP acceptance, Postscale sender verification and available
sending capacity, and the required enabled raw Polar webhook. SMTP acceptance is not
inbox delivery. The separate `observations` section reports SMTP acceptance evidence
and explicitly unverified inbox delivery. No recent traffic alone does not degrade an
otherwise working new or idle installation; provider, worker and queue failures still do.
A green capability response is therefore not a completed onboarding certificate.
Other SMTP providers need a capacity-check adapter; they are not
reported healthy merely because their credentials authenticate.

The facade observes checkout capability health, identity and domain-service readiness,
provisioner heartbeat, failed/stale operations and leases, and the latest backup result.
These checks do not prove every customer's schema by enumerating all customers; actual
request admission still verifies its customer route. Domain process readiness does not
prove a full document or LLM operation.
Identity separately observes database access, proof-replay cleanup lag, failed/stale
security-mail delivery and backup health. Its mail relay is a post-start dependency
on checkout, not a Compose startup dependency: pending notifications remain durable
while checkout starts or recovers. Checkout still depends on identity for authentication.

Capability observations run after startup, independently of Compose readiness. Do not
make checkout wait for the facade's aggregate health while the facade waits for checkout;
that would introduce a startup cycle. A deployment can be process-ready while degraded.
The release deployment waits for capability 200 after public readiness and reports
the safe reason-code response on failure; it must not record a successful promotion proof
while the selected host is degraded.
Controlled inbox delivery and the real-provider onboarding journey require separate proof.

Configure distinct uptime alerts for **DOWN** (liveness/readiness failure) and
**DEGRADED** (capability 503). External uptime-provider enrollment is not performed by
the repository without an operator account or API authorization.

## When adding a service

Add a service only after its dependency is expressible as a durable, one-shot,
internal, or public readiness gate. Update this page and the Compose dependency in the
same pull request. The service must:

1. own an internal readiness check that covers its required downstream resources;
2. use a dedicated service credential and customer-qualified database role;
3. depend on verified customer reconciliation when it stores customer data;
4. fail closed when its tenant route or grant is stale; and
5. have a fresh-stack test proving both successful startup and the important blocked
   dependency.

If those conditions cannot be stated, the service is not ready to join the supported
deployment graph.
