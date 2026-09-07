# Aven platform infrastructure

This Pulumi program creates one selected protected Hetzner foundation per stack:

- `identity`: `aven-identity-v1`, `aven.id`, and its identity-only PostgreSQL volume;
- `next`: `aven-platform-next-v1` at `next.aven.ceo`, `api.next.aven.ceo`, and
  `portal.next.aven.ceo`; or
- `production`: `aven-platform-production-v1` at `aven.ceo`, `api.aven.ceo`, and
  `portal.aven.ceo`.

It also creates stable SSH host keys, the deployment key registration,
firewalls, environment-specific `aven.ceo` DNS records, and internal runtime secrets.
`aven.id` uses an external DNS provider: the identity stack exports
`identityDnsRecords` for manual entry and never attempts to manage that zone. Each
platform stack generates its own identity provisioning credential. The shared
identity deployment admits both credentials without giving either platform access to
identity state or to the other platform's state.

Before preview, the workflow first applies state-only ownership migrations, including
releasing the former `my` checkout records without contacting the DNS API. Before a real
`up`, it then reconciles the six exact DNS record sets owned by that platform environment.
Matching A and AAAA sets left by an earlier deployment are imported
into the current stack and updated in place. A stale CNAME on one of those exact hostnames is
removed because it cannot coexist with the required address records. Records outside the
environment's `api`, `portal`, and apex names are never adopted or removed. Legacy
`my` checkout RRsets are relinquished from Pulumi state without provider-side deletion;
the platform never imports, changes, or removes them.

Until the planned VPN exists, SSH is reachable from dynamic IPv4 and IPv6
addresses and remains protected by generated per-host keys, key-only
authentication, disabled root login, and fail2ban. A generated `aven-admin`
identity has administrative sudo access; deploy, observe, and database-tunnel
identities remain separately constrained. Set `SSH_ALLOWED_CIDRS` to the VPN
networks when that ingress path is available.

Run tests with:

```sh
bun run test:infra
```

Use the protected GitHub workflows for real preview/up operations. The authoritative
provider, state, secret, deployment, publication, and recovery procedures are in the
[operations handbook](../../docs/operations/README.md).

All server, volume, firewall, DNS, secret, and host-key resources are protected during
normal preview and update operations. The generation-bound
[guided uninstall](../../docs/operations/initial-provisioning.md#uninstall-a-saved-generation)
can disable deletion locks for exact resources already recorded in a saved stack and then
remove the installation. There is no destroy input in the GitHub workflows.
