# Run the full stack locally

Status: authoritative

This path runs identity, checkout, the facade, both central databases, the customer
provisioner, Artifact Store, Intent Service, Actor Runner, workers, Mailpit, and the
Rust/Tauri client on one workstation. The default calls no deployed Aven service,
payment provider, SMTP server, or LLM provider. It uses a deterministic chat mock;
you can replace that mock with an OpenAI-compatible model server on the workstation or
trusted local network.

## Prerequisites

Complete [workstation setup](workstation-setup.md). Docker must be running and
`NODE_AUTH_TOKEN` must be available either in the shell or the user-level
`~/.npmrc`.

## Start the server stack

From the repository root:

```sh
bun run local:up
```

The command builds local service images, generates a disposable tenant signing key,
starts the topology, waits for health, and prints these endpoints:

| Surface | URL |
| --- | --- |
| Identity | `http://localhost:13100` |
| Checkout | `http://localhost:13200` |
| Facade | `http://localhost:13000` |
| Mailpit | `http://localhost:18025` |

WebAuthn uses the browser secure-context exception for the exact `localhost` origin and
RP ID. Do not replace `localhost` with `127.0.0.1` while enrolling the passkey.

## Use LM Studio or another local model

The desktop always reaches models through the authenticated local facade. Provider
coordinates and credentials stay in the API container; the webview never receives
them. `local:up` maps the application's stable chat and design model IDs onto one
OpenAI-compatible model.

In LM Studio:

1. Download and load a model that supports OpenAI-style streaming, tool calls, and
   JSON output. To process scanned or image-only documents, use a multimodal model as
   well.
2. Start the local API server on port `1234` and allow connections from the local
   network. Docker reaches it through `host.docker.internal`, not through the
   container's own `localhost`.
3. Confirm the server and copy the exact model `id` from its response:

   ```sh
   curl http://127.0.0.1:1234/v1/models
   ```

Start avenOS with that identifier:

```sh
LOCAL_LLM_MODEL='replace-with-the-exact-lm-studio-model-id' bun run local:up
```

For another workstation or trusted-network provider, confirm `/v1/models`, copy the
exact model `id`, and supply an address reachable from Docker:

```sh
curl http://model-host:8000/v1/models
LOCAL_LLM_MODEL='replace-with-the-exact-model-id' \
LOCAL_LLM_BASE_URL='http://model-host:8000/v1' \
bun run local:up
```

If the loaded model accepts images and reliably returns structured JSON, advertise
that additional capability so document processing can select it:

```sh
LOCAL_LLM_MODEL='replace-with-the-exact-model-id' \
LOCAL_LLM_VISION=true \
bun run local:up
```

For a model server running on the same machine, omit `LOCAL_LLM_BASE_URL` to use
`http://host.docker.internal:1234/v1`. The local Compose override maps that name on
Linux and macOS.
Override it for another host-side port when necessary:

```sh
LOCAL_LLM_MODEL='local-model-id' \
LOCAL_LLM_BASE_URL='http://host.docker.internal:8000/v1' \
bun run local:up
```

`LOCAL_LLM_VISION=true` is a declaration used for capability selection; it cannot add
vision or structured output to a model that lacks them. Without it, chat and design
remain available, while model-backed document vision stays disabled. For multiple
models or authenticated endpoints, set the complete `LLM_GATEWAY_MODELS_JSON` and
`LLM_GATEWAY_CREDENTIALS_JSON` catalog described in
[Generic authenticated LLM gateway](../llm-gateway.md#configuration) instead of
`LOCAL_LLM_MODEL`.

## Create an account and customer environment

```sh
bun run local:account -- you@example.test
```

Open the printed setup URL, create the first passkey, and wait for the provisioner to
finish the customer environment. The command also creates a disposable local
entitlement; no checkout or external provider is involved in this developer shortcut.

To exercise the user-facing checkout and email flow instead, begin at
`http://localhost:13200` and inspect messages in Mailpit.

## Start the Rust client

On Linux:

```sh
bun run local:app -- linux
```

On macOS:

```sh
bun run local:app -- mac
```

The local desktop build intentionally uses device authorization instead of claiming a
deployed native passkey association. It opens the local identity dashboard, shows a
device code, and waits. Sign in with the `localhost` passkey and approve the code. The
Rust process receives the identity session, exchanges it for short-lived service
tokens, and selects the provisioned customer environment.

You can then import a document, inspect artifacts, chat through the local facade, and
exercise Intent and Actor features without deployed credentials.

## Add another passkey

Open `http://localhost:13100/dashboard`, authenticate, and use the passkey management
section to add another passkey. Sign out and sign back in with the new credential to
verify it independently.

## Reset the local system

This command removes the local containers, networks, and **all disposable local
volumes**:

```sh
bun run local:down
```

Use it when schema or provisioning state must start fresh. It does not touch another
Compose project, a deployed host, or any production data.

## Automated equivalent

Run the non-interactive proof on Linux:

```sh
bun run test:e2e:platform
```

The E2E run uses its own project name and dynamic ports, so it does not contend with
the interactive `aven-local` stack. See [Build and test](build-and-test.md) for its
coverage and release status.

## Common failures

- **Package authentication fails:** refresh the `read:packages` token and keep it in
  `NODE_AUTH_TOKEN` or the user-level `.npmrc`.
- **Rust client reports missing native packages:** repeat the Linux packages in
  [workstation setup](workstation-setup.md#linux).
- **Passkey enrollment fails:** use the printed `http://localhost` URL, not another
  hostname or IP address.
- **The customer route is not ready:** wait for the provisioner; inspect the platform
  containers with `docker compose` only when debugging the disposable local stack.
- **Ports are already in use:** stop the existing `aven-local` stack with
  `bun run local:down` before starting another interactive stack.
- **The local model is unavailable:** confirm `/v1/models` works on the host and
  `LOCAL_LLM_MODEL` exactly matches the returned model ID. If the provider runs on the
  same workstation, ensure LM Studio or the selected provider accepts local-network
  connections so Docker can reach it. `host.docker.internal` is configured by the
  local Compose override on Linux and macOS.
- **Chat works but tools or document processing fail:** use a model that implements
  OpenAI-compatible tool calls and JSON output. Document vision additionally requires
  `LOCAL_LLM_VISION=true` and a genuinely multimodal model.
