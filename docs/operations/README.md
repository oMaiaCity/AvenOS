# avenOS operations handbook

Status: authoritative

This handbook is for developers and operators who need to build, run, deploy, or
recover avenOS. It owns operational procedures. Architecture papers explain why the
system is shaped this way; if their commands or operational claims conflict with this
handbook, this handbook wins.

The [product model](../product-model.md) owns product terminology and the boundary
between the direction of the product and properties the current system proves.

## Start here

| Goal | Use this section |
| --- | --- |
| Prepare a Linux or macOS workstation | [Workstation setup](workstation-setup.md) |
| Build the code or choose the right test level | [Build and test](build-and-test.md) |
| Run all services and the Rust client locally | [Local full stack](local-stack.md) |
| Bootstrap storage, recovery secrets, and GitHub | [Initial provisioning](initial-provisioning.md) |
| Create or update identity, `next`, or production | [Deployment](deployment.md) |
| Understand service startup order and readiness | [Startup and readiness](startup-and-readiness.md) |
| Understand environment isolation | [Deployment targets](deployment.md#deployment-targets) |
| Inspect health, logs, disk, or a database | [Maintenance](maintenance.md) |
| Understand or restore backups | [Backup and recovery](backup-and-recovery.md) |
| Respond to an outage or security event | [Incident response](incident-response.md) |
| Configure or recover credentials | [Access and secrets](access-and-secrets.md) |

## System in one minute

AvenOS has four production public boundaries:

- `aven.id` owns signup, passkeys, sessions, device authorization, service tokens,
  authentication, and authorization.
- `portal.aven.ceo` owns checkout, billing, verified raw Polar webhooks, and purchase
  delivery.
- `api.aven.ceo` is the authenticated facade over server-side product services.
- `aven.ceo` is the managed static public site rebuilt from Git.

The staging platform uses `portal.next.aven.ceo`, `api.next.aven.ceo`, and
`next.aven.ceo`. It shares only the `aven.id` issuer with production.

The deployed foundation is deliberately small:

```text
shared identity host        next platform host       production platform host
├── Caddy                   ├── Caddy                 ├── Caddy
├── identity service        ├── application services  ├── application services
└── identity PostgreSQL     └── platform PostgreSQL   └── platform PostgreSQL
                                └── customer DBs          └── customer DBs
```

Pulumi creates replaceable Hetzner hosts, protected volumes, firewalls, generated SSH
identities, database credentials, and service secrets. Docker Compose runs the
software. GitHub Actions verifies, builds, deploys, monitors, and records the audit
trail. Encrypted off-host logical backups are the data recovery path.

## Supported operating targets

| Target | Status | Purpose |
| --- | --- | --- |
| Local | Supported | Disposable development stack on one workstation |
| `identity` | Supported | Shared `aven.id` issuer and account store managed by its namespaced protected GitHub Environment |
| `next` | Supported | Isolated staging platform at the three `next.aven.ceo` origins |
| Production | Supported | Isolated customer-facing platform at the three apex production origins |

The Git branch named `prod` is a release reference, not a deployment. An operator
still selects the production target and exact ref. Never substitute production
credentials into `next` or reuse another target's state or backup prefix.

## Operating principles

- Automate normal operation; ask the operator only for provider credentials, an explicit
  deployment or recovery decision, and credential escrow. A second-person
  approval can be enabled when another operator becomes available.
- Deploy immutable image digests. Do not edit files on a server.
- Give every process its own database role and only the privileges it needs.
- Put customer-owned data only in that customer's database.
- Restore data only into fresh empty targets. Correct schema problems forward.
- Treat Git, encrypted Pulumi state, and encrypted off-host backups as the sources of
  truth. Hosts are replaceable.
- Use fixed observer and tunnel identities for diagnostics. Do not use runtime,
  migrator, provisioner, or PostgreSQL administrator credentials interactively.

## Normal lifecycle

1. Develop locally and run the smallest relevant checks.
2. Before review, run the complete release gate or let `platform-ci` prove it.
3. Provision infrastructure through a reviewed Pulumi preview.
4. Deploy only an exact verified commit.
5. Let migrations and reconciliation converge before traffic opens.
6. Let scheduled monitoring, security updates, log rotation, and backups run without
   operator intervention.
7. Investigate failed checks through the restricted observation rail.
8. Recover a failed host by creating a new one and restoring verified backups.
9. Retire customers, services, and infrastructure only after a final verified backup
   and an explicit data-retention decision.

## Documentation ownership

Operational changes must update this handbook in the same pull request. Component
READMEs may explain local internals, but they link here for shared setup, deployment,
maintenance, and recovery. Follow the [repository writing standard](../writing.md).
