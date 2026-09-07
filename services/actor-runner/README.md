# Actor runner service (`os.aven`)

This service hosts the portable `os.aven:protocol:actors:plan-runner@2` contract on a
server and accepts version 1 exact-goal commands during rollout. Version 2 adds
exploratory and goal-then-enrich execution without granting effects. It is an
authenticated downstream of `api.aven.ceo`, never a route inside `aven.id` and never
an open proxy.

## Trust boundary

The public app sends its short-lived `aven-services` access token only to the
environment-scoped `/api/environments/{environmentId}/actor-runs` facade route. The
facade:

1. verifies the identity token and authorizes access to the selected customer environment;
2. removes caller `Authorization`, cookies, and every `x-aven-*` trust header;
3. derives the customer database and routing generation from trusted platform state;
4. signs a short-lived tenant grant restricted to the actor-run component and action; and
5. authenticates to this service with a fixed service bearer while forwarding the
   original signed identity token and tenant grant.

The runner independently verifies the identity token and tenant grant, including their
subject, session, and role agreement. A command is strict JSON and cannot contain
`security`, a principal, entitlements, grants, a tenant/database name, or a physical
storage route. The runner stamps `PlanRunSecurityContext` only after admission.

`IDENTITY_ISSUER` remains the token's immutable public issuer. Deployments may set
`IDENTITY_JWKS_URL` to an internal route for the same issuer's public keys; this changes
key retrieval, not issuer validation. `aven.id` therefore remains responsible only for
identity evidence. Product entitlements, actor admission, and tenant resolution remain
`ceo.aven` application concerns at the facade boundary.

## HTTP contract

The public facade projects its environment-scoped route to these private service paths:

```text
POST /api/actor-runs
GET  /api/actor-runs/{runId}
GET  /api/actor-runs/{runId}/events
POST /api/actor-runs/{runId}/continuations/{continuationId}
POST /api/actor-runs/{runId}/cancel
```

Unknown and other-user run IDs both return `404`. The events endpoint currently emits
one revision as SSE; it is not yet a live database subscription.

The continuation endpoint accepts one of two strict commands. Postponing keeps the
request visible without supplying a value:

```json
{"requestId":"...","continuationId":"...","action":"postpone"}
```

Submitting carries the typed value only for that executor invocation:

```json
{"requestId":"...","continuationId":"...","action":"submit","kind":"secret","value":"..."}
```

For `secret` continuations, the value is never copied into the run record, checkpoint,
failure message, or Artifact Store publication. A failed unlock must return another
open metadata request; persisting the password to make retries convenient is forbidden.

## Persistent backend and recovery

`SqlPlanRunner` stores every admitted run in the selected customer's PostgreSQL
database, under `aven_actor_runs.runs`. The database enforces subject-scoped
idempotency; a stored material hash prevents reuse of an idempotency key for a different
command. Status and cancellation operate on that durable record, with a revision check
protecting concurrent cancellation.

Execution starts only after admission commits. If the process stops in that gap, the
row remains `accepted`. Before serving an admitted request, the runner reclaims
accepted rows from that customer database. This lazy, per-customer recovery is enough
for the current side-effect-free executor and avoids giving the runner control-plane
database privileges.

`SqlPlanRunner` accepts a host-composed `PlanRunExecutor`. Its persistence E2E test
injects the generic executor core, plans a deterministic skill, dynamically admits and
invokes a server factory actor, and stores the completed steps, artifact IDs, registry
revision, and policy-decision IDs in the durable checkpoint. The same test executes the
fixture locally and compares canonical outputs and provenance.

With a PostgreSQL test URL, the split-architecture E2E test carries that same fixture
through a signed identity token, the public facade route, a scoped tenant grant, the
private runner HTTP route, `SqlPlanRunner`, and the injected generic executor. It reads
the terminal record back through the facade and compares the server artifacts and
provenance with the local executor result. The fixture shares one implementation across
the direct-SQL and authenticated-HTTP tests, so those paths cannot quietly drift into
different examples.

The deployed composition in `src/index.ts` has two explicit layers. Registered
application skills are selected by an application executor catalog. Its first entry is
`ceo.aven:skill:document-ingest@1`, which fetches the admitted source from the selected
tenant's Artifact Store, runs the headless document runtime, and publishes every
derived artifact with the runner's dedicated store identity. It discovers a
vision-and-structured-output model through the API facade's service-authenticated
internal LLM contract and uses the same model adapter and actor graph as the desktop.
`LLM_GATEWAY_BASE_URL` and `LLM_GATEWAY_BEARER_TOKEN` configure that private edge; the
bearer is distinct from the runner's ingress and Artifact Store identities. All other skills fall
through to the portable generic executor. That fallback has an empty registry and
fail-closed authorization, factory, and Artifact Store ports, so an unknown skill
cannot accidentally execute.

`SqlPlanRunner` requires the composed executor explicitly. Its protocol and repository
implement metadata-only continuation suspension, postponement, and resumption. They
must gain leases and fencing before workers execute non-idempotent effects; the current
recovery mechanism is deliberately not a distributed job queue.

## Local start

Copy `.env.example` into your development environment and configure the facade with the
same bearer token and component contract:

```json
{
  "segment": "actor-runs",
  "baseUrl": "http://127.0.0.1:3010",
  "targetPrefix": "/api/actor-runs",
  "bearerToken": "replace-with-the-same-32-byte-service-token",
  "componentRef": "os.aven:component:actors:run-repository@1",
  "readAction": "actor-runs:read",
  "writeAction": "actor-runs:write",
  "roles": ["user", "admin"]
}
```

Then run:

```sh
bun run --cwd services/actor-runner dev
bun run --cwd services/actor-runner check
bun run --cwd services/actor-runner test
```

The focused HTTP E2E suite uses real ephemeral identity, facade, and runner boundaries.
With `TEST_ACTOR_RUNNER_DATABASE_URL` set, the persistence suite additionally proves
both process-replacement recovery and generic deterministic execution against real
PostgreSQL. It exercises the generic executor both directly through `SqlPlanRunner` and
through the authenticated HTTP path. With `TEST_ARTIFACT_STORE_BASE_URL`,
`TEST_ARTIFACT_STORE_BEARER_TOKEN`, and `TEST_ARTIFACT_STORE_SCOPE_ID` also set, that
authenticated path resolves its source and publishes its output through the real store,
persists the returned artifact ID in the SQL checkpoint, reads the producer lineage
back, and compares the server result with local execution.

`tests/document-lane-conformance.test.ts` sends deterministic text, CSV, a real
repository PDF, a model-backed invoice image, and a model-backed statement case
through the production browser decoder and through the production headless document
executor. It compares the canonical presentation and the complete
publication graph: procedure keys, ordered inputs, parameters, payloads, blob hashes,
evidence, types, and stages. Generated IDs and physical placement metadata are the only
excluded fields. It also proves equivalent model requests, unavailable-model fallback,
hard-failure behavior, and absence of invented finance outputs. The fresh-stack
Playwright journey repeats the comparison for a text
fixture through the real Tauri client, facade, persistent runner, PostgreSQL, and Rust
Artifact Store.

`ArtifactStoreRuntimePort` is the concrete adapter for generic executor fixtures. It
resolves committed envelopes through `ArtifactStoreClient`, maps registered type
versions to canonical runtime schemas, and accepts a fact only when a trusted projector
derives the predicate from the validated payload. It never turns a caller-asserted
predicate into a fact by echoing it. For outputs, explicit capability-to-procedure and
schema-to-type bindings produce one atomic production-run publication with ordered
inputs and a deterministic UUID derived from the stable run-step identity.

`tests/artifact-store-port.test.ts` verifies the canonical HTTP request, bearer and
epoch headers, fact-projection rejection, production-run lineage, output mapping, and
stable publication identity. Its deterministic HTTP fake keeps malformed projection
and wire cases fast.

`tests/artifact-store-port.persistence.e2e.test.ts` runs the same adapter against the
real Rust service and PostgreSQL. It publishes a registered source artifact, resolves
its projected fact, commits a derived production run, reads its output and ordered
producer inputs back, and proves replay returns the same output ID. The full-stack E2E
harness starts a fixed-scope conformance store beside the tenant-mode application store
so this test runs in the release gate. The authenticated split-architecture test also
injects this port into `SqlPlanRunner`, proving both durable boundaries in one run. The
document application executor instead uses its own tenant-bound publisher because its
current DAG supports dynamic page fan-out and many-valued inputs that the narrow
generic executor does not yet model.

## Container build

The Docker build follows the split services' packaging convention. The project
`.npmrc` is excluded from the build context. A GitHub Packages token is mounted as
`--secret id=npm_token,env=NODE_AUTH_TOKEN`; the build creates a minimal temporary
registry config, performs the install, and removes the config in the same layer. The
credential is never sent in the build context or copied into an image layer.
