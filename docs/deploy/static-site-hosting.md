# Static-site hosting

## Boundary

Static hosting is a platform capability, not an identity or checkout feature:

```text
aven.ceo Rust app -> api.aven.ceo -> hosting control store
                                      |
                                      v
                               static-site-host -> public GitHub
                                      |
                                      v
                                Caddy -> site
```

The installed `aven.ceo` Rust application owns the management UI. It obtains
a short-lived, passkey-qualified token from `aven.id` and calls the fixed
`api.aven.ceo` origin from Rust. Neither `aven.id` nor `portal.aven.ceo`
contains site-management pages or routes.

The facade owns the small `site_bindings` control table. The static host has no
database, Caddy-admin, Hetzner, identity-signing, or DNS-provider credential. It
polls a private bearer-protected directory and reports reconciliation status.
Caddy's on-demand TLS ask endpoint admits only a currently active exact hostname.

## Repository contract

Each site uses a public GitHub repository with:

- a source branch such as `main`;
- a generated deployment branch such as `deploy/main`;
- `dist/index.html` on the deployment branch; and
- `dist/.source-revision` containing the exact 40-character source commit SHA.

Only `owner/repository` identifiers are accepted. Clone URLs are derived by
the service, not supplied by callers. A failed fetch, invalid source/artifact
pair, or invalid DNS response never replaces the last-known-good release.

## User-managed sites

In the installed app, open **Settings -> Static Hosting** and provide the
hostname, repository, source branch, and deployment branch. The Rust host calls:

```http
POST https://api.aven.ceo/api/sites
Authorization: Bearer <short-lived aven.id JWT>
Content-Type: application/json

{
  "hostname": "www.customer.example",
  "repository": "owner/repository",
  "sourceBranch": "main",
  "deploymentBranch": "deploy/main"
}
```

The response includes a one-time DNS token. Create exactly the returned records:

```text
_aven-site.www.customer.example  TXT  <one-time token>
www.customer.example             A    <returned platform IPv4>
www.customer.example             AAAA <each returned platform IPv6, if present>
```

The database stores only the SHA-256 token hash. Every resolved A and AAAA value
must be in the deployment allowlist; mixed or CDN address sets fail closed.
Editing a binding rotates the token and returns it to `awaiting_dns`. Deleting
it withdraws Caddy authorization without affecting any other binding.

The authenticated facade endpoints are:

- `GET /api/sites`
- `POST /api/sites`
- `PUT /api/sites/:id`
- `DELETE /api/sites/:id`

Ownership is checked against the verified `aven.id` subject on every
mutation. Callers cannot create `aven.ceo` or its subdomains; those names are
reserved for system-managed configuration.

## Environment system sites

Each platform deployment seeds its reserved public site from `SYSTEM_SITES_JSON`.
Production uses:

```json
[
  {
    "hostname": "aven.ceo",
    "repository": "myavenceo/aven-brands",
    "sourceBranch": "production",
    "deploymentBranch": "deploy/production"
  }
]
```

`next` uses `next.aven.ceo`, source branch `next`, and deployment branch
`deploy/next`. System sites use operator verification, cannot be edited through the
user API, and are visible only to an authenticated administrator in the Rust UI.
Each platform Pulumi stack manages the A and AAAA records for its reserved system
site.

## Runtime configuration

The platform Compose stack receives generated secrets and Pulumi outputs:

- `SITE_HOST_DIRECTORY_BEARER_TOKEN`: generated 32-128 character service
  credential shared only by the facade and static host;
- `SITE_HOST_PUBLIC_IPV4` / `SITE_HOST_PUBLIC_IPV6`: addresses returned to
  users and admitted during DNS verification;
- `SITE_HOST_POLL_SECONDS`: defaults to 60;
- `SITE_HOST_DNS_GRACE_SECONDS`: defaults to 86400 for a previously verified
  site;
- `SITE_HOST_MAX_FILES`: defaults to 10000;
- `SITE_HOST_MAX_BYTES`: defaults to 268435456;
- `SITE_HOST_MAX_CONCURRENT_SYNCS`: defaults to 4; and
- `SITE_HOST_DNS_SERVERS`: optional comma-separated DNS servers used for
  verification; production normally leaves this unset and uses the host resolver; and
- `SYSTEM_SITES_JSON`: operator-owned site declarations.

Persistent releases and the last-known-good managed state live in
`/var/lib/aven/static-sites` on the protected platform volume.

## Verification

The local platform E2E uses an isolated DNS fixture, so it does not depend on the
currently deployed `aven.ceo` records. It automatically verifies authenticated CRUD,
ownership, reserved-host rejection, forged identity-header stripping, private-directory
authentication, a real shallow fetch of the `aven-brands` production and
`deploy/production` branches, source-revision matching, and HTTP serving.

After publishing the shared site:

1. confirm the binding is `active` in the Rust application;
2. compare its active source and artifact revisions with GitHub;
3. request the homepage and an SPA fallback path over HTTPS;
4. confirm `/internal/*` and unknown hosts return 404; and
5. restart Caddy and `static-site-host` while the facade is unavailable, then
   confirm the active site still serves from persisted managed state.

For host creation, initial apex publication, recovery, and all required secrets, follow
the authoritative [deployment handbook](../operations/deployment.md).
