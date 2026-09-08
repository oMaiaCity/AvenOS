# Backup and recovery

Status: authoritative

The recovery model is simple: create new infrastructure from Git and Pulumi, restore
the newest verified off-host backups, reconcile current roles and schemas, and reopen
traffic only after smoke checks. Do not repair or copy an unknown failed host.

## Recovery objectives

- Database recovery point objective (RPO): at most one hour after the first successful
  production backup.
- Backup-staleness detection: two hours.
- Staffed host-disaster recovery time objective (RTO): four hours.
- Retention: all snapshots for 14 days, eight weekly points, and twelve monthly points.

The public site is rebuilt from Git. TLS state is disposable. Runtime logs are bounded
diagnostic evidence, not durable business data.

State and backup buckets both use versioning. Bootstrap installs a lifecycle that
retains noncurrent object versions for 90 days and aborts incomplete multipart uploads
after seven days; current objects are not expired by this policy. This adds storage
cost and protects against accidental overwrite, not a credential able to delete all
versions. The shared-provider and shared state/backup credential risks remain deferred.

## What is backed up

The identity repository contains accounts, passkeys, sessions, device state, and
identity signing-key rows. Each platform has its own repository containing checkout,
raw verified Polar deliveries, platform control data, and that environment's customer
databases, including Artifact, Intent, Actor, and future component schemas.

Identity, `next`, and production use separate Restic credentials or prefixes. A
restore command cannot select a snapshot carrying a different environment label.
Hetzner server backups are disabled because they do not form a complete or tested
data-recovery path.

## Automatic backup process

Each host runs the same non-root operations image once an hour with a dedicated
read-only `aven_backup` database role. It:

1. enumerates every connectable non-template database;
2. creates a custom-format PostgreSQL dump preserving owners and ACLs;
3. asks `pg_restore` to parse each dump;
4. records database names, PostgreSQL version, release, role names, and SHA-256
   digests in an integrity manifest;
5. encrypts and uploads the run with Restic;
6. applies retention and verifies repository metadata; and
7. atomically updates `last-success` only after every step succeeds.

The backup and restore containers have database access on the internal network and a
separate outbound-capable attachment for Object Storage. They publish no ports. On a fresh
host, backup waits for the current central migrations and the deployment waits for the
first successful encrypted snapshot. Repository probes are bounded, and a failed attempt
is logged and retried after 30 seconds.

The backup role can read application data but cannot write, create databases, create
roles, or restore.

There is currently no supported ad hoc backup trigger. Before a rare high-risk
operation, require a fresh successful hourly marker or add and test a narrow manual
backup workflow rather than using an interactive server shell.

## Check backup health

The hourly operations workflow checks the container and freshness automatically. To
inspect it manually:

```sh
./tools/stack-observe/run.sh identity check
./tools/stack-observe/run.sh platform check
```

Treat an upload without a validated manifest and successful repository check as a
failed backup.

The backup worker publishes a small atomic `public-status/health.json` containing only
status, observation time and snapshot count. A failed attempt changes it to degraded
immediately, even while an older successful snapshot remains fresh. The facade mounts
only this summary read-only, not backup files or credentials, and rejects observations
older than two hours. An upload/check result is not a successful restore-drill result.

## Fresh-host disaster recovery

Run recovery from protected `prod`, including when restoring `next`. Its coordinator
accepts an earlier verified release manifest that is an ancestor of the protected
workflow commit. A dispatch from `next` itself still requires its exact current commit.

You need access to the protected repository environment, Hetzner API, both DNS
providers, and the four-value recovery escrow described in
[Access and secrets](access-and-secrets.md#recovery-escrow).

1. Run `platform-infrastructure` with `command: up` for `identity`, `next`, and
   `production` to create three fresh hosts and empty protected volumes.
2. Reconcile the newly returned `aven.id` A/AAAA records through the saved United Domains
   API key. Pulumi has already recreated both platform environments' `aven.ceo` records.
3. Run `platform-deploy` from protected `prod` for `identity` with a retained verified
   `release_run_id` and
   `recover_from_backup: true`.
4. Run the same workflow and recovery option for `next`, then for `production`, supplying
   the matching successful `next_proof_run_id` for production. Use the manifest selection
   rules in [Deployment](deployment.md#deploy-the-software), not an arbitrary source ref.
5. Let each run start only PostgreSQL and role initialization, verify and restore its
   own newest snapshot, then perform normal migrations, reconciliation, startup, and
   public health checks.
6. Complete checkout, passkey, native-device, artifact, document, chat, Intent, Actor,
   environment-isolation, and public-site smoke checks before declaring recovery.

The restore insertion point and the convergence gates after it are defined in
[Startup and readiness](startup-and-readiness.md#recovery-difference).

The restore accepts only the internal `fresh-target-only` confirmation and refuses a
database containing user relations. It verifies the manifest and every dump before
restoring, and checks the entire target for existing user relations or closed databases
before changing roles or restoring the first dump. A failed restore preserves its partial database for inspection; retry on a
fresh target. Missing historical role names are created `NOLOGIN`; password hashes are
not restored. Current role initialization derives fresh passwords and reapplies
least-privilege grants.

## Restore one lost host

Use the same target-specific infrastructure and deployment commands, scoped to the
failed foundation. Restore identity only once even when both platform environments
depend on it. Do not attach an unverified old volume and reopen writes. Keep customer
routing closed until the restored databases, component schemas, grants, and routing
generation reconcile.

## Quarterly recovery drill

Before first production use and once per quarter:

1. provision disposable identity, `next`, and production hosts through the real
   Pulumi path;
2. restore from all three real private backup repositories;
3. run the public, customer-data, and cross-environment isolation checklist;
4. record snapshot IDs, manifest digests, start/end time, achieved RPO/RTO, and any
   manual decisions; and
5. destroy the disposable infrastructure only after recording evidence.

The operator must prove the escrow can be recovered independently of the workstation.
When another authorized person exists, they should also prove they can locate it. A
backup is not accepted as recoverable merely because its scheduled upload succeeded.

## Continuous proof

Every successful target deployment also restores its latest real encrypted snapshot
into a disposable database on the CI worker before recording deployment proof. The
database has an internal-only network; only the restore client reaches Object Storage.
The repository is read without writing Restic locks. Concurrent pruning can make a
drill fail, in which case retrying starts a new isolated database. Nothing connects the
restore process to the live database.

The drill uses memory-backed storage, capped at 2 GiB for restored PostgreSQL data and
512 MiB for backup files, with separate process-memory allowances. It cannot consume
unbounded worker disk space. A snapshot that exceeds those limits fails verification;
increase `DRILL_DATA_LIMIT_MB` and `DRILL_ARCHIVE_LIMIT_MB` in the protected workflow
together with worker memory when the installation grows. Each accepts 128–16384 MiB.
The sanitized `restore-drill-<target>` artifact records snapshot ID, time, and restored
database count, not customer rows or credentials. This per-deployment proof does not
replace the quarterly end-to-end infrastructure and escrow exercise.

Every platform pull request and release build builds the production operations image and
runs `bun run test:recovery`. The drill backs up source identity and customer data,
restores separate empty targets, compares exact rows and access controls, and proves
wrong-password and populated-target rejection.

The local drill proves the mechanism. The quarterly real-bucket drill proves provider
access, escrow, DNS, infrastructure creation, and operator timing.

## Retained release archive

Hosted platform rollout retains release images and private configuration before
customer activation and includes them in encrypted backups. Snapshots produced by
older deployments contain database dumps without an independent image archive.
The archive tool can also be used independently as described below. The fleet recovery
controller is implemented but its full host fixture remains an outstanding release gate;
do not promote this lifecycle change until that proof passes.

On a Docker host with Python 3, prepare a private bundle containing `release.json`,
`.env` (mode `0600`), `docker-compose.yml`, `db-init.sh`, and `Caddyfile`. The release
manifest must come from the verified release workflow, and every Compose image must
match one of its immutable digests. After pulling those images, retain them with:

```sh
python3 deploy/release/archive.py create /private/bundle /private/release-archive --target next
```

The tool exports images once per release and retains each configuration revision,
including optional generated runtime routes, movement configuration and preparation
metadata. Recovery-profile services are included even while they are stopped.
`current.json` selects the current pair. A retry checks existing content before reusing
it. The archive includes credentials: keep every directory private and mount it
read-only at `/var/lib/aven-release-archive` in the backup container. Its owner must
match that container's UID. Set `BACKUP_RELEASE_ARCHIVE_ROOT` to that mount path and
`BACKUP_RELEASE_ID` to the exact release commit. Backup then includes the retained
images and configuration in the encrypted snapshot and binds its selected release
to the database integrity manifest. Incomplete archive preparations are excluded.
A newly prepared runtime enables `BACKUP_ALLOW_EMPTY=true`: before its first customer,
it can back up its verified release with an explicitly empty database inventory. This
mode requires a retained release archive; ordinary platform and identity backups still
reject an empty inventory. Restore accepts such an empty snapshot only with its verified
release selection and a fresh target.

For a full release recovery, set `RESTORE_RELEASE_DESTINATION` to a new absolute path
inside a persistent writable mount of the restore container. Restore preserves the
archive there before restoring databases. Then, on the Docker host, run:

```sh
python3 deploy/release/archive.py restore /private/recovered-archive /private/fresh-bundle --target next
```

The tool checks the target, release, image archive and configuration checksums, loads
the retained images, and writes `restored-compose.json` using immutable local image
identities with pulling disabled. It refuses an existing destination. Inspect the
restored target paths, restore the matching databases and complete admission checks
before starting the full service bundle. Recovery must not start another writable
copy against live databases.

Without `RESTORE_RELEASE_DESTINATION`, the restore command verifies the release
selection but skips downloading image archives. The continuous database-only drill
uses this path to keep its memory limit bounded. `test:recovery` separately proves
that an encrypted snapshot restores both databases and a retained release after its
original files are removed. Neither fixture replaces the fresh-cloud-host drill.

## Customer movement development

The host lifecycle controller invokes customer movement after preparing and backing
up a new runtime. The same operator command supports controlled diagnostic use.
The public installer and fresh-host fleet recovery proof remain incomplete;
do not interpret a database fixture proof as a completed cloud rollout. The
[lifecycle specification](../customer-release-lifecycle.md) lists the remaining gates.

Run on Linux from a clean checkout of the destination release, or with its installed
bundled controller, with Bun, Docker and private
network access or database tunnels to both already-prepared runtimes. Set the recovery
URL SSL mode explicitly; the local tunnel fixture uses `sslmode=disable`, while dump
tools otherwise require TLS. Remote certificate provisioning is not part of this command. The controller
uses the checksum-pinned PostgreSQL 17 client image with host networking. It does not
publish database ports. Source and destination must be separate clusters with the same
installation target marker, created by the normal database initialization. Both running
Actor services must implement the customer execution barrier in this release.

The operator-owned mode-`0600` configuration file has these fields:

| Field | Meaning |
| --- | --- |
| `platformId` | Exact installation target label used by database initialization |
| `controlDatabaseUrl` | Central directory connection with the reconciler role |
| `archiveDirectory` | Absolute private directory for retained local migration dumps |
| `runtimes` | Array of runtime configuration objects |
| Runtime `id`, `releaseSha` | Immutable runtime ID and exact 40-character release commit |
| Runtime `recoveryDatabaseUrl` | Generated administrative recovery connection for that cluster |
| Runtime `provisioner` | That runtime's normal validated provisioner configuration; `CUSTOMER_RUNTIME_ID` must match `id`, and its cluster hostname and port must match the recovery connection |

Recover credentials through the existing escrow/access process. The installer does not
currently generate this movement configuration. It contains secrets; keep it outside
Git. The local dump directory contains customer data and must be protected and retained
until recovery is complete. These files are not a substitute for encrypted off-host
backups. The installed controller verifies its image-embedded release identity before executing
migrations. Source-checkout invocations still require a clean matching checkout.
Registration binds runtime IDs permanently to releases; it does not establish
that remote service images actually match those releases.

Register both already-prepared runtime releases, then create a movement using a fresh
operation UUID and the currently observed customer generation:

```sh
bun run customer:move -- /private/movement.json register
bun run customer:move -- /private/movement.json list
bun run customer:move -- /private/movement.json begin ENVIRONMENT_UUID SOURCE_RUNTIME DESTINATION_RUNTIME GENERATION OPERATION_UUID
bun run customer:move -- /private/movement.json resume OPERATION_UUID
bun run customer:move -- /private/movement.json status OPERATION_UUID
```

`begin` immediately pauses that customer's admission. `resume` verifies source ownership,
waits up to 60 seconds for running Actors, blocks on uncertain executions, closes source
logins, restores an empty destination, and applies the destination checkout's component
catalog. Restored Actors remain paused until placement is published; a retry finishes
that activation step before observing the new runtime. Repeating the same operation resumes its durable phase. A failure preserves the
hold and files. An existing destination without the exact operation/dump marker is
refused; do not delete it to silence the error. Database creation first uses a closed, operation-specific staging database. A retry
recognizes only that name, its expected owner and closed state before recording the
marker and publishing the final database name. Other existing databases remain refused. Return a failed movement to its original runtime before activation from the clean source
release checkout:

```sh
bun run customer:move -- /private/movement.json return OPERATION_UUID
```

The durable `returning` phase fences both copies, waits for provisioning and execution,
verifies the original database with newly derived credentials, then publishes the original
runtime at a generation higher than either attempted placement. A crash resumes with the
same `return` or `resume` command. It preserves any partial destination and blocks on
unfinished effects. Actor execution stays paused for reconciliation; ordinary customer
reads and writes resume. After activation, use the explicit divergence rollback below.

A rollback requires the activated or completed earlier movement ID and explicit acceptance that
newer data will no longer be visible. It retains both databases and disables Actor
execution until external effects have been reconciled:

```sh
bun run customer:move -- /private/movement.json rollback ENVIRONMENT_UUID CURRENT_RUNTIME RETAINED_RUNTIME CURRENT_GENERATION NEW_OPERATION_UUID RETAINED_OPERATION_UUID accept-divergence
bun run customer:move -- /private/movement.json resume NEW_OPERATION_UUID
```

Resume rollback from the clean retained release checkout. Never clear unfinished Actor
records merely to make movement succeed: determine the actual outcome of each external
action first. Automated reconciliation and retirement are separate outstanding work.

After proving the destination runtime, select it for new purchases from its clean release
checkout. This binds the component catalog immutably and atomically changes the directory
default; existing customers keep their current placement:

```sh
bun run customer:move -- /private/movement.json default DESTINATION_RUNTIME
```

This command checks the Artifact Store provisioner's readiness. It does not replace the
runtime journey or verify the remote image digests. Configuration may contain one runtime
for this command; a movement still requires two distinct registered runtimes.

The driver verifies database component metadata, scoped reads and privileges. It does
not yet perform a native-client or live-provider journey before activation. Run the
isolated mechanism proof with:

```sh
bun run test:customer-movement
bun run test:customer-runtime
```

The second command builds the current Artifact Store image and runs the actual customer
catalog and provisioners on two disposable PostgreSQL clusters. Signed HTTP requests
exercise the facade and Intent Service, including phase interruption, continued writes
for another customer, retained rollback, interrupted pre-activation return and default placement. It uses local identity
signing keys and does not contact a live identity or cloud provider.

The installed controller also supports `reconcile RUNTIME_ID`. It creates or requeues
component operations at the active generation through the normal placement-aware worker, without changing a
customer's generation or component catalog. It cannot reopen a retained copy whose
customer is assigned elsewhere. The initial host transition waits for this work to
finish before starting the customer-facing services.

Hosted movement uses the destination release's retained database-tools image. This
keeps dump and restore tooling with the release archive instead of relying on an
unrecorded host package installation.

Role initialization explicitly restores login for the current service accounts and
reapplies the provisioner's database-creation privileges after restoration. Unknown
historical roles remain `NOLOGIN`. The recovery gate authenticates the intended
service accounts against fresh identity, platform and customer-runtime fixtures;
reading restored tables as the database administrator alone is insufficient proof.

## Runtime fleet recovery boundary

After runtime rollout, the central backup binds each active customer placement to an
exact customer-runtime snapshot. It checks snapshot freshness and customer generations,
then checks that the directory did not change while its databases were dumped. A held
movement or a generation mismatch makes that backup fail; the post-rollout backup runs
after the destination snapshot completes. Snapshot receipts are private files, separate
from the small public health records.

Runtime snapshots are retained until an explicit retirement procedure proves that no
retained central snapshot refers to them. Independent hourly pruning would invalidate
those references. Automated retirement is not implemented, so operators must account
for increasing backup storage. Central and identity repositories keep their existing
retention policy.

Each encrypted snapshot contains its selected complete fleet and configuration, rather
than every historical local archive. Earlier snapshots retain their own selections.
Runtime workers also notice database-inventory changes within 30 seconds and take a
new backup, so a new customer's first backup does not wait for the hourly schedule.
Deployment refreshes active runtime snapshots before taking the central snapshot.

Platform recovery dispatches `deploy/runtime/recover.py` with only that target's
credentials. It requires empty database and lifecycle storage, resolves one exact
central snapshot, verifies and loads the retained fleet images, restores separate
database clusters, and checks every customer's environment ID and routing generation
against the restored directory before starting application services. It uses the
retained installation paths. Select the verified release recorded by the backup;
recovery refuses a different source commit, image set, repository or public origin.
It does not record a newer deployment as successful while running older restored images.
A failed attempt preserves partial recovery and requires
fresh storage for retry. An unfinished movement requires selecting a completed recovery
boundary; recovery never guesses which customer copy should win.

Current service roles are reconciled through each retained release's controller. Recovery
queues current-generation component work before starting provisioner workers and preserves
any active reconciliation lease. PostgreSQL grants the provisioner administration of customer roles when it creates them;
restoring roles as the recovery administrator does not preserve that relationship. Before
reconciliation, the controller verifies the customer database identity and restores the
same administration membership for existing roles named by its trusted component catalog.
It rejects customer roles with cluster privileges and grants no authority over unknown
historical roles. The provisioner remains a non-superuser.
Inactive customer copies keep their restored roles disabled. Actor execution remains
paused because effects after a backup cannot be inferred from restored database rows;
the operator must reconcile those effects before resuming execution. Successful database
and image restoration alone does not establish that reconciliation or a fresh-cloud-host
recovery drill has passed.
