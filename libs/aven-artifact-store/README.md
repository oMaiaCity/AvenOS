# `@avenos/artifact-store`

Framework-neutral TypeScript client for the Aven Artifact Store. It provides an
independent `artifact-json-v1` parser/canonicalizer and a small HTTP client for the
current root vertical.

The parser must be used on raw UTF-8 before ordinary `JSON.parse`: it rejects duplicate
keys, fractional/exponent numbers, and integers outside the signed interoperable
53-bit range. The client canonicalizes publication submissions, supplies the store
epoch precondition, and keeps bearer acquisition outside durable command data.

```ts
import { ArtifactStoreClient } from "@avenos/artifact-store";

const artifacts = new ArtifactStoreClient({
	baseUrl: "http://127.0.0.1:8087",
	bearerToken: () => coordinatorToken,
});
```

The Tauri host or AvenOS coordinator should provide `bearerToken`; UI code must not
construct publisher identity or gain direct database access. In AvenOS tenant mode,
only the trusted server-side coordinator also supplies
`requestHeaders: () => ({ "x-aven-artifact-database": trustedDatabaseName })`; the
browser must never select it. Durable outbox and
projector helpers remain part of the next implementation slice.
