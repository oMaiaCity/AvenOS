# Aven Checkout (`portal.aven.ceo`)

This is the dedicated purchase and billing web application. It owns commerce state,
provider integration, name purchase state, and delivery workers. Signup, sessions,
authorization tokens, and every passkey ceremony live only at `aven.id`.

Checkout stores the stable identity subject needed to associate commerce records with
a customer. It never stores customer domain data and never chooses a physical customer
database. A committed purchase or revocation writes the platform-event outbox in the
same transaction; the narrow worker delivers that lifecycle fact idempotently to
`api.aven.ceo`, which owns environment policy and provisioning.

Every signature-verified Polar call is archived before domain processing in
`polar_webhook_deliveries`, with its JSON payload, selected transport headers, event
identity/type, receive time, processing state, retry count, and bounded error. Unknown
event types are retained and marked processed. Invalid signatures are rejected before
storage so arbitrary Internet traffic cannot become trusted Polar history. Reusing a
delivery ID with different content is a conflict; exact processed replays are harmless.

The production database identities are deliberately separate:

- `aven_checkout_http` — browser/API checkout operations;
- `aven_checkout_webhooks` — raw verified webhook inbox and provider transitions;
- `aven_checkout_email` — email outbox claims/acknowledgements;
- `aven_checkout_platform_events` — platform-event outbox claims/acknowledgements; and
- `aven_checkout_migrator` — one-shot DDL.

## Commands

From the repository root:

```sh
bun run check:checkout
bun run test:checkout
bun run build:checkout
bun run test:e2e:platform
```

Email templates live in `email-templates/`. Use `bun run email:studio` to edit them and
`bun run email:check` to verify that generated HTML/plaintext artifacts are current.

For the complete local split stack, including fake payment callbacks, passkeys,
customer provisioning, Intent, and Actor, use the
[local full-stack guide](../../docs/operations/local-stack.md). Shared deployment is
defined by the [operations handbook](../../docs/operations/deployment.md); do not
resurrect the old checkout-owned environment worker, Artifact Store overlay, shared
Intent database, or monolithic local Compose topology.
