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
restoring. Missing historical role names are created `NOLOGIN`; password hashes are
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
