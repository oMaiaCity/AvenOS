# Intent Service

The Intent Service is the durable owner of conversation intents and their ordered
contributions. It is an independent domain service behind `api.aven.ceo`; it owns no
passkeys, checkout records, facade routes, or provider credentials.

Every request requires the private facade bearer token, the original signed `aven.id`
JWT, and a short-lived tenant grant. The service independently verifies both signatures
and binds the subject, role, session, customer environment, database, generation,
component, and action before deriving its customer-specific `int_api` credential.

Intent data only exists in that customer's database, under `aven_intents`. The service
has no cluster credential, cannot migrate schemas, and cannot access another component's
tables. The platform provisioner is the sole owner of installation and role grants.

Conversation-created intents preserve the app's existing lifecycle and response
contract. Artifact and File-skill fields are returned as empty projections until the
standalone Artifact Store integration publishes them through an explicit service API;
the Intent Service does not poll or embed an Artifact Processor.

```sh
bun run --cwd services/intent-service check
bun run --cwd services/intent-service test
bun run --cwd services/intent-service build
```

`bun run test:e2e:platform` performs the database-backed contract check through
the real `api.aven.ceo` facade. It covers idempotent ordered contributions,
stale-version conflicts, update, archive/restore, merge, tombstone, and direct
service authentication failure. The contribution fixture is produced by
in-memory PCM running through the voice VAD, recognizer, speaker embedder, and
semantic state machine, so anonymous speaker persistence is verified without
opening host audio devices.
