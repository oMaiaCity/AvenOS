# Repository agent instructions

These instructions apply to the entire repository. A more specific `AGENTS.md` may add
rules for its subtree.

## Before changing code or documentation

1. Read the root `README.md` for the current public system and supported targets.
2. Read `docs/writing.md` before writing user-, developer-, or operator-facing prose.
3. Read the relevant page under `docs/operations/` before changing a command,
   workflow, secret, endpoint, deployment, maintenance, or recovery behavior.
4. Read a nested `AGENTS.md` before modifying files in its scope.

## Documentation authority

- `README.md` is the broad standalone introduction and first local run.
- `docs/product-model.md` owns product terminology, purpose, and the boundary between
  current ownership guarantees and product direction.
- `docs/operations/` is the sole authority for setup, build/test, local stack,
  deployment, access/secrets, maintenance, backup/recovery, and incident response.
- `docs/customer-database-platform.md` owns the normative customer-data boundary.
- `docs/customer-database-system-map.md` describes only implemented current state and
  explicitly named gaps.
- Component READMEs own component internals. They link to the operations handbook for
  shared procedures instead of copying them.
- Historical implementation plans belong in Git history, not active documentation.

If two active documents disagree, fix or remove the non-authoritative one in the same
change. Do not add redirect pages for deleted runbooks.

## Freshness requirements

Update the owning documentation in the same change whenever you modify:

- a root package script or developer prerequisite;
- a local, E2E, build, release, observation, or database-tunnel command;
- a GitHub workflow input, Environment, secret, variable, approval, or branch rule;
- a public hostname, health endpoint, service boundary, or customer-data route;
- Pulumi resources, generated credentials, SSH roles, firewall/DNS behavior, or host
  maintenance;
- database roles, migrations, provisioning/reconciliation, backup, restore, retention,
  RPO/RTO, or incident behavior; or
- the status of a planned or unsupported feature named by an active document.

Do not “refresh” a date without verifying the procedure. Prefer removing a stale claim
to preserving it with a caveat.

## Required validation

For documentation-only work, run:

```sh
bun run check:docs
git diff --check
```

For operational scripts or workflows, also run:

```sh
bun run test:deploy
```

Use the complete gate in `docs/operations/build-and-test.md` when behavior crosses
authentication, authorization, customer data, deployment, or recovery boundaries.
