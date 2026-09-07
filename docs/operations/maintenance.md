# Maintain an installation

Status: authoritative

A healthy installation requires no daily shell work. Containers restart, Docker
retains them across daemon restarts, Ubuntu installs security updates, logs rotate, an
hourly backup runs on each host, and GitHub checks public and host health hourly.

## Routine schedule

| Frequency | Operator action |
| --- | --- |
| Continuous | Respond only to failed public, container, disk, TLS, or backup checks |
| Each release | Deploy an immutable verified release manifest and complete the smoke checklist |
| Monthly | Review capacity trend, failed workflow history, provider expiry notices, and access membership |
| Quarterly | Perform a real fresh-host recovery drill and verify password-manager recovery; include another recovery holder when available |
| Before retirement | Take a final verified backup and record the data-retention decision |

## Automated maintenance

- `platform-operations` dispatches protected `platform-observe` from `prod` at minute 17
  each hour once the installation exists. The default-branch scheduler has no target
  secrets; the protected observer runs the identity, next and production checks.
- The jobs use the corresponding read-only `<target>-operations` GitHub Environment;
  deployment approval rules never block scheduled monitoring.
- It checks the target's public HTTPS origins, host Compose state, data volume use,
  and backup freshness.
- Data volume use at or above 85%, a missing/unhealthy backup container, or a backup
  older than two hours fails the workflow.
- Docker retains five 10 MiB JSON files per container.
- Journald is compressed, capped at 256 MiB persistent and 64 MiB runtime, and retains
  no more than 14 days.
- Required security reboots are staggered by cloud-init: identity at 03:30 UTC and
  each platform host at 04:00 UTC.

GitHub failed-workflow notifications are the initial alert channel. A scheduled
operations run stays dormant until the first successful deployment; a manual run is
always strict.

## Observe status and logs

On a trusted workstation, export the selected target's Pulumi backend location,
stack, state access credentials, and passphrase. Do not put secret values in
repository files. Select the `identity` stack for the identity commands, the `next`
stack for staging platform commands, or the `production` stack for production
platform commands.

```sh
./tools/stack-observe/run.sh identity ps
./tools/stack-observe/run.sh identity status
./tools/stack-observe/run.sh identity logs
./tools/stack-observe/run.sh identity check

./tools/stack-observe/run.sh platform ps
./tools/stack-observe/run.sh platform status
./tools/stack-observe/run.sh platform logs
./tools/stack-observe/run.sh platform check
```

The word `platform` selects the host kind inside the chosen stack; it does not choose
between `next` and production.

The observer shows only fixed-scope Compose state, the last 300 log lines, disk use,
and the latest backup marker. It cannot open a TTY, forward a port, or change state.

## Inspect a database

Open a host-key-pinned loopback tunnel:

```sh
./tools/db-tunnel/open.sh identity 55431
./tools/db-tunnel/open.sh platform 55432
```

As with observation, `PULUMI_STACK` selects `next` or production before the
`platform` command runs.

The tunnel key permits only forwarding to host-loopback PostgreSQL. Connect through it
with a separately issued, time-bounded, read-only database role. Do not use a runtime,
migrator, provisioner, backup, or `postgres` login.

Automatic diagnostic-role issuance is not implemented. Until it is, issuing and
revoking the read-only SQL credential is a deliberate manual security operation.

## Customer provisioning and reconciliation

Checkout commits entitlement events to its outbox. The platform consumes them,
creates one physical customer database, installs component schemas and roles, and
publishes a verified routing generation. Normal provisioning is asynchronous and
requires no operator.

If a customer remains provisioning:

1. inspect platform status and logs;
2. identify the failing migration, grant, or component health check;
3. correct the declarative component or migration forward; and
4. redeploy so reconciliation resumes idempotently.

Never create a customer database, schema, role, or route by hand.

## Release and credential maintenance

Dependabot checks JavaScript/Bun, Rust, Docker bases, GitHub Actions and Android Gradle
dependencies weekly and groups compatible changes to keep the review queue bounded.
JavaScript/Rust advisory and redacted secret scans run in platform CI, release verification,
and the weekly `dependency-security` workflow even when application source is unchanged.
An automatic update PR is not automatically deployed: it must pass the same tests and
promotion rules. Advisory feeds can miss unpublished flaws, and a clean package scan
does not prove the operating-system or container dependency set is safe.

Application runtime Dockerfiles update their Debian or Alpine packages during a fresh
build, before dropping to the runtime user. Existing images and running containers do
not update themselves: publish and deploy a new verified release to receive those fixes.
Reusing a cached package-update layer does not refresh it; security rebuilds must bypass
that layer. OS image scanning remains a separate check from JavaScript and Rust audits.
The full local E2E harness audits its newly built images. Release publication scans all
eleven exact runtime digests before exporting a usable release manifest. Fixed high or
critical OS advisories block release; findings without an upstream fix remain visible.
The checksum-pinned scanner reads its current advisory database and fails if that check
cannot run. It does not claim that the absence of a published fix makes a finding safe.
The weekly dependency check also rescans the most recent successful release's exact
image digests. It reports when no release exists and fails if a recorded release's
manifest cannot be retrieved; an expired artifact is not a successful security check.

The database and proxy are also built and pinned in the release manifest, rather than
pulled from floating production tags. The OS scanner does not inspect Go libraries
inside Caddy. The latest reviewed upstream Caddy binary still has reported library
advisories; rebuilding its Alpine layer does not resolve them. Treat those as open
upstream findings, not as covered by the OS gate. A custom Caddy dependency fork is
not part of the low-maintenance deployment model.

See [Runtime security controls](security-controls.md) for request budgets, boundary
signals, container exceptions, static-fetch limits and desktop permissions. Review
unexpected internal-peer denials using the existing bounded logs. Do not respond by
adding an IP to an allowlist without establishing why that service needs access.

- Deploy updates through [Deployment](deployment.md#deploy-an-update).
- Rotate secrets according to [Access and secrets](access-and-secrets.md#rotation).
- Treat certificate expiry and provider deprecation warnings as scheduled release
  work, not server edits.
- Preserve forward compatibility with the immediately previous application image.
  Remove old schema only in a later release after backup proof.

## Capacity and growth triggers

Add operational machinery only after a measured threshold:

| Trigger | Next step |
| --- | --- |
| Logical backup exceeds 15 minutes or RPO must be below one hour | Add continuous WAL archive and periodic physical base backups |
| Two-host local logs are insufficient | Ship the same structured events to a managed log store |
| Hourly public checks are too slow | Add a dedicated uptime provider with paging |
| One platform host misses capacity or maintenance goals | Separate database and stateless service hosts, then add failover |
| Incident coordination becomes frequent | Establish an on-call rota, paging, severities, and service objectives |

Do not introduce Kubernetes, Grafana, or a general scheduler merely in anticipation of
growth.

## Retirement

For one customer or one service inside a retained installation:

1. disable ingress and workload credentials;
2. take and verify a final backup;
3. record retention, legal hold, export, and deletion decisions;
4. remove routing and derived roles;
5. destroy compute only after recovery evidence exists; and
6. remove DNS last so stale clients fail closed.

For a complete test installation, use the generation-bound
[guided uninstall](initial-provisioning.md#uninstall-a-saved-generation). It requires the
owner-only bootstrap record and an exact typed generation confirmation, removes compute and
managed DNS before integrations, and deletes state and backup buckets last. A failed stage
is retryable from its local teardown backend. Storage cleanup is complete only after signed
checks prove that both exact generation-bound bucket names are absent; this remains true for
partially installed or partially tracked generations. Normal GitHub deployment and
infrastructure workflows contain no destroy or protection-removal input.

Do not use the complete uninstall for one customer, one database, one service, or routine
capacity work. Those scopes require their own final backup, retention decision, route and
role removal, and forward reconciliation.
