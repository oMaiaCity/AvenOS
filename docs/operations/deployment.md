# Deployment

Status: authoritative

Build once in protected `next`, test there, and deploy the same image digests to
production. Development on `main` never receives deployment or recovery credentials.
Shared identity follows production trust because both platforms depend on it.

Three workflows own separate operations: `platform-infrastructure` manages hosts,
`platform-release` verifies and publishes images without deployment credentials, and
`platform-deploy` installs a verified release manifest without rebuilding application
source. Infrastructure accepts `all`. Deployment accepts it only with
`initial_installation: true` and processes identity, next, production in that order.
Normal deployment defaults to `next` and selects one target. Selecting a branch does not itself deploy anything.

## Deployment targets

| Target | Pulumi stack | Public origins | Static source |
| --- | --- | --- | --- |
| `identity` | `organization/aven-platform/identity` | `aven.id` | None |
| `next` | `organization/aven-platform/next` | `next.aven.ceo`, `api.next.aven.ceo`, `portal.next.aven.ceo` | `aven-brands` `next` and `deploy/next` |
| `production` | `organization/aven-platform/production` | `aven.ceo`, `api.aven.ceo`, `portal.aven.ceo` | `aven-brands` `production` and `deploy/production` |

The platform stacks share no database, tenant-signing key, service credential,
customer route, backup path, SSH identity, or Pulumi state. Both accept short-lived
tokens from `https://aven.id`. Each platform stack generates its own internal
provisioning credential. The shared identity deployment admits both; neither platform
deployment receives identity-state or cross-platform-state access.

The `my.aven.ceo` and `my.next.aven.ceo` names are outside avenOS ownership. Before
the first preview after the hostname change, automation removes only the old RRsets'
Pulumi state entries and makes no DNS-provider request. The DNS records remain
unchanged. All new checkout traffic and DNS management use `portal.aven.ceo` and
`portal.next.aven.ceo`.

## Before the first deployment

Complete [Initial provisioning](initial-provisioning.md). Its guided command owns the
normal first rollout: it creates the fresh namespaced GitHub Environments and storage,
dispatches the combined workflows, publishes `aven.id` through United Domains, and verifies
the running installation. The procedures below are the independently runnable operator paths
used by that setup and by later repair work.

Prove the candidate through [Build and test](build-and-test.md). The deployment
release workflow builds and scans candidate images, then runs the complete gate against
those exact digests before publishing a deployable manifest.

## Provision fresh infrastructure

The workflows select physical Environments through `DEPLOYMENT_ENVIRONMENT_PREFIX` and
reject targets absent from `DEPLOYMENT_TARGETS_JSON`; do not type or reuse a physical
Environment name.

Open **Actions → platform-infrastructure → Run workflow** on branch `prod`. Select `target: all` and
`command: preview`. The workflow previews `identity`, `next`, and production serially.
Review three replaceable servers, three protected volumes, their firewalls, generated
SSH identities, and each target's DNS behavior. Reject an unexplained replacement, wider
SSH ingress, an unprotected stateful resource, or the wrong target stack.

After the preview succeeds, run the same workflow once more with `target: all` and
`command: up`. It applies the three reviewed targets serially in `identity`, `next`,
production order. Until the VPN cutover, expect port 22 from `0.0.0.0/0` and `::/0`;
reject any unexpected non-SSH ingress or plaintext secret. The platform targets create
all A and AAAA records for their own three origins. There is no DNS promotion flag and
no legacy host to cut over.

An existing CNAME at one of those origins cannot coexist with the required A and AAAA
records. During guided initial provisioning, the setup recovery screen names the exact
conflict and waits for an explicit retry after the operator removes the obsolete record.
The retry reconciles saved GitHub and Pulumi state; do not create a new bootstrap
generation for this repair.

Pulumi installs Docker and Compose, mounts the protected volume, enables UFW,
fail2ban, bounded logs, and unattended security updates, and records cloud-init
completion. Do not create or upload SSH keys manually.

Servers are disposable and intentionally lack provider deletion protection; their
attached data volumes remain protected. A reviewed cloud-init or machine-image change
may therefore replace a host and reattach the same volume. Fixed-name hosts, deployment
key registrations, and attachments use delete-before-replace ordering so replacement
does not exceed server quota or collide with the old resource. Reject a plan that deletes
or replaces a data volume unless the recovery procedure explicitly requires it.

Pulumi also generates per-host `aven-admin` identities. They permit key-only SSH from
dynamic IPv4/IPv6 networks, including a phone SSH client, and have passwordless sudo
for manual administration. This is deliberately broader than the deploy, observe,
and database-tunnel roles. Import an admin private key only through the procedure in
[Access and secrets](access-and-secrets.md). Once the VPN is available, set
`SSH_ALLOWED_CIDRS` to its networks and apply the reviewed firewall change.

## Reconcile the external `aven.id` DNS records

The guided setup reads `identityDnsRecords` from the successful identity Pulumi summary,
uses the saved United Domains API key to replace only the apex A and AAAA record sets, and
waits for public DNS before deploying software. The final CSV records both values and the
verification result.

For an independently dispatched infrastructure repair, read `identityDnsRecords` and
reconcile exactly:

- `A`, name `@`, returned identity IPv4 address, TTL 300;
- `AAAA`, name `@`, returned identity IPv6 address, TTL 300.

Use the United Domains console or API key recorded by the setup, then verify the public
answers:

```sh
dig +short A aven.id
dig +short AAAA aven.id
```

Do not copy addresses from an earlier run or point `aven.id` at either platform host.

## Deploy the software

First promote the reviewed source using [Promote release branches](deployment.md#promote-release-branches).
Run **platform-release** on `next`. Record the successful run ID; its `aven-release`
artifact contains the source SHA and all eleven image digests. No infrastructure,
database, SMTP, Polar, backup, or identity credential is available to this build.

Run **platform-deploy** on `prod`, select `target: all`, enter that `release_run_id`,
set `initial_installation: true`, and keep `recover_from_backup: false`. The protected coordinator verifies the run's
repository, workflow, branch, successful status, source ancestry and exact image set
before selecting any Environment. It installs identity, next, production serially;
production cannot run after a failed next deployment. There is no free-form `ref` input.

For a next-only deployment, run the coordinator on `next` with `target: next`; the
release SHA must match the current `next` SHA. For production-only promotion, run on
`prod`, supply the same `release_run_id` and a successful `next_proof_run_id` from
`platform-deploy`. The proof must reference exactly the same release. Identity-only
deployment also runs on `prod`.

`target: all` refuses recovery mode. Restore one target at a time through the recovery
procedure so an accidental bulk restore cannot blur the boundary between shared identity
and the two platform backups.

Identity deployment requires the already-managed A and AAAA records and provisioned
Pulumi stacks for both platform targets. It resolves those records, writes their exact
addresses into Caddy's internal-route allowlist, and reads each platform's generated
provisioning credential through the protected identity Environment.

Each platform deployment selects its own generated identity credential, domains,
static-site branches, tenant-grant issuer, backup label, and backup prefix from the target. The
workflow does not accept those security-sensitive values as free-form inputs.

The release pipeline and deployment together:

1. builds and scans non-root candidate images and records immutable GHCR digests;
2. repeats static, unit, Rust, infrastructure, recovery, and full-stack E2E checks,
   with the release journey consuming those exact images;
3. publishes the deployable manifest only after every required job succeeds;
4. reads generated keys and secrets from the selected Pulumi state;
5. installs a mode-`0600` bundle through the target's lifecycle controller;
6. creates or rotates exact database roles;
7. runs migrations, Polar product-manifest convergence, and customer reconciliation;
   and
8. requires Compose, backup, static-site, and public readiness.

The exact dependency graph is in
[Startup and readiness](startup-and-readiness.md). No operator opens SSH, writes a
server file, or handles a generated database password.

## Verify the environments

Routine deployments do not require an operator to open SSH, write a server file, or
handle a generated database password. The `aven-admin` login remains available for
manual diagnostics and recovery.

Verify shared identity and `next`:

```sh
curl --fail https://aven.id/api/health/ready
curl --fail https://api.next.aven.ceo/health/live
curl --fail https://portal.next.aven.ceo/api/health/ready
curl --fail https://next.aven.ceo/
```

Complete a sandbox checkout, email, passkey, native-device, customer-data, document,
chat, Intent, and Actor smoke test in `next` before deploying the same verified ref to
production. Local E2E uses isolated provider fixtures; it is not evidence of live
inbox delivery or Polar availability. Capability health distinguishes these failures
from process availability; see [health semantics](startup-and-readiness.md#capability-health).

The distributed client defaults to production. For a workstation-only `next` smoke
build, compile the Rust shell against the staging API while retaining the shared
identity origin:

```sh
AVEN_IDENTITY_BASE_URL=https://aven.id \
AVEN_API_BASE_URL=https://api.next.aven.ceo \
bun run --cwd app tauri:dev
```

Verify production:

```sh
curl --fail https://api.aven.ceo/health/live
curl --fail https://portal.aven.ceo/api/health/ready
curl --fail https://aven.ceo/
```

Complete one real low-risk purchase and the same authenticated application smoke
path. Confirm that its account appears in shared identity and that no resulting
commerce, customer, Intent, Artifact, or Actor record exists in `next`.

## Deploy an update

Shared identity is updated only by an explicit identity deployment. Normal next and
production deployments do not run it. `target: all` is reserved for explicitly declared
initial installation; it is not a platform-update shortcut.

The platform deployment invokes the host lifecycle controller. It retains a private,
immutable input bundle, starts a separate customer runtime and verifies encrypted
backup before selecting it. Control services update independently; existing customer
runtime images, credentials and database storage remain unchanged. Customers move
one at a time through the persistent movement journal. The former runtimes remain
available for explicit per-customer rollback.

The first transition from a pre-movement installation is a maintenance operation. It
requires identical customer component catalogs, ready customer environments and no
unfinished Actors. It stops application admission and background services, confirms
that database clients have drained, and takes an encrypted backup containing the exact
predecessor images and configuration before establishing the execution safeguards.
A failure retains the installation and its transition journal; resolve the reported
phase and repeat the same release. Do not select another release midway through this
transition.

The host controller uses the selected target's Pulumi-pinned `aven-admin` key. It does
not receive another platform's key or state. The transport upload and temporary GHCR
credentials are removed after the run. The private runtime registry and controller
remain under `/var/lib/aven/lifecycle`. See
[customer movement](backup-and-recovery.md#customer-movement-development).


Promote source into `next`, run `platform-release` there, and deploy its successful
`release_run_id` to next. Promote the reviewed source into `prod`, then deploy the
same release with its `next_proof_run_id`. Keep `recover_from_backup: false`.
Deploy shared identity contract changes from `prod` before dependent platform changes.

The same role initialization, migrations, reconciliation, health checks, and backup
checks run on every update. A production deployment never promotes or copies the
`next` database.

## Roll back application code

Select a previously successful release and matching next proof whose schema contract
is still supported. Production consumes those same digests without rebuilding source.
It does not roll database state backward. GitHub release/proof artifacts are retained
for 90 days; beyond that window, this workflow cannot establish their proof and refuses
deployment. Keep a supported release available rather than relying on an expired artifact.

If migration or reconciliation fails, traffic stays closed. Inspect fixed-scope logs,
correct forward, and redeploy. Never run reverse migration SQL as an improvised
rollback.

## Promote release branches

From an authenticated administrator workstation:

```sh
bun run release:promote next
# After the next release has been exercised:
bun run release:promote prod
```

The command creates or finds the corresponding `main → next` or `next → prod` PR.
Review its diff and successful checks, then use the exact-head merge command it prints.
Use a merge commit, not squash, so release ancestry remains verifiable. Rules require
the `Platform release gate` and resolved threads; one administrator can operate this
without another account. Changes to workflows, infrastructure, authentication and
secret handling require particular attention during that review.

The old automatic `promote` workflow and repository deploy-key bypass are removed.
Promotion changes Git state only. Initial guided provisioning requires the workstation
to match protected `prod` and requires next and prod to contain the same source tree;
it then dispatches the release build from next and the all-target coordinator from prod.

## Prepare a separate runtime generation

Hosted platform deployment invokes these tools through `deploy/runtime/host.py`.
The individual commands below also support installation diagnostics. Preparation or
startup alone does not complete a customer rollout.

From a verified platform bundle, prepare a new immutable runtime ID with unused
loopback ports. The bundle contains the production Compose file, its private `.env`,
`db-init.sh`, `Caddyfile` and the verified `release.json`. Python 3 and Docker Compose
are required. Preparation writes a private directory without starting services or
changing customer placement:

```sh
python3 deploy/runtime/prepare.py /private/platform-bundle /opt/aven/runtimes/green --runtime green --target next --database-port 15432 --provisioner-port 18088
```

The default data root is `/var/lib/aven/runtimes`; the existing internal control network
is `aven-platform_platform-private`, with the central database on loopback port 5432.
`--data-root`, `--control-network` and `--control-port` select another installation
layout. The runtime ID is at most 24 lowercase letters, digits or hyphens, starts with
a letter, and cannot be `primary`. Repeating preparation verifies and reuses its
output. A different release, input configuration or port assignment under the same
ID is refused; choose another ID rather than editing the prepared files.

The generated runtime has its own database, credentials, service addresses, storage
and backup repository suffix. Initialization accepts a pristine PostgreSQL cluster or
one already marked for that exact target. An unmarked populated cluster or a different
target fails before creating or altering application roles. It connects to the existing directory authority and
contains no identity, commerce or directory database. Service ports remain private;
only database recovery and Artifact Store provisioning publish loopback ports.

On the target host, run startup as the installation administrator:

```sh
sudo python3 deploy/runtime/start.py /opt/aven/runtimes/green --target next
```

Startup pulls only manifest-pinned images, checks the internal control network, starts
and waits for the runtime services, extracts the matching bundled movement controller,
retains release images and configuration, then enables and waits for encrypted backup.
A failure preserves the new files and databases; repair the cause and repeat startup.
Startup does not select the new default or move any customer. Follow the
[customer movement procedure](backup-and-recovery.md#customer-movement-development)
after publishing the verified runtime routes and configuring both recovery endpoints.

`route.json` and `movement-runtime.json` contain the generated routing and administrative
connection material. They remain private and are included in the retained release
archive. The controller under `controller/` comes from the verified provisioner image;
its embedded release SHA must match the destination for migration or default selection.
Use `controller/bun controller/build/move-cli.js` in place of `bun run customer:move`
when operating an installed controller. Database dump tools run through the host's
Docker engine; ordinary customer services receive no Docker socket.

The facade can use `CUSTOMER_RUNTIMES_FILE=/runtime-routing/runtimes.json` to read an
operator-managed route array through the read-only `/var/lib/aven/runtime-routing`
mount. Publish a complete validated array by atomic file replacement before activating
a destination. Keep its directory and file readable by the facade UID (1000), but not
writable by group or others. This file contains service tokens. Missing, oversized,
malformed, writable or symlinked files fail closed. A file-backed registry requires an
explicit entry for every active runtime, including `primary`; it never falls back to
old static routes. Without that setting, `CUSTOMER_RUNTIMES_JSON` remains the static
installation configuration. Publishing routes does not change customer placement.

The controller retains each input revision and its port assignment. Deployment retries
reuse the same database and resume any customer operation already held for that
destination. A conflicting operation or rollback stops the cohort. The controller
never guesses that data divergence is acceptable. It takes a fresh runtime backup
after customer activation and then backs up the updated control directory.

The retained fleet archive includes every generation's immutable images, configuration,
route tokens and movement credentials. It remains encrypted off-host; it is not a
GitHub artifact. Scheduled and post-migration snapshots share a process lock so the
explicit post-migration snapshot cannot race the scheduled backup.

Capability health checks the Artifact Store, Intent Service, Actor Runner and backup
for every active or default runtime. Runtime backups publish bounded public health
records and separate private snapshot receipts under `/var/lib/aven/runtime-backup-health`.
The facade mounts that directory read-only and cannot read the private receipts.
The central directory backup remains mandatory even after every customer
has moved away from `primary`.

Before replacing control services or moving customers, the host controller inventories
customer database sizes and the selected local images. It requires free lifecycle
storage for three database copies, two image archives and a 2 GiB reserve. The existing
customer data remains on disk throughout. This conservative disk check precedes
quiescence; runtime startup and readiness must also succeed before control changes.
It is a capacity guard, not a guarantee against unbounded migration growth. Retained
generations and snapshots require an explicit retirement policy; deployment does not
delete them to make space.
