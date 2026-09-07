# Aven email templates

The emails in this directory are ordinary Maizzle Vue templates. They compile
to email-safe HTML with inline CSS and a plaintext alternative, while checkout
keeps its typed, synchronous rendering contract.

`identity-security-email` uses the same branded frame for setup-link use, first-passkey
registration and replacement-link delivery. Security-event producers choose a fixed
message and an identity-origin action URL; they cannot supply arbitrary HTML. Purchase
setup copy states the seven-day expiry. These messages do not introduce another login method.

## Quick start

From the repository root:

```sh
bun run email:studio
```

Open the URL printed in the terminal. The studio lets you:

- edit the subject, preview fixture, and Vue source;
- preview HTML or plaintext at desktop and mobile widths;
- update the preview automatically after a 500 ms typing pause;
- switch the preview canvas between light and dark;
- validate, save, and compile with one action.

`Ctrl+S` or `Cmd+S` also runs **Save and compile**. Saved files are overwritten
locally on purpose; use the Git diff to review or undo changes.

## Directory layout

```text
email-templates/
├── components/
│   └── AvenEmail.vue              shared frame, branding, and footer
├── purchase-link-email.vue        purchase-link email source
├── purchase-link-email.json       subject and preview fixture
├── purchase-completed-email.vue   purchase-completed email source
├── purchase-completed-email.json  subject and preview fixture
├── identity-security-email.vue    setup and passkey security messages
└── identity-security-email.json   subject and preview fixture
```

The JSON files are development metadata. They contain a subject and realistic
but non-sensitive fixture values:

```json
{
  "subject": "Checkout link for {{name}}",
  "fixture": {
    "name": "aurora",
    "claimUrl": "https://portal.aven.ceo/purchase/checkout?claim=designer-example",
    "expiresAt": "Friday, 21 August 2026 at 23:59 UTC"
  }
}
```

Subject placeholders use `{{field}}`. Template values are available through
Maizzle's config inside a Vue template:

```vue
<script setup lang="ts">
const { email } = useConfig()
</script>

<template>
  <Text>Hello {{ email.name }}</Text>
</template>
```

Fixture fields and subject placeholders must exactly match the template's typed
data contract in `src/lib/server/email/template-contract.ts`. The studio rejects
unknown or missing fields, malformed placeholders, multiline subjects, invalid
JSON, and templates that Maizzle cannot render.

## Commands

All commands work at the repository root. They also work from
`services/checkout`.

| Command | Purpose |
| --- | --- |
| `bun run email:studio` | Start the write-back editor on `127.0.0.1:4176` |
| `bun run email:preview` | Start Maizzle's native development preview |
| `bun run email:compile` | Regenerate the production template artifact |
| `bun run email:check` | Fail if the generated artifact is stale |

`bun run test:checkout` and `bun run build:checkout` include the freshness check.

## How production rendering works

Maizzle is a development and build dependency only. Compilation writes
`src/lib/server/email/templates.generated.ts`, which contains the final inline
HTML and plaintext variants. The email worker imports that artifact and performs
a small, synchronous token substitution at send time.

Runtime values are HTML-escaped before insertion into HTML, and line breaks are
removed from values inserted into subjects. Conditional visible states, such as
the purchase-completed email with or without an access URL, are compiled as
separate variants so production does not need Vue or Maizzle.

Do not edit `templates.generated.ts` by hand. Edit this directory and compile.

## Adding a template

Adding a new email intentionally touches the typed boundary as well as its
design:

1. Add its key and payload shape to
   `src/lib/server/email/template-contract.ts`.
2. Add a multi-word `.vue` filename and matching `.json` metadata file here.
3. Add the filename and label to the catalog in `tools/email/compiler.ts`.
4. Define additional compiled variants there if the template has conditional
   visible states.
5. Add the new template to the runtime variant selection and tests.
6. Run `bun run email:compile`, then `bun run test:checkout` from the repository root.

Keeping the catalog explicit prevents the local editor from reading or writing
arbitrary files.

## Troubleshooting

- **Generated templates are stale:** run `bun run email:compile` and commit the
  generated TypeScript file with the source changes.
- **Fixture contract error:** make the JSON fixture keys exactly match the
  fields declared for that template.
- **Preview reports invalid input:** finish the JSON or Vue expression you are
  typing and the debounced live preview will retry, or use **Preview now**.
- **Port already in use:** run
  `bun run email:studio --port=4180` with another loopback port.

For template syntax and supported components, see the Maizzle documentation for
[Vue templates](https://maizzle.com/docs/development/templates),
[components](https://maizzle.com/docs/components/overview), and
[local development](https://maizzle.com/docs/development/local).
