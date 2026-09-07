# Initial provisioning

Status: authoritative

One local setup command creates the recoverable storage foundation, configures GitHub,
provisions the selected infrastructure, and deploys the first installation. Selecting all
three targets leaves shared identity, `next`, and production running. It generates a fresh
namespace, so it can prepare a replacement installation without colliding with an existing
set of GitHub Environments.

The provider credentials remain the manual floor. [Hetzner exposes S3 credential
creation only through its Console](https://docs.hetzner.com/storage/object-storage/faq/general/#is-object-storage-exclusively-managed-via-the-hetzner-s3-api),
and an API token cannot safely create its own replacement. The guided bootstrap prints
each selected project path, gives each credential its exact description, and securely
asks for the one-time result before it continues. Do not hand-create buckets, GitHub
Environments, products, model entries, passwords, SSH keys, database roles, or service
credentials.

## What the bootstrap creates

For each selected target, one run creates:

- a random deployment namespace such as `avenos-4f7c2a91b6`;
- one repository-level GitHub Packages reader used only for dependency downloads;
- one versioned, private Pulumi state bucket;
- one versioned, private Restic backup bucket;
- bucket policies that isolate each target and keep observer credentials read-only;
- a raw Polar webhook endpoint when the target is `next` or `production`, subscribed to
  every event;
- avenNAME, avenCEO, and their visible benefits from the published pricing manifest in
  each selected Polar organization;
- a deployment and operations GitHub Environment with variables, encrypted secrets,
  protected-branch policy, and optional deployment review;
- one deployment Pulumi passphrase, Restic password, and isolated storage-bootstrap
  passphrase per selected target;
- validation of the current Phala-hosted RedPill chat catalog when a platform target is selected; and
- an owner-only CSV that common password managers can import.

Identity, `next`, and production each use a different Object Storage project. Each project
has an offline bootstrap administrator, a deployment credential that writes only that
target's state and backup buckets, and an observer credential that reads only its state.
The identity deployment receives the `next` and production observer credentials because
it must assemble their generated identity caller tokens. No storage administrator or
deployment credential crosses a project boundary.

## Prepare the provider accounts

The first rollout runs reviewed code from protected release branches, not arbitrary
workstation changes. Complete [release promotion](deployment.md#promote-release-branches)
first. The local checkout must match `prod`; `next` and `prod` must contain the same
source tree. The wizard builds on next and deploys through prod. This prevents setup
from executing a development ref with identity or production secrets.

Install and authenticate these command-line tools on the operator workstation:

```sh
gh auth login
pulumi version
gh auth status
```

The GitHub account needs repository administration. One account can bootstrap and operate
the installation. The example input omits `reviewer`, so infrastructure and deployment
runs require an explicit manual dispatch but no second-person approval.

Create one classic GitHub personal access token named `avenOS GitHub Packages reader`
with `read:packages` and no write scope. The wizard verifies that it can download both
cross-repository `@myavenceo` packages, saves it as the repository secret
`PACKAGE_READ_TOKEN`, and includes it in the recovery CSV. GitHub's per-workflow token
still publishes this repository's images; the long-lived reader cannot publish them.
Bootstrap also configures that read-only token for Dependabot, installs the release
branch rules, and removes the former automatic-promotion `DEPLOY_KEY`. These shared
repository protections survive generation uninstall.

When another operator becomes available, add their GitHub login as the optional top-level
`reviewer` field beside `repository`. The bootstrap then requires that person to approve
deployment Environments and prevents the initiating account from approving its own run.

The wizard asks only for values needed by the checked targets. A runnable first product
installation needs all three; a partial selection intentionally prepares only that part
of the recoverable foundation. At the providers, create these values when their target
appears:

1. Create the GitHub Packages reader described above.
2. Create separate Hetzner projects named `avenOS identity`, `avenOS next`, and
   `avenOS production`, and record their numeric IDs. In each project, generate an offline
   bootstrap administrator, a deployment credential, and an observer credential. The
   wizard deep-links to that project's S3 credential page and supplies the exact
   description. Hetzner shows each of these nine secrets only once, so keep its result
   dialog open until the wizard accepts both values on the same screen.
3. Identify the one Hetzner project that contains the `aven.ceo` DNS zone and record its
   numeric project ID. It may be one of the three projects above or a separate project.
4. Create separate Hetzner compute write tokens named `avenOS identity deployment`,
   `avenOS next deployment`, and `avenOS production deployment`.
5. In that one DNS project, create separate Hetzner DNS write tokens named
   `avenOS next DNS deployment` and `avenOS production DNS deployment`. Both manage the
   shared `aven.ceo` zone, while their credentials and GitHub Environments remain separate.
   `aven.id` stays outside Hetzner DNS.
6. In United Domains, create a writable DNS API key named
   `avenOS identity DNS deployment`. The setup uses it only to read the `aven.id` zone and
   replace its apex A and AAAA record sets. It stores the key in the recovery CSV and
   removes only the saved installation addresses during uninstall.
7. In Polar sandbox and production, create organization API keys named
   `avenOS next billing` and `avenOS production billing`. These backend tokens are used
   by both provisioning and the checkout service. Select only `organizations:read`,
   `products:write`, `benefits:write`, `meters:write`, `checkouts:write`,
   `subscriptions:write`, `customers:read`, `orders:read`, and `webhooks:write`. Their
   expiration must cover production use and planned rotation. The bootstrap creates or
   reconciles the endpoint and captures its signing secret.
8. Create send-only SMTP credentials named `avenOS next SMTP` and
   `avenOS production SMTP` when the provider supports names.
9. Fund the RedPill account and create an active API key named `avenOS chat bootstrap`.
   One key may serve both platform targets; the API facade keeps it server-side.

Product creation is not a provider prerequisite. The bootstrap applies the published
`@myavenceo/aven-ceo/pricing` manifest as soon as it has verified each Polar key and
creates or corrects avenNAME, avenCEO, and their benefits. Every checkout deployment
repeats the same idempotent convergence before checkout becomes ready.

## Run the guided bootstrap

From the repository root, run:

```sh
bun run bootstrap:deployment:guided
```

The first screen checks one or more targets. That choice removes every irrelevant page and
recalculates the actionable step count and setup tree before data collection begins. The
wizard then opens a target-specific checklist and divides the setup into named chapters:
GitHub, Hetzner, Polar, Email, AI models, client release, infrastructure defaults, and
review. Hetzner has one subchapter per deployment project plus the shared DNS project;
Polar has one per organization; and Email has one per sending environment. It checks `gh`
authentication and repository administration, generates the persistent deployment prefix,
then creates an owner-only
draft under `$HOME/avenos-bootstrap-record`. It prints the exact target project URL and
labels the exact value to enter in Hetzner's S3 **Description** field. Access keys and
secret keys share one form; provider tokens, SMTP URLs, and the RedPill key use hidden
fields. The wizard refuses to place its record inside the repository, and every bootstrap
artifact name is also ignored by Git as a second line of defense. The draft and
`credentials.csv` are
rewritten atomically with mode `0600` after every answer, so an interruption cannot lose a
one-time secret.

The default interface is a full-screen, curses-style form that runs entirely through Bun;
it does not require a native ncurses library or a separately installed `dialog` command.
Each screen identifies its chapter and puts the current credential or setting in a
high-contrast title band. Provider-side names and S3 descriptions are repeated as bold
instruction lines so they can be copied without confusing them with the surrounding purpose
text. Screens that need an answer also show their position among the
actionable steps; introductory pages and automatic checks do not inflate that count. On a
wide terminal, a setup tree on the right groups compact item names below their chapter and
subchapter, highlights the current path, and uses top or bottom ellipses when the route does
not fit. Hetzner is grouped by project; Polar by organization; and Email by sending
environment. Narrow terminals keep the same form without the tree.

Use Tab or the arrow keys to move between fields and the Back/Next buttons, Enter to select,
and Ctrl+C or Escape to cancel. An S3 access key and secret key share one form and one
station: Enter moves from the first field to the second and then submits the pair. Color
distinguishes headings, verified values, and errors; all meaning is also present in text.
A valid provider check reports useful identity such as the project, region, zone,
organization, or model count in a compact evidence area belonging only to the current
chapter. Evidence never leaks into unrelated chapters, repeated evidence collapses, and
only the three latest facts remain visible. An invalid value replaces the local feedback
and remains on its screen so it can be edited. The wizard never asks the operator to type
`continue`, `retry`, or similar control words during ordinary data collection.

After an answer is submitted, a small animated progress chip immediately replaces the
form while GitHub, Hetzner, Polar, RedPill, plan validation, or provider application is
running. During the final apply, the screen shows the current numbered provider operation,
its detail, elapsed time, and recent completed operations. The owner-only
`bootstrap-apply.log` keeps redacted command diagnostics for a failed retry. Local command
checks time out with a retryable error instead of leaving a stale button on screen.

The bootstrap does not ask the infrastructure provider to create its own state and backup
buckets. It sends a signed S3 `PUT` for each deterministic, private bucket, confirms the
exact name with a separately signed read, and then imports both buckets into Pulumi in one
update. Pulumi owns their access policies and state versioning from that point onward. This
order avoids relying on a provider create result before the state backend itself exists.

A process interruption follows the same sequence when the saved setup resumes. An existing
exact bucket is not created again; it is independently confirmed and included in the next
Pulumi import. Only this generation's two derived names can enter the path. The setup never
lists, guesses, or adopts an unrelated bucket name.

Hetzner can acknowledge the signed create before a signed read sees the new bucket, and its
infrastructure provider can lag behind the signed read during import. Signed visibility can
also briefly disappear again while the provider converges. Each exact mismatch has a bounded
retry window with increasing delays. The progress line names the target, bucket kind, delay,
and retry count. Once this run has created or independently confirmed both exact names, a
transient negative read cannot turn either one back into a provider create. Both remain in
the same atomic Pulumi import until it succeeds or the bounded retry window ends. A different
name, permission failure, or unrelated provider error still stops immediately.

After the import, Pulumi moves the local bootstrap checkpoint into the new state bucket.
That backend can encounter the same short `NoSuchBucket` window even after provider import
succeeds. Login, select-or-create, and checkpoint import therefore run as one idempotent,
bounded retry. A partially created remote stack is selected on the next attempt. Permission,
passphrase, and other backend failures are not retried as visibility lag, and the local
checkpoint remains available until the remote marker is written after a successful import.
If the local checkpoint already contains the provider, both buckets, versioning, and both
policies with no pending operation or initialization error, resume skips the completed
provider update and continues at this migration boundary.

The initial infrastructure run applies the same adoption rule to public `aven.ceo` DNS.
Before each platform update, it lists the six exact A and AAAA record sets owned by that
environment. Existing matching sets are imported into the current Pulumi stack and then
updated to the new host addresses. A stale CNAME at one of those exact names is removed
because it cannot coexist with the required address records. Unrelated records in the zone
are left untouched. This makes a fresh generation and a resumed installation follow the
same path without asking the operator to remove old platform addresses manually.

On a terminal smaller than 60 columns by 20 rows it automatically uses the accessible
plain wizard. Force that mode in any terminal with:

```sh
bun run bootstrap:deployment:guided -- --plain
```

When the output directory contains one or both owner-only credential CSV files plus their
machine-readable input and generated-secret companions, startup offers **Resume**,
**Review or rotate credentials**, **Uninstall**, or **Exit**. Resume first reopens the saved target selection, then rechecks every saved,
testable credential with read-only provider calls. The current credential and check count
remain visible. A rejected credential opens its own station immediately so it can be
replaced before Apply; otherwise the latest relevant saved station opens. Exit leaves every
file untouched. A CSV without both companion files is preserved and produces a clear error
instead of being overwritten or partially reconstructed.

**Review or rotate credentials** shows only secret-bearing stations for the selected
targets. Replace one or several values, verify each replacement, then apply once. The setup
updates bucket policies and GitHub Environments and performs one deployment so the running
services receive the complete rotated set. Keep the old provider credentials active until
that deployment and public verification succeed, then revoke them at their providers.

Pulumi also writes ignored `Pulumi.<stack>.yaml` files beside the bootstrap program. Their
encryption salt belongs to one generated passphrase and backend, so a retained checkout can
outlive or switch away from the generation that created one. Before opening a backend, the
bootstrap removes only a salt-only stack file, lists that backend, then selects the existing
stack or initializes a fresh one with the saved generation's passphrase. Pulumi keeps an
existing stack's encryption metadata in its checkpoint. A file containing any Pulumi
settings is preserved and reported as an error for operator review. This makes uninstall
followed by reuse, an interrupted first apply, and switching between saved generations in
the same checkout follow the same safe path.

On a fresh run, the wizard starts at the first field. A saved non-secret value is shown and
can be edited; a saved secret remains hidden and an empty field keeps and rechecks it. A
failed provider-bootstrap or interrupted run ends with `ERROR`. Its cleanup screen requires
one exact typed choice: enter `keep` or `delete`, with no default. Deletion
covers the CSV, resumable input, generated secrets, encrypted bootstrap-state copies and markers, the
local Pulumi backend, and any completed recovery CSV. The prompt warns that deletion
prevents resume and can strand resources if provider changes were already applied. Keeping
them prints the preserved CSV path. When a provider returned a concise error, the recovery
screen shows that redacted response as well as the diagnostic-log path. A completed run
ends with `SUCCESS` and the same path.
Generated values join the same file as soon as they exist; manually entered provider
values are present throughout. During the initial rollout this includes each GitHub run,
the deployed Git revision, exact state and backup bucket names, public service origins,
and the `aven.id` A and AAAA records. The DNS values are saved before the installer
publishes them, so an interruption does not lose the exact reconciliation target.

The CSV uses the common `Group`, `Title`, `Username`, `Password`, `URL`, and `Notes`
fields. Groups include the deployment prefix and scope, for example
`avenOS/avenos-4f7c2a91b6/next`, so multiple infrastructure generations can coexist in a
password manager. Each title names the credential role, each URL points to its provider,
and each note records its scope and purpose. The CSV is plaintext despite its owner-only
permissions; import it into the password manager and remove the local copy after
verification.

The wizard verifies credentials before moving to the next provider. Signed, read-only S3
requests confirm each Object Storage pair in its target project and report the region and
visible bucket count.
Compute tokens report the number of servers visible in their Cloud project. DNS tokens
must resolve the exact `aven.ceo` zone and report its provider ID. Each Polar pair reports
the organization name, slug, ID, and current product and webhook counts. The authenticated
RedPill catalog reports the number of Phala-hosted models and a few names. Failed checks
stay on the current form; correct its value or pair, go Back, or cancel the run.

SMTP URLs receive strict parsing. The wizard authenticates to their host and transport
without sending mail, then reports the verified endpoint.

To recheck the complete saved credential set without changing provider state or opening
the full-screen wizard, run:

```sh
bun run bootstrap:deployment:preflight -- \
  --input "$HOME/avenos-bootstrap-record/bootstrap-input.json"
```

The command checks GitHub login and administration, private packages, every selected
Hetzner Cloud and Object Storage credential, both DNS providers, Polar catalog and webhook
access, SMTP authentication without sending, and the live Phala model catalog. It prints
identity evidence such as project bucket counts, zone IDs, and Polar organization names,
but redacts credential values. Run it before retrying a failed initial rollout and after
revoking superseded credentials.
After applying the documented infrastructure defaults, the wizard shows the dry-run
result. Select **Apply now** on the review screen to create the buckets, Polar endpoints
and manifest products, generated secrets, and GitHub configuration, then provision and
deploy the selected full topology. Select **Stop after validation** to leave provider
state unchanged. It never prints a secret or passes one in a command argument.

The bootstrap stores the checked targets in `deploymentTargets`. Rerunning the same saved
generation may check a different combination; previously entered one-time credentials
remain in the owner-only files. A fresh complete installation still needs all three targets.
When a target is added later, the bootstrap also refreshes previously prepared GitHub
Environments so cross-target read-only state references remain complete. It does not rerun
their storage or external-provider changes.

After the provider bootstrap, the same process dispatches one combined infrastructure
preview and one combined apply. Protected Pulumi resources reject destructive replacement.
The setup then replaces the exact apex A and AAAA record sets for `aven.id` through United
Domains and waits until public DNS returns those values. Finally, it runs the complete release gate once, publishes
each image once, deploys `identity`, `next`, and production in order, and checks all seven
public readiness endpoints. Successful GitHub run IDs, the DNS handoff, and final
verification time are stored in the owner-only generated record and mirrored into
`credentials.csv`, so rerunning resumes instead of repeating completed stages and the
password-manager import remains the complete operator handoff. `initial-rollout.log`
records only stage names, status, and GitHub run URLs; it contains no credential values.

If a GitHub infrastructure or deployment run fails, the wizard reads its failed-step log,
redacts known secrets, and puts the concise provider reason directly on the recovery
screen. Enter exactly `retry`, `keep`, or `delete`; no option is selected by default.
Correct the external issue before choosing `retry`. The wizard first checks the saved run
and Pulumi checkpoint, reuses successful work, and dispatches only the first failed stage.
`keep` stops with every recovery artifact intact for a later resume. `delete` removes those
artifacts and prevents resume.

A common first-installation repair is an obsolete DNS record. Hetzner rejects an A or
AAAA record when a CNAME still owns the same name. The recovery screen identifies the
exact names and types, for example `next CNAME blocks A and AAAA`. Remove the obsolete
CNAME at the authoritative `aven.ceo` provider, return to the still-open wizard, and enter
`retry`. Pulumi then creates and owns the required records; the conflict does not require
a fresh bootstrap generation.

## Uninstall a saved generation

Use the same guided command when a test installation must be removed completely:

```sh
bun run bootstrap:deployment:guided
```

Choose **Uninstall** on the saved-setup screen. The wizard prints the exact generation,
targets, GitHub Environments, and destructive order. No deletion begins until the operator
types `uninstall <deployment-prefix>` exactly; there is no default or shortened answer.
Type `back` on that confirmation screen to return without changing provider state.

The teardown is bounded by the saved record. It removes resources in dependency order:

1. production, `next`, and identity Pulumi stacks in reverse order, including servers,
   volumes, firewalls, generated SSH material and secrets, and Pulumi-managed `aven.ceo`
   DNS;
2. the saved Polar webhook endpoints and the exact SSOT catalog identified by its metadata;
   Polar products and meters are archived where the provider retains them, benefits are
   removed, and financial history remains subject to Polar retention;
3. the exact saved `aven.id` A and AAAA addresses through United Domains;
4. the generation's GitHub Environments and, only when this generation is still active,
   its repository deployment variables and package-reader secret; and
5. versioned Pulumi state and Restic backup buckets last. For each target, the command
   probes the two exact generation-bound names and reconstructs only the minimal local
   ownership needed to delete the buckets that actually exist.

Pulumi protections and Hetzner provider deletion locks remain enabled during normal
operation. The uninstall process disables them only for exact resource URNs already present
in the saved stacks. It does not expose a destroy input in a GitHub workflow.

Storage teardown does not trust an old bootstrap checkpoint as proof of deletion. It imports
each exact existing bucket into a dedicated owner-only teardown stack, enables version-aware
deletion, and verifies that both signed bucket probes return not found before reporting the
target complete. This also covers a partial install in which either bucket exists without
ever reaching a Pulumi checkpoint.

If a provider call fails, the screen shows the redacted reason and `uninstall.log`. Correct
the issue and type `retry`; completed stages are detected and skipped. Type `keep` to stop
with the local teardown state intact. Do not delete the record while remote resources
remain, because it contains the exact namespace and credentials needed to finish safely.
Before deleting infrastructure, the command also refuses to continue while a platform
workflow is active, another GitHub generation is selected, or an SSOT Polar product has an
active subscription. Cancel or revoke a remaining subscription only after handling its
customer, billing, and retention consequences, then retry.

After success, choose one exact local cleanup action with no default:

- `reuse` keeps only `bootstrap-input.json`, which contains the manually supplied provider
  credentials, and removes generated secrets, CSVs, logs, state copies, and markers. The
  next guided run creates a new deployment prefix and revalidates the retained input.
- `delete` removes the complete local bootstrap record.

The setup did not create the Hetzner Cloud or S3 credentials, Polar API keys, SMTP
credentials, RedPill key, GitHub personal token, or United Domains API key. It does not
revoke them. Reuse or revoke provider credentials according to the next installation and
the provider's own access review. The exact saved `aven.id` A and AAAA addresses have
already been removed.

To resume or reconcile the same infrastructure generation, run the same command again.
To use a different owner-only location:

```sh
bun run bootstrap:deployment:guided -- \
  --output "$HOME/another-owner-only-directory"
```

Do not place the output directory inside the repository.

## Non-interactive input alternative

From the repository root, copy the template outside the checkout and restrict it before
adding values:

```sh
install -m 600 infrastructure/bootstrap/bootstrap-input.example.json \
  "$HOME/avenos-bootstrap-input.json"
```

Set `deploymentTargets` to any non-empty combination of `identity`, `next`, and
`production`, then remove unselected target sections. Replace every remaining `PASTE_...`
value. Keep `sshAllowedCidrs` at `0.0.0.0/0,::/0` when using
GitHub-hosted runners; their outbound addresses change between runs. SSH still accepts
only Pulumi-generated Ed25519 role keys, disables passwords and root login, and binds each
role to a fixed command or tunnel. Narrow the CIDRs only after providing a stable
self-hosted runner or VPN path, or later deployments will fail before software reaches the
host.

Do not put the input in the repository, chat, a ticket, or shell arguments.

## Validate a non-interactive input without changing providers

Choose a new empty owner-only output directory:

```sh
install -d -m 700 "$HOME/avenos-bootstrap-record"
bun run bootstrap:deployment -- \
  --input "$HOME/avenos-bootstrap-input.json" \
  --output "$HOME/avenos-bootstrap-record" \
  --dry-run
```

The dry run validates the input, generates the persistent namespace and passwords, and
checks the live RedPill catalog. It does not create buckets, Polar endpoints, the recovery
CSV, or GitHub configuration because the final CSV must contain the provider-generated
webhook signing secrets.

## Apply a non-interactive bootstrap

Run the same command without `--dry-run`:

```sh
bun run bootstrap:deployment -- \
  --input "$HOME/avenos-bootstrap-input.json" \
  --output "$HOME/avenos-bootstrap-record"
```

Pulumi creates each selected target's two buckets through that target project's S3
interface, stores independently encrypted bootstrap state in the corresponding state
buckets, and applies the isolation policies. The command then creates or reconciles one
raw, all-event Polar endpoint for each selected platform, captures its signing secret,
applies the product and benefit manifest, and writes the recovery CSV. Finally, it creates and fills two GitHub
Environments per selected target. It records the cumulative prepared target list in
`DEPLOYMENT_TARGETS_JSON`, so scheduled monitoring ignores targets that do not exist.
Secrets enter `gh` over standard input, not command arguments. As its last
remote action, it sets the repository variable
`DEPLOYMENT_ENVIRONMENT_PREFIX` to the new namespace. Until that final switch, the new
Environments are inert. Every infrastructure, deployment, and operations workflow rejects
a missing or malformed namespace before it resolves an Environment; scheduled monitoring
stays dormant before the first activation.

If the command stops partway through, run it again with the same input and output paths.
The generated file preserves the namespace and passwords. Do not start over with a new
output directory unless you intentionally want another infrastructure generation.

## Escrow and verify

The output directory contains:

| File | Purpose |
| --- | --- |
| `credentials.csv` | Guided-bootstrap progress and complete password-manager handoff using common entry fields |
| `avenos-recovery.csv` | Equivalent final CSV produced only by the non-interactive bootstrap |
| `bootstrap-input.json` | Owner-only resumable input created by the guided bootstrap |
| `bootstrap.generated.json` | Repeatable generated inputs and Polar endpoint records |
| `bootstrap-state-<target>.json` | Encrypted Pulumi state migration copy for one storage project |
| `bootstrap.<target>.remote` | Verified remote-backend marker for one storage project |
| `pulumi-state/` | Initial local backend retained until remote state is verified |
| `bootstrap-apply.log` | Owner-only redacted activity and command diagnostics from the latest apply |
| `uninstall.log` | Owner-only redacted activity and command diagnostics from the latest teardown attempt |
| `uninstall-pulumi-state/` | Owner-only temporary backend used so state and backup buckets can be deleted last and retries remain possible |
| `uninstall-platform-<target>.json` | Encrypted platform stack checkpoint used to select exact provider-lock changes |
| `uninstall-bootstrap-<target>.json` | Encrypted minimal teardown checkpoint containing only exact generation-bound storage ownership |
| `initial-rollout.log` | Owner-only stage status and GitHub run URLs for resumable first deployment |

Import `credentials.csv` from a guided run, or `avenos-recovery.csv` from the
non-interactive path, into a password manager whose account recovery you have tested. Map
the six named columns directly when its CSV importer asks. Locate the namespace, all
provider credentials, the three Pulumi passphrases, and the three Restic passwords from
the imported record. Also locate the storage bucket names, GitHub run references, deployed
revision, public origins, and exact `aven.id` A and AAAA records. Confirm that the
bootstrap stack selects from the remote backend.
Then securely remove the local input and output directory. The password manager and remote
encrypted state become the recovery sources.

When a second operator becomes available, grant them recovery access and ask them to
locate the same record. This improves continuity but does not block a solo installation.

## Finish the first installation

Do not dispatch another workflow after a successful complete setup. The guided command
already provisions and deploys the full topology, including both DNS providers. A
successful run ends with:

```text
SUCCESS: the first avenOS installation for avenos-… is running.
```

Use [Deployment](deployment.md#deploy-an-update) for later updates. The manual
infrastructure and deployment workflow sections remain the repair and operator-controlled
paths when one stage must be rerun independently.

Every platform deployment fetches and validates the current Phala-hosted RedPill catalog
before changing the host, then applies the Polar product manifest idempotently. Run the
bootstrap again only for a new infrastructure
generation, credential-boundary change, or disaster recovery.
