# Access and secrets

Status: authoritative

Configure human and machine access before provisioning the three deployment targets. A
solo operator provides the provider bootstrap credentials and explicitly dispatches each
change. Pulumi generates SSH keys, database passwords, signing keys, workload tokens, and
internal encryption roots.

## Human access

A single repository administrator can bootstrap, deploy, maintain, and recover the system.
That operator must be able to recover:

- repository administration and the active namespaced GitHub Environments;
- the Hetzner Cloud project;
- the Hetzner-managed `aven.ceo` DNS zone;
- the external DNS provider authoritative for `aven.id`;
- Pulumi state object storage;
- backup object storage; and
- the company password-manager recovery record.

Use multi-factor authentication and test password-manager account recovery. Add a second
individual account when another operator becomes available; this improves continuity but
is not an installation prerequisite. Do not share a human SSH private key or a database
administrator password.

## One-time object storage

The [initial bootstrap](initial-provisioning.md) creates private S3-compatible storage
for:

1. one versioned Pulumi state bucket each for `identity`, `next`, and `production`;
2. one encrypted Restic repository for shared identity; and
3. separate encrypted Restic repositories or credentials for `next` and production.

Hetzner does not expose S3 credential creation through an API. Use separate Object Storage
projects for `identity`, `next`, and production. Generate the nine provider credentials
named in the bootstrap guide, then enter them once. Pulumi creates
and versions the buckets through S3 and installs explicit deny policies. A target's
deployment credential writes only its state and backup buckets. A separate observer
credential reads only its state. Reusing the deployment credential for state and backup
means its compromise can destroy both recovery sources, including old versions. Versioning
protects against some mistakes, not this credential or a provider-wide failure. Keeping the
observer separate preserves the unattended read-only boundary. Independent immutable
recovery storage is deferred.

Each target's bootstrap administrator can repair policies only in that target project. It
stays offline and never enters GitHub. Neither platform Environment receives identity-state or
cross-platform-state access. The shared identity Environment receives the two platform
observer credentials and passphrases so it can assemble their generated identity caller
credentials.

## Shared DNS project

The `aven.ceo` zone belongs to exactly one Hetzner project. Create the `next` and production
DNS deployment tokens in that same project, even when its numeric ID differs from all three
Object Storage projects. The credentials remain separate and enter only their corresponding
deployment Environments. The bootstrap performs an exact read of `aven.ceo` with each token;
a 404 means the token was created in a project that does not own the zone.

The `aven.id` zone remains at United Domains. Its API key belongs only in the owner-only
bootstrap record and password-manager escrow; application and GitHub Environments do not
receive it. The setup uses it to replace the apex A and AAAA record sets after Pulumi
returns the identity host addresses. Uninstall uses the same key to remove only those saved
addresses.

## GitHub Environments

The bootstrap creates a deployment and operations Environment for every checked target,
using names such as `<deployment-prefix>-identity`, `-next`, and `-production` and
using exact branch policies: `next` and its operations Environment accept `next` and
`prod`; identity and production accept only `prod`. `main` receives none of these
deployment or recovery secrets. By default they have no required
reviewer, so one administrator can dispatch a run. When the optional `reviewer` input is
set, these three Environments require that GitHub user and prevent self-review. Matching
`-operations` Environments never require reviewers, so scheduled health checks remain
unattended. `DEPLOYMENT_TARGETS_JSON` records the cumulative prepared targets and keeps
scheduled monitoring away from absent Environments. The bootstrap switches
`DEPLOYMENT_ENVIRONMENT_PREFIX` only after every Environment selected for that run is
filled. Workflows derive physical names; operators continue to select the logical targets
`identity`, `next`, and production.

Each operations Environment receives only its target's `PULUMI_STACK`, backend variables, read-only
state access key, and passphrase. It receives no compute, DNS, backup, Polar, SMTP,
LLM, package-write, or deployment credential. The passphrase can decrypt the observer
key in state, so the bootstrap restricts these Environments to protected branches.

Each deployment Environment holds only its target's provider, state, integration, and
backup configuration. Do not copy a production secret into `next` as a convenience.

The repository also holds one secret, `PACKAGE_READ_TOKEN`. It is a classic GitHub token
with `read:packages` only and can download the cross-repository `@myavenceo/aven-ceo` and
`@myavenceo/aven-vibes` npm packages. The bootstrap verifies both reads before storing the
token. It does not belong in a target Environment because CI and the shared image build
run before a deployment Environment is selected. The same read-only value is stored in
Dependabot's separate secret store so dependency updates can resolve the private registry.

Two shared rulesets separate release-update authority from required checks. Only repository
administrators can update `next` and `prod`; even they must use a PR with resolved threads
and the successful, up-to-date `Platform release gate` from GitHub Actions. No second
reviewer is required. Bootstrap removes the former repository `DEPLOY_KEY` and its
automatic promotion path. An untrusted development workflow must not hold a release
branch bypass key. These shared rulesets and the package reader remain after a generation
uninstall; they protect the repository rather than one installation.
Bootstrap also enables GitHub secret scanning, push protection, vulnerability alerts
and automated dependency security updates. A private repository must have a plan that
exposes the required protection; setup reports the missing capability instead of
silently substituting the local scanner. No credential is printed by these checks.

The generation uninstaller retains `PACKAGE_READ_TOKEN`: it removes target Environments
and the active deployment selection, but shared repository CI still needs this
operator-supplied credential before another generation exists.

## GitHub Environment secrets

| Secret | Consumer and purpose |
| --- | --- |
| `HETZNER_COMPUTE_TOKEN` | Pulumi creates servers, volumes, firewalls, and registered deploy keys |
| `HETZNER_DNS_TOKEN` | Pulumi manages the Hetzner-hosted `aven.ceo` zone only |
| `PULUMI_STATE_S3_ACCESS_KEY_ID` | Workflows read and write the private Pulumi backend |
| `PULUMI_STATE_S3_SECRET_ACCESS_KEY` | Secret half of the Pulumi backend credential |
| `PULUMI_CONFIG_PASSPHRASE` | Encrypts generated secrets and private keys in Pulumi state |
| `POLAR_API_KEY` | Checkout accesses the selected Polar organization |
| `POLAR_WEBHOOK_SECRET` | Checkout verifies Polar webhook signatures |
| `SMTP_URL` | Checkout sends account and purchase mail through a send-only account |
| `LLM_GATEWAY_CREDENTIALS_JSON` | Server-side RedPill credential referenced by the deployment-resolved model catalog |
| `BACKUP_S3_ACCESS_KEY_ID` | Backup and restore access the private backup prefix |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret half of the backup credential |
| `BACKUP_RESTIC_PASSWORD` | Encrypts the selected target's Restic repository |

`identity` needs compute, its own state and backup values, and no Hetzner DNS, Polar,
SMTP, or LLM credential. It also needs these read-only platform-state values:

| Secret | Consumer and purpose |
| --- | --- |
| `NEXT_STATE_S3_ACCESS_KEY_ID` | Reads only the `next` state bucket while assembling identity |
| `NEXT_STATE_S3_SECRET_ACCESS_KEY` | Secret half of the read-only `next` state credential |
| `NEXT_PULUMI_CONFIG_PASSPHRASE` | Decrypts the `next` platform's identity caller credential |
| `PRODUCTION_STATE_S3_ACCESS_KEY_ID` | Reads only the production state bucket while assembling identity |
| `PRODUCTION_STATE_S3_SECRET_ACCESS_KEY` | Secret half of the read-only production state credential |
| `PRODUCTION_PULUMI_CONFIG_PASSPHRASE` | Decrypts the production platform's identity caller credential |

`next` and `production` need the full platform set, including Hetzner DNS, but no
cross-stack state values. Use Polar sandbox credentials in `next` and production
credentials only in production.

GitHub supplies `GITHUB_TOKEN` to publish this repository's GHCR images. The separate
`PACKAGE_READ_TOKEN` can read npm dependencies but cannot publish packages. Do not add
deploy SSH keys, SSH host keys, PostgreSQL passwords, tenant signing keys, internal
bearers, or generated roots to GitHub manually; they belong in encrypted Pulumi state.

Pulumi also generates `actorRunnerLlmGatewayToken`. The API uses it only for
`/internal/v1/llm`, and the Actor Runner uses it only as that route's client. It is
distinct from the runner ingress and Artifact Store credentials and is never a GitHub
Environment secret.

## GitHub Environment variables

| Variable | Meaning |
| --- | --- |
| `PULUMI_STATE_S3_BUCKET` | Private state bucket name |
| `PULUMI_STATE_S3_REGION` | State signing region; currently `hel1` |
| `PULUMI_STACK` | Exact target stack: `organization/aven-platform/identity`, `/next`, or `/production` |
| `HETZNER_LOCATION` | Server and volume location |
| `HETZNER_SERVER_TYPE` | Default amd64 server type |
| `IDENTITY_SERVER_TYPE` | Optional identity override |
| `PLATFORM_SERVER_TYPE` | Optional platform override |
| `HETZNER_OS_IMAGE` | Supported Ubuntu image; currently `ubuntu-24.04` |
| `IDENTITY_VOLUME_SIZE_GB` | Identity data volume; at least 30 GiB |
| `PLATFORM_VOLUME_SIZE_GB` | Platform data volume; at least 40 GiB |
| `SSH_ALLOWED_CIDRS` | Optional comma-separated SSH source networks; defaults to public dual-stack access (`0.0.0.0/0,::/0`) until the planned VPN exists |
| `POLAR_SERVER` | `sandbox` in `next`; `production` in production |
| `POLAR_ORGANIZATION_ID` | Polar organization UUID |
| `SMTP_FROM` | Visible sender address |
| `SMTP_REPLY_TO` | Optional monitored reply address |
| `DOWNLOAD_URL` | Client download target in checkout mail and UI |
| `ACME_EMAIL` | Monitored certificate contact |
| `ANDROID_APP_CERT_SHA256_FINGERPRINTS` | Production Android signing certificates; empty for initial `next` if none |
| `LLM_GATEWAY_TIMEOUT_SECONDS` | Optional bounded provider timeout |
| `BACKUP_REPOSITORY_BASE` | Private Restic base; deployment appends `/identity` or `/<environment>/platform` |
| `BACKUP_S3_REGION` | S3 signing region for the backup endpoint |

The platform deployment resolves `LLM_GATEWAY_MODELS_JSON` from RedPill's public live
catalog. It keeps only Phala-hosted chat models, derives capabilities from provider
metadata, and stops before changing the host when the catalog is invalid. The catalog is
therefore not a hand-maintained GitHub variable.

The `identity` Environment also defines:

| Variable | Meaning |
| --- | --- |
| `NEXT_PULUMI_STACK` | Exact stack: `organization/aven-platform/next` |
| `NEXT_PULUMI_BACKEND` | Read-only backend URL using the `next` state bucket |
| `PRODUCTION_PULUMI_STACK` | Exact stack: `organization/aven-platform/production` |
| `PRODUCTION_PULUMI_BACKEND` | Read-only backend URL using the production state bucket |

The infrastructure workflow rejects an Environment whose stack name does not end in
its exact target. The deployment script derives domains, static-site branches,
identity credential selection, and backup labels from the selected target; these are
not operator-entered variables.

The infrastructure workflow rejects non-amd64 images, undersized volumes, and invalid
explicit CIDRs. An empty `SSH_ALLOWED_CIDRS` selects public dual-stack SSH so operators
with dynamic addresses, including a phone, can connect. When the VPN is ready, set it
to only the VPN's IPv4/IPv6 networks and review the Pulumi firewall diff before applying
it.

`DEPLOYMENT_ENVIRONMENT_PREFIX` and `DEPLOYMENT_TARGETS_JSON` are repository variables,
not Environment variables. The first names the active infrastructure generation; the
second is a JSON array containing its prepared targets. Infrastructure and deployment
workflows reject an unprepared target, and scheduled operations build their matrix from
that array. The bootstrap changes the prefix only after the selected Environment set is
complete.

## Recovery escrow

The bootstrap writes an owner-only password-manager CSV with `Group`, `Title`, `Username`,
`Password`, `URL`, and `Notes` columns. Groups contain both the deployment prefix and the
owning scope: `bootstrap`, `shared`, `identity`, `next`, or `production`. It contains:

- the deployment namespace and offline storage administrator;
- the GitHub Packages reader;
- each target's deployment and observer storage credentials;
- its `PULUMI_CONFIG_PASSPHRASE`;
- its `BACKUP_RESTIC_PASSWORD`;
- the provider tokens, SMTP URLs, and RedPill key entered once during bootstrap;
- the United Domains API key used for exact `aven.id` address reconciliation;
- the Polar webhook endpoints and signing secrets created or reconciled by bootstrap;
- exact state and backup bucket names and namespaced GitHub Environments; and
- the deployed revision, GitHub workflow runs, public service origins, verification time,
  and exact `aven.id` A and AAAA records produced during the initial rollout.

The last entries are operational records rather than secrets, but they belong in the same
import so the password-manager record is the complete handoff after setup. The guided
bootstrap rewrites the owner-only CSV whenever a run ID or DNS value first becomes known;
an interruption therefore preserves manual work still required from the operator.

Import the CSV, verify that password-manager account recovery exposes the complete record,
then remove the local copy as described in
[Initial provisioning](initial-provisioning.md). Add an independent recovery holder when
another operator becomes available.

The identity GitHub Environment references the read-only variants of the two platform
state credentials during deployment. Keep the authoritative backend credential and
passphrase with each target's recovery record; do not create drifting copies in the
handbook.

The record must outlive GitHub, individual laptops, and both servers. Quarterly, verify
that it remains reachable through the password manager's recovery path without copying
values into chat, a ticket, shell history, or this handbook. When an independent recovery
holder exists, include them in that check.

The [guided uninstall](initial-provisioning.md#uninstall-a-saved-generation) uses this local
record to identify one exact infrastructure generation. It removes generated remote
resources and the exact saved `aven.id` address records, but it does not revoke
provider-issued Cloud, DNS, S3, Polar, SMTP, RedPill, United Domains, or GitHub credentials.
After teardown, either retain those inputs for a fresh generation or revoke them at their
providers. Never assume deleting a GitHub Environment revoked the underlying provider
credential.

## Generated access roles

Each host receives separate Pulumi-generated Ed25519 identities:

- admin: an interactive `aven-admin` shell with passwordless sudo for emergency and
  manual service administration;
- deploy: invokes only the fixed deploy or fresh-target restore wrapper;
- observe: reads fixed-scope Compose status, recent logs, disk, and backup state;
- tunnel: forwards only to `127.0.0.1:5432`; and
- host: pins the server identity without `ssh-keyscan` or interactive trust.

Automated tools retrieve their keys from encrypted state into a temporary mode-`0600`
directory and remove them on exit. To install an administrative identity in a phone's
SSH client, retrieve the appropriate `identityAdminPrivateKey` or
`platformAdminPrivateKey` secret from the Pulumi stack on a trusted workstation and
import it directly into the phone's protected key store. Do not send it through chat,
email, or shared cloud storage. Connect as `aven-admin` to the host's Pulumi output
address. Password login and direct root login remain disabled, and fail2ban remains
enabled even while port 22 is public.

The observation and database-tunnel tools set OpenSSH `IdentitiesOnly`, so keys loaded in
the workstation agent are not offered before the Pulumi-generated role key.

The host-key files are written in cloud-init's deferred final stage, after the operating
system's SSH module has generated its defaults. Deployment then accepts the host only
when its presented Ed25519 key equals Pulumi's public output and the cloud-init completion
marker exists. Secret stack outputs are captured directly into owner-only temporary files
or shell variables; they must never be printed as log-masking commands.

The database tunnel is transport only. SQL inspection also requires a separately
issued, time-bounded, read-only database role; automatic diagnostic-role issuance is
not implemented yet.

## Rotation

Identity's automatically derived security-mail relay keys rotate with the corresponding
platform provisioning secrets; they are not new manually collected credentials. Keep
the identity mail-origin list aligned with those secrets. Before rotating
`BETTER_AUTH_SECRET`, drain pending replacement-link messages: their temporary identity
outbox payloads use a purpose-derived encryption key. Ordinary link-use/registration
notices contain no bearer token. See [pending enrollment](../../services/identity/README.md#pending-enrollment).

- Start `bun run bootstrap:deployment:guided`, choose **Review or rotate credentials**,
  and select the affected secret-bearing stations. The wizard verifies replacements before
  saving them, updates policies and GitHub Environments once, and deploys once to activate
  the complete set.
- Keep each old provider credential active until the deployment and public verification
  succeed. Then revoke it at the provider and rerun the credential preflight. The setup
  cannot revoke a credential whose provider created and identified it outside the saved
  input.
- A fresh bootstrap generation creates new Pulumi passphrases, Restic passwords, SSH keys,
  database passwords, signing keys, and workload tokens. Use the full uninstall-and-install
  lifecycle when every generated secret must change. With enough server quota, prepare and
  verify the replacement before removing the old generation; otherwise plan the documented
  downtime and restore path.
- Rotate generated infrastructure material through Pulumi, review replacements, and
  redeploy. Do not edit host `.env` files.
- Rotate database function roots in stages so reconciliation proves new grants before
  old pools drain.
- Publish old and new mobile association fingerprints together before retiring the old
  certificate.

After any suspected disclosure, rotate the smallest affected credential and preserve
the incident timeline.
